// Existing-profile merge. All mutations share one guarded D1 transaction;
// legacy opening totals remain intact, only identified duplicate events subtract.
import { json, activeAccountSession, activeEmployee } from '../auth/_lib.js';
import { storeOwner } from './_private.js';

export async function mayMergeClients(request, env, merchant) {
  const session = await activeAccountSession(request, env);
  if (session && session.aid === await storeOwner(env, merchant)) return true;
  const employee = await activeEmployee(request, env, merchant);
  const member = employee && employee.member;
  const role = String(member && (member.function || member.role || member.title) || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  return ['owner', 'manager', 'proprietaire', 'gerant', 'responsable'].includes(role);
}
const list = value => { try { const a = JSON.parse(value || '[]'); return Array.isArray(a) ? a : []; } catch (_) { return []; } };
export const purchaseKey = event => (/^purchase:[^:]+:(.+)$/.exec(event.ref) || [])[1] || event.sale_ref || event.ref;
// The purchase ref carries the sale id; sale_ref can be a shared receipt label.
export const purchaseKeySql = `CASE WHEN substr(ref, 1, 9) = 'purchase:' AND instr(substr(ref, 10), ':') > 0
  THEN substr(ref, 10 + instr(substr(ref, 10), ':')) ELSE CASE WHEN sale_ref <> '' THEN sale_ref ELSE ref END END`;
export async function mergeClients(env, merchant, raw, helpers) {
  const from = String(raw && raw.from || ''), to = String(raw && raw.to || '');
  if (!from || !to || from === to || from.length > 64 || to.length > 64) return json({ error: 'invalid-merge' }, 400);
  const { prepare, cursorStatements, cursorSql, ensure } = helpers;
  await ensure();
  for (let attempt = 0; attempt < 5; attempt++) {
    const rows = await env.DB.prepare('SELECT * FROM clients WHERE merchant = ? AND id IN (?, ?)').bind(merchant, from, to).all();
    const source = rows.results.find(r => r.id === from), target = rows.results.find(r => r.id === to);
    if (!source || !target) return json({ error: 'client-not-found' }, 404);
    if (source.deleted && source.source.startsWith('merged:') &&
        source.source === (target.deleted ? target.source : 'merged:' + to)) {
      return json({ ok: true, mergedInto: source.source.slice(7), replayed: true });
    }
    if (source.deleted || target.deleted) return json({ error: 'merge-conflict' }, 409);
    const events = await env.DB.prepare('SELECT * FROM client_purchase_events WHERE merchant = ? AND client_id IN (?, ?) ORDER BY created_ts, ref').bind(merchant, from, to).all();
    const groups = new Map(), duplicates = [], subtract = { amount: 0, points: 0, stamps: 0, visits: 0 };
    const employeeTable = await prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'employee_loyalty_events'").first();
    if (employeeTable) {
      const employeeEvents = await prepare("SELECT ref FROM employee_loyalty_events WHERE merchant = ? AND client_id IN (?, ?) AND ref LIKE 'employee-sale:%'")
        .bind(merchant, from, to).all();
      // Employee events retain their original amounts for sale void/restore.
      // When both channels captured a sale, the till event becomes the duplicate.
      for (const event of employeeEvents.results) groups.set(event.ref.slice(14), event);
    }
    for (const event of events.results) {
      if (event.ref.startsWith('refund:') || !event.visits) continue;
      const key = purchaseKey(event), first = groups.get(key);
      if (!first) { groups.set(key, event); continue; }
      // A sale may have been recorded under two device refs. Keep the first
      // event as the canonical purchase; retain the other ref and its original payload for retries.
      duplicates.push(event.ref);
      for (const field of Object.keys(subtract)) subtract[field] += Number(event[field] || 0);
    }
    const set = {};
    for (const key of ['name','phone','email','birthday','gender','city','address']) set[key] = target[key] || source[key];
    // Preserve both profiles without dropping notes or tags.
    set.notes = [target.notes, source.notes].filter(Boolean).join('\n');
    if (Object.hasOwn(target, 'tags')) set.tags = JSON.stringify([...new Set([...list(target.tags), ...list(source.tags)])]);
    const parse = value => { try { return JSON.parse(value || '{}'); } catch (_) { return {}; } };
    const hospitality = parse(target.hospitality);
    for (const [key, value] of Object.entries(parse(source.hospitality))) if (!hospitality[key]) hospitality[key] = value;
    set.hospitality = JSON.stringify(hospitality);
    for (const key of ['points','stamps','visits','spend']) set[key] = Math.max(0, Number(target[key]) + Number(source[key]) - subtract[key === 'spend' ? 'amount' : key]);
    set.spend = Math.round(set.spend * 100) / 100;
    set.first_seen = Math.min(...[source.first_seen, target.first_seen].filter(n => n > 0)) || 0;
    if (!Number.isFinite(set.first_seen)) set.first_seen = 0;
    set.last_seen = Math.max(source.last_seen, target.last_seen);
    // Consent is never inferred from a duplicate's opt-in.
    const now = Date.now(), cursor = cursorSql();
    const guard = `EXISTS (SELECT 1 FROM clients WHERE merchant = ? AND id = ? AND deleted = 1 AND source = ? AND srv_ts = ${cursor})`;
    const guardArgs = [merchant, from, 'merged:' + to, merchant];
    const columns = Object.keys(set);
    const statements = [
      ...cursorStatements(env, merchant, now),
      prepare(`UPDATE clients SET deleted = 1, source = ?, updated_ts = ?, srv_ts = ${cursor}
        WHERE merchant = ? AND id = ? AND deleted = 0 AND srv_ts = ?
          AND EXISTS (SELECT 1 FROM clients WHERE merchant = ? AND id = ? AND deleted = 0 AND srv_ts = ?)`)
        .bind('merged:' + to, now, merchant, merchant, from, source.srv_ts, merchant, to, target.srv_ts),
      prepare(`UPDATE clients SET ${columns.map(k => k + ' = ?').join(', ')}, updated_ts = ?, srv_ts = ${cursor}
        WHERE merchant = ? AND id = ? AND ${guard}`)
        .bind(...columns.map(k => set[k]), now, merchant, merchant, to, ...guardArgs),
    ];
    if (duplicates.length) statements.push(prepare(`UPDATE client_purchase_events SET visits = 0 WHERE merchant = ? AND ref IN (SELECT value FROM json_each(?)) AND ${guard}`).bind(merchant, JSON.stringify(duplicates), ...guardArgs));
    for (const table of ['client_purchase_events','client_reward_events','employee_loyalty_events','client_reward_refusals']) {
      const exists = await prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?").bind(table).first();
      if (exists) {
        const sync = ['client_purchase_events','client_reward_events'].includes(table);
        statements.push(prepare(`UPDATE ${table} SET client_id = ?${sync ? ', srv_ts = ' + cursor : ''} WHERE merchant = ? AND client_id IN (?, ?) AND ${guard}`)
          .bind(to, ...(sync ? [merchant] : []), merchant, from, to, ...guardArgs));
      }
    }
    // Keep all credit codes, expiry dates and monetary entries. Reassigning
    // instruments combines the customer's ledger without minting a balance.
    const credits = await prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'store_credits'").first();
    if (credits) {
      statements.push(prepare(`INSERT INTO store_credit_events (id, merchant, credit_id, code, action, amount_cents, balance_after_cents, ref_id, actor, detail, ts)
        SELECT 'client-merge:' || ? || ':' || id || ':' || ?, merchant, id, code, 'client-merge', 0, balance_cents, ?, 'client-merge', ?, ?
        FROM store_credits WHERE merchant = ? AND customer_id = ? AND ${guard}`)
        .bind(from, to, from, JSON.stringify({ from, to }), now, merchant, from, ...guardArgs));
      statements.push(prepare(`UPDATE store_credits SET customer_id = ?, customer_name = ?, updated_ts = ? WHERE merchant = ? AND customer_id = ? AND ${guard}`)
        .bind(to, set.name, now, merchant, from, ...guardArgs));
    }
    // Flatten prior aliases so old tills need only one lookup, indefinitely.
    statements.push(prepare(`UPDATE clients SET source = ?, updated_ts = ?, srv_ts = ${cursor} WHERE merchant = ? AND deleted = 1 AND source = ? AND ${guard}`)
      .bind('merged:' + to, now, merchant, merchant, 'merged:' + from, ...guardArgs));
    // A page can end between the survivor and any of its aliases. Give every
    // row its own cursor so `since > cursor` cannot skip the other half.
    statements.push(prepare(`UPDATE client_sync_sequences SET last_ts = last_ts +
        (SELECT COUNT(*) FROM clients WHERE merchant = ? AND (id = ? OR (deleted = 1 AND source = ?)))
      WHERE merchant = ? AND ${guard}`).bind(merchant, to, 'merged:' + to, merchant, ...guardArgs));
    statements.push(prepare(`WITH gate AS MATERIALIZED (SELECT 1 WHERE changes() > 0), numbered AS (
        SELECT id, ROW_NUMBER() OVER (ORDER BY id) AS n, COUNT(*) OVER () AS total
        FROM clients WHERE merchant = ? AND (id = ? OR (deleted = 1 AND source = ?))
      ) UPDATE clients SET srv_ts = (SELECT last_ts FROM client_sync_sequences WHERE merchant = ?) +
        (SELECT n - total FROM numbered WHERE numbered.id = clients.id)
      WHERE merchant = ? AND id IN (SELECT id FROM numbered) AND EXISTS (SELECT 1 FROM gate)`)
      .bind(merchant, to, 'merged:' + to, merchant, merchant));
    const result = await env.DB.batch(statements);
    if (result[2].meta.changes) return json({ ok: true, mergedInto: to });
  }
  return json({ error: 'merge-conflict' }, 409);
}
