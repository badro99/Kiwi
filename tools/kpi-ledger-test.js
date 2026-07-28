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

/* ── 6. OÙ COMMENCE « AUJOURD'HUI » ────────────────────────────────────────
 * Le tableau de bord coupait la journée à minuit ; le rapport Z la coupe à la
 * bascule commerciale (5 h par défaut). Pour un restaurant qui ferme à 1 h du
 * matin, les ventes de 00 h–01 h étaient donc dans la recette du soir sur le Z
 * et dans le lendemain sur le tableau de bord — deux chiffres justes chacun de
 * leur côté, incomparables, et impossibles à départager pour le patron. */
const dFrom = SRC.indexOf('function dayCutoffH()');
const dTo = SRC.indexOf('function realSalesList()');
ok('la définition de la journée est extractible', dFrom > 0 && dTo > dFrom);
if (dFrom > 0 && dTo > dFrom) {
  const mk = (h) => new Function('window', SRC.slice(dFrom, dTo) + '\nreturn dayStartMs;')(
    { KiwiDayReport: h == null ? undefined : { cutoff: () => h } });

  // 12 mars 2026, 00 h 30 — une vente de fin de service.
  const nuit = new Date(2026, 2, 12, 0, 30).getTime();
  const veille5h = new Date(2026, 2, 11, 5, 0).getTime();
  ok('une vente à 00 h 30 appartient encore à la soirée de la veille',
    mk(5)(nuit) === veille5h, new Date(mk(5)(nuit)).toString());

  // …et une vente en plein service reste dans SA journée.
  const soir = new Date(2026, 2, 12, 21, 0).getTime();
  ok('une vente à 21 h appartient à la journée du jour',
    mk(5)(soir) === new Date(2026, 2, 12, 5, 0).getTime());

  // « Hier » reste exactement 24 h en amont — les bornes de plage en dépendent.
  ok('la veille reste à 24 h exactement',
    mk(5)(soir) - mk(5)(nuit) === 864e5, String(mk(5)(soir) - mk(5)(nuit)));

  // Sans module de rapport chargé : minuit, c'est-à-dire l'ancien comportement.
  ok('sans rapport journalier, on retombe sur minuit (comportement d\'avant)',
    mk(null)(nuit) === new Date(2026, 2, 12, 0, 0).getTime());
  ok('une bascule hors bornes est ignorée, pas propagée',
    mk(99)(nuit) === new Date(2026, 2, 12, 0, 0).getTime());
}

/* ── 7. UN TIRET, PAS UN ZÉRO ──────────────────────────────────────────────
 * Kiwi ne mesure ni les paiements refusés ni les retours. Le clone de démo
 * remis à zéro affichait pourtant « Taux succès 0,00 % » — qui ne se lit pas
 * « on ne sait pas » mais « aucun paiement n'aboutit », l'alarme la plus grave
 * qu'une caisse puisse afficher, sur une tuile qui ne mesure rien. */
['success', 'tauxRetour'].forEach((k) => {
  ok(`« ${k} » affiche un tiret chez un vrai commerçant, pas un zéro`,
    new RegExp(k + ":\\s*data\\." + k + "\\s*\\?[^\\n]*text: '—'").test(SRC),
    'la tuile retombe encore sur le zéro du clone de démonstration');
});

/* La règle vaut pour tout le module : plus aucune remise à minuit en dur dans
 * le calcul des plages de ventes réelles. */
ok('le calcul des plages ne remet plus l\'heure à zéro à la main',
  !/function dayStartMs\(t\) \{ const d = new Date\(t\); d\.setHours\(0/.test(SRC));

console.log('');
if (fails.length) {
  fails.forEach((f) => console.log('  ✗ ' + f));
  console.log(`\n✗ CA au grand livre : ${pass} ok, ${fails.length} échec(s)\n`);
  process.exit(1);
}
console.log(`  ✓ CA au grand livre (${pass} contrôles : total additionné, arrondi neutralisé, démo intacte, pas de comparaison inventée, plomberie, aucune tuile ne recompose, journée commerciale, tiret plutôt que zéro)\n`);
