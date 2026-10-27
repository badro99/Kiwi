#!/usr/bin/env node
'use strict';

/* Les phrases du comptoir qui portent une donnée. « Annulation de Tajine… »
 * (caisse-floor.js) et « Part égale + pourboire 10% » (caisse/split-tender.js)
 * changent à chaque ligne : sans gabarit, le balayage de caisse-lang.js les
 * laissait en français dans les trois langues, sans erreur. Ce test charge les
 * fichiers de code relevés ci-dessous, et vérifie les phrases une à une dans les
 * deux langues, la donnée du commerçant restant intacte. Les gabarits vivent
 * sur une ligne de assets/caisse-lang.js (serviceCopy), comme creditCopy. */

const fs = require('fs');
const vm = require('vm');
const path = require('path');
const root = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');

const store = new Map();
const el = () => ({
  style: {}, dataset: {}, classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
  attributes: [], childNodes: [], children: [],
  setAttribute() {}, getAttribute: () => null, hasAttribute: () => false, removeAttribute() {},
  appendChild() {}, insertBefore() {}, addEventListener() {},
  querySelector: () => null, querySelectorAll: () => [],
});
const document = {
  readyState: 'complete', documentElement: el(), body: Object.assign(el(), { classList: { toggle() {} } }), head: el(),
  createElement: el, getElementById: () => null, querySelector: () => null, querySelectorAll: () => [],
  addEventListener() {}, createTreeWalker: () => ({ nextNode: () => null }),
};
const window = { localStorage: { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) } };
const context = {
  window, document, localStorage: window.localStorage, console,
  MutationObserver: function () { this.observe = function () {}; this.disconnect = function () {}; },
  NodeFilter: { SHOW_TEXT: 4, SHOW_ELEMENT: 1 },
  WeakMap, Map, Set, Array, Object, String, Number, JSON, Math, RegExp,
  setTimeout: () => 0, clearTimeout: () => {}, requestAnimationFrame: () => 0,
};
vm.runInNewContext(read('assets/caisse-lang.js'), context, { filename: 'caisse-lang.js' });
const L = window.KiwiCaisseLang;

let failed = 0;
function check(ok, label) {
  if (!ok) { console.error('  ✗ ' + label); failed++; return; }
  console.log('  ✓ ' + label);
}

/* [français, anglais attendu, morceau arabe attendu] */
const CASES = [
  ['Annulation de Tajine…', 'Cancelling Tajine…', 'إلغاء Tajine'],
  ['Tajine annulé en cuisine', 'Tajine cancelled in the kitchen', 'Tajine'],
  ['Tajine ajouté·e à la file', 'Tajine added to the queue', 'الطابور'],
  ['Tajine retiré·e de la file', 'Tajine removed from the queue', 'الطابور'],
  ['Tajine · installé·e à T7', 'Tajine · seated at T7', 'T7'],
  ['Ajout table T7 · 2 articles', 'Added to table T7 · 2 items', 'الطاولة T7'],
  ['Article conservé · erreur réseau · touchez − pour réessayer', 'Item kept · Network error · tap − to retry', 'المس'],
  ['Bon de cuisine non imprimé', 'Kitchen ticket not printed', 'لم يُطبع'],
  ['3 bons de cuisine non imprimés', '3 kitchen tickets not printed', 'لم تُطبع'],
  ['Réimprimez depuis les réglages Imprimante.', 'Reprint from the Printer settings.', 'أعد الطباعة'],
  ['Part égale', 'Equal share', 'حصة متساوية'],
  ['Part égale + pourboire 10%', 'Equal share + 10% tip', 'بقشيش 10%'],
  ['Part équilibrée', 'Balanced share', 'حصة'],
  ['+ pourboire 15%', '+ 15% tip', 'بقشيش 15%'],
  ['Part 2', 'Share 2', 'الحصة 2'],
  ['Conv 3', 'Guest 3', 'ضيف 3'],
  ['Articles de Convive 2', 'Guest 2 items', 'الضيف 2'],
  ['3 articles à attribuer', '3 items to assign', 'للتوزيع'],
  ['1 article à attribuer', '1 item to assign', 'للتوزيع'],
  ['2 / 4 réglées', '2 / 4 paid', 'مسددة'],
];
const FRENCH_LEFT = /(annul|égale|pourboire|attribuer|réglées|convive|installé|ajouté|retiré|réessayer)/i;
for (const lang of ['en', 'ar']) {
  L.set(lang);
  for (const [fr, en, ar] of CASES) {
    const out = L.tr(fr);
    if (lang === 'en') check(out === en, `[en] « ${fr} » → ${out}`);
    else check(out.indexOf(ar) >= 0 && !FRENCH_LEFT.test(out.replace(/Tajine/g, '')), `[ar] « ${fr} » → ${out}`);
  }
}
/* Le nom du plat du commerçant n'entre jamais dans le dictionnaire. */
L.set('en');
check(L.tr('Annulation de Caftan Fassi…') === 'Cancelling Caftan Fassi…', 'un nom composé traverse entier');
L.set('fr');
check(L.tr('Annulation de Tajine…') === 'Annulation de Tajine…', 'en français la phrase reste telle quelle');

/* Chaque gabarit de toast écrit dans le code est couvert : si quelqu'un ajoute
   un `toast(\`…${x}…\`)` au service ou au partage, il doit l'ajouter au
   dictionnaire ou le dire ici. */
L.set('en');
const src = read('assets/caisse-floor.js') + '\n' + read('assets/caisse/split-tender.js');
const templates = [];
src.replace(/toast\(\s*`([^`]*)`/g, (_, t) => { if (t.includes('${')) templates.push(t); return ''; });
const simple = templates.filter((t) => !/\?|\bgl\b|globalThis|=>/.test(t));
check(simple.length >= 5, `${simple.length} gabarits de toast simples relevés dans le code`);
for (const t of simple) {
  const sample = t.replace(/\$\{[^}]*\}/g, 'Tajine');
  check(L.tr(sample) !== sample, `le toast « ${t} » se traduit`);
}

console.log(failed ? `\n${failed} échec(s)` : '\nOK');
process.exit(failed ? 1 : 0);
