#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../assets/z-reconciliation.js', import.meta.url), 'utf8');
const rows = new Map();
const storage = new Map();
const O = {
  available: () => true,
  enqueue(_channel, _tenant, payload, opts) { rows.set(opts.id, { id: opts.id, payload, state: 'pending' }); return Promise.resolve(); },
  claim() { const row = [...rows.values()].find(r => r.state === 'pending'); if (row) { row.state = 'sending'; row.leaseToken = 'lease'; } return Promise.resolve(row || null); },
  acknowledge(id) { rows.delete(id); return Promise.resolve(true); },
  reject(id) { rows.get(id).state = 'pending'; return Promise.resolve(true); },
};
let serverHasSale = false, requests = 0, requeues = 0, alias = '';
function instance(online) {
  const Live = {
    merchant: () => 'restaurant-fixture', saleIdFor: entry => entry.id,
    canonicalSaleId: (_slug, id) => id === 'receipt-1' ? (alias || id) : id,
    postSale: () => { requeues++; serverHasSale = true; alias = 'canonical-receipt-1'; return { ok: true }; },
    flush: () => Promise.resolve(),
  };
  const window = { KiwiOffline: O, KiwiLive: Live,
    KiwiDayReport: { dayBounds: () => ({ from: 0, to: 2000000000000 }) }, addEventListener() {} };
  const ctx = vm.createContext({ window, KiwiLive: Live, navigator: { onLine: online },
    localStorage: { getItem: key => storage.get(key) || null, setItem: (key, value) => storage.set(key, value) },
    document: { readyState: 'complete', getElementById: () => null, querySelector: () => null, addEventListener() {} },
    location: { pathname: '/kiwi-caisse.html' }, setInterval() {}, Promise, Date, Set, console,
    fetch: async (_url, opts) => {
      requests++;
      const body = JSON.parse(opts.body);
      assert.deepEqual(body.sales.map(row => row.id), [requests === 1 ? 'receipt-1' : 'canonical-receipt-1']);
      return { ok: true, json: async () => ({ ok: true,
        missing: serverHasSale && body.sales[0].id === alias ? [] : ['receipt-1'] }) };
    },
  });
  vm.runInContext(source, ctx);
  return window.KiwiZReconciliation;
}
const first = instance(false);
const report = { day: '2026-02-14', terminalId: 'till-a', store: { slug: 'restaurant-fixture' }, txns: 1, gross: 57 };
const receipt = { id: 'receipt-1', time: new Date('2026-02-14T20:00:00Z'), amount: 57, method: 'cash' };
assert.equal((await first.queueClose(report, [receipt])).ok, true);
assert.equal(rows.size, 1, 'Z job survives before send');
assert.equal(requests, 0, 'offline means no POST');
const after = instance(true);
const deadline = Date.now() + 5000;
while ((!requeues || [...rows.values()][0]?.state !== 'pending') && Date.now() < deadline) {
  await new Promise(resolve => setTimeout(resolve, 10));
}
await new Promise(resolve => setImmediate(resolve));
assert.equal(requeues, 1, 'missing local receipt requeued through normal sale transport');
assert.equal(rows.size, 1, 'Z obligation kept until server verifies repair');
await after.flush();
assert.equal(rows.size, 0, 'matched comparison acknowledges durable Z job');
assert.equal(requests, 2);
const nextShift = instance(false);
const second = { id: 'receipt-2', time: new Date('2026-02-14T22:00:00Z'), amount: 23, method: 'card' };
assert.equal((await nextShift.queueClose({ ...report, txns: 2, gross: 80 }, [second])).ok, true);
assert.equal([...rows.values()][0].payload.entries.length, 2, 'a second shift on the same day keeps the first Z manifest');
console.log('✓ closed Z survives reload, repairs missing sales, waits for server proof and carries a second shift');
