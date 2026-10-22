#!/usr/bin/env node
import maisonSource from './pos-maison-test-source.cjs';
/* Inventaire boutique · la fiche produit garde le prix au centime et dit vrai.
 *
 * 2026-10-12. The « Nouveau produit » / « Modifier le produit » modals read the
 * price with parseInt: an article priced 29,90 MAD at the till (bqMoney keeps
 * centimes) came back at 29 the first time the owner changed its photo here.
 * A cleared price saved it at 0 MAD, a cleared name was kept without a word,
 * the grid, the sheet and the shelf label printed 30, the tag showed « &amp; »,
 * the photo hint promised the shopper's phone to stores without Order Pro, and
 * the whole form was French under English and Arabic.
 *   node tools/boutique-product-form-test.mjs
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = process.env.KIWI_ROOT || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = maisonSource(readFileSync(path.join(ROOT, 'assets/pages-pro.js'), 'utf8'));
const tills = ['assets/pos-boutique.js', 'assets/pos-maison.js'].map((f) => maisonSource(readFileSync(path.join(ROOT, f), 'utf8')));
const code = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

let passed = 0, failed = 0;
function ok(label, fn) {
  try { fn(); passed++; console.log(`  ✓ ${label}`); }
  catch (e) { failed++; console.log(`  ✗ ${label}\n      ${String(e.message).split('\n')[0]}`); }
}
const fnSrc = (name) => {
  const m = src.match(new RegExp(`function ${name}\\s*\\([\\s\\S]*?\\n\\}`));
  if (!m) throw new Error(`${name} not found`);
  return m[0];
};
const between = (a, b) => { const i = src.indexOf(a); return i < 0 ? '' : src.slice(i, src.indexOf(b, i + a.length)); };

/* The real helpers, run as they are. */
const dictSrc = between('const _BQX_PF = {', '\nfunction _bqxPfLang()') ;
function load(lang) {
  const f = new Function('window', `
    const _mad = (n) => 'R' + n;
    const _mad2 = (n) => 'D' + n.toFixed(2);
    ${dictSrc}
    ${fnSrc('_bqxPfLang')}
    ${fnSrc('_bqxPfT')}
    ${fnSrc('_bqxPrice')}
    ${fnSrc('_bqxMoneyIn')}
    ${fnSrc('_bqxMoneyVal')}
    ${fnSrc('_bqxPfMark')}
    ${fnSrc('_bqxPfRead')}
    function _bqxCopy() { return { defaultKind: 'tu' }; }
    return { _BQX_PF, _bqxPrice, _bqxMoneyIn, _bqxMoneyVal, _bqxPfRead };
  `);
  return f({ KiwiI18n: { getLang: () => lang } });
}

/* A form small enough to read: the selectors _bqxPfRead and _bqxPfMark use. */
function fakeForm(v) {
  const el = (value) => ({ value, hidden: true, textContent: '', attrs: {},
    setAttribute(k, x) { this.attrs[k] = x; }, removeAttribute(k) { delete this.attrs[k]; } });
  const nodes = {
    '[data-bqx-name]': el(v.name), '[data-bqx-price]': el(v.price), '[data-bqx-cost]': el(v.cost),
    '[data-bqx-cat]': el(v.cat || ''),
    '[data-bqx-pf-err="name"]': el(), '[data-bqx-pf-err="price"]': el(), '[data-bqx-pf-err="cost"]': el(),
    '[data-bqx-kind]:checked': v.kind ? el(v.kind) : null,
  };
  return { nodes, querySelector: (s) => (s in nodes ? nodes[s] : null) };
}

console.log('money · what the merchant types');
ok('« 149,90 », « 149.90 », « 1 890 », « 29,9 MAD » and Arabic-Indic digits read to the centime', () => {
  const { _bqxMoneyIn } = load('fr');
  assert.equal(_bqxMoneyIn('149,90').n, 149.9);
  assert.equal(_bqxMoneyIn('149.90').n, 149.9);
  assert.equal(_bqxMoneyIn('1 890').n, 1890);
  assert.equal(_bqxMoneyIn('1\u202F890').n, 1890);
  assert.equal(_bqxMoneyIn('29,9 MAD').n, 29.9);
  assert.equal(_bqxMoneyIn('\u0661\u0664\u0669\u066B\u0669\u0660').n, 149.9);
  assert.equal(_bqxMoneyIn('0').n, 0);
});
ok('an ambiguous or malformed amount is refused, never guessed', () => {
  const { _bqxMoneyIn } = load('fr');
  assert.equal(_bqxMoneyIn('').empty, true);
  assert.equal(_bqxMoneyIn('1.890').bad, true, '1.890 could be 1 890 or 1,89');
  assert.equal(_bqxMoneyIn('1,890').bad, true);
  assert.equal(_bqxMoneyIn('12abc').bad, true);
  assert.equal(_bqxMoneyIn('-5').bad, true);
});
ok('an existing price is shown back to the centime, in the language’s decimal mark', () => {
  assert.equal(load('fr')._bqxMoneyVal(29.9), '29,90');
  assert.equal(load('ar')._bqxMoneyVal(29.9), '29,90');
  assert.equal(load('en')._bqxMoneyVal(29.9), '29.90');
  assert.equal(load('fr')._bqxMoneyVal(1890), '1890');
  assert.equal(load('fr')._bqxMoneyVal(0), '', 'a missing price is an empty field, not « 0 »');
});
ok('displayed prices keep their centimes and stay whole when whole', () => {
  const { _bqxPrice } = load('fr');
  assert.equal(_bqxPrice(29.9), 'D29.90');
  assert.equal(_bqxPrice(1890), 'R1890');
  assert.equal(_bqxPrice(0.1 + 0.2), 'D0.30');
});

console.log('the form · read and checked');
ok('a valid form returns clean values, centimes included', () => {
  const { _bqxPfRead } = load('fr');
  const f = _bqxPfRead(fakeForm({ name: '  Jean 501 ', price: '29,90', cost: '12,5', cat: 'c1', kind: 'taille' }));
  assert.deepEqual(f, { name: 'Jean 501', priceMAD: 29.9, cost: 12.5, categoryId: 'c1', kind: 'taille' });
});
ok('an empty name, an empty or zero price and a malformed cost are each written under their field', () => {
  const { _bqxPfRead, _BQX_PF } = load('fr');
  const b = fakeForm({ name: ' ', price: '', cost: '12abc' });
  assert.equal(_bqxPfRead(b), null);
  assert.equal(b.nodes['[data-bqx-pf-err="name"]'].hidden, false);
  assert.equal(b.nodes['[data-bqx-name]'].attrs['aria-invalid'], 'true');
  assert.equal(b.nodes['[data-bqx-pf-err="price"]'].textContent, _BQX_PF.fr.priceErr);
  assert.equal(b.nodes['[data-bqx-pf-err="cost"]'].hidden, false);
  const z = fakeForm({ name: 'Vase', price: '0', cost: '' });
  assert.equal(_bqxPfRead(z), null);
  assert.equal(z.nodes['[data-bqx-pf-err="price"]'].textContent, _BQX_PF.fr.priceZero);
  const bad = fakeForm({ name: 'Vase', price: '1.890', cost: '' });
  assert.equal(_bqxPfRead(bad), null);
  assert.equal(bad.nodes['[data-bqx-pf-err="price"]'].textContent, _BQX_PF.fr.moneyBad);
});
ok('a kind the trade does not list is left alone, not rewritten to the first card', () => {
  const { _bqxPfRead } = load('fr');
  const f = _bqxPfRead(fakeForm({ name: 'Bougie', price: '45', cost: '' }));
  assert.equal(f.kind, undefined);
  assert.match(between("handlers['bqx-new-save']", '/* edit / delete product */'), /kind: f\.kind \|\| _bqxCopy\(\)\.defaultKind,/);
});
ok('nothing is created or updated before the form has been checked', () => {
  const create = between("handlers['bqx-new-save']", '/* edit / delete product */');
  assert.ok(create.indexOf('if (!f) { _bqxPfFail(b); return; }') > 0);
  assert.ok(create.indexOf('if (!f) { _bqxPfFail(b); return; }') < create.indexOf('addProduct('));
  const edit = between("handlers['bqx-prod-edit-save']", "handlers['bqx-prod-del']");
  assert.ok(edit.indexOf('if (!f) { _bqxPfFail(b); return; }') > 0);
  assert.ok(edit.indexOf('if (!f) { _bqxPfFail(b); return; }') < edit.indexOf('updateProduct('));
  assert.match(edit, /name: f\.name,\n\s+categoryId: f\.categoryId,/);
  assert.ok(!/parseInt\(b\.querySelector\('\[data-bqx-e?(price|cost)\]'\)/.test(src), 'no parseInt on a price or a cost');
});

console.log('what the inventory shows and prints');
ok('the grid, the list, the sheet and the shelf label print the price and the cost to the centime', () => {
  assert.ok(!src.includes('_mad(p.priceMAD)') && !src.includes('_mad(data.product.priceMAD)'));
  assert.ok(!src.includes('_mad(cost)') && !src.includes('_mad(cost * '), 'the sheet printed a 12,50 cost as 13');
  assert.match(src, /<span class="bqx-price">\$\{_bqxPrice\(p\.priceMAD\)\}<small>\$\{_esc\(t\.cur\)\}<\/small><\/span>/);
  assert.match(src, /price: _bqxPrice\(p\.priceMAD\), code, format: fmt \};/);
});
ok('the edit tag is the product name, escaped once by modal()', () => {
  assert.match(src, /tag: p \? p\.name : t\.tagInv \+ ' · ' \+ _bqxTag\(\),/);
  assert.ok([src].concat(tills).every((f) => !f.includes('>·Sans catégorie<')), 'the stray dot of a removed dash is gone, here and on both tills');
});
ok('the photo hint says where a photo shows, and a video is offered only where one shows', () => {
  assert.ok(!code(src).includes('Visible par vos clients sur le téléphone'));
  const hint = fnSrc('_bqxMediaHint');
  assert.match(hint, /const till = _bqxTillReads\(\), phone = _orderProOn\(\);/);
  assert.match(fnSrc('_bqxMediaActions'), /const videoOk = _orderProOn\(\) \|\| !!_bqxVideo;/);
});

console.log('three languages, one voice');
ok('FR, EN and AR carry the same keys, and no em dash or takings talk', () => {
  const { _BQX_PF } = load('fr');
  const shape = (o) => Object.keys(o).sort().map((k) => (o[k] && typeof o[k] === 'object' && !Array.isArray(o[k]) ? `${k}{${shape(o[k])}}` : k)).join(',');
  assert.equal(shape(_BQX_PF.en), shape(_BQX_PF.fr));
  assert.equal(shape(_BQX_PF.ar), shape(_BQX_PF.fr));
  const all = JSON.stringify(_BQX_PF);
  assert.ok(!all.includes('\u2014'), 'no U+2014');
  /* Owner decision 2026-08-19: category B is named, never explained. */
  assert.ok(!/recette|takings|مداخيل/.test(all));
});

console.log(`\nboutique-product-form: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
