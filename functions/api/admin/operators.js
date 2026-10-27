// /api/admin/operators — manage operator access codes. Named-operator gated.
// The first code is seeded offline (docs/ops/ADMIN.md): the shared team
// passcode no longer opens the console (functions/auth/_lib.js › isOperator),
// so an in-console bootstrap could never be reached and is gone.
//
//   GET                 → { operators: [{id,label,created_ts}] }   (never a hash)
//   POST {label, code}   → add (code hashed PBKDF2, plaintext never stored)
//   DELETE ?id (or {id}) → remove one
//
// Codes are what the hidden long-press prompt on the login screen accepts.

import { PASSWORD_MAX, isOperator, isSeniorOperator, hashPassword, json, operatorActor } from '../../auth/_lib.js';

/* Créer ou retirer un code opérateur ouvre ou ferme la console qui voit TOUS les
 * commerçants : le geste est journalisé dans le même batch que l'écriture, au
 * nom de l'opérateur qui le fait, avec le libellé et l'id du code, jamais le
 * code ni son empreinte. */
const AUDIT_INSERT = `INSERT INTO account_audit (account_id, merchant, action, prev, next, reason, actor, actor_id, detail, ts)`;

async function guard(context) {
  const ok = await isOperator(context.request, context.env);
  if (!ok) return json({ error: 'forbidden' }, 403);
  if (!context.env.DB) return json({ error: 'no-db' }, 503);
  return null;
}

async function mutationGuard(context) {
  const bad = await guard(context); if (bad) return bad;
  if (await isSeniorOperator(context.request, context.env)) return null;
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
  // Every change must be signed by a live named code.
  const bad = await mutationGuard(context); if (bad) return bad;
  let body;
  try { body = await context.request.json(); } catch (_) { return json({ error: 'bad-json' }, 400); }
  const label = (body.label || '').toString().trim().slice(0, 40);
  const code = (body.code || '').toString().trim();
  // 4 caractères, c'était ~10 000 combinaisons pour la console qui voit TOUS
  // les commerçants — quelques minutes de script. Le plafond d'essais
  // (limitCheck, scope 'op') rend le grinding coûteux ; ce plancher le rend
  // inutile. Les codes déjà émis restent valides : ils sont à renouveler.
  if (code.length < 10) return json({ error: 'code-too-short' }, 400);
  if (code.length > PASSWORD_MAX) return json({ error: 'code-too-long' }, 400);
  const { salt, hash } = await hashPassword(code);
  const id = 'op-' + crypto.randomUUID();
  const actor = await operatorActor(context.request, context.env), ts = Date.now();
  try {
    await context.env.DB.batch([
      context.env.DB.prepare(
        `INSERT INTO operators (id, label, salt, hash, created_ts) VALUES (?,?,?,?,?)`
      ).bind(id, label, salt, hash, ts),
      context.env.DB.prepare(`${AUDIT_INSERT} VALUES ('', '', 'operator-create', '', ?, '', ?, ?, ?, ?)`)
        .bind(label, actor.label, actor.id, JSON.stringify({ id }), ts),
    ]);
  } catch (_) { return json({ error: 'operator-storage-unavailable' }, 503); }
  return json({ ok: true, operator: { id, label, created_ts: ts } });
}

export async function onRequestDelete(context) {
  const bad = await mutationGuard(context); if (bad) return bad;
  const url = new URL(context.request.url);
  let id = (url.searchParams.get('id') || '').trim();
  if (!id) { try { id = ((await context.request.json()).id || '').toString().trim(); } catch (_) {} }
  if (!id) return json({ error: 'id-required' }, 400);
  /* Le dernier code ne part pas : sans lui, plus personne n'entre dans la
   * console, et le seul retour passe par un INSERT à la main dans D1. La garde
   * est DANS la suppression, pour que deux retraits simultanés ne vident pas la
   * table à eux deux ; le relevé lit la ligne avant qu'elle disparaisse. */
  const actor = await operatorActor(context.request, context.env), ts = Date.now();
  let removed = 0;
  try {
    const results = await context.env.DB.batch([
      context.env.DB.prepare(`${AUDIT_INSERT}
        SELECT '', '', 'operator-delete', label, '', '', ?, ?, json_object('id', id), ?
          FROM operators WHERE id = ? AND (SELECT COUNT(*) FROM operators) > 1`).bind(actor.label, actor.id, ts, id),
      context.env.DB.prepare(`DELETE FROM operators WHERE id = ? AND (SELECT COUNT(*) FROM operators) > 1`).bind(id),
    ]);
    removed = Number(results && results[1] && results[1].meta && results[1].meta.changes) || 0;
    if (!removed) {
      const still = await context.env.DB.prepare('SELECT 1 AS n FROM operators WHERE id = ?').bind(id).first();
      if (still) return json({ error: 'last-operator' }, 409);
    }
  } catch (_) { return json({ error: 'operator-storage-unavailable' }, 503); }
  return json({ ok: true });
}
