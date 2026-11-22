/* Les dépôts que des partenaires SANS session font chez Kiwi : la porte du site
 * (functions/_middleware.js) les laisse passer, et chaque handler vérifie lui-même
 * la preuve qu'il exige (clé porteuse, signature HMAC, jeton partagé). Sorti du
 * middleware le 19 nov. 2026 pour qu'il cesse de grossir. */
export function partnerWebhookOpen(method, path) {
  /* Le dépôt d'une commande par un canal extérieur (Glovo, Shopify, un relais
   * Make). Ces appelants n'ont ni session ni cookie et n'en auront jamais : ils
   * présentent une clé porteuse dans l'en-tête Authorization, que le handler
   * vérifie lui-même contre channel_links. Passer cette porte-ci ne prouve donc
   * toujours rien — exactement comme /api/order, qui est ouvert mais refuse si
   * Order Pro n'est pas activé. Chemin EXACT : rien sous /api/channel/ d'autre
   * n'est ouvert, et la gestion des clés reste derrière la porte normale. */
  if (method === 'POST' && path === '/api/channel/order') return true;
  /* Les trois webhooks de l'API Partners de Glovo (functions/api/channel/glovo/).
   * Pas de cookie chez Glovo non plus : le handler vérifie lui-même le jeton
   * partagé GLOVO_TOKEN et répond 503 tant qu'il n'est pas configuré. Chemins
   * EXACTS ; la liaison des magasins (/api/admin/glovo-stores) reste derrière la
   * porte normale. */
  if (method === 'POST' && (path === '/api/channel/glovo/dispatched' || path === '/api/channel/glovo/picked_up'
    || path === '/api/channel/glovo/cancelled')) return true;
  /* La carte que Glovo vient lire après un envoi (menuUrl) : GET, chemin exact,
   * même jeton partagé (en « Bearer »), vérifié par le handler. */
  if (method === 'GET' && path === '/api/channel/glovo/menu-feed') return true;
  /* La réception native de Shopify. Même raisonnement, une exception près : son
   * chemin PORTE l'identifiant du lien, donc il ne peut pas être exact. Le
   * préfixe est aussi étroit que possible — POST seulement, un seul segment
   * après, et rien d'autre sous /api/channel/ n'y correspond : la gestion des
   * clés (/api/channel/keys) reste derrière la porte normale.
   *
   * Ouvrir ce chemin ne prouve rien non plus. Shopify ne sait envoyer aucun
   * en-tête d'authentification ; ce qui tient la porte fermée, c'est la
   * signature HMAC que le handler vérifie lui-même, et il refuse tout tant que
   * le commerçant n'a pas enregistré la clé de signature de sa boutique. */
  if (method === 'POST' && /^\/api\/channel\/shopify\/[A-Za-z0-9-]{6,64}$/.test(path)) return true;
  return false;
}
