// /api/admin/operators — manage operator access codes. Operator-or-staff gated
// (the staff bypass bootstraps the first code without any manual hashing).
//
//   GET                 → { operators: [{id,label,created_ts}] }   (never a hash)
//   POST {label, code}   → add (code hashed PBKDF2, plaintext never stored)
//   DELETE ?id (or {id}) → remove one
//
// Codes are what the hidden long-press prompt on the login screen accepts.

import { isOperator, isSeniorOperator, hashPassword, json } from '../../auth/_lib.js';

async function guard(context) {
  const ok = await isOperator(context.request, context.env);
  if (!ok) return json({ error: 'forbidden' }, 403);
  if (!context.env.DB) return json({ error: 'no-db' }, 503);
  return null;
}

async function mutationGuard(context, allowBootstrap) {
  const bad = await guard(context); if (bad) return bad;
  if (await isSeniorOperator(context.request, context.env)) return null;
  if (allowBootstrap) {
    try {
      const row = await context.env.DB.prepare('SELECT COUNT(*) AS n FROM operators').first();
      if (row && Number(row.n) === 0) return null;
    } catch (_) { /* fail closed below */ }
  }
  return json({ error: 'operator-code-required' }, 403);
}

export async function onRequestGet(context) {
  const bad = await guard(context); if (bad) return bad;
  const rows = await context.env.DB.prepare(
    `SELECT id, label, created_ts FROM operators ORDER BY created_ts`
  ).all();
  return json({ operators: rows.results || [] });
}

export async function onRequestPost(context) {
  // The shared team passcode may create only the very first named operator.
  // Once one exists, every further change must be signed by a live named code.
  const bad = await mutationGuard(context, true); if (bad) return bad;
  let body;
  try { body = await context.request.json(); } catch (_) { return json({ error: 'bad-json' }, 400); }
  const label = (body.label || '').toString().trim().slice(0, 40);
  const code = (body.code || '').toString().trim();
  // 4 caractères, c'était ~10 000 combinaisons pour la console qui voit TOUS
  // les commerçants — quelques minutes de script. Le plafond d'essais
  // (limitCheck, scope 'op') rend le grinding coûteux ; ce plancher le rend
  // inutile. Les codes déjà émis restent valides : ils sont à renouveler.
  if (code.length < 10) return json({ error: 'code-too-short' }, 400);
  const { salt, hash } = await hashPassword(code);
  const id = 'op-' + crypto.randomUUID();
  await context.env.DB.prepare(
    `INSERT INTO operators (id, label, salt, hash, created_ts) VALUES (?,?,?,?,?)`
  ).bind(id, label, salt, hash, Date.now()).run();
  return json({ ok: true, operator: { id, label, created_ts: Date.now() } });
}

export async function onRequestDelete(context) {
  const bad = await mutationGuard(context, false); if (bad) return bad;
  const url = new URL(context.request.url);
  let id = (url.searchParams.get('id') || '').trim();
  if (!id) { try { id = ((await context.request.json()).id || '').toString().trim(); } catch (_) {} }
  if (!id) return json({ error: 'id-required' }, 400);
  await context.env.DB.prepare(`DELETE FROM operators WHERE id = ?`).bind(id).run();
  return json({ ok: true });
}
