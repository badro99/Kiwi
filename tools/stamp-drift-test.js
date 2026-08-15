#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · un asset modifié sans son estampille est une régression, pas un détail.
 *
 * `pwa-shell-test.js` vérifie déjà que les copies d'une MÊME estampille
 * s'accordent entre le shell et kiwi-sw.js. Il ne peut pas voir le bug le plus
 * fréquent du dépôt : avoir édité assets/foo.js et n'avoir bumpé nulle part.
 * Rien ne diverge alors — tout est cohérent, sur l'ANCIENNE URL. La page rend
 * 200, la console reste vide, et le navigateur qui revient exécute l'ancien
 * fichier au premier chargement après le déploiement (kiwi-sw.js sert en
 * stale-while-revalidate). Le correctif « ne marche pas », sans une erreur.
 *
 * D'où ce garde : `tools/asset-stamps.json` retient, pour chaque asset
 * estampillé, l'estampille ET le sha du contenu au moment où elle a été posée.
 * Le contenu bouge ⇒ l'estampille doit avoir bougé ⇒ le manifeste doit avoir
 * été re-scellé. Une seule commande fait les trois :
 *
 *     node tools/bump-stamp.js assets/foo.js
 * ─────────────────────────────────────────────────────────────────────────── */
'use strict';

const S = require('./stamps');

let passed = 0;
const failed = [];
const ok = (label, condition) => condition ? passed++ : failed.push(label);

const manifest = S.readManifest();
const scanned = S.scan();
const names = Object.keys(manifest);

ok('le manifeste des estampilles existe et n’est pas vide', names.length > 0);
if (!names.length) {
  console.error('  ✗ tools/asset-stamps.json est absent ou vide — `node tools/bump-stamp.js --sync`');
  process.exit(1);
}

/* 1 · le contenu a-t-il bougé sans que l'URL bouge ? */
for (const asset of names) {
  if (!S.exists(asset)) {
    failed.push(`${asset} est au manifeste mais absent du dépôt — \`node tools/bump-stamp.js --sync\``);
    continue;
  }
  const now = S.sha(asset);
  const was = manifest[asset];
  if (now === was.sha) { passed++; continue; }

  const entry = scanned.get(asset);
  const stamps = entry ? [...entry.stamps] : [];
  const moved = stamps.length && !stamps.includes(was.v);
  if (moved) {
    failed.push(`${asset} a été bumpé (?v=${was.v} → ?v=${stamps.join('/')}) mais tools/asset-stamps.json n’a pas été re-scellé — \`node tools/bump-stamp.js --sync\``);
  } else {
    failed.push(`${asset} a changé de contenu en gardant ?v=${was.v} — le navigateur qui revient exécutera l’ancien fichier · \`node tools/bump-stamp.js ${asset}\``);
  }
}

/* 2 · les copies d'une même estampille s'accordent-elles ?
   Redondant avec pwa-shell-test pour les entrées SHELL, mais celui-ci couvre
   aussi les assets estampillés dans un shell sans être pré-cachés. */
for (const [asset, entry] of scanned) {
  const stamps = [...entry.stamps];
  ok(`${asset} porte la même estampille partout`,
    stamps.length === 1 ||
    /* un rev de verticale POS peut légitimement différer du .css jumeau
       seulement si l'un des deux n'est pas estampillé ailleurs */
    stamps.length === 0);
  if (stamps.length > 1) {
    const sites = entry.sites.map((s) => `${s.file}:?v=${s.stamp}`).join(' · ');
    failed[failed.length - 1] = `${asset} porte des estampilles différentes selon le fichier — ${sites}`;
  }
}

/* 3 · un asset estampillé absent du manifeste = un trou dans la garde */
for (const asset of scanned.keys()) {
  if (!S.exists(asset)) continue;
  ok(`${asset} est couvert par le manifeste`, Object.prototype.hasOwnProperty.call(manifest, asset));
}

if (failed.length) {
  failed.forEach((l) => console.error('  ✗ ' + l));
  process.exit(1);
}
console.log(`✓ ${passed} contrôles d’estampille verts (${names.length} assets scellés)`);
