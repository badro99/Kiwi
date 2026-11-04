import assert from 'node:assert/strict';
import fs from 'node:fs';
import { onRequestGet, onRequestPost } from '../functions/api/booking.js';
import { sourceIdentity } from '../functions/api/_booking-source.js';

class Statement {
  constructor(db, sql) { this.db = db; this.sql = sql; this.args = []; }
  bind(...args) { this.args = args; return this; }
  async first() {
    if (this.sql.includes("sqlite_master") && this.db.type === 'hotel') return { name:'hotel_stay_events' };
    if (this.sql.includes('pair_attempts')) {
      const row = this.db.attempts && this.db.attempts.get(this.args[0]);
      return row ? { blocked_until: row.blocked_until } : null;
    }
    return null;
  }
  async run() {
    if (this.db.attempts && this.sql.startsWith('INSERT INTO pair_attempts')) {
      /* same arithmetic as limitFail's single upsert, for the stateful limiter case */
      const [k, now, , win, , , , , , max, until] = this.args;
      const row = this.db.attempts.get(k);
      if (!row || now - row.first_ts > win) this.db.attempts.set(k, { fails: 1, first_ts: now, blocked_until: null });
      else { row.fails++; if (row.fails >= max) row.blocked_until = until; }
      return { meta: { changes: 1 } };
    }
    if (this.db.attempts && this.sql.startsWith('DELETE FROM pair_attempts')) { this.db.attempts.delete(this.args[0]); return { meta: { changes: 1 } }; }
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
    if (this.sql.startsWith('INSERT INTO hotel_stay_events')) {
      this.db.events.push({ eventType:this.args[3], payload:this.args[4], cursor:this.args[6], actorId:this.args[8], actorRole:this.args[9] });
      return { meta:{ changes:1 } };
    }
    return { meta: { changes: 1 } };
  }
}
class MockDB {
  constructor(doc) { this.merchant = 'test-shop'; this.doc = doc; this.rev = 1; this.team = { members: [], shifts: {} }; this.hours = { week: {}, exceptions: [] }; this.type = 'boutique'; this.rooms = null; this.events = []; }
  prepare(sql) { return new Statement(this, sql); }
  async batch(statements) {
    if (statements?.length && !statements[0].sql.startsWith('SELECT data')) {
      const results=[]; for (const statement of statements) results.push(await statement.run()); return results;
    }
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

{ // Four lost write races in a row: the slot is still free, so the guest is told to retry, not that it is taken.
  const prepare = db.prepare.bind(db), rev0 = db.rev; let raced = 0;
  db.prepare = (sql) => { const s = prepare(sql); if (sql.startsWith('UPDATE store_docs')) { const run = s.run.bind(s); s.run = async () => { raced++; db.rev++; return run(); }; } return s; };
  try {
    const raceRes = await callPost({ merchant:'test-shop', ref:'public-ref-race', serviceId:'svc-cut', startAt:slot.startAt, partySize:1, customer:{ name:'Nora', phone:'+49 179 5241112', email:'' } });
    const raceBody = await raceRes.json();
    check(raced === 4 && raceRes.status === 503 && raceBody.error === 'busy' && raceBody.retryable === true && db.doc.bookings.length === 0,
      'losing every write race answers busy and retryable, never slot-unavailable for a free slot');
  } finally { db.prepare = prepare; db.rev = rev0; }
}
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
check(!('manageToken' in body), 'a reference replay never discloses the management bearer token');
response = await callPost({ ...request, startAt:slot.startAt + 3600000 }); body = await response.json();
check(response.status === 409 && body.error === 'reference-conflict',
  'a reused reference cannot substitute a different service time');
response = await callPost({ ...request, customer:{ name:'Someone else', phone:'+49 179 5249999', email:'' } }); body = await response.json();
check(response.status === 409 && body.error === 'reference-conflict' && !body.code && !body.manageToken,
  'a caller with another guest contact cannot read the existing booking by reference');

response = await callPost({ ...request, ref:'public-ref-0002' }); body = await response.json();
check(response.status === 409 && body.error === 'slot-unavailable', 'double booking the same capacity is rejected');

response = await callPost({ ...request, ref:'short', startAt:slot.startAt + 3600000 });
check(response.status === 400, 'weak idempotency references are rejected');
response = await callPost({ ...request, ref:'public-ref-0003', customer:{ name:'Nora', phone:'', email:'' } });
check(response.status === 400, 'public booking requires a contact method');

for (let i = 0; i < 4; i++) db.doc.bookings.push({ ...db.doc.bookings[0], id:`bk-extra-${i}`, publicRef:`extra-${i}`, startAt:slot.startAt+(i+2)*3600000, endAt:slot.endAt+(i+2)*3600000, createdAt:Date.now(), updatedAt:Date.now() });
response = await callPost({ ...request, ref:'public-ref-0004', startAt:slot.startAt + 8 * 3600000 }); body = await response.json();
check(response.status === 429 && body.error === 'booking-limit', 'one contact cannot flood a merchant diary');

{
  const key = (ip, extra = {}) => sourceIdentity(new Request('https://kiwi-os.com/', { headers: ip === null ? extra : { 'CF-Connecting-IP': ip, ...extra } }));
  check(key('2001:db8:1:2::5') && key('2001:db8:1:2::5') === key('2001:db8:1:2:ffff::9'), 'two IPv6 addresses of one /64 share a source key');
  check(key('2001:db8:1:3::5') !== key('2001:db8:1:2::5'), 'another /64 has another key');
  for (const bad of ['::ffff:1.2.3.4', '1:2:3', '1::2::3', 'gggg::1', '1:2:3:4:5:6:7:8:9', '12345::1', '203.0.113.8', '']) check(key(bad) === '', `"${bad}" gives no /64 key (raw address fallback)`);
  check(key(null, { 'X-Forwarded-For': '2001:db8:1:2::5' }) === '', 'X-Forwarded-For is never read');
}
/* r19 booking#A0: rotating phone numbers must not fill every slot. */
{
  const savedBookings = db.doc.bookings, savedMax = db.doc.resources[0].capacity;
  db.attempts = new Map();
  db.doc.bookings = []; db.doc.resources[0].capacity = 1;
  const squatSlots = [];
  for (let d = 1; d <= 6; d++) {
    const day = new Date(Date.now() + (3 + d) * 86400000).toISOString().slice(0, 10);
    const r = await (await callGet(`merchant=test-shop&service=svc-cut&date=${day}`)).json();
    for (const sl of r.slots.filter((_, k) => k % 2 === 0).slice(0, 3)) squatSlots.push(sl);
  }
  const outcomes = [];
  for (let i = 0; i < 14; i++) {
    const r = await callPost({ merchant: 'test-shop', ref: 'squat-ref-' + String(i).padStart(4, '0'), serviceId: 'svc-cut', startAt: squatSlots[i].startAt, partySize: 1,
      customer: { name: 'Squat ' + i, phone: '+49 179 52' + String(41000 + i), email: '' } });
    outcomes.push(r.status);
  }
  check(outcomes.slice(0, 10).every((x) => x === 200), 'ten bookings from one address in a quarter hour still go through');
  check(outcomes.slice(10).every((x) => x === 429), 'from the eleventh, rotating phone numbers from one address is refused');
  check(db.doc.bookings.length === 10, 'the refused attempts reserved no slot');
  const other = await onRequestPost({ request: new Request('https://kiwi-os.com/api/booking', { method: 'POST', headers: { ...headers, 'CF-Connecting-IP': '198.51.100.9' }, body: JSON.stringify({ merchant: 'test-shop', ref: 'honest-ref-0001', serviceId: 'svc-cut', startAt: squatSlots[10].startAt, partySize: 1, customer: { name: 'Honest', phone: '+49 179 5277777', email: '' } }) }), env });
  check(other.status === 200, 'a guest on another address is not affected by the squatter block');
  /* the store-wide hourly cap holds even when every request comes from a new address */
  db.attempts = new Map(); db.doc.bookings = [];
  for (let i = 0; i < 60; i++) db.doc.bookings.push({ id: 'bk-h-' + i, source: 'public', status: 'confirmed', createdAt: Date.now() - 1000, startAt: Date.now() + (40 + i) * 86400000, endAt: Date.now() + (40 + i) * 86400000 + 1800000, customer: { name: 'x', phone: '+4917900' + String(10000 + i), email: '' }, serviceId: 'svc-cut', resourceId: 'res-a', publicRef: 'h' + i });
  const wide = await onRequestPost({ request: new Request('https://kiwi-os.com/api/booking', { method: 'POST', headers: { ...headers, 'CF-Connecting-IP': '198.51.100.77' }, body: JSON.stringify({ merchant: 'test-shop', ref: 'wide-ref-000001', serviceId: 'svc-cut', startAt: squatSlots[11].startAt, partySize: 1, customer: { name: 'New', phone: '+49 179 5288888', email: '' } }) }), env });
  check(wide.status === 200 && (await wide.json()).status === 'requested' && db.doc.bookings.at(-1).status === 'requested', 'past sixty live public bookings an hour, a new booking is stored as requested, not refused and not auto-confirmed');
  for (const b of db.doc.bookings.slice(0, 60)) b.status = 'cancelled';
  db.attempts = new Map();
  const calm = await onRequestPost({ request: new Request('https://kiwi-os.com/api/booking', { method: 'POST', headers: { ...headers, 'CF-Connecting-IP': '198.51.100.78' }, body: JSON.stringify({ merchant: 'test-shop', ref: 'calm-ref-0000001', serviceId: 'svc-cut', startAt: squatSlots[12].startAt, partySize: 1, customer: { name: 'Calm', phone: '+49 179 5299999', email: '' } }) }), env });
  check(calm.status === 200 && (await calm.json()).status === 'confirmed', 'cancelled bookings do not count: the venue setting (instant) applies again');
  /* two IPv6 addresses of one /64 share one bucket */
  db.attempts = new Map(); db.doc.bookings = [];
  const six = [];
  for (let i = 0; i < 12; i++) {
    const ip = i % 2 ? '2001:db8:aa:bb::' + (i + 1) : '2001:db8:aa:bb:1234:5678:9abc:' + (i + 1);
    const r = await onRequestPost({ request: new Request('https://kiwi-os.com/api/booking', { method: 'POST', headers: { ...headers, 'CF-Connecting-IP': ip }, body: JSON.stringify({ merchant: 'test-shop', ref: 'v6-ref-' + String(i).padStart(8, '0'), serviceId: 'svc-cut', startAt: squatSlots[i].startAt, partySize: 1, customer: { name: 'V6 ' + i, phone: '+49 179 53' + String(10000 + i), email: '' } }) }), env });
    six.push(r.status);
  }
  check(six.slice(0, 10).every((x) => x === 200) && six.slice(10).every((x) => x === 429), 'addresses of one IPv6 /64 share the same creation bucket');
  db.attempts = null; db.doc.bookings = savedBookings; db.doc.resources[0].capacity = savedMax;
}

db.doc.settings.published = false;
response = await callGet('merchant=test-shop');
check(response.status === 404, 'unpublished booking pages are not discoverable');

db.type = 'hotel'; db.rev = 1;
db.doc = { ...doc, settings:{ ...doc.settings, published:true, confirmation:'instant' }, services:[], resources:[], blocked:[], bookings:[] };
db.rooms = {
  v:4, baseRate:700,
  roomTypes:[
    { id:'type-atlas', name:'Chambre Atlas', rate:850, description:'Calme et lumineuse', maxGuests:2, beds:'1 grand lit', sizeM2:24, view:'Patio', amenities:['Wi-Fi','Climatisation'], photos:[{url:'/api/media/riad-test/atlas-cover-01.jpg',alt:'Chambre Atlas sur patio'},{url:'https://tracker.invalid/pixel.jpg',alt:'bad'}], public:true },
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
check(atlas.photos.length===1&&atlas.photos[0].url==='/api/media/riad-test/atlas-cover-01.jpg', 'public room gallery exposes only bounded same-origin media references');
check(atlas.available===2, 'an in-house multi-night stay is excluded without leaking its room number');
check(!body.hotel.categories.some((x)=>x.id==='type-hidden'), 'private room categories never appear publicly');
response = await callGet(`merchant=test-shop&checkIn=${hotelIn}&checkOut=${hotelOut}&guests=3`); body = await response.json();
check(body.hotel.categories.length===1 && body.hotel.categories[0].id==='type-family', 'guest count excludes categories that cannot accommodate the party');
const hotelRequest={merchant:'test-shop',ref:'hotel-public-ref-0001',roomTypeId:'type-atlas',checkIn:hotelIn,checkOut:hotelOut,partySize:2,expectedTotal:1700,customer:{name:'Salma',phone:'0612345678',email:''}};
db.rooms.roomTypes[0].rate=900;
response=await callPost(hotelRequest);body=await response.json();
check(response.status===409&&body.error==='rate-changed'&&body.total===1800&&db.doc.bookings.length===0,
  'a changed hotel rate refuses booking until the guest reviews the new total');
db.rooms.roomTypes[0].rate=850;
response=await callPost(hotelRequest);body=await response.json();
check(response.status===200&&body.code.startsWith('H-')&&body.total===1700, 'hotel stay commits with a hotel reference and server-calculated total');
check(db.doc.bookings[0].hotel.nights===2&&db.doc.bookings[0].resourceId==='room:101', 'booking stores the stay snapshot and assigns one hidden room atomically');
check(db.events.length===1&&db.events[0].eventType==='created'&&db.events[0].actorRole==='public','public hotel booking appends one server-attributed shadow event');
check(!db.events[0].payload.includes('Salma')&&!db.events[0].payload.includes('0612345678'),'public shadow event excludes customer name and contact PII');
response=await callPost(hotelRequest);body=await response.json();
check(response.status===200&&body.replayed===true&&db.doc.bookings.length===1, 'hotel submission retry is idempotent');
check(!('manageToken' in body), 'hotel replay does not leak the unused management bearer token');
check(body.total===1700, 'hotel retry confirms the committed amount, never a now-stale browser amount');
response=await callPost({...hotelRequest,checkOut:new Date(Date.now()+8*86400000).toISOString().slice(0,10)});body=await response.json();
check(response.status===409&&body.error==='reference-conflict', 'hotel replay cannot silently substitute different dates');
response=await callPost({...hotelRequest,customer:{name:'Unknown',phone:'0699999999',email:''}});body=await response.json();
check(response.status===409&&body.error==='reference-conflict'&&!body.manageToken,
  'another hotel guest cannot replay a public reference to recover booking details');
check(db.events.length===1,'public booking replay does not duplicate the shadow event');
response=await callPost({...hotelRequest,ref:'hotel-public-ref-0002',customer:{name:'Yasmine',phone:'0623456789',email:''}});
check(response.status===200&&db.doc.bookings.length===2, 'a simultaneous stay consumes the next room in the category');
response=await callPost({...hotelRequest,ref:'hotel-public-ref-0003',customer:{name:'Imane',phone:'0634567890',email:''}});body=await response.json();
check(response.status===409&&body.error==='room-unavailable', 'the category sells out after its final room and cannot oversell');

const middleware = fs.readFileSync(new URL('../functions/_middleware.js', import.meta.url), 'utf8');
check(middleware.includes("path === '/booking.html'") && middleware.includes("path === '/booking'"), 'public booking page is explicitly allowlisted');
check(middleware.includes("isRead &&") && middleware.includes("path === '/api/booking'"), 'public availability read is explicitly allowlisted');
check(middleware.includes("method === 'POST' && path === '/api/booking'"), 'public booking write is explicitly allowlisted');

console.log(`booking-api-test: ${controls} controls passed`);
