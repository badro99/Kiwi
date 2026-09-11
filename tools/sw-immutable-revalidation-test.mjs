#!/usr/bin/env node
/**
 * Le service worker ne doit PAS revalider une URL estampillée.
 *
 * `assets/foo.js?v=42` est immuable par contrat : si le contenu de foo.js
 * change, `tools/bump-stamp.js` déplace l'estampille, l'URL change, et c'est un
 * défaut de cache qui va chercher la version neuve · `tools/stamp-drift-test.js`
 * fait échouer la build si le contenu bouge sans l'estampille. Revalider une
 * telle URL ne peut donc rien rapporter.
 *
 * Ça, en revanche, coûtait : la branche « assets » lançait `fetch()` même quand
 * le cache répondait (`var net = fetch(req)` est évalué avant `return hit || net`),
 * si bien que chaque ouverture du tableau de bord rejouait ~130 requêtes et
 * réécrivait ~7 Mo dans le Cache Storage pour des octets identiques. Deux
 * onglets ouverts doublaient la note, et le navigateur finissait par afficher
 * « Pages Unresponsive ».
 *
 * Le test exécute le VRAI kiwi-sw.js dans un bac à sable et observe si le
 * gestionnaire `fetch` touche le réseau. Une réécriture qui reperd la règle
 * repasse la suite au rouge.
 *
 * Ce qui reste revalidé, et doit le rester : les fichiers SANS estampille (63
 * rien que dans dashboard.html · `auth-guard.js`, `kiwi-env.js`, `theme.css`…),
 * qui eux changent sans que leur URL bouge.
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ORIGIN = 'https://kiwi-os.com';
const failures = [];

/** Charge kiwi-sw.js dans un bac à sable et rend ses gestionnaires d'événements. */
function loadWorker() {
  const handlers = {};
  const sandbox = {
    URL, console,
    caches: { open: async () => ({ put() {}, add: async () => {}, keys: async () => [] }), keys: async () => [], match: async () => undefined, delete: async () => true },
    fetch: async () => new Response(),
    Response: class { constructor() { this.status = 200; this.type = 'basic'; this.redirected = false; } clone() { return this; } },
  };
  sandbox.self = sandbox;
  sandbox.self.location = new URL('/kiwi-sw.js', ORIGIN);
  sandbox.self.skipWaiting = () => {};
  sandbox.self.clients = { claim: () => {} };
  sandbox.self.addEventListener = (type, fn) => { (handlers[type] ||= []).push(fn); };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'kiwi-sw.js'), 'utf8'), sandbox, { filename: 'kiwi-sw.js' });
  if (!handlers.fetch?.length) throw new Error('kiwi-sw.js n’enregistre aucun gestionnaire fetch');
  return { handlers, sandbox };
}

/**
 * Rejoue une requête GET à travers le gestionnaire `fetch` du worker.
 * `cached` dit si le Cache Storage possède déjà cette URL exacte.
 * Rend `{ hitNetwork }` · le seul fait qui nous intéresse.
 */
async function run(urlPath, { cached }) {
  const { handlers, sandbox } = loadWorker();
  let hitNetwork = false;
  sandbox.fetch = async () => { hitNetwork = true; return new sandbox.Response(); };
  sandbox.caches.match = async () => (cached ? { cachedCopy: urlPath } : undefined);

  const req = { url: ORIGIN + urlPath, method: 'GET', mode: 'no-cors' };
  let responded;
  const event = { request: req, respondWith: (p) => { responded = p; }, waitUntil: () => {} };
  for (const fn of handlers.fetch) fn(event);
  if (responded) await responded;
  // Le fetch d'arrière-plan n'est pas attendu par respondWith : laisser tourner
  // la microtask avant de conclure qu'il n'a pas eu lieu.
  await new Promise((r) => setImmediate(r));
  return { hitNetwork };
}

const CASES = [
  // [chemin,                        en cache, doit toucher le réseau, pourquoi]
  ['/assets/venues.js?v=42', true, false, 'URL estampillée en cache · aucune revalidation possible ou utile'],
  ['/assets/pages-pro.js?v=2083', true, false, 'le plus gros fichier du tableau de bord · 905 Ko réécrits à chaque chargement'],
  ['/assets/venues.js?v=43', false, true, 'estampille neuve, absente du cache · doit aller la chercher'],
  ['/assets/auth-guard.js', true, true, 'PAS d’estampille · peut changer sans que l’URL bouge, donc on revalide'],
  ['/assets/theme.css', true, true, 'PAS d’estampille · idem'],
];

for (const [p, cached, wantNetwork, why] of CASES) {
  const { hitNetwork } = await run(p, { cached });
  if (hitNetwork !== wantNetwork) {
    failures.push(`${p} (en cache: ${cached}) · réseau attendu ${wantNetwork}, obtenu ${hitNetwork} · ${why}`);
  }
}

// Un piège : une clé de requête qui contient « v= » sans être une estampille
// (`?nav=1`) ne doit pas être prise pour immuable.
{
  const { hitNetwork } = await run('/assets/x.js?nav=1', { cached: true });
  if (!hitNetwork) failures.push('« ?nav=1 » pris pour une estampille · le motif doit exiger ? ou & devant v=');
}

if (failures.length) {
  console.error(`✗ Service worker · revalidation des URL estampillées (${failures.length})`);
  for (const f of failures) console.error(`  ${f}`);
  process.exit(1);
}

console.log(`✓ ${CASES.length + 1} cas · le worker ne revalide jamais une URL estampillée déjà en cache`);
console.log('✓ les fichiers sans estampille restent en stale-while-revalidate');
