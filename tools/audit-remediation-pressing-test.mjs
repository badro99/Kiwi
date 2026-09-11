#!/usr/bin/env node
/* Focused regression coverage for A10, I06 and I07.
 *
 * The pressing operations bridge is executed as shipped. The caisse merge and
 * rack functions are extracted from that same shipped source so their real
 * closures run without manufacturing a browser DOM. SQLite supplies the two
 * device snapshots for the rack race; no merchant, provider or remote write
 * is involved.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { onRequestPost as pressingCancelPost } from '../functions/api/pressing/cancel.js';
import { onRequestPost as storePost } from '../functions/api/store.js';
import { onRequest as middleware } from '../functions/_middleware.js';
import { tillToken } from '../functions/auth/_lib.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
let passed = 0;
function check(value, label) { assert(value, label); passed++; console.log('  + ' + label); }

function memoryStorage(seed = {}) {
  const values = new Map(Object.entries(seed));
  return {
    getItem: (key) => values.has(key) ? values.get(key) : null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
}

function functionSource(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert(start >= 0, `function ${name} exists in shipped source`);
  const open = source.indexOf('{', start);
  let depth = 0;
  for (let i = open; i < source.length; i++) {
    if (source[i] === '{') depth++;
    else if (source[i] === '}' && --depth === 0) return source.slice(start, i + 1);
  }
  throw new Error(`unterminated function ${name}`);
}

function runOpsTest() {
  const source = read('assets/pressing-ops.js');
  const store = memoryStorage({ kiwiPairedVenue: JSON.stringify({ merchant: 'audit-pressing' }) });
  const window = {
    localStorage: store,
    KiwiPlatform: { pairedMerchant: () => 'audit-pressing' },
    addEventListener() {},
    dispatchEvent() {},
  };
  window.__source = source;
  const executable = source.replace(
    'window.KiwiPressingOps = {',
    'window.__mergePressingDocuments = mergeDocuments; window.KiwiPressingOps = {'
  );
  const context = vm.createContext({ window, localStorage: store, Date, JSON, Math, String, Number, Object, Array, Set, RegExp, CustomEvent: class {} });
  vm.runInContext(executable, context, { filename: 'assets/pressing-ops.js' });
  const order = {
    id: 'P-AUDIT-1', custId: 'c1', guest: null,
    pieces: [{ pid: 'piece-1', label: 'Chemise', itemId: 'chemise', svcs: ['lavage'], status: 'trait', photos: 0 }],
    droppedAt: '2026-09-08T08:00:00.000Z', readyAt: '2026-09-09T08:00:00.000Z',
    pay: { mode: 'pickup', paid: 0 }, total: 35, rack: 'A-01', updatedAt: 10,
  };
  const fullKey = 'kiwi:pressing-store:v1:audit-pressing';
  store.setItem(fullKey, JSON.stringify({
    customers: [{ id: 'c1', name: 'Audit customer', phone: '' }], orders: [order], seq: 1, updatedAt: 10,
  }));
  const ops = context.window.KiwiPressingOps;
  const actor = { id: 'manager-7', name: 'Nadia Manager', role: 'manager' };
  check(ops.cancelOrder('P-AUDIT-1', actor) === true, 'I06 cancellation writes the real pressing bridge record');
  const cancelled = JSON.parse(store.getItem(fullKey));
  check(cancelled.orders.length === 1 && cancelled.orders[0].cancelledBy.id === 'manager-7', 'I06 keeps a cancelled order and attributable manager identity');
  check(cancelled.cancellations.length === 1 && !JSON.stringify(cancelled).includes('1234'), 'A10 durable evidence stores identity, never the PIN');
  check(ops.summary().active === 0, 'I06 cancelled order is absent from the live owner summary');

  const stale = { ...order, updatedAt: 999, rack: 'A-01' };
  const merged = context.window.__mergePressingDocuments(cancelled, {
    customers: cancelled.customers, orders: [stale], cancellations: [], seq: 2, updatedAt: 999,
  });
  check(merged.orders[0].cancelledAt && merged.orders[0].cancelledBy.id === 'manager-7', 'I06 stale active snapshot cannot resurrect a tombstoned order');
}

function d1(db) {
  return {
    prepare(sql) {
      let args = [];
      const statement = {
        bind(...values) { args = values; return statement; },
        async first() { return db.prepare(sql).get(...args) || null; },
        async all() { return { results: db.prepare(sql).all(...args) }; },
        async run() { const result = db.prepare(sql).run(...args); return { meta: { changes: Number(result.changes) } }; },
      };
      return statement;
    },
    async batch(statements) { return Promise.all(statements.map((statement) => statement.run())); },
  };
}

async function runRouteTest() {
  const db = new DatabaseSync(':memory:');
  db.exec(read('schema.sql'));
  const merchant = 'audit-pressing-route';
  const secret = 'audit-pressing-route-secret-32-chars';
  const now = Date.now();
  db.prepare('INSERT INTO merchant_config (merchant,features,plan,type,status,name,updated_ts) VALUES (?,?,?,?,?,?,?)')
    .run(merchant, '{}', 'pro', 'pressing', 'active', 'Audit Pressing', now);
  db.prepare('INSERT INTO staff_pins (id,merchant,pin,name,role,created_ts) VALUES (?,?,?,?,?,?)')
    .run('manager-42', merchant, '2468', 'Nadia Manager', 'manager', now);
  const routeOrder = {
    id: 'P-ROUTE-1', lines: [{ itemId: 'chemise', qty: 1 }], pieces: [{ pid: 'p1', status: 'pret' }],
    droppedAt: '2026-09-08T08:00:00.000Z', readyAt: '2026-09-08T12:00:00.000Z', rack: 'A-02',
    pay: { mode: 'pickup', paid: 0 }, total: 40, updatedAt: now,
  };
  const liveOrder = {
    id: 'P-ROUTE-LIVE', lines: [{ itemId: 'pantalon', qty: 1 }], pieces: [{ pid: 'p2', status: 'pret' }],
    droppedAt: '2026-09-08T08:30:00.000Z', readyAt: '2026-09-08T12:30:00.000Z', rack: 'B-02',
    pay: { mode: 'pickup', paid: 0 }, total: 25, updatedAt: now,
  };
  db.prepare('INSERT INTO store_docs (merchant,feature,data,rev,updated_ts) VALUES (?,?,?,?,?)')
    .run(merchant, 'pressing-orders', JSON.stringify({ customers: [], orders: [routeOrder, liveOrder], seq: 1, updatedAt: now }), 1, now);
  const env = { DB: d1(db), AUTH_SECRET: secret };
  const cookie = `kiwi_till=${await tillToken(secret, merchant)}`;
  const callCancel = (pin) => pressingCancelPost({
    env,
    request: new Request('https://kiwi.test/api/pressing/cancel', {
      method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ merchant, orderId: routeOrder.id, pin }),
    }),
  });
  const callCancelThroughMiddleware = (pin) => {
    const request = new Request('https://kiwi.test/api/pressing/cancel', {
      method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ merchant, orderId: routeOrder.id, pin }),
    });
    return middleware({ env, request, next: (nextRequest = request) => pressingCancelPost({ env, request: nextRequest }) });
  };
  let response = await callCancel('9999');
  check(response.status === 401, 'A10 incorrect four-digit PIN is rejected by the real pressing route');
  check(!JSON.parse(db.prepare("SELECT data FROM store_docs WHERE merchant=? AND feature='pressing-orders'").get(merchant).data).orders[0].cancelledAt, 'A10 rejected PIN leaves the authoritative order unchanged');
  response = await callCancelThroughMiddleware('2468');
  const authorized = await response.json();
  check(response.status === 200 && authorized.actor.id === 'manager-42' && authorized.cancelledAt, 'A10 paired till crosses the real middleware and route records server identity/time');
  const afterCancel = JSON.parse(db.prepare("SELECT data FROM store_docs WHERE merchant=? AND feature='pressing-orders'").get(merchant).data);
  check(afterCancel.cancellations.length === 1 && afterCancel.orders[0].rack === null, 'A10 route writes a durable tombstone and releases its rack');
  response = await callCancel('9999');
  check(response.status === 401, 'A10 replay with an incorrect PIN cannot reuse an existing tombstone');

  const rev = db.prepare("SELECT rev FROM store_docs WHERE merchant=? AND feature='pressing-orders'").get(merchant).rev;
  response = await storePost({
    env,
    request: new Request('https://kiwi.test/api/store', {
      method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ feature: 'pressing-orders', merchant, baseRev: rev, data: { customers: [], orders: [liveOrder], seq: 2 } }),
    }),
  });
  const preserved = JSON.parse(db.prepare("SELECT data FROM store_docs WHERE merchant=? AND feature='pressing-orders'").get(merchant).data);
  check(response.status === 200 && preserved.cancellations.length === 1 && preserved.orders.some((o) => o.id === routeOrder.id && o.cancelledAt) && preserved.orders.some((o) => o.id === liveOrder.id), 'I06 generic store snapshot cannot drop an existing cancellation or live order');

  const forgedRev = db.prepare("SELECT rev FROM store_docs WHERE merchant=? AND feature='pressing-orders'").get(merchant).rev;
  const forgedAt = '2099-01-01T00:00:00.000Z';
  const forgedActor = { id: 'forged-till', name: 'Forged', role: 'manager' };
  response = await storePost({
    env,
    request: new Request('https://kiwi.test/api/store', {
      method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ feature: 'pressing-orders', merchant, baseRev: forgedRev, data: {
        customers: [], orders: [{ ...liveOrder, cancelledAt: forgedAt, cancelledBy: forgedActor }],
        cancellations: [{ id: liveOrder.id, cancelledAt: forgedAt, cancelledBy: forgedActor }], seq: 3,
      } }),
    }),
  });
  check(response.status === 409 && (await response.json()).error === 'pressing-cancellation-route-required', 'A10 generic snapshot cannot forge a new cancellation tombstone');

  response = await storePost({
    env,
    request: new Request('https://kiwi.test/api/store', {
      method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ feature: 'pressing-orders', merchant, baseRev: forgedRev, data: {
        customers: [], orders: [preserved.orders.find((o) => o.id === routeOrder.id), liveOrder],
        cancellations: [{ id: routeOrder.id, cancelledAt: forgedAt, cancelledBy: forgedActor }], seq: 4,
      } }),
    }),
  });
  check(response.status === 409 && (await response.json()).error === 'pressing-cancellation-immutable', 'A10 generic snapshot cannot rewrite an authoritative cancellation actor or time');

  response = await storePost({
    env,
    request: new Request('https://kiwi.test/api/store', {
      method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ feature: 'pressing-orders', merchant, baseRev: forgedRev, data: {
        customers: [], orders: [preserved.orders.find((o) => o.id === routeOrder.id)], seq: 5,
      } }),
    }),
  });
  check(response.status === 409 && (await response.json()).error === 'pressing-order-retention-conflict', 'A10 generic snapshot cannot silently remove a live order');

  const freshMerchant = 'audit-pressing-fresh';
  db.prepare('INSERT INTO merchant_config (merchant,features,plan,type,status,name,updated_ts) VALUES (?,?,?,?,?,?,?)')
    .run(freshMerchant, '{}', 'pro', 'pressing', 'active', 'Fresh Pressing', now);
  response = await storePost({
    env,
    request: new Request('https://kiwi.test/api/store', {
      method: 'POST', headers: { Cookie: `kiwi_till=${await tillToken(secret, freshMerchant)}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ feature: 'pressing-orders', merchant: freshMerchant, baseRev: 0, data: {
        customers: [], orders: [{ id: 'P-FRESH-FORGED', cancelledAt: forgedAt, cancelledBy: forgedActor }],
        cancellations: [{ id: 'P-FRESH-FORGED', cancelledAt: forgedAt, cancelledBy: forgedActor }], seq: 1,
      } }),
    }),
  });
  check(response.status === 409 && (await response.json()).error === 'pressing-cancellation-route-required', 'A10 first generic snapshot cannot create a cancellation before the route authorizes it');

  const casBaseRev = db.prepare("SELECT rev FROM store_docs WHERE merchant=? AND feature='pressing-orders'").get(merchant).rev;
  const callStore = (baseRev, orderId) => storePost({
    env,
    request: new Request('https://kiwi.test/api/store', {
      method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ feature: 'pressing-orders', merchant, baseRev, data: { customers: [], orders: [liveOrder, { id: orderId }], seq: 6 } }),
    }),
  });
  const firstWrite = await callStore(casBaseRev, 'P-CAS-A');
  const staleWrite = await callStore(casBaseRev, 'P-CAS-B');
  check(firstWrite.status === 200 && staleWrite.status === 409, 'I07 pressing store CAS rejects a second write based on the same revision');
  const duplicateBaseRev = db.prepare("SELECT rev FROM store_docs WHERE merchant=? AND feature='pressing-orders'").get(merchant).rev;
  const duplicate = await storePost({
    env,
    request: new Request('https://kiwi.test/api/store', {
      method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ feature: 'pressing-orders', merchant, baseRev: duplicateBaseRev, data: {
        customers: [], orders: [liveOrder, { id: 'P-CAS-A' }, { id: 'P-RACK-A', rack: 'A-01' }, { id: 'P-RACK-B', rack: 'A-01' }], seq: 7,
      } }),
    }),
  });
  check(duplicate.status === 409 && (await duplicate.json()).error === 'rack-conflict', 'I07 server rejects a duplicate active rack slot explicitly');
}

function runRackTest() {
  const source = read('assets/pressing-caisse.js');
  check(source.includes("fetch('/api/pressing/cancel'"), 'A10 caisse sends cancellation to the server authorization boundary');
  const cancelStart = source.indexOf("const cancelB = $('#px-dt-cancel'");
  const cancelEnd = source.indexOf('\n    };', cancelStart);
  check(cancelStart >= 0 && cancelEnd > cancelStart && !source.slice(cancelStart, cancelEnd).includes('ORDERS.splice'), 'A10 cancellation does not delete the only durable order copy');
  check(cancelStart >= 0 && source.slice(cancelStart, cancelEnd).includes('cancellation && cancellation.cancelledAt')
    && source.slice(cancelStart, cancelEnd).includes('cancelledAt.toISOString()'), 'A10 caisse uses the server cancellation timestamp for local evidence');

  const effective = functionSource(source, 'effectiveStatus');
  const status = functionSource(source, 'orderStatus');
  const live = functionSource(source, 'isLiveOrder');
  const merge = functionSource(source, 'mergePressingDocuments');
  const mergePressingDocuments = new Function(`${effective}\n${status}\n${live}\n${merge}\nreturn mergePressingDocuments;`)();
  const rackSlots = Object.create(null);
  const toasts = [];
  const assignSlot = new Function('rackSlots', 'syncOwnerOps', 'toast', `${functionSource(source, 'assignSlot')}\nreturn assignSlot;`)(rackSlots, () => {}, (message) => toasts.push(message));
  const readyPiece = { status: 'pret' };
  const first = { id: 'device-a', pieces: [readyPiece], readyAt: '2026-09-08T12:00:00.000Z', rack: null };
  const second = { id: 'device-b', pieces: [readyPiece], readyAt: '2026-09-08T12:00:00.000Z', rack: null };
  check(assignSlot(first, 'A-01') === true, 'I07 first device can reserve a free rack slot');
  check(assignSlot(second, 'A-01') === false && second.rack === null && toasts.length === 1, 'I07 second device is rejected while the slot is occupied');

  const db = new DatabaseSync(':memory:');
  db.exec('CREATE TABLE rack_attempts (device TEXT PRIMARY KEY, order_id TEXT NOT NULL, slot TEXT NOT NULL, updated_at INTEGER NOT NULL)');
  db.prepare('INSERT INTO rack_attempts VALUES (?,?,?,?)').run('device-a', 'device-a', 'A-01', 100);
  db.prepare('INSERT INTO rack_attempts VALUES (?,?,?,?)').run('device-b', 'device-b', 'A-01', 200);
  const attempts = db.prepare('SELECT order_id AS id, slot AS rack, updated_at AS updatedAt FROM rack_attempts ORDER BY updated_at').all();
  const merged = mergePressingDocuments(
    { customers: [], orders: [attempts[0]], seq: 1, updatedAt: 100 },
    { customers: [], orders: [attempts[1]], seq: 2, updatedAt: 200 },
  );
  const occupied = merged.orders.filter((row) => row.rack === 'A-01');
  check(occupied.length === 1 && occupied[0].id === 'device-b', 'I07 concurrent SQLite-backed snapshots converge to one deterministic rack owner');
  check(merged.orders.some((row) => row.id === 'device-a' && row.rack === null), 'I07 losing rack owner is explicitly left unassigned, not silently duplicated');
  check(merged.rackConflicts.length === 1 && merged.rackConflicts[0].loserId === 'device-a', 'I07 merge records the losing rack assignment as an explicit conflict');
}

runOpsTest();
await runRouteTest();
runRackTest();
console.log(`audit-remediation-pressing-test: A10/I06/I07 green (${passed} checks)`);
