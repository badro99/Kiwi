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
entries.forEach(({ base, rev }) => {
  ['js', 'css'].forEach((ext) => {
    const rel = `assets/${base}.${ext}`;
    ok(`${rel} exists`, fs.existsSync(path.join(ROOT, rel)));
    ok(`${rel} is pre-cached`, sw.includes(`'/${rel}${rev ? `?v=${rev}` : ''}'`));
  });
});

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
const docs = ['dashboard.html', 'kiwi-caisse.html', 'kiwi-serveur.html', 'kiwi-cuisine.html']
  .map(read).join('\n');
shell.filter((url) => url.includes('?v=')).forEach((url) => {
  const m = url.match(/^\/assets\/([^?]+)\?v=([^&]+)$/);
  const dynamic = m && entries.some((e) => (`${e.base}.js` === m[1] || `${e.base}.css` === m[1]) && e.rev === m[2]);
  ok(`${url} carries the same ?v= stamp in its application shell`, docs.includes(`"assets/${url.slice(8)}"`) || dynamic);
});

if (failed.length) {
  failed.forEach((label) => console.error('  ✗ ' + label));
  process.exit(1);
}
console.log(`✓ ${passed} PWA shell checks green (${files.length} POS verticals complete offline)`);
