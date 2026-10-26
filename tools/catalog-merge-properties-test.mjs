#!/usr/bin/env node
/* catalog-merge-properties-test · two counters, one stock.
 *
 * A boutique's catalogue lives on every device that sells from it (dashboard,
 * paired till, a second till) and on the server. Each device sells, counts,
 * deletes and edits offline, then syncs: pull the server copy, mergeDocs() it
 * into its own, push the result. These properties drive the REAL mergeDocs
 * browser path and server compaction, both owned by
 * functions/api/_rules-catalog.js on generated histories and check them against a
 * model of what the shop actually did:
 *
 *   stock = the latest physical count + every sale, return or reception after it
 *
 * whatever the number of devices, the order of syncs and the grouping of merges. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import * as rules from '../functions/api/_rules-catalog.js';
import { __test as server } from '../functions/api/catalog.js';

const ROOT = path.resolve(import.meta.dirname, '..');
let fc; try { fc = createRequire(path.join(ROOT, 'app/package.json'))('fast-check'); } catch { console.log('○ fast-check absent; catalogue merge properties not executed'); process.exit(0); }
const RUNS = Number(process.env.KIWI_PROPERTY_RUNS) || 300, SEED = Number(process.env.KIWI_PROPERTY_SEED) || 20261022;
let passed = 0, failed = 0, known = 0;
const only = (label) => !process.env.KIWI_PROPERTY_ONLY || new RegExp(process.env.KIWI_PROPERTY_ONLY).test(label);
const witness = (r) => fc.stringify(r.counterexample).slice(0, Number(process.env.KIWI_WITNESS_CHARS) || 1500);
async function strict(label, p, runs = RUNS) { if (!only(label)) return; const r = await fc.check(p, { numRuns: runs, seed: SEED }); if (r.failed) { failed++; console.error('✗ ' + label, witness(r), r.errorInstance && r.errorInstance.message); } else { passed++; console.log('✓ ' + label); } }

/* The real module, in a pocket browser (same harness as catalog-merge-test). */
function pocketWindow() {
  const store = new Map();
  const el = () => ({ id: '', textContent: '', style: {}, setAttribute() {}, appendChild() {}, querySelector: () => null, querySelectorAll: () => [], addEventListener() {}, classList: { add() {}, remove() {} } });
  const win = {
    localStorage: { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k), get length() { return store.size; }, key: (i) => Array.from(store.keys())[i] },
    document: { addEventListener() {}, removeEventListener() {}, dispatchEvent: () => true, visibilityState: 'visible', readyState: 'complete', getElementById: () => null, createElement: el, querySelector: () => null, querySelectorAll: () => [], head: el(), body: el() },
    addEventListener() {}, removeEventListener() {},
    KiwiEnv: { isReal: () => true, local: false, hosted: true, demosAllowed: false },
    setTimeout, clearTimeout, fetch: () => Promise.reject(new Error('hors ligne')),
    CustomEvent: class { constructor(t, o) { this.type = t; this.detail = (o || {}).detail; } },
    navigator: { userAgent: 'node' },
  };
  win.window = win;
  for (const file of ['assets/barcode.js', 'assets/color-palette.js', 'assets/boutique-catalog-parts.js',
    'assets/boutique-catalog.js']) {
    new Function('window', 'document', 'localStorage', 'setTimeout', 'clearTimeout', 'fetch', 'CustomEvent', 'navigator', 'self', 'console',
      fs.readFileSync(path.join(ROOT, file), 'utf8'))(win, win.document, win.localStorage, setTimeout, clearTimeout, win.fetch, win.CustomEvent, win.navigator, win, console);
    if (file === 'assets/boutique-catalog-parts.js') win.testLedger = win.__kiwiBoutiqueCatalogParts.ledger;
  }
  return win;
}
const C = pocketWindow().KiwiBoutiqueCatalog;
assert.ok(C && C._merge, 'KiwiBoutiqueCatalog._merge introuvable');
const clone = (x) => JSON.parse(JSON.stringify(x));
const merge = (a, b) => C._merge(clone(a), clone(b));

/* ── the shop: two products, four variants, counted this morning ──────────── */
const T0 = Date.now() - 6 * 3600e3;           // well inside every pruning window
const PRODUCTS = ['p0', 'p1'], VARIANTS = ['v0', 'v1', 'v2', 'v3'];
const parentOf = (vid) => (vid === 'v0' || vid === 'v1' ? 'p0' : 'p1');
function shop(counts) {
  return {
    v: 1, seq: 0, removed: {}, moves: [], categories: [{ id: 'c0', name: 'Rayon', metaAt: T0 }],
    products: PRODUCTS.map((id) => ({ id, name: 'Article ' + id, categoryId: 'c0', priceMAD: 100, metaAt: T0 })),
    variants: VARIANTS.map((id, i) => ({ id, productId: parentOf(id), size: 'M', colorId: 'noir', note: '', stock: counts[i], base: counts[i], baseAt: T0, metaAt: T0, barcodes: [], barcodeRemoved: {} })),
  };
}
const stockOf = (doc) => Object.fromEntries((doc.variants || []).map((v) => [v.id, v.stock]).sort());

/* ── what a device can do, with the real gestures' semantics ─────────────── */
const opArb = fc.oneof(
  { weight: 6, arbitrary: fc.record({ kind: fc.constant('move'), dev: fc.nat(2), vid: fc.constantFrom(...VARIANTS), d: fc.integer({ min: -4, max: 4 }).filter((d) => d !== 0), why: fc.constantFrom('vente', 'retour', 'reception', 'ajust') }) },
  { weight: 2, arbitrary: fc.record({ kind: fc.constant('count'), dev: fc.nat(2), vid: fc.constantFrom(...VARIANTS), n: fc.nat(30) }) },
  { weight: 1, arbitrary: fc.record({ kind: fc.constant('edit'), dev: fc.nat(2), vid: fc.constantFrom(...VARIANTS), note: fc.constantFrom('', 'ourlet', 'coupe large', 'retouche') }) },
  { weight: 1, arbitrary: fc.record({ kind: fc.constant('deleteVariant'), dev: fc.nat(2), vid: fc.constantFrom(...VARIANTS) }) },
  { weight: 1, arbitrary: fc.record({ kind: fc.constant('deleteProduct'), dev: fc.nat(2), pid: fc.constantFrom(...PRODUCTS) }) },
  { weight: 1, arbitrary: fc.record({ kind: fc.constant('create'), dev: fc.nat(2), pid: fc.constantFrom(...PRODUCTS), n: fc.nat(20) }) },
  { weight: 4, arbitrary: fc.record({ kind: fc.constant('sync'), dev: fc.nat(2) }) },
);
const historyArb = fc.record({ counts: fc.tuple(...VARIANTS.map(() => fc.nat(25))), ops: fc.array(opArb, { maxLength: 40 }) });

/* Replays a history on three devices and the server, and keeps the ground truth:
 * every move ever made, every count, every deletion, every edit. */
function play({ counts, ops }) {
  const start = shop(counts);
  const devs = [clone(start), clone(start), clone(start)];
  let srv = clone(start), t = T0, seq = 0;
  const truth = { moves: [], counts: Object.fromEntries(VARIANTS.map((id, i) => [id, { n: counts[i], at: T0 }])), dead: new Set(), notes: {}, parent: Object.fromEntries(VARIANTS.map((v) => [v, parentOf(v)])) };
  for (const op of ops) {
    const doc = devs[op.dev]; t += 1 + (seq % 3);
    const v = op.vid && doc.variants.find((x) => x.id === op.vid);
    if (op.kind === 'sync') { srv = merge(doc, srv); devs[op.dev] = clone(srv); continue; }
    if (op.kind === 'move' && v) {
      const m = { id: `d${op.dev}-${++seq}`, vid: v.id, d: op.d, at: t, why: op.why };
      doc.moves.push(m); truth.moves.push(m);
    } else if (op.kind === 'count' && v) {
      v.base = op.n; v.baseAt = t; v.stock = op.n;
      doc.moves = doc.moves.filter((m) => m.vid !== v.id || m.at > t);
      if (t > truth.counts[v.id].at) truth.counts[v.id] = { n: op.n, at: t };
    } else if (op.kind === 'edit' && v) {
      v.note = op.note; v.metaAt = t;
      if (!truth.notes[v.id] || t > truth.notes[v.id].at) truth.notes[v.id] = { note: op.note, at: t };
    } else if (op.kind === 'deleteVariant' && v) {
      doc.variants = doc.variants.filter((x) => x.id !== v.id);
      doc.moves = doc.moves.filter((m) => m.vid !== v.id);
      doc.removed[v.id] = t; truth.dead.add(v.id);
    } else if (op.kind === 'deleteProduct' && doc.products.some((p) => p.id === op.pid)) {
      const vids = doc.variants.filter((x) => x.productId === op.pid).map((x) => x.id);
      for (const id of vids.concat(op.pid)) { doc.removed[id] = t; truth.dead.add(id); }
      doc.moves = doc.moves.filter((m) => !vids.includes(m.vid));
      doc.variants = doc.variants.filter((x) => x.productId !== op.pid);
      doc.products = doc.products.filter((p) => p.id !== op.pid);
    } else if (op.kind === 'create' && doc.products.some((p) => p.id === op.pid)) {
      const id = `n${op.dev}-${++seq}`;
      doc.variants.push({ id, productId: op.pid, size: 'L', colorId: 'noir', note: '', stock: op.n, base: op.n, baseAt: t, metaAt: t, barcodes: [], barcodeRemoved: {} });
      truth.counts[id] = { n: op.n, at: t }; truth.parent[id] = op.pid;
    }
    /* The device recomputes its own stock exactly as the app does after a gesture. */
    devs[op.dev] = merge(doc, { v: 1, categories: [], products: doc.products, variants: [], moves: [], removed: {} });
  }
  /* Everyone comes back online: two rounds, so the last to push is also read. */
  for (let round = 0; round < 2; round++) for (let i = 0; i < devs.length; i++) { srv = merge(devs[i], srv); devs[i] = clone(srv); }
  return { devs, srv, truth, start };
}

/* The ground truth's stock for every variant still alive. */
function expected(truth) {
  const out = {};
  for (const [vid, c] of Object.entries(truth.counts)) {
    if (truth.dead.has(vid) || truth.dead.has(truth.parent[vid])) continue;
    const after = truth.moves.filter((m) => m.vid === vid && m.at > c.at).reduce((n, m) => n + m.d, 0);
    out[vid] = Math.max(0, c.n + after);
  }
  return Object.fromEntries(Object.entries(out).sort());
}

console.log('catalog-merge-properties-test');

await strict('after every device syncs, all copies hold the same stock, and it is the latest count plus every move made after it', fc.property(historyArb, (h) => {
  const { devs, srv, truth } = play(h);
  const want = expected(truth);
  assert.deepEqual(stockOf(srv), want);
  for (const d of devs) assert.deepEqual(stockOf(d), want);
}));

await strict('no sale is lost or counted twice: every move made after its variant\'s latest count is in the merged ledger exactly once', fc.property(historyArb, (h) => {
  const { srv, truth } = play(h);
  const ids = srv.moves.map((m) => m.id);
  assert.equal(new Set(ids).size, ids.length, 'a move appears twice');
  for (const m of truth.moves) {
    const vid = m.vid;
    if (truth.dead.has(vid) || truth.dead.has(truth.parent[vid]) || m.at <= truth.counts[vid].at) continue;
    assert.ok(ids.includes(m.id), 'lost move ' + m.id);
  }
}));

await strict('a deletion on any device stays deleted everywhere, with its moves', fc.property(historyArb, (h) => {
  const { devs, truth } = play(h);
  for (const d of devs) {
    for (const x of [...d.products, ...d.variants]) assert.ok(!truth.dead.has(x.id), 'resurrected ' + x.id);
    for (const v of d.variants) assert.ok(d.products.some((p) => p.id === v.productId), 'orphan variant ' + v.id);
    for (const m of d.moves) assert.ok(d.variants.some((v) => v.id === m.vid), 'move of a missing variant');
  }
}));

await strict('the latest edit of a variant wins on every device', fc.property(historyArb, (h) => {
  const { devs, truth } = play(h);
  for (const d of devs) for (const v of d.variants) if (truth.notes[v.id]) assert.equal(v.note, truth.notes[v.id].note);
}));

/* Merge algebra on three devices that never synced, each with its own share
 * of the operations (timestamps offset by device so none collide). */
function playNoFinal({ ops }, start) {
  const devs = [clone(start)]; let t = T0, seq = 0;
  for (const op of ops) {
    const doc = devs[0]; t += 1 + (seq % 3); seq++;
    const v = op.vid && doc.variants.find((x) => x.id === op.vid);
    if (op.kind === 'move' && v) doc.moves.push({ id: `x${op.origin}-${seq}`, vid: v.id, d: op.d, at: t + op.origin * 0.25, why: op.why });
    else if (op.kind === 'count' && v) { v.base = op.n; v.baseAt = t + op.origin * 0.25; v.stock = op.n; doc.moves = doc.moves.filter((m) => m.vid !== v.id || m.at > v.baseAt); }
    else if (op.kind === 'edit' && v) { v.note = op.note; v.metaAt = t + op.origin * 0.25; }
    else if (op.kind === 'deleteVariant' && v) { doc.variants = doc.variants.filter((x) => x.id !== v.id); doc.moves = doc.moves.filter((m) => m.vid !== v.id); doc.removed[v.id] = t; }
  }
  return { devs };
}
const offlineArb = fc.record({ counts: fc.tuple(...VARIANTS.map(() => fc.nat(25))), ops: fc.array(opArb.filter((o) => ['move', 'count', 'edit', 'deleteVariant'].includes(o.kind)), { maxLength: 30 }) })
  .map((h) => {
    const start = shop(h.counts);
    return [0, 1, 2].map((dev) => playNoFinal({ ops: h.ops.filter((o) => o.dev === dev).map((o) => ({ ...o, origin: dev })) }, start).devs[0]);
  });
const ledger = (d) => ({ stock: stockOf(d), moves: d.moves.map((m) => m.id).sort(), notes: Object.fromEntries(d.variants.map((v) => [v.id, v.note]).sort()) });

await strict('merging is order-free: a with b equals b with a, and the grouping of three devices does not matter', fc.property(offlineArb, ([a, b, c]) => {
  assert.deepEqual(ledger(merge(a, b)), ledger(merge(b, a)));
  assert.deepEqual(ledger(merge(merge(a, b), c)), ledger(merge(a, merge(b, c))));
}));

await strict('merging what is already known changes nothing', fc.property(offlineArb, ([a, b]) => {
  const ab = merge(a, b);
  assert.deepEqual(ledger(merge(ab, b)), ledger(ab));
  assert.deepEqual(ledger(merge(ab, ab)), ledger(ab));
}));

/* ── compaction: folding old moves into the count must never move the stock ── */
const DAY = 86400e3;
const oldLedgerArb = fc.record({
  counts: fc.tuple(...VARIANTS.map(() => fc.nat(25))),
  moves: fc.array(fc.record({ vid: fc.constantFrom(...VARIANTS), d: fc.integer({ min: -3, max: 3 }).filter((d) => d !== 0), age: fc.integer({ min: 0, max: 90 * 24 }), why: fc.constantFrom('vente', 'retour', 'reserve') }), { maxLength: 60 }),
});
function oldShop({ counts, moves }) {
  const doc = shop(counts);
  for (const v of doc.variants) v.baseAt = Date.now() - 100 * DAY;
  doc.moves = moves.map((m, i) => ({ id: 'o' + i, vid: m.vid, d: m.d, at: Date.now() - m.age * 3600e3 - 60e3, why: m.why }));
  return doc;
}
const plain = (doc) => { const by = {}; for (const v of doc.variants) by[v.id] = { n: v.base, at: v.baseAt }; for (const m of doc.moves) if (by[m.vid] && m.at > by[m.vid].at) by[m.vid].n += m.d; return Object.fromEntries(Object.entries(by).map(([k, s]) => [k, Math.max(0, s.n)]).sort()); };

await strict('old ledgers retain the same stock, alone and merged with an uncompacted copy', fc.property(oldLedgerArb, (l) => {
  const doc = oldShop(l);
  const folded = merge(doc, { v: 1, categories: [], products: doc.products, variants: [], moves: [], removed: {} });
  assert.deepEqual(stockOf(folded), plain(doc));
  assert.deepEqual(stockOf(merge(folded, doc)), plain(doc));
  assert.deepEqual(stockOf(merge(doc, folded)), plain(doc));
}));

/* The server folds the oldest moves once a ledger passes 11 000, but never a
 * pending online reservation. Before 22 October the folded count took the
 * timestamp of the newest folded move, so a reservation OLDER than it fell
 * behind the count and stopped counting: the reserved piece came back on sale,
 * and came back a second time when the reservation was released. */
const bigLedgerArb = fc.record({
  counts: fc.tuple(...VARIANTS.map(() => fc.nat(25))),
  reserves: fc.array(fc.record({ vid: fc.constantFrom(...VARIANTS), qty: fc.integer({ min: 1, max: 3 }), slot: fc.nat(11999) }), { minLength: 1, maxLength: 4 }),
  tieSlot: fc.nat(11999),
  extra: fc.integer({ min: 1, max: 900 }),
});
function bigShop({ counts, reserves, tieSlot, extra }) {
  const doc = shop(counts);
  const t0 = Date.now() - 20 * DAY;
  for (const v of doc.variants) v.baseAt = t0;
  const n = 11000 + extra;
  doc.moves = Array.from({ length: n }, (_, i) => ({ id: 'f' + i, vid: VARIANTS[i % 4], d: i % 2 ? -1 : 1, at: t0 + 1000 + i * 100, why: i % 2 ? 'vente' : 'reception' }));
  /* Two moves of one variant in the same millisecond, astride the fold line. */
  doc.moves.push({ id: 'tie', vid: doc.moves[tieSlot % n].vid, d: -2, at: doc.moves[tieSlot % n].at, why: 'vente' });
  reserves.forEach((r, k) => doc.moves.push({ id: 'rsv-' + k, vid: r.vid, d: -r.qty, at: t0 + 1000 + (r.slot % n) * 100 + 50, why: 'reserve', ref: 'web-' + k }));
  return doc;
}

await strict('browser vs server merge parity on the same documents', fc.property(oldLedgerArb, oldLedgerArb, (a, b) => {
  const left = oldShop(a), right = oldShop(b);
  assert.deepEqual(clone(merge(left, right)), clone(rules.mergeDocs(clone(left), clone(right), Date.now()).doc));
}));

await strict('browser vs server compaction parity, including reservations and equal timestamps', fc.property(
  fc.oneof(oldLedgerArb.map(oldShop), bigLedgerArb.map(bigShop)), (doc) => {
    const win = pocketWindow();
    const till = win.testLedger({ db: clone(doc) });
    const actual = till.compact(clone(doc));
    till.materialize(actual);
    const expected = server.materialize(server.compactForWrite(clone(doc)));
    assert.deepEqual(clone(actual), clone(expected));
  }), 40);

await strict('the server folding an oversized ledger never changes a stock, pending reservations included', fc.property(bigLedgerArb, (l) => {
  const doc = server.sanitize(bigShop(l));
  const before = stockOf(server.materialize(clone(doc)));
  const after = server.compactForWrite(clone(doc));
  assert.ok(after.moves.length <= 11000 + 10, 'ledger still oversized: ' + after.moves.length);
  assert.deepEqual(stockOf(after), before);
  /* and a till that merges the folded copy with its own unfolded one agrees */
  assert.deepEqual(stockOf(merge(doc, after)), before);
}), 40);

/* ── two real counters, one with a clock hours behind ────────────────────────
 * Each counter is its own copy of the module with its own storage and its own
 * wall clock, and uses the real gestures (setStock, adjustStock, updateVariant,
 * renameCategory, updateProduct). Before every gesture both counters sync: each
 * merges the other's copy through the real mergeDocs and adopts the result the
 * way a landed copy arrives (the storage path). Every gesture is therefore made
 * after seeing everything before it, and the latest one must win, whatever the
 * clocks say: an inventory count cancels every sale it saw, a later sale counts
 * on top of it, the latest note, product name, photo and section name stay. */
function counter(clock, offset) {
  const store = new Map(), listeners = [];
  class SkewDate extends Date { constructor(...a) { if (a.length) super(...a); else super(clock.t + offset); } static now() { return clock.t + offset; } }
  const el = () => ({ id: '', textContent: '', style: {}, setAttribute() {}, appendChild() {}, querySelector: () => null, querySelectorAll: () => [], addEventListener() {}, classList: { add() {}, remove() {} } });
  const win = {
    localStorage: { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k), get length() { return store.size; }, key: (i) => Array.from(store.keys())[i] },
    document: { addEventListener() {}, removeEventListener() {}, dispatchEvent: () => true, visibilityState: 'visible', readyState: 'complete', getElementById: () => null, createElement: el, querySelector: () => null, querySelectorAll: () => [], head: el(), body: el() },
    addEventListener(type, fn) { if (type === 'storage') listeners.push(fn); }, removeEventListener() {},
    KiwiEnv: { isReal: () => true, local: false, hosted: true, demosAllowed: false },
    setTimeout: () => 0, clearTimeout() {}, fetch: () => Promise.reject(new Error('hors ligne')),
    CustomEvent: class { constructor(t, o) { this.type = t; this.detail = (o || {}).detail; } },
    navigator: { userAgent: 'node' },
  };
  win.window = win;
  for (const file of ['assets/barcode.js', 'assets/color-palette.js', 'assets/boutique-catalog-parts.js', 'assets/boutique-catalog.js']) {
    new Function('window', 'document', 'localStorage', 'setTimeout', 'clearTimeout', 'fetch', 'CustomEvent', 'navigator', 'self', 'console', 'Date',
      fs.readFileSync(path.join(ROOT, file), 'utf8'))(win, win.document, win.localStorage, win.setTimeout, win.clearTimeout, win.fetch, win.CustomEvent, win.navigator, win, console, SkewDate);
  }
  const K = win.KiwiBoutiqueCatalog;
  return {
    K,
    seed(doc) { win.localStorage.setItem(K._key, JSON.stringify(doc)); K.load(); },
    land(doc) { const newValue = JSON.stringify(doc); win.localStorage.setItem(K._key, newValue); listeners.forEach((fn) => fn({ key: K._key, newValue })); },
    pull(other) { this.land(K._merge(clone(K._doc()), clone(other.K._doc()))); },
  };
}
const skewOpArb = fc.oneof(
  fc.record({ kind: fc.constant('count'), dev: fc.nat(1), vid: fc.constantFrom('v0', 'v1'), n: fc.nat(30) }),
  fc.record({ kind: fc.constant('move'), dev: fc.nat(1), vid: fc.constantFrom('v0', 'v1'), d: fc.integer({ min: -4, max: 4 }).filter((d) => d !== 0) }),
  fc.record({ kind: fc.constant('note'), dev: fc.nat(1), vid: fc.constantFrom('v0', 'v1'), note: fc.constantFrom('ourlet', 'coupe large', 'retouche', 'vitrine') }),
  fc.record({ kind: fc.constant('name'), dev: fc.nat(1), name: fc.constantFrom('Robe A', 'Robe B', 'Caftan') }),
  fc.record({ kind: fc.constant('photo'), dev: fc.nat(1), photo: fc.constantFrom('', 'https://x.test/a.jpg', 'https://x.test/b.jpg') }),
  fc.record({ kind: fc.constant('rayon'), dev: fc.nat(1), name: fc.constantFrom('Robes', 'Caftans', 'Soldes') }),
).chain((o) => fc.integer({ min: 1, max: 5 * 60e3 }).map((wait) => ({ ...o, wait })));
await strict('a counter whose clock is hours behind still wins with a gesture made after seeing the other: count, sale, note, name, photo, section', fc.property(fc.integer({ min: 1, max: 12 }), fc.boolean(), fc.tuple(fc.nat(25), fc.nat(25)), fc.array(skewOpArb, { minLength: 1, maxLength: 12 }), (hours, slowFirst, [n0, n1], ops) => {
  const clock = { t: Date.now() };
  const devs = slowFirst ? [counter(clock, -hours * 3600e3), counter(clock, 0)] : [counter(clock, 0), counter(clock, -hours * 3600e3)];
  const t0 = clock.t - 3600e3;
  const start = { v: 1, seq: 0, removed: {}, moves: [], categories: [{ id: 'c0', name: 'Rayon', metaAt: t0 }],
    products: [{ id: 'p0', name: 'Article', categoryId: 'c0', priceMAD: 100, photo: '', video: '', metaAt: t0 }],
    variants: [['v0', n0], ['v1', n1]].map(([id, n]) => ({ id, productId: 'p0', size: id === 'v0' ? 'S' : 'M', colorId: 'noir', note: '', stock: n, base: n, baseAt: t0, metaAt: t0, barcodes: [], barcodeRemoved: {} })) };
  devs.forEach((d) => d.seed(clone(start)));
  const model = { raw: { v0: n0, v1: n1 }, note: { v0: '', v1: '' }, name: 'Article', photo: '', rayon: 'Rayon' };
  for (const o of ops) {
    devs[1].pull(devs[0]); devs[0].pull(devs[1]);
    clock.t += o.wait;
    const K = devs[o.dev].K;
    if (o.kind === 'count') { K.setStock(o.vid, o.n, 'comptage'); model.raw[o.vid] = o.n; }
    else if (o.kind === 'move') { K.adjustStock(o.vid, o.d, 'vente'); model.raw[o.vid] += o.d; }
    else if (o.kind === 'note') { K.updateVariant(o.vid, { note: o.note }); model.note[o.vid] = o.note; }
    else if (o.kind === 'name') { K.updateProduct('p0', { name: o.name }); model.name = o.name; }
    else if (o.kind === 'photo') { K.updateProduct('p0', { photo: o.photo }); model.photo = o.photo; }
    else if (o.kind === 'rayon') { K.renameCategory('c0', o.name); model.rayon = o.name; }
  }
  devs[1].pull(devs[0]); devs[0].pull(devs[1]);
  for (const d of devs) {
    const doc = d.K._doc();
    for (const vid of ['v0', 'v1']) {
      const v = doc.variants.find((x) => x.id === vid);
      assert.equal(v.stock, Math.max(0, model.raw[vid]), vid + ' stock');
      assert.equal(v.note, model.note[vid], vid + ' note');
    }
    const p = doc.products.find((x) => x.id === 'p0');
    assert.equal(p.name, model.name, 'product name'); assert.equal(p.photo || '', model.photo, 'photo');
    assert.equal(doc.categories.find((c) => c.id === 'c0').name, model.rayon, 'section name');
  }
}), 150);

/* ── a peer from the future (or a damaged document) drags nobody along ──────
 * A copy arrives carrying a product and a deletion stamped years ahead, or with
 * a stamp that is not a finite number. It is merged (the product stays on both
 * counters), but the next gesture of an honest counter is stamped within 24 h
 * of real time, and still wins over the older honest edit of the other one. */
await strict('a peer record stamped years ahead or non-finite is merged, and an honest counter still stamps its next edit within 24 h and wins', fc.property(
  fc.oneof(fc.integer({ min: 1, max: 80 }).map((y) => ({ years: y })), fc.constantFrom('1e400', '-1e400', 'NaN', 'demain')),
  fc.nat(1), fc.tuple(fc.constantFrom('ourlet', 'coupe large', 'retouche', 'vitrine'), fc.constantFrom('ourlet', 'coupe large', 'retouche', 'vitrine')).filter(([b, a]) => a !== b),
  (rogue, via, [nb, na]) => {
    const clock = { t: Date.now() };
    const devs = [counter(clock, 0), counter(clock, 0)];
    const t0 = clock.t - 3600e3;
    const start = { v: 1, seq: 0, removed: {}, moves: [], categories: [{ id: 'c0', name: 'Rayon', metaAt: t0 }],
      products: [{ id: 'p0', name: 'Article', categoryId: 'c0', priceMAD: 100, photo: '', video: '', metaAt: t0 }],
      variants: [{ id: 'v0', productId: 'p0', size: 'S', colorId: 'noir', note: '', stock: 3, base: 3, baseAt: t0, metaAt: t0, barcodes: [], barcodeRemoved: {} }] };
    devs.forEach((d) => d.seed(clone(start)));
    const sync = () => { devs[1].pull(devs[0]); devs[0].pull(devs[1]); };
    clock.t += 60e3; devs[1].K.updateVariant('v0', { note: nb });
    sync();
    const at = typeof rogue === 'object' ? clock.t + rogue.years * 365 * 86400e3 : rogue;
    const peer = clone(devs[via].K._doc());
    peer.products.push({ id: 'prg', name: 'Futur', categoryId: 'c0', priceMAD: 50, photo: '', video: '', metaAt: at });
    peer.removed = Object.assign({}, peer.removed, { ghost: at });
    devs[via].land(devs[via].K._merge(clone(devs[via].K._doc()), peer));
    sync();
    clock.t += 60e3; devs[0].K.updateVariant('v0', { note: na });
    const st = devs[0].K._doc().variants.find((v) => v.id === 'v0').metaAt;
    assert.ok(Number.isFinite(st) && st >= clock.t && st <= clock.t + 86400e3, 'honest stamp ' + st);
    sync();
    for (const d of devs) {
      const doc = d.K._doc();
      assert.equal(doc.variants.find((v) => v.id === 'v0').note, na, 'the latest honest edit wins');
      assert.ok(doc.products.find((x) => x.id === 'prg'), 'the peer product stays');
    }
  }), 150);

/* ── the degraded barcode path: barcode.js absent, two devices, same millisecond ──
 * genEan() falls back when window.KiwiBarcode (the store counter) is missing.
 * The old fallback was '20' + the last ten digits of Date.now() + '0': two
 * devices labelling an item in the same millisecond printed the SAME code (and
 * a check digit that was usually wrong). Each device now carries a stable tag
 * of its own; the property runs two pocket devices WITHOUT barcode.js, whose
 * clocks read the same instant, and makes each one label several items. */
function bareDevice(at, tagSeed, storeIn) {
  const store = storeIn || new Map();
  const el = () => ({ id: '', textContent: '', style: {}, setAttribute() {}, appendChild() {}, querySelector: () => null, querySelectorAll: () => [], addEventListener() {}, classList: { add() {}, remove() {} } });
  class FixedDate extends Date { constructor(...a) { if (a.length) super(...a); else super(at); } static now() { return at; } }
  let r = tagSeed >>> 0;
  const win = {
    localStorage: { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k), get length() { return store.size; }, key: (i) => Array.from(store.keys())[i] },
    document: { addEventListener() {}, removeEventListener() {}, dispatchEvent: () => true, visibilityState: 'visible', readyState: 'complete', getElementById: () => null, createElement: el, querySelector: () => null, querySelectorAll: () => [], head: el(), body: el() },
    addEventListener() {}, removeEventListener() {},
    KiwiEnv: { isReal: () => true, local: false, hosted: true, demosAllowed: false },
    setTimeout: () => 0, clearTimeout() {}, fetch: () => Promise.reject(new Error('hors ligne')),
    CustomEvent: class { constructor(t, o) { this.type = t; this.detail = (o || {}).detail; } },
    navigator: { userAgent: 'node' },
    // Le hasard de l'appareil, rejouable : deux appareils, deux graines.
    crypto: { getRandomValues: (a) => { for (let i = 0; i < a.length; i++) { r = (Math.imul(r ^ (r >>> 15), 2246822519) + 0x9e3779b9) >>> 0; a[i] = r; } return a; } },
  };
  win.window = win;
  for (const file of ['assets/color-palette.js', 'assets/boutique-catalog-parts.js', 'assets/boutique-catalog.js']) {
    new Function('window', 'document', 'localStorage', 'setTimeout', 'clearTimeout', 'fetch', 'CustomEvent', 'navigator', 'self', 'console', 'Date',
      fs.readFileSync(path.join(ROOT, file), 'utf8'))(win, win.document, win.localStorage, win.setTimeout, win.clearTimeout, win.fetch, win.CustomEvent, win.navigator, win, console, FixedDate);
  }
  assert.ok(!win.KiwiBarcode, 'barcode.js must be absent here');
  return { K: win.KiwiBoutiqueCatalog, store };
}
const ean13Ok = (s) => /^\d{13}$/.test(s) && (10 - [...s.slice(0, 12)].reduce((t, d, i) => t + (+d) * (i % 2 ? 3 : 1), 0) % 10) % 10 === +s[12];
await strict('without barcode.js, two devices labelling items in the same millisecond never print the same code', fc.property(
  fc.integer({ min: 0, max: 4102444800000 }), fc.tuple(fc.nat(), fc.nat()).filter(([a, b]) => a !== b), fc.integer({ min: 1, max: 6 }), fc.integer({ min: 1, max: 6 }),
  (at, [seedA, seedB], nA, nB) => {
    const a = bareDevice(at, seedA), b = bareDevice(at, seedB);
    assert.equal(typeof a.K._genEan, 'function', 'genEan exposed for this property');
    const codes = [];
    for (let i = 0; i < nA; i++) codes.push(a.K._genEan());
    for (let i = 0; i < nB; i++) codes.push(b.K._genEan());
    // Le même appareil rechargé (même stockage) garde son étiquette et ne réimprime rien.
    const again = bareDevice(at, seedA ^ 0x5bd1e995, a.store);
    codes.push(again.K._genEan());
    for (const c of codes) {
      assert.ok(ean13Ok(c), 'valid EAN-13: ' + c);
      assert.ok(/^2[1-9]/.test(c), 'in-store range 21-29, never the 20 counter range: ' + c);
    }
    assert.equal(new Set(codes).size, codes.length, 'collision: ' + codes.join(' '));
    assert.equal(codes.at(-1).slice(2, 8), codes[0].slice(2, 8), 'the device tag is stable across reloads');
  }), 200);

/* Returning device at the exact 180-day retention boundary. Within the
 * window the deletion wins; at/after expiry the old record can return. This
 * explicitly documents the bounded offline guarantee without changing it. */
await strict('tombstone retention boundary with a stale returning device', fc.property(
  fc.constantFrom(-1, 0, 1), offset => {
    const realNow = Date.now;
    const now = realNow();
    Date.now = () => now;
    try {
      const stale = shop([3, 3, 3, 3]);
      const deleted = clone(stale);
      const at = now - 180 * 86400000 + offset;
      deleted.products = deleted.products.filter(p => p.id !== 'p0');
      deleted.variants = deleted.variants.filter(v => v.productId !== 'p0');
      deleted.removed = {p0: at, v0: at, v1: at};
      const stored = server.sanitize(deleted);
      for (const joined of [merge(stored, stale), merge(stale, stored)]) {
        assert.equal(joined.products.some(p => p.id === 'p0'), offset <= 0);
        assert.equal(joined.variants.some(v => v.id === 'v0'), offset <= 0);
        assert.equal(!!joined.removed.p0, offset > 0);
      }
    } finally { Date.now = realNow; }
  }), 30);

console.log(`${failed ? '✗' : '✓'} catalog-merge-properties-test · ${passed} held, ${known} known, ${failed} failed`);
process.exit(failed ? 1 : 0);
