#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { DatabaseSync } from 'node:sqlite';
import { makeSession, sessionCookie } from '../functions/auth/_lib.js';
import { onRequestGet } from '../functions/api/order/queue.js';

const db = new DatabaseSync(':memory:');
db.exec(fs.readFileSync(new URL('../schema.sql', import.meta.url), 'utf8'));
const DB = {
  prepare(sql) {
    let args = [];
    return {
      bind(...values) { args = values; return this; },
      async first() { return db.prepare(sql).get(...args) || null; },
      async all() { return { results: db.prepare(sql).all(...args) }; },
      async run() { return { meta: { changes: Number(db.prepare(sql).run(...args).changes) } }; },
    };
  },
};
const merchant = 'busy-queue-test';
const env = { DB, AUTH_SECRET: 'queue-pagination-test-secret' };
const now = Date.now();
db.prepare('INSERT INTO accounts(id,email,name,business,salt,hash,created_ts) VALUES(?,?,?,?,?,?,?)')
  .run('owner', 'owner@test.invalid', 'Owner', 'Busy Queue', 's', 'h', now);
db.prepare('INSERT INTO merchant_config(merchant,features,type,account_id,updated_ts) VALUES(?,?,?,?,?)')
  .run(merchant, '{"orderpro":true}', 'restaurant', 'owner', now);
const cookie = sessionCookie(await makeSession('owner', env.AUTH_SECRET)).split(';')[0];

const insert = db.prepare(`INSERT INTO orders
  (id,merchant,number,mode,table_no,total,lines,status,created_ts,updated_ts)
  VALUES (?, ?, ?, 'takeout', '', 90, '[]', 'accepted', ?, ?)`);
for (let i = 0; i < 251; i++) {
  const id = 'ord-page-' + String(i).padStart(4, '0');
  /* 150 records share one millisecond. A timestamp-only cursor would loop or
   * skip 50 of them even when there are fewer than 100 per normal rush. */
  insert.run(id, merchant, i + 1, now - 10000, now - (i < 150 ? 9000 : i < 225 ? 8000 : 7000));
}

async function get(since, cursor) {
  const url = 'https://kiwi.test/api/order/queue?merchant=' + merchant + '&since=' + since
    + (cursor ? '&cursor=' + encodeURIComponent(JSON.stringify(cursor)) : '');
  const response = await onRequestGet({ env, request: new Request(url, { headers: { Cookie: cookie } }) });
  assert.equal(response.status, 200);
  return response.json();
}

const seen = new Set();
let cursor = null;
let pages = 0;
let final = null;
do {
  const data = await get(0, cursor);
  assert.equal(data.ok, true);
  assert.equal(data.ordersAvailable, true);
  assert.ok(data.orders.length <= 100, 'server respects per-page bound');
  data.orders.forEach((order) => seen.add(order.id));
  cursor = data.nextCursor;
  final = data;
  pages++;
  assert.ok(pages < 10, 'cursor must make forward progress');
} while (cursor);
assert.equal(pages, 3);
assert.equal(seen.size, 251, 'all orders, including same-millisecond ties, reach the client');
assert.ok(final.now <= Date.now() - 1900, 'completed poll preserves the overlap window');

const bad = await onRequestGet({ env, request: new Request(
  'https://kiwi.test/api/order/queue?merchant=' + merchant + '&since=0&cursor=invalid',
  { headers: { Cookie: cookie } }) });
assert.equal(bad.status, 400, 'malformed cursors cannot silently restart the scan');

/* Exercise the browser transport, not only the API. It must assemble every
 * page before handing a completed snapshot to the caisse or kitchen. */
const storage = new Map([['kiwiPaired', '1'], ['kiwiLiveMerchant', merchant]]);
const window = { addEventListener() {} };
const context = {
  window, localStorage: { getItem: (key) => storage.get(key) || null, setItem: (key, value) => storage.set(key, value) },
  fetch: async (url) => {
    const response = await onRequestGet({ env, request: new Request('https://kiwi.test' + url, { headers: { Cookie: cookie } }) });
    return { ok: response.ok, json: () => response.json() };
  },
  setInterval() { throw new Error('unexpected retry timer'); },
};
vm.runInNewContext(fs.readFileSync(new URL('../assets/kitchen-relay.js', import.meta.url), 'utf8'), context);
const all = await window.KiwiKitchenRelay.pullAll(0, 'kitchen');
assert.equal(all.ok, true);
assert.equal(all.orders.length, 251, 'real browser transport drains the whole queue');
assert.equal(new Set(all.orders.map((order) => order.id)).size, 251);

console.log('✓ Order queue delivers every record across 100-row pages and same-ms ties');
