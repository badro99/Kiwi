#!/usr/bin/env node
/* Focused behavioural gate for the O01-O07 order remediation. */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import { employeeToken, EMPLOYEE_COOKIE, makeSession, sessionCookie } from '../functions/auth/_lib.js';
import { priceOrder } from '../functions/api/order/_lib.js';
import * as queue from '../functions/api/order/queue.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SECRET = 'test-secret-audit-orders';
const MERCHANT = 'audit-order-remediation';
const STAFF = 'audit-staff';
const ACCOUNT = 'audit-account';
let failures = 0;
const ok = (name, value, detail = '') => {
  if (value) console.log(`  ✓ ${name}`);
  else { failures++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`); }
};

function makeDB() {
  const db = new DatabaseSync(':memory:');
  const schema = fs.readFileSync(path.join(ROOT, 'schema.sql'), 'utf8');
  for (const sql of schema.replace(/--[^\n]*/g, '').split(';').map((x) => x.trim()).filter(Boolean)) db.exec(sql);
  const facade = { _db: db };
  facade.prepare = (sql) => {
    let args = [];
    const statement = {
      bind(...values) { args = values.map((v) => v === undefined ? null : v); return statement; },
      first() { const row = db.prepare(sql).get(...args); return row === undefined ? null : row; },
      all() { return { results: db.prepare(sql).all(...args) }; },
      run() { const result = db.prepare(sql).run(...args); return { success: true, meta: { changes: result.changes } }; },
    };
    return statement;
  };
  facade.batch = async (statements) => {
    db.exec('BEGIN IMMEDIATE');
    try {
      const result = [];
      for (const statement of statements) result.push(await statement.run());
      db.exec('COMMIT');
      return result;
    } catch (error) {
      try { db.exec('ROLLBACK'); } catch (_) {}
      throw error;
    }
  };
  return facade;
}

const DB = makeDB();
const env = { DB, AUTH_SECRET: SECRET };
const exec = (sql, ...args) => DB._db.prepare(sql).run(...args);
const now = Date.now();
exec('INSERT INTO accounts (id, email, name, business, salt, hash, created_ts) VALUES (?, ?, ?, ?, ?, ?, ?)', ACCOUNT, 'audit@example.test', 'Audit', 'Audit Cafe', 's', 'h', now);
exec('INSERT INTO merchant_config (merchant, features, type, account_id, updated_ts) VALUES (?, ?, ?, ?, ?)', MERCHANT, JSON.stringify({ orderpro: true }), 'restaurant', ACCOUNT, now);
const member = { id: STAFF, firstName: 'Audit', lastName: 'Waiter', email: 'audit@example.test', function: 'Serveur', department: 'Salle', venueSlug: MERCHANT };
const doc = (feature, data) => exec(
  'INSERT INTO store_docs (merchant, feature, data, rev, updated_ts) VALUES (?, ?, ?, 1, ?)', MERCHANT, feature, JSON.stringify(data), now);
doc('employee-access', { members: [member] });
doc('attendance', { entries: [{ id: 'audit-att', memberId: STAFF, staffId: STAFF, name: 'Audit Waiter', inTs: now - 3600000, outTs: null, pauseTs: null }] });
doc('floorplan', { staff: [{ id: STAFF, name: 'Audit Waiter' }], tables: [
  { id: 'TA', num: 'A', servers: [STAFF] }, { id: 'TB', num: 'B', servers: [STAFF] },
] });
const menu = { cats: [{ id: 'food', name: 'Food', station: 'kitchen' }], stations: [{ id: 'kitchen', name: 'Kitchen' }],
  items: [
    { id: 'dish', name: 'Dish', price: 50, catId: 'food', avail: true, opts: ['required-mod'] },
    { id: 'coffee', name: 'Coffee', price: 20, catId: 'food', avail: true },
  ],
  opts: [{ id: 'required-mod', name: 'Cook', kind: 'one', required: true, choices: [{ id: 'well', name: 'Well done', price: 5 }] }],
};
exec('INSERT INTO menus (merchant, name, type, data, updated_ts) VALUES (?, ?, ?, ?, ?)', MERCHANT, 'Audit menu', 'restaurant', JSON.stringify(menu), now);
const token = await employeeToken(SECRET, { memberId: STAFF, staffId: STAFF, merchant: MERCHANT, inTs: now - 3600000 });
const cookie = `${EMPLOYEE_COOKIE}=${token}`;
const accountCookie = sessionCookie(await makeSession(ACCOUNT, SECRET));
async function post(body, asAccount = false) {
  const response = await queue.onRequestPost({ request: new Request('https://kiwi.test/api/order/queue', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: asAccount ? accountCookie : cookie }, body: JSON.stringify({ merchant: MERCHANT, ...body }),
  }), env });
  return { status: response.status, body: await response.json() };
}
async function get(query) {
  const response = await queue.onRequestGet({ request: new Request(`https://kiwi.test/api/order/queue?merchant=${MERCHANT}&${query}`, { headers: { Cookie: cookie } }), env });
  return { status: response.status, body: await response.json() };
}

console.log('\n■ Order audit remediation behavioural checks');
const missing = await priceOrder(env, MERCHANT, [{ id: 'dish', qty: 1 }]);
const valid = await priceOrder(env, MERCHANT, [{ id: 'dish', qty: 1, optionChoices: [{ group: 'required-mod', choiceId: 'well' }] }]);
ok('O01 rejects a missing required modifier', missing.invalidOptions.includes('Dish'));
ok('O01 prices an explicitly selected required modifier', valid.invalidOptions.length === 0 && valid.total === 55);

const opened = await post({ openTable: 'A' });
const sessionA = opened.body.session;
const revisionA = opened.body.revision;
const first = await post({ create: true, mode: 'table', table: 'A', expectedSession: sessionA, expectedRevision: revisionA,
  ref: 'immutable-batch', lines: [{ id: 'coffee', qty: 1, uid: 'line-a' }] });
const retry = await post({ create: true, mode: 'table', table: 'A', expectedSession: sessionA, expectedRevision: revisionA,
  ref: 'immutable-batch', lines: [{ id: 'coffee', qty: 1, uid: 'line-a' }, { id: 'coffee', qty: 1, uid: 'new-line' }] });
ok('O02 duplicate retries return the stored immutable line batch', first.status === 200 && retry.status === 200 && retry.body.replayed
  && retry.body.lines.length === 1 && retry.body.lines[0].uid === 'line-a', JSON.stringify(retry.body));

const closeCurrent = await post({ closeTable: 'A', expectedSession: sessionA, expectedRevision: revisionA });
const reopened = await post({ openTable: 'A' });
const sessionB = reopened.body.session;
const closeOld = await post({ closeTable: 'A', expectedSession: sessionA, expectedRevision: revisionA });
ok('O03 rejects a delayed close without closing the current visit', closeOld.status === 409);
const stillOpen = DB._db.prepare('SELECT status FROM table_sessions WHERE id = ?').get(sessionB);
ok('O03 leaves the current visit open after the stale close', stillOpen && stillOpen.status === 'open');

const reject = await post({ id: first.body.id, status: 'rejected', actorProof: '' }, true);
const voidCount = DB._db.prepare('SELECT COUNT(*) AS n FROM kitchen_voids WHERE merchant = ? AND order_id = ?').get(MERCHANT, first.body.id).n;
ok('O05 rejects a known ticket and writes a kitchen cancellation record', reject.status === 200 && reject.body.kitchenCancellation === true && Number(voidCount) === 1,
  JSON.stringify({ reject, voidCount }));
const queueView = await get('since=0');
ok('O05 exposes the terminal cancellation to polling clients', Array.isArray(queueView.body.cancelledTickets)
  && queueView.body.cancelledTickets.some((ticket) => ticket.id === first.body.id), JSON.stringify(queueView.body));

const dismissed = await post({ action: 'dismiss_expired', id: first.body.id }, true);
ok('O07 dismissal is safe and idempotent after rejection', dismissed.status === 200 && dismissed.body.dismissed === true, JSON.stringify(dismissed));

const printSource = fs.readFileSync(path.join(ROOT, 'assets/kitchen-print-queue.js'), 'utf8');
const memory = new Map();
const printed = [];
const printContext = {
  console, Promise, Date, JSON, Math, Object, Array, String, Number, Boolean,
  localStorage: { getItem: (k) => memory.get(k) || null, setItem: (k, v) => memory.set(k, String(v)), removeItem: (k) => memory.delete(k) },
  document: { readyState: 'complete', getElementById: () => null, addEventListener() {} },
  CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init && init.detail; } },
  setInterval: () => 1, clearInterval() {}, setTimeout, clearTimeout,
  addEventListener() {}, dispatchEvent() {},
  KiwiKitchenRelay: { merchant: () => MERCHANT },
  KiwiPrinter: { isConnected: () => true, printKitchen: (payload) => { printed.push(payload); return Promise.resolve({ ok: true }); }, printReceipt: () => Promise.resolve({ ok: true }) },
};
printContext.window = printContext;
vm.runInNewContext(printSource, printContext, { filename: 'assets/kitchen-print-queue.js' });
const noHub = printContext.KiwiKitchenPrint.enqueue([{ id: 'remote-1', createdAt: Date.now(), payload: { items: [] } }], { remote: 'connected' });
printContext.KiwiKitchenPrint.setHub(true);
const hub = printContext.KiwiKitchenPrint.enqueue([{ id: 'remote-1', createdAt: Date.now(), payload: { items: [] } }], { remote: 'connected' });
ok('O06 connected-printer jobs still require the exclusive print hub', noHub.skipped === 'not-print-hub' && hub.accepted === 1);

const serveur = fs.readFileSync(path.join(ROOT, 'kiwi-serveur.html'), 'utf8');
ok('O02 persists immutable pending batches and acknowledges by uid', serveur.includes('kiwi:service-pending-v1:')
  && serveur.includes('pending.lines') && serveur.includes('line.uid') && serveur.includes('svForgetPending'));

console.log(failures ? `\n✗ ${failures} failure(s)` : '\n✓ Order audit remediation checks green.');
process.exitCode = failures ? 1 : 0;
