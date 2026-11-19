#!/usr/bin/env node
/* Catalogue partagé · une boutique de la famille crée des identifiants à elle.
 * Rabat et Casablanca créent un article dans la même minute, avant de s'être
 * vues : sans étiquette, les deux s'appellent « prod_15 » et la fusion en fait
 * UN article. Avec l'étiquette que /api/catalog donne à chaque boutique de la
 * famille (functions/api/_catalog-family.js), les deux restent deux. Une
 * boutique hors famille garde ses identifiants d'avant. Vrai code du catalogue.
 *   node tools/catalog-family-id-test.mjs */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const DIR = process.env.KIWI_FAMILY_ID_DIR || new URL('../assets/', import.meta.url).pathname;
const src = (f) => fs.readFileSync(DIR + f, 'utf8');

function till(slug, tag) {
  const data = new Map();
  if (tag) data.set('kiwiCatalogIdTag:v1:' + slug, tag);
  const storage = { getItem: (k) => (data.has(k) ? data.get(k) : null), setItem: (k, v) => data.set(k, String(v)), removeItem: (k) => data.delete(k) };
  const el = () => ({ style: {}, classList: { add() {}, remove() {} }, appendChild() {}, setAttribute() {} });
  const w = { localStorage: storage, console,
    document: { documentElement: { lang: 'fr' }, addEventListener() {}, querySelector: () => null, querySelectorAll: () => [], getElementById: () => null, createElement: el, head: el(), body: el() },
    KiwiEnv: { isReal: () => false }, navigator: {}, addEventListener() {}, dispatchEvent() { return true; },
    CustomEvent: class { constructor(type, o) { this.type = type; this.detail = (o || {}).detail; } },
    setTimeout: () => 0, clearTimeout() {}, fetch: () => Promise.reject(Error('offline')) };
  w.window = w; w.self = w;
  vm.createContext(w);
  for (const f of ['color-palette.js', 'boutique-catalog-parts.js', 'boutique-catalog.js']) vm.runInContext(src(f), w);
  w.KiwiBoutiqueCatalog.use(slug);
  return w.KiwiBoutiqueCatalog;
}

const rabat = till('santos-store', 'k2x9a');
const casa = till('santos-store-casablanca', '7hq1m');
const a = rabat.addProduct({ name: 'Veste Rabat', priceMAD: 300 });
const b = casa.addProduct({ name: 'Veste Casablanca', priceMAD: 300 });
assert.match(a.id, /^prod_\d+_k2x9a$/, 'Rabat tags its ids: ' + a.id);
assert.match(b.id, /^prod_\d+_7hq1m$/, 'Casablanca tags its ids: ' + b.id);
assert.notEqual(a.id, b.id, 'same counter, two shops, two ids');
const v = casa.addVariant({ productId: b.id, colorId: 'noir', size: 'M', stock: 0 });
assert.match(v.id, /_7hq1m$/, 'variants too: ' + v.id);
const solo = till('solo-boutique', '');
assert.match(solo.addProduct({ name: 'Seule', priceMAD: 10 }).id, /^prod_\d+$/, 'outside a family nothing changes');
const bad = till('odd-boutique', 'NOT A TAG!');
assert.match(bad.addProduct({ name: 'x', priceMAD: 10 }).id, /^prod_\d+$/, 'a malformed tag is ignored');
console.log('catalog-family-id: 6 passed');
