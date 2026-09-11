#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { onRequestPost as roomsBulk } from '../functions/api/hotel/rooms-bulk.js';
import { onRequestPost as storePost } from '../functions/api/store.js';
import { makeSession, sessionCookie } from '../functions/auth/_lib.js';

const secret = 'hotel-room-bulk-test-secret';
const db = new DatabaseSync(':memory:');
db.exec(fs.readFileSync(new URL('../schema.sql', import.meta.url), 'utf8'));
const now = Date.now();
const prepare = (sql) => {
  let args = [];
  const statement = {
    bind(...values) { args = values; return statement; },
    first() { return db.prepare(sql).get(...args) || null; },
    all() { return { results: db.prepare(sql).all(...args) }; },
    run() { const result = db.prepare(sql).run(...args); return { meta: { changes: result.changes } }; },
  };
  return statement;
};
const DB = { prepare };
const env = { DB, AUTH_SECRET: secret };
const merchant = 'hotel-bulk-a';
const otherMerchant = 'hotel-bulk-b';
db.prepare('INSERT INTO accounts(id,email,name,business,salt,hash,created_ts,status,session_epoch) VALUES (?,?,?,?,?,?,?,?,?)')
  .run('hotel-account-a', 'owner@a.test', 'A Owner', 'Hotel Bulk A', 's', 'h', now, 'active', 0);
db.prepare('INSERT INTO accounts(id,email,name,business,salt,hash,created_ts,status,session_epoch) VALUES (?,?,?,?,?,?,?,?,?)')
  .run('hotel-account-b', 'owner@b.test', 'B Owner', 'Hotel Bulk B', 's', 'h', now, 'active', 0);
for (const [slug, account] of [[merchant, 'hotel-account-a'], [otherMerchant, 'hotel-account-b']]) {
  db.prepare('INSERT INTO merchant_config(merchant,features,type,account_id,updated_ts) VALUES (?,?,?,?,?)')
    .run(slug, '{}', 'hotel', account, now);
}
const roomDoc = {
  v: 4,
  rooms: [
    { id: 'room:101', n: 101, floorId: 'floor:1', typeId: 'type:room', view: 'courtyard', charMode: 'standard', characteristics: ['balcony'], updatedAt: 10, guest: { name: 'Keep me' }, connectingRoomIds: [] },
    { id: 'room:102', n: 102, floorId: 'floor:1', typeId: 'type:room', view: 'garden', charMode: 'standard', characteristics: [], updatedAt: 20, connectingRoomIds: [] },
    { id: 'room:103', n: 103, floorId: 'floor:1', typeId: 'type:room', view: 'garden', charMode: 'standard', characteristics: [], updatedAt: now + 300000, connectingRoomIds: [] },
  ],
  roomTypes: [{ id: 'type:room', name: 'Room' }],
  floors: [{ id: 'floor:1', name: 'First floor' }, { id: 'floor:2', name: 'Second floor' }],
  customCharacteristics: [{ id: 'custom-view' }],
  folios: [{ id: 'folio-101', room: 101, balance: 125 }],
  roomAudits: [{ id: 'legacy-audit', at: 1, actor: 'legacy-server', note: 'preserve' }],
};
db.prepare('INSERT INTO store_docs(merchant,feature,data,rev,updated_ts) VALUES (?,?,?,?,?)')
  .run(merchant, 'rooms', JSON.stringify(roomDoc), 1, now);

const ownerCookie = sessionCookie(await makeSession('hotel-account-a', secret));
const request = (body, cookie = ownerCookie) => new Request('https://kiwi.test/api/hotel/rooms-bulk', {
  method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
});
const storeRequest = (body, cookie = ownerCookie) => new Request('https://kiwi.test/api/store', {
  method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
});
const bodyOf = async (response) => response.json();
const target = (id, n, updatedAt) => ({ id, n, expectedUpdatedAt: updatedAt });
const base = {
  merchant, operationId: 'room-op-1', targets: [target('room:101', 101, 10)],
  // Shape emitted by the existing UI when only the floor changes.
  changes: { floorId: 'floor:2', typeId: null, view: null, charMode: 'none', characteristics: [] },
};

let response = await roomsBulk({ env, request: request(base) });
assert.equal(response.status, 200);
let result = await bodyOf(response);
assert.equal(result.ok, true);
assert.equal(result.operation.actor.id, 'account:hotel-account-a');
assert.equal(result.data.rooms[0].floorId, 'floor:2');
assert.equal(result.data.rooms[0].floor, 'Second floor');
assert.equal(result.data.rooms[0].view, 'courtyard');
assert.deepEqual(result.data.rooms[0].characteristics, ['balcony']);
assert.equal(result.data.rooms[0].charMode, 'standard');
assert.equal(result.data.rooms[0].guest.name, 'Keep me');
assert.equal(result.data.folios[0].balance, 125);
assert.equal(result.operation.targetSnapshots[0].before.floorId, 'floor:1');
assert.equal(result.operation.targetSnapshots[0].after.floor, 'Second floor');
console.log('✓ owner bulk update applies only allowed room fields and preserves booking/folio data');

response = await roomsBulk({ env, request: request(base) });
result = await bodyOf(response);
assert.equal(response.status, 200);
assert.equal(result.operation.replayed, true);
assert.equal(result.rev, 2);
console.log('✓ identical operation replay returns the original operation and current document');

response = await roomsBulk({ env, request: request({ ...base, changes: { floorId: 'floor:1' } }) });
assert.equal(response.status, 409);
console.log('✓ changed payload under one operation ID is rejected');

let room101 = JSON.parse(db.prepare("SELECT data FROM store_docs WHERE merchant=? AND feature='rooms'").get(merchant).data).rooms.find((room) => room.id === 'room:101');
for (const [operationId, charMode, characteristics, expected] of [
  ['room-char-add', 'add', ['ac'], ['balcony', 'ac']],
  ['room-char-remove', 'remove', ['balcony'], ['ac']],
  ['room-char-replace', 'replace', ['quiet'], ['quiet']],
]) {
  response = await roomsBulk({ env, request: request({ merchant, operationId, targets: [target('room:101', 101, room101.updatedAt)], changes: { charMode, characteristics } }) });
  assert.equal(response.status, 200);
  result = await bodyOf(response);
  assert.deepEqual(result.data.rooms.find((room) => room.id === 'room:101').characteristics, expected);
  room101 = result.data.rooms.find((room) => room.id === 'room:101');
}
console.log('✓ add/remove/replace characteristic modes preserve the intended per-room set');

response = await roomsBulk({ env, request: request({ merchant, operationId: 'room-no-op', targets: [target('room:101', 101, room101.updatedAt)], changes: { floorId: null, typeId: null, view: null, charMode: 'none', characteristics: [] } }) });
assert.equal(response.status, 422);
console.log('✓ null/none-only payloads are rejected as no-ops');

response = await roomsBulk({ env, request: request({ ...base, operationId: 'x'.repeat(121) }) });
assert.equal(response.status, 413);
response = await roomsBulk({ env, request: request({ ...base, operationId: 'room-long-id', targets: [target('x'.repeat(97), 101, room101.updatedAt)] }) });
assert.equal(response.status, 413);
console.log('✓ identifying fields reject overlong values instead of slicing into collisions');

const futureRoom = JSON.parse(db.prepare("SELECT data FROM store_docs WHERE merchant=? AND feature='rooms'").get(merchant).data).rooms.find((room) => room.id === 'room:103');
response = await roomsBulk({ env, request: request({ merchant, operationId: 'room-future-clock', targets: [target('room:103', 103, futureRoom.updatedAt)], changes: { floorId: 'floor:2' } }) });
assert.equal(response.status, 200);
result = await bodyOf(response);
const futureResult = result.data.rooms.find((room) => room.id === 'room:103');
assert.ok(futureResult.updatedAt > futureRoom.updatedAt);
console.log('✓ future client timestamps advance monotonically beyond the prior room revision');

response = await roomsBulk({ env, request: request({ merchant, operationId: 'room-unknown-char', targets: [target('room:101', 101, room101.updatedAt)], changes: { charMode: 'add', characteristics: ['not-in-catalog'] } }) });
assert.equal(response.status, 422);
console.log('✓ new characteristics outside the server catalog are rejected');

const current = JSON.parse(db.prepare("SELECT data FROM store_docs WHERE merchant=? AND feature='rooms'").get(merchant).data);
const currentRoom = current.rooms.find((room) => room.id === 'room:102');
const concurrent = { merchant, operationId: 'room-op-concurrent', targets: [target('room:102', 102, currentRoom.updatedAt)], changes: { view: 'mountain' } };
response = await roomsBulk({ env, request: request(concurrent) });
assert.equal(response.status, 200);
response = await roomsBulk({ env, request: request({ ...concurrent, operationId: 'room-op-lost-race' }) });
assert.equal(response.status, 409);
console.log('✓ stale room revision loses atomically and returns a retryable conflict');

const atomicBefore = JSON.parse(db.prepare("SELECT data FROM store_docs WHERE merchant=? AND feature='rooms'").get(merchant).data);
const atomicRoom = atomicBefore.rooms.find((room) => room.id === 'room:101');
response = await roomsBulk({ env, request: request({
  merchant, operationId: 'room-op-atomic-targets',
  targets: [target('room:101', 101, atomicRoom.updatedAt), target('room:102', 999, currentRoom.updatedAt)],
  changes: { view: 'must-not-apply' },
}) });
assert.equal(response.status, 409);
const atomicAfter = JSON.parse(db.prepare("SELECT data FROM store_docs WHERE merchant=? AND feature='rooms'").get(merchant).data);
assert.equal(atomicAfter.rooms.find((room) => room.id === 'room:101').view, atomicRoom.view);
console.log('✓ one invalid target prevents every target in the bulk operation from changing');

const genericDoc = JSON.parse(db.prepare("SELECT data FROM store_docs WHERE merchant=? AND feature='rooms'").get(merchant).data);
genericDoc.rooms[0].view = 'generic-save';
genericDoc.roomAudits = [{ operationId: 'forged', hash: 'forged', actor: { id: 'KiwiMe', name: 'Forged' } }];
const genericRev = db.prepare("SELECT rev FROM store_docs WHERE merchant=? AND feature='rooms'").get(merchant).rev;
response = await storePost({ env, request: storeRequest({ merchant, feature: 'rooms', baseRev: genericRev, data: genericDoc }) });
assert.equal(response.status, 200);
const preserved = JSON.parse(db.prepare("SELECT data FROM store_docs WHERE merchant=? AND feature='rooms'").get(merchant).data);
assert.ok(preserved.roomAudits.some((audit) => audit.id === 'legacy-audit'));
assert.ok(preserved.roomAudits.some((audit) => audit.operationId === 'room-op-1'));
assert.ok(!preserved.roomAudits.some((audit) => audit.operationId === 'forged'));
console.log('✓ generic rooms save uses CAS and preserves server-owned audit history');

response = await roomsBulk({ env, request: request({ ...base, merchant: otherMerchant, operationId: 'cross-tenant' }) });
assert.equal(response.status, 403);
console.log('✓ cross-tenant owner session is rejected');

const forgedBody = { ...base, operationId: 'actor-forgery', actor: { id: 'KiwiMe', name: 'Forged' }, pinProof: 'not-a-proof' };
response = await roomsBulk({ env, request: request(forgedBody) });
assert.equal(response.status, 403);
const afterForgery = JSON.parse(db.prepare("SELECT data FROM store_docs WHERE merchant=? AND feature='rooms'").get(merchant).data);
assert.ok(!afterForgery.roomAudits.some((audit) => audit.operationId === 'actor-forgery'));
console.log('✓ forged client actor and invalid PIN proof cannot create an audit');

db.prepare("UPDATE store_docs SET data=? WHERE merchant=? AND feature='rooms'").run('{"rooms":"corrupt"}', merchant);
response = await roomsBulk({ env, request: request({ ...base, operationId: 'corrupt-doc' }) });
assert.equal(response.status, 503);
console.log('✓ corrupt legacy room document fails closed');

console.log('hotel-room-bulk-api-test: 12 checks passed');
db.close();
