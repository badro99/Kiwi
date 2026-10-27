#!/usr/bin/env node
/* pressing-notification-freeze-test · « client prévenu » is evidence the server
 * keeps, not a field the next snapshot may rewrite.
 *
 * Through the real /api/store route over an in-memory D1: a notification
 * (channel, author, time) is validated and stamped with the server's reception
 * time the first time it is seen, and a later snapshot that clears it, changes
 * its author or moves its time cannot. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { onRequestPost as storePost } from '../functions/api/store.js';
import { freezePressingNotifications } from '../functions/api/_pressing-notification.js';
import { tillToken } from '../functions/auth/_lib.js';

const db = new DatabaseSync(':memory:');
db.exec(fs.readFileSync(new URL('../schema.sql', import.meta.url), 'utf8'));
const merchant = 'press-notify', secret = 'press-notify-secret-32-chars-long!';
const now = Date.now();
db.prepare('INSERT INTO merchant_config (merchant,features,plan,type,status,name,updated_ts) VALUES (?,?,?,?,?,?,?)')
  .run(merchant, '{}', 'pro', 'pressing', 'active', 'Press Notify', now);
const d1 = {
  prepare(sql) { let a = []; const q = { bind(...v) { a = v; return q; },
    first() { return db.prepare(sql).get(...a) || null; }, all() { return { results: db.prepare(sql).all(...a) }; },
    run() { const r = db.prepare(sql).run(...a); return { meta: { changes: r.changes } }; } }; return q; },
  async batch(list) { return Promise.all(list.map((s) => s.run())); },
};
const env = { DB: d1, AUTH_SECRET: secret };
const cookie = `kiwi_till=${await tillToken(secret, merchant)}`;
const order = (extra = {}) => ({ id: 'P-1', lines: [{ itemId: 'chemise', qty: 1 }], pieces: [{ pid: 'p1', status: 'pret' }],
  droppedAt: '2026-09-08T08:00:00.000Z', readyAt: '2026-09-08T12:00:00.000Z', rack: 'A-02',
  pay: { mode: 'pickup', paid: 0 }, total: 40, updatedAt: now, ...extra });
const doc = () => JSON.parse(db.prepare("SELECT data FROM store_docs WHERE merchant=? AND feature='pressing-orders'").get(merchant).data);
const rev = () => { const r = db.prepare("SELECT rev FROM store_docs WHERE merchant=? AND feature='pressing-orders'").get(merchant); return r ? r.rev : 0; };
const push = async (orders) => {
  const res = await storePost({ env, request: new Request('https://kiwi.test/api/store', { method: 'POST',
    headers: { Cookie: cookie, 'Content-Type': 'application/json' },
    body: JSON.stringify({ feature: 'pressing-orders', merchant, baseRev: rev(), data: { customers: [], orders, seq: 1 } }) }) });
  return res.status;
};

// First sight: validated, stamped with the server's time.
const device = new Date(now - 60000).toISOString();
assert.equal(await push([order({ notified: true, notification: { channel: 'whatsapp', at: device, by: { id: 'staff-1', name: 'Sara' } } })]), 200);
let n = doc().orders[0].notification;
assert.equal(n.channel, 'whatsapp'); assert.equal(n.at, device, 'a believable device time is kept');
assert.ok(Date.parse(n.receivedAt) >= now, 'and the server time of reception is recorded beside it');

// A later snapshot that never heard of it, or rewrites it, changes nothing.
assert.equal(await push([order({ notified: false })]), 200);
let o = doc().orders[0];
assert.equal(o.notified, true, 'a later snapshot cannot clear « notified »');
assert.deepEqual(o.notification, n, 'nor the record');
assert.equal(await push([order({ notified: true, notification: { channel: 'call', at: new Date(now - 9e6).toISOString(), by: { id: 'staff-9', name: 'Autre' } } })]), 200);
assert.deepEqual(doc().orders[0].notification, n, 'nor change its author, channel or time');

// New orders: a clock in the future or an unknown channel is not taken as written.
const ahead = new Date(now + 6 * 3600000).toISOString();
assert.equal(await push([doc().orders[0], order({ id: 'P-2', rack: 'A-03', notified: true, notification: { channel: 'sms', at: ahead, by: { name: 'Karim' } } })]), 200);
const two = doc().orders.find((x) => x.id === 'P-2').notification;
assert.ok(Date.parse(two.at) < now + 60000, 'a notification dated hours ahead gets the server time instead');
assert.equal(await push([doc().orders[0], doc().orders[1], order({ id: 'P-3', rack: 'A-04', notified: true, notification: { channel: 'telepathy', at: device, by: { name: 'X' } } })]), 200);
const three = doc().orders.find((x) => x.id === 'P-3');
assert.equal(three.notification, undefined, 'an unknown channel is not recorded');
assert.equal(three.notified, false, 'and does not count as notified');

// A legacy ticket (flag only) stays notified.
const legacy = freezePressingNotifications({ orders: [{ id: 'L', notified: true }] }, { orders: [{ id: 'L', notified: false }] }, now);
assert.equal(legacy.orders[0].notified, true);
console.log('✓ pressing notification freeze: validated once, stamped by the server, never cleared by a later snapshot');
