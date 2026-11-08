/* Un lien mort répond 404, pas l'écran de connexion
 *
 * Audit du site public (8 nov 2026) : kiwi-os.com/zzz, /404 et /status
 * répondaient tous 401 avec le formulaire de connexion marchand. Un visiteur
 * croyait qu'on lui demandait un compte, un robot indexait un 401, et la page
 * de statut (faite pour être lue pendant une panne) était inaccessible.
 *
 * On appelle le VRAI middleware avec une couche statique simulée qui se
 * comporte comme Cloudflare Pages : 404 + 404.html pour un chemin inconnu,
 * 200 pour un fichier qui existe. */
import { onRequest } from '../functions/_middleware.js';

let failures = 0;
let checks = 0;
const ok = (condition, message) => {
  checks += 1;
  if (condition) console.log('  ✓ ' + message);
  else { failures += 1; console.log('  ✗ ' + message); }
};

const EXISTING = new Set(['/dashboard.html', '/dashboard', '/kiwi-caisse.html', '/status.html', '/404.html']);
const NOT_FOUND = '<!doctype html><title>Page introuvable · Kiwi</title>';
const SERVED = 'served by the static asset layer';
const env = {
  AUTH_SECRET: 'test-secret-not-a-real-one-0123456789abcdef',
  ASSETS: {
    fetch: async (req) => {
      const path = new URL(req.url).pathname;
      return EXISTING.has(path)
        ? new Response('app shell', { status: 200 })
        : new Response(NOT_FOUND, { status: 404 });
    },
  },
};
const call = (path, method = 'GET') => onRequest({
  request: new Request('https://kiwi-os.com' + path, { method, headers: { Accept: 'text/html' } }),
  env,
  next: async () => new Response(SERVED, { status: 200, headers: { 'Content-Type': 'text/html' } }),
});

for (const path of ['/zzz-nonexist', '/pricing-2025.html', '/old-page']) {
  const res = await call(path);
  ok(res.status === 404, `${path} (no such file) answers 404, not the account gate (got ${res.status})`);
  ok((await res.text()).includes('Page introuvable'), `${path} shows the site's 404 page`);
}
const head = await call('/zzz-nonexist', 'HEAD');
ok(head.status === 404, 'HEAD on a missing page is 404 too');

for (const path of ['/dashboard.html', '/kiwi-caisse.html']) {
  const res = await call(path);
  ok(res.status === 401, `${path} exists, so a signed-out visitor still gets the gate (got ${res.status})`);
}

for (const path of ['/status', '/status.html', '/404', '/404.html']) {
  const res = await call(path);
  ok(res.status === 200 && (await res.text()) === SERVED, `${path} is public (served as is)`);
}

const api = await call('/api/does-not-exist');
ok(api.status !== 404, `an unknown /api path is never answered by the 404 page (got ${api.status})`);

console.log(`\n  ${checks - failures}/${checks} public-404 checks passed`);
if (failures) process.exit(1);
