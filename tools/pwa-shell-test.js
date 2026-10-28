#!/usr/bin/env node
/* Kiwi · the installable till is complete before the first outage. */
'use strict';

const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const sw = read('kiwi-sw.js');
const dispatch = read('assets/pos-dispatch.js');
let passed = 0;
const failed = [];
const ok = (label, condition) => condition ? passed++ : failed.push(label);

const entries = [...dispatch.matchAll(/file:\s*'([^']+)'(?:,\s*rev:\s*'([^']+)')?/g)]
  .map((m) => ({ base: m[1], rev: m[2] || '' }));
const files = entries.map((e) => e.base);
ok('the dispatcher declares POS verticals', entries.length >= 10);
/* `deps` are classic scripts a vertical needs first (no stylesheet of their own). */
const depNames = new Set([...dispatch.matchAll(/deps:\s*\[([^\]]*)\]/g)].flatMap((m) => [...m[1].matchAll(/file:\s*'([^']+)'/g)].map((x) => x[1])));
entries.forEach(({ base, rev }) => {
  ['js', 'css'].forEach((ext) => {
    if (ext === 'css' && depNames.has(base)) return;
    const rel = `assets/${base}.${ext}`;
    ok(`${rel} exists`, fs.existsSync(path.join(ROOT, rel)));
    ok(`${rel} is pre-cached`, sw.includes(`'/${rel}${rev ? `?v=${rev}` : ''}'`));
  });
});

// Module dependencies are part of the offline vertical, not optional extras.
const visited = new Set(), moduleUrls = new Set();
function moduleClosure(file) {
  if (visited.has(file)) return; visited.add(file);
  for (const m of read(file).matchAll(/(?:(?:from|import)\s+|import\s*\(\s*)'(\.\.?\/[^']+\.js\?v=[0-9]+)'/g)) {
    const url = path.posix.normalize(path.posix.join(path.posix.dirname(file), m[1]));
    ok(url + ' is pre-cached', sw.includes("'/" + url + "'"));
    moduleUrls.add('/' + url);
    const target = url.split('?')[0]; ok(target + ' exists', fs.existsSync(path.join(ROOT, target)));
    moduleClosure(target);
  }
}
entries.forEach(({base}) => moduleClosure('assets/' + base + '.js'));
// Live Link is a module in every shell: its imports must be precached at the stamp it imports.
moduleClosure('assets/live-link.js');
moduleClosure('assets/tickets.js');
moduleClosure('assets/invoicing.js');
moduleClosure('assets/team-hours.js');
moduleClosure('assets/team.js');

const shell = [...sw.matchAll(/^\s*'(\/[^']+)'[,;]?/gm)].map((m) => m[1]);
/* « Le fichier est là » ne veut pas dire « l'URL répond ». Pages sert une page
   sur son URL canonique SANS .html et renvoie 308 sur la forme .html — et une
   réponse redirigée fait jeter c.add(), donc l'entrée n'entre jamais dans la
   coquille, en silence. On résout donc les deux formes, ce qui autorise (et
   c'est le but) la forme canonique dans SHELL. */
const onDisk = (rel) => fs.existsSync(path.join(ROOT, rel)) || (!path.extname(rel) && fs.existsSync(path.join(ROOT, `${rel}.html`)));
shell.forEach((url) => ok(`${url} exists`, onDisk(url.split('?')[0].slice(1))));

/* Une estampille ?v= n'a de valeur que si les deux côtés portent LA MÊME. La
   clé de cache est l'URL complète : si kiwi-sw.js pré-cache /assets/venues.js?v=2
   pendant que dashboard.html demande ?v=3, l'entrée pré-cachée ne répond jamais
   (plus de hors-ligne) ; si c'est l'inverse, le navigateur re-sert l'ancien
   fichier au premier chargement après un déploiement. C'est exactement comme ça
   que la carte « Passer à Ultra » retirée est revenue dans la barre latérale
   d'un commerçant alors que le code déployé, lui, était bon. */
/* booking.html entre dans cette liste avec sa pré-mise en cache (#0055) : dès
   qu'un document est servi par le service worker, ses estampilles doivent
   s'accorder avec la coquille, sinon la page publique repart sur un vieux
   script au premier chargement après un déploiement.
   reset.html (mot de passe oublié, derrière kiwiSkin2027:access) est le
   document qui demande sprite.access.svg et access-reset.js : même règle. */
const docs = ['dashboard.html', 'kiwi-caisse.html', 'kiwi-serveur.html', 'kiwi-cuisine.html', 'booking.html', 'reset.html', 'OrderPro.html']
  .map(read).join('\n');
/* Files a shell script loads only when needed (the iPhone barcode decoder,
   fetched by retail-scan.js when the camera opens) keep their stamp there. */
const onDemand = ['assets/retail-scan.js', 'assets/stock.js', 'assets/printer-bridge.js', 'assets/pages-pro.js', 'assets/pages/dashboard-loader.js', 'assets/pages/dashboard-startup.js', 'assets/daterange/renderers.js', 'assets/dateRange.js', 'assets/agent.js', 'assets/booking.js', 'assets/orderpro-page.js'].map(read).join('\n');
// Public booking modules share their import URL with the offline shell.
for (const m of read('assets/booking.js').matchAll(/import\('(\/assets\/booking-[a-z]+\.js\?v=\d+)'\)/g)) {
  ok(m[1] + ' is pre-cached', shell.includes(m[1]));
  ok(m[1] + ' exists', onDisk(m[1].split('?')[0].slice(1)));
}
// Chaque partie du stock doit exister hors ligne avant la première ouverture.
for (const m of read('assets/stock.js').matchAll(/'(assets\/stock\/[^']+\.js\?v=\d+)'/g)) {
  ok(m[1] + ' is pre-cached', shell.includes('/' + m[1]));
}
// Every first-use table prerequisite is available before the first offline open.
for (const m of read('assets/pages-pro.js').matchAll(/'(assets\/pages\/[^']+\.js\?v=\d+)'/g)) {
  ok(m[1] + ' is pre-cached', shell.includes('/' + m[1]));
}
// L’interface imprimante doit aussi être disponible à froid hors ligne.
for (const m of read('assets/printer-bridge.js').matchAll(/'(\/assets\/printer\/[^']+\.js\?v=\d+)'/g)) {
  ok(m[1] + ' is pre-cached', shell.includes(m[1]));
}
const workerVersion = (sw.match(/var CACHE = 'kiwi-app-v(\d+)'/) || [])[1];
['assets/dashboard-pwa.js', 'assets/caisse-pwa.js', 'assets/employee-live.js'].forEach((file) => {
  ok(`${file} registers the current worker version`, !!workerVersion && read(file).includes(`/kiwi-sw.js?v=${workerVersion}`));
  ok(`${file} explicitly checks for an update`, read(file).includes('reg.update()'));
});
shell.filter((url) => url.includes('?v=')).forEach((url) => {
  const m = url.match(/^\/assets\/([^?]+)\?v=([^&]+)$/);
  const dynamic = m && entries.some((e) => (`${e.base}.js` === m[1] || `${e.base}.css` === m[1]) && e.rev === m[2]);
  ok(`${url} carries the same ?v= stamp in its application shell`, docs.includes(`"assets/${url.slice(8)}"`) || dynamic || moduleUrls.has(url) || onDemand.includes(`'assets/${url.slice(8)}'`) || onDemand.includes(`'${url}'`) || onDemand.includes(`"assets/${url.slice(8)}"`));
});

if (failed.length) {
  failed.forEach((label) => console.error('  ✗ ' + label));
  process.exit(1);
}
console.log(`✓ ${passed} PWA shell checks green (${files.length} POS verticals complete offline)`);
