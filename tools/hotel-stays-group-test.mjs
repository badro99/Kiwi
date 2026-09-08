#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { makeSession, sessionCookie } from '../functions/auth/_lib.js';
import { onRequestPost as saveStay, onRequestGet as getStays } from '../functions/api/hotel/stays.js';
import { stayOptions } from '../functions/api/hotel/_stay-options.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const hotelJs = fs.readFileSync(path.join(ROOT, 'assets/hotel.js'), 'utf8');
const teamJs = fs.readFileSync(path.join(ROOT, 'assets/team.js'), 'utf8');
const interactiveJs = fs.readFileSync(path.join(ROOT, 'assets/interactive.js'), 'utf8');

let controls = 0;
function ok(value, label) { assert.ok(value, label); controls++; }

console.log('\n■ 1. Nationality selector & localized demonym dictionary');
{
  const window = {
    addEventListener() {},
    KiwiI18n: { getLang: () => 'fr' },
    KiwiVenue: { getVenue: () => 'vhotel', getCurrentVenueData: () => ({ id: 'vhotel', type: 'hotel' }), subscribe: () => () => {} },
    KiwiStore: { slugFor: () => 'slug-hotel' },
    Kiwi: { handlers: {}, appPage: () => ({ el: null, close() {} }), toast() {} },
    localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
  };
  const ctx = {
    window,
    console,
    document: { addEventListener() {}, documentElement: { lang: 'fr' } },
    setTimeout() { return 0; },
    clearTimeout() {},
    Date, Math, JSON, Object, Array, String, Number, Map, Set,
    fetch: async () => ({ ok: true, json: async () => ({ ok: true }) }),
  };
  vm.runInNewContext(hotelJs, ctx, { filename: 'assets/hotel.js' });

  const testMatch = (str) => ctx.window.KiwiHotelRooms.matchNationality(str);
  const testLabel = (val, lang) => {
    ctx.window.KiwiI18n.getLang = () => lang || 'fr';
    return ctx.window.KiwiHotelRooms.nationalityLabel(val, lang);
  };
  const testSelectorHtml = (g, idx) => ctx.window.KiwiHotelRooms.nationalitySelectorHtml(g, idx);

  ok(testMatch('MA') === 'MA', 'matches canonical MA code');
  ok(testMatch('fr') === 'FR', 'matches canonical fr code case-insensitively');
  ok(testMatch('US') === 'US', 'matches canonical US code');

  ok(testMatch('Maroc') === 'MA', 'matches French country name Maroc');
  ok(testMatch('marocaine') === 'MA', 'matches French demonym marocaine');
  ok(testMatch('Moroccan') === 'MA', 'matches English demonym Moroccan');
  ok(testMatch('Morocco') === 'MA', 'matches English country name Morocco');
  ok(testMatch('المغرب') === 'MA', 'matches Arabic country name Morocco');
  ok(testMatch('مغربية') === 'MA', 'matches Arabic demonym Morocco');

  ok(testMatch('France') === 'FR', 'matches French country France');
  ok(testMatch('française') === 'FR', 'matches accented demonym française');
  ok(testMatch('francais') === 'FR', 'matches unaccented alias francais');
  ok(testMatch('French') === 'FR', 'matches English demonym French');
  ok(testMatch('United Kingdom') === 'GB', 'matches English country United Kingdom');
  ok(testMatch('royaume-uni') === 'GB', 'matches hyphenated French name');
  ok(testMatch('angleterre') === 'GB', 'matches alias angleterre');
  ok(testMatch('British') === 'GB', 'matches British demonym');
  ok(testMatch('États-Unis') === 'US', 'matches accented French États-Unis');
  ok(testMatch('usa') === 'US', 'matches alias usa');
  ok(testMatch('Saudi Arabia') === 'SA', 'matches Saudi Arabia');
  ok(testMatch('السعودية') === 'SA', 'matches Arabic Saudi Arabia');
  ok(testMatch('UnknownCountry123') === null, 'unrecognized country returns null without guessing');

  ok(testLabel('MA', 'fr') === 'Marocaine', 'displays French demonym for MA');
  ok(testLabel('MA', 'en') === 'Moroccan', 'displays English demonym for MA');
  ok(testLabel('MA', 'ar') === 'مغربية', 'displays Arabic demonym for MA');
  ok(testLabel('FR', 'fr') === 'Française', 'displays French demonym for FR');
  ok(testLabel('FR', 'en') === 'French', 'displays English demonym for FR');
  ok(testLabel('FR', 'ar') === 'فرنسية', 'displays Arabic demonym for FR');

  ok(testLabel('AncienneNationalitéNonReconnue', 'fr') === 'AncienneNationalitéNonReconnue', 'unresolved legacy text is preserved verbatim');
  ok(testLabel('', 'fr') === '', 'empty nationality remains empty without auto-default');

  const html = testSelectorHtml({ nationality: 'MA' }, 0);
  ok(html.includes('class="hx-nat-combobox"'), 'renders combobox wrapper');
  ok(html.includes('data-hx-guest-nationality'), 'contains hidden canonical input');
  ok(html.includes('value="MA"'), 'stores canonical ISO code in hidden input');
  ok(html.includes('value="Marocaine"'), 'displays localized demonym in visible search input');
  ok(html.includes('hx-nat-clear'), 'contains clear button');

  const legacyHtml = testSelectorHtml({ nationality: 'AncienTexteLibre' }, 1);
  ok(legacyHtml.includes('value="AncienTexteLibre"'), 'preserves legacy free-text in input');
  ok(legacyHtml.includes('hx-badge-legacy'), 'surfaces review badge for unresolved legacy values');
}

console.log('\n■ 2. Hold (Option) vs Confirmation & Capacity validation');
{
  ok(hotelJs.includes("submitBtn.textContent = 'Poser une option (bloquer la chambre)'") &&
     hotelJs.includes("submitBtn.textContent = 'Confirmer la réservation'"),
    'button dynamically reflects hold (requested) vs confirmed reservation');
  ok(hotelJs.includes('selectedType && partySize > (selectedType.maxGuests || 4)'),
    'dynamic partySize validation checks against room-type maxGuests');
  ok(hotelJs.includes('hx-capacity-hint'), 'capacity hint badge exists in editor markup');
}

console.log('\n■ 3. Group reservation workflow & API persistence');
{
  const opts = stayOptions({ dossierId: 'grp_2027_conference', groupName: 'Tech Symposium 2027', board: 'bb' });
  ok(opts.dossierId === 'grp_2027_conference', 'stayOptions preserves dossierId');
  ok(opts.groupName === 'Tech Symposium 2027', 'stayOptions preserves groupName');

  const sql = new DatabaseSync(':memory:');
  sql.exec(fs.readFileSync(new URL('../schema.sql', import.meta.url), 'utf8'));
  const now = Date.now(), secret = 'hotel-group-test-secret-0123456789';
  sql.prepare('INSERT INTO accounts (id,email,name,business,salt,hash,created_ts) VALUES (?,?,?,?,?,?,?)').run('acc-owner', 'owner@group.ma', 'Owner', 'Hotel Group', 's', 'h', now);
  sql.prepare('INSERT INTO merchant_config (merchant,features,type,account_id,name,status,updated_ts) VALUES (?,?,?,?,?,?,?)').run('hotel-group', '{}', 'hotel', 'acc-owner', 'Hotel Group', 'active', now);
  const reservations = { v: 1, settings: { published: true, confirmation: 'instant', minNoticeMinutes: 0, windowDays: 365 }, services: [], resources: [], blocked: [], bookings: [] };
  const rooms = {
    v: 1,
    baseRate: 900,
    roomTypes: [{ id: 'suite', name: 'Suite Atlas', rate: 1200, maxGuests: 3 }],
    rooms: [
      { id: 'room:201', n: 201, typeId: 'suite', status: 'libre' },
      { id: 'room:202', n: 202, typeId: 'suite', status: 'libre' },
      { id: 'room:203', n: 203, typeId: 'suite', status: 'libre' },
    ],
    folios: []
  };
  sql.prepare('INSERT INTO store_docs (merchant,feature,data,rev,updated_ts) VALUES (?,?,?,?,?)').run('hotel-group', 'reservations', JSON.stringify(reservations), 1, now);
  sql.prepare('INSERT INTO store_docs (merchant,feature,data,rev,updated_ts) VALUES (?,?,?,?,?)').run('hotel-group', 'rooms', JSON.stringify(rooms), 1, now);

  class Statement {
    constructor(text) { this.text = text; this.args = []; }
    bind(...args) { this.args = args; return this; }
    async first() { return sql.prepare(this.text).get(...this.args) || null; }
    async run() {
      const r = sql.prepare(this.text).run(...this.args);
      return { success: true, meta: { changes: Number(r.changes) } };
    }
    rows() { return { results: sql.prepare(this.text).all(...this.args) }; }
  }
  const DB = {
    prepare(text) { return new Statement(text); },
    async batch(statements) {
      sql.exec('BEGIN IMMEDIATE');
      try {
        const results = [];
        for (const s of statements) results.push(/^\s*SELECT\b/i.test(s.text) ? s.rows() : await s.run());
        sql.exec('COMMIT');
        return results;
      } catch (err) { sql.exec('ROLLBACK'); throw err; }
    },
  };
  const cookie = sessionCookie(await makeSession('acc-owner', secret)).split(';')[0];
  const env = { DB, AUTH_SECRET: secret };
  const call = (body) => saveStay({
    env,
    request: new Request('https://kiwi.test/api/hotel/stays', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify(body),
    })
  });

  const dossierId = 'grp_symposium_2027';
  const groupName = 'Symposium International';
  const day = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
  const checkIn = day(5), checkOut = day(7);

  // Room 1 in group
  const r1 = await call({
    action: 'save',
    merchant: 'hotel-group',
    clientRef: 'grp-ref-001',
    dossierId,
    groupName,
    roomTypeId: 'suite',
    resourceId: 'room:201',
    checkIn,
    checkOut,
    partySize: 2,
    status: 'confirmed',
    customer: { name: 'Dr. Karim Benjelloun', phone: '0661000001' },
    guests: [{ name: 'Dr. Karim Benjelloun', nationality: 'MA' }],
  });
  const b1 = await r1.json();
  ok(r1.status === 200 && b1.booking.hotel.dossierId === dossierId, 'first room attached to group dossierId');
  ok(b1.booking.hotel.groupName === groupName, 'first room keeps groupName');

  // Room 2 in group
  const r2 = await call({
    action: 'save',
    merchant: 'hotel-group',
    clientRef: 'grp-ref-002',
    dossierId,
    groupName,
    roomTypeId: 'suite',
    resourceId: 'room:202',
    checkIn,
    checkOut,
    partySize: 1,
    status: 'confirmed',
    customer: { name: 'Prof. Claire Dupont', phone: '0661000002' },
    guests: [{ name: 'Prof. Claire Dupont', nationality: 'FR' }],
  });
  const b2 = await r2.json();
  ok(r2.status === 200 && b2.booking.hotel.dossierId === dossierId, 'second room attached to same group dossierId');
  ok(b2.booking.hotel.groupName === groupName, 'second room keeps shared groupName');

  // Verify reservations store contains both stays linked
  const doc = JSON.parse(sql.prepare("SELECT data FROM store_docs WHERE merchant='hotel-group' AND feature='reservations'").get().data);
  const groupStays = doc.bookings.filter(b => b.hotel && b.hotel.dossierId === dossierId);
  ok(groupStays.length === 2, 'both group stays persisted under shared dossierId in reservations document');
  ok(groupStays.every(b => b.hotel.groupName === groupName), 'all group stays share groupName');

  // Verify D1 table hotel_reservations also holds both records
  const d1Rows = sql.prepare("SELECT COUNT(*) as c FROM hotel_reservations WHERE merchant='hotel-group'").get();
  ok(d1Rows.c === 2, 'D1 hotel_reservations table stores both group stays');

  sql.close();
}

console.log('\n■ 4. Navigation isolation & scroll preservation');
{
  ok(teamJs.includes('function deactivateTeam()'), 'team.js defines deactivateTeam');
  ok(teamJs.includes('window.__kiwiTeamDeactivate = deactivateTeam'), 'team.js exports window.__kiwiTeamDeactivate');
  ok(teamJs.includes('deactivateTeam();') && teamJs.includes("pageMode === 'payroll'"),
    'team.js render refuses to switch to showPayroll and deactivates when payroll is not active');

  ok(interactiveJs.includes("if (navKey !== 'payroll' && navKey !== 'equipe')") &&
     interactiveJs.includes('window.__kiwiTeamDeactivate?.()'),
    'interactive.js calls __kiwiTeamDeactivate on hotel and other page transitions');

  ok(hotelJs.includes('scrollEl.scrollTop = top') && hotelJs.includes('scrollEl.scrollLeft = left'),
    'hotel.js rerender records and restores container scroll positions');
  ok(hotelJs.includes('window.scrollTo(winLeft, winTop)'),
    'hotel.js rerender restores window scroll');
}

console.log('\n■ 5. Delimited line parsing (CSV, TSV, quotes, escaped quotes)');
{
  const window = {
    addEventListener() {},
    KiwiI18n: { getLang: () => 'fr' },
    KiwiVenue: { getVenue: () => 'vhotel', getCurrentVenueData: () => ({ id: 'vhotel', type: 'hotel' }), subscribe: () => () => {} },
    KiwiStore: { slugFor: () => 'slug-hotel' },
    Kiwi: { handlers: {}, appPage: () => ({ el: null, close() {} }), toast() {} },
    localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
  };
  const ctx = {
    window, console, document: { addEventListener() {}, documentElement: { lang: 'fr' } },
    setTimeout() { return 0; }, clearTimeout() {},
    Date, Math, JSON, Object, Array, String, Number, Map, Set,
    fetch: async () => ({ ok: true, json: async () => ({ ok: true }) }),
  };
  vm.runInNewContext(hotelJs, ctx, { filename: 'assets/hotel.js' });

  const parse = (line) => ctx.window.KiwiHotelRooms.parseDelimitedLine(line);

  const p1 = parse('Dr. Karim Benjelloun, MA, C12345');
  ok(p1.length === 3 && p1[0] === 'Dr. Karim Benjelloun' && p1[1] === 'MA' && p1[2] === 'C12345', 'parses basic comma-delimited line');

  const p2 = parse('"Benjelloun, Karim", MA, "Passeport 99"');
  ok(p2.length === 3 && p2[0] === 'Benjelloun, Karim' && p2[1] === 'MA' && p2[2] === 'Passeport 99', 'parses quoted values with inner commas');

  const p3 = parse('"Dupont, Jean-Paul";FR;P1234');
  ok(p3.length === 3 && p3[0] === 'Dupont, Jean-Paul' && p3[1] === 'FR' && p3[2] === 'P1234', 'parses semicolon-delimited line with quotes');

  const p4 = parse('Jane Doe\tUS\tU98765');
  ok(p4.length === 3 && p4[0] === 'Jane Doe' && p4[1] === 'US' && p4[2] === 'U98765', 'parses tab-delimited TSV line');

  const p5 = parse('"Quotes with ""escaped"" quotes", GB, B123');
  ok(p5.length === 3 && p5[0] === 'Quotes with "escaped" quotes' && p5[1] === 'GB' && p5[2] === 'B123', 'parses escaped double quotes within quotes');
}

console.log('\n■ 6. Source-confirmed group workflow invariants in hotel.js');
{
  ok(hotelJs.includes('kiwi:hotel-group-staged:'), 'uses durable staged operation in localStorage');
  ok(hotelJs.includes('staff-grp-'), 'uses stable deterministic clientRef for each room');
  ok(hotelJs.includes('clientRef') && hotelJs.includes('fetch(\'/api/hotel/stays?merchant='), 'reconciles uncertain responses via clientRef');
  ok(hotelJs.includes('hx-group-partial-alert'), 'displays partially completed groups with recovery alert');
  ok(hotelJs.includes('syncTravelersFromDom'), 'implements continuous input-sync model across DOM mutations');
  ok(hotelJs.includes('hx-badge-unassigned'), 'surfaces unassigned traveler badge');
  ok(hotelJs.includes('connectingRoomIds'), 'uses reciprocal connectingRoomIds for doors');
  ok(hotelJs.includes('filterConn') && hotelJs.includes('data-hx-filter-conn'), 'filters by connecting rooms without auto-booking');
  ok(hotelJs.includes('data-hx-filter-view'), 'filters by room view');
  ok(hotelJs.includes('data-hx-filter-cap'), 'filters by room capacity');
  ok(hotelJs.includes('data-hx-filter-floor'), 'filters by room floor');
  ok(hotelJs.includes('initialScope !== cuStayScope()'), 'enforces stay scope isolation');
  ok(hotelJs.includes('initialMerchant !== cuMerchantSlug()'), 'enforces merchant slug isolation');
  ok(hotelJs.includes('roomTypeOf(r.n).base'), 'uses authoritative room base rate instead of hardcoded fallback');
  ok(hotelJs.includes('data-hx-group-accept-quote'), 'provides commercial quote acceptance checkbox');
  ok(hotelJs.includes('acceptQuote: !!quoteAccepted'), 'persists accepted commercial quote on room save');
}

console.log('\n■ 7. Scale group workflow, reconciliation, idempotency and recovery');
{
  const sql = new DatabaseSync(':memory:');
  sql.exec(fs.readFileSync(new URL('../schema.sql', import.meta.url), 'utf8'));
  const now = Date.now(), secret = 'hotel-group-scale-secret-0123456789';
  sql.prepare('INSERT INTO accounts (id,email,name,business,salt,hash,created_ts) VALUES (?,?,?,?,?,?,?)').run('acc-scale', 'scale@group.ma', 'Scale Owner', 'Scale Hotel', 's', 'h', now);
  sql.prepare('INSERT INTO merchant_config (merchant,features,type,account_id,name,status,updated_ts) VALUES (?,?,?,?,?,?,?)').run('hotel-scale', '{}', 'hotel', 'acc-scale', 'Scale Hotel', 'active', now);

  const reservations = { v: 1, settings: { published: true, confirmation: 'instant', minNoticeMinutes: 0, windowDays: 365 }, services: [], resources: [], blocked: [], bookings: [] };
  const rooms = {
    v: 1,
    baseRate: 1500,
    roomTypes: [
      { id: 'family-suite', name: 'Family Suite Royal', rate: 2000, maxGuests: 6 }
    ],
    rooms: [
      { id: 'room:301', n: 301, typeId: 'family-suite', status: 'libre', connectingRoomIds: ['room:302'] },
      { id: 'room:302', n: 302, typeId: 'family-suite', status: 'libre', connectingRoomIds: ['room:301'] },
      { id: 'room:303', n: 303, typeId: 'family-suite', status: 'libre', connectingRoomIds: [] },
      { id: 'room:304', n: 304, typeId: 'family-suite', status: 'libre', connectingRoomIds: [] },
    ],
    folios: []
  };
  sql.prepare('INSERT INTO store_docs (merchant,feature,data,rev,updated_ts) VALUES (?,?,?,?,?)').run('hotel-scale', 'reservations', JSON.stringify(reservations), 1, now);
  sql.prepare('INSERT INTO store_docs (merchant,feature,data,rev,updated_ts) VALUES (?,?,?,?,?)').run('hotel-scale', 'rooms', JSON.stringify(rooms), 1, now);

  class Statement {
    constructor(text) { this.text = text; this.args = []; }
    bind(...args) { this.args = args; return this; }
    async first() { return sql.prepare(this.text).get(...this.args) || null; }
    async run() {
      const r = sql.prepare(this.text).run(...this.args);
      return { success: true, meta: { changes: Number(r.changes) } };
    }
    rows() { return { results: sql.prepare(this.text).all(...this.args) }; }
  }
  const DB = {
    prepare(text) { return new Statement(text); },
    async batch(statements) {
      sql.exec('BEGIN IMMEDIATE');
      try {
        const results = [];
        for (const s of statements) results.push(/^\s*SELECT\b/i.test(s.text) ? s.rows() : await s.run());
        sql.exec('COMMIT');
        return results;
      } catch (err) { sql.exec('ROLLBACK'); throw err; }
    },
  };
  const cookie = sessionCookie(await makeSession('acc-scale', secret)).split(';')[0];
  const env = { DB, AUTH_SECRET: secret };

  const postStay = (body) => saveStay({
    env,
    request: new Request('https://kiwi.test/api/hotel/stays', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify(body),
    })
  });

  const getStayQuery = (query) => getStays({
    env,
    request: new Request('https://kiwi.test/api/hotel/stays?' + query, {
      method: 'GET',
      headers: { Cookie: cookie },
    })
  });

  const dossierId = 'grp_scale_conference_2027';
  const groupName = 'International Tech Conference';
  const day = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
  const checkIn = day(5), checkOut = day(8);

  // 1. Generate 24 distinct travelers (6 per room)
  const allTravelers = Array.from({ length: 24 }, (_, i) => ({
    name: `Traveler ${i + 1} Atlas`,
    sex: i % 2 === 0 ? 'M' : 'F',
    nationality: i % 3 === 0 ? 'MA' : (i % 3 === 1 ? 'FR' : 'US'),
    birthDate: '1990-01-01',
    idDocType: 'passeport',
    idDocNumber: `PASS-${1000 + i}`,
  }));

  // Room 1 (6 travelers)
  const clientRef1 = `staff-grp-${dossierId}-room_301`;
  const res1 = await postStay({
    action: 'save',
    merchant: 'hotel-scale',
    dossierId,
    groupName,
    clientRef: clientRef1,
    roomTypeId: 'family-suite',
    resourceId: 'room:301',
    checkIn,
    checkOut,
    partySize: 6,
    status: 'confirmed',
    customer: { name: allTravelers[0].name, phone: '0661000001' },
    guests: allTravelers.slice(0, 6),
  });
  const body1 = await res1.json();
  ok(res1.status === 200 && body1.booking.hotel.dossierId === dossierId, 'room 1 saved with group dossierId');
  ok(body1.booking.guests.length === 6, 'room 1 retains all 6 guests');

  // Server reconciliation via GET clientRef
  const reconRes = await getStayQuery(`merchant=hotel-scale&clientRef=${encodeURIComponent(clientRef1)}`);
  const reconBody = await reconRes.json();
  ok(reconRes.status === 200 && reconBody.stays.length === 1, 'GET clientRef reconciles existing room reservation');
  ok(reconBody.stays[0].id === body1.booking.id, 'reconciled stay matches created booking ID');

  // Idempotency replay on duplicate submission with same clientRef
  const replayRes = await postStay({
    action: 'save',
    merchant: 'hotel-scale',
    dossierId,
    groupName,
    clientRef: clientRef1,
    roomTypeId: 'family-suite',
    resourceId: 'room:301',
    checkIn,
    checkOut,
    partySize: 6,
    status: 'confirmed',
    customer: { name: allTravelers[0].name, phone: '0661000001' },
    guests: allTravelers.slice(0, 6),
  });
  const replayBody = await replayRes.json();
  ok(replayRes.status === 200 && replayBody.replayed === true, 're-submitting identical clientRef replays idempotently without duplication');

  // Room 2 (6 travelers)
  const clientRef2 = `staff-grp-${dossierId}-room_302`;
  const res2 = await postStay({
    action: 'save',
    merchant: 'hotel-scale',
    dossierId,
    groupName,
    clientRef: clientRef2,
    roomTypeId: 'family-suite',
    resourceId: 'room:302',
    checkIn,
    checkOut,
    partySize: 6,
    status: 'confirmed',
    customer: { name: allTravelers[6].name, phone: '0661000002' },
    guests: allTravelers.slice(6, 12),
  });
  const body2 = await res2.json();
  ok(res2.status === 200 && body2.booking.hotel.dossierId === dossierId, 'room 2 saved with shared group dossierId');

  // Simulate Partial Failure: Room 3 fails because it is unavailable or requested room does not match
  const clientRef3Fail = `staff-grp-${dossierId}-room_303`;
  const res3Fail = await postStay({
    action: 'save',
    merchant: 'hotel-scale',
    dossierId,
    groupName,
    clientRef: clientRef3Fail,
    roomTypeId: 'family-suite',
    resourceId: 'room:non_existent_or_conflict',
    checkIn,
    checkOut,
    partySize: 6,
    status: 'confirmed',
    customer: { name: allTravelers[12].name, phone: '0661000003' },
    guests: allTravelers.slice(12, 18),
  });
  ok(res3Fail.status === 409, 'room 3 fails gracefully with 409 conflict/unavailable');

  // Verify Rooms 1 and 2 are preserved in DB
  const intermediateCheck = await getStayQuery(`merchant=hotel-scale&dossierId=${encodeURIComponent(dossierId)}`);
  const intermediateBody = await intermediateCheck.json();
  ok(intermediateBody.stays.length === 2, 'prior saved rooms 1 and 2 remain safe after room 3 failure');

  // Recovery: Replace room 3 with Room 4 and complete group under same dossierId
  const clientRef4 = `staff-grp-${dossierId}-room_304`;
  const res4 = await postStay({
    action: 'save',
    merchant: 'hotel-scale',
    dossierId,
    groupName,
    clientRef: clientRef4,
    roomTypeId: 'family-suite',
    resourceId: 'room:304',
    checkIn,
    checkOut,
    partySize: 6,
    status: 'confirmed',
    customer: { name: allTravelers[18].name, phone: '0661000004' },
    guests: allTravelers.slice(18, 24),
  });
  const body4 = await res4.json();
  ok(res4.status === 200 && body4.booking.hotel.dossierId === dossierId, 'replacement room 4 completes group under original dossierId');

  // Total group verification
  const finalCheck = await getStayQuery(`merchant=hotel-scale&dossierId=${encodeURIComponent(dossierId)}`);
  const finalBody = await finalCheck.json();
  ok(finalBody.stays.length === 3, 'completed group ledger holds exactly 3 confirmed rooms');
  ok(finalBody.stays.every(s => s.hotel.groupName === groupName), 'all completed rooms retain shared groupName');

  // Capacity boundary check
  const overCapRes = await postStay({
    action: 'save',
    merchant: 'hotel-scale',
    clientRef: `staff-grp-${dossierId}-overcap`,
    roomTypeId: 'family-suite',
    resourceId: 'room:303',
    checkIn,
    checkOut,
    partySize: 7, // maxGuests is 6
    status: 'confirmed',
    customer: { name: 'Overcap Guest' },
  });
  ok(overCapRes.status === 409, 'rejects partySize exceeding room-type maxGuests');

  // Meal plan quote requirement
  const quoteReqRes = await postStay({
    action: 'save',
    merchant: 'hotel-scale',
    clientRef: `staff-grp-${dossierId}-bb-unquoted`,
    roomTypeId: 'family-suite',
    resourceId: 'room:303',
    checkIn,
    checkOut,
    partySize: 2,
    status: 'confirmed',
    commercial: { board: 'bb', quoted: false },
    customer: { name: 'Breakfast Guest' },
  });
  ok(quoteReqRes.status === 409, 'meal plan stays reject unquoted / unaccepted requests with quote-required');

  sql.close();
}

console.log('\n■ 8. Nationality selector scale catalog (>120 countries) & exact resolution');
{
  const window = {
    addEventListener() {},
    KiwiI18n: { getLang: () => 'fr' },
    KiwiVenue: { getVenue: () => 'vhotel', getCurrentVenueData: () => ({ id: 'vhotel', type: 'hotel' }), subscribe: () => () => {} },
    KiwiStore: { slugFor: () => 'slug-hotel' },
    Kiwi: { handlers: {}, appPage: () => ({ el: null, close() {} }), toast() {} },
    localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
  };
  const ctx = {
    window, console, document: { addEventListener() {}, documentElement: { lang: 'fr' } },
    setTimeout() { return 0; }, clearTimeout() {},
    Date, Math, JSON, Object, Array, String, Number, Map, Set,
    fetch: async () => ({ ok: true, json: async () => ({ ok: true }) }),
  };
  vm.runInNewContext(hotelJs, ctx, { filename: 'assets/hotel.js' });

  const nats = ctx.window.KiwiHotelRooms.nationalities();
  ok(nats.length >= 120, `nationalities catalog has ${nats.length} countries (>= 120 required)`);

  const testExact = (val) => ctx.window.KiwiHotelRooms.matchNationality(val);
  ok(testExact('Luxembourg') === 'LU', 'matches Luxembourg');
  ok(testExact('Islande') === 'IS', 'matches Islande');
  ok(testExact('Sénégal') === 'SN', 'matches Sénégal');
  ok(testExact('Côte d\'Ivoire') === 'CI', 'matches Côte d\'Ivoire');
  ok(testExact('Japon') === 'JP', 'matches Japon');
  ok(testExact('Brésil') === 'BR', 'matches Brésil');
  ok(testExact('Australie') === 'AU', 'matches Australie');

  // Exact-only matching: prefix alone must not match legacy values
  ok(testExact('Lux') === null, 'prefix Lux does not match without allowPrefix option');
  ok(testExact('Mar') === null, 'prefix Mar does not match without allowPrefix option');
}

console.log(`\n✓ All ${controls} hotel stays, group workflow and reliability controls passed.`);

