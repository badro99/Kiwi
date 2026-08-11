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
  constructor(doc) { this.merchant = 'test-shop'; this.doc = doc; this.rev = 1; }
  prepare(sql) { return new Statement(this, sql); }
  async batch() {
    return [
      { results: [{ data: JSON.stringify(this.doc), rev: this.rev }] },
      { results: [{ data: JSON.stringify({ week: {}, exceptions: [] }) }] },
      { results: [{ name: 'Test Shop', type: 'boutique' }] },
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

response = await callGet(`merchant=test-shop&service=svc-cut&date=${date}&partySize=2`);
body = await response.json();
check(response.status === 200 && body.slots.length === 0, 'availability excludes resources that are too small for the party');
db.doc.resources[0].capacity = 4;
response = await callGet(`merchant=test-shop&service=svc-cut&date=${date}&partySize=4`);
body = await response.json();
check(response.status === 200 && body.slots.length > 0, 'availability keeps resources large enough for the party');

const request = { merchant:'test-shop', ref:'public-ref-0001', serviceId:'svc-cut', startAt:slot.startAt, partySize:4, customer:{ name:'Nora', phone:'0612345678', email:'' } };
response = await callPost(request); body = await response.json();
check(response.status === 200 && body.ok && body.status === 'confirmed', 'valid public booking is committed');
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

const middleware = fs.readFileSync(new URL('../functions/_middleware.js', import.meta.url), 'utf8');
check(middleware.includes("path === '/booking.html'") && middleware.includes("path === '/booking'"), 'public booking page is explicitly allowlisted');
check(middleware.includes("isRead &&") && middleware.includes("path === '/api/booking'"), 'public availability read is explicitly allowlisted');
check(middleware.includes("method === 'POST' && path === '/api/booking'"), 'public booking write is explicitly allowlisted');

console.log(`booking-api-test: ${controls} controls passed`);
