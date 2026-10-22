// /api/admin/pins — staff PIN management per merchant. Operator-gated.
//
//   GET    ?merchant=slug            → { pins: [{id,pin,name,role}] }
//   POST   {merchant,pin,name,role}  → add (4-digit, unique per merchant)
//   DELETE ?id=pin-…  (or {id})      → remove one
//
// PINs are role selectors the caisse/serveur pad resolves — not secrets. A
// merchant with no rows here ⇒ the app keeps its hardcoded defaults.

import { isOperator, isSeniorOperator, json, operatorActor } from '../../auth/_lib.js';

/* Le journal d'un geste sur un code d'équipe. Il nomme l'opérateur (session
 * opérateur, jamais un code), l'établissement, le geste et l'heure ; il ne porte
 * JAMAIS le code lui-même : `next` reçoit le nom de la personne, `detail` l'id
 * de la ligne et le rôle. Le relevé part dans le MÊME batch D1 que l'écriture :
 * un code créé sans trace, ou une trace sans code, n'existe pas. */
const AUDIT_INSERT = `INSERT INTO account_audit (account_id, merchant, action, prev, next, reason, actor, actor_id, detail, ts)`;

const VALID_PIN = /^\d{4}$/;

async function guard(context, senior) {
  const ok = await isOperator(context.request, context.env);
  if (!ok) return json({ error: 'forbidden' }, 403);
  if (!context.env.DB) return json({ error: 'no-db' }, 503);
  if (senior && !(await isSeniorOperator(context.request, context.env))) {
    return json({ error: 'operator-code-required' }, 403);
  }
  return null;
}

export async function onRequestGet(context) {
  const bad = await guard(context, false); if (bad) return bad;
  const url = new URL(context.request.url);
  const merchant = (url.searchParams.get('merchant') || '').trim();
  if (!merchant) return json({ error: 'merchant-required' }, 400);
  const rows = await context.env.DB.prepare(
    `SELECT id, pin, name, role FROM staff_pins WHERE merchant = ? ORDER BY created_ts`
  ).bind(merchant).all();
  return json({ pins: rows.results || [] });
}

export async function onRequestPost(context) {
  const bad = await guard(context, true); if (bad) return bad;
  let body;
  try { body = await context.request.json(); } catch (_) { return json({ error: 'bad-json' }, 400); }
  const merchant = (body.merchant || '').toString().trim();
  const pin = (body.pin || '').toString().trim();
  const name = (body.name || '').toString().trim().slice(0, 60);
  const role = (body.role || '').toString().trim().slice(0, 24) || 'serveur';
  if (!merchant) return json({ error: 'merchant-required' }, 400);
  if (!VALID_PIN.test(pin)) return json({ error: 'bad-pin' }, 400);

  const dupe = await context.env.DB.prepare(
    `SELECT id FROM staff_pins WHERE merchant = ? AND pin = ?`
  ).bind(merchant, pin).first();
  if (dupe) return json({ error: 'pin-exists' }, 409);

  const id = 'pin-' + crypto.randomUUID();
  const actor = await operatorActor(context.request, context.env), ts = Date.now();
  try {
    await context.env.DB.batch([
      context.env.DB.prepare(
        `INSERT INTO staff_pins (id, merchant, pin, name, role, created_ts) VALUES (?,?,?,?,?,?)`
      ).bind(id, merchant, pin, name, role, ts),
      context.env.DB.prepare(`${AUDIT_INSERT} VALUES ('', ?, 'staff-pin-create', '', ?, '', ?, ?, ?, ?)`)
        .bind(merchant, name, actor.label, actor.id, JSON.stringify({ id, role }), ts),
    ]);
  } catch (_) { return json({ error: 'pin-storage-unavailable' }, 503); }
  return json({ ok: true, pin: { id, pin, name, role } });
}

export async function onRequestDelete(context) {
  const bad = await guard(context, true); if (bad) return bad;
  const url = new URL(context.request.url);
  let id = (url.searchParams.get('id') || '').trim();
  if (!id) { try { id = ((await context.request.json()).id || '').toString().trim(); } catch (_) {} }
  if (!id) return json({ error: 'id-required' }, 400);
  /* Le relevé est lu dans la ligne AVANT qu'elle disparaisse (même batch) : un id
     inconnu n'écrit rien, ni suppression ni trace. */
  const actor = await operatorActor(context.request, context.env), ts = Date.now();
  try {
    await context.env.DB.batch([
      context.env.DB.prepare(`${AUDIT_INSERT}
        SELECT '', merchant, 'staff-pin-delete', name, '', '', ?, ?, json_object('id', id, 'role', role), ?
          FROM staff_pins WHERE id = ?`).bind(actor.label, actor.id, ts, id),
      context.env.DB.prepare(`DELETE FROM staff_pins WHERE id = ?`).bind(id),
    ]);
  } catch (_) { return json({ error: 'pin-storage-unavailable' }, 503); }
  return json({ ok: true });
}
