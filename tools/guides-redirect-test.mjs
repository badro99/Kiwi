/* /guide et /guides · la bibliothèque publique, jamais l'écran de connexion
 *
 * Ces deux chemins n'ont pas de préfixe de langue, donc ils ne figuraient dans
 * aucune liste publique de functions/_middleware.js : ils tombaient dans le
 * gate de compte et répondaient par le formulaire de connexion marchand. Un
 * visiteur qui tape kiwi-os.com/guides, ou qui suit un lien partagé sans la
 * langue, doit arriver sur les guides.
 *
 * On appelle le VRAI middleware, pas une copie de sa logique. */
import { onRequest } from '../functions/_middleware.js';

let failures = 0;
let checks = 0;
const ok = (condition, message) => {
  checks += 1;
  if (condition) console.log('  ✓ ' + message);
  else { failures += 1; console.log('  ✗ ' + message); }
};

/* `next()` rend une vraie Response : le middleware en ajoute des en-têtes
 * pour certains chemins, et un sentinelle le ferait échouer pour une raison
 * sans rapport avec ce qu'on teste. */
const SERVED = 'served by the static asset layer';
const call = (path, headers = {}, method = 'GET') => onRequest({
  request: new Request('https://kiwi-os.com' + path, { method, headers }),
  env: {},
  next: async () => new Response(SERVED, { status: 200, headers: { 'Content-Type': 'text/html' } }),
});

for (const path of ['/guide', '/guides', '/guide/', '/guides/']) {
  const response = await call(path);
  ok(response.status === 308, `${path} answers a permanent redirect, not the account gate`);
  ok(response.headers?.get('Location') === '/fr/guides/', `${path} lands on the French library by default`);
  ok((response.headers?.get('Vary') || '').includes('Accept-Language'), `${path} varies on Accept-Language so a shared cache cannot cross languages`);
}

/* La langue est négociée comme partout ailleurs sur le site. */
const negotiated = [
  ['en-US,en;q=0.9', '/en/guides/', 'an English visitor'],
  ['ar-MA,ar;q=0.9', '/ar/guides/', 'an Arabic visitor'],
  ['fr-FR,fr;q=0.9', '/fr/guides/', 'a French visitor'],
  ['de-DE,de;q=0.9', '/fr/guides/', 'a visitor with no published locale'],
];
for (const [accept, expected, who] of negotiated) {
  const response = await call('/guides', { 'Accept-Language': accept });
  ok(response.headers?.get('Location') === expected, `${who} reaches ${expected}`);
}

const explicit = await call('/guides?lang=ar');
ok(explicit.headers?.get('Location') === '/ar/guides/', 'an explicit ?lang wins over the browser header');

/* La redirection ne doit avaler ni les pages réelles ni les écritures, et la
 * bibliothèque doit rester PUBLIQUE : le gate de compte répond 401, donc un
 * 200 prouve aussi qu'un robot peut lire la page sans session. */
for (const path of ['/fr/guides/', '/en/guides/', '/ar/guides/', '/fr/guides/ouvrir-restaurant-maroc/']) {
  const response = await call(path);
  ok(response.status === 200 && !response.headers.get('Location'), `${path} is served directly and publicly, never redirected or gated`);
}
const posted = await call('/guides', {}, 'POST');
ok(posted.status !== 308, 'the redirect is read-only, so it cannot swallow a POST');

console.log(`\n  ${checks - failures}/${checks} guides-redirect checks passed`);
if (failures) process.exit(1);
