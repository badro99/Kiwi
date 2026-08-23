// POST /api/pair/revoke — « dépairer toutes les caisses de cette boutique ».
//
// Le jeton de caisse était une fonction pure du slug : la même valeur pour tous
// les appareils du commerçant, sans expiration, et rien ne pouvait l'annuler.
// Un téléphone d'employé parti, une tablette revendue, un profil oublié gardaient
// un accès complet — et la seule coupure disponible, la rotation d'AUTH_SECRET,
// aurait déconnecté TOUS les commerçants à la fois.
//
// Le jeton porte désormais un millésime par commerçant. Ce point d'entrée
// l'incrémente : toutes les caisses de CETTE boutique, et elles seules, doivent
// réappairer. Un geste franc, pas un réglage — on ne prétend pas révoquer un
// appareil précis, parce que le jeton ne dit pas de quel appareil il vient.
//
// Réservé au PROPRIÉTAIRE (session de compte) ou à un opérateur nommé. Surtout
// pas à une caisse : un appareil volé pourrait sinon éjecter tout le magasin.

import { entitledMerchant, forgetTillEpoch, json } from '../../auth/_lib.js';

export async function onRequestPost({ request, env }) {
  if (!env || !env.DB) return json({ error: 'not-configured' }, 503);

  let body = {};
  try { body = (await request.json()) || {}; } catch (_) { return json({ error: 'bad-json' }, 400); }

  const asked = String(body.merchant || '').slice(0, 64);
  if (!asked) return json({ error: 'merchant-required' }, 400);

  // `allowTill` volontairement absent : une caisse ne dépaire pas le magasin.
  const merchant = await entitledMerchant(request, env, asked);
  if (merchant !== asked) return json({ error: 'forbidden-merchant' }, 403);

  /* La colonne peut manquer : la base de production est régulièrement en retard
   * sur schema.sql. On l'ajoute au besoin, et un échec ici ne doit pas faire
   * croire à une révocation qui n'a pas eu lieu. */
  try {
    await env.DB.prepare('ALTER TABLE merchant_config ADD COLUMN till_epoch INTEGER NOT NULL DEFAULT 0').run();
  } catch (_) { /* déjà présente */ }

  let epoch = null;
  try {
    const row = await env.DB.prepare(
      `UPDATE merchant_config
          SET till_epoch = COALESCE(till_epoch, 0) + 1, updated_ts = ?
        WHERE merchant = ?
      RETURNING till_epoch`
    ).bind(Date.now(), merchant).first();
    epoch = row && Number(row.till_epoch);
  } catch (_) { epoch = null; }

  /* Pas de ligne au registre : la boutique n'a jamais été configurée, donc il
   * n'y a rien à périmer — mais le dire franchement vaut mieux qu'un faux « ok »
   * après lequel le commerçant croirait ses caisses coupées. */
  if (!Number.isFinite(epoch)) return json({ error: 'store-not-registered' }, 409);

  forgetTillEpoch(merchant);
  return json({ ok: true, epoch, note: 'toutes les caisses doivent réappairer' });
}

export function onRequestGet() {
  return json({ error: 'method-not-allowed' }, 405);
}
