import { namedOperatorId, json, limitCheck, limitFail } from '../../../auth/_lib.js';
import { rotateStaffRow, needsStaffRecovery, codeDocument } from '../../../auth/_staff-codes.js';

// Cursor batches keep one request bounded. CAS prevents overwriting concurrent edits.
export async function onRequestPost({ request, env }) {
  const operator = await namedOperatorId(request, env);
  if (!operator) return json({ error: 'forbidden' }, 403);
  const limited = await limitCheck(request, env, 'codes-seal', operator);
  if (limited) return limited;
  if (!await limitFail(request, env, 'codes-seal', operator)) return json({ error: 'rate-limit-unavailable' }, 503);
  let body;
  try { body = await request.json(); } catch (_) { return json({ error: 'bad-json' }, 400); }
  const cursor = body?.cursor || {};
  const pinAfter = String(cursor.pin || ''), docAfter = Number(cursor.doc || 0), historyAfter = Number(cursor.history || 0);
  if (![docAfter, historyAfter].every((v) => Number.isSafeInteger(v) && v >= 0)) return json({ error: 'bad-cursor' }, 400);
  const counts = { pins: 0, documents: 0, history: 0, skipped: 0, legacyCodeIds: 0 };
  try {
    const pins = (await env.DB.prepare('SELECT id, merchant, pin FROM staff_pins WHERE id > ? ORDER BY id LIMIT 50').bind(pinAfter).all()).results || [];
    const statements = [];
    let recovered = false, lastPin = pinAfter;
    for (const row of pins) {
      try {
        const recovery = await needsStaffRecovery(env, row.pin);
        if (recovery && recovered) break;
        recovered ||= recovery; lastPin = row.id;
        const value = await rotateStaffRow(env, row);
        if (value !== row.pin) statements.push(env.DB.prepare('UPDATE staff_pins SET pin = ? WHERE id = ? AND pin = ?').bind(value, row.id, row.pin));
      } catch (_) { lastPin = row.id; counts.skipped++; }
    }
    if (statements.length) counts.pins = (await env.DB.batch(statements)).reduce((n, r) => n + Number(r.meta?.changes || 0), 0);
    const next = { pin: lastPin };
    let done = pins.length < 50 && lastPin === (pins.at(-1)?.id || pinAfter);
    for (const [table, field, count] of [['store_docs', 'doc', 'documents'], ['doc_history', 'history', 'history']]) {
      const after = field === 'doc' ? docAfter : historyAfter;
      const rows = (await env.DB.prepare(`SELECT rowid AS seal_id, merchant, feature, data FROM ${table} WHERE rowid > ? AND feature IN ('team', 'employee-access') ORDER BY rowid LIMIT 50`).bind(after).all()).results || [];
      const batch = [];
      for (const row of rows) {
        try {
          const doc = JSON.parse(row.data);
          counts.legacyCodeIds += (Array.isArray(doc?.members) ? doc.members : []).filter((m) => /^employee-\d{4}$/.test(m?.id)).length;
          const text = JSON.stringify(await codeDocument(env, row.merchant, row.feature, doc, true));
          if (text !== row.data) batch.push(env.DB.prepare(`UPDATE ${table} SET data = ? WHERE rowid = ? AND data = ?`).bind(text, row.seal_id, row.data));
        } catch (_) { counts.skipped++; }
      }
      if (batch.length) counts[count] = (await env.DB.batch(batch)).reduce((n, r) => n + Number(r.meta?.changes || 0), 0);
      next[field] = rows.at(-1)?.seal_id || after;
      done = done && rows.length < 50;
    }
    return json({ ok: true, counts, done, cursor: done ? null : next });
  } catch (_) { return json({ error: 'seal-unavailable' }, 503); }
}
