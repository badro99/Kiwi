#!/usr/bin/env node
/* tools/hotel-direct-pricing-test.mjs — direct-guest pricing without a
 * commercial account (ordinary travelers must never need one).
 *
 * Server: configured rates recomputed and enforced, missing rates and
 * tampered snapshots rejected, agreed prices gated on owner/operator
 * identity with reason, snapshots persisted, legacy room-only untouched.
 * Pure helpers (priceDirectStay/directKey) are exercised directly too.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { makeSession, sessionCookie } from '../functions/auth/_lib.js';
import { onRequestPost as saveStay, onRequestGet as getStays, priceDirectStay } from '../functions/api/hotel/stays.js';
import { directKey } from '../functions/api/hotel/_commercial.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SECRET = 'hotel-direct-pricing-secret-0123456789abcdef';
const MERCHANT = 'hotel-direct-test';
const ACC = 'acc-direct-test';

let controls = 0;
function ok(value, label) { assert.ok(value, label); controls++; }

const sql = new DatabaseSync(':memory:');
sql.exec(fs.readFileSync(path.join(ROOT, 'schema.sql'), 'utf8'));
const now = Date.now();
sql.prepare('INSERT INTO accounts (id,email,name,business,salt,hash,created_ts) VALUES (?,?,?,?,?,?,?)')
  .run(ACC, 'direct@test.ma', 'Direct Owner', 'Hotel Direct', 's', 'h', now);
sql.prepare('INSERT INTO merchant_config (merchant,features,type,account_id,name,status,updated_ts) VALUES (?,?,?,?,?,?,?)')
  .run(MERCHANT, '{}', 'hotel', ACC, 'Hotel Direct', 'active', now);

const day = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
const CHECKIN = day(7), CHECKOUT = day(9);

const reservations = { v: 1, settings: { published: true, confirmation: 'instant', minNoticeMinutes: 0, windowDays: 365 }, services: [], resources: [], blocked: [], bookings: [] };
const roomsDoc = {
  v: 1, baseRate: null,
  roomTypes: [
    { id: 'type:dbl', name: 'Chambre Double', rate: 900, maxGuests: 2, boardRates: { bb: 150, hb_lunch: 220, hb_dinner: 280, full_board: 450 } },
    { id: 'type:eco', name: 'Chambre Eco', rate: 500, maxGuests: 2 },
    { id: 'type:norate', name: 'Chambre Sans Tarif', rate: null, maxGuests: 2 },
  ],
  rooms: [
    { id: 'room:101', n: 101, typeId: 'type:dbl', status: 'libre', connectingRoomIds: [] },
    { id: 'room:102', n: 102, typeId: 'type:dbl', status: 'libre', connectingRoomIds: [] },
    { id: 'room:103', n: 103, typeId: 'type:dbl', status: 'libre', connectingRoomIds: [] },
    { id: 'room:201', n: 201, typeId: 'type:eco', status: 'libre', connectingRoomIds: [] },
    { id: 'room:202', n: 202, typeId: 'type:norate', status: 'libre', connectingRoomIds: [] },
  ],
  folios: [],
};
sql.prepare('INSERT INTO store_docs (merchant,feature,data,rev,updated_ts) VALUES (?,?,?,?,?)')
  .run(MERCHANT, 'reservations', JSON.stringify(reservations), 1, now);
sql.prepare('INSERT INTO store_docs (merchant,feature,data,rev,updated_ts) VALUES (?,?,?,?,?)')
  .run(MERCHANT, 'rooms', JSON.stringify(roomsDoc), 1, now);
  sql.prepare('INSERT INTO store_docs (merchant,feature,data,rev,updated_ts) VALUES (?,?,?,?,?)')
    .run(MERCHANT, 'hotel-commercial', JSON.stringify({
      v: 1,
      accounts: [{ id: 'acc-agency-01', kind: 'agency', name: 'Atlas Voyages', legalName: '', address: '', city: '', country: '', ice: '', taxId: '', rc: '', contact: '', email: '', phone: '', paymentDays: 30, notes: '', archived: false }],
      contracts: [{ id: 'ctr-000001', name: 'Seminaire', accountId: 'acc-agency-01', roomTypeId: 'type:dbl', from: day(1), to: day(30), occupancy: 1, board: 'hb_dinner', unit: 'room', amountCents: 85000, taxBasis: 'inclusive', currency: 'MAD', archived: false }],
    }), 1, now);

class Statement {
  constructor(text) { this.text = text; this.args = []; }
  bind(...args) { this.args = args.map((v) => (v === undefined ? null : v)); return this; }
  async first() { return sql.prepare(this.text).get(...this.args) ?? null; }
  async all() { return { results: sql.prepare(this.text).all(...this.args) }; }
  async rows() { return { results: sql.prepare(this.text).all(...this.args) }; }
  async run() {
    const r = sql.prepare(this.text).run(...this.args);
    return { success: true, meta: { changes: Number(r.changes) } };
  }
}
const DB = {
  prepare: (text) => new Statement(text),
  async batch(statements) {
    sql.exec('BEGIN IMMEDIATE');
    try {
      const out = [];
      for (const s of statements) out.push(/^\s*SELECT\b/i.test(s.text) ? await s.all() : await s.run());
      sql.exec('COMMIT');
      return out;
    } catch (err) { try { sql.exec('ROLLBACK'); } catch (_) {} throw err; }
  },
};
const cookie = sessionCookie(await makeSession(ACC, SECRET)).split(';')[0];
const env = { DB, AUTH_SECRET: SECRET };
const post = (body) => saveStay({
  env,
  request: new Request('https://kiwi.test/api/hotel/stays', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify(body),
  }),
});
const J = async (r) => ({ status: r.status, body: await r.json().catch(() => ({})) });

const directPayload = (over = {}) => ({
  action: 'save', merchant: MERCHANT, clientRef: 'staff-direct-0001', roomTypeId: 'type:dbl',
  resourceId: 'room:101', checkIn: CHECKIN, checkOut: CHECKOUT, partySize: 1, status: 'confirmed',
  channel: 'direct', customer: { name: 'Karim Benchekroun', phone: '+212661000001', email: '' },
  guests: [{ name: 'Karim Benchekroun' }],
  commercial: { accountId: '', booker: 'Karim Benchekroun', board: 'bb', quoted: false },
  directPricing: {
    board: 'bb', occupancy: 1,
    rows: [
      { date: CHECKIN, roomCents: 90000, mealCents: 15000, quantity: 1, amountCents: 105000 },
      { date: day(8), roomCents: 90000, mealCents: 15000, quantity: 1, amountCents: 105000 },
    ],
    totalCents: 210000,
  },
  ...over,
});

console.log('\n■ 1. Direct B&B books at configured rates with a persisted snapshot');
{
  const { status, body } = await J(await post(directPayload()));
  ok(status === 200 && body.booking, 'B&B without account saves');
  const b = body.booking;
  ok(b.hotel.total === 2100, `total is room plus breakfast (got ${b.hotel.total})`);
  ok(b.pricing && b.pricing.kind === 'direct' && b.pricing.totalCents === 210000, 'accepted snapshot persisted');
  ok(b.pricing.taxBasis === 'inclusive' && b.pricing.rows.length === 2, 'snapshot carries rows and tax basis');
  ok(b.commercial && b.commercial.accountId === '' && b.commercial.quoted === false, 'no fake account created');
}

console.log('\n■ 2. Missing and tampered rates fail closed');
{
  const noMeal = directPayload({ clientRef: 'staff-direct-0002', resourceId: 'room:201', roomTypeId: 'type:eco', commercial: { accountId: '', booker: 'X', board: 'bb', quoted: false } });
  noMeal.directPricing = { board: 'bb', occupancy: 1, rows: [], totalCents: 0 };
  const r1 = await J(await post(noMeal));
  ok(r1.status === 409 && r1.body.error === 'rate-missing', 'missing meal supplement rejected, never zeroed');
  const tampered = directPayload({ clientRef: 'staff-direct-0003', resourceId: 'room:102' });
  tampered.directPricing.totalCents = 100;
  const r2 = await J(await post(tampered));
  ok(r2.status === 409 && r2.body.error === 'price-mismatch', 'tampered total rejected');
  const wrongOcc = directPayload({ clientRef: 'staff-direct-0004', resourceId: 'room:102' });
  wrongOcc.directPricing.occupancy = 2;
  const r3 = await J(await post(wrongOcc));
  ok(r3.status === 409 && r3.body.error === 'price-mismatch', 'stale occupancy rejected');
  const noRoom = directPayload({ clientRef: 'staff-direct-0005', resourceId: 'room:202', roomTypeId: 'type:norate' });
  noRoom.directPricing = {
    board: 'room_only', occupancy: 1,
    rows: [
      { date: CHECKIN, roomCents: 0, mealCents: 0, quantity: 1, amountCents: 0 },
      { date: day(8), roomCents: 0, mealCents: 0, quantity: 1, amountCents: 0 },
    ],
    totalCents: 0,
  };
  const r4 = await J(await post({ ...noRoom, commercial: { accountId: '', booker: 'X', board: 'room_only', quoted: false } }));
  ok(r4.status === 409 && r4.body.error === 'rate-missing', 'missing room rate rejected even at zero');
}

console.log('\n■ 3. Agreed prices: explicit, reasoned, owner-stamped');
{
  const agreed = directPayload({ clientRef: 'staff-direct-0006', resourceId: 'room:102' });
  delete agreed.directPricing;
  agreed.directPricing = { agreed: true, amountCents: 95000, reason: 'geste commercial, dernière chambre', board: 'bb', occupancy: 1 };
  const r1 = await J(await post(agreed));
  ok(r1.status === 200 && r1.body.booking, 'agreed price saves with reason');
  const p = r1.body.booking.pricing;
  ok(p && p.agreed === true && p.totalCents === 95000, 'agreed snapshot persisted');
  ok(p.reason === 'geste commercial, dernière chambre', 'reason persisted verbatim');
  ok(p.agreedBy && p.agreedBy.role === 'owner' && p.agreedBy.id === ACC, 'owner identity stamped as authorizer');
  ok(r1.body.booking.hotel.total === 950, 'total follows the agreed amount, never the catalogue');
  const noReason = directPayload({ clientRef: 'staff-direct-0007', resourceId: 'room:103' });
  noReason.directPricing = { agreed: true, amountCents: 95000, reason: 'ok', board: 'bb', occupancy: 1 };
  const r2 = await J(await post(noReason));
  ok(r2.status === 409 && r2.body.error === 'agreed-invalid', 'reason too short rejected');
  const noAmount = directPayload({ clientRef: 'staff-direct-0008', resourceId: 'room:103' });
  noAmount.directPricing = { agreed: true, amountCents: 0, reason: 'geste commercial', board: 'bb', occupancy: 1 };
  const r3 = await J(await post(noAmount));
  ok(r3.status === 409 && r3.body.error === 'agreed-invalid', 'zero agreed amount rejected');
}

console.log('\n■ 4. Mixed pricing and legacy paths');
{
  const mixed = directPayload({ clientRef: 'staff-direct-0009', resourceId: 'room:103' });
  mixed.commercial = { accountId: 'acc-x', booker: 'X', board: 'bb', quoted: false };
  const r1 = await J(await post(mixed));
  ok(r1.status === 409 && r1.body.error === 'mixed-pricing', 'account plus direct pricing rejected');
  const legacy = {
    action: 'save', merchant: MERCHANT, clientRef: 'staff-direct-0010', roomTypeId: 'type:dbl',
    resourceId: 'room:103', checkIn: CHECKIN, checkOut: CHECKOUT, partySize: 1, status: 'confirmed',
    channel: 'direct', customer: { name: 'Salma' },
    guests: [{ name: 'Salma' }],
    commercial: { accountId: '', booker: 'Salma', board: 'room_only', quoted: false },
  };
  const r2 = await J(await post(legacy));
  ok(r2.status === 200 && r2.body.booking.hotel.total === 1800, 'legacy room-only unchanged, no snapshot required');
  ok(!r2.body.booking.pricing, 'legacy path stores no direct snapshot');
}

console.log('\n■ 5b. Edit lifecycle: preservation, explicit reprice, transitions');
{
  const getById = async (id) => {
    const r = await getStays({ env, request: new Request(`https://kiwi.test/api/hotel/stays?merchant=${MERCHANT}&id=${id}`, { headers: { Cookie: cookie } }) });
    const b = await r.json().catch(() => ({}));
    return (b.stays || [])[0] || null;
  };
  const addDay = (ymd, n) => { const d = new Date(ymd + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
  const hbRows = (ci, co) => {
    const rows = [];
    for (let d = ci; d < co; d = addDay(d, 1)) rows.push({ date: d, roomCents: 90000, mealCents: 28000, quantity: 1, amountCents: 118000 });
    return rows;
  };
  const CIN2 = day(10), COUT2 = day(12);
  const mkDirect = (ref, room, extra = {}) => ({
    action: 'save', merchant: MERCHANT, clientRef: ref, roomTypeId: 'type:dbl',
    resourceId: room, checkIn: CIN2, checkOut: COUT2, partySize: 1, status: 'confirmed',
    channel: 'direct', customer: { name: 'Karim Benchekroun', phone: '+212661000001', email: '' },
    guests: [{ name: 'Karim Benchekroun' }],
    commercial: { accountId: '', booker: 'Karim Benchekroun', board: 'hb_dinner', quoted: false },
    directPricing: { board: 'hb_dinner', occupancy: 1, rows: hbRows(CIN2, COUT2), totalCents: 236000 },
    ...extra,
  });
  // create + contact-only edit keeps snapshot and total
  let r = await J(await post(mkDirect('staff-life-0001', 'room:101')));
  ok(r.status === 200, 'direct booking created');
  const at0 = r.body.booking.pricing.acceptedAt;
  const editBody = (b, patch) => ({
    merchant: MERCHANT, id: b.id, clientRef: b.publicRef, roomTypeId: b.serviceId, resourceId: b.resourceId,
    checkIn: b.hotel.checkIn, checkOut: b.hotel.checkOut, partySize: b.partySize, status: b.status, channel: b.hotel.channel,
    customer: { ...b.customer }, guests: b.guests.map((g) => ({ ...g })),
    commercial: { accountId: '', booker: (b.commercial && b.commercial.booker) || b.customer.name, board: (b.commercial && b.commercial.board) || 'hb_dinner', quoted: false },
    ...patch,
  });
  r = await J(await post(editBody(r.body.booking, { customer: { name: 'Karim Benchekroun', phone: '+212662000002', email: '' } })));
  ok(r.status === 200, 'contact-only edit accepted without fresh pricing');
  ok(r.body.booking.hotel.total === 2360 && r.body.booking.pricing.totalCents === 236000, 'total and snapshot preserved');
  ok(r.body.booking.pricing.acceptedAt === at0, 'original acceptance timestamp untouched');
  ok(!r.body.booking.pricingHistory || r.body.booking.pricingHistory.length === 0, 'no history fabricated');
  // dates moved without fresh pricing: explicit reprice required
  const lifeId = r.body.booking.id;
  r = await J(await post(editBody(r.body.booking, { checkIn: day(14), checkOut: day(16) })));
  ok(r.status === 409 && r.body.error === 'reprice-required', 'moved dates without fresh pricing are refused');
  // same move with fresh pricing: repriced
  const fresh = {
    board: 'hb_dinner', occupancy: 1,
    rows: [
      { date: day(14), roomCents: 90000, mealCents: 28000, quantity: 1, amountCents: 118000 },
      { date: day(15), roomCents: 90000, mealCents: 28000, quantity: 1, amountCents: 118000 },
    ],
    totalCents: 236000,
  };
  r = await J(await post({ ...editBody(await getById(lifeId), { checkIn: day(14), checkOut: day(16) }), directPricing: fresh }));
  ok(r.status === 200 && r.body.booking.hotel.total === 2360, 'explicit reprice reprices to the fresh snapshot');
  // direct -> contract transition: single source, history kept
  r = await J(await post({
    ...editBody(await getById(lifeId), {}),
    commercial: { accountId: 'acc-agency-01', booker: 'Karim Benchekroun', board: 'hb_dinner', quoted: true },
    acceptQuote: true, quoteRevision: 1,
  }));
  ok(r.status === 200, 'contract transition accepted');
  ok(r.body.booking.hotel.total === 1700, 'contract total wins outright');
  ok(r.body.booking.commercial.quote.totalCents === 170000, 'accepted quote stored');
  ok(!r.body.booking.pricing, 'stale direct snapshot cleared, not competing');
  ok(Array.isArray(r.body.booking.pricingHistory) && r.body.booking.pricingHistory.length === 1
    && r.body.booking.pricingHistory[0].totalCents === 236000 && r.body.booking.pricingHistory[0].supersededAt > 0,
    'superseded direct snapshot preserved in history');
  // contract -> direct transition back
  const back = {
    board: 'hb_dinner', occupancy: 1,
    rows: [
      { date: day(14), roomCents: 90000, mealCents: 28000, quantity: 1, amountCents: 118000 },
      { date: day(15), roomCents: 90000, mealCents: 28000, quantity: 1, amountCents: 118000 },
    ],
    totalCents: 236000,
  };
  r = await J(await post({
    ...editBody(await getById(lifeId), {}),
    commercial: { accountId: '', booker: 'Karim Benchekroun', board: 'hb_dinner', quoted: false },
    directPricing: back,
  }));
  ok(r.status === 200 && r.body.booking.hotel.total === 2360, 'direct total wins back');
  ok(r.body.booking.commercial.quote === null, 'stale contract quote cleared');
  ok(r.body.booking.pricingHistory.length === 2 && r.body.booking.pricingHistory[1].kind === 'contract'
    && r.body.booking.pricingHistory[1].totalCents === 170000, 'contract snapshot archived too');
  // completed stay: note edit allowed, pricing frozen
  const doneId = r.body.booking.id;
  for (const st of ['checked_in', 'completed']) {
    const rs = await J(await post(editBody(await getById(doneId), { status: st })));
    assert.equal(rs.status, 200, `transition to ${st} works`);
  }
  r = await J(await post(editBody(await getById(doneId), { note: 'late checkout asked' })));
  ok(r.status === 200, 'note edit on a completed stay is not a pricing change');
  ok(r.body.booking.hotel.total === 2360 && r.body.booking.pricing.totalCents === 236000, 'completed stay keeps money');
  // agreed -> agreed with a new amount archives the old authorization
  r = await J(await post({
    action: 'save', merchant: MERCHANT, clientRef: 'staff-life-agreed', roomTypeId: 'type:eco',
    resourceId: 'room:201', checkIn: CHECKIN, checkOut: CHECKOUT, partySize: 1, status: 'confirmed',
    channel: 'direct', customer: { name: 'Nadia' }, guests: [{ name: 'Nadia' }],
    commercial: { accountId: '', booker: 'Nadia', board: 'bb', quoted: false },
    directPricing: { agreed: true, amountCents: 95000, reason: 'geste commercial', board: 'bb', occupancy: 1 },
  }));
  ok(r.status === 200, 'agreed booking created');
  const atAgreed = r.body.booking.pricing.acceptedAt;
  r = await J(await post({
    merchant: MERCHANT, id: r.body.booking.id, clientRef: r.body.booking.publicRef, roomTypeId: 'type:eco',
    resourceId: 'room:201', checkIn: CHECKIN, checkOut: CHECKOUT, partySize: 1, status: 'confirmed',
    channel: 'direct', customer: { name: 'Nadia' }, guests: [{ name: 'Nadia' }],
    commercial: { accountId: '', booker: 'Nadia', board: 'bb', quoted: false },
    directPricing: { agreed: true, amountCents: 100000, reason: 'geste revu', board: 'bb', occupancy: 1 },
  }));
  ok(r.status === 200 && r.body.booking.hotel.total === 1000, 'deliberate agreed change reprices');
  ok(r.body.booking.pricing.acceptedAt >= atAgreed, 'new authorization timestamped');
  ok(r.body.booking.pricingHistory.length === 1 && r.body.booking.pricingHistory[0].amountCents === 95000
    && r.body.booking.pricingHistory[0].reason === 'geste commercial', 'old authorization archived, not lost');
}

console.log('\n■ 5. Pure helpers: roles, bounds, key stability');
{
  const base = { type: { rate: 900, boardRates: { bb: 150 } }, hotel: { baseRate: 700 }, nights: 2, partySize: 1, checkIn: CHECKIN, board: 'bb', actor: { id: ACC, role: 'owner' }, now };
  const good = priceDirectStay({ ...base, direct: { board: 'bb', occupancy: 1, rows: [{ date: CHECKIN, roomCents: 90000, mealCents: 15000, quantity: 1, amountCents: 105000 }, { date: day(8), roomCents: 90000, mealCents: 15000, quantity: 1, amountCents: 105000 }], totalCents: 210000 } });
  ok(good.totalCents === 210000, 'helper computes the configured total');
  const till = () => priceDirectStay({ ...base, direct: { agreed: true, amountCents: 100, reason: 'geste', board: 'bb', occupancy: 1 }, actor: { id: 'till:x', role: 'till' } });
  try { till(); assert.fail('till agreed price must throw'); } catch (e) { ok(e && e.code === 'agreed-forbidden', 'till cannot agree prices'); }
  const anon = () => priceDirectStay({ ...base, direct: { agreed: true, amountCents: 100, reason: 'geste', board: 'bb', occupancy: 1 }, actor: { id: 'm', role: 'authenticated' } });
  try { anon(); assert.fail('anonymous agreed price must throw'); } catch (e) { ok(e && e.code === 'agreed-forbidden', 'unauthenticated identity cannot agree prices'); }
  ok(directKey(null) === '' && directKey({}) !== directKey({ board: 'bb' }), 'empty and priced intents differ');
  ok(directKey({ board: 'bb', occupancy: 1 }) === directKey({ board: 'bb', occupancy: 1, rows: [], totalCents: 0 }), 'key normalizes absent rows');
}

console.log('\n■ 6. Client pricer matches the server cent for cent');
{
  const hotelJs = fs.readFileSync(path.join(ROOT, 'assets/hotel.js'), 'utf8');
  const window = {
    addEventListener() {},
    KiwiI18n: { getLang: () => 'fr' },
    KiwiVenue: { getVenue: () => 'vhotel', getCurrentVenueData: () => ({ id: 'vhotel', type: 'hotel' }), subscribe: () => () => {} },
    KiwiStore: { slugFor: () => 'slug-hotel' },
    Kiwi: { handlers: {}, appPage: () => ({ el: null, close() {} }), toast() {} },
    localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
  };
  const ctx = {
    window, console,
    document: { addEventListener() {}, documentElement: { lang: 'fr' } },
    setTimeout() { return 0; },
    clearTimeout() {},
    Date, Math, JSON, Object, Array, String, Number, Map, Set,
    fetch: async () => ({ ok: true, json: async () => ({ ok: true }) }),
  };
  const vm = await import('node:vm');
  vm.runInNewContext(hotelJs, ctx, { filename: 'assets/hotel.js' });
  const dq = ctx.window.KiwiHotelRooms.directQuote;
  ok(typeof dq === 'function', 'direct pricer exported for tests');
  const bb = dq({ typeRate: 900, baseRate: 700, boardRates: { bb: 150 }, board: 'bb', checkIn: CHECKIN, checkOut: CHECKOUT, occupancy: 1 });
  ok(bb.ok && bb.totalCents === 210000 && bb.rows.length === 2, 'client B&B total equals server total');
  ok(bb.rows[0].date === CHECKIN && bb.rows[0].roomCents === 90000 && bb.rows[0].mealCents === 15000 && bb.rows[0].quantity === 1, 'client rows carry room, meal, quantity per night');
  const fam = dq({ typeRate: 1800, baseRate: null, boardRates: { bb: 150 }, board: 'bb', checkIn: CHECKIN, checkOut: CHECKOUT, occupancy: 4 });
  ok(fam.ok && fam.totalCents === 1800 * 100 * 2 + 150 * 100 * 4 * 2, 'family of four scales meals per person, no three-person cap');
  const ro = dq({ typeRate: 900, baseRate: null, boardRates: null, board: 'room_only', checkIn: CHECKIN, checkOut: CHECKOUT, occupancy: 1 });
  ok(ro.ok && ro.totalCents === 180000, 'room-only needs no meal rate');
  ok(dq({ typeRate: null, baseRate: null, boardRates: null, board: 'room_only', checkIn: CHECKIN, checkOut: CHECKOUT, occupancy: 1 }).missing.includes('room'), 'missing room rate reported');
  ok(dq({ typeRate: 900, baseRate: null, boardRates: null, board: 'bb', checkIn: CHECKIN, checkOut: CHECKOUT, occupancy: 1 }).missing.includes('meal'), 'missing meal rate reported');
  ok(dq({ typeRate: 900, baseRate: null, boardRates: { bb: 150 }, board: 'bb', checkIn: CHECKOUT, checkOut: CHECKIN, occupancy: 1 }).missing.includes('dates'), 'inverted dates reported');
}

console.log(`\n✓ All ${controls} direct-pricing controls passed.`);
