#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · déplacer une estampille ?v= partout où elle vit, en une commande.
 *
 *   node tools/bump-stamp.js assets/venues.js assets/tokens.css
 *   node tools/bump-stamp.js --sync      (re-scelle le manifeste sans rien bumper)
 *   node tools/bump-stamp.js --all       (bump tout asset dont le contenu a bougé)
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
const targets = args.filter((a) => !a.startsWith('--')).map((a) => a.replace(/^\.\//, ''));

if (!SYNC_ONLY && !ALL && !targets.length) {
  console.error('usage: node tools/bump-stamp.js <assets/file.js …> | --sync | --all');
  process.exit(2);
}

const write = (rel, src) => fs.writeFileSync(path.join(S.ROOT, rel), src);
const touched = new Set();

/* Remplace l'estampille d'un asset dans un fichier donné, quel que soit le
   nombre d'occurrences. Renvoie le nombre de remplacements effectués. */
function replaceIn(rel, asset, next) {
  const before = S.read(rel);
  const esc = asset.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const after = before.replace(new RegExp(`(${esc})\\?v=[0-9]+`, 'g'), `$1?v=${next}`);
  if (after === before) return 0;
  write(rel, after);
  touched.add(rel);
  return (before.match(new RegExp(`${esc}\\?v=[0-9]+`, 'g')) || []).length;
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
  if (!entry) {
    console.warn(`  · ${asset} — aucune estampille trouvée (ni shell, ni SW, ni rev) ; rien à bumper`);
    return false;
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

let scanned = S.scan();
let bumped = 0;

if (SYNC_ONLY) {
  console.log('Ré-scellement du manifeste, sans bump.');
} else {
  const manifest = S.readManifest();
  let list = targets;
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
