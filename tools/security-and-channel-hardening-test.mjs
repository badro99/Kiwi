#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · BEHAVIOURAL TEST: Soft-Lock Scoping, Channel Visuals & Client Search
 * ═══════════════════════════════════════════════════════════════════════════ */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

import { employeeToken, EMPLOYEE_COOKIE } from '../functions/auth/_lib.js';
import * as events from '../functions/api/service/events.js';
import * as channelOrder from '../functions/api/channel/order.js';
import * as shopifyLink from '../functions/api/channel/shopify/[link].js';
import * as employeeClients from '../functions/api/employee-clients.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const AUTH_SECRET = 'hardening-test-secret';
const MERCHANT = 'resto-hardening';
const STAFF_ID_1 = 'mem-server-1';
const STAFF_ID_2 = 'mem-server-2';

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

console.log('\n■ Security & Channel Hardening Tests (tools/security-and-channel-hardening-test.mjs)');

// 1. Setup staff & floorplan
doc('employee-access', {
  members: [
    { id: STAFF_ID_1, firstName: 'Yassine', lastName: 'Serveur', venueSlug: MERCHANT, function: 'Serveur' },
    { id: STAFF_ID_2, firstName: 'Nabil', lastName: 'Serveur', venueSlug: MERCHANT, function: 'Serveur' },
  ],
});
doc('attendance', {
  entries: [
    { id: 'att-1', memberId: STAFF_ID_1, staffId: STAFF_ID_1, inTs: Date.now() - 3600000, outTs: null, pauseTs: null },
    { id: 'att-2', memberId: STAFF_ID_2, staffId: STAFF_ID_2, inTs: Date.now() - 3600000, outTs: null, pauseTs: null },
  ],
});
doc('floorplan', {
  staff: [{ id: STAFF_ID_1, name: 'Yassine' }, { id: STAFF_ID_2, name: 'Nabil' }],
  tables: [
    { id: 'T1', num: '1', covers: 2, servers: [STAFF_ID_1] },
    { id: 'T2', num: '2', covers: 4, servers: [STAFF_ID_2] },
  ],
});

const token1 = await employeeToken(AUTH_SECRET, { memberId: STAFF_ID_1, staffId: STAFF_ID_1, merchant: MERCHANT });
const cookie1 = `${EMPLOYEE_COOKIE}=${token1}`;
const token2 = await employeeToken(AUTH_SECRET, { memberId: STAFF_ID_2, staffId: STAFF_ID_2, merchant: MERCHANT });
const cookie2 = `${EMPLOYEE_COOKIE}=${token2}`;

// 1a. Table Lock: Table outside floor plan -> 403 floor-table-required
const lockOutReq = new Request('https://kiwi-os.com/api/service/events', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Cookie: cookie1 },
  body: JSON.stringify({ merchant: MERCHANT, lock: { table: '99', action: 'acquire' } }),
});
const lockOutRes = await events.onRequestPost({ request: lockOutReq, env });
const lockOutData = await lockOutRes.json();
check('Table lock on table 99 outside floor plan returns 403', lockOutRes.status === 403 && lockOutData.error === 'floor-table-required');

// 1b. Table Lock: Acquire on valid Table 1 -> 200 OK
const lockValidReq = new Request('https://kiwi-os.com/api/service/events', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Cookie: cookie1 },
  body: JSON.stringify({ merchant: MERCHANT, lock: { table: '1', action: 'acquire' } }),
});
const lockValidRes = await events.onRequestPost({ request: lockValidReq, env });
const lockValidData = await lockValidRes.json();
check('Table lock acquire on Table 1 returns 200 OK', lockValidRes.status === 200 && lockValidData.ok === true);

// 1c. Table Lock: Server 2 attempts to release Server 1's active lock -> Lock retained
const releaseOtherReq = new Request('https://kiwi-os.com/api/service/events', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Cookie: cookie2 },
  body: JSON.stringify({ merchant: MERCHANT, lock: { table: '1', action: 'release' } }),
});
await events.onRequestPost({ request: releaseOtherReq, env });
const docAfterReleaseAttempt = JSON.parse(db._db.prepare("SELECT data FROM store_docs WHERE merchant = ? AND feature = 'service-events'").get(MERCHANT).data);
check('Server 2 cannot release Server 1 active lock', docAfterReleaseAttempt.locks && docAfterReleaseAttempt.locks['1'] && docAfterReleaseAttempt.locks['1'].actorId === STAFF_ID_1);

// 1d. Table Lock: Server 1 on pause -> 403 employee-on-pause
doc('attendance', {
  entries: [
    { id: 'att-1', memberId: STAFF_ID_1, staffId: STAFF_ID_1, inTs: Date.now() - 3600000, outTs: null, pauseTs: Date.now() - 60000 },
  ],
});
const lockPausedReq = new Request('https://kiwi-os.com/api/service/events', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Cookie: cookie1 },
  body: JSON.stringify({ merchant: MERCHANT, lock: { table: '1', action: 'acquire' } }),
});
const lockPausedRes = await events.onRequestPost({ request: lockPausedReq, env });
const lockPausedData = await lockPausedRes.json();
check('Table lock by paused employee returns 403 employee-on-pause', lockPausedRes.status === 403 && lockPausedData.error === 'employee-on-pause');

// Restore unpaused attendance
doc('attendance', {
  entries: [
    { id: 'att-1', memberId: STAFF_ID_1, staffId: STAFF_ID_1, inTs: Date.now() - 3600000, outTs: null, pauseTs: null },
  ],
});

// 2. Channel Order Visuals Preservation
const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('secret-channel-key-123456'));
const hexHash = [...new Uint8Array(hash)].map(b => b.toString(16).padStart(2, '0')).join('');
exec(`INSERT INTO channel_links (id, merchant, channel, label, hash, status, created_ts)
      VALUES ('chl-test-1', ?, 'glovo', 'Glovo Test', ?, 'active', ?)`, MERCHANT, hexHash, Date.now());

const channelOrderReq = new Request('https://kiwi-os.com/api/channel/order', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer kwc.chl-test-1.secret-channel-key-123456',
  },
  body: JSON.stringify({
    ref: 'GLV-101',
    total: 120,
    lines: [
      {
        id: 'it-burger',
        name: 'Burger Atlas',
        qty: 1,
        unitPrice: 120,
        options: 'Sauce: Algérienne',
        visuals: [
          { emoji: '🌶️', name: 'Très piquant' },
          { emoji: '', name: 'Sans oignon' },
        ],
      },
    ],
  }),
});

const channelOrderRes = await channelOrder.onRequestPost({ request: channelOrderReq, env });
const channelOrderData = await channelOrderRes.json();
check('Channel order succeeds (200 OK)', channelOrderRes.status === 200 && channelOrderData.ok === true);

const orderRow = db._db.prepare('SELECT lines FROM orders WHERE id = ?').get(channelOrderData.id);
const linesFromOrder = JSON.parse(orderRow.lines);
check('Channel order preserves visual with emoji', linesFromOrder[0].visuals.some(v => v.name === 'Très piquant' && v.emoji === '🌶️'));
check('Channel order preserves text-only visual without emoji', linesFromOrder[0].visuals.some(v => v.name === 'Sans oignon' && v.emoji === ''));

// 3. Employee Clients Search with Wildcards
exec(`INSERT INTO clients (merchant, id, name, phone, points, stamps, visits, spend, consent, consent_email, source, first_seen, last_seen, updated_ts, srv_ts, deleted)
      VALUES (?, 'c-100', '100% Bio Market', '+212600112233', 10, 2, 1, 150, 1, 0, 'caisse', ?, ?, ?, 100, 0)`,
      MERCHANT, Date.now(), Date.now(), Date.now());

const searchWildcardReq = new Request(`https://kiwi-os.com/api/employee-clients?merchant=${MERCHANT}&q=100%25`, {
  method: 'GET',
  headers: { Cookie: cookie1 },
});
const searchRes = await employeeClients.onRequestGet({ request: searchWildcardReq, env });
const searchData = await searchRes.json();
check('Employee client search escapes % and finds exact match', searchRes.status === 200 && searchData.clients.some(c => c.id === 'c-100'));

console.log(failures ? `\n✗ ${failures} failure(s)\n` : `\n✓ All security and channel hardening checks green.\n`);
process.exitCode = failures ? 1 : 0;
