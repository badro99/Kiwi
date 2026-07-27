// /api/admin/audit — l'historique administratif d'un établissement (opérateur seul).
//
//   GET ?merchant=slug[&limit=60]  → { entries: [{ kind, … , actor, ts }] }
//
// À quoi ça sert : l'état courant ne garde que la DERNIÈRE valeur. « Les
// réservations sont coupées » ne dit ni depuis quand, ni par qui, ni si elles ont
// déjà servi ; « cette vente n'est pas dans le chiffre d'affaires » ne dit pas
// qui l'en a sortie ni pourquoi. Quand un client rappelle trois mois plus tard,
// c'est la seule question qui compte, et c'est ce que ces tables répondent.
//
// TROIS journaux, UNE liste. Ils sont écrits par trois panneaux différents
// (modules, ventes de test, comptes & e-mails) mais ils racontent la même
// histoire — ce que Kiwi a fait au compte de ce client — et un opérateur qui
// cherche « qu'est-ce qui s'est passé chez eux en juillet » ne doit pas avoir à
// consulter trois écrans et à réordonner les dates de tête. Fusionnées ici, les
// lignes sortent triées par l'horloge, avec `kind` pour que la console sache
// laquelle mettre en forme comment.
//
//   kind:'module'  — un module activé ou coupé          (config_audit)
//   kind:'sale'    — une vente sortie des livres, ou remise (sale_audit)
//   kind:'account' — une adresse corrigée, une réinitialisation envoyée (account_audit)
//
// Le lien de réinitialisation n'entre JAMAIS ici : account_audit ne porte que
// l'adresse masquée. Un historique lisible par tout opérateur qui contiendrait
// des liens valides serait un trousseau de clés des comptes clients.
//
// Fail-soft, table par table : une table absente donne une liste vide pour SON
// type et n'empêche pas les deux autres de s'afficher. C'est ce qui permet de
// déployer le code avant la migration sans que le panneau casse.

import { isOperator, json } from '../../auth/_lib.js';

async function safeAll(env, sql, args) {
  try {
    const rs = await env.DB.prepare(sql).bind(...args).all();
    return (rs && rs.results) || [];
  } catch (_) { return []; }
}

export async function onRequestGet(context) {
  const ok = await isOperator(context.request, context.env);
  if (!ok) return json({ error: 'forbidden' }, 403);
  if (!context.env.DB) return json({ error: 'no-db' }, 503);

  const { env } = context;
  const url = new URL(context.request.url);
  const merchant = (url.searchParams.get('merchant') || '').trim();
  if (!merchant) return json({ error: 'merchant-required' }, 400);
  const limit = Math.min(200, Math.max(1, parseInt(url.searchParams.get('limit') || '60', 10) || 60));

  const modules = await safeAll(env,
    `SELECT feature, enabled, actor, ts FROM config_audit
      WHERE merchant = ? ORDER BY ts DESC, id DESC LIMIT ?`, [merchant, limit]);

  const sales = await safeAll(env,
    `SELECT sale_id, action, reason, note, actor, amount, method, ref, sale_ts, ts
       FROM sale_audit WHERE merchant = ? ORDER BY ts DESC, id DESC LIMIT ?`, [merchant, limit]);

  /* Les gestes de compte sont rangés par COMPTE, pas par magasin — une adresse
     de connexion appartient au client, pas à l'une de ses boutiques. On les
     retrouve donc par les deux chemins : la colonne `merchant` (le magasin
     ouvert dans la console au moment du geste) et le compte propriétaire de ce
     magasin, sinon le changement fait depuis la fiche de la boutique
     n'apparaîtrait pas dans l'historique du restaurant du même client. */
  let accountId = '';
  try {
    const row = await env.DB.prepare('SELECT account_id FROM merchant_config WHERE merchant = ?')
      .bind(merchant).first();
    accountId = (row && row.account_id) || '';
  } catch (_) { /* base pas migrée → on s'en tient à la colonne merchant */ }

  const account = await safeAll(env,
    `SELECT account_id, action, prev, next, reason, actor, detail, ts FROM account_audit
      WHERE merchant = ? OR (account_id != '' AND account_id = ?)
      ORDER BY ts DESC, id DESC LIMIT ?`, [merchant, accountId, limit]);

  const entries = []
    .concat(modules.map((r) => ({ kind: 'module', ...r })))
    .concat(sales.map((r) => ({ kind: 'sale', ...r })))
    .concat(account.map((r) => ({ kind: 'account', ...r })))
    .sort((a, b) => (b.ts || 0) - (a.ts || 0))
    .slice(0, limit);

  return json({ entries });
}
