#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · le chiffre d'affaires se LIT, il ne se reconstitue pas
 *
 *   node tools/kpi-ledger-test.js
 *
 * Le tableau de bord affichait un CA reconstitué : nombre de ventes × panier
 * moyen. Le panier moyen affiché est arrondi à l'entier — 37 ventes pour
 * 4 618 MAD donnent 124,81 qui s'affiche 125, et le CA sortait à 4 625. Sept
 * dirhams nés d'un arrondi d'affichage, et l'écart grandit avec le volume :
 * c'est le commerçant le plus occupé qui voit son tableau de bord s'éloigner
 * le plus de sa caisse. Cinq tuiles en dérivent (CA, CA/jour, bénéfice brut,
 * coût matière, pourboires), donc elles se décalaient TOUTES ENSEMBLE — rien à
 * l'écran ne pouvait le trahir, et seul un rapprochement avec le rouleau de
 * caisse le révélait.
 *
 * Ce que ce banc vérifie, et ce qu'il ne vérifie pas. Les tuiles KPI ne sont
 * pas exposées par le module (dateRange.js n'exporte que sa plage), donc on ne
 * rejoue pas le rendu. On extrait du VRAI fichier les quelques fonctions pures
 * qui portent l'arithmétique et on les évalue telles quelles : si quelqu'un
 * réécrit revOf, l'extraction échoue bruyamment au lieu de passer à côté. La
 * plomberie qui alimente `data.revenue` depuis les ventes réelles, elle, est
 * contrôlée sur la source — c'est une ligne, et une ligne supprimée est
 * exactement la régression qu'on craint.
 * ═══════════════════════════════════════════════════════════════════════════ */
'use strict';

const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const SRC = fs.readFileSync(path.join(ROOT, 'assets/dateRange.js'), 'utf8');

let pass = 0; const fails = [];
const ok = (label, cond, detail) => { if (cond) pass++; else fails.push(label + (detail ? ' — ' + detail : '')); };

/* ── on découpe l'arithmétique pure hors du module ─────────────────────────
 * De `const r1 =` jusqu'à `const KPI_CATALOG` : r1, withDelta, revOf, margeOf,
 * revDelta et leurs constantes. Aucune de ces lignes ne touche le DOM. */
const from = SRC.indexOf('const r1 = ');
const to = SRC.indexOf('const KPI_CATALOG');
ok('l\'arithmétique est extractible du module', from > 0 && to > from,
  `from=${from} to=${to}`);
if (from < 0 || to <= from) {
  console.log('  ✗ ' + fails.join('\n  ✗ '));
  console.log('\n✗ CA au grand livre : extraction impossible\n');
  process.exit(1);
}
const slice = SRC.slice(from, to);
let M;
try {
  M = new Function(slice + '\nreturn { revOf, revDelta, margeOf, withDelta, r1 };')();
} catch (e) {
  console.log('  ✗ l\'arithmétique extraite ne s\'évalue pas — ' + (e && e.message));
  process.exit(1);
}

/* ── 1. LE CAS QUI FAISAIT L'ÉCART ─────────────────────────────────────────
 * 37 ventes, 4 618 MAD. Panier réel 124,81 ; panier AFFICHÉ 125. */
const REAL = { tx: { value: 37, delta: 5 },
               panier: { value: 125, delta: 2 },          // déjà arrondi, comme à l'écran
               revenue: { value: 4618, delta: 7.3 } };

ok('le CA affiché est le total additionné, pas le produit',
  M.revOf(REAL) === 4618, 'obtenu ' + M.revOf(REAL));
ok('…et il n\'est PAS le produit arrondi qu\'on affichait avant',
  M.revOf(REAL) !== REAL.tx.value * REAL.panier.value,
  'produit = ' + REAL.tx.value * REAL.panier.value);
ok('la variation du CA est celle des ventes, pas une somme d\'à-peu-près',
  M.revDelta(REAL) === 7.3, 'obtenu ' + M.revDelta(REAL));

/* L'écart exact que voyait le commerçant en rapprochant sa caisse. */
const ecart = REAL.tx.value * REAL.panier.value - 4618;
ok('l\'ancien calcul se trompait bien de 7 MAD sur ce panier', ecart === 7, 'écart=' + ecart);

/* ── 2. LA DÉMO NE BOUGE PAS ───────────────────────────────────────────────
 * Aucune période de démonstration ne porte de clé `revenue` : elle continue de
 * passer par le produit, avec des paniers déjà entiers. */
const DEMO = { tx: { value: 182, delta: 15.2 }, panier: { value: 134, delta: 1.5 } };
ok('sans total réel, on retombe sur le produit (démo inchangée)',
  M.revOf(DEMO) === 182 * 134, 'obtenu ' + M.revOf(DEMO));
ok('…et sur l\'ancienne approximation de variation',
  M.revDelta(DEMO) === 16.7, 'obtenu ' + M.revDelta(DEMO));

/* Un littéral chiffré — c'est la forme des jeux de démonstration. Le chemin
   réel, lui, écrit `value: t.revenue`, qui vient des ventes. */
ok('aucune période de démonstration ne déclare de CA en dur',
  !/^\s{6,}revenue:\s*\{\s*value:\s*\d/m.test(SRC),
  'une clé revenue: { value: <nombre> } traîne dans les jeux de démonstration');

/* ── 3. PAS DE COMPARAISON INVENTÉE ────────────────────────────────────────
 * Une composante absente ⇒ aucune comparaison. `null + null` vaut 0 en JS, ce
 * qui ressusciterait le « 0 % » que le null existe pour taire. */
ok('sans baseline, pas de variation du tout',
  M.revDelta({ tx: { value: 10, delta: null }, panier: { value: 20, delta: 3 } }) === null);
ok('un CA réel sans baseline ne fabrique pas 0 %',
  M.revDelta({ tx: { value: 10, delta: 4 }, panier: { value: 20, delta: 3 },
               revenue: { value: 200, delta: null } }) === 7,
  'faute de variation réelle, on retombe sur l\'approximation');

/* ── 4. LA PLOMBERIE ───────────────────────────────────────────────────────
 * Le total exact existait déjà dans realSalesTotals() et n'était transmis à
 * personne. Ces trois lignes sont ce qui l'amène jusqu'aux tuiles. */
ok('realSalesTotals additionne bien un revenu',
  /return \{ revenue, count, basket:/.test(SRC));
ok('le chemin réel transmet ce total sous `revenue`',
  /revenue:\s*\{\s*value:\s*t\.revenue,/.test(SRC),
  'data.revenue n\'est plus alimenté depuis les ventes');
ok('sa comparaison survit au nettoyage des deltas hérités de la démo',
  /REAL_DELTAS = new Set\(\[[^\]]*'revenue'/.test(SRC));

/* ── 5. PLUS AUCUNE TUILE NE RECOMBINE ventes × panier ─────────────────────
 * C'est la règle qui empêche la panne de revenir par une sixième tuile ajoutée
 * plus tard : tout ce qui dérive du CA passe par revDelta(). */
const KPI = SRC.slice(to);
ok('aucune tuile ne recompose la variation du CA à la main',
  !/withDelta\(\[d\.tx\.delta,\s*d\.panier\.delta/.test(KPI),
  'une tuile additionne encore les variations de ventes et de panier');
['revenue', 'revPerDay', 'profit', 'cogs', 'tips'].forEach((k) => {
  const m = new RegExp('\\n\\s*' + k + ':\\s*\\{[\\s\\S]*?\\n(?=\\s*[a-zA-Z]+:\\s*\\{)').exec(KPI);
  ok(`la tuile « ${k} » passe par revDelta`, !!m && /revDelta\(d\)/.test(m[0]),
    m ? 'trouvée, mais sans revDelta' : 'tuile introuvable');
});

console.log('');
if (fails.length) {
  fails.forEach((f) => console.log('  ✗ ' + f));
  console.log(`\n✗ CA au grand livre : ${pass} ok, ${fails.length} échec(s)\n`);
  process.exit(1);
}
console.log(`  ✓ CA au grand livre (${pass} contrôles : total additionné, arrondi neutralisé, démo intacte, pas de comparaison inventée, plomberie, aucune tuile ne recompose)\n`);
