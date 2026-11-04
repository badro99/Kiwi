import { namedOperatorId, json, limitCheck, limitFail } from '../../../auth/_lib.js';
import { planEmployeeAuth } from '../../_employee-auth.js';
import { rotateStaffRow, needsStaffRecovery, codeDocument } from '../../../auth/_staff-codes.js';

// Cursor batches keep one request bounded. CAS prevents overwriting concurrent edits.
export async function onRequestPost({ request, env }) {
  const operator = await namedOperatorId(request, env);
  if (!operator) return json({ error: 'forbidden' }, 403);
  const limited = await limitCheck(request, env, 'codes-seal', operator);
  if (limited) return limited;
  let body;
  try { body = await request.json(); } catch (_) { return json({ error: 'bad-json' }, 400); }
  const cursor = body?.cursor || {};
  const pinAfter = String(cursor.pin || ''), docAfter = Number(cursor.doc || 0), historyAfter = Number(cursor.history || 0);
  if (![docAfter, historyAfter].every((v) => Number.isSafeInteger(v) && v >= 0)) return json({ error: 'bad-cursor' }, 400);
  const recoveryAfter = Number(cursor.recovery || 0);
  if (!Number.isSafeInteger(recoveryAfter) || recoveryAfter < 0 || recoveryAfter >= 10000) return json({ error: 'bad-cursor' }, 400);
  const counts = { auth: 0, unresolved: Number(cursor.unresolved || 0), pins: 0, documents: 0, history: 0, skipped: 0, legacyCodeIds: 0 };
  try {
    const pins = (await env.DB.prepare('SELECT id, merchant, pin FROM staff_pins WHERE id > ? ORDER BY id LIMIT 50').bind(pinAfter).all()).results || [];
    const statements = [];
    let recovered = false, lastPin = pinAfter, recoveryNext = 0;
    for (const row of pins) {
      try {
        const recovery = await needsStaffRecovery(env, row.pin);
        if (recovery && recovered) break;
        recovered ||= recovery;
        const start = recovery ? recoveryAfter : 0;
        const value = await rotateStaffRow(env, row, start);
        if (value === null) { recoveryNext = start + 250; break; }
        lastPin = row.id;
        if (value !== row.pin) statements.push(env.DB.prepare('UPDATE staff_pins SET pin = ? WHERE id = ? AND pin = ?').bind(value, row.id, row.pin));
      } catch (_) { lastPin = row.id; counts.skipped++; }
    }
    if (statements.length) counts.pins = (await env.DB.batch(statements)).reduce((n, r) => n + Number(r.meta?.changes || 0), 0);
    const next = { pin: lastPin, recovery: recoveryNext };
    let done = !recoveryNext && pins.length < 50 && lastPin === (pins.at(-1)?.id || pinAfter);
    for (const [table, field, count] of [['store_docs', 'doc', 'documents'], ['doc_history', 'history', 'history']]) {
      const after = field === 'doc' ? docAfter : historyAfter;
      const rows = (await env.DB.prepare(`SELECT rowid AS seal_id, merchant, feature, data FROM ${table} WHERE rowid > ? AND feature IN ('team', 'employee-access') ORDER BY rowid LIMIT 50`).bind(after).all()).results || [];
      const batch = [];
      for (const row of rows) {
        try {
          const doc = JSON.parse(row.data);
          counts.legacyCodeIds += (Array.isArray(doc?.members) ? doc.members : []).filter((m) => /^employee-\d{4}$/.test(m?.id)).length;
          const sealed = await codeDocument(env, row.merchant, row.feature, doc, true);
          counts.skipped += (sealed?.members || []).filter((m) => m?.codeUnreadable).length;
          const text = JSON.stringify(sealed);
          if (text !== row.data) batch.push(env.DB.prepare(`UPDATE ${table} SET data = ? WHERE rowid = ? AND data = ?`).bind(text, row.seal_id, row.data));
        } catch (_) { counts.skipped++; }
      }
      if (batch.length) counts[count] = (await env.DB.batch(batch)).reduce((n, r) => n + Number(r.meta?.changes || 0), 0);
      next[field] = rows.at(-1)?.seal_id || after;
      done = done && rows.length < 50;
    }
    // Durable revisions are separate from documents; never change auth_version here.
    const authAfter = Number(cursor.auth || 0);
    if (!Number.isSafeInteger(authAfter) || authAfter < 0 || !Number.isSafeInteger(counts.unresolved) || counts.unresolved < 0) return json({ error: 'bad-cursor' }, 400);
    const authRows = (await env.DB.prepare('SELECT rowid AS seal_id, merchant, member_id, pin_digest FROM employee_auth_versions WHERE rowid > ? ORDER BY rowid LIMIT 50').bind(authAfter).all()).results || [];
    for (const row of authRows) {
      let resolved = false;
      const docs = (await env.DB.prepare("SELECT feature, data FROM store_docs WHERE merchant = ? AND feature IN ('team','employee-access') ORDER BY feature").bind(row.merchant).all()).results || [];
      for (const doc of docs) {
        try {
          const clear = await codeDocument(env, row.merchant, doc.feature, JSON.parse(doc.data), false, row.member_id);
          const member = clear?.members?.find((m) => String(m?.id) === row.member_id);
          const code = String(member?.pinCode || member?.password || '').trim();
          if (!/^\d{4}$/.test(code) || member.codeUnreadable) continue;
          const plan = await planEmployeeAuth(env, row.merchant, row.member_id, code);
          const live = await env.DB.prepare('SELECT auth_version FROM employee_auth_versions WHERE merchant = ? AND member_id = ?').bind(row.merchant, row.member_id).first();
          if (!plan.ok || plan.version !== live?.auth_version) continue;
          if (plan.digest === row.pin_digest) { resolved = true; break; }
          const result = await env.DB.prepare('UPDATE employee_auth_versions SET pin_digest = ? WHERE merchant = ? AND member_id = ? AND pin_digest = ?').bind(plan.digest, row.merchant, row.member_id, row.pin_digest).run();
          counts.auth += Number(result.meta?.changes || 0);
          resolved = Number(result.meta?.changes || 0) > 0;
          if (resolved) break;
        } catch (_) { /* Try the other private document before declaring unresolved. */ }
      }
      if (!resolved) counts.unresolved++;
    }
    next.auth = authRows.at(-1)?.seal_id || authAfter;
    done = done && authRows.length < 50;
    counts.unresolved += counts.skipped;
    next.unresolved = counts.unresolved;
    const complete = done;
    done = complete && counts.unresolved === 0;
    return json({ ok: true, counts, done, cursor: complete ? null : next });
  } catch (_) {
    await limitFail(request, env, 'codes-seal', operator);
    return json({ error: 'seal-unavailable' }, 503);
  }
}
