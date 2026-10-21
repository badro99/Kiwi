#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const ledger = fs.readFileSync(new URL('../assets/inventory-ledger.js', import.meta.url), 'utf8');
const consumption = fs.readFileSync(new URL('../assets/inventory-consumption.js', import.meta.url), 'utf8');
const key = 'kiwi:inventoryLedger:v1:batch-test';
function harness(single = false) {
  const memory = new Map();
  let writes = 0, notifications = 0, quota = false, histories = 0;
  const localStorage = { getItem: k => memory.get(k) ?? null, setItem(k, v) {
    if (k === key) { writes++; if (typeof quota === 'function' ? quota(String(v)) : quota) throw new Error('QuotaExceededError'); }
    memory.set(k, String(v));
  } };
  const window = { KiwiEnv: { isReal: () => true }, KiwiCloudDoc: { currentSlug: () => 'batch-test' }, addEventListener() {} };
  const navigator = { onLine: false };
  const sent = []; let cursor = 0;
  const context = vm.createContext({ window, localStorage, navigator, console,
    async fetch(url, options) {
      if (options.method === 'POST') {
        sent.push(options.body);
        const accepted = JSON.parse(options.body).movements.map(r => ({ id: r.id, cursor: ++cursor }));
        return { ok: true, status: 200, json: async () => ({ accepted }) };
      }
      return { ok: true, json: async () => ({ cursor, movements: [] }) };
    },
    Date: class extends Date { static now() { return 10000; } }, setTimeout() {}, setInterval() {} });
  vm.runInContext(ledger, context);
  const I = window.KiwiInventory;
  for (const itemId of ['a', 'b', 'c', 'd']) {
    for (let j = 0; j < 3; j++) I.add({ id: `${itemId}-${j}`, itemId, qty: 1.5, unitCost: j + 1.1234,
      reason: 'receipt', occurredTs: 100 + j, meta: { expiresAt: 1000 - j, rank: j } });
  }
  window.KiwiCost = { doc: () => ({ ingredients: ['a','b','c','d'].map(id => ({ id: `stock:${id}`, useCost: 7 })),
    recipes: { dish: { status: 'complete', lines: ['a','b','c','d'].map(id => ({ ing: `stock:${id}`, qty: 0.7004 })) } } }) };
  if (single) I.addMany = undefined; // Real legacy add(), replaying history for every movement.
  const history = I.history;
  I.history = (...args) => { histories++; return history(...args); };
  vm.runInContext(consumption, context);
  I.subscribe(() => notifications++);
  return { I, navigator, sent, C: window.KiwiInventoryConsumption, memory,
    reset() { writes = notifications = histories = 0; }, quota(v) { quota = v; },
    counts: () => ({ writes, notifications, histories }) };
}
const sale = { ref: 'payment', ts: 2000, lines: Array.from({ length: 5 }, () => ({ itemId: 'dish', qty: 1, name: 'Dish' })) };
const old = harness(true), batch = harness();
old.reset(); batch.reset();
assert.equal(JSON.stringify(batch.C.record(sale)), JSON.stringify(old.C.record(sale)));
assert.equal(batch.memory.get(key), old.memory.get(key), 'ledger JSON including frozen costs, ordering and queue is byte-identical');
assert.equal(batch.counts().writes, 1, 'one ledger write per payment');
assert.equal(batch.counts().notifications, 1, 'one stock notification per payment');
assert.equal(batch.counts().histories, 1, 'one history read per payment');
for (const next of [sale, { ...sale, ref: 'backdated', ts: 101 }, { ...sale, ref: 'deficit', ts: 3000 }]) {
  batch.C.record(next); old.C.record(next);
  assert.equal(batch.memory.get(key), old.memory.get(key), 'retries, backdating and deficits preserve exact costs');
}
const failed = harness();
const before = failed.memory.get(key);
failed.quota(true);
assert.doesNotThrow(() => failed.C.record(sale));
assert.equal(failed.memory.get(key), before, 'quota failure leaves persisted ledger unchanged');
assert.equal(failed.I.status().storageError, true);
console.log('PASS consumption batch: exact legacy parity, one write/notification/history read, quota fail-soft');

// Cross-location idempotency must not deplete the local cost state.
const crossOld = harness(true), crossBatch = harness();
const firstId = JSON.parse(batch.memory.get(key)).rows.find(r => r.reason === 'sale').id;
for (const h of [crossOld, crossBatch]) h.I.add({ id: firstId, itemId: 'a', locationId: 'other', qty: -1, occurredTs: 500 });
crossOld.C.record(sale); crossBatch.C.record(sale);
assert.equal(crossBatch.memory.get(key), crossOld.memory.get(key));

// Cross the legacy 6000-row folding boundary during the payment.
const compactOld = harness(true), compactBatch = harness();
for (const h of [compactOld, compactBatch]) {
  const d = JSON.parse(h.memory.get(key));
  d.rows = Array.from({ length: 6000 }, (_, i) => ({ ...d.rows[i % 12], id: `ack-${i}`, cursor: i + 1 }));
  d.queued = []; h.memory.set(key, JSON.stringify(d));
  h.C.record(sale);
}
assert.equal(compactBatch.memory.get(key), compactOld.memory.get(key), 'compaction and frozen costs remain byte-identical');

// Compare the real sync request bodies and server-assigned sequence numbers.
for (const h of [old, batch]) { h.navigator.onLine = true; assert.equal(await h.I.sync(), true); }
assert.deepEqual(batch.sent, old.sent, 'wire payloads are byte-identical');
assert.equal(batch.memory.get(key), old.memory.get(key), 'acknowledged cursors and queue are identical');

const api = harness(); api.reset();
const result = api.I.addMany([
  { id: 'dup', itemId: 'a', qty: -1 }, { id: 'dup', itemId: 'a', qty: -2 }, { itemId: 'a', qty: 0 },
]);
assert.equal(result.length, 3); assert.equal(result[2], null);
assert.equal(api.I.history('a').filter(r => r.id === 'dup').length, 1);
assert.equal(api.counts().writes, 1); assert.equal(api.counts().notifications, 1);
console.log('PASS batch edge cases: cross-location duplicates, compaction, sync payloads/cursors, invalid rows');

const quotaOld = harness(true), quotaBatch = harness();
const limit = quotaOld.memory.get(key).length + 3000;
for (const h of [quotaOld, quotaBatch]) h.quota(raw => raw.length > limit);
assert.equal(JSON.stringify(quotaBatch.C.record(sale)), JSON.stringify(quotaOld.C.record(sale)));
assert.equal(quotaBatch.memory.get(key), quotaOld.memory.get(key), 'size-based quota preserves the exact legacy partial-write result');
console.log('PASS size-based quota fallback matches legacy partial persistence and costs');
