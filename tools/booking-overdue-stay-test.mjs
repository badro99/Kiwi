#!/usr/bin/env node
/* B26 · An in-house guest past the departure date is still in the room until the
 * front desk checks them out. Public availability (GET /api/booking) and a public
 * booking (POST) used to count such rooms as free tomorrow night (yassine, rooms 206
 * and 303, 9 Nov 2026). Real booking.js on the real schema.sql (node:sqlite): an
 * overdue checked-in stay in D1 (101), in the reservations document (102) and on the
 * room plan (103) keeps its room for tonight and tomorrow night; 104 is free. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { onRequestGet, onRequestPost, onRequestDelete } from '../functions/api/booking.js';
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
    // Still marked occupied on the room plan, two nights after a one-night walk-in.
    { id: 'room:103', n: 103, typeId: 'type-atlas', status: 'occ', updatedAt: now - 3 * 86400000 },
    { id: 'room:104', n: 104, typeId: 'type-atlas', status: 'libre' },
  ],
  folios: [{ room: 103, nights: 1, lines: [] }],
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
const env = { DB };
resetTableStateCacheForTests();

const day = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
const headers = { 'Content-Type': 'application/json', 'CF-Connecting-IP': '203.0.113.9' };
const post = (b) => onRequestPost({ env, request: new Request('https://kiwi.test/api/booking', { method: 'POST', headers, body: JSON.stringify(b) }) });
const get = (q) => onRequestGet({ env, request: new Request('https://kiwi.test/api/booking?' + q, { headers }) });
const del = (b) => onRequestDelete({ env, request: new Request('https://kiwi.test/api/booking', { method: 'DELETE', headers, body: JSON.stringify(b) }) });
const storedDoc = () => JSON.parse(sql.prepare("SELECT data FROM store_docs WHERE merchant='riad-atlas' AND feature='reservations'").get().data);


const ms = (n, hh) => Date.parse(day(n) + 'T' + hh + ':00Z');
// 101 · in D1 only: checked in three days ago, due out yesterday, never checked out.
sql.prepare(`INSERT INTO hotel_reservations (merchant,id,code,room_id,room_type_id,start_at,end_at,check_in,check_out,status,channel,external_ref,customer_name,customer_phone,customer_email,party_size,rate,total,raw_json,created_ts,updated_ts)
  VALUES ('riad-atlas','bk-overdue-d1','H-OVERDUE1','room:101','type-atlas',?,?,?,?,'checked_in','direct','','Overdue Guest','','',2,850,1700,'{}',?,?)`)
  .run(ms(-3, '14:00'), ms(-1, '10:00'), day(-3), day(-1), now, now);
// 102 · in the reservations document only.
const d = storedDoc();
d.bookings.push({ id: 'bk-overdue-doc', code: 'H-OVERDUE2', resourceId: 'room:102', serviceId: 'type-atlas', status: 'checked_in', startAt: ms(-2, '14:00'), endAt: ms(-1, '10:00'), partySize: 1, customer: { name: 'Overdue Two' }, hotel: { checkIn: day(-2), checkOut: day(-1) } });
sql.prepare("UPDATE store_docs SET data=? WHERE merchant='riad-atlas' AND feature='reservations'").run(JSON.stringify(d));

const offered = async (from, to) => { const r = await get(`merchant=riad-atlas&checkIn=${day(from)}&checkOut=${day(to)}&guests=2`); assert.equal(r.status, 200, `${day(from)}→${day(to)}: ` + JSON.stringify(await r.clone().json())); const b = await r.json(); return (b.hotel?.categories || []).reduce((n, c) => n + (c.available ?? c.rooms ?? 0), 0); };
assert.equal(await offered(1, 2), 1, 'tomorrow night: only the empty room 104 is offered (101, 102, 103 still have their guests)');
assert.equal(await offered(6, 7), 4, 'a week out, the overdue hold no longer hides the rooms');
console.log('  ✓ availability keeps overdue in-house rooms through tomorrow night');

const book = (ref) => post({ merchant: 'riad-atlas', ref, roomTypeId: 'type-atlas', checkIn: day(1), checkOut: day(2), partySize: 2, customer: { name: 'Salma', phone: '0612345678', email: '' } });
let res = await book('overdue-ref-0001'), body = await res.json();
assert.equal(res.status, 200, JSON.stringify(body));
const room = sql.prepare("SELECT room_id FROM hotel_reservations WHERE merchant='riad-atlas' AND id=?").get(body.id)?.room_id || storedDoc().bookings.find((x) => x.id === body.id)?.resourceId;
assert.equal(room, 'room:104', 'the booking lands in the free room, never on an in-house guest');
res = await book('overdue-ref-0002');
assert.notEqual(res.status, 200, 'a second booking for tomorrow finds no room left');
console.log('  ✓ a public booking never takes the room of an overdue in-house guest');
console.log('✓ booking-overdue-stay: overdue checked-in stays (D1, document, room plan) keep their rooms for tonight and tomorrow');
