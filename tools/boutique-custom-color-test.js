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
assert.match(colors.picker('test', { id: 'custom-12abef', label: 'Bleu client', hex: '#12ABEF', custom: true }, { custom: true }), /background-color:#12ABEF/, 'picker restores an existing custom selection');

const C = window.KiwiBoutiqueCatalog;
C.use('custom-colour-test');
const p = C.addProduct({ name: 'Chemise client', priceMAD: 250, photo: 'https://cdn.example.test/chemise.jpg' });
const v = C.addVariant({ productId: p.id, colorId: 'custom-12abef', colorLabel: 'Bleu client', colorHex: '#12ABEF', size: 'M', stock: 2 });
assert.equal(v.colorFamily, 'bleu');
assert.equal(v.colorHex, '#12ABEF', 'catalogue keeps the exact custom hex');
assert.equal(v.colorLabel, 'Bleu client', 'catalogue keeps the owner-facing custom label');
const till = C.compat().P[p.id];
assert.deepEqual(till.colors, ['custom-12abef'], 'caisse receives the exact custom colour id');
assert.equal(till.photo, 'https://cdn.example.test/chemise.jpg', 'caisse receives the product photo');
assert.deepEqual(C.getProduct(p.id).colors, [{
  id: 'custom-12abef', label: 'Bleu client', hex: '#12ABEF', custom: true,
}], 'dashboard product view keeps the exact custom swatch');
assert.deepEqual(C.getProduct(p.id).families, ['bleu'], 'dashboard filters still use the broad reporting family');

const pos = fs.readFileSync(path.join(ROOT, 'assets/pos-boutique.js'), 'utf8');
assert.match(pos, /productVisual\(p\)/, 'caisse cards use the shared product media renderer');
assert.match(pos, /hit\.colorId && p\.colors\.includes\(hit\.colorId\)/, 'barcode scans retain exact custom colour identity');
assert.match(pos, /k\.display\(v\.colorId, v\.colorLabel, v\.colorHex\)/, 'caisse inventory renders the exact custom swatch');
const pages = fs.readFileSync(path.join(ROOT, 'assets/pages-pro.js'), 'utf8');
assert.match(pages, /k\.display\(v\.colorId, v\.colorLabel, v\.colorHex\)/, 'dashboard variant rows render the exact custom swatch');

console.log('boutique-custom-color-test: 17 controls passed');
