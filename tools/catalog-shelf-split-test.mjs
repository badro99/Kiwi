/* Big catalogues: the fast storage keeps only the shelf (in-stock items), the
   full catalogue lives in IndexedDB, and a till that holds only the shelf
   never pushes it to the server (that would erase every sold-out product).
   Real assets in a vm, asynchronous IndexedDB shim, mocked /api/catalog. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const tick = () => new Promise((resolve) => setTimeout(resolve, 2));
async function settle(n = 40) { for (let i = 0; i < n; i++) await tick(); }

function idbShim() {
  const docs = new Map();
  return { docs, open() {
    const request = {};
    setTimeout(() => {
      request.result = { createObjectStore() {}, transaction() {
        const tx = {}, changes = [];
        let pending = 0;
        const finish = () => setTimeout(() => { if (pending) return; changes.forEach((fn) => fn()); tx.oncomplete?.(); }, 1);
        const op = (fn) => { const r = {}; pending++; setTimeout(() => { r.result = fn(); r.onsuccess?.(); pending--; finish(); }, 0); return r; };
        tx.objectStore = () => ({ get: (k) => op(() => structuredClone(docs.get(k))), put: (v, k) => op(() => { const copy = structuredClone(v); changes.push(() => docs.set(k, copy)); }), delete: (k) => op(() => changes.push(() => docs.delete(k))) });
        return tx;
      } };
      request.onupgradeneeded?.(); request.onsuccess?.();
    }, 0);
    return request;
  } };
}
function storage() {
  const data = new Map();
  return { data, getItem: (k) => (data.has(k) ? data.get(k) : null), setItem(k, v) { data.set(k, String(v)); }, removeItem: (k) => data.delete(k) };
}

const helper = fs.readFileSync(new URL('../assets/request-deadline.mjs', import.meta.url), 'utf8').replace('export ', '');
const parts = fs.readFileSync(new URL('../assets/boutique-catalog-parts.js', import.meta.url), 'utf8')
  .replaceAll("import('./request-deadline.mjs')", 'Promise.resolve({ deadlineFetch })');
const core = fs.readFileSync(new URL('../assets/boutique-catalog.js', import.meta.url), 'utf8');
const palette = fs.readFileSync(new URL('../assets/color-palette.js', import.meta.url), 'utf8');

function browser({ idb, ls, venue = 'big-shop', fetch, real = false }) {
  const el = () => ({ style: {}, classList: { add() {}, remove() {} }, appendChild() {}, setAttribute() {} });
  const w = { indexedDB: idb, localStorage: ls, console, AbortController,
    document: { addEventListener() {}, querySelector: () => null, querySelectorAll: () => [], getElementById: () => null, createElement: el, head: el(), body: el(), visibilityState: 'visible' },
    KiwiEnv: { isReal: () => real }, navigator: {}, addEventListener() {}, dispatchEvent() { return true; },
    CustomEvent: class { constructor(type, o) { this.type = type; this.detail = o && o.detail; } },
    setTimeout: (fn, ms) => setTimeout(fn, ms >= 2000 ? ms : Math.min(ms || 0, 3)), clearTimeout,
    fetch: fetch || (() => Promise.reject(Error('offline'))) };
  w.window = w; w.self = w;
  vm.createContext(w);
  vm.runInContext(palette, w);
  vm.runInContext(helper + '\n' + parts, w);
  vm.runInContext(fs.readFileSync(new URL('../assets/boutique-catalog-shelf.js', import.meta.url), 'utf8'), w);
  vm.runInContext(core, w);
  const K = w.KiwiBoutiqueCatalog; K.use(venue);
  return K;
}

/* 1 200 products, 200 of them in stock: ~1,3 Mo of JSON, above the split. */
function bigDoc() {
  const pad = 'x'.repeat(900);
  const products = [], variants = [];
  for (let i = 0; i < 1200; i++) {
    products.push({ id: 'p' + i, name: 'Article ' + i + ' ' + pad, priceMAD: 100, categoryId: null });
    const stock = i < 200 ? 5 : 0;
    variants.push({ id: 'v' + i, productId: 'p' + i, colorId: 'noir', size: 'M', stock, base: stock, baseAt: 1, barcodes: [] });
  }
  return { v: 1, categories: [], products, variants, seq: 0, removed: {}, moves: [] };
}
const KEY = 'kiwiBoutiqueCatalog:v1:big-shop';

/* 0 · The till loads parts + shelf as ONE script (kiwi-caisse.html has no
       script slot left): the bundle is exactly the two files, in that order. */
const src = (f) => fs.readFileSync(new URL('../assets/' + f, import.meta.url), 'utf8');
assert.equal(src('boutique-catalog-till.js'), src('boutique-catalog-parts.js') + src('boutique-catalog-shelf.js'),
  'assets/boutique-catalog-till.js is stale: cat assets/boutique-catalog-parts.js assets/boutique-catalog-shelf.js > assets/boutique-catalog-till.js');

/* 1 · A mutation on a big catalogue writes the shelf locally and the whole
       catalogue to IndexedDB. */
const idb = idbShim(), ls = storage();
ls.setItem(KEY, JSON.stringify(bigDoc()));
let K = browser({ idb, ls });
assert.equal(K.listProducts().length, 1200);
K.adjustStock('v0', -1, 'vente');
await settle();
const shelf = JSON.parse(ls.getItem(KEY));
assert.ok(shelf._shelf, 'the local copy is marked as a shelf');
assert.equal(shelf.products.length, 200, 'only in-stock products stay in the fast storage');
assert.equal(shelf.variants.length, 200);
assert.equal(shelf._shelf.cold, 1000);
assert.ok(ls.getItem(KEY).length < 400000, 'the shelf is a fraction of the catalogue');
assert.equal(idb.docs.get(KEY).doc.products.length, 1200, 'IndexedDB keeps the whole catalogue');
assert.equal(K.durable(), true);

/* 2 · Reopening: the shelf is there at once, the sold-out products follow. */
K = browser({ idb, ls });
assert.equal(K.listProducts().length, 200, 'first paint = the shelf');
await settle();
assert.equal(K.listProducts().length, 1200, 'the sold-out products are back from IndexedDB');
assert.equal(K.listVariants('p0')[0].stock, 4);

/* 3 · A product that sells out leaves the shelf but stays in the catalogue. */
K.adjustStock('v1', -5, 'vente');
await settle();
assert.equal(JSON.parse(ls.getItem(KEY)).products.length, 199);
K = browser({ idb, ls }); await settle();
assert.equal(K.listProducts().length, 1200);
assert.equal(K.listVariants('p1')[0].stock, 0);

/* 4 · IndexedDB lost (cleared, other browser profile): the till holds only
       the shelf. Even with the revision noted as current, it re-reads the
       server, and NO push ever carries the shelf alone. */
{
  const server = bigDoc();
  const posts = [];
  const fetch = (url, init) => {
    if (init && init.method === 'POST') {
      const body = JSON.parse(init.body);
      posts.push(body.data.products.length);
      return Promise.resolve({ ok: true, status: 200, json: async () => ({ ok: true, rev: 8 }) });
    }
    return Promise.resolve({ ok: true, status: 200, json: async () => ({ merchant: 'big-shop', rev: 7, data: server }) });
  };
  const lone = storage();
  lone.setItem(KEY, ls.getItem(KEY));
  lone.setItem('kiwiCatalogRev:v1:big-shop', '7');
  lone.setItem('kiwiPairedVenue', JSON.stringify({ merchant: 'big-shop' }));
  const disk = idbShim();
  const T = browser({ idb: disk, ls: lone, fetch });
  assert.equal(T.listProducts().length, 199);
  T.adjustStock('v2', -1, 'vente');          // a sale before the full copy is back
  await settle(80);
  assert.equal(T.listProducts().length, 1200, 'the server copy filled the sold-out products in');
  assert.ok(posts.length >= 1, 'the sale still reached the server');
  assert.ok(posts.every((n) => n === 1200), 'never a shelf-only push: ' + posts.join(','));
  /* Switching away and back: the server was already read, the IndexedDB copy
     is gone again, the sale must still not push the shelf alone. */
  T.use('other-shop'); disk.docs.clear(); posts.length = 0;
  T.use('big-shop');
  assert.equal(T.listProducts().length, 199);
  T.adjustStock('v3', -1, 'vente');
  await settle(80);
  assert.ok(posts.length >= 1, 'the sale reached the server after the switch');
  assert.ok(posts.every((n) => n === 1200), 'never a shelf-only push after a switch: ' + posts.join(','));
}

/* 5 · Small catalogues are untouched: same bytes, no IndexedDB copy. */
{
  const small = storage(), disk = idbShim();
  const S = browser({ idb: disk, ls: small, venue: 'small-shop' });
  const p = S.addProduct({ name: 'Petit', priceMAD: 10 });
  S.addVariant({ productId: p.id, colorId: 'noir', size: 'M', stock: 0 });
  await settle();
  const raw = JSON.parse(small.getItem('kiwiBoutiqueCatalog:v1:small-shop'));
  assert.equal(raw._shelf, undefined);
  assert.equal(raw.products.length, 1, 'a sold-out product of a small catalogue stays local');
  assert.equal(disk.docs.size, 0);
}

console.log('✓ catalog-shelf-split-test: shelf in fast storage, full catalogue in IndexedDB, never a shelf-only push');
