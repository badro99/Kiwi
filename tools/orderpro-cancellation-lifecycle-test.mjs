#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { makeSession, sessionCookie } from '../functions/auth/_lib.js';
import { onRequestPost as seat } from '../functions/api/order/session.js';
import { onRequestPost as createOrder } from '../functions/api/order/index.js';
import { onRequestGet as readQueue, onRequestPost as mutateQueue } from '../functions/api/order/queue.js';

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
  async batch(statements) {
    db.exec('BEGIN IMMEDIATE');
    try {
      const results = [];
      for (const statement of statements) results.push(await statement.run());
      db.exec('COMMIT');
      return results;
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  },
};

const now = Date.now();
const merchant = 'pasta-corner-cancel-test';
const env = { DB, AUTH_SECRET: 'orderpro-cancel-test-secret' };
db.prepare('INSERT INTO accounts(id,email,name,business,salt,hash,created_ts) VALUES(?,?,?,?,?,?,?)')
  .run('owner', 'owner@test.invalid', 'Owner', 'Pasta Corner', 's', 'h', now);
db.prepare('INSERT INTO merchant_config(merchant,features,type,account_id,updated_ts) VALUES(?,?,?,?,?)')
  .run(merchant, '{"orderpro":true}', 'restaurant', 'owner', now);
db.prepare('INSERT INTO order_desk(merchant,seen_ts) VALUES(?,?)').run(merchant, now);
db.prepare('INSERT INTO menus(merchant,name,type,data,updated_ts) VALUES(?,?,?,?,?)')
  .run(merchant, 'Menu', 'restaurant', JSON.stringify({
    cats: [{ id: 'pasta', name: 'Pasta' }],
    items: [{ id: 'formula', name: 'Prépare ton Plat', catId: 'pasta', price: 64, avail: true }],
  }), now);
db.prepare('INSERT INTO store_docs(merchant,feature,data,rev,updated_ts) VALUES(?,?,?,?,?)')
  .run(merchant, 'floorplan', JSON.stringify({ tables: [{ id: 'T5', num: '5' }] }), 1, now);

const owner = sessionCookie(await makeSession('owner', env.AUTH_SECRET)).split(';')[0];
async function post(handler, body, cookie = '') {
  const response = await handler({
    env,
    request: new Request('https://kiwi.test/api/order', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ merchant, ...body }),
    }),
  });
  return { http: response.status, ...await response.json() };
}
async function getQueue() {
  const response = await readQueue({
    env,
    request: new Request(`https://kiwi.test/api/order/queue?merchant=${merchant}&since=0`, {
      headers: { Cookie: owner },
    }),
  });
  return { http: response.status, ...await response.json() };
}

const visit = await post(seat, { mode: 'table', table: '5' });
assert.equal(visit.ok, true);
const order = await post(createOrder, {
  mode: 'table', table: '5', session: visit.session, ref: 'pasta-corner-phone-1',
  lines: [{ id: 'formula', qty: 1 }],
});
assert.equal(order.ok, true);

const accepted = await post(mutateQueue, { id: order.id, status: 'accepted' }, owner);
assert.equal(accepted.ok, true, 'caisse can accept the OrderPro order');
const rejected = await post(mutateQueue, { id: order.id, status: 'rejected' }, owner);
assert.equal(rejected.ok, true, 'caisse can cancel an accepted OrderPro order');

const queue = await getQueue();
assert.equal(queue.ok, true);
assert.equal(queue.orders.some((candidate) => candidate.id === order.id), false,
  'cancelled order leaves the active queue');
const terminal = queue.cancelledTickets.find((candidate) => candidate.id === order.id);
assert.ok(terminal, 'cancelled order is projected to caisse cleanup');
assert.equal(terminal.status, 'rejected', 'cancelled projection carries its terminal state');
assert.equal(terminal.table, '5');

const currentVisit = queue.sessions.find((candidate) => candidate.id === visit.session);
assert.ok(currentVisit, 'refusing the order does not pretend the physical table already left');
const closed = await post(mutateQueue, {
  closeTable: '5', expectedSession: visit.session, expectedRevision: currentVisit.seen_ts,
  closedBy: 'caisse',
}, owner);
assert.equal(closed.ok, true, 'Annuler mesa can close the now-empty OrderPro visit');
const afterClose = await getQueue();
assert.equal(afterClose.sessions.some((candidate) => candidate.id === visit.session), false,
  'closed visit does not reopen on the next poll');

const inboxSource = fs.readFileSync(new URL('../assets/orderpro-inbox.js', import.meta.url), 'utf8');
assert.match(inboxSource,
  /var terminal = cancelled\.map[\s\S]{0,240}status: 'rejected'[\s\S]{0,160}bridge\(delta\.concat\(terminal\)\)/,
  'mixed-version cancelled payloads are normalized and ingested once');
const caisseSource = fs.readFileSync(new URL('../kiwi-caisse.html', import.meta.url), 'utf8');
const attach = caisseSource.match(/function attachOrderProTable\(o\)\s*\{[\s\S]{0,14000}?\n {4}\}/)?.[0] || '';
assert.ok(attach.indexOf("o.status === 'rejected'") < attach.indexOf('const activeSeat ='),
  'terminal cleanup runs before current-session validation');
assert.match(attach, /startsWith\(String\(o\.id\) \+ ':'\)/,
  'terminal cleanup removes only the cancelled OrderPro line markers');

console.log('✓ OrderPro cancellation is terminal, clears the bill projection, and lets Annuler mesa close the visit');
