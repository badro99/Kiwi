#!/usr/bin/env node
import assert from 'node:assert/strict';
import { createHotelRequestHarness, MERCHANT } from './fixtures/hotel-request-db.mjs';

const EXPECTED = 4;
let checks = 0;
process.on('unhandledRejection', (error) => { console.error(error); process.exit(1); });
async function check(name, fn) { await fn(); checks += 1; process.stdout.write(`  ok ${checks} - ${name}\n`); }

const h = await createHotelRequestHarness();
await h.createSubmitted('req-a', 'whisky', 8);
const before = h.rows("SELECT * FROM inventory_movements WHERE merchant = ?", MERCHANT).length;
const reviewA = await h.post({ action: 'review', merchant: MERCHANT, id: 'req-a', revision: 2, idempotencyKey: 'review:a', data: { lines: [{ itemId: 'whisky', qtyApproved: 8, resolution: 'approved' }] } });
await check('review commits an approval without writing the ledger', async () => {
  assert.equal(reviewA.status, 200);
  assert.equal(h.rows("SELECT * FROM inventory_movements WHERE merchant = ?", MERCHANT).length, before);
});
await h.createSubmitted('req-b', 'whisky', 8);
const over = await h.post({ action: 'review', merchant: MERCHANT, id: 'req-b', revision: 2, idempotencyKey: 'review:b:over', data: { lines: [{ itemId: 'whisky', qtyApproved: 8, resolution: 'approved' }] } });
await check('another request cannot over-commit the four remaining bottles', async () => {
  assert.equal(over.status, 409);
  assert.equal((await over.json()).error, 'insufficient-stock');
});
let reduced = await h.post({ action: 'review', merchant: MERCHANT, id: 'req-b', revision: 2, idempotencyKey: 'review:b:four', data: { lines: [{ itemId: 'whisky', qtyApproved: 4, resolution: 'reduced', note: 'Central stock' }] } });
let reducedBody = await reduced.json();
const accepted = await h.post({ action: 'accept', merchant: MERCHANT, id: 'req-b', revision: 3, idempotencyKey: 'accept:b' });
await check('a reduced approval remains proposed until its exact revision is accepted', async () => {
  assert.equal(reduced.status, 200);
  assert.equal(reducedBody.label, 'changes-proposed');
  assert.equal((await accepted.json()).label, 'approved');
});
await h.createSubmitted('req-refused', 'cola', 2);
const refused = await h.post({ action: 'review', merchant: MERCHANT, id: 'req-refused', revision: 2, idempotencyKey: 'review:refused', data: { lines: [{ itemId: 'cola', qtyApproved: 0, resolution: 'refused', note: 'Unavailable' }] } });
const refusedAccepted = await h.post({ action: 'accept', merchant: MERCHANT, id: 'req-refused', revision: 3, idempotencyKey: 'accept:refused' });
await check('a refused line stays visible and never becomes received', async () => {
  assert.equal(refused.status, 200);
  const body = await refusedAccepted.json();
  assert.equal(body.label, 'rejected');
  assert.equal(body.lines[0].resolution, 'refused');
  assert.equal(body.lines[0].qtyApproved, 0);
});
assert.equal(checks, EXPECTED, `expected ${EXPECTED} executed checks, got ${checks}`);

