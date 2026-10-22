#!/usr/bin/env node
/* catalog-merge-properties-test · two counters, one stock.
 *
 * A boutique's catalogue lives on every device that sells from it (dashboard,
 * paired till, a second till) and on the server. Each device sells, counts,
 * deletes and edits offline, then syncs: pull the server copy, mergeDocs() it
 * into its own, push the result. These properties drive the REAL mergeDocs
 * (assets/boutique-catalog.js) and the REAL server compaction
 * (functions/api/catalog.js) on generated histories and check them against a
 * model of what the shop actually did:
 *
 *   stock = the latest physical count + every sale, return or reception after it
 *
 * whatever the number of devices, the order of syncs and the grouping of merges. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
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
  for (const file of ['assets/barcode.js', 'assets/color-palette.js', 'assets/boutique-catalog-ledger.js',
    'assets/boutique-catalog-io.js', 'assets/boutique-catalog.js']) {
    new Function('window', 'document', 'localStorage', 'setTimeout', 'clearTimeout', 'fetch', 'CustomEvent', 'navigator', 'self', 'console',
      fs.readFileSync(path.join(ROOT, file), 'utf8'))(win, win.document, win.localStorage, setTimeout, clearTimeout, win.fetch, win.CustomEvent, win.navigator, win, console);
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

await strict('a device folding moves older than 45 days into its count shows the same stock, alone and merged with a copy that never folded', fc.property(oldLedgerArb, (l) => {
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

await strict('the server folding an oversized ledger never changes a stock, pending reservations included', fc.property(bigLedgerArb, (l) => {
  const doc = server.sanitize(bigShop(l));
  const before = stockOf(server.materialize(clone(doc)));
  const after = server.compactForWrite(clone(doc));
  assert.ok(after.moves.length <= 11000 + 10, 'ledger still oversized: ' + after.moves.length);
  assert.deepEqual(stockOf(after), before);
  /* and a till that merges the folded copy with its own unfolded one agrees */
  assert.deepEqual(stockOf(merge(doc, after)), before);
}), 40);

console.log(`${failed ? '✗' : '✓'} catalog-merge-properties-test · ${passed} held, ${known} known, ${failed} failed`);
process.exit(failed ? 1 : 0);
