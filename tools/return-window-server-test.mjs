#!/usr/bin/env node
/* Ruling 3 (owner, 4 Nov 2026), server half: the return window (0 to 90 days,
 * 7 by default, stored in the merchant's `policies` document) is re-checked at
 * refund and at store-credit issue on the 05:00 business day. A sale outside it
 * needs a manager approval that carries `windowOverride`; 0 means no return
 * without it. Real routes on the SQLite D1 fixture. */
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fixture } from './server-money-fixture.mjs';
import { makeSession, SESS_COOKIE, tillToken, TILL_COOKIE, managerRefundProof } from '../functions/auth/_lib.js';
import { onRequestPost as storePost } from '../functions/api/store.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const f = await fixture(ROOT);
const { sql, merchant } = f;
const DAY = 86400000, now = Date.now();
let n = 0;
const proof = (id, saleId, cents, method, extra = {}) => managerRefundProof(f.env.AUTH_SECRET, {
  merchant, staffId: 'manager-fixture', staffName: 'Fixture Manager', staffRole: 'manager', refundId: id, originalSaleId: saleId, amountCents: cents, refundMethod: method, ...extra });
const refund = async (saleId, extra = {}, body = {}) => {
  const id = 'rw-refund-' + (++n);
  return f.call('refund', { id, originalSaleId: saleId, amountCents: 1000, approval: await proof(id, saleId, 1000, '', extra), reason: 'test', ref: id, ...body });
};
const issue = async (saleId, extra = {}) => {
  const id = 'rw-issue-' + (++n);
  return f.call('credit', { action: 'issue', id, originalSaleId: saleId, originalRef: saleId, amountCents: 1000, customerName: 'Test', reason: 'Retour', approval: await proof(id, saleId, 1000, 'avoir', extra) });
};
const setPolicy = (data) => sql.prepare("INSERT OR REPLACE INTO store_docs (merchant, feature, data, rev, updated_ts) VALUES (?, 'policies', ?, 1, ?)").run(merchant, JSON.stringify(data), now);
// Each sale is dated `daysAgo` whole days before now, so it lands on that many business days back in
// any zone and at any cutoff. (A noon-UTC anchor was still in the future every morning, which made
// "today" a sale from tomorrow's business day and failed the test before 12:00 UTC.)
const at = (daysAgo) => now - daysAgo * DAY - 1000;
for (const [id, days] of [['fresh', 1], ['week-old', 6], ['eight-days', 8], ['two-weeks', 14], ['today', 0], ['old-timer', 60]]) f.insert('rw-' + id, 5000, { ts: at(days) });

console.log('return-window-server-test');
let r;
// No document: the default is 7 days, today included (the till's counting).
r = await refund('rw-fresh'); assert.equal(r.status, 200, JSON.stringify(r.body));
r = await refund('rw-week-old'); assert.equal(r.status, 200, 'day 6 is the 7th day of the window');
r = await refund('rw-eight-days'); assert.equal(r.status, 403); assert.equal(r.body.error, 'return-window-closed', 'eight days old is outside the default window');
assert.equal(Number(sql.prepare("SELECT COUNT(*) c FROM sale_audit WHERE sale_id='rw-eight-days' AND action='refund'").get().c), 0, 'nothing was written for the refused refund');
r = await refund('rw-eight-days', { windowOverride: true }); assert.equal(r.status, 200, 'a manager approval that saw the sale is outside the window lifts it');
r = await issue('rw-two-weeks'); assert.equal(r.status, 403); assert.equal(r.body.error, 'return-window-closed', 'a store credit on an old sale is held to the window too');
r = await issue('rw-two-weeks', { windowOverride: true }); assert.equal(r.status, 200, JSON.stringify(r.body));
r = await issue('rw-fresh'); assert.equal(r.status, 200, 'inside the window a store credit issues as before');

// The owner widens the window to 30 days: the two-week-old sale now returns without override.
setPolicy({ returnWindowDays: 30 });
r = await refund('rw-two-weeks'); assert.equal(r.status, 200, 'a 30-day window accepts a 14-day-old sale');
r = await refund('rw-old-timer'); assert.equal(r.status, 403, '60 days is still outside 30');

// 0 means no return without an override, even on today's sale.
setPolicy({ returnWindowDays: 0 });
r = await refund('rw-today'); assert.equal(r.status, 403); assert.equal(r.body.error, 'return-window-closed');
r = await issue('rw-today'); assert.equal(r.status, 403);
r = await refund('rw-today', { windowOverride: true }); assert.equal(r.status, 200);

// Out-of-range and unreadable values never widen the window past their bounds.
setPolicy({ returnWindowDays: 9999 });
r = await refund('rw-old-timer'); assert.equal(r.status, 200, '9999 is held at 90 days, so a 60-day-old sale is inside');
setPolicy({ returnWindowDays: 'abc' });
r = await refund('rw-eight-days'); assert.equal(r.status, 403, 'an unreadable value falls back to the 7-day default');

// A replay of a refund already written is not refused when the window closed since.
setPolicy({ returnWindowDays: 30 });
f.insert('rw-replay', 5000, { ts: at(10) });
const replayId = 'rw-replay-refund', replayProof = await proof(replayId, 'rw-replay', 1000, '');
const body = { id: replayId, originalSaleId: 'rw-replay', amountCents: 1000, approval: replayProof, reason: 'test', ref: replayId };
assert.equal((await f.call('refund', body)).status, 200);
setPolicy({ returnWindowDays: 1 });
assert.equal((await f.call('refund', body)).status, 200, 'the outbox retry of a written refund stays idempotent');

// A refund made at the till inside the window and synced later is judged at the till's time.
setPolicy({ returnWindowDays: 7 });
f.insert('rw-offline', 5000, { ts: at(9) });
r = await refund('rw-offline', {}, { ts: at(5) }); assert.equal(r.status, 200, 'made 4 days after the sale (till clock), synced days later');
f.insert('rw-offline-late', 5000, { ts: at(9) });
r = await refund('rw-offline-late'); assert.equal(r.status, 403, 'the same sale refunded now, with no till time, is outside');

// The policies document is owner-written (the till reads it, never writes it) and drives the same check.
sql.prepare("DELETE FROM store_docs WHERE merchant = ? AND feature = 'policies'").run(merchant);
const secret = f.env.AUTH_SECRET;
let rev = 0;
const write = async (cookie, data) => {
  const res = await storePost({ request: new Request('https://kiwi.test/api/store', { method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/json' }, body: JSON.stringify({ feature: 'policies', merchant, data, baseRev: rev }) }), env: f.env });
  const out = { status: res.status, body: await res.json() };
  if (out.body && Number.isInteger(out.body.rev)) rev = out.body.rev;
  return out;
};
const till = `${TILL_COOKIE}=${await tillToken(secret, merchant)}`, owner = `${SESS_COOKIE}=${await makeSession('money-owner', secret)}`;
r = await write(till, { returnWindowDays: 90 }); assert.equal(r.status, 403, 'a paired till cannot change the window: ' + JSON.stringify(r.body));
assert.equal((await refund('rw-eight-days')).status, 403, 'and the refused write changed nothing');
r = await write(owner, { returnWindowDays: 2 }); assert.equal(r.status, 200, JSON.stringify(r.body));
f.insert('rw-three-days', 5000, { ts: at(3) });
assert.equal((await refund('rw-three-days')).status, 403, 'the owner-written window of 2 days is the one the refund route reads');
r = await write(owner, { returnWindowDays: 3 }); assert.equal(r.status, 200, JSON.stringify(r.body));
assert.equal((await refund('rw-three-days')).status, 403, 'three days means today and the two before');
r = await write(owner, { returnWindowDays: 4 }); assert.equal(r.status, 200);
assert.equal((await refund('rw-three-days')).status, 200);
// The claim travels through the real PIN verifier: the till asks, the server signs what it was asked.
{
  const { onRequestPost: verifyPin } = await import('../functions/api/pin/verify.js');
  const code = String(1000 + Math.floor(Math.random() * 9000));      // a throwaway test code, never written anywhere
  sql.prepare('INSERT INTO staff_pins (id, merchant, pin, name, role, created_ts) VALUES (?,?,?,?,?,?)').run('pin-rw', merchant, code, 'Window Manager', 'Manager', now);
  setPolicy({ returnWindowDays: 7 });
  const approve = async (windowOverride) => {
    const res = await verifyPin({ env: f.env, request: new Request('https://kiwi.test/api/pin/verify', { method: 'POST', headers: { Cookie: till, 'Content-Type': 'application/json' },
      body: JSON.stringify({ merchant, pin: code, action: { kind: 'refund', refundId: 'rw-pin-' + windowOverride, originalSaleId: 'rw-old-timer', amountCents: 1000, refundMethod: '', ...(windowOverride === undefined ? {} : { windowOverride }) } }) }) });
    const out = await res.json(); assert.equal(res.status, 200, JSON.stringify(out)); return out.approval;
  };
  const go = async (approval, id) => f.call('refund', { id, originalSaleId: 'rw-old-timer', amountCents: 1000, approval, reason: 'test', ref: id });
  assert.equal((await go(await approve(undefined), 'rw-pin-undefined')).status, 403, 'an approval asked without the flag does not lift the window');
  assert.equal((await go(await approve(true), 'rw-pin-true')).status, 200, 'an approval asked with the flag, signed by the real verifier, does');
}
console.log('✓ return window (server): default 7, 0 and 90 bounds, override claim, store credits, replay, till time, owner-only write');
