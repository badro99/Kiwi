#!/usr/bin/env node
/* A table seated with no order does not stay occupied all service.
 *   node tools/empty-visit-release-test.mjs
 *
 * Browse, 21 Nov 2026: « les tables restent bloquées à vide ». A waiter who
 * opens a table starts a visit before any order. When no order follows (the
 * guests leave, the wrong table was tapped, or the order was refused), every
 * waiter's poll re-stamped that visit as alive, so it never expired and the
 * table stayed occupied on every phone until someone freed it by hand.
 *
 * Held here, on the real queue handler over in-memory SQLite:
 *   · a visit with no order, untouched for 30 minutes, is closed (`empty`),
 *     leaves `sessions` and appears in `closedSessions`;
 *   · a visit with an order of the same age stays open, and the poll keeps it
 *     alive;
 *   · a visit with no order opened 10 minutes ago stays open;
 *   · a visit whose only order was refused counts as empty;
 *   · the shared floor (service-events) shows the freed table as khawya.
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
doc('floorplan', { tables: ['11', '12', '13', '14'].map((num) => ({ id: 'T' + num, num, servers: [staffId] })) });
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


const MIN = 60000;
const seat = async (table) => {
  const r = await call('POST', { merchant, openTable: table, covers: 2 });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  return r.body.session;
};
const age = (id, ms) => db.prepare('UPDATE table_sessions SET opened_ts = ?, seen_ts = ? WHERE id = ?').run(now - ms, now - ms, id);
const row = (id) => db.prepare('SELECT status, closed_by, seen_ts FROM table_sessions WHERE id = ?').get(id);
const addOrder = (id, table, status) => db.prepare(`INSERT INTO orders (id, merchant, number, mode, table_no, total, lines, status, session_id, created_ts, updated_ts)
  VALUES (?, ?, 1, 'table', ?, 99, '[]', ?, ?, ?, ?)`).run('ord-' + table, merchant, table, status, id, now - 40 * MIN, now - 40 * MIN);

const empty = await seat('11'); age(empty, 40 * MIN);
const withOrder = await seat('12'); age(withOrder, 40 * MIN); addOrder(withOrder, '12', 'accepted');
const fresh = await seat('13'); age(fresh, 10 * MIN);
const refused = await seat('14'); age(refused, 40 * MIN); addOrder(refused, '14', 'rejected');

const polled = await call('GET');
assert.equal(polled.status, 200, JSON.stringify(polled.body));
const open = (polled.body.sessions || []).map((s) => s.id);
const closed = (polled.body.closedSessions || []).map((s) => s.id);
ok(row(empty).status === 'closed' && row(empty).closed_by === 'empty', 'a visit with no order, untouched for 30 min, is closed as empty', JSON.stringify(row(empty)));
ok(!open.includes(empty) && closed.includes(empty), 'the poll reports it closed, so every phone and the till free the table', JSON.stringify({ open, closed }));
ok(row(withOrder).status === 'open' && open.includes(withOrder), 'a visit with an order stays open', JSON.stringify(row(withOrder)));
ok(row(withOrder).seen_ts > now - 5 * MIN, 'and the waiter poll keeps it alive', JSON.stringify(row(withOrder)));
ok(row(fresh).status === 'open' && open.includes(fresh), 'a visit with no order opened 10 min ago stays open', JSON.stringify(row(fresh)));
ok(row(refused).status === 'closed' && row(refused).closed_by === 'empty', 'a visit whose only order was refused counts as empty', JSON.stringify(row(refused)));
const floor = JSON.parse((db.prepare("SELECT data FROM store_docs WHERE merchant = ? AND feature = 'service-events'").get(merchant) || { data: '{}' }).data);
const st = (t) => (floor.states || {})[t] || {};
ok(st('11').status === 'khawya', 'the shared floor shows the empty table free again, as after a payment', JSON.stringify(floor.states));
ok(st('12').status !== 'khawya', 'the table with an order is not freed on the floor', JSON.stringify(floor.states));
const again = await call('GET');
ok(again.status === 200 && !(again.body.sessions || []).some((v) => v.id === empty), 'a second poll changes nothing more');
console.log(`empty-visit-release: ${passed} passed`);
