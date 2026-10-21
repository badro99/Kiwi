#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { employeeCookie, employeeToken, tillToken, TILL_COOKIE } from '../functions/auth/_lib.js';
import { onRequestGet } from '../functions/api/order/queue.js';

const sql = new DatabaseSync(':memory:');
sql.exec(fs.readFileSync(new URL('../schema.sql', import.meta.url), 'utf8'));
// Same D1-shaped adapter as shopify-direct-webhook-test.mjs; real SQLite SQL.
const DB = {
  prepare(q) {
    let args = [];
    const st = {
      bind(...a) { args = a.map(v => v === undefined ? null : v); return st; },
      first() { return sql.prepare(q).get(...args) || null; },
      all() { return { results: sql.prepare(q).all(...args) }; },
      run() { return { success: true, meta: { changes: sql.prepare(q).run(...args).changes } }; },
    };
    return st;
  },
};
const env = { DB, AUTH_SECRET: 'open-visit-unpaid-test-secret' };
const merchant = 'open-visit-test', now = Date.now(), hour = 3600000;
sql.prepare('INSERT INTO accounts(id,email,name,business,salt,hash,created_ts) VALUES(?,?,?,?,?,?,?)')
  .run('owner', 'owner@test.invalid', 'Owner', 'Restaurant', 's', 'h', now);
sql.prepare('INSERT INTO merchant_config(merchant,features,type,status,account_id,updated_ts) VALUES(?,?,?,?,?,?)')
  .run(merchant, '{}', 'restaurant', 'active', 'owner', now);
const member = { id: 'staff-1', firstName: 'Amina', role: 'Serveur', function: 'Serveur' };
const doc = sql.prepare('INSERT INTO store_docs(merchant,feature,data,rev,updated_ts) VALUES(?,?,?,?,?)');
for (const [feature, data] of Object.entries({
  'employee-access': { members: [member] }, team: { members: [member] },
  attendance: { entries: [{ memberId: member.id, staffId: member.id, inTs: now - 10 * hour, outTs: 0 }] },
  floorplan: { tables: [{ num: '2', servers: [member.id] }] },
})) doc.run(merchant, feature, JSON.stringify(data), 1, now);
const visit = sql.prepare('INSERT INTO table_sessions(id,merchant,mode,table_no,status,opened_ts,seen_ts) VALUES(?,?,?,?,?,?,?)');
visit.run('open', merchant, 'table', '2', 'open', now - 8 * hour, now - 7 * hour);
visit.run('closed', merchant, 'table', '3', 'closed', now - 8 * hour, now - 7 * hour);
visit.run('ancient', merchant, 'table', '4', 'open', now - 8 * 24 * hour, now);
visit.run('foreign', 'other-merchant', 'table', '5', 'open', now - 8 * hour, now);
const insert = sql.prepare(`INSERT INTO orders(id,merchant,number,mode,table_no,total,lines,status,
  created_ts,updated_ts,session_id,paid_ts,channel) VALUES(?,?,?,'table','2',131,'[]',?,?,?,?,?,'caisse')`);
let number = 0;
function order(id, session = 'open', paid = null, status = 'accepted') {
  insert.run(id, merchant, ++number, status, now - 7 * hour, now - 7 * hour, session, paid);
}
order('ord-unpaid');
order('ord-ready', 'open', null, 'ready');
order('ord-paid', 'open', now - hour);
order('ord-paid-zero', 'open', 0); // SQL NULL, not JS truthiness, defines unpaid.
order('ord-closed', 'closed');
order('ord-ancient', 'ancient');
order('ord-foreign', 'foreign');
order('ord-no-session', null);
order('ord-served', 'open', null, 'served');
order('ord-rejected', 'open', null, 'rejected');
const till = `${TILL_COOKIE}=${await tillToken(env.AUTH_SECRET, merchant)}`;
const staff = employeeCookie(await employeeToken(env.AUTH_SECRET, { merchant, staffId: member.id })).split(';')[0];
async function get(role = '', since = 0, cursor = null, cookie = till) {
  const params = new URLSearchParams({ merchant, role, since: String(since) });
  if (cursor) params.set('cursor', JSON.stringify(cursor));
  const response = await onRequestGet({ env, request: new Request('https://kiwi.test/api/order/queue?' + params, { headers: { cookie } }) });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.ordersAvailable, true);
  return body;
}
const first = await get();
assert.deepEqual(first.orders.map(o => o.id).sort(), ['ord-ready', 'ord-unpaid'],
  'fresh till recovers only old accepted/ready unpaid orders of recent open visits');
assert.ok(first.sessions.some(s => s.id === 'open'), 'unpaid orders preserve presence despite old seen_ts');
assert.deepEqual((await get('kitchen')).orders, [], 'kitchen retains six-hour TTL');
assert.deepEqual((await get('service', 0, null, staff)).orders, [], 'authenticated service retains six-hour TTL');
assert.deepEqual((await get('', now - hour)).orders, [], 'incremental polls respect since');
for (let i = 0; i < 205; i++) order('ord-page-' + String(i).padStart(4, '0'));
const seen = new Set();
let cursor = null, pages = 0;
do {
  const page = await get('', 0, cursor);
  assert.ok(page.orders.length <= 100);
  for (const order of page.orders) {
    assert.ok(!seen.has(order.id), 'same-timestamp continuation never repeats rows');
    seen.add(order.id);
  }
  cursor = page.nextCursor;
  assert.ok(++pages < 5, 'cursor progresses');
} while (cursor);
assert.equal(pages, 3);
assert.equal(seen.size, 207, 'every stale unpaid row survives same-timestamp pagination');
sql.close();
console.log('✓ Open-visit unpaid queue: till recovery, role isolation, exclusions, since and pagination');
