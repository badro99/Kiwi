#!/usr/bin/env node
/* Waiter-app table orders stay off the till's « Commandes en ligne » list.
 *   node tools/waiter-orders-off-inbox-test.mjs
 *
 * Browse, 21 Nov 2026: « HO-16 · Table 11 · Houssam Ouissal » sat in the
 * till's online-orders list under « À emporter », with « Marquer prêt » and
 * « Encaisser », next to the real phone orders. The waiter app stored its
 * orders with no channel, the poll answered `kiwi`, and the list took them for
 * a guest's phone order. The owner: « très problématique pour suivre ».
 *
 * Held here, on the real handlers over in-memory SQLite and the shipped list():
 *   · an order the waiter app sends is stored as channel `serveur`;
 *   · the poll still answers `kiwi` for it (ticket refs such as « HO-16 » and
 *     the till's merge keep working unchanged) and adds `staff: true`;
 *   · the online-orders list leaves a staff table order out, and keeps a
 *     guest's phone order and a waiter's takeaway order.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { DatabaseSync } from 'node:sqlite';
import { employeeToken, EMPLOYEE_COOKIE } from '../functions/auth/_lib.js';
import * as queue from '../functions/api/order/queue.js';

const read = (f) => fs.readFileSync(new URL('../' + f, import.meta.url), 'utf8');
let passed = 0;
const ok = (yes, msg, detail) => { assert.ok(yes, msg + (detail ? ' · ' + detail : '')); passed++; console.log('  ✓ ' + msg); };

const db = new DatabaseSync(':memory:');
db.exec(read('schema.sql'));
const DB = {
  prepare(sql) {
    let args = [];
    return {
      bind(...v) { args = v.map((x) => (x === undefined ? null : x)); return this; },
      first() { return db.prepare(sql).get(...args) || null; },
      all() { return { results: db.prepare(sql).all(...args) }; },
      run() { return { success: true, meta: { changes: db.prepare(sql).run(...args).changes } }; },
    };
  },
  async batch(statements) {
    db.exec('BEGIN IMMEDIATE');
    try { const r = []; for (const s of statements) r.push(await s.run()); db.exec('COMMIT'); return r; }
    catch (e) { db.exec('ROLLBACK'); throw e; }
  },
};
const now = Date.now(), merchant = 'waiter-inbox-fixture', staffId = 'waiter-fixture';
const env = { DB, AUTH_SECRET: 'synthetic-waiter-inbox-test-only' };
const doc = (feature, data) => db.prepare('INSERT INTO store_docs (merchant, feature, data, rev, updated_ts) VALUES (?, ?, ?, 1, ?)')
  .run(merchant, feature, JSON.stringify(data), now);
doc('employee-access', { members: [{ id: staffId, firstName: 'Houssam', lastName: 'Fixture', function: 'Serveur', department: 'Salle', venueSlug: merchant }] });
doc('attendance', { entries: [{ id: 'att-1', memberId: staffId, staffId, inTs: now - 3600000, outTs: null, pauseTs: null }] });
doc('floorplan', { tables: ['11'].map((num) => ({ id: 'T' + num, num, servers: [staffId] })) });
db.prepare('INSERT INTO merchant_config (merchant, features, type, updated_ts) VALUES (?, ?, ?, ?)').run(merchant, '{"orderpro":true}', 'restaurant', now);
db.prepare('INSERT INTO menus (merchant, name, type, data, updated_ts) VALUES (?, ?, ?, ?, ?)').run(merchant, 'Carte', 'restaurant',
  JSON.stringify({ cats: [{ id: 'c', name: 'Plats' }], items: [{ id: 'dish', name: 'Le Gourmand', catId: 'c', price: 99, avail: true }] }), now);
const cookie = EMPLOYEE_COOKIE + '=' + await employeeToken(env.AUTH_SECRET, { memberId: staffId, staffId, merchant, inTs: now - 3600000 });
const call = async (method, body) => {
  const url = 'https://fixture.invalid/api/order/queue' + (method === 'GET' ? '?merchant=' + merchant : '');
  const res = await (method === 'GET' ? queue.onRequestGet : queue.onRequestPost)({ env, request: new Request(url, {
    method, headers: { 'Content-Type': 'application/json', Cookie: cookie }, body: body ? JSON.stringify(body) : undefined,
  }) });
  return { status: res.status, body: await res.json() };
};

const created = await call('POST', { merchant, create: true, mode: 'table', table: '11', server: 'Houssam Fixture', ref: 'waiter-ref-1', lines: [{ id: 'dish', qty: 2 }] });
ok(created.status === 200 && created.body.ok, 'the waiter app sends its table order', JSON.stringify(created.body));
const stored = db.prepare('SELECT channel, server_name FROM orders WHERE id = ?').get(created.body.id);
ok(stored && stored.channel === 'serveur', 'it is stored as channel serveur', JSON.stringify(stored));

const polled = await call('GET');
const seen = (polled.body.orders || []).find((o) => o.id === created.body.id);
ok(seen && seen.channel === 'kiwi', 'the poll still answers kiwi for it (ticket refs and the till merge unchanged)', JSON.stringify(seen));
ok(seen && seen.staff === true, 'the poll marks it staff', JSON.stringify(seen));

/* The shipped list() of the online-orders inbox, run on three orders. */
const src = read('assets/orderpro-inbox.js');
const a = src.indexOf('  function list(status) {'), b = src.indexOf('\n  /* D\'où vient cette commande.', a);
assert.ok(a > 0 && b > a, 'list() found in orderpro-inbox.js');
const state = { closedSessions: [], orders: {
  waiterTable: { id: 'waiterTable', mode: 'table', table: '11', status: 'accepted', channel: 'kiwi', staff: true, server: 'Houssam Fixture', session: 's1', created_ts: 1 },
  guestTable: { id: 'guestTable', mode: 'table', table: '4', status: 'accepted', channel: 'kiwi', server: 'Houssam Fixture', session: 's2', created_ts: 2 },
  waiterTakeout: { id: 'waiterTakeout', mode: 'takeout', table: '', status: 'accepted', channel: 'kiwi', staff: true, server: 'Houssam Fixture', created_ts: 3 },
} };
const listed = vm.runInNewContext(src.slice(a, b) + '\nlist("accepted").map(function (o) { return o.id; });', { state });
ok(!listed.includes('waiterTable'), 'the online-orders list leaves the waiter\'s table order out', JSON.stringify(listed));
ok(listed.includes('guestTable'), 'a guest\'s phone order for a table stays listed', JSON.stringify(listed));
ok(listed.includes('waiterTakeout'), 'a waiter\'s takeaway order stays listed', JSON.stringify(listed));

console.log(`waiter-orders-off-inbox: ${passed} passed`);
