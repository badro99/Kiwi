// Qui a le droit de lire et d'écrire les données PRIVÉES d'un magasin.
//
// Ce fichier ne sert aucune route (le préfixe `_` l'exclut du routage Pages, la
// même convention que functions/auth/_lib.js). Il ne contient qu'une chose : la
// règle qui décide de quel magasin un appelant est le commerçant.
//
// Elle a été écrite pour /api/catalog (l'inventaire d'une boutique) et vaut
// désormais pour /api/store (les documents par établissement — carte, équipe,
// fidélité, plan de salle…) et /api/clients (le carnet). Ces trois endpoints
// exposent tout ce qu'un commerçant a de plus privé : son stock, ses salaires,
// les téléphones de ses clients. Une règle de tenancy dupliquée en trois
// exemplaires dérive — l'une se corrige, les deux autres restent ouvertes. Il
// n'y en a donc qu'une, ici.
//
// Le contraste avec /api/menu est le point important : GET /api/menu est PUBLIC
// (le client qui scanne un tag NFC n'a ni compte ni cookie), et ne renvoie donc
// que ce qu'un commerce CHOISIT de publier. Rien de ce qui passe par ce
// fichier-ci n'est jamais public : la porte du site admet TOUS les commerçants
// connectés et un mot de passe équipe partagé, et les slugs se devinent depuis
// un nom d'enseigne — être entré ne prouve rien. Il faut prouver son identité
// sur CE magasin.

import {
  readSession, readCookie, SESS_COOKIE,
  slugMerchant, isTillFor, isOperator,
} from '../auth/_lib.js';

/* À qui appartient ce magasin ? NULL = ligne d'avant le registre (ou magasin
 * semé par un opérateur) ; `null` renvoyé = colonne absente, base pas encore
 * migrée. Les deux se comportent pareil chez l'appelant : on retombe sur le
 * slug du compte. */
export async function storeOwner(env, slug) {
  try {
    const row = await env.DB.prepare('SELECT account_id FROM merchant_config WHERE merchant = ?')
      .bind(slug).first();
    return row ? (row.account_id || '') : null;
  } catch (_) { return null; }
}

/* Quel magasin ce demandeur a-t-il le droit de lire/écrire ?
 *
 *   · caisse appairée → le magasin auquel CE terminal a été lié. Testé en
 *     premier : sur un compte multi-boutiques, c'est la caisse — pas la
 *     session — qui sait derrière quel comptoir on se tient.
 *   · session du compte → son propre slug, plus tout magasin qu'il POSSÈDE
 *     (vérifié en base, jamais sur parole du client).
 *   · opérateur → ce qui est demandé ; c'est tout l'objet de la console.
 *
 * Renvoie '' quand le demandeur n'a droit à rien : l'appelant doit refuser. */
export async function tenantFor(request, env, asked) {
  asked = String(asked == null ? '' : asked).slice(0, 64).trim();

  if (asked) {
    try { if (await isTillFor(request, env, asked)) return asked; } catch (_) {}
  }

  let sessionMerchant = '';
  let sessionAid = '';
  if (env.AUTH_SECRET) {
    try {
      const sess = await readSession(readCookie(request, SESS_COOKIE), env.AUTH_SECRET);
      if (sess && sess.aid) {
        const acc = await env.DB.prepare('SELECT business FROM accounts WHERE id = ?')
          .bind(sess.aid).first();
        if (acc && acc.business) { sessionMerchant = slugMerchant(acc.business); sessionAid = sess.aid; }
      }
    } catch (_) { /* pas de session → opérateur, sinon rien */ }
  }

  try { if (await isOperator(request, env)) return asked || sessionMerchant; } catch (_) {}

  if (!sessionMerchant) return '';
  if (!asked || asked === sessionMerchant) return sessionMerchant;
  // Une deuxième boutique du même compte : autorisée si la base confirme qu'elle
  // lui appartient. Un slug inconnu retombe sur le magasin du compte plutôt que
  // d'ouvrir celui d'un inconnu.
  if ((await storeOwner(env, asked)) === sessionAid) return asked;
  return sessionMerchant;
}
