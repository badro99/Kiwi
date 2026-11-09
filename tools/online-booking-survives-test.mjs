#!/usr/bin/env node
/* B23 follow-up (9 Nov 2026) · « a new online booking is dropped from the reservations
 * document ~30 s after it is made ». H-699E42F4 (24→25 Nov, booked 9 Nov) was never in
 * the document: the booking's own write prunes stays beyond +14 days, by design, and it
 * lives in hotel_reservations (D1), which is why /api/booking kept the room and the
 * manage link found it. This suite pins both halves on the real handlers (node:sqlite):
 *  · an online booking inside the window survives a dashboard push of an older copy
 *    that never saw it (/api/store keeps current and future « public » bookings);
 *  · one beyond the window is not in the document but the front desk reads it from
 *    /api/hotel/stays?updatedSince=…, which is what assets/hotel-live.js announces from. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { onRequestGet, onRequestPost, onRequestDelete } from '../functions/api/booking.js';
import { onRequestPost as storePost } from '../functions/api/store.js';
import { onRequestGet as staysGet } from '../functions/api/hotel/stays.js';
import { makeSession, SESS_COOKIE } from '../functions/auth/_lib.js';
import { resetTableStateCacheForTests } from '../functions/api/hotel/_stay-events.js';

const sql = new DatabaseSync(':memory:');
sql.exec(fs.readFileSync(new URL('../schema.sql', import.meta.url), 'utf8'));
const now = Date.now();
sql.prepare('INSERT INTO accounts (id,email,name,business,salt,hash,created_ts) VALUES (?,?,?,?,?,?,?)')
  .run('acc-atlas', 'owner@atlas.ma', 'Owner', 'Riad Atlas', 's', 'h', now);
sql.prepare('INSERT INTO merchant_config (merchant,features,type,account_id,name,status,updated_ts) VALUES (?,?,?,?,?,?,?)')
  .run('riad-atlas', '{}', 'hotel', 'acc-atlas', 'Riad Atlas', 'active', now);
const doc = {
  v: 1,
  settings: { published: true, confirmation: 'instant', minNoticeMinutes: 0, windowDays: 365, cancellationHours: 12, slotStep: 15, updatedAt: 1 },
  services: [], resources: [], blocked: [], bookings: [],
};
const rooms = {
  v: 4, baseRate: 700,
  roomTypes: [{ id: 'type-atlas', name: 'Chambre Atlas', rate: 850, maxGuests: 2, public: true }],
  rooms: [
    { id: 'room:101', n: 101, typeId: 'type-atlas', status: 'libre' },
    { id: 'room:102', n: 102, typeId: 'type-atlas', status: 'libre' },
  ],
  folios: [],
};
sql.prepare("INSERT INTO store_docs (merchant,feature,data,rev,updated_ts) VALUES (?,'reservations',?,1,?)").run('riad-atlas', JSON.stringify(doc), now);
sql.prepare("INSERT INTO store_docs (merchant,feature,data,rev,updated_ts) VALUES (?,'rooms',?,1,?)").run('riad-atlas', JSON.stringify(rooms), now);

class Statement {
  constructor(text) { this.text = text; this.args = []; }
  bind(...args) { this.args = args; return this; }
  async first() { return sql.prepare(this.text).get(...this.args) || null; }
  async run() { const r = sql.prepare(this.text).run(...this.args); return { success: true, meta: { changes: Number(r.changes) } }; }
  async all() { return { results: sql.prepare(this.text).all(...this.args) }; }
  rows() { return { results: sql.prepare(this.text).all(...this.args) }; }
}
const DB = {
  prepare: (text) => new Statement(text),
  async batch(statements) {
    if (!statements.some((s) => !/^\s*SELECT\b/i.test(s.text))) return statements.map((s) => s.rows());
    sql.exec('BEGIN IMMEDIATE');
    try {
      const out = [];
      for (const s of statements) out.push(/^\s*SELECT\b/i.test(s.text) ? s.rows() : await s.run());
      sql.exec('COMMIT');
      return out;
    } catch (err) { sql.exec('ROLLBACK'); throw err; }
  },
};
const env = { DB, AUTH_SECRET: 'online-booking-survives-secret' };
resetTableStateCacheForTests();

const day = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
const headers = { 'Content-Type': 'application/json', 'CF-Connecting-IP': '203.0.113.9' };
const post = (b) => onRequestPost({ env, request: new Request('https://kiwi.test/api/booking', { method: 'POST', headers, body: JSON.stringify(b) }) });
const get = (q) => onRequestGet({ env, request: new Request('https://kiwi.test/api/booking?' + q, { headers }) });
const del = (b) => onRequestDelete({ env, request: new Request('https://kiwi.test/api/booking', { method: 'DELETE', headers, body: JSON.stringify(b) }) });
const storedDoc = () => JSON.parse(sql.prepare("SELECT data FROM store_docs WHERE merchant='riad-atlas' AND feature='reservations'").get().data);


const cookie = `${SESS_COOKIE}=${await makeSession('acc-atlas', env.AUTH_SECRET)}`;
const asOwner = { 'Content-Type': 'application/json', Cookie: cookie };
const pushDoc = (data, baseRev) => storePost({ env, request: new Request('https://kiwi.test/api/store', { method: 'POST', headers: asOwner, body: JSON.stringify({ feature: 'reservations', merchant: 'riad-atlas', baseRev, data }) }) });
const docRow = () => sql.prepare("SELECT data, rev FROM store_docs WHERE merchant='riad-atlas' AND feature='reservations'").get();
const book = async (ref, from, to) => { const r = await post({ merchant: 'riad-atlas', ref, roomTypeId: 'type-atlas', checkIn: day(from), checkOut: day(to), partySize: 2, customer: { name: 'TEST KIWI', phone: '0600000032', email: '' } }); assert.equal(r.status, 200); return r.json(); };

const pageOpened = Date.now() - 1000;
const dashboardCopy = JSON.parse(docRow().data);              // the open dashboard's copy, before any booking
const near = await book('survive-near-0001', 5, 6);
assert.ok(JSON.parse(docRow().data).bookings.some((b) => b.id === near.id), 'an online booking within 14 days is in the document');
const pushed = await pushDoc({ ...dashboardCopy, settings: { ...dashboardCopy.settings, updatedAt: 2 } }, docRow().rev);
assert.equal(pushed.status, 200, 'the dashboard push lands');
assert.ok(JSON.parse(docRow().data).bookings.some((b) => b.id === near.id), 'a push from a copy that never saw the online booking does not erase it');
console.log('  ✓ an online booking survives a dashboard push that never saw it');

const far = await book('survive-far-0001', 20, 21);
assert.ok(!JSON.parse(docRow().data).bookings.some((b) => b.id === far.id), 'beyond 14 days the stay lives only in hotel_reservations (by design)');
const res = await staysGet({ env, request: new Request(`https://kiwi.test/api/hotel/stays?merchant=riad-atlas&includeCancelled=1&updatedSince=${pageOpened}`, { headers: { Cookie: cookie } }) });
assert.equal(res.status, 200);
const stays = (await res.json()).stays;
assert.ok(stays.some((s) => s.id === far.id && s.source === 'public' && s.code === far.code && s.hotel.checkIn === day(20)), 'the front desk reads the far-out online booking from D1');
assert.ok(stays.every((s) => +s.updatedAt >= pageOpened || s.id === near.id || s.id === far.id), 'only what changed since the given time');
const none = await staysGet({ env, request: new Request(`https://kiwi.test/api/hotel/stays?merchant=riad-atlas&includeCancelled=1&updatedSince=${Date.now() + 60000}`, { headers: { Cookie: cookie } }) });
assert.equal((await none.json()).stays.length, 0, 'nothing changed since a later time');
console.log('  ✓ a booking beyond the document window is readable by « updatedSince »');
console.log('✓ online-booking-survives: online bookings survive dashboard pushes, and far-out ones reach the front desk from D1');
