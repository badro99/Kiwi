#!/usr/bin/env node
import serveurTestSource from './serveur-test-source.cjs';
/* O02 regression: execute the production serveur sender in a VM and hold the
 * real fetch promises open to model a double tap plus a line added mid-flight. */
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = serveurTestSource(fs.readFileSync(new URL('../kiwi-serveur.html', import.meta.url), 'utf8'));
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
  svBrowseMode: () => false,
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

/* A transient failure (the server may simply not have answered): the batch
   stays durable and the retry carries the same reference. */
requests[1].resolve(new Response(JSON.stringify({ error: 'service-session-unavailable' }), {
  status: 503, headers: { 'Content-Type': 'application/json' },
}));
const result = await first;
assert.equal(result.ok, false, 'failure of the follow-up batch reaches the original caller');
assert.equal(result.error, 'service-session-unavailable');
assert.equal(tableOrders.T1[1].sentQty, 0, 'failed batch remains visibly unsent');
assert.ok(memory.size > 0, 'failed batch remains durable for retry');

/* A definitive refusal (Browse, 22 Nov 2026): the server wrote nothing and
   would refuse the same frozen lines forever. Table 3 replayed a refused batch
   on every « Lancer » while the screen showed a different order. The batch is
   dropped, the toast gets the refused dish, and the next send starts from the
   screen with a fresh reference. */
const retry = context.svSendOrder('T1');
for (let i = 0; i < 20 && requests.length < 3; i++) await new Promise((resolve) => setTimeout(resolve, 0));
assert.equal(JSON.parse(requests[2].options.body).ref, secondBody.ref, 'a transient retry replays the same batch');
requests[2].resolve(new Response(JSON.stringify({ error: 'menu-changed', unknown: [], unavailable: [], invalidOptions: ['Dessert'] }), {
  status: 409, headers: { 'Content-Type': 'application/json' },
}));
const refused = await retry;
assert.equal(refused.error, 'menu-changed');
assert.deepEqual([...refused.names], ['Dessert'], 'the refusal names the dish');
assert.equal(memory.size, 0, 'a refused batch is not kept to be replayed');
assert.equal(tableOrders.T1[1].sentQty, 0, 'the refused line stays visibly unsent');
context.svSendOrder('T1');
for (let i = 0; i < 20 && requests.length < 4; i++) await new Promise((resolve) => setTimeout(resolve, 0));
const rebuilt = JSON.parse(requests[3].options.body);
assert.notEqual(rebuilt.ref, secondBody.ref, 'the next send is a new batch built from the screen');
assert.deepEqual(rebuilt.lines.map((line) => line.uid), ['line-b']);

/* A batch left from an earlier service (over 12 h) is never replayed. */
memory.clear();
context.svForgetPending('T1');
memory.set(context.svPendingKey('T1'), JSON.stringify({ ref: 'sv-yesterday', createdAt: Date.now() - 22 * 3600 * 1000,
  lines: [{ id: 'gone', uid: 'old', qty: 2 }] }));
assert.equal(context.svReadPending('T1'), null, 'a batch from yesterday is not replayed');
assert.equal(memory.size, 0, 'and it is cleared');

console.log('✓ O02 serveur sender serializes double taps, isolates delayed ACKs, keeps transient failures durable, and drops refused or stale batches');
