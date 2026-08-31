import assert from 'node:assert/strict';
import fs from 'node:fs';
import { onRequestGet, onRequestPost } from '../functions/api/booking.js';

class Statement {
  constructor(db, sql) { this.db = db; this.sql = sql; this.args = []; }
  bind(...args) { this.args = args; return this; }
  async first() {
    if (this.sql.includes('pair_attempts')) return null;
    return null;
  }
  async run() {
    if (this.sql.startsWith('UPDATE store_docs')) {
      const [data, rev, updated, merchant, expected] = this.args;
      if (merchant !== this.db.merchant || expected !== this.db.rev) return { meta: { changes: 0 } };
      this.db.doc = JSON.parse(data); this.db.rev = rev; this.db.updated = updated;
      return { meta: { changes: 1 } };
    }
    if (this.sql.startsWith('INSERT OR IGNORE INTO store_docs')) {
      if (this.db.rev) return { meta: { changes: 0 } };
      this.db.doc = JSON.parse(this.args[1]); this.db.rev = 1;
      return { meta: { changes: 1 } };
    }
    return { meta: { changes: 1 } };
  }
}
class MockDB {
  constructor(doc) { this.merchant = 'test-shop'; this.doc = doc; this.rev = 1; this.team = { members: [], shifts: {} }; this.hours = { week: {}, exceptions: [] }; this.type = 'boutique'; this.rooms = null; }
  prepare(sql) { return new Statement(this, sql); }
  async batch() {
    return [
      { results: [{ data: JSON.stringify(this.doc), rev: this.rev }] },
      { results: [{ data: JSON.stringify(this.hours) }] },
      { results: [{ name: 'Test Shop', type: this.type }] },
      { results: [{ data: JSON.stringify(this.team) }] },
      { results: this.rooms ? [{ data: JSON.stringify(this.rooms) }] : [] },
    ];
  }
}

const days = ['sun','mon','tue','wed','thu','fri','sat'];
const week = Object.fromEntries(days.map((d) => [d, { open: true, periods: [{ from: '09:00', to: '18:00' }] }]));
const doc = {
  v: 1,
  settings: { published: true, confirmation: 'instant', minNoticeMinutes: 0, windowDays: 365, cancellationHours: 12, slotStep: 15, updatedAt: 1 },
  services: [{ id: 'svc-cut', name: 'Coupe', duration: 30, price: 80, deposit: 20, capacity: 1, resourceIds: ['res-a'], active: true, updatedAt: 1 }],
  resources: [{ id: 'res-a', name: 'Amal', kind: 'person', capacity: 1, active: true, week, updatedAt: 1 }],
  blocked: [], bookings: [],
};
const db = new MockDB(doc), env = { DB: db };
const headers = { 'CF-Connecting-IP': '203.0.113.8', 'Content-Type': 'application/json' };
let controls = 0;
const check = (value, message) => { assert.ok(value, message); controls += 1; };
const callGet = (query) => onRequestGet({ request: new Request(`https://kiwi-os.com/api/booking?${query}`), env });
const callPost = (body) => onRequestPost({ request: new Request('https://kiwi-os.com/api/booking', { method: 'POST', headers, body: JSON.stringify(body) }), env });

let response = await callGet('merchant=bad!');
check(response.status === 400, 'invalid merchant identifiers are rejected');
response = await callGet('merchant=test-shop');
let body = await response.json();
check(response.status === 200 && body.name === 'Test Shop', 'public configuration is available when published');
check(!('bookings' in body), 'public configuration never exposes booking records');
check(!('resources' in body), 'public configuration does not expose staff or room names');
check(!JSON.stringify(body).includes('customer'), 'public configuration never exposes customer fields');

const date = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);
response = await callGet(`merchant=test-shop&service=svc-cut&date=${date}`);
body = await response.json();
check(response.status === 200 && body.slots.length > 0, 'availability is calculated from real resources and hours');
const slot = body.slots[Math.floor(body.slots.length / 2)];
check(slot.resourceIds.length === 1 && slot.endAt > slot.startAt, 'slot contains assignable capacity and duration');
const ownWeek = db.doc.resources[0].week;
db.doc.resources[0].week = null; db.hours = { week, exceptions:[] };
response = await callGet(`merchant=test-shop&service=svc-cut&date=${date}`); body = await response.json();
check(response.status === 200 && body.slots.length > 0, 'template tables inherit the venue opening hours automatically');
db.doc.resources[0].week = ownWeek; db.hours = { week:{}, exceptions:[] };

response = await callGet(`merchant=test-shop&service=svc-cut&date=${date}&partySize=2`);
body = await response.json();
check(response.status === 200 && body.slots.length === 0, 'availability excludes resources that are too small for the party');
db.doc.resources[0].capacity = 4;
response = await callGet(`merchant=test-shop&service=svc-cut&date=${date}&partySize=4`);
body = await response.json();
check(response.status === 200 && body.slots.length > 0, 'availability keeps resources large enough for the party');

db.doc.settings.staffingEnabled = true;
db.doc.settings.tablesPerStaff = 1;
db.team = { members: [{ id:'staff-1', role:'serveur', function:'Serveur' }], shifts: { 'staff-1': { [date]: { off:true } } } };
response = await callGet(`merchant=test-shop&service=svc-cut&date=${date}&partySize=4`); body = await response.json();
check(response.status === 200 && body.slots.length === 0, 'a configured day with no floor staff exposes no public slots');
db.team.shifts['staff-1'][date] = { start:'09:00', end:'18:00' };
response = await callGet(`merchant=test-shop&service=svc-cut&date=${date}&partySize=4`); body = await response.json();
check(response.status === 200 && body.slots.length > 0, 'a scheduled floor shift restores covered slots');
db.doc.settings.staffingEnabled = false;

const request = { merchant:'test-shop', ref:'public-ref-0001', serviceId:'svc-cut', startAt:slot.startAt, partySize:4, customer:{ name:'Nora', phone:'+49 179 5241112', email:'' } };
response = await callPost({ ...request, ref:'public-ref-invalid-phone', customer:{ name:'Nora', phone:'49 179 5241112', email:'' } });
check(response.status === 400, 'ambiguous foreign numbers without a country-code prefix are rejected');
response = await callPost(request); body = await response.json();
check(response.status === 200 && body.ok && body.status === 'confirmed', 'international public booking is committed');
check(db.doc.bookings[0].customer.phone === '+491795241112', 'international customer number is stored canonically');
check(/^R-[A-Z0-9]{8}$/.test(body.code), 'booking receives a customer-safe reference');
check(typeof body.manageToken === 'string' && body.manageToken.length >= 24, 'booking receives an unguessable management token');
check(db.doc.bookings.length === 1 && db.rev === 2, 'booking and document revision commit atomically');

response = await callPost(request); body = await response.json();
check(response.status === 200 && body.replayed === true, 'same public reference is idempotent');
check(db.doc.bookings.length === 1, 'idempotent replay does not duplicate the booking');

response = await callPost({ ...request, ref:'public-ref-0002' }); body = await response.json();
check(response.status === 409 && body.error === 'slot-unavailable', 'double booking the same capacity is rejected');

response = await callPost({ ...request, ref:'short', startAt:slot.startAt + 3600000 });
check(response.status === 400, 'weak idempotency references are rejected');
response = await callPost({ ...request, ref:'public-ref-0003', customer:{ name:'Nora', phone:'', email:'' } });
check(response.status === 400, 'public booking requires a contact method');

for (let i = 0; i < 4; i++) db.doc.bookings.push({ ...db.doc.bookings[0], id:`bk-extra-${i}`, publicRef:`extra-${i}`, startAt:slot.startAt+(i+2)*3600000, endAt:slot.endAt+(i+2)*3600000, createdAt:Date.now(), updatedAt:Date.now() });
response = await callPost({ ...request, ref:'public-ref-0004', startAt:slot.startAt + 8 * 3600000 }); body = await response.json();
check(response.status === 429 && body.error === 'booking-limit', 'one contact cannot flood a merchant diary');

db.doc.settings.published = false;
response = await callGet('merchant=test-shop');
check(response.status === 404, 'unpublished booking pages are not discoverable');

db.type = 'hotel'; db.rev = 1;
db.doc = { ...doc, settings:{ ...doc.settings, published:true, confirmation:'instant' }, services:[], resources:[], blocked:[], bookings:[] };
db.rooms = {
  v:4, baseRate:700,
  roomTypes:[
    { id:'type-atlas', name:'Chambre Atlas', rate:850, description:'Calme et lumineuse', maxGuests:2, beds:'1 grand lit', sizeM2:24, view:'Patio', amenities:['Wi-Fi','Climatisation'], public:true },
    { id:'type-family', name:'Suite famille', rate:1200, description:'Pour les familles', maxGuests:4, beds:'1 grand lit + 2 lits', sizeM2:42, view:'Médina', amenities:['Wi-Fi'], public:true },
    { id:'type-hidden', name:'Interne', rate:300, maxGuests:2, public:false },
  ],
  rooms:[
    { id:'room:101', n:101, typeId:'type-atlas', status:'libre' },
    { id:'room:102', n:102, typeId:'type-atlas', status:'libre' },
    { id:'room:103', n:103, typeId:'type-atlas', status:'occ', updatedAt:Date.now() },
    { id:'room:201', n:201, typeId:'type-family', status:'libre' },
    { id:'room:999', n:999, typeId:'type-hidden', status:'libre' },
  ], folios:[{room:103,nights:10,updatedAt:Date.now()+3600000}],
};
const hotelIn = new Date(Date.now()+5*86400000).toISOString().slice(0,10);
const hotelOut = new Date(Date.now()+7*86400000).toISOString().slice(0,10);
response = await callGet('merchant=test-shop'); body = await response.json();
check(response.status===200 && body.kind==='hotel' && body.hotel.categories.length===2, 'hotel merchants receive a room-category flow instead of appointment services');
check(!JSON.stringify(body).includes('101') && !JSON.stringify(body).includes('room:'), 'public hotel configuration never exposes room numbers or internal room identifiers');
response = await callGet(`merchant=test-shop&checkIn=${hotelIn}&checkOut=${hotelOut}&guests=2`); body = await response.json();
const atlas = body.hotel.categories.find((x)=>x.id==='type-atlas');
check(atlas.total===1700 && atlas.view==='Patio', 'whole-stay search returns the server-calculated total and guest-facing details');
check(atlas.available===2, 'an in-house multi-night stay is excluded without leaking its room number');
check(!body.hotel.categories.some((x)=>x.id==='type-hidden'), 'private room categories never appear publicly');
response = await callGet(`merchant=test-shop&checkIn=${hotelIn}&checkOut=${hotelOut}&guests=3`); body = await response.json();
check(body.hotel.categories.length===1 && body.hotel.categories[0].id==='type-family', 'guest count excludes categories that cannot accommodate the party');
const hotelRequest={merchant:'test-shop',ref:'hotel-public-ref-0001',roomTypeId:'type-atlas',checkIn:hotelIn,checkOut:hotelOut,partySize:2,customer:{name:'Salma',phone:'0612345678',email:''}};
response=await callPost(hotelRequest);body=await response.json();
check(response.status===200&&body.code.startsWith('H-')&&body.total===1700, 'hotel stay commits with a hotel reference and server-calculated total');
check(db.doc.bookings[0].hotel.nights===2&&db.doc.bookings[0].resourceId==='room:101', 'booking stores the stay snapshot and assigns one hidden room atomically');
response=await callPost(hotelRequest);body=await response.json();
check(response.status===200&&body.replayed===true&&db.doc.bookings.length===1, 'hotel submission retry is idempotent');
response=await callPost({...hotelRequest,ref:'hotel-public-ref-0002',customer:{name:'Yasmine',phone:'0623456789',email:''}});
check(response.status===200&&db.doc.bookings.length===2, 'a simultaneous stay consumes the next room in the category');
response=await callPost({...hotelRequest,ref:'hotel-public-ref-0003',customer:{name:'Imane',phone:'0634567890',email:''}});body=await response.json();
check(response.status===409&&body.error==='room-unavailable', 'the category sells out after its final room and cannot oversell');

const middleware = fs.readFileSync(new URL('../functions/_middleware.js', import.meta.url), 'utf8');
check(middleware.includes("path === '/booking.html'") && middleware.includes("path === '/booking'"), 'public booking page is explicitly allowlisted');
check(middleware.includes("isRead &&") && middleware.includes("path === '/api/booking'"), 'public availability read is explicitly allowlisted');
check(middleware.includes("method === 'POST' && path === '/api/booking'"), 'public booking write is explicitly allowlisted');

console.log(`booking-api-test: ${controls} controls passed`);
