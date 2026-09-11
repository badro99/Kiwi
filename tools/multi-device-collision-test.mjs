#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · BEHAVIOURAL TEST: Multi-Device Collision Prevention & Soft-Locks
 * ═══════════════════════════════════════════════════════════════════════════ */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

import { employeeToken, EMPLOYEE_COOKIE, tillToken, TILL_COOKIE } from '../functions/auth/_lib.js';
import * as events from '../functions/api/service/events.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const AUTH_SECRET = 'test-secret-collision-locks';
const MERCHANT = 'resto-collision-test';
const STAFF_ID_1 = 'mem-yassine';
const STAFF_ID_2 = 'mem-hamza';

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
  const member1 = {
    id: STAFF_ID_1, firstName: 'Yassine', lastName: 'Chef', email: 'yassine@example.com',
    pinCode: '1234', function: 'Serveur', department: 'Salle', venueSlug: MERCHANT,
  };
  const member2 = {
    id: STAFF_ID_2, firstName: 'Hamza', lastName: 'Serveur', email: 'hamza@example.com',
    pinCode: '5678', function: 'Serveur', department: 'Salle', venueSlug: MERCHANT,
  };
  doc('employee-access', { members: [member1, member2] });
  doc('attendance', {
    entries: [
      { id: 'att-1', memberId: STAFF_ID_1, staffId: STAFF_ID_1, name: 'Yassine Chef', inTs: Date.now() - 3600000, outTs: null, pauseTs: null },
      { id: 'att-2', memberId: STAFF_ID_2, staffId: STAFF_ID_2, name: 'Hamza Serveur', inTs: Date.now() - 3600000, outTs: null, pauseTs: null },
    ],
  });
  doc('floorplan', {
    staff: [{ id: STAFF_ID_1, name: 'Yassine Chef' }, { id: STAFF_ID_2, name: 'Hamza Serveur' }],
    tables: [
      { id: 'T1', num: '1', covers: 4, servers: [STAFF_ID_1] },
      { id: 'T2', num: '2', covers: 2, servers: [STAFF_ID_2] },
    ],
  });
}

async function postEvents(body, cookieHeader) {
  const req = new Request('https://kiwi-os.com/api/service/events', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(cookieHeader ? { Cookie: cookieHeader } : {}),
    },
    body: JSON.stringify(body),
  });
  const res = await events.onRequestPost({ request: req, env });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

async function getEvents(urlParams, cookieHeader) {
  const req = new Request(`https://kiwi-os.com/api/service/events?${urlParams}`, {
    method: 'GET',
    headers: cookieHeader ? { Cookie: cookieHeader } : {},
  });
  const res = await events.onRequestGet({ request: req, env });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

console.log('\n■ Multi-Device Collision & Soft-Locks Behavioural Tests (tools/multi-device-collision-test.mjs)');

await setupFloorAndStaff();

const tokenYassine = await employeeToken(AUTH_SECRET, { memberId: STAFF_ID_1, staffId: STAFF_ID_1, merchant: MERCHANT });
const cookieYassine = `${EMPLOYEE_COOKIE}=${tokenYassine}`;

const tokenHamza = await employeeToken(AUTH_SECRET, { memberId: STAFF_ID_2, staffId: STAFF_ID_2, merchant: MERCHANT });
const cookieHamza = `${EMPLOYEE_COOKIE}=${tokenHamza}`;

// 1. Yassine acquires lock on Table 1
const lockRes = await postEvents({
  merchant: MERCHANT,
  lock: { table: '1', action: 'acquire', actor: 'Yassine Chef' },
}, cookieYassine);

check('Yassine acquires soft-lock on Table 1 (200)', lockRes.status === 200 && lockRes.data.ok === true);
check('Lock response contains table and actor', lockRes.data.lock && lockRes.data.lock.table === '1' && lockRes.data.lock.actor === 'Yassine Chef');

// 2. Hamza reads service events and detects Yassine is editing Table 1
const getRes1 = await getEvents(`merchant=${MERCHANT}`, cookieHamza);
check('GET /api/service/events returns active locks map', getRes1.status === 200 && getRes1.data.ok === true && !!getRes1.data.locks);
check('Table 1 lock visible to Hamza with Yassine as actor', getRes1.data.locks['1'] && getRes1.data.locks['1'].actor === 'Yassine Chef');

// 3. Yassine releases lock on Table 1
const releaseRes = await postEvents({
  merchant: MERCHANT,
  lock: { table: '1', action: 'release', actor: 'Yassine Chef' },
}, cookieYassine);

check('Yassine releases lock on Table 1 (200)', releaseRes.status === 200 && releaseRes.data.ok === true);

const getRes2 = await getEvents(`merchant=${MERCHANT}`, cookieHamza);
check('Table 1 lock removed after release', !getRes2.data.locks['1']);

// 4. Stale lock auto-expiry (> 60 seconds)
const staleLockDoc = {
  locks: {
    '2': { table: '2', actor: 'Hamza Serveur', actorId: STAFF_ID_2, ts: Date.now() - 65000 },
  },
};
doc('service-events', staleLockDoc);

const getResStale = await getEvents(`merchant=${MERCHANT}`, cookieYassine);
check('Stale lock (>60s) automatically purged on GET', !getResStale.data.locks['2']);

// 5. Caisse role reads locks
const tokenCaisse = await tillToken(AUTH_SECRET, MERCHANT);
const cookieCaisse = `${TILL_COOKIE}=${tokenCaisse}`;
const getResCaisse = await getEvents(`merchant=${MERCHANT}&role=caisse`, cookieCaisse);
check('Caisse role receives active locks', getResCaisse.status === 200 && typeof getResCaisse.data.locks === 'object');

console.log(failures ? `\n✗ ${failures} failure(s)\n` : `\n✓ All multi-device collision behavioural checks green.\n`);
process.exitCode = failures ? 1 : 0;
