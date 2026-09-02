#!/usr/bin/env node
/* Kiwi · hotel monthly internal review — server contract, executed for real.
 *
 * Real node:sqlite (constraints, triggers, races), real declarations.js
 * handlers, real auth (_lib sessions, till HMAC, employee + operator cookies,
 * guarded verifyStaffPin). Nothing here tests a mock: the Statement shim only
 * adapts the D1 prepare/bind/first/run/all surface onto DatabaseSync.
 *
 * What this pins (Sprint 3 corrections):
 *  - source of truth is the append-only hotel_stay_events ledger, never the
 *    capped store_docs cache (cap-independence incl. > 4 000 bookings);
 *  - a ledger stay the cache lost BLOCKS the review (stay-detail-unavailable);
 *  - anonymous callers cannot claim a merchant with a bare PIN (401);
 *  - PINs only work through verifyStaffPin for authenticated callers, with a
 *    direction-role check (till+serveur → 403, till+manager → 200);
 *  - GET and POST are manager-gated and hotel-only (409 hotel-units-required);
 *  - every finalize/rectify requires an idempotency key; races replay or 409;
 *  - no STDN/official claims, no PII in snapshots or exception payloads.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import {
  makeSession, sessionCookie, tillToken, tillCookie,
  employeeToken, employeeCookie, operatorToken, operatorIdToken,
  OP_COOKIE, OPID_COOKIE,
} from '../functions/auth/_lib.js';
import { onRequestGet, onRequestPost, canonicalJson, sha256Hex } from '../functions/api/hotel/declarations.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sql = new DatabaseSync(':memory:');
sql.exec(fs.readFileSync(path.join(root, 'schema.sql'), 'utf8'));
const DECL_MIGRATION = fs.readFileSync(path.join(root, 'migrations/2026-09-03-hotel-declarations.sql'), 'utf8');
const EVENTS_MIGRATION = fs.readFileSync(path.join(root, 'migrations/2026-09-02-hotel-stay-events.sql'), 'utf8');
sql.exec(DECL_MIGRATION);
sql.exec(EVENTS_MIGRATION);

let controls = 0;
function ok(value, label) { assert.ok(value, label); controls++; }

const now = Date.now(), secret = 'hotel-decl-test-secret-0123456789';
const casaToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Casablanca', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const isoDay = (d) => d.toISOString().slice(0, 10);
const addDays = (ymd, n) => { const d = new Date(ymd + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return isoDay(d); };
const monthOf = (ymd) => ymd.slice(0, 7);
const prevMonthOf = (ymd) => { const [y, m] = ymd.split('-').map(Number); return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`; };
const TODAY = casaToday();
const CUR_MONTH = monthOf(TODAY);
const PREV_MONTH = prevMonthOf(monthOf(TODAY) + '-01');

/* ── seed identity ─────────────────────────────────────────────────────── */
sql.prepare('INSERT INTO accounts (id,email,name,business,salt,hash,created_ts) VALUES (?,?,?,?,?,?,?)')
  .run('acc-hotel', 'owner@test.ma', 'Directeur Riad', 'Riad Test', 's', 'h', now);
sql.prepare('INSERT INTO accounts (id,email,name,business,salt,hash,created_ts) VALUES (?,?,?,?,?,?,?)')
  .run('acc-other', 'other@test.ma', 'Other Owner', 'Other Shop', 's', 'h', now);
sql.prepare('INSERT INTO merchant_config (merchant,features,type,account_id,name,status,updated_ts) VALUES (?,?,?,?,?,?,?)')
  .run('riad-test', '{}', 'hotel', 'acc-hotel', 'Riad Test', 'active', now);
sql.prepare('INSERT INTO merchant_config (merchant,features,type,account_id,name,status,updated_ts) VALUES (?,?,?,?,?,?,?)')
  .run('riad-bulk', '{}', 'hotel', 'acc-hotel', 'Riad Bulk', 'active', now);
sql.prepare('INSERT INTO merchant_config (merchant,features,type,account_id,name,status,updated_ts) VALUES (?,?,?,?,?,?,?)')
  .run('other-shop', '{}', 'boutique', 'acc-other', 'Other Shop', 'active', now);
for (const merchant of ['riad-test', 'riad-bulk']) {
  sql.prepare("INSERT INTO store_docs (merchant, feature, data, rev, updated_ts) VALUES (?, 'hotel-units', ?, 1, ?)")
    .run(merchant, JSON.stringify({ units: [
      { id: 'u-econ', locationId: 'loc-econ', kind: 'economat', active: true },
      { id: 'u-bar', locationId: 'loc-bar', kind: 'outlet', active: true },
    ] }), now);
}
sql.prepare('INSERT INTO staff_pins (id, merchant, pin, name, role, created_ts) VALUES (?,?,?,?,?,?)')
  .run('pin-serveur', 'riad-test', '1111', 'Sam Serveur', 'serveur', now);
sql.prepare('INSERT INTO staff_pins (id, merchant, pin, name, role, created_ts) VALUES (?,?,?,?,?,?)')
  .run('pin-manager', 'riad-test', '9999', 'Directrice Adjointe', 'manager', now);
sql.prepare("INSERT INTO store_docs (merchant, feature, data, rev, updated_ts) VALUES ('riad-test', 'team', ?, 1, ?)")
  .run(JSON.stringify({ members: [{ id: 'emp-serveur', firstName: 'Sam', role: 'serveur' }] }), now);
sql.prepare('INSERT INTO operators (id, label, salt, hash, created_ts) VALUES (?,?,?,?,?)')
  .run('op-test', 'Audit Test', 's', 'h', now);

/* ── event + doc builders ──────────────────────────────────────────────── */
function seg(id, nat, from, to) {
  return { guestId: id, nationalityCountry: nat, usualResidenceCountry: nat, ageCategory: 'adult', fromDate: from, toDate: to };
}
function guest(name, nat, docNum) {
  return { id: 'gst-' + name.replace(/[^A-Za-z0-9]/g, '').slice(0, 12), name, sex: nat ? 'F' : '', nationality: nat, birthDate: '', residenceCountry: nat ? nat : '', idDocType: docNum ? 'passeport' : '', idDocNumber: docNum || '' };
}
const eventInserts = [];
let maxEventCursor = 0;
function planEvent(merchant, stayId, type, payload, cursor, ordinal = 0) {
  eventInserts.push({ merchant, stayId, type, payload, cursor, ordinal });
  if (merchant === 'riad-test' && cursor > maxEventCursor) maxEventCursor = cursor;
}
function payloadFor(stayId, { status, checkIn, checkOut, roomId, segments, roomSegments, source = 'staff', roomTypeId = 'type-atlas' }) {
  return {
    v: 1, stayId, status, source, roomTypeId, roomId, checkIn, checkOut,
    guestSegments: segments || [],
    roomSegments: roomSegments || [{ roomId, fromDate: checkIn, toDate: checkOut }],
  };
}
function bookingFor(id, code, { status, checkIn, checkOut, roomId, partySize, guests }) {
  return {
    id, code, customer: { name: 'Client ' + code }, serviceId: 'type-atlas', resourceId: roomId,
    partySize, status, source: 'staff', hotel: { checkIn, checkOut }, guests,
  };
}

const HAPPY = '2025-06';
const happyBookings = [
  bookingFor('bk-a', 'H-AAA', { status: 'completed', checkIn: `${HAPPY}-05`, checkOut: `${HAPPY}-08`, roomId: 'room:R1', partySize: 2, guests: [guest('Canary Testname', 'FR', 'CANARY-DOC-007'), guest('Karim Bennani', 'MA', 'EE654321')] }),
  bookingFor('bk-b', 'H-BBB', { status: 'completed', checkIn: `${HAPPY}-07`, checkOut: `${HAPPY}-09`, roomId: 'room:R2', partySize: 1, guests: [guest('Lea Martin', 'FR', 'FR987654')] }),
  bookingFor('bk-e', 'H-EEE', { status: 'requested', checkIn: `${HAPPY}-10`, checkOut: `${HAPPY}-12`, roomId: 'room:R3', partySize: 1, guests: [] }),
  bookingFor('bk-c', 'H-CCC', { status: 'cancelled', checkIn: `${HAPPY}-06`, checkOut: `${HAPPY}-08`, roomId: 'room:R9', partySize: 2, guests: [guest('Ghost One', 'FR', 'GHOST1'), guest('Ghost Two', 'FR', 'GHOST2')] }),
  bookingFor('bk-d', 'H-DDD', { status: 'no_show', checkIn: `${HAPPY}-11`, checkOut: `${HAPPY}-13`, roomId: 'room:R9', partySize: 1, guests: [guest('Ghost Three', 'FR', 'GHOST3')] }),
  // Operational cache carries a legacy row the ledger never saw: aggregates must ignore it.
  bookingFor('bk-legacy', 'H-LEG', { status: 'completed', checkIn: `${HAPPY}-02`, checkOut: `${HAPPY}-03`, roomId: 'room:R0', partySize: 9, guests: [] }),
];
planEvent('riad-test', 'bk-a', 'status_completed', payloadFor('bk-a', { status: 'completed', checkIn: `${HAPPY}-05`, checkOut: `${HAPPY}-08`, roomId: 'room:R1', segments: [seg('gst-a1', 'FR', `${HAPPY}-05`, `${HAPPY}-08`), seg('gst-a2', 'MA', `${HAPPY}-05`, `${HAPPY}-08`)] }), 101);
planEvent('riad-test', 'bk-b', 'status_completed', payloadFor('bk-b', { status: 'completed', checkIn: `${HAPPY}-07`, checkOut: `${HAPPY}-09`, roomId: 'room:R2', segments: [seg('gst-b1', 'FR', `${HAPPY}-07`, `${HAPPY}-09`)] }), 102);
planEvent('riad-test', 'bk-e', 'created', payloadFor('bk-e', { status: 'requested', checkIn: `${HAPPY}-10`, checkOut: `${HAPPY}-12`, roomId: 'room:R3', segments: [seg('gst-e1', '', `${HAPPY}-10`, `${HAPPY}-12`)] }), 103);
planEvent('riad-test', 'bk-c', 'cancelled', payloadFor('bk-c', { status: 'cancelled', checkIn: `${HAPPY}-06`, checkOut: `${HAPPY}-08`, roomId: 'room:R9', segments: [seg('gst-c1', 'FR', `${HAPPY}-06`, `${HAPPY}-08`)] }), 104);
planEvent('riad-test', 'bk-d', 'status_no_show', payloadFor('bk-d', { status: 'no_show', checkIn: `${HAPPY}-11`, checkOut: `${HAPPY}-13`, roomId: 'room:R9', segments: [seg('gst-d1', 'FR', `${HAPPY}-11`, `${HAPPY}-13`)] }), 105);

const STALE = PREV_MONTH;
const staleBookings = [
  bookingFor('bk-stale', 'H-STL', { status: 'checked_in', checkIn: `${STALE}-05`, checkOut: `${STALE}-10`, roomId: 'room:R1', partySize: 1, guests: [guest('Stale Guest', 'MA', 'STALEDOC1')] }),
];
planEvent('riad-test', 'bk-stale', 'status_checked_in', payloadFor('bk-stale', { status: 'checked_in', checkIn: `${STALE}-05`, checkOut: `${STALE}-10`, roomId: 'room:R1', segments: [seg('gst-s1', 'MA', `${STALE}-05`, `${STALE}-10`)] }), 201);

const futureBookings = [
  bookingFor('bk-future', 'H-FUT', { status: 'checked_in', checkIn: addDays(TODAY, -2), checkOut: addDays(TODAY, 2), roomId: 'room:R1', partySize: 1, guests: [guest('Future Guest', 'MA', 'FUTUREDOC1')] }),
];
planEvent('riad-test', 'bk-future', 'status_checked_in', payloadFor('bk-future', { status: 'checked_in', checkIn: addDays(TODAY, -2), checkOut: addDays(TODAY, 2), roomId: 'room:R1', segments: [seg('gst-f1', 'MA', addDays(TODAY, -2), addDays(TODAY, 2))] }), 301);

const MANIF = '2025-10';
const manifBookings = [
  bookingFor('bk-nomanifest', 'H-NOM', { status: 'completed', checkIn: `${MANIF}-05`, checkOut: `${MANIF}-08`, roomId: 'room:R1', partySize: 2, guests: [] }),
];
planEvent('riad-test', 'bk-nomanifest', 'status_completed', payloadFor('bk-nomanifest', { status: 'completed', checkIn: `${MANIF}-05`, checkOut: `${MANIF}-08`, roomId: 'room:R1', segments: [] }), 401);

const MANIF2 = '2025-11';
const manif2Bookings = [
  bookingFor('bk-noid', 'H-NOI', { status: 'completed', checkIn: `${MANIF2}-05`, checkOut: `${MANIF2}-08`, roomId: 'room:R1', partySize: 1, guests: [{ id: 'gst-noid', name: 'Canary NoID' }] }),
];
planEvent('riad-test', 'bk-noid', 'status_completed', payloadFor('bk-noid', { status: 'completed', checkIn: `${MANIF2}-05`, checkOut: `${MANIF2}-08`, roomId: 'room:R1', segments: [seg('gst-n1', '', `${MANIF2}-05`, `${MANIF2}-08`)] }), 402);
manif2Bookings[0].guests = [{ id: 'gst-noid', name: 'Canary NoID', idDocNumber: 'CANARY-DOC-008' }];

const GHOST = '2025-02';
planEvent('riad-test', 'bk-ghost', 'status_completed', payloadFor('bk-ghost', { status: 'completed', checkIn: `${GHOST}-05`, checkOut: `${GHOST}-08`, roomId: 'room:R1', segments: [seg('gst-g1', 'FR', `${GHOST}-05`, `${GHOST}-08`)] }), 501);
// NOTE: bk-ghost is deliberately absent from the operational cache (cap eviction).

for (const month of ['2025-08', '2025-09', '2025-04', '2025-12', '2025-07']) {
  const clean = [bookingFor(`bk-${month}`, `H-${month}`, { status: 'completed', checkIn: `${month}-05`, checkOut: `${month}-07`, roomId: 'room:R1', partySize: 1, guests: [guest('Clean Guest', 'FR', 'CLEAN' + month)] })];
  globalThis.__hotelMonthDocs = globalThis.__hotelMonthDocs || {};
  globalThis.__hotelMonthDocs[month] = clean;
  planEvent('riad-test', `bk-${month}`, 'status_completed', payloadFor(`bk-${month}`, { status: 'completed', checkIn: `${month}-05`, checkOut: `${month}-07`, roomId: 'room:R1', segments: [seg(`gst-${month}`, 'FR', `${month}-05`, `${month}-07`)] }), 600 + Number(month.slice(5)));
}
const allBookings = [...happyBookings, ...staleBookings, ...futureBookings, ...manifBookings, ...manif2Bookings];
for (const month of ['2025-08', '2025-09', '2025-04', '2025-12', '2025-07']) allBookings.push(...globalThis.__hotelMonthDocs[month]);
sql.prepare("INSERT INTO store_docs (merchant, feature, data, rev, updated_ts) VALUES ('riad-test', 'reservations', ?, 42, ?)")
  .run(JSON.stringify({ v: 1, bookings: allBookings }), now);

/* Bulk merchant: 4 100 completed one-night stays, events AND cache. */
const BULK = '2025-01';
const bulkBookings = [];
{
  const insertEvent = sql.prepare(
    'INSERT INTO hotel_stay_events (merchant,id,stay_id,event_type,payload_json,occurred_ts,srv_cursor,event_ordinal,actor_id,actor_role) VALUES (?,?,?,?,?,?,?,?,?,?)'
  );
  for (let i = 0; i < 4100; i++) {
    const id = `bk-bulk-${i}`;
    bulkBookings.push(bookingFor(id, `H-B${i}`, { status: 'completed', checkIn: `${BULK}-05`, checkOut: `${BULK}-06`, roomId: `room:bulk-${i}`, partySize: 1, guests: [guest(`Bulk Guest ${i}`, 'FR', `BULKDOC${i}`)] }));
    insertEvent.run('riad-bulk', `hse:${id}:1000:${i}`, id, 'status_completed',
      JSON.stringify(payloadFor(id, { status: 'completed', checkIn: `${BULK}-05`, checkOut: `${BULK}-06`, roomId: `room:bulk-${i}`, segments: [seg(`gst-bulk-${i}`, 'FR', `${BULK}-05`, `${BULK}-06`)] })),
      now, 1000 + i, 0, 'seed', 'owner');
  }
}
sql.prepare("INSERT INTO store_docs (merchant, feature, data, rev, updated_ts) VALUES ('riad-bulk', 'reservations', ?, 7, ?)")
  .run(JSON.stringify({ v: 1, bookings: bulkBookings }), now);

/* Remaining (small) events, inserted in bulk after the big loop. */
{
  const insertEvent = sql.prepare(
    'INSERT INTO hotel_stay_events (merchant,id,stay_id,event_type,payload_json,occurred_ts,srv_cursor,event_ordinal,actor_id,actor_role) VALUES (?,?,?,?,?,?,?,?,?,?)'
  );
  for (const e of eventInserts) {
    insertEvent.run(e.merchant, `hse:${e.stayId}:${e.cursor}:${e.ordinal}`, e.stayId, e.type, JSON.stringify(e.payload), now, e.cursor, e.ordinal, 'seed', 'owner');
  }
}

/* ── D1-shaped shim over real SQLite ─────────────────────────────────────── */
class Statement {
  constructor(text) { this.text = text; this.args = []; }
  bind(...args) { this.args = args; return this; }
  async first() { return sql.prepare(this.text).get(...this.args) || null; }
  async run() {
    const r = sql.prepare(this.text).run(...this.args);
    return { success: true, meta: { changes: Number(r.changes) } };
  }
  async all() { return { results: sql.prepare(this.text).all(...this.args) }; }
}
const DB = { prepare(text) { return new Statement(text); } };
const env = { DB, AUTH_SECRET: secret };

const ownerCookie = sessionCookie(await makeSession('acc-hotel', secret)).split(';')[0];
const otherCookie = sessionCookie(await makeSession('acc-other', secret)).split(';')[0];
const tillCookieValue = tillCookie(await tillToken(secret, 'riad-test', 0)).split(';')[0];
const empCookie = employeeCookie(await employeeToken(secret, { merchant: 'riad-test', staffId: 'emp-serveur' })).split(';')[0];
const opCookies = `${OP_COOKIE}=${await operatorToken(secret)}; ${OPID_COOKIE}=${await operatorIdToken(secret, 'op-test')}`;

async function post(body, cookie = '') {
  const headers = { 'Content-Type': 'application/json' };
  if (cookie) headers.Cookie = cookie;
  const res = await onRequestPost({ env, request: new Request('https://kiwi.test/api/hotel/declarations', { method: 'POST', headers, body: JSON.stringify(body) }) });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}
async function get(query, cookie = '') {
  const headers = {};
  if (cookie) headers.Cookie = cookie;
  const res = await onRequestGet({ env, request: new Request(`https://kiwi.test/api/hotel/declarations${query}`, { headers }) });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}
const declCount = (merchant, month) => sql.prepare(
  'SELECT COUNT(*) AS n FROM hotel_monthly_declarations WHERE merchant = ? AND month = ?'
).get(merchant, month).n;

/* ── A · anonymous callers are rejected before any authority check ───────── */
{
  const r = await post({ merchant: 'riad-test', month: HAPPY, action: 'finalize', idempotencyKey: 'k-anon-001' });
  ok(r.status === 401, 'anonymous POST is 401');
  ok(declCount('riad-test', HAPPY) === 0, 'anonymous POST writes nothing');
  const g = await get(`?merchant=riad-test&month=${HAPPY}`);
  ok(g.status === 401, 'anonymous GET is 401');
}

/* ── B · a bare PIN, with no session or till, resolves and proves nothing ── */
{
  // Regression: the old code claimed the merchant from staff_pins here and
  // sealed the month. tenantFor(strict) now refuses first.
  const r = await post({ merchant: 'riad-test', month: HAPPY, action: 'finalize', pin: '9999', idempotencyKey: 'k-barepin-001' });
  ok(r.status === 401, 'anonymous + manager PIN alone is 401 (PIN is not a bearer token)');
  ok(declCount('riad-test', HAPPY) === 0, 'bare-PIN POST writes nothing');
}

/* ── C · paired till + non-direction PIN is refused ──────────────────────── */
{
  const r = await post({ merchant: 'riad-test', month: HAPPY, action: 'finalize', pin: '1111', idempotencyKey: 'k-cashier-001' }, tillCookieValue);
  ok(r.status === 403, 'till + serveur PIN is 403');
  ok(r.body.error === 'manager-required', 'reports manager-required');
  ok(declCount('riad-test', HAPPY) === 0, 'cashier PIN writes nothing');
}

/* ── F · non-hotel merchants are isolated (before any HAPPY write) ───────── */
{
  const r = await post({ merchant: 'other-shop', month: HAPPY, action: 'finalize', idempotencyKey: 'k-boutique-001' }, otherCookie);
  ok(r.status === 409 && r.body.error === 'hotel-units-required', 'generic store POST is 409 hotel-units-required');
  const g = await get(`?merchant=other-shop&month=${HAPPY}`, otherCookie);
  ok(g.status === 409 && g.body.error === 'hotel-units-required', 'generic store GET is 409 hotel-units-required');
}

/* ── G · cross-tenant writes are refused ─────────────────────────────────── */
{
  const r = await post({ merchant: 'riad-test', month: HAPPY, action: 'finalize', idempotencyKey: 'k-xtenant-001' }, otherCookie);
  ok(r.status === 401, 'other owner closing riad-test is 401');
  ok(declCount('riad-test', HAPPY) === 0, 'cross-tenant POST writes nothing');
}

/* ── H · employee sessions (even roster-valid) cannot seal ───────────────── */
{
  const r = await post({ merchant: 'riad-test', month: HAPPY, action: 'finalize', idempotencyKey: 'k-employee-001' }, empCookie);
  ok(r.status !== 200, 'serveur employee session is denied');
  ok(declCount('riad-test', HAPPY) === 0, 'employee POST writes nothing');
}

/* ── GET gating for the hotel merchant ───────────────────────────────────── */
{
  const g = await get(`?merchant=riad-test&month=${HAPPY}`, tillCookieValue);
  ok(g.status !== 200, 'paired till without direction authority cannot read revisions');
}

/* ── D · paired till + direction PIN seals (guarded PIN path) ────────────── */
{
  const r = await post({ merchant: 'riad-test', month: '2025-08', action: 'finalize', pin: '9999', idempotencyKey: 'k-tillmgr-001' }, tillCookieValue);
  ok(r.status === 200 && r.body.ok === true, 'till + manager PIN seals via verifyStaffPin');
  ok(r.body.declaration.revision === 1 && r.body.declaration.state === 'snapshot', 'till-sealed revision is an internal snapshot');
}

/* ── I · named operator authority seals ──────────────────────────────────── */
{
  const r = await post({ merchant: 'riad-test', month: '2025-09', action: 'finalize', idempotencyKey: 'k-operator-001' }, opCookies);
  ok(r.status === 200 && r.body.ok === true, 'named operator seals');
  ok(r.body.declaration.closedBy.name === 'Hotel manager', 'operator seals under direction authority');
}

/* ── E · owner session seals the happy month; numbers come from EVENTS ───── */
let rev1Hash = '';
{
  const r = await post({ merchant: 'riad-test', month: HAPPY, action: 'finalize', idempotencyKey: 'k-happy-001' }, ownerCookie);
  ok(r.status === 200, 'owner seals the compliant month');
  const d = r.body.declaration;
  ok(d.revision === 1 && d.state === 'snapshot', 'first revision is an internal snapshot');
  ok(d.sourceCursor === maxEventCursor, `sourceCursor is the ledger high-water mark (${maxEventCursor}), not the doc rev (42)`);
  ok(d.payload.totalArrivals === 4, 'arrivals counted from event segments (2+1+1, legacy row ignored)');
  ok(d.payload.totalBedNights === 10, 'bed-nights from per-segment month overlap (6+2+2)');
  ok(d.payload.occupiedRoomNightsCount === 7, 'room-nights across R1/R2/R3 (3+2+2)');
  ok(d.payload.nightsByNationality.FR === 5 && d.payload.nightsByNationality.MA === 3 && d.payload.nightsByNationality.XX === 2, 'nationality split from ISO segment codes');
  ok(d.payload.activeStaysCount === 3, 'cancelled/no-show excluded from the authoritative set');
  ok(d.payload.statusCounts.completed === 2 && d.payload.statusCounts.requested === 1, 'status split mirrors the ledger');
  ok(JSON.stringify(Object.keys(d.payload).sort()) === JSON.stringify(['activeStaysCount', 'daysInMonth', 'finalizedAt', 'merchant', 'month', 'nightsByNationality', 'occupiedRoomNightsCount', 'revision', 'sourceCursor', 'statusCounts', 'totalArrivals', 'totalBedNights']), 'snapshot carries counts only, never guest fields');
  rev1Hash = d.canonicalHash;
  ok(typeof rev1Hash === 'string' && rev1Hash.length === 64, 'canonical SHA-256 hash sealed');
}

/* ── AA · snapshots and exceptions carry no guest PII ────────────────────── */
{
  const row = sql.prepare("SELECT payload_json, lineage_json FROM hotel_monthly_declarations WHERE merchant='riad-test' AND month=?").get(HAPPY);
  ok(!String(row.payload_json).includes('CANARY') && !String(row.lineage_json).includes('CANARY'), 'stored snapshot holds no guest PII');
}

/* ── J · stale in-house checkout blocks ──────────────────────────────────── */
{
  const r = await post({ merchant: 'riad-test', month: STALE, action: 'finalize', idempotencyKey: 'k-stale-001' }, ownerCookie);
  ok(r.status === 422 && r.body.error === 'unresolved-exceptions', 'stale checkout blocks with 422');
  ok(r.body.exceptions.length === 1 && r.body.exceptions[0].code === 'stale_checkout', 'exactly the stale checkout is reported');
  ok(!JSON.stringify(r.body.exceptions).includes('STALEDOC1'), 'exceptions carry no identity-document data');
}

/* ── K · future checkout inside the month is not stale ───────────────────── */
{
  const r = await post({ merchant: 'riad-test', month: CUR_MONTH, action: 'finalize', idempotencyKey: 'k-future-001' }, ownerCookie);
  ok(r.status === 200, 'in-house stay with future checkout seals (no false stale)');
  ok(r.body.declaration.payload.activeStaysCount === 1, 'only the overlapping stay counted');
}

/* ── L · completed stay with empty manifest blocks ───────────────────────── */
{
  const r = await post({ merchant: 'riad-test', month: MANIF, action: 'finalize', idempotencyKey: 'k-manif-001' }, ownerCookie);
  ok(r.status === 422, 'completed stay with empty manifest blocks');
  ok(r.body.exceptions.some((e) => e.code === 'missing_manifest'), 'missing_manifest reported for completed stay');
}

/* ── M · missing identity + nationality block, without leaking PII ───────── */
{
  const r = await post({ merchant: 'riad-test', month: MANIF2, action: 'finalize', idempotencyKey: 'k-noid-001' }, ownerCookie);
  ok(r.status === 422, 'missing identity blocks');
  ok(r.body.exceptions.some((e) => e.code === 'missing_identity'), 'missing_identity reported');
  ok(r.body.exceptions.some((e) => e.code === 'missing_nationality'), 'missing_nationality reported');
  ok(!JSON.stringify(r.body).includes('CANARY'), 'exception payload leaks no PII canary');
}

/* ── N · ledger stay missing from the cache blocks instead of vanishing ──── */
{
  const r = await post({ merchant: 'riad-test', month: GHOST, action: 'finalize', idempotencyKey: 'k-ghost-001' }, ownerCookie);
  ok(r.status === 422, 'evicted stay blocks the review');
  ok(r.body.exceptions.some((e) => e.code === 'stay-detail-unavailable'), 'stay-detail-unavailable names the failure');
}

/* ── P · zero-activity month seals with zeros ────────────────────────────── */
{
  const r = await post({ merchant: 'riad-test', month: '2025-03', action: 'finalize', idempotencyKey: 'k-zero-001' }, ownerCookie);
  ok(r.status === 200, 'zero-activity month seals');
  ok(r.body.declaration.payload.totalArrivals === 0 && r.body.declaration.payload.totalBedNights === 0, 'zero aggregates sealed honestly');
  ok(r.body.declaration.sourceCursor === maxEventCursor, 'cursor still marks the ledger position read, even with no stays');
}

/* ── O · 4 100 stays aggregate from the uncapped ledger ───────────────────── */
{
  const r = await post({ merchant: 'riad-bulk', month: BULK, action: 'finalize', idempotencyKey: 'k-bulk-001' }, ownerCookie);
  ok(r.status === 200, 'bulk month seals');
  const p = r.body.declaration.payload;
  ok(p.totalArrivals === 4100 && p.totalBedNights === 4100, '4 100 arrivals and bed-nights counted');
  ok(p.occupiedRoomNightsCount === 4100, '4 100 distinct room-nights counted');
  ok(p.nightsByNationality.FR === 4100, 'bulk nationality split exact');
  ok(r.body.declaration.sourceCursor === 5099, 'cursor tracks the event ledger, not the cache');
}

/* ── Q · idempotency key is mandatory ─────────────────────────────────────── */
{
  const r1 = await post({ merchant: 'riad-test', month: '2025-07', action: 'finalize' }, ownerCookie);
  ok(r1.status === 400 && r1.body.error === 'missing-idempotency-key', 'finalize without key is 400');
  const r2 = await post({ merchant: 'riad-test', month: HAPPY, action: 'rectify', rectificationReason: 'Motif de test assez long' }, ownerCookie);
  ok(r2.status === 400 && r2.body.error === 'missing-idempotency-key', 'rectify without key is 400');
}

/* ── R+S · double finalize → 409; same key → replay ───────────────────────── */
{
  const again = await post({ merchant: 'riad-test', month: HAPPY, action: 'finalize', idempotencyKey: 'k-happy-002' }, ownerCookie);
  ok(again.status === 409 && again.body.error === 'already-finalized', 'second finalize is 409');
  const replay = await post({ merchant: 'riad-test', month: HAPPY, action: 'finalize', idempotencyKey: 'k-happy-001' }, ownerCookie);
  ok(replay.status === 200 && replay.body.replayed === true, 'same key replays');
  ok(replay.body.declaration.canonicalHash === rev1Hash, 'replay returns the identical sealed hash');
}

/* ── T+U+V · rectify lifecycle on 2025-07, with hash-chain proof ──────────── */
{
  const fin = await post({ merchant: 'riad-test', month: '2025-07', action: 'finalize', idempotencyKey: 'k-reuse-fin' }, ownerCookie);
  ok(fin.status === 200, '2025-07 sealed');
  const reuse = await post({ merchant: 'riad-test', month: '2025-07', action: 'rectify', rectificationReason: 'Motif de test assez long pour passer', idempotencyKey: 'k-reuse-fin' }, ownerCookie);
  ok(reuse.status === 409 && reuse.body.error === 'idempotency-key-reuse', 'key reuse across actions is 409');
  const short = await post({ merchant: 'riad-test', month: '2025-07', action: 'rectify', rectificationReason: 'court', idempotencyKey: 'k-reuse-short' }, ownerCookie);
  ok(short.status === 400 && short.body.error === 'missing-reason', 'short rectification reason is 400');
  const rec = await post({ merchant: 'riad-test', month: '2025-07', action: 'rectify', rectificationReason: 'Régularisation suite à signalement tardif de la direction', idempotencyKey: 'k-reuse-rec' }, ownerCookie);
  ok(rec.status === 200 && rec.body.declaration.revision === 2, 'rectify appends revision 2');
  ok(rec.body.declaration.state === 'snapshot-rectified', 'rectified state stays internal');
  ok(rec.body.declaration.previousHash === fin.body.declaration.canonicalHash, 'rev2 chains to the rev1 hash');
  for (const decl of [fin.body.declaration, rec.body.declaration]) {
    const recomputed = await sha256Hex(canonicalJson(decl.payload));
    ok(recomputed === decl.canonicalHash, `rev${decl.revision} hash recomputes from its payload`);
  }
}

/* ── W · concurrent finalize, same key → exactly one row, one replay ─────── */
{
  const a = post({ merchant: 'riad-test', month: '2025-04', action: 'finalize', idempotencyKey: 'k-race-001' }, ownerCookie);
  const b = post({ merchant: 'riad-test', month: '2025-04', action: 'finalize', idempotencyKey: 'k-race-001' }, ownerCookie);
  const [ra, rb] = await Promise.all([a, b]);
  ok(ra.status === 200 && rb.status === 200, 'both concurrent calls answer 200');
  ok([ra.body.replayed, rb.body.replayed].filter(Boolean).length === 1, 'exactly one side replays');
  ok(declCount('riad-test', '2025-04') === 1, 'exactly one revision row exists');
}

/* ── X · concurrent finalize, different keys → one wins, one 409 ─────────── */
{
  const a = post({ merchant: 'riad-test', month: '2025-12', action: 'finalize', idempotencyKey: 'k-race2-a' }, ownerCookie);
  const b = post({ merchant: 'riad-test', month: '2025-12', action: 'finalize', idempotencyKey: 'k-race2-b' }, ownerCookie);
  const [ra, rb] = await Promise.all([a, b]);
  const codes = [ra.status, rb.status].sort().join(',');
  ok(codes === '200,409', 'one concurrent finalize wins, the other is 409');
  ok([ra.body.error, rb.body.error].includes('already-finalized'), 'loser reports already-finalized, never 500');
}

/* ── Y · concurrent rectify → one rev2, one revision-conflict ─────────────── */
let raceRev1 = '';
{
  const rows = sql.prepare("SELECT canonical_hash FROM hotel_monthly_declarations WHERE merchant='riad-test' AND month='2025-04'").all();
  raceRev1 = rows[0].canonical_hash;
  const a = post({ merchant: 'riad-test', month: '2025-04', action: 'rectify', rectificationReason: 'Première révision corrective concurrente', idempotencyKey: 'k-race-r1' }, ownerCookie);
  const b = post({ merchant: 'riad-test', month: '2025-04', action: 'rectify', rectificationReason: 'Seconde révision corrective concurrente', idempotencyKey: 'k-race-r2' }, ownerCookie);
  const [ra, rb] = await Promise.all([a, b]);
  const winner = ra.status === 200 ? ra : rb;
  const loser = ra.status === 200 ? rb : ra;
  ok(winner.status === 200 && winner.body.declaration.revision === 2, 'one rectify lands rev2');
  ok(winner.body.declaration.previousHash === raceRev1, 'winner chains to rev1');
  ok(loser.status === 409 && loser.body.error === 'revision-conflict', 'loser reports revision-conflict, never 500');
}

/* ── Z · rows are immutable ───────────────────────────────────────────────── */
{
  let failedUpdate = false;
  try { sql.prepare("UPDATE hotel_monthly_declarations SET state='tampered' WHERE merchant='riad-test'").run(); }
  catch (err) { failedUpdate = true; ok(String(err.message).includes('immutable'), 'trigger aborts UPDATE'); }
  ok(failedUpdate, 'UPDATE blocked');
  let failedDelete = false;
  try { sql.prepare("DELETE FROM hotel_monthly_declarations WHERE merchant='riad-test'").run(); }
  catch (err) { failedDelete = true; ok(String(err.message).includes('cannot be deleted'), 'trigger aborts DELETE'); }
  ok(failedDelete, 'DELETE blocked');
}

/* ── AB · GET revision history, ordered, manager-gated ────────────────────── */
{
  const g = await get(`?merchant=riad-test&month=${HAPPY}`, ownerCookie);
  ok(g.status === 200, 'owner reads revisions');
  ok(g.body.declarations.length === 1 && g.body.declarations[0].revision === 1, 'history ordered latest-first');
  ok(g.body.declarations[0].payload.totalArrivals === 4, 'GET exposes the sealed aggregates');
}

/* ── AC · canonical hashing is deterministic ──────────────────────────────── */
{
  const left = canonicalJson({ b: 1, a: { y: [3, 2], z: 'x' } });
  const right = canonicalJson({ a: { z: 'x', y: [3, 2] }, b: 1 });
  ok(left === right, 'key order never changes the canonical form');
  ok(await sha256Hex('abc') === 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad', 'SHA-256 matches the standard vector');
}

/* ── AD · no event ledger → authoritative review refused ──────────────────── */
{
  sql.exec('DROP TABLE hotel_stay_events');
  const r = await post({ merchant: 'riad-test', month: '2025-05', action: 'finalize', idempotencyKey: 'k-noevents-001' }, ownerCookie);
  ok(r.status === 503 && r.body.error === 'declaration-unavailable', 'missing event table refuses with 503, never falls back');
  sql.exec(EVENTS_MIGRATION);
}

/* ── AE · no declarations table → 503 on both verbs, then restored ────────── */
{
  sql.exec('DROP TABLE hotel_monthly_declarations');
  const r = await post({ merchant: 'riad-test', month: '2025-05', action: 'finalize', idempotencyKey: 'k-nodecl-001' }, ownerCookie);
  ok(r.status === 503 && r.body.error === 'declaration-unavailable', 'POST without table is 503');
  const g = await get('?merchant=riad-test', ownerCookie);
  ok(g.status === 503 && g.body.error === 'declaration-unavailable', 'GET without table is 503');
  sql.exec(DECL_MIGRATION);
  const g2 = await get('?merchant=riad-test', ownerCookie);
  ok(g2.status === 200 && Array.isArray(g2.body.declarations), 'recreated table serves an empty history');
}

console.log(`hotel-declarations-closing-test: ${controls} controls passed`);
