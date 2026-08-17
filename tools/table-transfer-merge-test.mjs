#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · BEHAVIOURAL TEST: Table Transfer & Merge Protocol with Audit Trail
 * ═══════════════════════════════════════════════════════════════════════════ */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

import { employeeToken, EMPLOYEE_COOKIE } from '../functions/auth/_lib.js';
import * as queue from '../functions/api/order/queue.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const AUTH_SECRET = 'test-secret-table-transfer-merge';
const MERCHANT = 'resto-transfer-test';
const STAFF_ID = 'mem-yassine';

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
    id: STAFF_ID, firstName: 'Yassine', lastName: 'Chef', email: 'yassine@example.com',
    pinCode: '1234', function: 'Serveur', department: 'Salle', venueSlug: MERCHANT,
  };
  doc('employee-access', { members: [member] });
  doc('attendance', {
    entries: [{
      id: 'att-1', memberId: STAFF_ID, staffId: STAFF_ID, name: 'Yassine Chef',
      inTs: Date.now() - 3600000, outTs: null, pauseTs: null,
    }],
  });
  doc('floorplan', {
    staff: [{ id: STAFF_ID, name: 'Yassine Chef' }],
    tables: [
      { id: 'T1', num: '1', covers: 4, servers: [STAFF_ID] },
      { id: 'T2', num: '2', covers: 2, servers: [STAFF_ID] },
      { id: 'T3', num: '3', covers: 6, servers: [STAFF_ID] },
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

console.log('\n■ Table Transfer & Merge Behavioural Tests (tools/table-transfer-merge-test.mjs)');

await setupFloorAndStaff();

const validToken = await employeeToken(
  AUTH_SECRET,
  { memberId: STAFF_ID, staffId: STAFF_ID, merchant: MERCHANT, inTs: Date.now() - 3600000 }
);
const employeeCookie = `${EMPLOYEE_COOKIE}=${validToken}`;

// Seed an open table session and order on Table 1
const now = Date.now();
exec(`INSERT INTO table_sessions (id, merchant, table_no, mode, status, opened_ts, seen_ts)
      VALUES ('ses-t1', ?, '1', 'table', 'open', ?, ?)`, MERCHANT, now - 1000, now - 1000);
exec(`INSERT INTO orders (id, merchant, number, mode, table_no, total, lines, status, session_id, created_ts, updated_ts)
      VALUES ('ord-1', ?, 101, 'table', '1', 120, '[]', 'accepted', 'ses-t1', ?, ?)`, MERCHANT, now - 1000, now - 1000);

// 1. Employee Transfer Table T1 -> T2
const transferRes = await postQueue({
  merchant: MERCHANT,
  transferTable: { from: '1', to: '2', covers: 4, server: 'Yassine' },
}, employeeCookie);

check('transferTable succeeds with 200 for waiter employee', transferRes.status === 200 && transferRes.data.ok === true);

const updatedOrder = db._db.prepare('SELECT table_no, session_id FROM orders WHERE id = ?').get('ord-1');
check('orders.table_no updated to target table', updatedOrder && updatedOrder.table_no === '2');

const transferredSession = db._db.prepare('SELECT table_no, status FROM table_sessions WHERE id = ?').get('ses-t1');
check('session table_no updated to target table and remains open', transferredSession && transferredSession.table_no === '2' && transferredSession.status === 'open');

const auditTransfer = db._db.prepare('SELECT from_table, to_table, is_merge FROM table_transfers WHERE merchant = ? ORDER BY created_ts DESC LIMIT 1').get(MERCHANT);
check('audit row inserted in table_transfers', auditTransfer && auditTransfer.from_table === '1' && auditTransfer.to_table === '2' && auditTransfer.is_merge === 0);

// 2. Transfer to unknown table outside floorplan -> 403
const invalidTransferRes = await postQueue({
  merchant: MERCHANT,
  transferTable: { from: '2', to: '99', covers: 4 },
}, employeeCookie);
check('transferTable to unknown table returns 403', invalidTransferRes.status === 403 && invalidTransferRes.data.error === 'floor-table-required');

// 3. Merge Tables T2 into T3
exec(`INSERT INTO table_sessions (id, merchant, table_no, mode, status, opened_ts, seen_ts)
      VALUES ('ses-t3', ?, '3', 'table', 'open', ?, ?)`, MERCHANT, now, now);
exec(`INSERT INTO orders (id, merchant, number, mode, table_no, total, lines, status, session_id, created_ts, updated_ts)
      VALUES ('ord-2', ?, 102, 'table', '3', 80, '[]', 'accepted', 'ses-t3', ?, ?)`, MERCHANT, now, now);

const mergeRes = await postQueue({
  merchant: MERCHANT,
  mergeTables: { source: '2', target: '3', server: 'Yassine' },
}, employeeCookie);

check('mergeTables succeeds with 200 for waiter employee', mergeRes.status === 200 && mergeRes.data.ok === true);

const mergedOrd1 = db._db.prepare('SELECT table_no, session_id FROM orders WHERE id = ?').get('ord-1');
const mergedOrd2 = db._db.prepare('SELECT table_no, session_id FROM orders WHERE id = ?').get('ord-2');
check('both orders now attached to table 3 under target session', mergedOrd1.table_no === '3' && mergedOrd2.table_no === '3' && mergedOrd1.session_id === mergedOrd2.session_id);

const auditMerge = db._db.prepare('SELECT from_table, to_table, is_merge FROM table_transfers WHERE is_merge = 1 LIMIT 1').get();
check('audit row inserted in table_transfers with is_merge = 1', auditMerge && auditMerge.from_table === '2' && auditMerge.to_table === '3');

console.log(failures ? `\n✗ ${failures} failure(s)\n` : `\n✓ All table transfer & merge behavioural checks green.\n`);
process.exitCode = failures ? 1 : 0;
