/* Pages publiques « utilitaires » et réponse 404 du site public.
 *
 * Audit du site public (8 nov 2026) : kiwi-os.com/zzz, /404 et /status
 * répondaient tous 401 avec l'écran de connexion marchand. Un visiteur
 * croyait qu'on lui demandait un compte, un robot indexait un 401, et la page
 * de statut (faite pour être lue PENDANT une panne, par quelqu'un qui n'arrive
 * justement pas à se connecter) était inaccessible.
 *
 * Vit hors de functions/_middleware.js, qui est épinglé à sa taille
 * (tools/file-size-ratchet-test.mjs). Test : tools/public-404-test.mjs. */

const UTILITY_PATHS = new Set(['/status.html', '/status', '/404.html', '/404', '/404/']);

export function isPublicUtilityPath(path) {
  return UTILITY_PATHS.has(path);
}

/* Un lien mort (faute de frappe, ancienne URL, lien partagé tronqué) reçoit la
 * page 404 du site au lieu du gate. On demande à la couche statique si le
 * chemin existe : Cloudflare Pages répond 404 avec notre 404.html quand il
 * n'existe pas ; une page de l'application qui EXISTE répond 200 et reste
 * derrière le gate (l'appelant). Rien n'est révélé : les deux dépôts sont
 * publics. Renvoie null quand le chemin existe ou que la couche statique ne
 * répond pas. Jamais pour /api : une API garde ses réponses JSON. */
export async function notFoundFor(request, env, path) {
  if (path.startsWith('/api/') || !env || !env.ASSETS || typeof env.ASSETS.fetch !== 'function') return null;
  let probe = null;
  try { probe = await env.ASSETS.fetch(new Request(request.url, { method: 'GET' })); } catch (_) { return null; }
  if (!probe || probe.status !== 404) return null;
  return new Response(request.method === 'HEAD' ? null : probe.body, {
    status: 404,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

/* L'annuaire Kiwi (functions/api/_directory-page.js). Ses pages vivent sous
 * /fr/, /en/ et /ar/, déjà publics en lecture. Ce qui reste à ouvrir, et
 * rien d'autre : les deux envois d'un visiteur sans compte (inscrire un
 * commerce, signaler une fiche), qui se défendent eux-mêmes (piège, temps de
 * saisie signé, limiteur par IP, champs bornés) et n'écrivent qu'en
 * modération ; et le sitemap de l'annuaire. La fiche premium d'un client
 * (/api/directory/listing) et la modération (/api/admin/directory) restent
 * derrière la porte. Test : tools/directory-api-test.mjs. */
const DIRECTORY_POSTS = new Set(['/api/directory/submit', '/api/directory/report']);
export function isPublicDirectoryRequest(method, path) {
  if (method === 'POST') return DIRECTORY_POSTS.has(path);
  return (method === 'GET' || method === 'HEAD') && path === '/sitemap-annuaire.xml';
}
