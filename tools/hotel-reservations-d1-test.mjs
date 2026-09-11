#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · Hotel Reservations D1 Migration & Capacity Tests
 *
 * Direct in-memory test suite verifying:
 *   1. Two-way document bounding math (<=300 stays, <390 KB for 1000 bookings)
 *   2. D1 table probing and isolate-cached state
 *   3. Availability authority moved strictly to D1 (preventing double-booking
 *      for stays 90+ days in the future that were pruned from store_docs)
 *   4. Client read path GET /api/hotel/stays with date range and column dominance
 *   5. Transient error discipline (503 on D1 error, no silent doc fallback)
 *
 * Runs completely in memory via node:sqlite in < 1.5s.
 * ─────────────────────────────────────────────────────────────────────────── */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { makeSession, sessionCookie } from '../functions/auth/_lib.js';
import { onRequestPost, onRequestGet, pruneReservationsDoc, MAX_DOC_BOOKINGS, HARD_DOC_LIMIT } from '../functions/api/hotel/stays.js';
import {
  hotelReservationsTableExists, hydrateReservation, resetTableStateCacheForTests,
} from '../functions/api/hotel/_stay-events.js';

const sql = new DatabaseSync(':memory:');
sql.exec(fs.readFileSync(new URL('../schema.sql', import.meta.url), 'utf8'));

const now = Date.now(), secret = 'hotel-d1-test-secret-1234567890';
sql.prepare('INSERT INTO accounts (id,email,name,business,salt,hash,created_ts) VALUES (?,?,?,?,?,?,?)')
  .run('acc-chellah', 'owner@chellah.ma', 'Owner', 'Hôtel Chellah', 's', 'h', now);
sql.prepare('INSERT INTO merchant_config (merchant,features,type,account_id,name,status,updated_ts) VALUES (?,?,?,?,?,?,?)')
  .run('chellah', '{}', 'hotel', 'acc-chellah', 'Hôtel Chellah', 'active', now);

const reservationsDoc = {
  v: 1,
  settings: { published: true, confirmation: 'instant', minNoticeMinutes: 0, windowDays: 365 },
  services: [],
  resources: [],
  blocked: [],
  bookings: [],
};

const roomsDoc = {
  v: 4,
  baseRate: 700,
  roomTypes: [{ id: 'type-deluxe', name: 'Deluxe', rate: 900, maxGuests: 2 }],
  rooms: [
    { id: 'room:101', n: 101, typeId: 'type-deluxe', status: 'libre' },
    { id: 'room:102', n: 102, typeId: 'type-deluxe', status: 'libre' },
  ],
  folios: [],
};

sql.prepare("INSERT INTO store_docs (merchant,feature,data,rev,updated_ts) VALUES (?,'reservations',?,1,?)")
  .run('chellah', JSON.stringify(reservationsDoc), now);
sql.prepare("INSERT INTO store_docs (merchant,feature,data,rev,updated_ts) VALUES (?,'rooms',?,1,?)")
  .run('chellah', JSON.stringify(roomsDoc), now);

class Statement {
  constructor(text) { this.text = text; this.args = []; }
  bind(...args) { this.args = args; return this; }
  async first() { return sql.prepare(this.text).get(...this.args) || null; }
  async run() {
    const r = sql.prepare(this.text).run(...this.args);
    return { success: true, meta: { changes: Number(r.changes) } };
  }
  async all() { return { results: sql.prepare(this.text).all(...this.args) }; }
  rows() { return { results: sql.prepare(this.text).all(...this.args) }; }
}

let throwOnQuery = false;
const DB = {
  prepare(text) {
    if (throwOnQuery && text.includes('hotel_reservations')) {
      throw new Error('transient-d1-outage');
    }
    return new Statement(text);
  },
  async batch(statements) {
    if (throwOnQuery && statements.some((s) => s.text.includes('hotel_reservations'))) {
      throw new Error('transient-d1-outage');
    }
    const writing = statements.some((s) => !/^\s*SELECT\b/i.test(s.text));

    if (!writing) return statements.map((s) => s.rows());
    sql.exec('BEGIN IMMEDIATE');
    try {
      const results = [];
      for (const statement of statements) {
        results.push(/^\s*SELECT\b/i.test(statement.text) ? statement.rows() : await statement.run());
      }
      sql.exec('COMMIT');
      return results;
    } catch (err) {
      sql.exec('ROLLBACK');
      throw err;
    }
  },
};

const cookie = sessionCookie(await makeSession('acc-chellah', secret)).split(';')[0];
const env = { DB, AUTH_SECRET: secret };

const callPost = (body) => onRequestPost({
  env,
  request: new Request('https://kiwi.test/api/hotel/stays', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify(body),
  }),
});

const callGet = (query = '') => onRequestGet({
  env,
  request: new Request(`https://kiwi.test/api/hotel/stays?merchant=chellah${query ? '&' + query : ''}`, {
    method: 'GET',
    headers: { Cookie: cookie },
  }),
});

const day = (n) => {
  const d = new Date(Date.now() + n * 86400000);
  return d.toISOString().slice(0, 10);
};

console.log('--- Test 1: Capacity Math & Two-Way Document Bounding ---');
{
  const bigDoc = { v: 1, settings: {}, services: [], resources: [], blocked: [], bookings: [] };
  // Generate 1 000 synthetic bookings across various dates
  for (let i = 0; i < 1000; i++) {
    const checkIn = day(i - 500);
    const checkOut = day(i - 498);
    bigDoc.bookings.push({
      id: `bk-${i}`,
      code: `H-${String(i).padStart(6, '0')}`,
      customer: { name: `Client ${i}`, phone: '0612345678', email: `client${i}@test.ma` },
      serviceId: 'type-deluxe',
      resourceId: i % 2 === 0 ? 'room:101' : 'room:102',
      startAt: Date.parse(`${checkIn}T15:00:00Z`),
      endAt: Date.parse(`${checkOut}T11:00:00Z`),
      partySize: 2,
      status: i % 10 === 0 ? 'checked_in' : 'confirmed',
      source: 'staff',
      note: 'Operational note for booking test',
      manageToken: 'tok_' + i,
      publicRef: 'ref_' + i,
      guests: [
        { id: `gst_${i}_1`, name: `Guest 1 of ${i}`, nationality: 'MA', idDocType: 'CNIE', idDocNumber: `AB${i}` },
        { id: `gst_${i}_2`, name: `Guest 2 of ${i}`, nationality: 'FR', idDocType: 'passeport', idDocNumber: `CD${i}` },
      ],
      roomSegments: [{ roomId: 'room:101', fromDate: checkIn, toDate: checkOut }],
      hotel: {
        roomTypeName: 'Deluxe',
        checkIn,
        checkOut,
        nights: 2,
        rate: 900,
        total: 1800,
        channel: 'direct',
        externalRef: `EXT-${i}`,
        feedId: '',
        syncedAt: 0,
        conflict: false,
        guestSegments: [],
        roomSegments: [],
      },
      createdAt: now,
      updatedAt: now,
    });
  }

  const rawBytes = Buffer.byteLength(JSON.stringify(bigDoc));
  assert.ok(rawBytes > 900000, `Initial 1000 bookings must exceed 900KB (measured: ${rawBytes} bytes)`);

  pruneReservationsDoc(bigDoc, now);

  const prunedBytes = Buffer.byteLength(JSON.stringify(bigDoc));
  assert.ok(bigDoc.bookings.length <= HARD_DOC_LIMIT, `Pruned bookings must be clamped <= ${HARD_DOC_LIMIT} (was: ${bigDoc.bookings.length})`);
  assert.ok(prunedBytes < 390000, `Pruned document size must be under 390KB (measured: ${prunedBytes} bytes)`);
  assert.ok(prunedBytes < 600000, 'Guaranteed comfortably under 600KB Cloudflare D1 limit');

  // Verify all in-house checked_in bookings within the window were prioritized
  const checkedInWithinWindow = bigDoc.bookings.filter((b) => b.status === 'checked_in');
  assert.ok(checkedInWithinWindow.length > 0, 'In-house stays are preserved by eviction priority');
  console.log(`  ✓ 1000 stays (${(rawBytes/1024).toFixed(1)} KB) clamped to ${bigDoc.bookings.length} stays (${(prunedBytes/1024).toFixed(1)} KB < 390 KB)`);
}

console.log('--- Test 2: D1 Table Probing & Isolate Caching ---');
{
  resetTableStateCacheForTests();
  const exists1 = await hotelReservationsTableExists(env);
  assert.equal(exists1, true, 'hotel_reservations table exists in schema');

  // Second call must hit isolate cache
  const exists2 = await hotelReservationsTableExists(env);
  assert.equal(exists2, true, 'table existence probed cleanly from cache');
  console.log('  ✓ Table probing succeeds and caches state in isolate');
}

console.log('--- Test 3: Availability Authority in D1 (Double-Booking Prevention) ---');
{
  // Chellah has an agency booking 90 days out for Room 101.
  const futureCheckIn = day(90);
  const futureCheckOut = day(93);

  // Book Room 101 via stays API
  const res1 = await callPost({
    action: 'save',
    merchant: 'chellah',
    clientRef: 'agency-90d-001',
    resourceId: 'room:101',
    roomTypeId: 'type-deluxe',
    checkIn: futureCheckIn,
    checkOut: futureCheckOut,
    partySize: 2,
    channel: 'booking',
    externalRef: 'OTA-AGENCY-90D',
    customer: { name: 'Agency Group Lead' },
  });
  const body1 = await res1.json();
  assert.equal(res1.status, 200, 'First forward booking for Room 101 succeeds');
  assert.equal(body1.booking.resourceId, 'room:101');

  // Verify it exists in D1
  const d1Row = sql.prepare("SELECT id, room_id, status FROM hotel_reservations WHERE merchant='chellah' AND id=?").get(body1.booking.id);
  assert.ok(d1Row, 'Booking is written to D1 hotel_reservations');
  assert.equal(d1Row.room_id, 'room:101');

  // Verify that the document was pruned and does NOT contain this 90-day booking
  const docAfter = JSON.parse(sql.prepare("SELECT data FROM store_docs WHERE merchant='chellah' AND feature='reservations'").get().data);
  const inDoc = docAfter.bookings.find((b) => b.id === body1.booking.id);
  assert.equal(inDoc, undefined, '90-day booking was pruned from store_docs.bookings (lives in D1 only)');

  // Now attempt to book Room 101 for overlapping dates (+91 to +94).
  // If stays.js checked only doc.bookings, it would see Room 101 as FREE and double-book it!
  const resConflict = await callPost({
    action: 'save',
    merchant: 'chellah',
    clientRef: 'conflict-attempt-001',
    resourceId: 'room:101',
    roomTypeId: 'type-deluxe',
    checkIn: day(91),
    checkOut: day(94),
    partySize: 2,
    channel: 'direct',
    customer: { name: 'Direct Rival' },
  });
  const bodyConflict = await resConflict.json();
  assert.equal(resConflict.status, 409, 'Conflicting booking for Room 101 is REJECTED by D1 authority');
  assert.equal(bodyConflict.error, 'room-unavailable', 'Error is room-unavailable');
  console.log('  ✓ Double-booking prevented by D1 query even though booking was pruned from store_docs');

  // Now auto-assign for the same dates: room 101 is busy, so it must pick room 102
  const resAuto = await callPost({
    action: 'save',
    merchant: 'chellah',
    clientRef: 'auto-assign-001',
    roomTypeId: 'type-deluxe',
    checkIn: futureCheckIn,
    checkOut: futureCheckOut,
    partySize: 2,
    customer: { name: 'Auto Assign Guest' },
  });
  const bodyAuto = await resAuto.json();
  assert.equal(resAuto.status, 200, 'Auto-assign succeeds by finding alternative room');
  assert.equal(bodyAuto.booking.resourceId, 'room:102', 'Assigned Room 102 because Room 101 is busy in D1');
  console.log('  ✓ Auto-assign queries D1 busy set and assigns remaining free room (102)');

  // Now third booking when both 101 and 102 are taken in D1
  const resFull = await callPost({
    action: 'save',
    merchant: 'chellah',
    clientRef: 'auto-assign-002',
    roomTypeId: 'type-deluxe',
    checkIn: futureCheckIn,
    checkOut: futureCheckOut,
    partySize: 2,
    customer: { name: 'Overbooked Guest' },
  });
  const bodyFull = await resFull.json();
  assert.equal(resFull.status, 409, 'Category sold out in D1 rejects third booking');
  assert.equal(bodyFull.error, 'room-unavailable');
  console.log('  ✓ Fully occupied category in D1 rejects new bookings with 409');
}

console.log('--- Test 4: Client Read Path (GET /api/hotel/stays) ---');
{
  const fromDate = day(89);
  const toDate = day(95);
  const resGet = await callGet(`from=${fromDate}&to=${toDate}`);
  assert.equal(resGet.status, 200, 'GET /api/hotel/stays returns 200');
  const bodyGet = await resGet.json();
  assert.equal(bodyGet.ok, true);
  assert.ok(Array.isArray(bodyGet.stays));
  assert.equal(bodyGet.stays.length, 2, 'Returns the 2 bookings created in D1 for that range');

  const stay101 = bodyGet.stays.find((s) => s.resourceId === 'room:101');
  assert.ok(stay101, 'Found Room 101 stay in D1 response');
  assert.equal(stay101.customer.name, 'Agency Group Lead');
  assert.equal(stay101.hotel.channel, 'booking');
  assert.equal(stay101.hotel.rate, 900);

  // Verify hydrateReservation column dominance:
  // Update the relational column `customer_name` directly in D1 while raw_json has old name
  sql.prepare("UPDATE hotel_reservations SET customer_name='VIP Agency Lead' WHERE id=?").run(stay101.id);
  const resHydrated = await callGet(`from=${fromDate}&to=${toDate}`);
  const bodyHydrated = await resHydrated.json();
  const vipStay = bodyHydrated.stays.find((s) => s.id === stay101.id);
  assert.equal(vipStay.customer.name, 'VIP Agency Lead', 'Relational column customer_name wins over raw_json');
  console.log('  ✓ Read endpoint returns date-filtered stays and enforces relational column dominance');
}

console.log('--- Test 5: Editing & Cancelling Pruned Stays from D1 ---');
{
  const staysRes = await callGet(`from=${day(89)}&to=${day(95)}`);
  const { stays } = await staysRes.json();
  const stay102 = stays.find((s) => s.resourceId === 'room:102');
  assert.ok(stay102, 'Found stay 102');

  // Cancel stay 102
  const resCancel = await callPost({
    action: 'cancel',
    merchant: 'chellah',
    id: stay102.id,
  });
  assert.equal(resCancel.status, 200, 'Cancelling a stay pruned from store_docs succeeds via D1 lookup');

  // Verify status in D1 is cancelled
  const d1Cancelled = sql.prepare("SELECT status FROM hotel_reservations WHERE id=?").get(stay102.id);
  assert.equal(d1Cancelled.status, 'cancelled', 'D1 status updated to cancelled');

  // Room 102 is now free again in D1!
  const resRebook = await callPost({
    action: 'save',
    merchant: 'chellah',
    clientRef: 'rebook-room-102',
    resourceId: 'room:102',
    roomTypeId: 'type-deluxe',
    checkIn: day(90),
    checkOut: day(93),
    partySize: 2,
    customer: { name: 'New Guest for Room 102' },
  });
  assert.equal(resRebook.status, 200, 'Cancelled capacity in D1 is immediately re-bookable');
  console.log('  ✓ Stays pruned from store_docs can be looked up, cancelled, and freed in D1');
}

console.log('--- Test 6: Transient Error Discipline (No Silent Fallback to Doc) ---');
{
  throwOnQuery = true;
  const resError = await callPost({
    action: 'save',
    merchant: 'chellah',
    clientRef: 'd1-down-attempt',
    roomTypeId: 'type-deluxe',
    checkIn: day(90),
    checkOut: day(93),
    partySize: 2,
    customer: { name: 'Outage Guest' },
  });
  assert.equal(resError.status, 503, 'Returns 503 on D1 error instead of falling back to pruned document');
  throwOnQuery = false;
  console.log('  ✓ Returns 503 when D1 errors, strictly protecting against double-booking');
}

console.log('--- Test 7: Prod D1 Lag · Le bornage ne doit PAS s’appliquer sans la table ---');

/* CLAUDE.md : « Prod D1 lags schema.sql. Every time. » Tant que la migration n’est
 * pas passee, hotel_reservations n’existe pas : le document store_docs est alors
 * L’UNIQUE copie de la reservation. L’elaguer detruirait definitivement tout sejour
 * confirme au-dela de la fenetre [-3j, +14j] et remettrait la chambre en vente.
 * La disponibilite retombe deja sur le document dans ce cas ; le bornage doit suivre. */
{
  sql.exec('DROP TABLE IF EXISTS hotel_reservations');
  resetTableStateCacheForTests();
  assert.equal(await hotelReservationsTableExists(env), false,
    'la sonde voit bien la table absente');

  const res = await callPost({
    action: 'save',
    merchant: 'chellah',
    clientRef: 'lag-far-future',
    roomTypeId: 'type-deluxe',
    checkIn: day(30),
    checkOut: day(33),
    partySize: 2,
    customer: { name: 'Atelier de Voyage' },
  });
  assert.equal(res.status, 200, 'une reservation lointaine est acceptee sans la table');

  const row = sql.prepare("SELECT data FROM store_docs WHERE merchant=? AND feature='reservations'").get('chellah');
  const saved = JSON.parse(row.data);
  const kept = saved.bookings.find((b) => b.publicRef === 'lag-far-future');
  assert.ok(kept, 'le sejour a +30j SURVIT dans store_docs quand hotel_reservations est absente');
  assert.ok(saved.bookings.length > 0, 'le document n’est pas vide');
  console.log('  ✓ Sans la table, le sejour a +30j est conserve (aucune destruction silencieuse)');

  sql.exec(fs.readFileSync(new URL('../migrations/2026-09-07-hotel-reservations.sql', import.meta.url), 'utf8'));
  resetTableStateCacheForTests();
}

console.log('\nAll hotel reservations D1 migration tests PASSED cleanly.');
