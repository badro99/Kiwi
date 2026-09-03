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
  slugMerchant, isTillFor, isOperator, slugClaimedByOther,
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

/* TOUS les magasins du même propriétaire — la question que `tenantFor` ne pose
 * pas.
 *
 * `tenantFor` répond « de QUEL magasin suis-je le commerçant », au singulier :
 * c'est ce qu'il faut pour lire ou écrire un inventaire. Un commerçant qui a
 * deux boutiques et qui scanne un article à Casa pour savoir s'il en reste à
 * Marrakech pose une autre question — « quels magasins sont les MIENS » — et
 * aucune fonction n'y répondait. Sans elle, la réponse ne pouvait venir que du
 * navigateur (la liste des établissements vit dans kiwiCustomVenues), donc un
 * client qui l'inventait lisait le stock d'un inconnu.
 *
 * `from` est le magasin d'où l'on parle. Il est OBLIGATOIRE pour une caisse : le
 * cookie d'appairage est un vérificateur (HMAC du slug), pas un porteur — on ne
 * peut que confirmer « cette caisse est bien celle de X », jamais lui demander
 * qui elle est. Le terminal nomme donc son magasin et le prouve.
 *
 * Ordre de résolution, calqué sur tenantFor pour qu'il n'y ait pas deux idées
 * différentes de qui est qui :
 *   · caisse appairée sur `from` → le compte qui POSSÈDE `from`
 *   · session du compte         → ce compte
 *   · opérateur                 → le compte qui possède `from` (console God mode)
 *
 * Renvoie toujours une liste sûre : `{ aid, stores }`, vide quand le demandeur
 * ne prouve rien. Un magasin dont la base ne connaît pas le propriétaire
 * (ligne d'avant le registre, ou base pas encore migrée) ne se voit attribuer
 * AUCUN frère : on préfère un panneau vide à celui du voisin. */
export async function ownedStores(request, env, from) {
  const out = { aid: '', stores: [] };
  if (!env || !env.DB) return out;
  from = String(from == null ? '' : from).slice(0, 64).trim().toLowerCase();

  let aid = '';

  // 1) La caisse. Elle nomme son magasin, on vérifie, puis on remonte au compte.
  if (from) {
    try {
      if (await isTillFor(request, env, from)) aid = (await storeOwner(env, from)) || '';
    } catch (_) { /* pas une caisse → on continue */ }
  }

  // 2) La session du compte — elle EST le propriétaire, rien à remonter.
  if (!aid && env.AUTH_SECRET) {
    try {
      const sess = await readSession(readCookie(request, SESS_COOKIE), env.AUTH_SECRET);
      if (sess && sess.aid) aid = sess.aid;
    } catch (_) { /* ni caisse ni session → opérateur, sinon rien */ }
  }

  // 3) L'opérateur, cadré sur le magasin qu'il consulte. Sans `from` il n'a pas
  //    désigné de client : on ne devine pas lequel.
  if (!aid && from) {
    try {
      if (await isOperator(request, env)) aid = (await storeOwner(env, from)) || '';
    } catch (_) {}
  }

  if (!aid) return out;
  out.aid = aid;

  const seen = new Set();
  const push = (r) => {
    const m = r && String(r.merchant || '').trim();
    if (!m || seen.has(m)) return;
    seen.add(m);
    out.stores.push({ merchant: m, name: String(r.name || ''), type: String(r.type || '') });
  };

  // Le registre. C'est la source qui fait autorité : `account_id` n'est écrit que
  // par le commerçant lui-même (api/config.js → claimStore) ou par un opérateur.
  try {
    const rs = await env.DB.prepare(
      'SELECT merchant, name, type FROM merchant_config WHERE account_id = ? LIMIT 50'
    ).bind(aid).all();
    for (const r of (rs.results || [])) push(r);
  } catch (_) { /* colonne absente → on retombe sur le slug du compte ci-dessous */ }

  // Le magasin d'un compte mono-boutique est keyé sur le slug de son nom et peut
  // n'avoir jamais été enregistré (lignes d'avant le registre). Sans ce repli, un
  // tel commerçant se verrait répondre « aucun établissement », y compris le sien.
  try {
    const acc = await env.DB.prepare('SELECT business FROM accounts WHERE id = ?').bind(aid).first();
    /* Ce repli portait le même défaut que les deux résolveurs : il ajoutait le
     * slug dérivé du nom sans vérifier qu'il n'est pas celui d'un autre. */
    if (acc && acc.business && !(await slugClaimedByOther(env, slugMerchant(acc.business), aid))) {
      push({ merchant: slugMerchant(acc.business), name: acc.business, type: '' });
    }
  } catch (_) {}

  return out;
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
/* Ce magasin est-il suspendu ? (merchant_config.status)
 *
 * Distinct de accounts.status, et c'est tout l'intérêt : geler un LOGIN ferme
 * toutes les boutiques du client d'un coup. Un client qui tient une boutique et
 * un café, et qui ne paie plus que pour l'un des deux, doit pouvoir garder
 * l'autre ouvert. Rien n'est effacé — c'est un frein, pas une gomme.
 *
 * NULL / colonne absente ⇒ actif. Une base pas encore migrée se comporte donc
 * exactement comme avant, et une erreur de lecture n'a JAMAIS le droit de fermer
 * un magasin qui paie. */
export async function storeSuspended(env, slug) {
  slug = String(slug == null ? '' : slug).trim();
  if (!slug || !env || !env.DB) return false;
  try {
    const r = await env.DB.prepare('SELECT status FROM merchant_config WHERE merchant = ?')
      .bind(slug).first();
    return !!(r && String(r.status || '') === 'suspended');
  } catch (_) { return false; }
}

/* New stores finish onboarding before a human accepts their subscription.
 * They may read every screen, but no operational write may cross this boundary.
 * NULL and a missing column mean active so no existing client is retroactively
 * locked by a deployment. */
export async function storeSubscriptionPending(env, slug) {
  slug = String(slug == null ? '' : slug).trim();
  if (!slug || !env || !env.DB) return false;
  try {
    const r = await env.DB.prepare('SELECT status FROM merchant_config WHERE merchant = ?')
      .bind(slug).first();
    return !!(r && String(r.status || '') === 'pending');
  } catch (_) { return false; }
}

export async function tenantFor(request, env, asked, opts) {
  /* `strict` — pour les ÉCRITURES. Deux règles s'y ajoutent, et aucune des deux
   * ne doit gêner une lecture :
   *   · un slug inconnu ne se rabat plus sur le magasin du compte (voir le
   *     repli en bas de resolveTenant) ;
   *   · un magasin SUSPENDU ou EN ATTENTE n'écrit plus. Sa lecture reste ouverte — le patron
   *     doit pouvoir consulter son historique et voir ce qu'il retrouvera en
   *     payant ; couper la lecture ferait passer une suspension pour une
   *     suppression.
   * Le contrôle est ici, sur le magasin RÉSOLU, et pas sur celui qui a été
   * demandé : c'est le seul point par lequel toutes les branches repassent. */
  const strict = !!(opts && opts.strict);
  const who = await resolveTenant(request, env, asked, strict);
  if (strict && who && (await storeSuspended(env, who) || await storeSubscriptionPending(env, who))) return '';
  return who;
}

async function resolveTenant(request, env, asked, strict) {
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
  /* Même trou que dans entitledMerchant : le slug du compte était rendu sans
   * qu'on demande au registre à qui il appartient. Un compte créé avec le nom
   * d'un commerçant existant tombait directement dans son tenant, en lecture
   * comme en écriture. */
  if (await slugClaimedByOther(env, sessionMerchant, sessionAid)) return '';
  if (!asked || asked === sessionMerchant) return sessionMerchant;
  // Une deuxième boutique du même compte : autorisée si la base confirme qu'elle
  // lui appartient. Un slug inconnu retombe sur le magasin du compte plutôt que
  // d'ouvrir celui d'un inconnu.
  if ((await storeOwner(env, asked)) === sessionAid) return asked;
  /* …sauf en écriture. Ce repli est sûr côté SÉCURITÉ — on ne sert jamais le
   * magasin d'un tiers — mais il range le courrier d'un magasin chez un autre :
   * l'appelant a nommé A, on écrit dans B, et personne n'est averti. C'est ce
   * qui est arrivé le 28 juillet 2026, quand un établissement renommé a présenté
   * un slug que le registre ne connaissait pas encore : la minute suivante, sa
   * carte est partie dans la ligne `menus` de la boutique du même compte, qui a
   * pris le nom du café au passage. Un refus laisse le client sur sa copie
   * locale — il ne perd rien et retentera ; un mauvais destinataire, si. */
  if (strict) return '';
  return sessionMerchant;
}

/* Le locataire vu UNIQUEMENT par sa session propriétaire. Contrairement à
 * `tenantFor`, cette règle ne consulte JAMAIS le cookie de caisse appairée
 * (`isTillFor`) ni le cookie opérateur : un terminal compromis ou prêté ne
 * peut ni élargir, ni détourner, ni rediriger l'autorité de la session, et
 * une console sans session propriétaire n'ouvre rien. C'est l'outil des
 * lectures privées où la session suffit et où rien d'autre ne doit parler :
 * archives de pièces, exports comptables.
 *
 * Règles, dans l'ordre :
 *   1. session propriétaire valide → aid, sinon '' (jamais d'anonyme) ;
 *   2. le registre attribue EXACTEMENT le magasin demandé à cet aid ;
 *   3. repli mono-boutique historique : le slug du compte, UNIQUEMENT s'il
 *      n'est revendiqué par personne d'autre (même garde que resolveTenant) ;
 *   4. lecture par défaut : ni suspension ni attente ne ferment la lecture
 *      (politique explicite de tenantFor : couper la lecture ferait passer
 *      une suspension pour une suppression). Avec `{ strict: true }`, une
 *      ÉCRITURE exige en plus un magasin actif — même miroir que tenantFor.
 * Renvoie le slug demandé ou '' : l'appelant refuse, sans rien révéler. */
export async function ownerMerchant(request, env, asked, opts) {
  asked = String(asked == null ? '' : asked).slice(0, 64).trim();
  if (!asked) return '';
  if (!env || !env.DB || !env.AUTH_SECRET) return '';
  let aid = '';
  try {
    const sess = await readSession(readCookie(request, SESS_COOKIE), env.AUTH_SECRET);
    if (sess && sess.aid) aid = sess.aid;
  } catch (_) { return ''; }
  if (!aid) return '';
  let owned = false;
  try {
    if ((await storeOwner(env, asked)) === aid) owned = true;
  } catch (_) { /* registre illisible → repli ci-dessous */ }
  if (!owned) {
    try {
      const acc = await env.DB.prepare('SELECT business FROM accounts WHERE id = ?').bind(aid).first();
      if (acc && acc.business && slugMerchant(acc.business) === asked
          && !(await slugClaimedByOther(env, asked, aid))) owned = true;
    } catch (_) { /* base non migrée → refus sauf registre */ }
  }
  if (!owned) return '';
  if (opts && opts.strict) {
    try {
      if (await storeSuspended(env, asked) || await storeSubscriptionPending(env, asked)) return '';
    } catch (_) { /* erreur de lecture ne ferme jamais un magasin qui paie */ }
  }
  return asked;
}
