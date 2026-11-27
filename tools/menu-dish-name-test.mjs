// Un nom de plat ne se traduit pas à la machine sur le téléphone du serveur ni au
// passe (audit du 26 nov. 2026). Seule la traduction écrite à la main par le
// patron (i18n[lang].m) remplace le nom, la règle d'OrderPro ; les catégories
// et options gardent la traduction automatique. Vrai assets/menu-i18n.js.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const store = new Map();
const window = { localStorage: { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) },
  addEventListener() {}, dispatchEvent() {}, navigator: { language: 'fr' } };
window.window = window;
const ctx = vm.createContext({ window, localStorage: window.localStorage, navigator: window.navigator, document: { documentElement: { lang: 'fr' }, addEventListener() {} }, console, CustomEvent: class {} });
vm.runInContext(fs.readFileSync(path.join(ROOT, 'assets/menu-i18n.js'), 'utf8'), ctx);
const M = window.KiwiMenuI18n;
let checks = 0;
const eq = (a, b, m) => { assert.equal(a, b, m); checks++; };
const healthy = { id: 'h1', name: 'Le healthy', desc: 'Bol frais', i18n: {} };
healthy.i18n.en = { name: 'The healthy one', desc: 'Fresh bowl', h: M.hash(healthy.name, healthy.desc) };
const tajine = { id: 't1', name: 'Tajine poulet', desc: '', i18n: { en: { name: 'Chicken tagine', m: 1 } } };
const cat = { id: 'c1', name: 'Boissons', i18n: {} };
cat.i18n.en = { name: 'Drinks', h: M.hash(cat.name, undefined) };
const handCat = { id: 'c2', name: 'Desserts maison', i18n: { en: { name: 'Homemade desserts', m: 1 } } };
M.index({ cats: [cat, handCat], items: [healthy, tajine] });
eq(M.fresh(healthy, 'en'), true, 'the machine translation is fresh, so name() would show it');
eq(M.dish(healthy, 'en'), 'Le healthy', 'a machine-translated dish keeps the owner\'s name');
eq(M.dish('Le healthy', 'en', 'h1'), 'Le healthy', 'and so does an order line that only carries the label');
eq(M.dish(tajine, 'en'), 'Chicken tagine', 'a translation the owner wrote by hand is shown');
eq(M.dish('Tajine poulet', 'en'), 'Chicken tagine', 'also from the line label');
/* d5f925c3b (Browse, 26 Nov 2026): a category is named as the owner wrote it;
   only a translation written by hand replaces it, never a machine one. */
eq(M.t('Boissons', 'en'), 'Boissons', 'a machine-translated category keeps the owner\'s name');
eq(M.t('Desserts maison', 'en'), 'Homemade desserts', 'a category translated by hand is shown');
/* Corriger seulement la description ne fait pas du nom de la machine un nom écrit à la main (audit du 26 nov.). */
{
  const state = fs.readFileSync(path.join(ROOT, 'assets/menu-catalog/state.js'), 'utf8');
  const a = state.indexOf('  function setI18nEntry('), b = state.indexOf('  function clearI18n(', a);
  const item = { id: 'h2', name: 'Le healthy', desc: 'Bol frais', i18n: { en: { name: 'The healthy one', desc: 'Fresh bowl', h: M.hash('Le healthy', 'Bol frais') } } };
  const d = { items: [item] };
  const setI18nEntry = new Function('MI', 'store', 'i18nTarget', state.slice(a, b) + '\nreturn setI18nEntry;')(() => M, { update: (fn) => fn(d) }, (dd, kind, id) => dd.items.find((x) => x.id === id));
  setI18nEntry('item', 'h2', null, 'en', { desc: 'A fresh bowl' });
  eq(item.i18n.en.desc, 'A fresh bowl', 'the corrected description is kept');
  eq(item.i18n.en.name === 'The healthy one' && item.i18n.en.m === 1, false, 'the machine name is not stamped as hand-written');
  eq(M.dish(item, 'en'), 'Le healthy', 'and screens keep the owner\'s name');
}
console.log(`✓ menu-dish-name-test : ${checks} contrôles (nom de plat : main du patron seulement, catégories aussi)`);
