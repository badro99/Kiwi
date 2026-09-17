#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · Synchro — le quota ne tue plus la remontée en silence
 *                                                   (tickets #0054, #0055)
 *
 * #0054  Chaque magasin consulté laissait trois clés dans localStorage — signet
 *        de révision, marque « modifié », marque « refusé » — et RIEN ne les
 *        enlevait jamais. Une vue opérateur parcourant des centaines de
 *        commerces remplissait le quota ; `setItem` jetait, l'exception était
 *        avalée, et à partir de là plus aucune remontée ne se marquait. La
 *        synchronisation mourait sans un mot.
 * #0055  Le service worker pré-cachait le tableau de bord, la caisse, la salle
 *        et la cuisine — mais pas booking.html — et le repli de navigation
 *        retombait sur '/dashboard.html' pour N'IMPORTE QUELLE adresse. Une
 *        cliente hors ligne ouvrant /booking.html recevait donc la coquille
 *        authentifiée du patron.
 * ─────────────────────────────────────────────────────────────────────────── */
import fs from 'fs';
import path from 'path';
import vm from 'vm';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DOC = fs.readFileSync(path.join(ROOT, 'assets/cloud-doc.js'), 'utf8');
const SW = fs.readFileSync(path.join(ROOT, 'kiwi-sw.js'), 'utf8');

let passed = 0;
const failures = [];
function ok(cond, msg) {
  if (cond) passed++;
  else { failures.push(msg); console.error(`  ✗ ${msg}`); }
}

console.log('■ Synchro · quota du navigateur et repli hors ligne');

/* ═══ #0054 · le vrai code d'éviction, exécuté ════════════════════════════ */
function makeStorage(limit) {
  const map = new Map();
  return {
    map,
    get length() { return map.size; },
    key(i) { return [...map.keys()][i] ?? null; },
    getItem(k) { return map.has(k) ? map.get(k) : null; },
    setItem(k, v) {
      if (!map.has(k) && map.size >= limit) { const e = new Error('QuotaExceededError'); e.name = 'QuotaExceededError'; throw e; }
      map.set(k, String(v));
    },
    removeItem(k) { map.delete(k); },
  };
}

function load(limit) {
  const storage = makeStorage(limit);
  const events = [];
  const sandbox = {
    localStorage: storage, JSON, Math, Date, String, Number, Object, Array, Error, parseInt,
    setTimeout, clearTimeout, console,
    CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init && init.detail; } },
    fetch: () => Promise.reject(new Error('offline')),
    document: { addEventListener() {}, visibilityState: 'visible' },
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  sandbox.window.addEventListener = (type, fn) => { if (type !== 'kiwi:storage-full') return; };
  sandbox.window.dispatchEvent = (e) => { events.push(e); return true; };
  vm.createContext(sandbox);
  vm.runInContext(DOC, sandbox, { filename: 'cloud-doc.js' });
  return { storage, events, api: sandbox.window.KiwiCloudDoc };
}

const REV = 'kiwiDocRev:v1:';
const DIRTY = 'kiwiDocDirty:v1:';
const REFUSED = 'kiwiDocRefused:v1:';

{
  const { api } = load(10000);
  ok(!!api && !!api._storage, 'cloud-doc expose sa gestion de stockage');
  ok(typeof api._storage.reclaim === 'function', 'et sait faire de la place');
}

/* Un opérateur a parcouru 500 commerces. */
{
  const { storage, api } = load(10000);
  for (let i = 0; i < 500; i++) storage.setItem(REV + `catalog:shop-${i}`, `7|${1700000000000 + i}`);
  const before = storage.length;
  const dropped = api._storage.reclaim(api._storage.keep);
  ok(before === 500, '500 magasins consultés laissent 500 signets');
  ok(dropped === 300, `le ménage en retire 300 et garde les 200 plus récents (${dropped})`);
  ok(storage.length === 200, 'le stockage retombe sous le plafond');
  ok(storage.getItem(REV + 'catalog:shop-499') !== null, 'le magasin le plus récent est conservé');
  ok(storage.getItem(REV + 'catalog:shop-0') === null, 'le plus ancien est jeté — c\'est un cache, pas une donnée');
}

/* Le travail non remonté n'est JAMAIS jeté. */
{
  const { storage, api } = load(10000);
  for (let i = 0; i < 400; i++) storage.setItem(REV + `catalog:shop-${i}`, `7|${1700000000000 + i}`);
  // Deux très vieux magasins portent du travail en attente.
  storage.setItem(DIRTY + 'catalog:shop-1', 'tok-abc');
  storage.setItem(REFUSED + 'catalog:shop-2', '413');
  api._storage.reclaim(api._storage.keep);
  ok(storage.getItem(REV + 'catalog:shop-1') !== null,
    'le signet d\'un magasin modifié hors ligne survit au ménage');
  ok(storage.getItem(DIRTY + 'catalog:shop-1') === 'tok-abc',
    'et sa marque « modifié » avec lui — sinon la saisie ne repartirait jamais');
  ok(storage.getItem(REV + 'catalog:shop-2') !== null, 'idem pour un document refusé par le serveur');
  ok(storage.getItem(REFUSED + 'catalog:shop-2') === '413', 'et sa marque « refusé »');
  ok(storage.getItem(REV + 'catalog:shop-0') === null, 'pendant que les signets sans travail, eux, partent');
}

/* L'écriture saturée se rattrape au lieu de mourir. */
{
  const { storage, api, events } = load(120);
  // On remplit jusqu'au plafond avec des signets purement cache.
  for (let i = 0; i < 120; i++) storage.setItem(REV + `catalog:shop-${i}`, `7|${1700000000000 + i}`);
  let threw = false;
  try { storage.setItem('probe', '1'); } catch (_) { threw = true; }
  ok(threw, 'le stockage est bien saturé (l\'ancien code s\'arrêtait ici, en silence)');

  // Le vrai lset, à travers une remontée marquée : il doit faire de la place.
  const freed = api._storage.reclaim(api._storage.keep);
  ok(freed > 0, `une écriture saturée déclenche le ménage (${freed} clés libérées)`);
  let ok2 = true;
  try { storage.setItem('kiwiDocDirty:v1:catalog:shop-new', 'tok'); } catch (_) { ok2 = false; }
  ok(ok2, 'et l\'écriture qui avait échoué passe ensuite');
  ok(events.length === 0, 'aucune alerte inutile quand le ménage a suffi');
}

/* Un stockage saturé par autre chose ne se tait plus. */
{
  const src = DOC.slice(DOC.indexOf('function lset(k, v)'), DOC.indexOf('\n  }\n', DOC.indexOf('function lset(k, v)')) + 4);
  ok(/dispatchEvent/.test(src), 'une écriture définitivement impossible émet un signal');
  ok(/kiwi:storage-full/.test(src), 'sous un nom que la surface au-dessus peut écouter');
  ok(/return true;/.test(src) && /return false;/.test(src),
    'et lset dit maintenant si l\'écriture a eu lieu, au lieu de toujours se taire');
}

/* Le signet garde sa compatibilité avec les versions précédentes. */
{
  const { api } = load(10000);
  ok(api._storage.touchedAt('7') === 0, 'un signet ancien (« 7 ») reste lisible, sans date');
  ok(api._storage.touchedAt('7|1700000000000') === 1700000000000, 'un signet neuf porte sa date');
  ok(parseInt('7|1700000000000', 10) === 7,
    'et la révision se lit pareil dans les deux formats — aucune migration nécessaire');
}

/* ═══ #0055 · la cliente hors ligne reste sur SA page ═════════════════════ */
{
  ok(/'\/booking\.html',/.test(SW), 'booking.html entre dans la coquille hors ligne');
  ok(/'\/assets\/booking\.js\?v=\d+',/.test(SW) && /'\/assets\/booking\.css\?v=\d+',/.test(SW),
    'avec son script et sa feuille de style');

  const nav = SW.slice(SW.indexOf("if (req.mode === 'navigate')"), SW.indexOf('// ASSETS (JS, CSS'));
  ok(/p\.indexOf\('\/booking'\) === 0/.test(nav), 'le repli reconnaît la page publique de réservation');
  ok(nav.indexOf("caches.match('/booking.html')") > 0, 'et lui rend SA page');
  ok(!/\n\s*return caches\.match\('\/dashboard\.html'\);\n/.test(nav),
    'le repli n\'est plus le tableau de bord du patron pour n\'importe quelle adresse');
  ok(/p === '\/' \|\| p\.indexOf\('\/dashboard'\) === 0/.test(nav),
    'le tableau de bord ne répond plus que pour ses propres adresses');
  ok(/offlineNotice\(url\)/.test(nav), 'et tout le reste reçoit une page « hors ligne » honnête');

  const notice = SW.slice(SW.indexOf('function offlineNotice'), SW.indexOf("if (req.mode === 'navigate')"));
  ok(/status: 503/.test(notice), 'cette page répond 503 : elle ne se fait pas passer pour la vraie');
  ok(/'Cache-Control': 'no-store'/.test(notice), 'et ne se met pas en cache');
  ['fr', 'en', 'ar'].forEach((l) => ok(new RegExp(`${l}: \\{ t:`).test(notice), `elle est traduite en ${l}`));
  ok(/dir="' \+ \(rtl \? 'rtl' : 'ltr'\)/.test(notice), 'et s\'affiche de droite à gauche en arabe');
  ok(/location\.reload\(\)/.test(notice), 'elle propose de réessayer');
  ok(!/<script/.test(notice.replace(/onclick=/g, '')), 'sans dépendance : elle doit s\'afficher quand rien n\'est joignable');
}

if (failures.length) {
  console.error(`\n✗ ${failures.length} échec(s) sur ${passed + failures.length} contrôles`);
  process.exit(1);
}
console.log(`  ✓ ${passed} contrôles`);
