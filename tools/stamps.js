#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · où vit une estampille ?v=, et comment la retrouver partout.
 *
 * Module partagé par `bump-stamp.js` (qui déplace une estampille) et
 * `stamp-drift-test.js` (qui refuse un commit où le contenu a bougé mais pas
 * l'estampille). Aucune dépendance, aucun effet de bord : ce fichier ne fait
 * que lire et décrire.
 *
 * Une même estampille peut vivre dans TROIS endroits qui doivent tous
 * s'accorder — la clé de cache étant l'URL complète, un seul désaccord suffit
 * à casser le hors-ligne ou à re-servir l'ancien fichier :
 *
 *   1. la balise du shell        dashboard.html : assets/venues.js?v=7
 *   2. la liste SHELL du SW      kiwi-sw.js     : '/assets/venues.js?v=7'
 *   3. le champ rev du registre  pos-dispatch.js: rev: '7'  (verticales POS,
 *      où un seul rev pilote à la fois le .js et le .css du même métier)
 * ─────────────────────────────────────────────────────────────────────────── */
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');
const SW = 'kiwi-sw.js';
const DISPATCH = 'assets/pos-dispatch.js';
const MANIFEST = 'tools/asset-stamps.json';

const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const exists = (rel) => fs.existsSync(path.join(ROOT, rel));

/* Les coquilles applicatives : tout .html à la racine. On ne code pas en dur
   la liste des quatre PWA — un cinquième shell arriverait sinon sans garde. */
function shellDocs() {
  return fs.readdirSync(ROOT)
    .filter((f) => f.endsWith('.html'))
    .filter((f) => read(f).includes('?v='))
    .sort();
}

/* Le sha du contenu, tronqué : on compare des égalités, pas de la crypto. */
function sha(rel) {
  return crypto.createHash('sha256').update(fs.readFileSync(path.join(ROOT, rel))).digest('hex').slice(0, 16);
}

/* Le registre des verticales POS : { 'pressing-caisse': '11', … } — un rev par
   métier, qui couvre le .js ET le .css de ce métier. */
function dispatchRevs() {
  if (!exists(DISPATCH)) return {};
  const out = {};
  const src = read(DISPATCH);
  for (const m of src.matchAll(/file:\s*'([^']+)'\s*,\s*rev:\s*'([^']+)'/g)) out[m[1]] = m[2];
  return out;
}

/* Toutes les estampilles trouvables, indexées par chemin d'asset.
   → { 'assets/venues.js': { stamps: Set('7'), sites: [{file, stamp}], rev } } */
function scan() {
  const found = new Map();
  const note = (asset, stamp, site) => {
    if (!found.has(asset)) found.set(asset, { stamps: new Set(), sites: [] });
    const e = found.get(asset);
    e.stamps.add(stamp);
    e.sites.push(site);
  };

  for (const doc of shellDocs()) {
    const src = read(doc);
    for (const m of src.matchAll(/(assets\/[A-Za-z0-9._/-]+?\.(?:js|css))\?v=([0-9]+)/g)) {
      note(m[1], m[2], { file: doc, kind: 'shell', stamp: m[2] });
    }
  }

  if (exists(SW)) {
    const src = read(SW);
    for (const m of src.matchAll(/'\/(assets\/[A-Za-z0-9._/-]+?\.(?:js|css))\?v=([0-9]+)'/g)) {
      note(m[1], m[2], { file: SW, kind: 'sw', stamp: m[2] });
    }
  }

  const revs = dispatchRevs();
  for (const [base, rev] of Object.entries(revs)) {
    for (const ext of ['js', 'css']) {
      const asset = `assets/${base}.${ext}`;
      if (exists(asset)) note(asset, rev, { file: DISPATCH, kind: 'rev', stamp: rev, base });
    }
  }

  return found;
}

function manifestPath() { return path.join(ROOT, MANIFEST); }

function readManifest() {
  if (!fs.existsSync(manifestPath())) return {};
  try { return JSON.parse(fs.readFileSync(manifestPath(), 'utf8')); }
  catch (_) { return {}; }
}

/* Le manifeste : pour chaque asset estampillé, l'estampille et le sha du
   contenu au moment où elle a été posée. C'est la seule chose qui permette de
   dire « ce fichier a changé sans que son URL bouge ». */
function buildManifest() {
  const out = {};
  for (const [asset, e] of [...scan()].sort((a, b) => a[0].localeCompare(b[0]))) {
    if (!exists(asset)) continue;
    out[asset] = { v: [...e.stamps].sort((a, b) => Number(b) - Number(a))[0], sha: sha(asset) };
  }
  return out;
}

function writeManifest(m) {
  fs.writeFileSync(manifestPath(), JSON.stringify(m, null, 2) + '\n');
}

module.exports = { ROOT, SW, DISPATCH, MANIFEST, read, exists, sha, shellDocs, dispatchRevs, scan, readManifest, buildManifest, writeManifest };
