#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');

const store = new Map();
const localStorage = {
  getItem: (k) => store.has(k) ? store.get(k) : null,
  setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k),
  get length() { return store.size; }, key: (i) => Array.from(store.keys())[i],
};
const el = () => ({ id: '', textContent: '', style: {}, setAttribute() {}, appendChild() {},
  querySelector: () => null, querySelectorAll: () => [], addEventListener() {}, classList: { add() {}, remove() {} } });
const document = { readyState: 'complete', visibilityState: 'visible', addEventListener() {},
  getElementById: () => null, createElement: el, querySelector: () => null, querySelectorAll: () => [], head: el(), body: el() };
const window = { document, localStorage, addEventListener() {}, removeEventListener() {},
  KiwiEnv: { isReal: () => false, local: true, hosted: false, demosAllowed: true },
  setTimeout, clearTimeout, fetch: () => Promise.reject(new Error('offline')),
  CustomEvent: class { constructor(type, opts) { this.type = type; this.detail = (opts || {}).detail; } }, navigator: { userAgent: 'node' } };
window.window = window;

function load(file) {
  const src = fs.readFileSync(path.join(ROOT, file), 'utf8');
  new Function('window', 'document', 'localStorage', 'setTimeout', 'clearTimeout', 'fetch', 'CustomEvent', 'navigator', 'self', src)(
    window, document, localStorage, setTimeout, clearTimeout, window.fetch, window.CustomEvent, window.navigator, window);
}

load('assets/barcode.js');
load('assets/color-palette.js');
load('assets/boutique-catalog.js');

const colors = window.KiwiColors;
assert.equal(colors.familyId('custom-12abef', '', '#12ABEF'), 'bleu', 'custom colour still has a reporting family');
assert.deepEqual(colors.display('custom-12abef'), {
  id: 'custom-12abef', label: 'Couleur personnalisée #12ABEF', hex: '#12ABEF', light: false, custom: true,
}, 'custom colour keeps its exact display value');
assert.match(colors.picker('test', 'noir', { custom: true }), /data-kc-more/, 'picker exposes the plus button');
assert.match(colors.picker('test', 'noir', { custom: true }), /data-kc-name-input/, 'custom picker lets the merchant name the colour');
assert.match(colors.picker('test', { id: 'custom-12abef', label: 'Bleu client', hex: '#12ABEF', custom: true }, { custom: true }), /background-color:#12ABEF/, 'picker restores an existing custom selection');

const C = window.KiwiBoutiqueCatalog;
C.use('custom-colour-test');
const p = C.addProduct({ name: 'Chemise client', priceMAD: 250, photo: 'https://cdn.example.test/chemise.jpg' });
const v = C.addVariant({ productId: p.id, colorId: 'custom-12abef', colorLabel: 'Bleu client', colorHex: '#12ABEF', size: 'M', stock: 2 });
const v2 = C.addVariant({ productId: p.id, colorId: 'custom-12abef', colorLabel: 'Bleu client', colorHex: '#12ABEF', size: 'L', stock: 1 });
const other = C.addVariant({ productId: p.id, colorId: 'custom-12abf0', colorLabel: 'Bleu voisin', colorHex: '#12ABF0', size: 'XL', stock: 4 });
const code = C.generateBarcode(v.id);
assert.equal(v.colorFamily, 'bleu');
assert.equal(v.colorHex, '#12ABEF', 'catalogue keeps the exact custom hex');
assert.equal(v.colorLabel, 'Bleu client', 'catalogue keeps the owner-facing custom label');
const till = C.compat().P[p.id];
assert.deepEqual(till.colors, ['custom-12abef', 'custom-12abf0'], 'caisse receives each exact custom colour id');
assert.equal(till.photo, 'https://cdn.example.test/chemise.jpg', 'caisse receives the product photo');
assert.deepEqual(C.getProduct(p.id).colors, [{
  id: 'custom-12abef', label: 'Bleu client', hex: '#12ABEF', custom: true,
}, {
  id: 'custom-12abf0', label: 'Bleu voisin', hex: '#12ABF0', custom: true,
}], 'dashboard product view keeps the exact custom swatch');
assert.deepEqual(C.getProduct(p.id).families, ['bleu'], 'dashboard filters still use the broad reporting family');
assert.equal(C.renameColor('custom-12abef', '  Bleu lagon  '), 2, 'rename updates every size carrying the exact custom colour');
const renamed = C.listVariants(p.id).filter((x) => x.colorId === 'custom-12abef');
assert.deepEqual(renamed.map((x) => x.colorLabel), ['Bleu lagon', 'Bleu lagon'], 'renamed colour is consistent across sizes');
assert.deepEqual(renamed.map((x) => x.stock), [2, 1], 'rename preserves stock');
assert.equal(renamed[0].barcodes[0].code, code, 'rename preserves barcodes');
assert.equal(C.listVariants(p.id).find((x) => x.id === other.id).colorLabel, 'Bleu voisin', 'nearby custom hex is not renamed');
assert.equal(C.renameColor('bleu', 'Bleu maison'), 0, 'built-in family labels cannot be overwritten per venue');

const pos = fs.readFileSync(path.join(ROOT, 'assets/pos-boutique.js'), 'utf8');
assert.match(pos, /productVisual\(p\)/, 'caisse cards use the shared product media renderer');
assert.match(pos, /hit\.colorId && p\.colors\.includes\(hit\.colorId\)/, 'barcode scans retain exact custom colour identity');
assert.match(pos, /k\.display\(v\.colorId, v\.colorLabel, v\.colorHex\)/, 'caisse inventory renders the exact custom swatch');
assert.match(pos, /function variantSource\(v\)/, 'caisse suppresses a duplicate custom colour subtitle');
const pages = fs.readFileSync(path.join(ROOT, 'assets/pages-pro.js'), 'utf8');
assert.match(pages, /k\.display\(v\.colorId, v\.colorLabel, v\.colorHex\)/, 'dashboard variant rows render the exact custom swatch');
assert.match(pages, /function _bqxColorSource\(v\)/, 'dashboard suppresses a duplicate custom colour subtitle');
assert.match(pages, /data-bqx-vcname/, 'dashboard exposes the custom colour name field');
assert.match(pages, /CAT\(\)\.renameColor\(color\.id, name\)/, 'dashboard applies a renamed colour to every matching variant');

console.log('boutique-custom-color-test: 29 controls passed');
