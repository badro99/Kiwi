#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · déplacer une estampille ?v= partout où elle vit, en une commande.
 *
 *   node tools/bump-stamp.js assets/venues.js assets/tokens.css
 *   node tools/bump-stamp.js --sync      (re-scelle le manifeste sans rien bumper)
 *   node tools/bump-stamp.js --all       (bump tout asset dont le contenu a bougé)
 *   node tools/bump-stamp.js --sw        (avance la génération du service worker :
 *                                         CACHE de kiwi-sw.js + register() des trois
 *                                         bootstraps, puis leurs propres estampilles)
 *
 * Pourquoi un outil pour ça. L'estampille vit dans jusqu'à trois fichiers (la
 * balise du shell, la liste SHELL de kiwi-sw.js, le champ rev de
 * pos-dispatch.js) et n'en bumper QUE certains est pire que n'en bumper aucun :
 * la clé de cache est l'URL complète, donc une entrée pré-cachée en ?v=4 ne
 * répond jamais à une balise qui demande ?v=5 — le hors-ligne tombe sans une
 * seule erreur en console. Fait à la main, l'oubli est arrivé assez souvent
 * pour qu'une carte « Passer à Ultra » retirée revienne chez un commerçant.
 * ─────────────────────────────────────────────────────────────────────────── */
'use strict';

const fs = require('fs');
const path = require('path');
const S = require('./stamps');

const args = process.argv.slice(2);
const SYNC_ONLY = args.includes('--sync');
const ALL = args.includes('--all');
const SW_GEN = args.includes('--sw');
const targets = args.filter((a) => !a.startsWith('--')).map((a) => a.replace(/^\.\//, ''));

if (!SYNC_ONLY && !ALL && !SW_GEN && !targets.length) {
  console.error('usage: node tools/bump-stamp.js <assets/file.js …> | --sync | --all | --sw');
  process.exit(2);
}

const write = (rel, src) => fs.writeFileSync(path.join(S.ROOT, rel), src);
const touched = new Set();

/* Remplace l'estampille d'un asset dans un fichier donné, quel que soit le
   nombre d'occurrences. Renvoie le nombre de remplacements effectués. */
function replaceIn(rel, asset, next) {
  const before = S.read(rel);
  const esc = asset.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  let hits = 0;
  let after = before.replace(new RegExp(`(${esc})\\?v=[0-9]+`, 'g'), (_, ref) => {
    hits++;
    return `${ref}?v=${next}`;
  });
  /* Premiere estampille : une URL nue dans un attribut de shell ou dans la
     liste SHELL du service worker devient ?v=1. On ne cree aucune nouvelle
     appartenance au precache ; on versionne seulement les references qui
     existent deja. */
  after = after.replace(new RegExp(`((?:src|href)=["']${esc})(["'])`, 'g'), (_, ref, quote) => {
    hits++;
    return `${ref}?v=${next}${quote}`;
  });
  after = after.replace(new RegExp(`(["']\\/${esc})(["'])`, 'g'), (_, ref, quote) => {
    hits++;
    return `${ref}?v=${next}${quote}`;
  });
  if (after === before) return 0;
  write(rel, after);
  touched.add(rel);
  return hits;
}

/* Le rev d'une verticale POS pilote à la fois son .js et son .css : on le
   déplace une fois, jamais deux. */
function replaceRev(base, next) {
  const before = S.read(S.DISPATCH);
  const after = before.replace(
    new RegExp(`(file:\\s*'${base}'\\s*,\\s*rev:\\s*')[0-9]+(')`),
    `$1${next}$2`
  );
  if (after === before) return false;
  write(S.DISPATCH, after);
  touched.add(S.DISPATCH);
  return true;
}

function bump(asset, scanned) {
  const entry = scanned.get(asset);
  const referenced = S.referenceFiles(asset);
  if (!entry) {
    if (!referenced.length) {
      console.warn(`  · ${asset} — aucune reference trouvee (ni shell, ni SW, ni rev) ; rien a bumper`);
      return false;
    }
    const next = '1';
    let hits = 0;
    for (const file of referenced) hits += replaceIn(file, asset, next);
    if (!hits) {
      console.warn(`  · ${asset} — references trouvees mais aucune URL de shell/SW modifiable ; rien a bumper`);
      return false;
    }
    console.log(`  ✓ ${asset}  premiere estampille ?v=${next}   ${hits} occurrence(s) dans ${referenced.join(', ')}`);
    return true;
  }
  const revSite = entry.sites.find((s) => s.kind === 'rev');
  /* Une verticale POS n'a QU'UN rev pour son .js ET son .css. Les bumper l'un
     après l'autre laissait le premier en arrière : le second lisait le rev déjà
     avancé, sautait encore d'un cran, et n'écrivait ce nouveau numéro que dans
     SES fichiers — d'où un .js à ?v=6 face à un rev à 7, et un gate rouge.
     Un rev partagé se déplace donc en bloc : on bouge l'asset demandé ET ses
     frères de rev, vers le même numéro. */
  const siblings = revSite
    ? [...scanned.entries()]
        .filter(([a, e]) => a !== asset && e.sites.some((s) => s.kind === 'rev' && s.base === revSite.base))
        .map(([a, e]) => ({ asset: a, entry: e }))
    : [];
  /* Le numéro de départ tient compte des frères, sinon un bloc déjà à moitié
     avancé repartirait en arrière. */
  const allStamps = [...entry.stamps].concat(...siblings.map((s) => [...s.entry.stamps]));
  const current = Math.max(...allStamps.map(Number));
  const next = String(current + 1);
  const files = new Set(entry.sites.filter((s) => s.kind !== 'rev').map((s) => s.file));
  for (const file of referenced) files.add(file);

  let hits = 0;
  for (const f of files) hits += replaceIn(f, asset, next);
  for (const sib of siblings) {
    for (const s of sib.entry.sites) {
      if (s.kind !== 'rev') hits += replaceIn(s.file, sib.asset, next);
    }
  }
  if (revSite && replaceRev(revSite.base, next)) hits++;

  const where = [...files].concat(siblings.map((s) => s.asset)).concat(revSite ? [`${S.DISPATCH} (rev ${revSite.base})`] : []);
  console.log(`  ✓ ${asset}  ?v=${current} → ?v=${next}   ${hits} occurrence(s) dans ${where.join(', ')}`);
  return true;
}

/* La génération du service worker vit dans QUATRE fichiers : `CACHE` dans
   kiwi-sw.js et `register('/kiwi-sw.js?v=N')` dans les trois bootstraps PWA.
   Les bootstraps changent donc de contenu, et leur propre estampille ?v= doit
   suivre — c'est la cascade « une génération = ~10 fichiers » que l'on faisait
   à la main, et que l'on oubliait à moitié. Renvoie la liste des bootstraps
   touchés pour que le flux normal les bumpe ensuite. */
const SW_BOOTSTRAPS = ['assets/dashboard-pwa.js', 'assets/caisse-pwa.js', 'assets/employee-live.js'];
function bumpSwGeneration() {
  if (!S.exists(S.SW)) { console.error(`  ✗ ${S.SW} introuvable`); process.exit(2); }
  const sw = S.read(S.SW);
  const m = sw.match(/CACHE = 'kiwi-app-v([0-9]+)'/);
  if (!m) { console.error(`  ✗ ${S.SW} : génération introuvable (attendu CACHE = 'kiwi-app-vN')`); process.exit(2); }
  const current = Number(m[1]);
  const next = current + 1;
  write(S.SW, sw.replace(/CACHE = 'kiwi-app-v[0-9]+'/, `CACHE = 'kiwi-app-v${next}'`));
  touched.add(S.SW);
  const moved = [];
  for (const b of SW_BOOTSTRAPS) {
    if (!S.exists(b)) continue;
    const before = S.read(b);
    const after = before.replace(/\/kiwi-sw\.js\?v=[0-9]+/g, `/kiwi-sw.js?v=${next}`);
    if (after === before) { console.warn(`  · ${b} — aucun register('/kiwi-sw.js?v=N') trouvé`); continue; }
    write(b, after); touched.add(b); moved.push(b);
  }
  console.log(`  ✓ génération du service worker  kiwi-app-v${current} → v${next}   (${S.SW} + ${moved.length} bootstrap(s))`);
  return moved;
}

let scanned = S.scan();
let bumped = 0;

if (SYNC_ONLY) {
  console.log('Ré-scellement du manifeste, sans bump.');
} else {
  const manifest = S.readManifest();
  let list = targets;
  if (SW_GEN) {
    /* Les bootstraps viennent d'être réécrits : leurs estampilles passent dans
       le flux normal, après celles demandées explicitement, sans doublon. */
    for (const b of bumpSwGeneration()) if (!list.includes(b)) list.push(b);
  }
  if (ALL) {
    list = [...scanned.keys()].filter((a) => S.exists(a) && manifest[a] && manifest[a].sha !== S.sha(a));
    if (!list.length) console.log('Aucun asset estampillé n’a changé de contenu — rien à bumper.');
  }
  for (const asset of list) {
    if (!S.exists(asset)) { console.warn(`  · ${asset} — fichier introuvable, ignoré`); continue; }
    /* Une verticale POS partage son rev entre .js et .css : si les deux sont
       demandés, le second bump annulerait le premier. On re-scanne à chaque
       fois pour lire l'état réel plutôt que l'état d'il y a une ligne. */
    if (bump(asset, scanned)) { bumped++; scanned = S.scan(); }
  }
}

S.writeManifest(S.buildManifest());
touched.add(S.MANIFEST);

console.log(`\n${bumped} estampille(s) déplacée(s) · ${touched.size} fichier(s) touché(s) :`);
[...touched].sort().forEach((f) => console.log(`  ${f}`));
console.log('\nPense à `node tools/check.js` avant de committer.');
