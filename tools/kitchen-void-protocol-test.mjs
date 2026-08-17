#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · BEHAVIOURAL TEST: Kitchen Two-Tier Void Protocol & Waste Tracking
 * ═══════════════════════════════════════════════════════════════════════════ */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

import { employeeToken, EMPLOYEE_COOKIE } from '../functions/auth/_lib.js';
import * as queue from '../functions/api/order/queue.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const AUTH_SECRET = 'test-secret-kitchen-void-protocol';
const MERCHANT = 'resto-void-test';
const STAFF_ID = 'mem-hamza';

let failures = 0;
function check(label, condition, detail) {
  if (condition) { console.log(`  ✓ ${label}`); return; }
  failures++;
  console.log(`  ✗ ${label}${detail ? `\n      ${detail}` : ''}`);
}

function makeDB() {
  const db = new DatabaseSync(':memory:');
  const raw = fs.readFileSync(path.join(ROOT, 'schema.sql'), 'utf8');
  for (const stmt of raw.replace(/--[^\n]*/g, '').split(';').map((s) => s.trim()).filter(Boolean)) {
    db.exec(stmt);
  }
  const facade = { _db: db };
  const prepare = (query) => {
    let args = [];
    const st = {
      bind(...a) { args = a.map((v) => (v === undefined ? null : v)); return st; },
      first() { const r = db.prepare(query).get(...args); return r === undefined ? null : r; },
      all() { return { results: db.prepare(query).all(...args) }; },
      run() {
        const r = db.prepare(query).run(...args);
        return { success: true, meta: { changes: r.changes } };
      },
    };
    return st;
  };
  facade.prepare = prepare;
  return facade;
}

const db = makeDB();
const env = { DB: db, AUTH_SECRET };
const exec = (sql, ...args) => db._db.prepare(sql).run(...args);

function doc(feature, data) {
  exec('INSERT OR REPLACE INTO store_docs (merchant, feature, data, rev, updated_ts) VALUES (?, ?, ?, 1, ?)',
    MERCHANT, feature, JSON.stringify(data), Date.now());
}

async function setupFloorAndStaff() {
  exec('INSERT INTO merchant_config (merchant, features, updated_ts) VALUES (?, ?, ?)',
    MERCHANT, JSON.stringify({ orderpro: true }), Date.now());
  const member = {
    id: STAFF_ID, firstName: 'Hamza', lastName: 'Serveur', email: 'hamza@example.com',
    pinCode: '5678', function: 'Serveur', department: 'Salle', venueSlug: MERCHANT,
  };
  doc('employee-access', { members: [member] });
  doc('attendance', {
    entries: [{
      id: 'att-1', memberId: STAFF_ID, staffId: STAFF_ID, name: 'Hamza Serveur',
      inTs: Date.now() - 3600000, outTs: null, pauseTs: null,
    }],
  });
  doc('floorplan', {
    staff: [{ id: STAFF_ID, name: 'Hamza Serveur' }],
    tables: [
      { id: 'T1', num: '1', covers: 4, servers: [STAFF_ID] },
      { id: 'T2', num: '2', covers: 2, servers: [STAFF_ID] },
    ],
  });
}

async function postQueue(body, cookieHeader) {
  const req = new Request('https://kiwi-os.com/api/order/queue', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(cookieHeader ? { Cookie: cookieHeader } : {}),
    },
    body: JSON.stringify(body),
  });
  const res = await queue.onRequestPost({ request: req, env });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

console.log('\n■ Kitchen Void Protocol Behavioural Tests (tools/kitchen-void-protocol-test.mjs)');

await setupFloorAndStaff();

const validToken = await employeeToken(
  AUTH_SECRET,
  { memberId: STAFF_ID, staffId: STAFF_ID, merchant: MERCHANT, inTs: Date.now() - 3600000 }
);
const employeeCookie = `${EMPLOYEE_COOKIE}=${validToken}`;

const now = Date.now();
exec(`INSERT INTO table_sessions (id, merchant, table_no, mode, status, opened_ts, seen_ts)
      VALUES ('ses-v1', ?, '1', 'table', 'open', ?, ?)`, MERCHANT, now - 5000, now - 5000);

const testLines = [
  { id: 'item-burger', name: 'Cheeseburger', qty: 2, unitPrice: 70, stationAccepted: false },
  { id: 'item-pizza', name: 'Pizza Royale', qty: 1, unitPrice: 90, stationAccepted: true },
];

exec(`INSERT INTO orders (id, merchant, number, mode, table_no, total, lines, status, session_id, created_ts, updated_ts)
      VALUES ('ord-v1', ?, 201, 'table', '1', 230, ?, 'accepted', 'ses-v1', ?, ?)`,
      MERCHANT, JSON.stringify(testLines), now - 5000, now - 5000);

// 1. Tier 1: Void unstarted line (Cheeseburger)
const tier1Res = await postQueue({
  merchant: MERCHANT,
  voidLine: {
    orderId: 'ord-v1',
    table: '1',
    itemId: 'item-burger',
    qty: 1,
    reason: 'client_change',
    isWaste: 0,
    actor: 'Hamza',
  },
}, employeeCookie);

check('Tier 1 void succeeds with 200', tier1Res.status === 200 && tier1Res.data.ok === true && tier1Res.data.tier === 1);

const orderAfterTier1 = db._db.prepare('SELECT total, lines FROM orders WHERE id = ?').get('ord-v1');
const linesAfterTier1 = JSON.parse(orderAfterTier1.lines);
check('Cheeseburger quantity decremented to 1', linesAfterTier1.find(l => l.id === 'item-burger')?.qty === 1);
check('Order total recalculated (230 - 70 = 160)', orderAfterTier1.total === 160);

const voidAudit1 = db._db.prepare("SELECT reason, is_waste, status FROM kitchen_voids WHERE order_id = ? AND item_id = ?").get('ord-v1', 'item-burger');
check('kitchen_voids row created with status approved', voidAudit1 && voidAudit1.reason === 'client_change' && voidAudit1.is_waste === 0 && voidAudit1.status === 'approved');

// 2. Tier 2: Void cooking line (Pizza Royale)
const tier2Res = await postQueue({
  merchant: MERCHANT,
  voidLine: {
    orderId: 'ord-v1',
    table: '1',
    itemId: 'item-pizza',
    qty: 1,
    reason: 'kitchen_waste',
    isWaste: 1,
    actor: 'Hamza',
  },
}, employeeCookie);

check('Tier 2 void returns alert_dispatched (200)', tier2Res.status === 200 && tier2Res.data.ok === true && tier2Res.data.tier === 2);

const orderAfterTier2 = db._db.prepare('SELECT lines FROM orders WHERE id = ?').get('ord-v1');
const linesAfterTier2 = JSON.parse(orderAfterTier2.lines);
const pizzaLine = linesAfterTier2.find(l => l.id === 'item-pizza');
check('Pizza line has voidAlert attached', pizzaLine && pizzaLine.voidAlert && pizzaLine.voidAlert.reason === 'kitchen_waste');

const voidAudit2 = db._db.prepare("SELECT status, is_waste FROM kitchen_voids WHERE order_id = ? AND item_id = ?").get('ord-v1', 'item-pizza');
check('kitchen_voids row created with status pending', voidAudit2 && voidAudit2.status === 'pending' && voidAudit2.is_waste === 1);

// 3. Chef Acknowledges Void: Accept
const ackAcceptRes = await postQueue({
  merchant: MERCHANT,
  ackVoid: {
    orderId: 'ord-v1',
    action: 'accept',
    isWaste: 1,
  },
}, employeeCookie);

check('Chef ack accept succeeds with 200', ackAcceptRes.status === 200 && ackAcceptRes.data.ok === true && ackAcceptRes.data.action === 'accepted');

const orderAfterAckAccept = db._db.prepare('SELECT total, lines FROM orders WHERE id = ?').get('ord-v1');
const linesAfterAckAccept = JSON.parse(orderAfterAckAccept.lines);
check('Pizza line removed from cooking ticket', !linesAfterAckAccept.some(l => l.id === 'item-pizza'));
check('Total updated to 70', orderAfterAckAccept.total === 70);

const voidAuditAfterAccept = db._db.prepare("SELECT status FROM kitchen_voids WHERE order_id = ? AND item_id = ?").get('ord-v1', 'item-pizza');
check('kitchen_voids status updated to approved', voidAuditAfterAccept && voidAuditAfterAccept.status === 'approved');

// 4. Chef Acknowledges Void: Reject (Already plated)
// Create another cooking order for reject testing
const rejectLines = [{ id: 'item-steak', name: 'Steak Grillé', qty: 1, unitPrice: 120, stationAccepted: true }];
exec(`INSERT INTO orders (id, merchant, number, mode, table_no, total, lines, status, session_id, created_ts, updated_ts)
      VALUES ('ord-v2', ?, 202, 'table', '1', 120, ?, 'accepted', 'ses-v1', ?, ?)`,
      MERCHANT, JSON.stringify(rejectLines), now, now);

await postQueue({
  merchant: MERCHANT,
  voidLine: { orderId: 'ord-v2', table: '1', itemId: 'item-steak', qty: 1, reason: 'order_error', actor: 'Hamza' },
}, employeeCookie);

const ackRejectRes = await postQueue({
  merchant: MERCHANT,
  ackVoid: { orderId: 'ord-v2', action: 'reject' },
}, employeeCookie);

check('Chef ack reject succeeds with 200', ackRejectRes.status === 200 && ackRejectRes.data.ok === true && ackRejectRes.data.action === 'rejected');

const orderAfterAckReject = db._db.prepare('SELECT lines FROM orders WHERE id = ?').get('ord-v2');
const linesAfterAckReject = JSON.parse(orderAfterAckReject.lines);
check('Steak line retained with note marked [DÉJÀ PRÊT]', linesAfterAckReject[0].note.includes('[DÉJÀ PRÊT]') && !linesAfterAckReject[0].voidAlert);

const voidAuditAfterReject = db._db.prepare("SELECT status FROM kitchen_voids WHERE order_id = ? AND item_id = ?").get('ord-v2', 'item-steak');
check('kitchen_voids status updated to rejected', voidAuditAfterReject && voidAuditAfterReject.status === 'rejected');

console.log(failures ? `\n✗ ${failures} failure(s)\n` : `\n✓ All kitchen void protocol behavioural checks green.\n`);
process.exitCode = failures ? 1 : 0;
