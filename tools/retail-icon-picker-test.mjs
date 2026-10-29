#!/usr/bin/env node
/* The till photo on the dashboard product sheet (owner, 28 October 2026:
 * « when a merchant is entering the product, does he get suggestions? »).
 *
 * The boutique and Maison tills draw each product with a photo picked from
 * its name (assets/retail-photos.js). The product sheet now shows that photo
 * while the name is typed, and lets the merchant pick another one; a pick
 * made by hand (`artPicked`) wins over the name at the till, and survives
 * the catalogue's trip through the server. Products saved before the flag
 * keep the old rule: the name first.
 *
 * What this holds: the picker offers every photo once, named in FR/EN/AR;
 * its search knows the trade's words; what the sheet saves; the till's rule
 * with and without the flag; the flag through addProduct, updateProduct, the
 * till's catalogue and the server's sanitizer. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PICKER_KEYS, pieceName, searchPieces, tillPhotoState } from '../assets/retail-icon-picker.js';
import { PHOTO_KEYS, photoKey, photoFile } from '../assets/retail-photos.js';
import { __test as server } from '../functions/api/catalog.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let n = 0;
const ok = (v, m) => { assert.ok(v, m); n++; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); n++; };

/* Every photo once in the grid, each with a name in three languages. */
eq(PICKER_KEYS.length, new Set(PICKER_KEYS).size, 'no photo twice in the grid');
eq([...PICKER_KEYS].sort(), [...PHOTO_KEYS].sort(), 'the grid offers every photo the till can draw');
for (const k of PICKER_KEYS) {
  for (const l of ['fr', 'en', 'ar']) ok(pieceName(k, l) && pieceName(k, l) !== k, `${k} has a ${l} name`);
}
ok(/[؀-ۿ]/.test(pieceName('djellaba', 'ar')), 'the Arabic names are Arabic');

/* Search: labels in three languages and the words of the trade. */
const first = (q) => searchPieces(q)[0];
eq(first('zarbia'), 'tapis', 'zarbia is the rug');
eq(first('berrad'), 'theiere', 'berrad is the teapot');
eq(first('bdaia'), 'gilet_brode', 'bdaia is the embroidered gilet');
eq(first('hoodie'), 'sweat', 'English works');
eq(first('عباية'), 'abaya', 'Arabic works');
ok(searchPieces('abay').includes('abaya'), 'a word being typed already finds');
ok(searchPieces('caftan').length >= 6, 'every caftan answers « caftan »');
ok(searchPieces('bougie').includes('bougie'), 'candles');
eq(searchPieces('xqzw'), [], 'nothing for nonsense');
eq(searchPieces('').length, PICKER_KEYS.length, 'an empty search shows everything');

/* What the sheet saves. */
eq(tillPhotoState('Djellaba femme brodée', '', false), { art: 'djellaba_femme', artPicked: false }, 'the name decides and is written down');
eq(tillPhotoState('Djellaba femme', 'caftan', true), { art: 'caftan', artPicked: true }, 'a pick by hand stays');
eq(tillPhotoState('A71030TA', 'tshirt', false), { art: '', artPicked: false }, 'the old default T-shirt is not kept as a choice');
eq(tillPhotoState('Article 42', 'bougie', false), { art: 'bougie', artPicked: false }, 'an icon from before stays while the name says nothing');
eq(tillPhotoState('Article 42', 'disparu', true), { art: '', artPicked: false }, 'an unknown key is never kept');

/* The till: a pick by hand wins over the name, and only then. */
eq(photoKey({ name: 'Djellaba femme', art: 'caftan', artPicked: true }), 'caftan', 'picked by hand: the till obeys');
eq(photoKey({ name: 'Hoodie Blue', art: 'chemise' }), 'sweat', 'no flag: the name still wins over an old mis-pick');
eq(photoKey({ name: 'Bougie', art: 'nope', artPicked: true }), 'bougie', 'a flag on an unknown key falls back to the name');
eq(photoFile({ name: 'Abaya', art: 'abaya', artPicked: true, colors: ['noir'] }), 'abaya-noir', 'a picked piece still takes its colour');

/* The flag through the catalogue the dashboard and the till share. */
function browser() {
  const store = new Map();
  const localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k), get length() { return store.size; }, key: (i) => [...store.keys()][i] };
  const node = () => ({ style: {}, classList: { add() {}, remove() {} }, appendChild() {}, addEventListener() {}, setAttribute() {} });
  const document = { addEventListener() {}, dispatchEvent() {}, createElement: node, getElementById: () => null,
    querySelector: () => null, querySelectorAll: () => [], head: node(), body: node() };
  const window = { document, localStorage, addEventListener() {}, removeEventListener() {},
    KiwiEnv: { isReal: () => false, local: true, hosted: false, demosAllowed: true },
    CustomEvent: class { constructor(type, o) { this.type = type; this.detail = (o || {}).detail; } },
    navigator: { userAgent: 'node' }, setTimeout, clearTimeout, fetch: () => Promise.reject(new Error('offline test')) };
  window.window = window;
  for (const rel of ['assets/barcode.js', 'assets/color-palette.js', 'assets/boutique-catalog-parts.js', 'assets/boutique-catalog.js']) {
    const run = new Function('window', 'document', 'localStorage', 'CustomEvent', 'navigator', 'setTimeout', 'clearTimeout', 'fetch', 'self', 'console',
      fs.readFileSync(path.join(ROOT, rel), 'utf8'));
    run(window, document, localStorage, window.CustomEvent, window.navigator, setTimeout, clearTimeout, window.fetch, window, console);
  }
  return window.KiwiBoutiqueCatalog;
}
const C = browser();
const a = C.addProduct({ name: 'Djellaba femme', priceMAD: 900, art: 'caftan', artPicked: true });
const b = C.addProduct({ name: 'Bougie Lodge', priceMAD: 120 });
eq([a.art, a.artPicked], ['caftan', true], 'addProduct keeps the pick');
eq(b.artPicked, false, 'a product without a pick has the flag off');
const till = C.compat().P;
eq([till[a.id].art, till[a.id].artPicked], ['caftan', true], "the till's catalogue carries the pick");
eq(photoKey(till[a.id], 'cintre'), 'caftan', 'and the till draws it');
C.updateProduct(a.id, { art: 'djellaba_femme', artPicked: false });
eq(C.getProduct(a.id).product.artPicked, false, '« Let the name decide » clears the flag');
C.updateProduct(a.id, { name: 'Djellaba femme bleue' });
eq(C.getProduct(a.id).product.artPicked, false, 'an edit that does not touch the photo leaves the flag alone');

const clean = server.sanitize({ v: 1, categories: [], variants: [], products: [
  { id: 'p1', name: 'Djellaba femme', art: 'caftan', artPicked: true },
  { id: 'p2', name: 'Bougie', art: '' },
] });
eq(clean.products.map((p) => [p.art, p.artPicked]), [['caftan', true], ['', false]], 'the server keeps the flag, and only as a boolean');

console.log(`✓ till photo picker: ${n} checks`);
