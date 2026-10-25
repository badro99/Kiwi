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

/* Les listes de fichiers de app/src/ copiés à la racine du bundle natif vivent
   dans UN fichier de données, lu aussi par tools/build-app-www.mjs. Il n'est
   pas importé du build (un module ES, que ce fichier CommonJS synchrone ne peut
   pas charger) : c'est du JSON, donc aucun des deux outils n'en garde de copie. */
const BUNDLE = require('./app-bundle-manifest.json');

/* KIWI_STAMPS_ROOT : racine de remplacement pour les tests (un arbre jetable
   avec ses propres shells, SW et manifeste). Jamais en usage normal. */
const ROOT = process.env.KIWI_STAMPS_ROOT ? path.resolve(process.env.KIWI_STAMPS_ROOT) : path.resolve(__dirname, '..');
const SW = 'kiwi-sw.js';
const DISPATCH = 'assets/pos-dispatch.js';
const MANIFEST = 'tools/asset-stamps.json';

const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const exists = (rel) => fs.existsSync(path.join(ROOT, rel));

/* Les coquilles applicatives : tout .html à la racine et les landings localisées. On ne code pas en dur
   la liste des quatre PWA — un cinquième shell arriverait sinon sans garde. */
function shellDocs() {
  const roots = fs.readdirSync(ROOT).filter(f => f.endsWith('.html'));
  const landings = ['fr', 'en', 'ar', 'de', 'it', 'nl', 'es']
    .map(locale => `${locale}/index.html`).filter(exists);
  return [...roots, ...landings].sort();
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

/* Les types d'asset estampillés : les scripts, les feuilles, et (étape 1 du
   design 2027, §21.3) les fontes, pour qu'un woff2 se bumpe comme un script.
   §21.3 ajoute aussi `svg`, mais SEULEMENT les sprites d'icônes
   (assets/icons/material/sprite.<surface>.svg, étape 2) : un `svg` générique
   ferait voir au scanner assets/kiwi-favicon-new.svg, déjà estampillé à ?v=3
   dans la caisse et ?v=2 dans la salle, et le seul moyen de les accorder avec
   bump-stamp réécrirait ~25 pages sans rapport. */
const ASSET_EXT = '(?:js|css|woff2)';
const ASSET_PATH = `assets\\/(?:[A-Za-z0-9._/-]+?\\.${ASSET_EXT}|icons\\/material\\/sprite\\.[a-z0-9]+\\.svg)`;
const SHELL_RE = () => new RegExp(`(${ASSET_PATH})\\?v=([0-9]+)`, 'g');
const SW_RE = () => new RegExp(`'\\/(${ASSET_PATH})\\?v=([0-9]+)'`, 'g');

/* Les pages HTML qui ne sont pas des coquilles applicatives (guides, pages
   légales, landings Next, modèles, fixtures d'outils) mais qui chargent des
   fontes auto-hébergées : assets/fonts/legacy-faces.css, lié sur toutes les
   pages que tools/plex-census.mjs classe (1), (2) ou (4). On ne regarde que
   assets/fonts/ dans ces pages : leurs autres estampilles (article.css, …) ne
   sont pas à la charge de cet outil. L'arbre est parcouru sur le disque, parce
   que la racine de remplacement des tests n'est pas un dépôt. */
const WALK_SKIP = new Set(['node_modules', '.git', 'graphify-out', '.claude', '.kiwi', 'www', 'ios', 'android', 'Pods']);
const STALE_COPY = / \d+\.[A-Za-z0-9]+$/;
let fontPagesCache = null;
function fontPages() {
  if (fontPagesCache && fontPagesCache.root === ROOT) return fontPagesCache.list;
  const shells = new Set(shellDocs());
  const out = [];
  (function walk(rel) {
    for (const ent of fs.readdirSync(path.join(ROOT, rel), { withFileTypes: true })) {
      if (ent.isDirectory()) {
        if (WALK_SKIP.has(ent.name)) continue;
        walk(rel ? `${rel}/${ent.name}` : ent.name);
      } else if (ent.name.endsWith('.html') && !STALE_COPY.test(ent.name)) {
        const f = rel ? `${rel}/${ent.name}` : ent.name;
        if (shells.has(f)) continue;
        if (fs.readFileSync(path.join(ROOT, f), 'utf8').includes('assets/fonts/')) out.push(f);
      }
    }
  })('');
  fontPagesCache = { root: ROOT, list: out.sort() };
  return fontPagesCache.list;
}
/* À rappeler quand un run vient d'écrire une première référence. */
function resetFontPages() { fontPagesCache = null; }

/* Les feuilles de style dont les url() portent une estampille (§21.3, « CSS
   sites »). Chaque url() se résout contre le dossier d'où la feuille est SERVIE,
   pas celui où elle est écrite : c'est ce qui fait que `../fonts/x.woff2` dans
   assets/kit/ et `assets/fonts/x.woff2` dans native-runtime.css sont une seule
   clé, avec une seule estampille.

     assets/kit/*.css                     servi depuis assets/kit/   (là où il est)
     assets/fonts/*.css                   servi depuis assets/fonts/ (là où il est)
     app/src/native-{runtime,shell}.css   servis à la racine du bundle (www/) :
                                          app/src/ n'existe pas pour l'app

   Une url() qui sort de l'arbre servi fait échouer le scan : un chemin faux ne
   peut pas passer pour une clé. */
function cssFiles() {
  const files = [];
  for (const dir of ['assets/kit', 'assets/fonts']) {
    if (!exists(dir)) continue;
    for (const f of fs.readdirSync(path.join(ROOT, dir))) {
      if (f.endsWith('.css') && !STALE_COPY.test(f)) files.push({ file: `${dir}/${f}`, served: `${dir}/` });
    }
  }
  for (const name of BUNDLE.nativeRuntime.concat(BUNDLE.shell)) {
    if (!name.endsWith('.css')) continue;
    const file = BUNDLE.servedAtRoot + name;
    if (exists(file)) files.push({ file, served: '' });
  }
  return files;
}

/* Résout `ref` (tel qu'écrit dans la feuille) contre le dossier servi. Renvoie
   null pour ce qui n'est pas un fichier local (data:, http:, //, #, absolu). */
function resolveServed(served, ref, file) {
  if (/^(?:[a-z][a-z0-9+.-]*:|\/\/|#|\/)/i.test(ref)) return null;
  const out = path.posix.normalize(path.posix.join(served || '.', ref));
  if (out.startsWith('../') || out === '..') {
    throw new Error(`${file} : url("${ref}") sort de l'arbre servi (${served || 'racine du bundle'})`);
  }
  return out;
}

const CSS_URL_RE = /url\(\s*(["']?)([^"')\s]+?)\1\s*\)/g;
/* → [{file, written, key, stamp|null}] pour chaque url() locale d'un asset estampillable. */
function cssRefs() {
  const refs = [];
  for (const { file, served } of cssFiles()) {
    const src = read(file);
    for (const m of src.matchAll(CSS_URL_RE)) {
      const q = m[2].match(/^([^?#]+)(?:\?v=([0-9]+))?$/);
      if (!q) continue;
      const key = resolveServed(served, q[1], file);
      if (!key || !new RegExp(`\\.${ASSET_EXT}$`).test(key)) continue;
      refs.push({ file, written: q[1], key, stamp: q[2] || null });
    }
  }
  return refs;
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
    for (const m of src.matchAll(SHELL_RE())) {
      note(m[1], m[2], { file: doc, kind: 'shell', stamp: m[2] });
    }
  }

  for (const doc of fontPages()) {
    for (const m of read(doc).matchAll(SHELL_RE())) {
      if (m[1].startsWith('assets/fonts/')) note(m[1], m[2], { file: doc, kind: 'shell', stamp: m[2] });
    }
  }

  if (exists(SW)) {
    const src = read(SW);
    for (const m of src.matchAll(SW_RE())) {
      note(m[1], m[2], { file: SW, kind: 'sw', stamp: m[2] });
    }
  }

  for (const r of cssRefs()) {
    if (r.stamp) note(r.key, r.stamp, { file: r.file, kind: 'css', stamp: r.stamp, written: r.written });
  }

  // Literal first-use URLs in pages-pro's lazy registry (also cascade-bumped).
  if (exists('assets/pages-pro.js')) {
    for (const m of read('assets/pages-pro.js').matchAll(/'(assets\/(?:pages-pro|pages)\/[^']+\.js)\?v=([0-9]+)'/g)) {
      note(m[1], m[2], { file: 'assets/pages-pro.js', kind: 'lazy', stamp: m[2] });
    }
  }

  if (exists('assets/pages/dashboard-loader.js')) {
    for (const m of read('assets/pages/dashboard-loader.js').matchAll(SHELL_RE()))
      note(m[1], m[2], { file: 'assets/pages/dashboard-loader.js', kind: 'lazy', stamp: m[2] });
  }

  // Interface imprimante, chargée à la demande et préchauffée au repos.
  if (exists('assets/printer-bridge.js')) {
    for (const m of read('assets/printer-bridge.js').matchAll(SHELL_RE()))
      note(m[1], m[2], { file: 'assets/printer-bridge.js', kind: 'lazy', stamp: m[2] });
  }

  // Données de l'assistant d'installation, chargées au repos par onboarding.js.
  if (exists('assets/onboarding.js')) {
    for (const m of read('assets/onboarding.js').matchAll(SHELL_RE()))
      note(m[1], m[2], { file: 'assets/onboarding.js', kind: 'lazy', stamp: m[2] });
  }

  // Parties privées du stock, chargées au premier geste.
  if (exists('assets/stock.js')) {
    for (const m of read('assets/stock.js').matchAll(SHELL_RE()))
      note(m[1], m[2], { file: 'assets/stock.js', kind: 'lazy', stamp: m[2] });
  }

  // Demandes des services de l'économat, chargées à la première visite.
  if (exists('assets/hotel-economat.js')) {
    for (const m of read('assets/hotel-economat.js').matchAll(SHELL_RE()))
      note(m[1], m[2], { file: 'assets/hotel-economat.js', kind: 'lazy', stamp: m[2] });
  }

  // Le rapport différé partage l'URL estampillée du preload.
  if (exists('assets/dashboard-extra.js')) {
    for (const m of read('assets/dashboard-extra.js').matchAll(SHELL_RE()))
      note(m[1], m[2], { file: 'assets/dashboard-extra.js', kind: 'lazy', stamp: m[2] });
  }

  // Retail modules share live bindings; every import URL is a stamp site.
  const retail = ['assets/pos-maison.js', 'assets/pos-boutique.js'];
  for (const dir of ['assets/pos-maison', 'assets/pos-boutique']) {
    if (exists(dir)) retail.push(...fs.readdirSync(path.join(ROOT, dir)).filter(f => f.endsWith('.js')).map(f => dir + '/' + f));
  }
  for (const file of retail.filter(exists)) {
    for (const m of read(file).matchAll(/from\s+'(\.\.?\/[^']+\.js)\?v=([0-9]+)'/g)) {
      const asset = path.posix.normalize(path.posix.join(path.posix.dirname(file), m[1]));
      note(asset, m[2], { file, kind: 'module', stamp: m[2] });
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

/* Fichiers qui referencent un asset, estampille ou non. `scan()` ne voit que
   les URLs qui ont deja un ?v= ; bump-stamp en a aussi besoin pour poser la
   toute premiere estampille sans modifier a la main les shells et le SW. */
function referenceFiles(asset) {
  const files = [];
  for (const doc of shellDocs()) {
    if (read(doc).includes(asset)) files.push(doc);
  }
  if (asset.startsWith('assets/fonts/')) {
    for (const doc of fontPages()) {
      if (read(doc).includes(asset)) files.push(doc);
    }
  }
  if (exists('assets/pages/dashboard-loader.js') && read('assets/pages/dashboard-loader.js').includes(asset + '?v=')) files.push('assets/pages/dashboard-loader.js');
  if (exists('assets/pages-pro.js') && read('assets/pages-pro.js').includes(asset + '?v=')) files.push('assets/pages-pro.js');
  if (exists('assets/dashboard-extra.js') && read('assets/dashboard-extra.js').includes(asset + '?v=')) files.push('assets/dashboard-extra.js');
  if (exists('assets/stock.js') && read('assets/stock.js').includes(asset + '?v=')) files.push('assets/stock.js');
  if (exists('assets/printer-bridge.js') && read('assets/printer-bridge.js').includes(asset + '?v=')) files.push('assets/printer-bridge.js');
  if (exists('assets/onboarding.js') && read('assets/onboarding.js').includes(asset + '?v=')) files.push('assets/onboarding.js');
  if (exists('assets/hotel-economat.js') && read('assets/hotel-economat.js').includes(asset + '?v=')) files.push('assets/hotel-economat.js');
  if (exists(SW) && read(SW).includes(`/${asset}`)) files.push(SW);
  return files;
}

/* Les url() de feuilles qui nomment `asset`, estampillées ou non. */
function cssReferences(asset) {
  return cssRefs().filter((r) => r.key === asset);
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

module.exports = { ROOT, SW, DISPATCH, MANIFEST, BUNDLE, read, exists, sha, shellDocs, fontPages, resetFontPages, cssFiles, cssRefs, cssReferences, dispatchRevs, scan, referenceFiles, readManifest, buildManifest, writeManifest };
