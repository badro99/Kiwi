#!/usr/bin/env node
// Boundary examples behind two landing promises: "Caisse utilisable hors ligne" and exact money.
// The real queue (assets/live-link.js, assets/offline-db.js) and the real /api/sale and /api/feed
// handlers on SQLite, no network. One example per edge, each one a sentence a merchant could be told:
// the smallest sale, the largest, an empty queue, a power cut before reconnecting, a lost
// acknowledgement, a refused sale among good ones, a full day queued. Every example runs on both
// storage engines (IndexedDB outbox and the legacy localStorage queue).
import assert from 'node:assert/strict';
import { fixture } from './server-money-fixture.mjs';
import { harness, ROOT } from './live-link-queue-harness.mjs';

const f = await fixture(ROOT), h = await harness(f);
const sum = (xs) => xs.reduce((a, b) => a + b, 0);
const sale = (cents, id, tip = 0) => ({ id, ref: id, amountCents: cents, amount: cents / 100, method: 'cash', time: new Date(h.s.now), tip: tip / 100, lines: [{ name: 'Article', qty: 1, total: cents / 100 }] });
const rows = () => f.sql.prepare('SELECT * FROM sales WHERE merchant=? AND void_ts IS NULL ORDER BY rowid').all(f.merchant);
let passed = 0;
const check = (condition, label) => { assert.ok(condition, label); passed++; console.log('  ✓ ' + label); };

for (const idb of [true, false]) {
  const engine = idb ? 'IndexedDB' : 'localStorage';

  await h.reset(idb);
  await h.recover();
  check(rows().length === 0 && h.s.requests.filter((r) => r.body).length === 0, `${engine}: an empty queue sends nothing when the connection returns`);

  await h.reset(idb);
  assert.equal(h.b.api.postSale(sale(1, 'one-centime')).queued, true);
  await h.recover();
  check(rows().length === 1 && rows()[0].amount_cents === 1, `${engine}: a one-centime sale made offline arrives as exactly 1 centime`);

  await h.reset(idb);
  h.b.api.postSale(sale(5000000, 'largest'));
  await h.recover();
  check(rows().length === 1 && rows()[0].amount_cents === 5000000, `${engine}: a 50 000 MAD sale made offline arrives to the centime`);

  await h.reset(idb);
  h.b.api.postSale(sale(10, 'dime')); h.b.api.postSale(sale(20, 'two-dimes'));
  await h.recover();
  check(sum(rows().map((r) => r.amount_cents)) === 30, `${engine}: 0,10 MAD and 0,20 MAD sold offline add up to exactly 0,30 MAD`);

  await h.reset(idb);
  h.b.api.postSale(sale(1000, 'tip-edge', 1000));
  await h.recover();
  check(rows().length === 1 && rows()[0].amount_cents === 1000 && rows()[0].tip_cents === 1000, `${engine}: a tip equal to the whole sale is kept apart from the sale amount`);

  await h.reset(idb);
  const posted = h.b.api.postSale(sale(4200, 'power-cut'));
  await h.drain();
  await h.boot(idb);                                  // the page is gone and comes back, still offline
  check(h.b.api.pending() === 1 && rows().length === 0, `${engine}: after a power cut the offline sale is still waiting, nothing lost, nothing sent`);
  await h.recover();
  check(rows().length === 1 && rows()[0].id === posted.id && h.b.api.pending() === 0, `${engine}: ...and it arrives once, under its own receipt number, when the connection returns`);

  await h.reset(idb);
  const lost = h.b.api.postSale(sale(777, 'lost-ack'));
  await h.drain();
  h.s.online = true; h.s.plan.push('lost');
  await h.flush();
  check(rows().length === 1 && h.b.api.pending() > 0, `${engine}: the server recorded the sale but the till never heard back, so it keeps the sale waiting`);
  await h.boot(idb);
  await h.recover();
  check(rows().length === 1 && rows()[0].id === lost.id && h.b.api.pending() === 0, `${engine}: ...and the retry after a reload does not record it a second time`);

  await h.reset(idb);
  h.b.api.postSale(sale(300, 'refused')); h.b.api.postSale(sale(301, 'accepted'));
  await h.drain();
  h.s.plan.push(422);
  await h.recover();
  check(rows().length === 1 && rows()[0].amount_cents === 301 && h.b.api.pending() >= 1, `${engine}: a sale the server refuses stays visible in the queue and does not hold back the next one`);

  await h.reset(idb);
  const day = Array.from({ length: 60 }, (_, i) => 100 + i);
  day.forEach((c, i) => h.b.api.postSale(sale(c, 'day-' + i)));
  await h.recover();
  check(rows().length === 60 && sum(rows().map((r) => r.amount_cents)) === sum(day) && h.b.api.pending() === 0, `${engine}: sixty sales queued offline all arrive, once each, to the centime`);
}
console.log(`\n✓ landing offline and money boundaries: ${passed} examples`);
process.exit(0);
