#!/usr/bin/env node
// Real route handlers against synthetic, in-memory SQLite only.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { makeSession, sessionCookie } from '../functions/auth/_lib.js';
import { onRequestGet, onRequestPost } from '../functions/api/hotel/stays.js';
import { resetTableStateCacheForTests } from '../functions/api/hotel/_stay-events.js';

async function fixture(mode) {
  resetTableStateCacheForTests();
  const sql = new DatabaseSync(':memory:');
  sql.exec(fs.readFileSync(new URL('../schema.sql', import.meta.url), 'utf8'));
  if (mode === 'document') sql.exec('DROP TABLE hotel_reservations');
  const now = Date.now(), merchant = 'editing-test', secret = 'hotel-editing-test-secret-0123456789';
  sql.prepare('INSERT INTO accounts (id,email,name,business,salt,hash,created_ts) VALUES (?,?,?,?,?,?,?)')
    .run('editing-owner', 'owner@example.test', 'Test Owner', 'Test Hotel', 's', 'h', now);
  sql.prepare('INSERT INTO merchant_config (merchant,features,type,account_id,name,status,updated_ts) VALUES (?,?,?,?,?,?,?)')
    .run(merchant, '{}', 'hotel', 'editing-owner', 'Test Hotel', 'active', now);
  const rooms = {
    v: 4, baseRate: 600.35,
    roomTypes: [
      { id: 'standard', name: 'Standard', rate: 850.25, maxGuests: 2 },
      { id: 'suite', name: 'Suite', rate: 1200.45, maxGuests: 3 },
      { id: 'base', name: 'Base rate category', rate: null, maxGuests: 2 },
      { id: 'complimentary', name: 'Complimentary', rate: 0, maxGuests: 2 },
    ],
    rooms: [
      { id: 'room:101', n: 101, typeId: 'standard', status: 'libre' },
      { id: 'room:102', n: 102, typeId: 'standard', status: 'libre' },
      { id: 'room:201', n: 201, typeId: 'suite', status: 'libre' },
      { id: 'room:301', n: 301, typeId: 'base', status: 'libre' },
      { id: 'room:401', n: 401, typeId: 'complimentary', status: 'libre' },
    ], folios: [],
  };
  const doc = { v: 1, settings: {}, services: [], resources: [], blocked: [], bookings: [] };
  for (const [feature, data] of [['rooms', rooms], ['reservations', doc]]) {
    sql.prepare('INSERT INTO store_docs (merchant,feature,data,rev,updated_ts) VALUES (?,?,?,?,?)')
      .run(merchant, feature, JSON.stringify(data), 1, now);
  }
  class Statement {
    constructor(text) { this.text = text; this.args = []; }
    bind(...args) { this.args = args; return this; }
    async first() { return sql.prepare(this.text).get(...this.args) || null; }
    async all() { return { results: sql.prepare(this.text).all(...this.args) }; }
    async run() { return { meta: { changes: Number(sql.prepare(this.text).run(...this.args).changes) } }; }
  }
  let failReplayLookup = false;
  const DB = {
    prepare(text) {
      if (failReplayLookup && text.includes('json_extract')) throw new Error('synthetic-replay-query-outage');
      return new Statement(text);
    },
    async batch(statements) {
      sql.exec('BEGIN IMMEDIATE');
      try {
        const result = [];
        for (const s of statements) result.push(await (/^\s*SELECT\b/i.test(s.text) ? s.all() : s.run()));
        sql.exec('COMMIT');
        return result;
      } catch (error) { sql.exec('ROLLBACK'); throw error; }
    },
  };
  const env = { DB, AUTH_SECRET: secret };
  const cookie = sessionCookie(await makeSession('editing-owner', secret)).split(';')[0];
  const day = (offset) => new Date(now + offset * 86400000).toISOString().slice(0, 10);
  const offset = mode === 'd1-pruned' ? 90 : 5;
  const input = {
    action: 'save', merchant, clientRef: 'editing-reference-0001',
    roomTypeId: 'standard', resourceId: 'room:101',
    checkIn: day(offset), checkOut: day(offset + 2), partySize: 2,
    channel: 'direct', status: 'confirmed', customer: { name: 'Synthetic Guest' },
  };
  async function post(body) {
    const response = await onRequestPost({ env, request: new Request('https://kiwi.test/api/hotel/stays', {
      method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...input, ...body }),
    }) });
    return { status: response.status, body: await response.json() };
  }
  async function get(params = {}) {
    const query = new URLSearchParams({ merchant, ...params });
    const response = await onRequestGet({ env, request: new Request(`https://kiwi.test/api/hotel/stays?${query}`, {
      headers: { Cookie: cookie },
    }) });
    return { status: response.status, body: await response.json() };
  }
  function savedDoc() {
    return JSON.parse(sql.prepare("SELECT data FROM store_docs WHERE merchant=? AND feature='reservations'").get(merchant).data);
  }
  function stored(id) {
    if (mode === 'document') return savedDoc().bookings.find((b) => b.id === id).hotel;
    return sql.prepare('SELECT rate,total FROM hotel_reservations WHERE merchant=? AND id=?').get(merchant, id);
  }
  function snapshot() {
    return JSON.stringify({
      docs: sql.prepare('SELECT * FROM store_docs ORDER BY merchant,feature').all(),
      events: sql.prepare('SELECT * FROM hotel_stay_events ORDER BY id').all(),
      stays: mode === 'document' ? [] : sql.prepare('SELECT * FROM hotel_reservations ORDER BY id').all(),
    });
  }
  function catalogue(changes) {
    changes(rooms);
    sql.prepare("UPDATE store_docs SET data=?,rev=rev+1 WHERE merchant=? AND feature='rooms'")
      .run(JSON.stringify(rooms), merchant);
  }
  return { sql, post, get, input, day, offset, savedDoc, stored, snapshot, catalogue,
    failReplayLookup() { failReplayLookup = true; } };
}

for (const mode of ['document', 'd1', 'd1-pruned']) {
  test(`${mode}: stable clientRef retries return the original stay without another write`, async () => {
    const f = await fixture(mode);
    try {
      const input = { resourceId: '', channel: 'booking', externalRef: 'SYNTHETIC-OTA-REF' };
      const created = await f.post(input);
      assert.equal(created.status, 200);
      const original = created.body.booking;
      if (mode === 'd1-pruned') assert.equal(f.savedDoc().bookings.length, 0);
      const before = f.snapshot();
      for (let retry = 0; retry < 3; retry++) {
        const result = await f.post(input);
        assert.equal(result.status, 200);
        assert.equal(result.body.replayed, true);
        assert.deepEqual(result.body.booking, original);
        assert.equal(f.snapshot(), before, 'retry adds neither stay, document revision nor event');
      }
      // A plain direct booking must not take a second room on a retry either.
      const direct = { resourceId: '', clientRef: 'direct-replay-reference' };
      const firstDirect = await f.post(direct);
      assert.equal(firstDirect.status, 200);
      const beforeDirectRetry = f.snapshot();
      const repeatedDirect = await f.post(direct);
      assert.equal(repeatedDirect.status, 200);
      assert.equal(repeatedDirect.body.booking.id, firstDirect.body.booking.id);
      assert.equal(repeatedDirect.body.replayed, true);
      assert.equal(f.snapshot(), beforeDirectRetry);

      assert.equal((await f.post({ action: 'cancel', id: original.id })).status, 200);
      const afterCancel = f.snapshot();
      const lateRetry = await f.post(input);
      assert.equal(lateRetry.status, 200);
      assert.equal(lateRetry.body.booking.id, original.id);
      assert.equal(lateRetry.body.booking.status, 'cancelled', 'retry cannot resurrect a cancelled stay');
      assert.equal(f.snapshot(), afterCancel);
    } finally { f.sql.close(); }
  });

  test(`${mode}: invalid calendar dates refuse writes and filtered reads`, async () => {
    const f = await fixture(mode);
    try {
      const unchanged = f.snapshot();
      for (const [checkIn, checkOut] of [
        ['2027-02-29', '2027-03-02'], ['2100-02-29', '2100-03-02'],
        ['2028-02-30', '2028-03-02'], ['2026-04-31', '2026-05-02'],
        ['2026-04-29', '2026-04-31'], ['2026-13-01', '2026-13-03'],
        ['2026-00-01', '2026-01-03'], ['2026-04-00', '2026-04-03'],
        ['2026-04-01junk', '2026-04-03'],
      ]) {
        const result = await f.post({ checkIn, checkOut });
        assert.equal(result.status, 400, `reject ${checkIn} -> ${checkOut}`);
        assert.equal(f.snapshot(), unchanged, 'invalid dates never change documents, rows or events');
      }
      for (const field of ['from', 'to']) {
        for (const value of ['2027-02-29', '2028-02-30', '2026-04-31', '2026-13-01', '2026-04-01junk']) {
          const result = await f.get({ [field]: value });
          assert.equal(result.status, 400, `reject invalid GET ${field}=${value}`);
          assert.equal(result.body.error, 'invalid-dates');
        }
      }
      for (const year of ['2000', '2028']) {
        const result = await f.post({ checkIn: `${year}-02-29`, checkOut: `${year}-03-02`, clientRef: `leap-year-${year}` });
        assert.equal(result.status, 200, `${year} is a real leap year`);
        assert.equal(result.body.booking.hotel.nights, 2);
        const query = await f.get({ from: `${year}-02-29`, to: `${year}-03-02` });
        assert.equal(query.status, 200);
        assert.deepEqual(query.body.stays.map((s) => s.id), [result.body.booking.id]);
        const epochQuery = await f.get({ from: String(Date.parse(`${year}-02-29T00:00:00Z`)), to: String(Date.parse(`${year}-03-03T00:00:00Z`)) });
        assert.deepEqual(epochQuery.body.stays.map((s) => s.id), [result.body.booking.id], 'epoch bounds remain supported');
        const beforeEdit = f.snapshot();
        const invalidEdit = await f.post({ id: result.body.booking.id, checkIn: `${year}-02-29`, checkOut: `${year}-02-30` });
        assert.equal(invalidEdit.status, 400);
        assert.equal(f.snapshot(), beforeEdit, 'an invalid edit cannot alter an existing stay');
      }
    } finally { f.sql.close(); }
  });

  test(`${mode}: cancelled stays are available only when explicitly requested`, async () => {
    const f = await fixture(mode);
    try {
      const created = await f.post({});
      assert.equal(created.status, 200);
      const id = created.body.booking.id;
      assert.equal((await f.post({ action: 'cancel', id })).status, 200);
      const active = await f.post({ clientRef: 'editing-reference-0002' });
      assert.equal(active.status, 200, 'cancellation releases capacity');
      const bounds = { from: f.input.checkIn, to: f.input.checkOut };
      for (const params of [{}, { from: '0' }, bounds, { ...bounds, status: 'confirmed' }]) {
        const result = await f.get(params);
        assert.equal(result.status, 200);
        assert.deepEqual(result.body.stays.map((s) => s.id), [active.body.booking.id]);
      }
      for (const params of [{ status: 'cancelled' }, { ...bounds, status: 'cancelled', roomId: 'room:101' }]) {
        const result = await f.get(params);
        assert.equal(result.status, 200);
        assert.deepEqual(result.body.stays.map((s) => s.id), [id]);
        assert.equal(result.body.stays[0].status, 'cancelled');
      }
      const complete = await f.get({ ...bounds, includeCancelled: '1' });
      assert.equal(complete.status, 200);
      assert.deepEqual(complete.body.stays.map((s) => s.id).sort(), [id, active.body.booking.id].sort(), 'snapshot includes cancelled and active stays');
      for (const [status, expectedId] of [['cancelled', id], ['confirmed', active.body.booking.id]]) {
        const filtered = await f.get({ ...bounds, includeCancelled: '1', status });
        assert.deepEqual(filtered.body.stays.map((s) => s.id), [expectedId], 'explicit status still filters complete snapshots');
      }
      assert.deepEqual((await f.get({ ...bounds, includeCancelled: '1', roomId: 'room:102' })).body.stays, []);
      for (const includeCancelled of ['0', 'false']) {
        assert.deepEqual((await f.get({ ...bounds, includeCancelled })).body.stays.map((s) => s.id), [active.body.booking.id], 'only includeCancelled=1 opts in');
      }
      assert.deepEqual((await f.get({ ...bounds, status: 'cancelled', roomId: 'room:102' })).body.stays, []);
      assert.deepEqual((await f.get({ from: f.day(f.offset + 10), to: f.day(f.offset + 12), status: 'cancelled' })).body.stays, []);
    } finally { f.sql.close(); }
  });

  test(`${mode}: edits keep booked cents; category changes use the current catalogue`, async () => {
    const f = await fixture(mode);
    try {
      const created = await f.post({});
      assert.equal(created.status, 200);
      const id = created.body.booking.id;
      if (mode === 'd1-pruned') assert.equal(f.savedDoc().bookings.length, 0, 'test edits a D1-only stay');
      // The edit test must also catch repricing independently of creation rounding.
      // Seed the pre-existing booked amount, including cents, in both durable representations.
      const booked = { ...created.body.booking, hotel: { ...created.body.booking.hotel, total: 1700.50 } };
      const doc = f.savedDoc();
      doc.bookings = doc.bookings.map((b) => b.id === id ? booked : b);
      f.sql.prepare("UPDATE store_docs SET data=? WHERE merchant=? AND feature='reservations'")
        .run(JSON.stringify(doc), f.input.merchant);
      if (mode !== 'document') f.sql.prepare('UPDATE hotel_reservations SET total=?,raw_json=? WHERE id=?')
        .run(1700.50, JSON.stringify(booked), id);
      f.catalogue((rooms) => { rooms.roomTypes[0].rate = 999.99; rooms.roomTypes[1].rate = 1333.35; });
      async function edit(changes, rate, total) {
        const result = await f.post({ id, ...changes });
        assert.equal(result.status, 200, JSON.stringify(result.body));
        assert.equal(result.body.booking.hotel.rate, rate, 'response retains the correct nightly rate');
        assert.equal(result.body.booking.hotel.total, total, 'response retains cents');
        assert.equal(f.stored(id).rate, rate, 'persisted nightly rate matches');
        assert.equal(f.stored(id).total, total, 'persisted total matches');
      }
      await edit({ note: 'Updated arrival instructions', customer: { name: 'Updated Synthetic Guest' } }, 850.25, 1700.50);
      assert.equal(created.body.booking.hotel.total, 1700.50, 'new bookings also retain cents');
      await edit({ status: 'checked_in' }, 850.25, 1700.50);
      await edit({ status: 'checked_in', resourceId: 'room:102' }, 850.25, 1700.50);
      await edit({ status: 'checked_in', checkOut: f.day(f.offset + 3) }, 850.25, 2550.75);
      await edit({ status: 'checked_in', checkOut: f.day(f.offset + 1) }, 850.25, 850.25);
      await edit({ status: 'checked_in', roomTypeId: 'suite', resourceId: 'room:201' }, 1333.35, 2666.70);
      await edit({ status: 'checked_in', roomTypeId: 'base', resourceId: 'room:301' }, 600.35, 1200.70);
      await edit({ status: 'checked_in', roomTypeId: 'complimentary', resourceId: 'room:401' }, 0, 0);
      f.catalogue((rooms) => { rooms.roomTypes[3].rate = 50; });
      await edit({ status: 'completed', roomTypeId: 'complimentary', resourceId: 'room:401', note: 'Checkout note' }, 0, 0);
      const fresh = await f.post({ clientRef: 'editing-reference-0003' });
      assert.equal(fresh.status, 200);
      assert.equal(fresh.body.booking.hotel.rate, 999.99, 'new bookings still use current catalogue');
      assert.equal(fresh.body.booking.hotel.total, 1999.98);
    } finally { f.sql.close(); }
  });
}

test('D1 replay lookup is tenant scoped, exact and safe with unrelated malformed JSON', async () => {
  const f = await fixture('d1-pruned');
  try {
    const created = await f.post({});
    assert.equal(created.status, 200);
    const id = created.body.booking.id;
    // Leave only a foreign-tenant row carrying the original reference. An
    // unscoped query would return it instead of creating this tenant's stay.
    f.sql.prepare('UPDATE hotel_reservations SET merchant=? WHERE merchant=? AND id=?')
      .run('another-test-hotel', f.input.merchant, id);
    const local = await f.post({});
    assert.equal(local.status, 200);
    assert.notEqual(local.body.booking.id, id);
    assert.notEqual(local.body.replayed, true);
    const localId = local.body.booking.id;
    // Malformed JSON in a separate inactive row must not break JSON extraction.
    const columns = f.sql.prepare('PRAGMA table_info(hotel_reservations)').all().map((row) => row.name);
    const values = f.sql.prepare('SELECT * FROM hotel_reservations WHERE merchant=? AND id=?').get(f.input.merchant, localId);
    Object.assign(values, { id: 'malformed-json-test', raw_json: '{broken', status: 'completed' });
    f.sql.prepare(`INSERT INTO hotel_reservations (${columns.join(',')}) VALUES (${columns.map(() => '?').join(',')})`)
      .run(...columns.map((column) => values[column]));
    const before = f.snapshot();
    const retry = await f.post({});
    assert.equal(retry.status, 200);
    assert.equal(retry.body.replayed, true);
    assert.equal(retry.body.booking.id, localId);
    assert.equal(f.snapshot(), before);
    const different = await f.post({ resourceId: '', clientRef: f.input.clientRef + '-suffix' });
    assert.equal(different.status, 200);
    assert.notEqual(different.body.booking.id, localId, 'reference lookup is exact, never a substring match');
  } finally { f.sql.close(); }
});

test('a D1 replay lookup failure refuses the write instead of creating a duplicate', async () => {
  const f = await fixture('d1-pruned');
  try {
    assert.equal((await f.post({ resourceId: '' })).status, 200);
    const before = f.snapshot();
    f.failReplayLookup();
    const result = await f.post({ resourceId: '' });
    assert.equal(result.status, 503);
    assert.equal(result.body.error, 'service-unavailable');
    assert.equal(f.snapshot(), before);
  } finally { f.sql.close(); }
});
