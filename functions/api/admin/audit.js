// /api/admin/audit — le journal des modules d'un établissement (opérateur seul).
//
//   GET ?merchant=slug[&limit=60]  → { entries: [{ feature, enabled, actor, ts }] }
//
// À quoi ça sert : `merchant_config.features` ne garde que le DERNIER état. « Les
// réservations sont coupées » ne dit ni depuis quand, ni par qui, ni si elles ont
// déjà servi. Quand un client rappelle trois mois plus tard, c'est la seule
// question qui compte, et c'est ce que cette table répond.
//
// Écrit par functions/api/admin/config.js à chaque changement réel (une ligne par
// module changé). Rien n'est jamais supprimé ici, et couper un module n'efface
// aucune donnée métier : le catalogue, les réservations et les fiches restent
// dans leurs tables et reviennent telles quelles à la réactivation.
//
// Fail-soft comme le reste de la console : table absente ⇒ liste vide, le panneau
// affiche « aucun changement enregistré » au lieu de casser.

import { isOperator, json } from '../../auth/_lib.js';

export async function onRequestGet(context) {
  const ok = await isOperator(context.request, context.env);
  if (!ok) return json({ error: 'forbidden' }, 403);
  if (!context.env.DB) return json({ error: 'no-db' }, 503);

  const url = new URL(context.request.url);
  const merchant = (url.searchParams.get('merchant') || '').trim();
  if (!merchant) return json({ error: 'merchant-required' }, 400);
  const limit = Math.min(200, Math.max(1, parseInt(url.searchParams.get('limit') || '60', 10) || 60));

  try {
    const rows = await context.env.DB.prepare(
      `SELECT feature, enabled, actor, ts FROM config_audit
        WHERE merchant = ? ORDER BY ts DESC, id DESC LIMIT ?`
    ).bind(merchant, limit).all();
    return json({ entries: rows.results || [] });
  } catch (_) {
    return json({ entries: [] });
  }
}
