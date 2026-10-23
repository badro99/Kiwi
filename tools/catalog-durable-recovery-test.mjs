/* Offline recovery drives the real catalogue in fresh browser contexts. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
const require = createRequire(new URL('../app/package.json', import.meta.url));
const tick = () => new Promise(resolve => setTimeout(resolve, 2));
// No fake-indexeddb installed: asynchronous requests, staged writes, transaction commit.
function shim(fail = false) {
  const docs = new Map();
  return { docs, open() {
    const request = {};
    setTimeout(() => {
      request.result = { createObjectStore() {}, transaction() {
        const tx = {}, changes = [];
        let pending = 0;
        const finish = () => setTimeout(() => { if (pending) return; if (fail) { tx.onabort?.(); return; } changes.forEach(fn => fn()); tx.oncomplete?.(); }, 1);
        const op = fn => { const r = {}; pending++; setTimeout(() => { r.result = fn(); r.onsuccess?.(); pending--; finish(); }, 0); return r; };
        tx.objectStore = () => ({ get: k => op(() => structuredClone(docs.get(k))), put: (v, k) => op(() => { const copy = structuredClone(v); changes.push(() => docs.set(k, copy)); }), delete: k => op(() => changes.push(() => docs.delete(k))) });
        return tx;
      } };
      request.onupgradeneeded?.(); request.onsuccess?.();
    }, 0);
    return request;
  } };
}
let makeIDB;
try { const { IDBFactory } = require('fake-indexeddb'); makeIDB = () => new IDBFactory(); console.log('real fake-indexeddb implementation'); }
catch { makeIDB = shim; console.log('fake-indexeddb absent: asynchronous in-memory IDB shim'); }
function browser(idb, storage, venue = 'recovery-a') {
  const events = [];
  const el = () => ({ style: {}, classList: { add() {}, remove() {} }, appendChild() {}, setAttribute() {} });
  const w = { indexedDB: idb, localStorage: storage, console,
    document: { addEventListener() {}, querySelector: () => null, querySelectorAll: () => [], getElementById: () => null, createElement: el, head: el(), body: el() },
    KiwiEnv: { isReal: () => true }, navigator: {}, addEventListener() {}, dispatchEvent: e => events.push(e.detail),
    CustomEvent: class { constructor(type, o) { this.type = type; this.detail = o.detail; } },
    setTimeout: () => 0, clearTimeout() {}, fetch: () => Promise.reject(Error('offline')) };
  w.window = w; w.self = w;
  vm.createContext(w);
  for (const f of ['color-palette', 'boutique-catalog-parts', 'boutique-catalog']) vm.runInContext(fs.readFileSync(new URL(`../assets/${f}.js`, import.meta.url), 'utf8'), w);
  const K = w.KiwiBoutiqueCatalog; K.use(venue);
  return { K, events };
}
function storage() {
  const data = new Map();
  return { refusing: true, getItem: k => data.get(k) || null, setItem(k, v) { if (this.refusing) throw Object.assign(Error('quota'), { name: 'QuotaExceededError' }); data.set(k, String(v)); }, removeItem: k => data.delete(k) };
}
async function settle() { for (let i = 0; i < 25; i++) await tick(); }
function create(K) {
  const p = K.addProduct({ name: 'Article de récupération', priceMAD: 100 });
  const v = K.addVariant({ productId: p.id, colorId: 'noir', size: 'M', stock: 8 });
  K.generateBarcode(v.id);
  K.adjustStock(v.id, -1, 'vente');
  return { p, v };
}
const idb = makeIDB(), ls = storage();
let b = browser(idb, ls); const { p, v } = create(b.K);
assert.equal(b.K.durable(), false, 'not durable before transaction commit');
await settle();
assert.equal(b.K.durable(), true, 'durable after IDB transaction commit');
assert.equal(b.events[0].durable, false); assert.equal(b.events.at(-1).durable, true);
assert.ok(b.events.every(e => e.store === 'catalog' && e.key === b.K._key));
b = browser(idb, ls); let renders = 0; b.K.subscribe(() => renders++); await settle();
assert.equal(b.K.getProduct(p.id).product.name, p.name);
assert.equal(b.K.listVariants(p.id)[0].stock, 7);
assert.equal(b.K.listVariants(p.id)[0].barcodes[0].code, v.barcodes[0].code);
assert.ok(b.K._doc().moves.some(m => m.why === 'vente')); assert.ok(renders);
const other = browser(idb, ls, 'recovery-b'); await settle(); assert.equal(other.K.listProducts().length, 0);
ls.refusing = false; b = browser(idb, ls); await settle();
assert.equal(JSON.parse(ls.getItem(b.K._key)).variants[0].stock, 7);
const read = () => new Promise(resolve => { const r = idb.open('kiwi-catalog', 1); r.onsuccess = () => { const tx = r.result.transaction('docs', 'readonly'); const q = tx.objectStore('docs').get(b.K._key); q.onsuccess = () => resolve(q.result); }; });
assert.equal(await read(), undefined, 'fallback removed after localStorage recovery');
for (const unavailable of [undefined, { open() { throw Error('refused'); } }, shim(true)]) { const x = browser(unavailable, storage()); create(x.K); await settle(); assert.equal(x.K.durable(), false); }
// Switch while both reads and writes are still pending, including A -> B -> A.
const switchedDisk = makeIDB(), switchedLS = storage();
const switched = browser(switchedDisk, switchedLS);
const first = create(switched.K);
switched.K.use('recovery-b');
assert.equal(switched.K.listProducts().length, 0);
const second = create(switched.K);
await settle();
switched.K.use('recovery-a'); switched.K.use('recovery-b');
await settle();
assert.equal(switched.K.listProducts().length, 1);
assert.equal(switched.K._doc().variants[0].barcodes[0].code, second.v.barcodes[0].code);
switched.K.use('recovery-a'); await settle();
assert.equal(switched.K._doc().variants[0].barcodes[0].code, first.v.barcodes[0].code);
let fc; try { fc = require('fast-check'); } catch {}
if (fc) await fc.assert(fc.asyncProperty(fc.array(fc.record({ kind: fc.constantFrom('create', 'sell', 'receive'), refuse: fc.boolean() }), { minLength: 1, maxLength: 25 }), async ops => {
  const disk = makeIDB(), local = storage(); let x = browser(disk, local); const ids = [];
  await settle();
  for (const op of ops) {
    local.refusing = op.refuse;
    if (op.kind === 'create' || !ids.length) ids.push(create(x.K).v.id);
    else x.K.adjustStock(ids.at(-1), op.kind === 'sell' ? -1 : 2, op.kind === 'sell' ? 'vente' : 'reception');
    await settle();
  }
  const stocks = JSON.stringify(x.K._doc().variants.map(v => [v.id, v.stock]));
  x = browser(disk, local); await settle();
  assert.equal(JSON.stringify(x.K._doc().variants.map(v => [v.id, v.stock])), stocks);
}), { numRuns: 40, seed: 20261023 });
console.log('✓ catalog-durable-recovery-test: recovery, migration, isolation, degraded storage and random histories');
