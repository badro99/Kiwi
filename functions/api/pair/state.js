/* GET /api/pair/state?merchant=<slug> — « cet appareil est-il encore la caisse
 * de ce magasin ? »
 *
 * ── POURQUOI CE POINT D'ENTRÉE EXISTE ──────────────────────────────────────
 * L'identité d'une caisse vit à DEUX endroits, avec deux durées de vie :
 *   · localStorage `kiwiPairedVenue` — ce que la tablette croit être ;
 *   · le cookie httpOnly `kiwi_till` — la seule chose que le serveur accepte.
 * Rien ne les tient ensemble. iPadOS purge les données de site, on réinstalle
 * la PWA, on « efface l'historique » : le cookie part, le localStorage reste.
 * La caisse continue alors d'encaisser en se croyant appairée, et CHAQUE vente
 * repart en 403 — la tablette photographiée en portait trente et une.
 *
 * Le comptoir ne pouvait pas distinguer ce cas d'une panne serveur : il voyait
 * le même 403 opaque et proposait « toucher pour réessayer », un geste qui ne
 * pouvait jamais aboutir. Cette route rend la différence lisible, donc
 * réparable : voir assets/caisse-pwa.js, qui la consulte et transforme la ligne
 * d'état en « réappairer ».
 *
 * Ne divulgue rien : l'appelant détient déjà le cookie qu'on lui décrit, et la
 * réponse ne contient ni jeton, ni code, ni identité de personne.
 */

import { json, readCookie, TILL_COOKIE, tillVerification } from '../../auth/_lib.js';

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const merchant = String(url.searchParams.get('merchant') || '').slice(0, 64).trim();
  if (!merchant) return json({ error: 'merchant-required' }, 400);
  if (!env || !env.AUTH_SECRET) return json({ error: 'not-configured' }, 503);

  /* Pas de cookie du tout : l'appareil n'est la caisse de personne. C'est le cas
   * réparable — et le seul que la tablette peut corriger elle-même, avec un
   * nouveau code à six chiffres. */
  if (!readCookie(request, TILL_COOKIE)) {
    return json({ paired: false, merchant, reason: 'no-cookie' }, 200);
  }

  const till = await tillVerification(request, env, merchant);
  /* La lecture de révocation a échoué : on ne sait pas, et on ne le déguise pas
   * en « dépairée ». Réappairer ici effacerait un appairage parfaitement valide
   * à cause d'une panne de base. */
  if (till && till.unavailable) return json({ error: 'auth-verification-unavailable' }, 503);
  if (till && till.ok) return json({ paired: true, merchant, reason: 'ok' }, 200);

  /* Un cookie qui ne vérifie pas pour CE magasin : soit le commerçant a dépairé
   * (millésime incrémenté), soit cette tablette appartient à un autre magasin.
   * Les deux se réparent par le même geste, et aucun des deux ne doit être
   * deviné ici — le serveur ne dit pas de quel magasin vient un jeton. */
  return json({ paired: false, merchant, reason: 'stale' }, 200);
}
