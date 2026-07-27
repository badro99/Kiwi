#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · GARDE-FOU des milliers en arabe (assets/rtl-numbers.js)
 * ---------------------------------------------------------------------------
 * Le module répare un vrai défaut : en arabe, « 31 500 MAD » s'affichait
 * « MAD 500 31 », parce qu'une espace ordinaire entre deux nombres prend la
 * direction du paragraphe et coupe le nombre en deux.
 *
 * Le risque du remède est le symétrique du mal : une règle trop gourmande
 * transformerait une plage de codes (« 0002 0015 »), une date, un numéro de
 * téléphone. Ce fichier tient les deux bouts — ce qui doit changer change, et
 * ce qui ne doit pas changer ne change pas.
 *
 * On charge le VRAI module, pas une copie de sa logique.
 * ═══════════════════════════════════════════════════════════════════════════ */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SRC = path.join(__dirname, '..', 'assets', 'rtl-numbers.js');

let pass = 0;
const fails = [];
const ok = (label, cond) => { if (cond) pass++; else fails.push(label); };
const eq = (label, got, want) => {
  if (got === want) pass++;
  else fails.push(`${label} — attendu ${JSON.stringify(want)}, obtenu ${JSON.stringify(got)}`);
};

/* Un DOM de poche : le module s'installe au chargement, on lui donne juste de
 * quoi ne pas trébucher. On ne teste ici que la transformation pure. */
const ctx = {
  window: {},
  document: {
    readyState: 'complete',
    documentElement: { getAttribute: () => null },
    body: null,
    addEventListener() {},
    createTreeWalker: () => ({ nextNode: () => null }),
  },
  NodeFilter: { SHOW_TEXT: 4 },
  MutationObserver: function () { this.observe = function () {}; },
  requestAnimationFrame: () => 0,
};
ctx.window.document = ctx.document;
ctx.window.KiwiRtlNumbers = undefined;
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(SRC, 'utf8'), ctx, { filename: 'rtl-numbers.js' });

const RN = ctx.window.KiwiRtlNumbers;
ok('le module s\'expose', !!(RN && typeof RN.fix === 'function'));

const NB = ' ';           /* U+00A0 : insécable, et exactement la largeur de l'espace ordinaire */
eq('le séparateur est bien l\'insécable de largeur normale', RN.SEP, NB);

/* ═══ 1 · ce qui doit être réparé ═══ */
{
  eq('un millier simple', RN.fix('31 500 MAD'), '31' + NB + '500 MAD');
  eq('un million, deux groupes', RN.fix('1 234 567'), '1' + NB + '234' + NB + '567');
  eq('le nombre au milieu d\'une phrase arabe',
    RN.fix('هدف اليوم · 31 500 MAD'), 'هدف اليوم · 31' + NB + '500 MAD');
  eq('plusieurs nombres dans la même ligne',
    RN.fix('1 240 MAD sur 31 500 MAD'), '1' + NB + '240 MAD sur 31' + NB + '500 MAD');
  eq('un nombre à décimales garde sa virgule',
    RN.fix('13 808,71'), '13' + NB + '808,71');
}

/* ═══ 2 · ce qui ne doit RIEN devenir ═══
 * Chaque ligne ici est une manière dont un correctif trop large abîmerait une
 * donnée juste. Ce sont ces cas-là qui décident si la règle part en production. */
{
  eq('la plage de codes de la caisse reste intacte', RN.fix('0002 0015'), '0002 0015');
  eq('une date en trois blocs reste intacte', RN.fix('28 07 2026'), '28 07 2026');
  eq('un numéro de téléphone reste intact', RN.fix('06 12 34 56 78'), '06 12 34 56 78');
  eq('quatre chiffres ne sont pas un groupe de milliers', RN.fix('12 3456'), '12 3456');
  eq('deux chiffres non plus', RN.fix('12 34'), '12 34');
  eq('une heure reste une heure', RN.fix('08:12'), '08:12');
  eq('un texte sans chiffre est rendu tel quel', RN.fix('Aucune vente'), 'Aucune vente');
  eq('un nombre déjà correct n\'est pas retouché',
    RN.fix('31' + NB + '500'), '31' + NB + '500');
}

/* ═══ 3 · la fonction ne casse pas sur les entrées limites ═══ */
{
  eq('null devient une chaîne vide', RN.fix(null), '');
  eq('undefined aussi', RN.fix(undefined), '');
  eq('un nombre est accepté', RN.fix(31500), '31500');
  eq('une chaîne vide reste vide', RN.fix(''), '');
}

/* ═══ 4 · la démo française n'est pas concernée ═══
 * Le module ne s'exécute que sur un document `dir="rtl"`. La garde ci-dessous
 * vérifie la promesse dans le code plutôt que dans un navigateur : sans arabe,
 * aucun balayage n'est déclenché. */
{
  const src = fs.readFileSync(SRC, 'utf8');
  ok('le balayage est conditionné à dir="rtl"', /getAttribute\('dir'\) === 'rtl'/.test(src));
  ok('les champs de saisie sont exclus', /TEXTAREA: 1, INPUT: 1/.test(src));
  ok('le contenu éditable est exclu', /isContentEditable/.test(src));
}

if (fails.length) {
  fails.forEach((f) => console.log('  ✗ ' + f));
  console.log(`  ✗ milliers en arabe : ${fails.length} échec(s) sur ${pass + fails.length}`);
  process.exit(1);
}
console.log(`  ✓ milliers en arabe (${pass} contrôles : réparation, non-régression des codes/dates/téléphones, démo intacte)`);
