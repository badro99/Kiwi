#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { test } from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { makeSession, sessionCookie } from '../functions/auth/_lib.js';
import { onRequestGet, onRequestPost } from '../functions/api/hotel/commercial.js';
import { onRequestPost as saveStay, onRequestGet as getStays } from '../functions/api/hotel/stays.js';
import { quote, contract, account, dateOK, commercialSnapshot, validateCommercialSync } from '../functions/api/hotel/_commercial.js';
import { onRequestPost as storePost } from '../functions/api/store.js';
import { onRequestPost as publicBooking } from '../functions/api/booking.js';
import { resetTableStateCacheForTests } from '../functions/api/hotel/_stay-events.js';
import { onRequestGet as productionGet } from '../functions/api/hotel/production.js';
import { monthWindow, monthlyProduction } from '../functions/api/hotel/_production.js';

const agency = { id: 'account-agency', kind: 'agency', name: 'Synthetic agency', legalName: 'Synthetic Agency SARL', paymentDays: 30, ice: 'SYNTHETIC' };
const low = { id: 'contract-low', name: 'Basse saison', accountId: agency.id, roomTypeId: 'standard', from: '2027-01-01', to: '2027-06-30', occupancy: 2, board: 'bb', unit: 'room', amountCents: 50035, taxBasis: 'inclusive' };
const high = { ...low, id: 'contract-high', name: 'Haute saison', from: '2027-07-01', to: '2027-08-31', amountCents: 80045 };
const input = { accountId: agency.id, roomTypeId: 'standard', checkIn: '2027-06-30', checkOut: '2027-07-02', occupancy: 2, board: 'bb' };
function directory() { return { accounts: [account(agency)], contracts: [contract(low), contract(high)] }; }

test('production clips cross-month room-nights, separates accounts and channels, excludes departures', () => {
  const row = { id: 'one', check_in: '2028-02-28', check_out: '2028-03-02', status: 'confirmed', room_id: '', channel: 'booking', raw_json: JSON.stringify({ commercial: { accountId: agency.id, billTo: agency } }) };
  const p = monthlyProduction([row, { ...row, id: 'direct', raw_json: '{}', check_in: '2028-02-29', check_out: '2028-03-01' }, ...['requested','cancelled','no_show'].map(status => ({ ...row, id: status, status }))], monthWindow('2028-02'));
  assert.equal(p.days, 29); assert.equal(p.nights, 3); assert.equal(p.reservations, 2); assert.equal(p.unassigned, 2);
  assert.equal(p.totals[27], 1); assert.equal(p.totals[28], 2);
  assert.equal(p.groups[0].kind, 'agency'); assert.equal(p.groups[1].name, 'Booking.com');
  assert.equal(monthWindow('2027-12').end, '2028-01-01');
  assert.throws(() => monthWindow('9999-12'), /bad-month/);
  assert.throws(() => monthWindow('2027-13'), /bad-month/);
  assert.throws(() => monthlyProduction([row, row], monthWindow('2028-02')), /production-data-invalid/);
  assert.throws(() => monthlyProduction([{ ...row, raw_json: 'broken' }], monthWindow('2028-02')), /production-data-invalid/);
  assert.throws(() => monthlyProduction([{ ...row, check_out: '2028-02-30' }], monthWindow('2028-02')), /production-data-invalid/);
});

test('production handler reads full D1 history without exposing guests and refuses missing/corrupt history', async () => {
  const f = await fixture();
  try {
    await f.seed();
    const created = await f.stay({ commercial: { accountId: agency.id, board: 'bb', quoted: true }, acceptQuote: true, quoteRevision: 3 });
    assert.equal(created.status, 200);
    f.sql.prepare("DELETE FROM store_docs WHERE feature='reservations'").run();
    const r = await f.call(productionGet, null, true, 'production?month=2027-07');
    assert.equal(r.status, 200); assert.equal(r.body.nights, 1);
    assert.equal(r.body.groups[0].name, agency.name);
    assert.doesNotMatch(JSON.stringify(r.body), /Synthetic Guest|customer_|owner-test|SYNTHETIC/);
    assert.equal((await f.call(productionGet, null, false, 'production?month=2027-07')).status, 401);
    assert.equal((await f.call(productionGet, null, true, 'production?month=2027-13')).status, 400);
    f.sql.prepare("UPDATE hotel_reservations SET raw_json='broken'").run();
    assert.equal((await f.call(productionGet, null, true, 'production?month=2027-07')).status, 503);
    f.sql.exec('DROP TABLE hotel_reservations');
    assert.equal((await f.call(productionGet, null, true, 'production?month=2027-07')).status, 503);
  } finally { f.sql.close(); }
});

async function fixture() {
  resetTableStateCacheForTests();
  const sql = new DatabaseSync(':memory:');
  sql.exec(fs.readFileSync(new URL('../schema.sql', import.meta.url), 'utf8'));
  const env = { AUTH_SECRET: 'synthetic-commercial-test-secret-only' }, merchant = 'commercial-test';
  sql.prepare('INSERT INTO accounts (id,email,name,business,salt,hash,created_ts) VALUES (?,?,?,?,?,?,?)').run('owner-test', 'synthetic@example.test', 'Owner', 'Commercial test', 's', 'h', 1);
  sql.prepare('INSERT INTO merchant_config (merchant,features,type,account_id,name,status,updated_ts) VALUES (?,?,?,?,?,?,?)').run(merchant, '{}', 'hotel', 'owner-test', 'Synthetic hotel', 'active', 1);
  const rooms = { baseRate: 600, roomTypes: [{ id: 'standard', name: 'Standard', rate: 600, maxGuests: 3 }], rooms: [{ id: 'room:101', n: 101, typeId: 'standard', status: 'libre' }], folios: [] };
  sql.prepare('INSERT INTO store_docs (merchant,feature,data,rev,updated_ts) VALUES (?,?,?,?,?)').run(merchant, 'rooms', JSON.stringify(rooms), 1, 1);
  const cookie = sessionCookie(await makeSession('owner-test', env.AUTH_SECRET)).split(';')[0];
  let race = false;
  class Statement {
    constructor(query) { this.query = query; this.args = []; }
    bind(...args) { this.args = args; return this; }
    async first() { return sql.prepare(this.query).get(...this.args) || null; }
    async all() { return { results: sql.prepare(this.query).all(...this.args) }; }
    async run() {
      if (race && this.query.startsWith('UPDATE store_docs SET data=?,rev=rev+1')) {
        race = false;
        sql.prepare("UPDATE store_docs SET rev=rev+1 WHERE merchant=? AND feature='hotel-commercial'").run(merchant);
      }
      return { meta: { changes: Number(sql.prepare(this.query).run(...this.args).changes) } };
    }
  }
  env.DB = { prepare: query => new Statement(query), batch: async statements => {
    sql.exec('BEGIN IMMEDIATE');
    try { const out = []; for (const s of statements) out.push(await (/^\s*SELECT\b/i.test(s.query) ? s.all() : s.run())); sql.exec('COMMIT'); return out; }
    catch (e) { sql.exec('ROLLBACK'); throw e; }
  } };
  async function call(handler, body, auth = true, url = 'commercial') {
    const target = new URL('https://kiwi.test/api/hotel/' + url); target.searchParams.set('merchant', merchant);
    const response = await handler({ env, request: new Request(target, { method: body ? 'POST' : 'GET', headers: { ...(auth ? { Cookie: cookie } : {}), 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify({ merchant, ...body }) } : {}) }) });
    return { status: response.status, body: await response.json() };
  }
  const post = b => call(onRequestPost, b);
  async function seed() { await post({ action: 'account', rev: 0, item: agency }); await post({ action: 'contract', rev: 1, item: low }); await post({ action: 'contract', rev: 2, item: high }); }
  const stay = b => call(saveStay, { action: 'save', clientRef: 'test-stay-reference', roomTypeId: 'standard', resourceId: 'room:101', checkIn: input.checkIn, checkOut: input.checkOut, partySize: 2, channel: 'direct', status: 'confirmed', customer: { name: 'Synthetic Guest' }, ...b });
  return { sql, env, merchant, post, call, seed, stay, race() { race = true; } };
}

test('daily quote crosses seasons in cents with exclusive checkout date', () => {
  const q = quote(directory(), input);
  assert.equal(q.totalCents, 130080);
  assert.deepEqual(q.rows.map(r => [r.date, r.amountCents]), [['2027-06-30', 50035], ['2027-07-01', 80045]]);
});
test('per-person prices, all five meal plans and zero-price contracts are explicit', () => {
  for (const board of ['room_only', 'bb', 'hb_lunch', 'hb_dinner', 'full_board']) {
    const d = directory(); d.contracts = [contract({ ...low, board, unit: 'person', to: high.to })];
    assert.equal(quote(d, { ...input, board }).totalCents, 200140);
    d.contracts[0].amountCents = 0; assert.equal(quote(d, { ...input, board }).totalCents, 0);
  }
});
test('gaps, overlaps, mixed tax basis, invalid dates and unsupported occupancy refuse guessing', () => {
  assert.throws(() => quote(directory(), { ...input, checkIn: '2027-09-01', checkOut: '2027-09-02' }), /rate-gap/);
  const d = directory(); d.contracts.push(contract({ ...high, id: 'duplicate-rate' }));
  assert.throws(() => quote(d, input), /rate-overlap/);
  d.contracts.pop(); d.contracts[1].taxBasis = 'exclusive'; assert.throws(() => quote(d, input), /mixed-tax-basis/);
  for (const date of ['2027-02-29', '2026-13-01', '0000-01-01']) assert.equal(dateOK(date), false);
  assert.equal(dateOK('2028-02-29'), true);
  assert.throws(() => quote(directory(), { ...input, occupancy: 4 }), /invalid-formula/);
  assert.throws(() => contract({ ...low, amountCents: 1.5 }), /invalid-price/);
});
test('authenticated typed accounts round-trip, clear fields, archive and reject stale edits', async () => {
  const f = await fixture();
  try {
    assert.equal((await f.call(onRequestGet)).status, 200);
    assert.equal((await f.call(onRequestGet, null, false)).status, 401);
    assert.equal((await f.call(onRequestPost, { action: 'account', rev: 0, item: agency }, false)).status, 401);
    assert.equal((await f.post({ action: 'account', rev: 0, item: agency })).status, 200);
    const result = await f.post({ action: 'account', rev: 1, item: { ...agency, ice: '', archived: true } });
    assert.equal(result.body.accounts[0].ice, ''); assert.equal(result.body.accounts[0].archived, true);
    assert.equal((await f.post({ action: 'account', rev: 1, item: agency })).status, 409);
    for (const [i,kind] of ['individual', 'company'].entries()) assert.equal((await f.post({ action: 'account', rev: 2+i, item: { ...agency, id: 'account-' + kind, kind } })).status, 200);
  } finally { f.sql.close(); }
});
test('tenant isolation, hotel-only access and suspended merchants fail closed', async () => {
  const f = await fixture();
  try {
    const alien = await f.call(onRequestPost, { merchant: 'someone-else', action: 'account', rev: 0, item: agency }); assert.equal(alien.status, 401);
    f.sql.prepare("UPDATE merchant_config SET type='boutique'").run(); assert.equal((await f.call(onRequestGet)).status, 401);
    f.sql.prepare("UPDATE merchant_config SET type='hotel',status='suspended'").run(); assert.equal((await f.call(onRequestGet)).status, 401);
  } finally { f.sql.close(); }
});
test('compare-and-swap prevents a write racing after the read', async () => {
  const f = await fixture();
  try {
    await f.seed(); f.race();
    const r = await f.post({ action: 'account', rev: 3, item: { ...agency, name: 'Losing writer' } });
    assert.equal(r.status, 409); assert.equal((await f.call(onRequestGet)).body.accounts[0].name, agency.name);
  } finally { f.sql.close(); }
});
test('corrupt directory is never replaced and overlapping contracts are refused', async () => {
  const f = await fixture();
  try {
    await f.seed();
    assert.equal((await f.post({ action: 'contract', rev: 3, item: { ...low, id: 'overlapping-contract' } })).body.error, 'rate-overlap');
    f.sql.prepare("UPDATE store_docs SET data='broken' WHERE feature='hotel-commercial'").run();
    assert.equal((await f.post({ action: 'account', rev: 3, item: agency })).status, 503);
    assert.equal(f.sql.prepare("SELECT data FROM store_docs WHERE feature='hotel-commercial'").get().data, 'broken');
  } finally { f.sql.close(); }
});
test('accepted quote and debtor snapshot survive contract edits, D1 pruning and stay status edits', async () => {
  const f = await fixture();
  try {
    await f.seed();
    const commercial = { accountId: agency.id, board: 'bb', quoted: true, booker: 'Synthetic Booker', voucher: 'PO-test' };
    assert.equal((await f.stay({ commercial })).body.error, 'quote-required');
    const created = await f.stay({ commercial, acceptQuote: true, quoteRevision: 3 });
    assert.equal(created.status, 200, JSON.stringify(created.body));
    const b = created.body.booking; assert.equal(b.hotel.total, 1300.8);
    await f.post({ action: 'contract', rev: 3, item: { ...low, amountCents: 99000 } });
    await f.post({ action: 'account', rev: 4, item: { ...agency, legalName: 'Changed legal name' } });
    const edited = await f.stay({ id: b.id, status: 'checked_in', commercial });
    assert.equal(edited.status, 200); assert.equal(edited.body.booking.hotel.total, 1300.8);
    assert.equal(edited.body.booking.commercial.billTo.legalName, agency.legalName);
    assert.deepEqual(edited.body.booking.commercial.quote, b.commercial.quote);
    const changed = await f.stay({ id: b.id, status: 'checked_in', checkOut: '2027-07-03', commercial });
    assert.equal(changed.body.error, 'quote-required');
    assert.equal((await f.stay({ id: b.id, status: 'checked_in', checkOut: '2027-07-03', commercial, acceptQuote: true, quoteRevision: 3 })).body.error, 'quote-required');
    const requote = await f.stay({ id: b.id, status: 'checked_in', checkOut: '2027-07-03', commercial, acceptQuote: true, quoteRevision: 5 });
    assert.equal(requote.body.booking.hotel.total, 2590.9);
    await f.stay({ id: b.id, status: 'completed', checkOut: '2027-07-03', commercial });
    const closed = await f.stay({ id: b.id, status: 'completed', checkOut: '2027-07-03', commercial, acceptQuote: true, quoteRevision: 5 });
    assert.equal(closed.body.error, 'closed-commercial');
  } finally { f.sql.close(); }
});
test('HT quote is available for review but cannot silently become a TTC reservation', async () => {
  const f = await fixture();
  try {
    await f.seed(); await f.post({ action: 'contract', rev: 3, item: { ...low, taxBasis: 'exclusive' } });
    const commercial = { accountId: agency.id, board: 'bb', quoted: true };
    const r = await f.stay({ checkOut: '2027-07-01', commercial, acceptQuote: true, quoteRevision: 4 });
    assert.equal(r.body.error, 'tax-configuration-required');
  } finally { f.sql.close(); }
});
test('legacy sync cannot forge, erase or change accepted commercial terms', async () => {
  const f = await fixture();
  try {
    await f.seed();
    const created = await f.stay({ commercial: { accountId: agency.id, board: 'bb', quoted: true }, acceptQuote: true, quoteRevision: 3 });
    const booking = created.body.booking;
    const d = { bookings: [booking] };
    assert.equal(await validateCommercialSync(f.env, f.merchant, d, d), true);
    assert.equal(await validateCommercialSync(f.env, f.merchant, { bookings: [] }, d), true, 'pruned stay resolves its authoritative D1 snapshot');
    for (const mutate of [b => { b.commercial = null; }, b => { b.commercial.quote.totalCents = 1; }, b => { b.hotel.total = 1; }, b => { b.status = 'cancelled'; }]) {
      const next = structuredClone(d); mutate(next.bookings[0]);
      await assert.rejects(validateCommercialSync(f.env, f.merchant, d, next), /commercial-stays-use-api/);
    }
    await assert.rejects(validateCommercialSync(f.env, f.merchant, d, { bookings: [] }), /commercial-stays-use-api/);
    const row = f.sql.prepare("SELECT data,rev FROM store_docs WHERE feature='reservations'").get();
    const next = JSON.parse(row.data); next.bookings = [structuredClone(booking)]; next.bookings[0].commercial.quote.totalCents = 1;
    const refused = await f.call(storePost, { feature: 'reservations', baseRev: row.rev, data: next });
    assert.equal(refused.body.error, 'commercial-stays-use-api');
  } finally { f.sql.close(); }
});
test('browser reservation normalizer preserves the bounded commercial snapshot', () => {
  const ctx = { console, setTimeout() {}, clearTimeout() {}, Date, Math, JSON, document: { addEventListener() {} }, addEventListener() {}, navigator: {}, location: { origin: 'https://kiwi.test' } }; ctx.window = ctx;
  vm.runInNewContext(fs.readFileSync(new URL('../assets/reservations.js', import.meta.url), 'utf8'), ctx);
  const commercial = commercialSnapshot({ accountId: agency.id, billTo: account(agency), quoted: true, board: 'bb', occupancy: 2, quote: quote(directory(), input), acceptedAt: 1, voucher: 'test', booker: 'test' });
  const b = { id: 'stay-test', serviceId: 'standard', startAt: 1, endAt: 2, customer: { name: 'Synthetic' }, commercial };
  const result = ctx.KiwiReservations.normalize({ bookings: [b] });
  assert.deepEqual(JSON.parse(JSON.stringify(result.bookings[0].commercial)), commercial);
});
test('account history is filtered server-side, including cancelled records', async () => {
  const f = await fixture();
  try {
    await f.seed(); const created = await f.stay({ commercial: { accountId: agency.id, board: 'bb', quoted: true }, acceptQuote: true, quoteRevision: 3 });
    await f.stay({ id: created.body.booking.id, action: 'cancel' });
    for (const [id,count] of [[agency.id,1], ['different-account',0]]) {
      const res = await f.call(getStays, null, true, 'stays?accountId=' + id + '&includeCancelled=1&unused=');
      assert.equal(res.status, 200); assert.equal(res.body.stays.length, count);
      if (count) assert.equal(res.body.stays[0].status, 'cancelled');
    }
  } finally { f.sql.close(); }
});
test('public booking write preserves existing commercial, guest and room history without exposing them', async () => {
  const f = await fixture();
  try {
    f.sql.exec('DROP TABLE hotel_reservations');
    await f.seed(); const created = await f.stay({
      commercial: { accountId: agency.id, board: 'bb', quoted: true }, acceptQuote: true, quoteRevision: 3,
      guests: [{ id: 'synthetic-guest', name: 'Private synthetic identity', sex: 'F', nationality: 'MA', birthDate: '1990-01-01', residenceCountry: 'MA', minorsUnder18: 1, idDocType: 'passeport', idDocNumber: 'SYNTHETIC-PRIVATE' }],
      roomSegments: [{ roomId: 'room:101', fromDate: input.checkIn, toDate: input.checkOut }],
    });
    const row = f.sql.prepare("SELECT data FROM store_docs WHERE feature='reservations'").get();
    const d = JSON.parse(row.data); d.settings.published = true; d.settings.windowDays = 365; d.settings.minNoticeMinutes = 0;
    f.sql.prepare("UPDATE store_docs SET data=? WHERE feature='reservations'").run(JSON.stringify(d));
    const rooms = JSON.parse(f.sql.prepare("SELECT data FROM store_docs WHERE feature='rooms'").get().data);
    rooms.rooms.push({ id: 'room:102', n: 102, typeId: 'standard', status: 'libre' });
    f.sql.prepare("UPDATE store_docs SET data=? WHERE feature='rooms'").run(JSON.stringify(rooms));
    const res = await f.call(publicBooking, { serviceId: 'standard', ref: 'public-booking-test', checkIn: input.checkIn, checkOut: input.checkOut, partySize: 1, customer: { name: 'Other synthetic guest', email: 'other@example.test' } });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    const saved = JSON.parse(f.sql.prepare("SELECT data FROM store_docs WHERE feature='reservations'").get().data);
    const preserved = saved.bookings.find(b => b.id === created.body.booking.id);
    for (const field of ['commercial', 'guests', 'roomSegments']) assert.deepEqual(preserved[field], created.body.booking[field]);
    assert.deepEqual(preserved.hotel.guestSegments, created.body.booking.hotel.guestSegments);
    assert.deepEqual(preserved.hotel.roomSegments, created.body.booking.hotel.roomSegments);
    assert.equal(JSON.stringify(res.body).includes(agency.legalName), false);
    assert.doesNotMatch(JSON.stringify(res.body), /SYNTHETIC-PRIVATE|Private synthetic identity|1990-01-01/);
  } finally { f.sql.close(); }
});
