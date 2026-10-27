#!/usr/bin/env node
/* Le partage d'addition parle la langue de la personne qui le lit (vague 13, T).
 *
 *   1. Ticket imprimé : « Table 5 · part 2 » et « À emporter · part 1 » sont
 *      enregistrés en français (la comptabilité et le flux serveur reconnaissent
 *      « · part N »), mais le papier les dit dans sa langue. Le français reste
 *      octet pour octet ce qu'il était.
 *   2. Écran du comptoir : « Part égale », « Part égale + pourboire 10% » et
 *      « Part équilibrée » (assets/caisse/split-tender.js) passent par le
 *      dictionnaire du comptoir ; le nom d'une part faite d'articles, qui est
 *      un mot du commerçant, ne passe jamais par lui.
 *   3. App serveur : chaque toast de paiement d'assets/serveur/payments.js choisit
 *      sa phrase à la source (employeePick) en français, anglais et arabe, sans
 *      un mot de français dans les deux autres, et dit la même chose que les
 *      motifs de assets/serveur-lang.js quand ceux-ci la connaissent. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const ts = require('../app/node_modules/typescript');
const read = (f) => fs.readFileSync(f, 'utf8');
let checks = 0;
const eq = (a, b, m) => { assert.equal(a, b, m); checks++; };
const ok = (v, m) => { assert.ok(v, m); checks++; };

/* ── 1 · le ticket ─────────────────────────────────────────────── */
function receiptLabel(lang, label) {
  const document = { readyState: 'loading', addEventListener() {}, getElementById() { return null; } };
  const window = { document, KiwiCaisseLang: { get: () => lang } };
  const ctx = vm.createContext({
    window, document, console, Date, Promise, Uint8Array,
    localStorage: { length: 0, getItem() { return null; }, setItem() {}, key() { return null; }, removeItem() {} },
    sessionStorage: { getItem() { return null; }, setItem() {} },
    setTimeout() { return 0; }, clearTimeout() {},
  });
  vm.runInContext(read('assets/receipt.js'), ctx);
  const R = window.KiwiReceipt;
  const doc = R.build({ ref: 'T-1', ts: Date.now(), total: 40, method: 'cash', label, lines: [{ name: 'Tajine', qty: 1, total: 40 }] },
    { config: R.blankConfig(), business: { name: 'Café', legal: {} } });
  return doc.meta.label;
}
const SPLIT = [
  ['Table 5 · part 2', 'Table 5 · part 2', 'Table 5 · share 2', 'Table 5 · جزء 2'],
  ['À emporter · part 1', 'À emporter · part 1', 'Takeaway · share 1', 'للأخذ · جزء 1'],
  ['À emporter #12 · part 3', 'À emporter #12 · part 3', 'Takeaway #12 · share 3', 'للأخذ #12 · جزء 3'],
];
for (const [label, fr, en, ar] of SPLIT) {
  eq(receiptLabel('fr', label), fr, 'FR inchangé : ' + label);
  eq(receiptLabel('en', label), en, 'EN : ' + label);
  eq(receiptLabel('ar', label), ar, 'AR : ' + label);
}
for (const lang of ['fr', 'en', 'ar']) {
  eq(receiptLabel(lang, 'Vente'), 'Vente', 'un libellé sans part reste tel quel');
  eq(receiptLabel(lang, 'Table 5 · offerte'), 'Table 5 · offerte', 'une autre mention reste telle quelle');
}

/* ── 2 · l'écran du comptoir ───────────────────────────────────── */
const store = new Map();
const el = () => ({
  style: {}, dataset: {}, classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
  attributes: [], childNodes: [], children: [], setAttribute() {}, getAttribute: () => null, hasAttribute: () => false,
  removeAttribute() {}, appendChild() {}, insertBefore() {}, addEventListener() {}, querySelector: () => null, querySelectorAll: () => [],
});
const tillDoc = {
  readyState: 'complete', documentElement: el(), body: Object.assign(el(), { classList: { toggle() {} } }), head: el(),
  createElement: el, getElementById: () => null, querySelector: () => null, querySelectorAll: () => [],
  addEventListener() {}, createTreeWalker: () => ({ nextNode: () => null }),
};
const tillWindow = { localStorage: { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) } };
const tillCtx = vm.createContext({
  window: tillWindow, document: tillDoc, localStorage: tillWindow.localStorage, console,
  MutationObserver: function () { this.observe = function () {}; this.disconnect = function () {}; },
  NodeFilter: { SHOW_TEXT: 4, SHOW_ELEMENT: 1 }, WeakMap, Map, Set, Array, Object, String, Number, JSON, Math, RegExp,
  setTimeout: () => 0, clearTimeout: () => {}, requestAnimationFrame: () => 0,
});
vm.runInContext(read('assets/caisse-lang.js'), tillCtx, { filename: 'caisse-lang.js' });
const tillLang = tillWindow.KiwiCaisseLang;
const splitSrc = read('assets/caisse/split-tender.js');
const at = splitSrc.indexOf('function splitPartLabel(');
ok(at > 0, 'splitPartLabel existe dans split-tender.js');
let depth = 0, end = -1;
for (let i = splitSrc.indexOf('{', at); i < splitSrc.length; i++) {
  if (splitSrc[i] === '{') depth++;
  if (splitSrc[i] === '}' && --depth === 0) { end = i + 1; break; }
}
ok(splitSrc.slice(0, splitSrc.indexOf('function renderSplitFlow')).includes('splitPartLabel'), 'écrit avant le rendu du partage');
ok(/class="split-part-label">\$\{splitPartLabel\(p\.label\)\}</.test(splitSrc), "le rendu d'une part passe par splitPartLabel");
const splitPartLabel = vm.runInContext('(' + splitSrc.slice(at, end).replace(/^function splitPartLabel/, 'function') + ')', vm.createContext({ globalThis: { window: tillWindow }, String, RegExp }));
const PART = [
  ['Part égale', 'Equal share', 'حصة متساوية'],
  ['Part égale + pourboire 10%', 'Equal share + 10% tip', 'حصة متساوية + بقشيش 10%'],
  ['Part équilibrée', 'Balanced share', 'حصة متوازنة'],
];
tillLang.set('fr');
for (const [fr] of PART) eq(splitPartLabel(fr), fr, 'FR inchangé : ' + fr);
tillLang.set('en');
for (const [fr, en] of PART) eq(splitPartLabel(fr), en, 'EN : ' + fr);
tillLang.set('ar');
for (const [fr, , ar] of PART) eq(splitPartLabel(fr), ar, 'AR : ' + fr);
for (const lang of ['en', 'ar']) {
  tillLang.set(lang);
  for (const merchant of ['2× Tajine, Thé', 'Vente', 'Part de gâteau', 'Part égale maison']) {
    eq(splitPartLabel(merchant), merchant, `mot du commerçant intact (${lang}) : ${merchant}`);
  }
}

/* ── 3 · l'app serveur ─────────────────────────────────────────── */
const src = read('assets/serveur/payments.js');
const ast = ts.createSourceFile('payments.js', src, ts.ScriptTarget.Latest, true);
const toasts = [];
(function walk(n) {
  if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === 'toast') toasts.push(n);
  ts.forEachChild(n, walk);
})(ast);
const lineOf = (n) => ast.getLineAndCharacterOfPosition(n.getStart(ast)).line + 1;
const frenchWord = /[éèêàçôû]|\b(?:Table|Pas de|paiement|réessayez|commande|reconnectez|partagez)\b.*\b(?:paiement|réessayez|commande|reconnectez|partagez|cuisine|réglée|enregistré)\b/;
const arabic = /[؀-ۿ]/;

const serveurWin = { };
vm.runInNewContext(read('assets/serveur-lang.js'), { window: serveurWin, console });
const patterns = serveurWin.KiwiServeurLang.patterns;
const dictionary = serveurWin.KiwiServeurLang;

const scope = { id: 'T4', tableId: 'T4', partIdx: 1, rest: 12, paidClient: { name: 'Sara' }, fmtMADcents: (n) => n + ' MAD' };
let picks = 0, shared = 0;
for (const call of toasts) {
  const first = call.arguments[0];
  if (!first) continue;
  const where = 'payments.js:' + lineOf(call);
  const direct = ts.isCallExpression(first) && ts.isIdentifier(first.expression) && first.expression.text === 'employeePick';
  const known = ts.isIdentifier(first) && first.text === 'SV_PAY_OFFLINE_MSG';
  /* Les toasts à paramètre venu d'ailleurs (allocation.message) gardent leur
     propre traducteur ; le reste doit choisir sa phrase ici. */
  const passthrough = ts.isPropertyAccessExpression(first);
  ok(direct || known || passthrough, where + ' : toast sans choix de langue à la source : ' + first.getText(ast).slice(0, 70));
  if (!direct) continue;
  ok(first.arguments.length === 3, where + ' : employeePick prend le français, l\'anglais et l\'arabe');
  picks++;
  const outs = {};
  for (const lang of ['fr', 'en', 'ar']) {
    const sandbox = { ...scope, employeeLanguage: lang, employeePick: (fr, en, ar) => (lang === 'en' ? en : lang === 'ar' ? ar : fr) };
    outs[lang] = vm.runInNewContext(first.getText(ast), sandbox);
  }
  ok(outs.en !== outs.fr && outs.ar !== outs.fr, where + ' : trois phrases distinctes');
  ok(!frenchWord.test(outs.en), where + ' : l\'anglais ne garde pas de français : ' + outs.en);
  ok(arabic.test(outs.ar), where + ' : l\'arabe est en lettres arabes : ' + outs.ar);
  ok(!/pourboire|paiement|réessayez|réglée|cuisine/.test(outs.ar + outs.en), where + ' : aucun mot français dans EN/AR');
  /* Quand un motif du dictionnaire serveur connaît la phrase française, il dit la même chose. */
  for (const [re, en, ar] of patterns) {
    if (!re.test(outs.fr)) continue;
    shared++;
    eq(outs.fr.replace(re, en), outs.en, where + ' : même anglais que le motif ' + re);
    eq(outs.fr.replace(re, ar), outs.ar, where + ' : même arabe que le motif ' + re);
    break;
  }
}
ok(picks >= 18, picks + ' toasts de paiement choisissent leur langue à la source');
ok(shared >= 6, shared + ' phrases recoupent les motifs du dictionnaire serveur');
void dictionary;

console.log(`✓ split-language-test : ticket, écran du comptoir et ${picks} toasts de paiement serveur en FR/EN/AR (${checks} vérifications)`);
