#!/usr/bin/env node
/* Kiwi · boutique-size-split-test · splitting a carton over its sizes.
 *
 * Owner, 29 October 2026: « make an optimal way to add variants ». The sizes
 * screen (boutique-sizes.js) asked for one number per size until they added up
 * to the total. assets/boutique-size-split.js adds one-tap splits (the shop's
 * own sales, its stock, or the classic curve; even), quick entry (« M3 L5 XL2 »,
 * « S-XL 4 », « 38:2 ») and the remainder on the last size touched.
 *
 * Runs the real module on its own (pure functions; the screen itself is held
 * by boutique-size-split-browser-test.mjs) and the real catalog accessor
 * soldMoves() in assets/boutique-catalog.js, read as text.
 *   node tools/boutique-size-split-test.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let n = 0, bad = 0;
const ok = (cond, msg, detail) => { if (cond) { n++; console.log('  ✓ ' + msg); } else { bad++; console.log('  ✗ ' + msg + (detail ? ' · ' + detail : '')); } };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const S = await import(pathToFileURL(path.join(root, 'assets/boutique-size-split.js')).href);
const TAILLE = ['XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL'];
const POINTURE = ['36', '37', '38', '39', '40', '41', '42', '43', '44', '45'];

console.log('■ apportion · the sizes always add up to the total');
let seed = 7;
const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
let held = true, detail = '';
for (let k = 0; k < 400 && held; k++) {
  const len = 1 + Math.floor(rnd() * 10);
  const w = Array.from({ length: len }, () => (rnd() < 0.3 ? 0 : Math.floor(rnd() * 50)));
  const total = Math.floor(rnd() * 500);
  const out = S.apportion(total, w);
  const sum = out.reduce((s, x) => s + x, 0);
  const anyW = w.some((x) => x > 0);
  if (sum !== total || out.some((x) => x < 0 || !Number.isInteger(x)) || (anyW && out.some((x, i) => x > 0 && w[i] === 0))) {
    held = false; detail = JSON.stringify({ w, total, out });
  }
}
ok(held, '400 random cases · whole pieces, sum = total, a size with no weight gets none', detail);
ok(same(S.apportion(24, [2, 6, 18, 30, 26, 13, 5]), [1, 2, 4, 7, 6, 3, 1]), 'classic curve · 24 pieces → 1 2 4 7 6 3 1');
ok(same(S.apportion(24, [1, 1, 1, 1, 1, 1, 1]), [3, 3, 4, 4, 4, 3, 3]), 'even · the 3 extra pieces go to the middle sizes (S M L)');
ok(same(S.apportion(5, [0, 0, 0, 0, 0, 0, 0]), [0, 1, 1, 1, 1, 1, 0]), 'no weight at all · spread evenly from the middle');
ok(same(S.apportion(0, [1, 2, 3]), [0, 0, 0]), 'nothing to split · zeros');

console.log('■ quick entry');
const q = (text, sizes = TAILLE) => S.parseQuick(text, sizes);
const cases = [
  ['M3 L5 XL2', { M: 3, L: 5, XL: 2 }, 'XL'],
  ['m:3, l=5', { M: 3, L: 5 }, 'L'],
  ['M 3 L 5', { M: 3, L: 5 }, 'L'],
  ['S-XL 4', { S: 4, M: 4, L: 4, XL: 4 }, 'XL'],
  ['s à xl 4', { S: 4, M: 4, L: 4, XL: 4 }, 'XL'],
  ['XL-S:2', { S: 2, M: 2, L: 2, XL: 2 }, 'XL'],
  ['m3 m2', { M: 5 }, 'M'],
  ['2XL3', { XXL: 3 }, 'XXL'],
  ['2 4 6 6 4 2 0', { XXS: 2, XS: 4, S: 6, M: 6, L: 4, XL: 2 }, 'XL'],
];
for (const [text, map, last] of cases) {
  const r = q(text);
  ok(same(r.map, map) && r.last === last && !r.bad && !r.pending, `« ${text} »`, JSON.stringify(r));
}
for (const text of ['XL', 'X', 'S-', '2 4', 'S-XL']) {
  const r = q(text);
  ok(r.pending && !r.bad, `« ${text} » · still typing, no error yet`, JSON.stringify(r));
}
ok(q('M3 Q').bad === 'Q', 'an unknown word is named back to the cashier');
ok(q('1 2 3 4 5 6 7 8').bad === '8', 'more numbers than sizes · the first extra one is named');
ok(same(q('').map, {}) && !q('').pending, 'empty · nothing');
const p = (text) => S.parseQuick(text, POINTURE);
ok(same(p('38:2 39x4').map, { 38: 2, 39: 4 }), 'shoes « 38:2 39x4 »');
ok(same(p('38 2 39 4').map, { 38: 2, 39: 4 }) && p('38 2 39 4').last === '39', 'shoes « 38 2 39 4 » · size then pieces');
ok(same(p('38-41 2').map, { 38: 2, 39: 2, 40: 2, 41: 2 }), 'shoes « 38-41 2 »');
ok(p('38').pending && p('382').pending, 'shoes · « 38 » and « 382 » wait for more');

console.log('■ where the shape comes from');
function catalog({ sold = [], stock = {}, catName = 'Caftans' } = {}) {
  const products = [
    { id: 'new', kind: 'taille', categoryId: 'caf' },
    { id: 'p1', kind: 'taille', categoryId: 'caf' },
    { id: 'p2', kind: 'taille', categoryId: 'acc' },
    { id: 'p3', kind: 'pointure', categoryId: 'caf' },
  ];
  const variants = {
    new: [],
    p1: TAILLE.map((s) => ({ id: 'p1-' + s, size: s, stock: stock['p1-' + s] || 0 })),
    p2: TAILLE.map((s) => ({ id: 'p2-' + s, size: s, stock: stock['p2-' + s] || 0 })),
    p3: POINTURE.map((s) => ({ id: 'p3-' + s, size: s, stock: 9 })),
  };
  return {
    listProducts: (o) => (o && o.includeArchived ? products : products).map((x) => ({ id: x.id })),
    getProduct: (id) => { const x = products.find((y) => y.id === id); return x && { product: x, variants: variants[id] }; },
    listCategories: () => [{ id: 'caf', name: catName }, { id: 'acc', name: 'Accessoires' }],
    soldMoves: () => sold,
  };
}
const moves = (prefix, bySize) => Object.entries(bySize).map(([s, k]) => ({ vid: prefix + s, n: k, at: 1 }));
let c = S.curveFor(catalog({ sold: moves('p1-', { S: 3, M: 6, L: 4 }).concat(moves('p2-', { XS: 40 })) }), 'new', TAILLE);
ok(c.source === 'sales' && c.scope === 'category' && c.basis === 13 && c.category === 'Caftans', 'enough sales in the same aisle · its own curve, named', JSON.stringify(c));
ok(same(c.weights, [0, 0, 3, 6, 4, 0, 0]), 'the weights are the pieces sold per size, other aisles left out');
c = S.curveFor(catalog({ sold: moves('p1-', { M: 2 }).concat(moves('p2-', { XS: 5, S: 6 })) }), 'new', TAILLE);
ok(c.source === 'sales' && c.scope === 'shop' && c.basis === 13, 'too few in the aisle · the whole shop', JSON.stringify(c));
c = S.curveFor(catalog({ sold: moves('p3-', { 38: 50 }), stock: { 'p1-M': 10, 'p2-L': 5 } }), 'new', TAILLE);
ok(c.source === 'stock' && c.basis === 15 && same(c.weights, [0, 0, 0, 10, 5, 0, 0]), 'shoe sales do not shape clothes · falls back to the stock', JSON.stringify(c));
c = S.curveFor(catalog(), 'new', TAILLE);
ok(c.source === 'classic' && same(c.weights, [2, 6, 18, 30, 26, 13, 5]), 'a new shop · the classic curve');
ok(S.curveFor(catalog(), 'missing', TAILLE).source === 'classic', 'unknown product · the classic curve, no throw');

console.log('■ the catalog says what it sold (boutique-catalog.js › soldMoves)');
const src = fs.readFileSync(path.join(root, 'assets/boutique-catalog.js'), 'utf8');
const line = src.split('\n').find((l) => /^\s+soldMoves:/.test(l)) || '';
ok(/why === 'vente'/.test(line) && /m\.d < 0/.test(line), 'only confirmed sales leave the shelf · « vente », negative moves');
ok(/n: -m\.d/.test(line) && !/reserve/.test(line), 'pieces counted positive; a held basket (« reserve ») is not a sale');

console.log('■ wiring');
const sizes = fs.readFileSync(path.join(root, 'assets/boutique-sizes.js'), 'utf8');
ok(/import \* as SPLIT from '\.\/boutique-size-split\.js\?v=\d+'/.test(sizes), 'the sizes screen imports the split module with a stamp');
ok(/splitOn = !ro && shown\.length > 1 && shown\.every\(\(r\) => !r\.multi\)/.test(sizes), 'never on a read-only till, a single size, or an old multi-colour product');
const sw = fs.readFileSync(path.join(root, 'kiwi-sw.js'), 'utf8');
ok(/'\/assets\/boutique-size-split\.js\?v=\d+'/.test(sw), 'precached for the offline till');
const mod = fs.readFileSync(path.join(root, 'assets/boutique-size-split.js'), 'utf8');
ok(!/fetch\(|XMLHttpRequest|sendBeacon/.test(mod), 'computed on the device · no network call');
ok(!/—/.test(mod.replace(/\/\*[\s\S]*?\*\//g, '')), 'no em dash in what the cashier reads');

console.log(`\nboutique-size-split: ${n} passed, ${bad} failed`);
process.exit(bad ? 1 : 0);
