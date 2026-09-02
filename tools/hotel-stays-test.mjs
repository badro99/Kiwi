#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { makeSession, sessionCookie } from '../functions/auth/_lib.js';
import { onRequestPost } from '../functions/api/hotel/stays.js';

const sql = new DatabaseSync(':memory:');
sql.exec(fs.readFileSync(new URL('../schema.sql', import.meta.url), 'utf8'));
const now = Date.now(), secret = 'hotel-stays-test-secret-0123456789';
sql.prepare('INSERT INTO accounts (id,email,name,business,salt,hash,created_ts) VALUES (?,?,?,?,?,?,?)').run('acc-hotel', 'owner@test.ma', 'Owner', 'Riad Test', 's', 'h', now);
sql.prepare('INSERT INTO merchant_config (merchant,features,type,account_id,name,status,updated_ts) VALUES (?,?,?,?,?,?,?)').run('riad-test', '{}', 'hotel', 'acc-hotel', 'Riad Test', 'active', now);
const reservations = { v:1, settings:{ published:true, confirmation:'instant', minNoticeMinutes:0, windowDays:365 }, services:[], resources:[], blocked:[], bookings:[] };
const rooms = { v:4, baseRate:700, roomTypes:[{id:'type-atlas',name:'Atlas',rate:850,maxGuests:2}], rooms:[{id:'room:101',n:101,typeId:'type-atlas',status:'libre'},{id:'room:102',n:102,typeId:'type-atlas',status:'libre'}], folios:[] };
sql.prepare('INSERT INTO store_docs (merchant,feature,data,rev,updated_ts) VALUES (?,?,?,?,?)').run('riad-test','reservations',JSON.stringify(reservations),1,now);
sql.prepare('INSERT INTO store_docs (merchant,feature,data,rev,updated_ts) VALUES (?,?,?,?,?)').run('riad-test','rooms',JSON.stringify(rooms),1,now);

let collideOnce = false, collisionRange = null;
class Statement {
  constructor(text) { this.text = text; this.args = []; }
  bind(...args) { this.args = args; return this; }
  async first() { return sql.prepare(this.text).get(...this.args) || null; }
  async run() {
    if (collideOnce && this.text.startsWith('UPDATE store_docs SET data')) {
      collideOnce = false;
      const row = sql.prepare("SELECT data,rev FROM store_docs WHERE merchant='riad-test' AND feature='reservations'").get();
      const doc = JSON.parse(row.data), stamp = Date.now();
      doc.bookings.push({ id:'bk-rival',code:'H-RIVAL001',customer:{name:'Concurrent OTA',phone:'',email:''},serviceId:'type-atlas',resourceId:'room:101',startAt:collisionRange.startAt,endAt:collisionRange.endAt,partySize:1,status:'confirmed',source:'import',note:'',manageToken:'',publicRef:'rival-ref-0001',hotel:{roomTypeName:'Atlas',checkIn:collisionRange.checkIn,checkOut:collisionRange.checkOut,nights:2,rate:850,total:1700,channel:'booking',externalRef:'OTA-RIVAL'},createdAt:stamp,updatedAt:stamp });
      sql.prepare("UPDATE store_docs SET data=?,rev=?,updated_ts=? WHERE merchant='riad-test' AND feature='reservations'").run(JSON.stringify(doc),row.rev+1,stamp);
    }
    const r = sql.prepare(this.text).run(...this.args); return { success:true, meta:{ changes:Number(r.changes) } };
  }
  rows() { return { results: sql.prepare(this.text).all(...this.args) }; }
}
const DB = {
  prepare(text) { return new Statement(text); },
  async batch(statements) {
    const results = [];
    for (const statement of statements) {
      results.push(/^\s*SELECT\b/i.test(statement.text) ? statement.rows() : await statement.run());
    }
    return results;
  },
};
const cookie = sessionCookie(await makeSession('acc-hotel', secret)).split(';')[0];
const env = { DB, AUTH_SECRET: secret };
const call = (body, withCookie = true) => onRequestPost({ env, request:new Request('https://kiwi.test/api/hotel/stays', { method:'POST', headers:{ 'Content-Type':'application/json', ...(withCookie ? { Cookie:cookie } : {}) }, body:JSON.stringify(body) }) });
const day = (n) => new Date(Date.now()+n*86400000).toISOString().slice(0,10);
const base = { action:'save', merchant:'riad-test', clientRef:'staff-ref-0001', roomTypeId:'type-atlas', checkIn:day(5), checkOut:day(7), partySize:2, channel:'booking', status:'confirmed', externalRef:'OTA-4219', actorId:'spoofed-client', actorRole:'admin', customer:{name:'Salma',phone:'0612345678',email:''}, guestSegments:[{guestId:'gst_test_0001',nationalityCountry:'MA',usualResidenceCountry:'MA',ageCategory:'adult'},{guestId:'gst_test_0002',nationalityCountry:'FR',usualResidenceCountry:'FR',ageCategory:'minor'}] };
let controls = 0;
function ok(value, label) { assert.ok(value, label); controls++; }

let response = await call(base, false);
ok(response.status === 401, 'anonymous callers cannot read or write the hotel diary');
response = await call({ ...base, merchant:'another-hotel' });
ok(response.status === 401, 'a signed-in owner cannot choose another tenant in the body');

response = await call(base); let body = await response.json();
ok(response.status === 200 && body.booking.resourceId === 'room:101', 'manual OTA stay is committed and assigned to a real room');
ok(body.booking.hotel.channel === 'booking' && body.booking.hotel.externalRef === 'OTA-4219', 'channel and OTA reference survive the server write');
ok(body.booking.hotel.guestSegments.length === 2 && body.booking.hotel.roomSegments[0].roomId === 'room:101', 'the operational stay keeps normalized guest and room segments');
const createdEvent = sql.prepare("SELECT event_type,payload_json,srv_cursor,actor_id,actor_role FROM hotel_stay_events WHERE merchant='riad-test' AND stay_id=?").get(body.booking.id);
const createdPayload = JSON.parse(createdEvent.payload_json);
ok(createdEvent.event_type === 'created' && createdEvent.srv_cursor === 2, 'the stay write atomically appends a cursor-ordered event');
ok(createdEvent.actor_id === 'acc-hotel' && createdEvent.actor_role === 'owner', 'audit identity comes from the signed session, never client actor fields');
ok(createdPayload.guestSegments.length === 2 && !createdEvent.payload_json.includes('Salma') && !createdEvent.payload_json.includes('0612345678'), 'the event ledger contains statistical segments and no customer PII');

response = await call({ ...base, clientRef:'staff-ref-0002', externalRef:'OTA-4220', customer:{name:'Yasmine'} }); body = await response.json();
ok(response.status === 200 && body.booking.resourceId === 'room:102', 'the next overlapping stay consumes the next room');
response = await call({ ...base, clientRef:'staff-ref-0003', externalRef:'OTA-4221', customer:{name:'Imane'} }); body = await response.json();
ok(response.status === 409 && body.error === 'room-unavailable', 'manual and OTA entry cannot oversell a sold-out category');

const first = JSON.parse(sql.prepare("SELECT data FROM store_docs WHERE merchant='riad-test' AND feature='reservations'").get().data).bookings.find((x) => x.publicRef === 'staff-ref-0001');
response = await call({ action:'cancel', merchant:'riad-test', id:first.id }); body = await response.json();
ok(response.status === 200 && body.booking.status === 'cancelled', 'cancellation persists as history instead of deleting the stay');
ok(sql.prepare("SELECT COUNT(*) AS n FROM hotel_stay_events WHERE merchant='riad-test' AND stay_id=?").get(first.id).n === 2, 'cancellation appends history instead of replacing the creation event');
response = await call({ ...base, clientRef:'staff-ref-0004', externalRef:'OTA-4222', customer:{name:'Nora'} }); body = await response.json();
ok(response.status === 200 && body.booking.resourceId === 'room:101', 'cancelled capacity becomes available again');

const concurrentIn = day(12), concurrentOut = day(14);
collisionRange = { checkIn:concurrentIn, checkOut:concurrentOut, startAt:Date.parse(concurrentIn+'T15:00:00Z'), endAt:Date.parse(concurrentOut+'T11:00:00Z') };
collideOnce = true;
response = await call({ ...base, clientRef:'staff-ref-0005', externalRef:'OTA-5000', checkIn:concurrentIn, checkOut:concurrentOut, customer:{name:'Concurrent direct'} }); body = await response.json();
ok(response.status === 200 && body.booking.resourceId === 'room:102', 'a revision collision re-reads the winner and assigns different remaining capacity');

response = await call({ ...base, clientRef:'staff-ref-0006', externalRef:'OTA-5000', checkIn:day(20), checkOut:day(22), customer:{name:'Duplicate ref'} }); body = await response.json();
ok(response.status === 409 && body.error === 'duplicate-reference', 'one OTA reference cannot create two stays');

const finalDoc = JSON.parse(sql.prepare("SELECT data FROM store_docs WHERE merchant='riad-test' AND feature='reservations'").get().data);
ok(finalDoc.bookings.some((x) => x.source === 'import') && finalDoc.bookings.some((x) => x.status === 'cancelled'), 'the shared reservations document holds OTA and lifecycle truth');
console.log(`hotel-stays-test: ${controls} controls passed`);
