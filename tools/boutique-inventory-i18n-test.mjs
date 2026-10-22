#!/usr/bin/env node
/* Inventaire boutique · la page parle la langue de l'écran.
 *
 * 2026-10-12. The product sheet already read FR, EN and AR; the page that
 * opens it did not. Under English and Arabic the merchant read « Inventaire
 * produits », « Nouveau produit », « À réassortir », « Rupture », the selection
 * bar, the grouped delete window and the export toast in French, with « MAD »
 * where the sheet says « درهم ». A product without a category was « Divers »
 * on its card and « Sans catégorie » on its sheet.
 *   node tools/boutique-inventory-i18n-test.mjs
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import pagesProSource from './pages-pro-test-source.cjs'; // pages-pro.js en quatre fichiers depuis le 22 octobre 2026

const ROOT = process.env.KIWI_ROOT || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = pagesProSource();

let passed = 0, failed = 0;
function ok(label, fn) {
  try { fn(); passed++; console.log(`  ✓ ${label}`); }
  catch (e) { failed++; console.log(`  ✗ ${label}\n      ${String(e.message).split('\n')[0]}`); }
}
function grab(start) {
  const i = src.indexOf(start);
  assert.ok(i >= 0, start + ' found');
  let d = 0;
  for (let k = src.indexOf('{', i); k < src.length; k++) {
    if (src[k] === '{') d++; else if (src[k] === '}' && --d === 0) return src.slice(i, k + 1);
  }
  throw new Error('unbalanced ' + start);
}
function ctx(lang) {
  const c = vm.createContext({ window: { KiwiI18n: { getLang: () => lang } }, Math, Number, String, Object, JSON });
  vm.runInContext([
    "function _esc(s){ return String(s); }",
    grab('function _bqxN('),
    grab('function _bqxArCount('),
    src.match(/^const _bqxEnN = .*$/m)[0],
    src.match(/^const _arProducts = .*$/m)[0],
    grab('const _BQX_INV = {'),
    'const _BQX_PF = { fr: 1, en: 1, ar: 1 };',
    grab('function _bqxPfLang('),
    grab('function _bqxInvT('),
    grab('function _bqxStockTag('),
  ].join('\n'), c);
  return c;
}
const region = (() => {
  const a = src.indexOf('function _bqxVisibleProducts(');
  const b = src.indexOf("handlers['bqx-export']");
  const end = src.indexOf('\n};', b);
  assert.ok(a > 0 && b > a && end > b, 'inventory region found');
  return src.slice(a, end);
})();

ok('FR, EN and AR carry the same keys', () => {
  const c = ctx('fr');
  const d = vm.runInContext('_BQX_INV', c);
  const keys = (o) => Object.keys(o).sort().join(',');
  assert.equal(keys(d.en), keys(d.fr));
  assert.equal(keys(d.ar), keys(d.fr));
  assert.ok(!JSON.stringify(d).includes('—'), 'no U+2014 in the copy');
});
ok('plurals read right in each language', () => {
  const fr = vm.runInContext('_bqxInvT()', ctx('fr'));
  const en = vm.runInContext('_bqxInvT()', ctx('en'));
  const ar = vm.runInContext('_bqxInvT()', ctx('ar'));
  assert.equal(fr.selected(1), '1 produit sélectionné');
  assert.equal(fr.selected(2), '2 produits sélectionnés');
  assert.equal(fr.left(1), '1 restant');
  assert.equal(en.selected(1), '1 product selected');
  assert.equal(en.deletedN(3), '3 products deleted');
  assert.equal(en.delTitle(2), 'Delete 2 products?');
  assert.equal(ar.products(1), 'منتج واحد');
  assert.equal(ar.products(2), 'منتجان');
  assert.equal(ar.products(5), '5 منتجات');
  assert.equal(ar.products(11), '11 منتجًا');
  assert.equal(ar.delTitle(2), 'حذف منتجان؟');
});
ok('the stock tag reads the language', () => {
  assert.match(vm.runInContext('_bqxStockTag(0)', ctx('en')), />Out of stock</);
  assert.match(vm.runInContext('_bqxStockTag(3)', ctx('en')), />3 left</);
  assert.match(vm.runInContext('_bqxStockTag(9)', ctx('ar')), />في المخزون: 9</);
  assert.match(vm.runInContext('_bqxStockTag(2)', ctx('fr')), />2 restants</);
});
ok('no French literal is left in the page, its bar or its grouped windows', () => {
  for (const fr of ['Inventaire produits', 'Nouveau produit<', '>Grille<', '>Liste<', "'Sélectionner'", 'Gérés dans Catégories',
    '>À réassortir<', "'Rupture'", 'Aucun produit', 'Tout voir', 'Supprimer définitivement', 'Archiver plutôt',
    'Touchez les produits', 'Changer de catégorie</span>', 'Inventaire exporté', 'Import indisponible', "'Divers'", 'Divers (sans catégorie)',
    'Rechercher un produit, un rayon', '>Couleur<', 'Filtre actif', 'Module inventaire indisponible']) {
    assert.ok(!region.includes(fr), fr);
  }
});
ok('the currency follows the language on cards, rows and the value KPI', () => {
  assert.ok(!/<small>MAD<\/small>/.test(region), 'card unit');
  assert.ok(!/\} MAD<\/span>/.test(region), 'row unit');
  assert.ok(!/<span class="u">MAD<\/span>/.test(region), 'KPI unit');
  assert.equal(vm.runInContext('_bqxInvT().cur', ctx('ar')), 'درهم');
});
ok('a product without a category is named the way its sheet names it', () => {
  for (const lang of ['fr', 'en', 'ar']) {
    const c = ctx(lang);
    const inv = vm.runInContext('_bqxInvT().noCat', c);
    const sheetDict = grab('const _BQX_SH = {');
    const sheet = (sheetDict.match(/noCat: '([^']+)'/g) || []).map((m) => m.slice(8, -1));
    assert.equal(sheet.length, 3, 'the sheet names it in three languages');
    assert.ok(sheet.includes(inv), `${lang}: « ${inv} » is the sheet's word`);
  }
  assert.ok((region.match(/_esc\(t\.noCat\)/g) || []).length >= 3, 'card, row and the move window use it');
});
ok('the dashboard still says « Inventaire produits » in French', () => {
  assert.equal(vm.runInContext('_bqxInvT().title', ctx('fr')), 'Inventaire produits');
  assert.equal(vm.runInContext('_bqxInvT().title', ctx('en')), 'Product inventory');
});

console.log(`\nboutique-inventory-i18n: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
