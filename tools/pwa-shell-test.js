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

const files = [...dispatch.matchAll(/file:\s*'([^']+)'/g)].map((m) => m[1]);
ok('the dispatcher declares POS verticals', files.length >= 10);
files.forEach((base) => {
  ['js', 'css'].forEach((ext) => {
    const rel = `assets/${base}.${ext}`;
    ok(`${rel} exists`, fs.existsSync(path.join(ROOT, rel)));
    ok(`${rel} is pre-cached`, sw.includes(`'/${rel}'`));
  });
});

const shell = [...sw.matchAll(/^\s*'(\/[^']+)'[,;]?/gm)].map((m) => m[1]);
shell.forEach((url) => ok(`${url} exists`, fs.existsSync(path.join(ROOT, url.split('?')[0].slice(1)))));

/* Une estampille ?v= n'a de valeur que si les deux côtés portent LA MÊME. La
   clé de cache est l'URL complète : si kiwi-sw.js pré-cache /assets/venues.js?v=2
   pendant que dashboard.html demande ?v=3, l'entrée pré-cachée ne répond jamais
   (plus de hors-ligne) ; si c'est l'inverse, le navigateur re-sert l'ancien
   fichier au premier chargement après un déploiement. C'est exactement comme ça
   que la carte « Passer à Ultra » retirée est revenue dans la barre latérale
   d'un commerçant alors que le code déployé, lui, était bon. */
const doc = read('dashboard.html');
shell.filter((url) => url.includes('?v=')).forEach((url) => {
  ok(`${url} carries the same ?v= stamp in dashboard.html`, doc.includes(`"assets/${url.slice(8)}"`));
});

if (failed.length) {
  failed.forEach((label) => console.error('  ✗ ' + label));
  process.exit(1);
}
console.log(`✓ ${passed} PWA shell checks green (${files.length} POS verticals complete offline)`);
