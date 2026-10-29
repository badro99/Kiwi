#!/usr/bin/env node
/* Kiwi · boutique-size-split-test · splitting a carton over its sizes.
 *
 * Owner, 29 October 2026: « make an optimal way to add variants ». The sizes
 * screen (boutique-sizes.js) asked for one number per size until they added up
 * to the total. assets/boutique-size-split.js adds one-tap splits (the shop's
 * own sales, its stock, or the classic curve; even), quick entry (« M3 L5 XL2 »,
 * « S-XL 4 », « 38:2 ») and the remainder on the last size touched.
 *
 * Colours (same evening, « now shock me on how to add color variants »):
 * assets/boutique-size-colors.js turns the screen into a size × colour grid;
 * the name's colour is picked, « noir M3 bleu S-XL 2 » fills per colour and
 * adds a colour typed for the first time, and the split shares the pieces
 * between colours by the shop's sales per colour family, else evenly.
 *
 * Runs the real modules on their own (pure functions; the screen itself is held
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
const K = await import(pathToFileURL(path.join(root, 'assets/boutique-size-colors.js')).href);
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

console.log('■ colours');
const PAL = [
  { id: 'noir', label: 'Noir', en: 'Black', ar: 'أسود', hex: '#1A1A1A' }, { id: 'blanc', label: 'Blanc', en: 'White', hex: '#FFFFFF', light: true },
  { id: 'marron', label: 'Marron', en: 'Brown', hex: '#6B4A2F' }, { id: 'rouge', label: 'Rouge', en: 'Red', hex: '#C62828' },
  { id: 'bleu', label: 'Bleu', en: 'Blue', ar: 'أزرق', hex: '#1E5AA8' }, { id: 'multi', label: 'Multicolore', hex: '#999999' },
];
ok(K.detect('Hoodie noir', PAL)?.id === 'noir' && K.detect('Robe Bleue marine', PAL)?.id === 'bleu' && K.detect('Black tee', PAL)?.id === 'noir', 'the colour said in the name is found (noir, bleue, black)');
ok(K.detect('Caftan brodé main', PAL) === null && K.detect('Foulard multicolore', PAL) === null, 'no colour in the name · none picked; « multicolore » is not a colour to pick');
const cols1 = [K.columnOf(PAL[0], 'fr')];
const pc = (text, cols = cols1) => K.parseColored(text, TAILLE, cols, PAL, S.parseQuick);
let r = pc('noir M3 L5 bleu S-XL 2');
ok(same(r.map, { 'noir|M': 3, 'noir|L': 5, 'bleu|S': 2, 'bleu|M': 2, 'bleu|L': 2, 'bleu|XL': 2 }) && same(r.added.map((c) => c.id), ['bleu']) && same(r.last, { col: 'bleu', size: 'XL' }),
  '« noir M3 L5 bleu S-XL 2 » · per colour, and blue is added', JSON.stringify(r));
r = pc('M2 L1', [K.columnOf(PAL[0], 'fr'), K.columnOf(PAL[4], 'fr')]);
ok(same(r.map, { 'noir|M': 2, 'bleu|M': 2, 'noir|L': 1, 'bleu|L': 1 }) && !r.added.length, 'sizes before any colour · each colour gets them');
r = pc('marine L4');
ok(same(r.map, { 'bleu|L': 4 }) && r.added[0]?.id === 'bleu', '« marine » is blue');
ok(pc('noir m3 ble').pending && !pc('noir m3 ble').bad, 'a colour half typed waits, no error');
ok(pc('rouge').pending && pc('rouge').added[0]?.id === 'rouge', 'a colour alone · added, then waits for its sizes');
ok(pc('noir M3 Q').bad === 'Q', 'an unknown word is still named back');
const cat2 = {
  getProduct: () => ({ product: { name: 'Hoodie', kind: 'taille' }, variants: [{ id: 'v1', colorId: 'emeraude', colorLabel: 'Vert', colorHex: '#2E7D46', size: 'M', stock: 2 }, { id: 'v2', colorId: 'noir', colorLabel: 'Noir', colorHex: '#1A1A1A', size: 'XL', stock: 0 }] }),
  colorFamily: (v) => (v.colorId === 'emeraude' ? 'vert' : v.colorId),
};
const colsOld = K.columns(cat2, 'p', 'fr', PAL);
ok(same(colsOld.map((c) => [c.id, c.family, c.label]), [['emeraude', 'vert', 'Vert'], ['noir', 'noir', 'Noir']]), 'an existing product keeps its own colours, raw shade and family');
const cl = K.cells(cat2, 'p', colsOld, TAILLE);
ok(cl.length === 14 && cl.find((c) => c.col === 'emeraude' && c.size === 'M').key === 'v1' && cl.find((c) => c.col === 'emeraude' && c.size === 'S').key === 'new:emeraude:S',
  'cells · every size × colour; an existing variant keeps its id, a new one is keyed by colour and size');
ok(cl.find((c) => c.key === 'new:noir:L').colorLabel === 'Noir', 'a new cell carries its colour name and swatch for the catalog');
const cat3 = { getProduct: () => ({ product: { name: 'TEST Hoodie noir', kind: 'taille' }, variants: [] }) };
ok(same(K.columns(cat3, 'p', 'fr', PAL).map((c) => c.id), ['noir']), 'a new product named « … noir » starts with the black column');
const cat4 = { getProduct: () => ({ product: { name: 'Caftan', kind: 'taille' }, variants: [] }) };
ok(K.columns(cat4, 'p', 'fr', PAL)[0].unique === true, 'no colour said · the neutral column, as before');
const shopCols = [K.columnOf(PAL[0], 'fr'), K.columnOf(PAL[4], 'fr')];
const soldCat = (sold) => ({
  listProducts: () => [{ id: 'a' }],
  getProduct: () => ({ product: { kind: 'taille' }, variants: [{ id: 'n', colorId: 'noir' }, { id: 'b', colorId: 'bleu' }] }),
  colorFamily: (v) => v.colorId, soldMoves: () => sold,
});
let sh = S.colorSharesFor(soldCat([{ vid: 'n', n: 18 }, { vid: 'b', n: 6 }]), shopCols);
ok(sh.source === 'sales' && sh.weights[0] > sh.weights[1] * 2, 'colours follow the shop\'s sales per colour', JSON.stringify(sh));
sh = S.colorSharesFor(soldCat([{ vid: 'n', n: 20 }]), shopCols);
ok(sh.weights[1] > 0, 'a colour never sold still gets a share (it was just chosen)', JSON.stringify(sh));
ok(S.colorSharesFor(soldCat([{ vid: 'n', n: 3 }]), shopCols).source === 'even', 'too few sales · equal shares');

console.log('■ barcodes that read (boutique-size-codes.js)');
{
  const C = await import(pathToFileURL(path.join(root, 'assets/boutique-size-codes.js')).href);
  const ean = (c) => { let sum = 0; for (let i = 0; i < 12; i++) sum += (+c[i]) * (i % 2 === 0 ? 1 : 3); return (10 - (sum % 10)) % 10 === +c[12]; };
  const blackM = C.smartCode('p-kaftan', 'noir', 'M');
  const whiteXL = C.smartCode('p-kaftan', 'blanc', 'XL');
  const blueM = C.smartCode('p-kaftan', 'bleu', 'M');
  ok(/^2\d{12}$/.test(blackM) && ean(blackM) && ean(whiteXL) && ean(blueM), 'in-store EAN-13 (starts with 2) with a valid check digit', blackM);
  ok(blackM[1] === '1' && whiteXL[1] === '0' && blueM[1] === '8', 'the 2nd digit is the colour · 1 black, 0 white, 8 blue', [blackM, whiteXL, blueM].join(' '));
  ok(blackM[11] === '4' && whiteXL[11] === '6', 'the digit before the check is the size · M 4, XL 6');
  ok(C.sizeDigit('38') === 8 && C.sizeDigit('41') === 1 && C.sizeDigit('TU') === 0 && C.sizeDigit('XXS') === 1 && C.sizeDigit('3XL') === 8, 'shoes and numbered sizes · the last digit of the size (38 → 8); one size → 0');
  ok(blackM.slice(2, 11) === whiteXL.slice(2, 11) && blackM.slice(2, 11) !== C.smartCode('p-autre', 'noir', 'M').slice(2, 11), 'one product · one middle, shared by all its variants; another product · another middle');
  ok(C.smartCode('p-kaftan', 'noir', 'M') === blackM, 'the same on every device (no counter to share)');
  ok(C.colorDigit('beige') === C.colorDigit('marron') && C.colorDigit('quelconque') === 9 && C.colorDigit('unique') === 9, 'thirteen families on ten digits · beige and brown share 3; no colour → 9');
  ok(JSON.stringify(C.parts(blackM)) === JSON.stringify([blackM[0], blackM[1], blackM.slice(2, 11), blackM[11], blackM[12]]) && C.parts('3001234567890') === null, 'cut for display · prefix, colour, item, size, check; not an in-store code → nothing');
  const seen = new Set(); let clash = 0;
  for (let i = 0; i < 5000; i++) { const m = C.productNumber('p' + i); if (seen.has(m)) clash++; seen.add(m); }
  ok(clash === 0, '5 000 products · 5 000 different middles', String(clash));
}

console.log('■ the catalog says what it sold (boutique-catalog.js › soldMoves)');
const src = fs.readFileSync(path.join(root, 'assets/boutique-catalog.js'), 'utf8');
const line = src.split('\n').find((l) => /^\s+soldMoves:/.test(l)) || '';
ok(/why === 'vente'/.test(line) && /m\.d < 0/.test(line), 'only confirmed sales leave the shelf · « vente », negative moves');
ok(/n: -m\.d/.test(line) && !/reserve/.test(line), 'pieces counted positive; a held basket (« reserve ») is not a sale');

console.log('■ wiring');
const sizes = fs.readFileSync(path.join(root, 'assets/boutique-sizes.js'), 'utf8');
ok(/splitOn = rich && shown\.length > 1;/.test(sizes) && /const rich = !ro && sizeColorsOn\(\);/.test(sizes), 'never on a read-only till or a single box, and only with the merchant option');
{
  const Z = await import(pathToFileURL(path.join(root, 'assets/boutique-sizes.js')).href);
  const keys = {};
  const prev = { window: globalThis.window, localStorage: globalThis.localStorage };
  globalThis.localStorage = { getItem: (k) => (k in keys ? keys[k] : null) };
  globalThis.window = { KiwiConfig: { features: {} }, KiwiEnv: { isReal: () => true } };
  const off = Z.sizeColorsOn();
  keys.kiwiSizeColors = '1';
  const keyOnReal = Z.sizeColorsOn();
  window.KiwiConfig.features.boutiqueSizeColors = true;
  const optionOn = Z.sizeColorsOn();
  window.KiwiConfig.features = {}; window.KiwiEnv.isReal = () => false;
  const keyOnDemo = Z.sizeColorsOn();
  globalThis.window = prev.window; globalThis.localStorage = prev.localStorage;
  ok(off === false && optionOn === true, 'off by default; the console option turns it on for that merchant');
  ok(keyOnReal === false && keyOnDemo === true, 'the browser key only counts outside a real account (demo, local trial)');
}
{
  const admin = fs.readFileSync(path.join(root, "kiwi-admin.html"), 'utf8');
  ok(/key:'boutiqueSizeColors', label:'Tailles et couleurs rapides', off:true/.test(admin), 'the console offers the option under Boutique, off by default');
}
ok(/import \* as SPLIT from '\.\/boutique-size-split\.js\?v=\d+'/.test(sizes) && /import \* as COLORS from '\.\/boutique-size-colors\.js\?v=\d+'/.test(sizes) && /r\.colorLabel \? \{ colorLabel: r\.colorLabel, colorHex: r\.colorHex \}/.test(sizes), 'both modules imported with a stamp; a new colour cell is created with its colour name and swatch');
const sw = fs.readFileSync(path.join(root, 'kiwi-sw.js'), 'utf8');
ok(/'\/assets\/boutique-size-split\.js\?v=\d+'/.test(sw) && /'\/assets\/boutique-size-colors\.js\?v=\d+'/.test(sw), 'both modules precached for the offline till');
const mod = fs.readFileSync(path.join(root, 'assets/boutique-size-split.js'), 'utf8') + fs.readFileSync(path.join(root, 'assets/boutique-size-colors.js'), 'utf8');
ok(!/fetch\(|XMLHttpRequest|sendBeacon/.test(mod), 'computed on the device · no network call');
ok(!/—/.test(mod.replace(/\/\*[\s\S]*?\*\//g, '')), 'no em dash in what the cashier reads');

console.log(`\nboutique-size-split: ${n} passed, ${bad} failed`);
process.exit(bad ? 1 : 0);
