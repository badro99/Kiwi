#!/usr/bin/env node
/* Kiwi · boutique-exact-colors-test · a shop that sells ten pinks.
 *
 * Owner, 22 November 2026 (Elham Brand, a Tangier shawl shop with a 105-shade
 * chart): « fix it other way they can choose exact colors and actually do it
 * for every store type ». The sizes screen (boutique-sizes.js) offered only the
 * 13 KiwiColors families, so « 05 Fuchsia » and « 01 Rose clair » both became
 * « Rose ». assets/boutique-size-colors.js now opens a column per exact shade
 * (id « custom-<hex> »), lists the shop's own shades (its shared chart, then
 * the shades already in the catalogue) and lets one be created; and
 * assets/boutique-size-codes.js gives a second shade of the same family its
 * own item number, so the two never share a barcode.
 *
 * Runs the real modules on their own, against a small fake catalogue.
 *   node tools/boutique-exact-colors-test.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let n = 0, bad = 0;
const ok = (cond, msg, detail) => { if (cond) { n++; console.log('  ✓ ' + msg); } else { bad++; console.log('  ✗ ' + msg + (detail ? ' · ' + detail : '')); } };
const K = await import(pathToFileURL(path.join(root, 'assets/boutique-size-colors.js')).href);
const C = await import(pathToFileURL(path.join(root, 'assets/boutique-size-codes.js')).href);

const FAM = { 'custom-e56ea0': 'rose', 'custom-f9d9e0': 'rose', 'custom-1d3b7a': 'bleu' };
function fakeCat(products) {
  return {
    listProducts: () => products.map((p) => p.product),
    getProduct: (id) => products.find((p) => p.product.id === id) || null,
    colorFamily: (v) => FAM[String(v.colorId)] || v.colorFamily || String(v.colorId),
    colors: () => [{ id: 'rose', label: 'Rose', hex: '#EE91B1' }, { id: 'bleu', label: 'Bleu', hex: '#2557B0' }, { id: 'noir', label: 'Noir', hex: '#121212' }],
  };
}
const fresh = C.READABLE_SINCE + 1000;

console.log('■ exact columns');
ok(K.isExact('custom-e56ea0') && !K.isExact('rose') && !K.isExact('custom-xyz'), 'isExact · only « custom- » + six hex digits');
ok(K.exactId('#E56EA0') === 'custom-e56ea0' && K.exactId('nope') === '', 'exactId · from a hex, lower case; junk gives nothing');
const cat0 = fakeCat([]);
const fuchsia = K.exactColumn(cat0, { id: 'custom-e56ea0', label: '  05   Fuchsia ' });
ok(fuchsia.id === 'custom-e56ea0' && fuchsia.label === '05 Fuchsia' && fuchsia.hex === '#E56EA0' && fuchsia.family === 'rose' && fuchsia.exact,
  'exactColumn · its own id, name, hex; the family still known for reports', JSON.stringify(fuchsia));
ok(K.exactColumn(cat0, { id: 'custom-f9d9e0' }).light === true && fuchsia.light === false, 'a pale shade is marked light (dark digits on it)');
ok(K.exactColumn(cat0, { id: 'custom-1d3b7a', label: '' }).label === '#1D3B7A', 'no name · the hex stands in');

console.log('■ columns of a product with two pinks');
const shawl = {
  product: { id: 'p1', name: 'Châle soie', createdAt: fresh },
  variants: [
    { id: 'v1', colorId: 'custom-e56ea0', colorLabel: '05 Fuchsia', size: 'TU', barcodes: [] },
    { id: 'v2', colorId: 'custom-f9d9e0', colorLabel: '01 Rose clair', size: 'TU', barcodes: [] },
  ],
};
const cat1 = fakeCat([shawl]);
const cols = K.columns(cat1, 'p1', 'fr', cat1.colors());
ok(cols.length === 2 && cols.every((c) => c.exact) && cols[0].label === '05 Fuchsia' && cols[1].label === '01 Rose clair',
  'two exact pinks · two columns, each with its own name', JSON.stringify(cols.map((c) => c.label)));
ok(!K.hasFamily(cols, { id: 'rose' }), 'the family « Rose » is still offered next to exact pinks');
ok(K.hasFamily([{ id: 'nuit', family: 'bleu', exact: false }], { id: 'bleu' }), 'a family shade (old « nuit ») still hides « Bleu », as before');
const cells = K.cells(cat1, 'p1', cols, ['TU']);
ok(cells.length === 2 && cells[0].colorId === 'custom-e56ea0' && cells[0].colorLabel === '05 Fuchsia' && cells[1].colorHex === '#F9D9E0',
  'cells · each carries its exact id, name and hex to the catalogue');

console.log('■ quick entry with exact shades');
const pal = cat1.colors();
const parse = (text) => ({ map: Object.fromEntries(text.split(/\s+/).filter(Boolean).map((x) => [x.replace(/\d+$/, ''), +(x.match(/\d+$/) || [0])[0]])), last: null, bad: '' });
const two = K.parseColored('rose TU3', ['TU'], cols, pal, parse);
ok(two.added.length === 1 && two.added[0].id === 'rose', '« rose » with two exact pinks · opens the family column, never guesses a shade', JSON.stringify(two.added));
const one = K.parseColored('bleu TU2', ['TU'], [K.exactColumn(cat0, { id: 'custom-1d3b7a', label: '18 Bleu marine' })], pal, parse);
ok(one.added.length === 0, '« bleu » with a single exact blue · lands on that shade', JSON.stringify(one));

console.log('■ the shop\'s shades');
const old = {
  product: { id: 'p0', name: 'Ancien', createdAt: fresh, archived: true },
  variants: [{ id: 'v9', colorId: 'custom-1d3b7a', colorLabel: '18 Bleu marine', size: 'TU', barcodes: [] }, { id: 'v8', colorId: 'noir', colorLabel: 'Noir', size: 'TU', barcodes: [] }],
};
const shop = K.shopColors(fakeCat([shawl, old]));
ok(shop.length === 3 && shop.every((c) => K.isExact(c.id)), 'shopColors · every exact shade in the catalogue (archived too), families left out', JSON.stringify(shop.map((c) => c.label)));
ok(shop.map((c) => c.label).join('|') === '01 Rose clair|05 Fuchsia|18 Bleu marine', 'sorted by their own numbers');

console.log('■ one barcode per shade');
const plan = C.planner(cat1, 'p1', ['TU']);
const a = plan.code('rose', 'TU', 'custom-e56ea0');
const b = plan.code('rose', 'TU', 'custom-f9d9e0');
const pa = C.parts(a), pb = C.parts(b);
ok(pa && pb && a !== b, 'two pinks · two different readable codes', `${a} ${b}`);
ok(pa && pb && pa[1] === '21' && pb[1] === '21' && pa[2] !== pb[2] && pa[3] === '00', 'same colour digits (21 rose), a different item number, size 00');
ok(plan.code('rose', 'TU', 'custom-e56ea0') === a, 'the same shade asks again · the same code');
ok(plan.code('bleu', 'TU', 'custom-1d3b7a').slice(3, 10) === pa[2], 'another family · keeps the product\'s first item number');
ok(plan.code('rose', 'TU') === C.compose('21', plan.item, '00'), 'no colour id (older callers) · the code is unchanged');
// Codes already on the product decide: the shade that has one keeps its item.
shawl.variants[0].barcodes = [{ code: b, type: 'ean13', primary: true }];
const again = C.planner(cat1, 'p1', ['TU']);
ok(again.code('rose', 'TU', 'custom-e56ea0') === b, 'reloaded · the shade keeps the item its code already carries');
ok(again.code('rose', 'TU', 'custom-f9d9e0') !== b, 'reloaded · the other pink still gets its own');

console.log('■ « clair » is a lightness, not « Transparent »');
{
  const vm = await import('node:vm');
  const box = { window: {} };
  vm.runInNewContext(fs.readFileSync(path.join(root, 'assets/color-palette.js'), 'utf8'), box);
  const KC = box.window.KiwiColors;
  const fam = (l, h) => KC.normalize('custom-' + h.slice(1).toLowerCase(), l, h).id;
  ok(fam('01 Rose clair', '#F9D9E0') === 'rose' && fam('12 Bleu clair', '#A3C7E8') === 'bleu' && fam('101 Noir clair', '#242424') === 'noir',
    'Rose clair → rose, Bleu clair → bleu, Noir clair → noir (they fell into « Transparent », barcode 88)');
  ok(KC.normalize('clair', 'Clair', '').id === 'transparent', 'a lone « Clair » still means transparent');
}

console.log('■ the chart is a shared store document');
const store = fs.readFileSync(path.join(root, 'functions/api/store.js'), 'utf8');
ok(/colorchart:\s*\{\s*keys:\s*\['list'\]/.test(store), 'functions/api/store.js · « colorchart » is a known feature (else the server refuses it and it stays local)');
const sizes = fs.readFileSync(path.join(root, 'assets/boutique-sizes.js'), 'utf8');
ok(/plan\.code\(fam, r\.size, v\.colorId\)/.test(sizes), 'boutique-sizes.js · the save passes the shade to the planner');
ok(/data-kbc-make/.test(sizes) && /COLORS\.rememberColor\(col\)/.test(sizes), 'boutique-sizes.js · a new exact colour can be made and joins the chart');

console.log(bad ? `\n✗ ${bad} failed, ${n} passed` : `\n✓ ${n} checks passed`);
process.exit(bad ? 1 : 0);
