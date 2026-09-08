#!/usr/bin/env node
/* O02 regression: execute the production serveur sender in a VM and hold the
 * real fetch promises open to model a double tap plus a line added mid-flight. */
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../kiwi-serveur.html', import.meta.url), 'utf8');
const start = source.indexOf('    const svPendingRef = new Map();');
const end = source.indexOf('    /* ---------- Generated orders for occupied tables ---------- */', start);
assert.ok(start >= 0 && end > start, 'production sender block remains extractable');

const memory = new Map();
const requests = [];
const tableOrders = {
  T1: [{ uid: 'line-a', id: 'dish', name: 'Dish', qty: 1, sentQty: 0, price: 50, opts: [], note: '', station: 'kitchen' }],
};
const context = {
  console,
  Date,
  Math,
  JSON,
  Object,
  Array,
  String,
  Number,
  Boolean,
  Promise,
  Map,
  localStorage: {
    getItem(key) { return memory.has(key) ? memory.get(key) : null; },
    setItem(key, value) { memory.set(key, String(value)); },
    removeItem(key) { memory.delete(key); },
  },
  liveEmployeeState: { merchant: 'audit-cafe', staffId: 'waiter-1' },
  currentUser: 'waiter-1',
  svSlug: () => 'audit-cafe',
  tableOrders,
  activeRole: { fullName: 'Audit Waiter' },
  serviceTableSessions: new Map([['T1', 'tsx-audit-session']]),
  serviceTableSessionRevisions: new Map([['T1', 7]]),
  serviceStateVersion: new Map(),
  serviceBillAwaiting: new Map(),
  tables: { T1: {} },
  serviceCanonicalOrders: new Map(),
  fetch(url, options) {
    requests.push({ url, options, resolve: null });
    return new Promise((resolve) => { requests.at(-1).resolve = resolve; });
  },
};
context.window = context;
const vm = await import('node:vm');
vm.runInNewContext(source.slice(start, end), context, { filename: 'kiwi-serveur.html' });

const first = context.svSendOrder('T1');
const second = context.svSendOrder('T1');
assert.strictEqual(first, second, 'double tap shares the in-flight promise');
await new Promise((resolve) => setTimeout(resolve, 0));
assert.equal(requests.length, 1, 'double tap makes one network request');
const firstBody = JSON.parse(requests[0].options.body);
assert.deepEqual(firstBody.lines.map((line) => line.uid), ['line-a']);

// This is the race: the operator adds a dessert before the first ACK arrives.
tableOrders.T1.push({ uid: 'line-b', id: 'dessert', name: 'Dessert', qty: 1, sentQty: 0, price: 20, opts: [], note: '', station: 'kitchen' });
requests[0].resolve(new Response(JSON.stringify({
  ok: true, number: 42, lines: [{ uid: 'line-a', qty: 1 }],
}), { status: 200, headers: { 'Content-Type': 'application/json' } }));

for (let i = 0; i < 20 && requests.length < 2; i++) await new Promise((resolve) => setTimeout(resolve, 0));
assert.equal(requests.length, 2, 'the same send drains the line added during the delayed ACK');
const secondBody = JSON.parse(requests[1].options.body);
assert.deepEqual(secondBody.lines.map((line) => line.uid), ['line-b'], 'batch B excludes acknowledged batch A');
assert.equal(tableOrders.T1[0].sentQty, 1, 'ACK A marks only its immutable base line');
assert.equal(tableOrders.T1[1].sentQty, 0, 'ACK A cannot mark the newly added line sent');

requests[1].resolve(new Response(JSON.stringify({ error: 'menu-changed' }), {
  status: 409, headers: { 'Content-Type': 'application/json' },
}));
const result = await first;
assert.equal(result.ok, false, 'failure of the follow-up batch reaches the original caller');
assert.equal(result.error, 'menu-changed');
assert.equal(tableOrders.T1[1].sentQty, 0, 'failed batch remains visibly unsent');
assert.ok(memory.size > 0, 'failed batch remains durable for retry');

console.log('✓ O02 serveur sender serializes double taps, isolates delayed ACKs, and propagates batch failure');
