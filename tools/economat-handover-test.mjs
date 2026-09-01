#!/usr/bin/env node
import assert from 'node:assert/strict';
import { createHotelRequestHarness, MERCHANT } from './fixtures/hotel-request-db.mjs';

const EXPECTED = 4;
let checks = 0;
process.on('unhandledRejection', (error) => { console.error(error); process.exit(1); });
async function check(name, fn) { await fn(); checks += 1; process.stdout.write(`  ok ${checks} - ${name}\n`); }

const h = await createHotelRequestHarness();
await h.createSubmitted('handover', 'cola', 6);
await h.post({ action: 'review', merchant: MERCHANT, id: 'handover', revision: 2, idempotencyKey: 'handover:review', data: { lines: [{ itemId: 'cola', qtyApproved: 6, resolution: 'approved' }] } });
const before = h.rows("SELECT * FROM inventory_movements WHERE merchant = ?", MERCHANT).length;
for (const [index, qty, employee] of [[0, 2, 'econ-a'], [1, 4, 'econ-b'], [2, 6, 'econ-c']]) {
  const response = await h.post({ action: 'prepare', merchant: MERCHANT, id: 'handover', revision: 3 + index, idempotencyKey: `handover:${index}`, data: { fulfilmentMethod: 'delivery', handover: true, note: `partial-${index}`, lines: [{ itemId: 'cola', qtyPrepared: qty }] } }, await h.employeeCookie(employee));
  assert.equal(response.status, 200);
}
const events = h.rows("SELECT actor_id, payload, ts FROM hotel_internal_request_events WHERE merchant = ? AND request_id = 'handover' AND event = 'prepare' ORDER BY revision", MERCHANT);
await check('three partial handovers preserve three actors, cumulative quantities and timestamps', () => {
  assert.deepEqual(events.map((event) => event.actor_id), ['econ-a', 'econ-b', 'econ-c']);
  assert.deepEqual(events.map((event) => JSON.parse(event.payload).lines[0].qtyPrepared), [2, 4, 6]);
  assert.equal(events.every((event) => Number(event.ts) > 0), true);
});
await check('the first delivery handover timestamp and method are projected without overwrite', () => {
  const row = h.one("SELECT fulfilment_method, delivery_started_ts FROM hotel_internal_requests WHERE merchant = ? AND id = 'handover'", MERCHANT);
  assert.equal(row.fulfilment_method, 'delivery');
  assert.equal(Number(row.delivery_started_ts), Number(events[0].ts));
});
await check('preparation and handover leave central stock untouched', () => assert.equal(h.rows("SELECT * FROM inventory_movements WHERE merchant = ?", MERCHANT).length, before));
const regression = await h.post({ action: 'prepare', merchant: MERCHANT, id: 'handover', revision: 6, idempotencyKey: 'handover:regress', data: { fulfilmentMethod: 'delivery', handover: true, lines: [{ itemId: 'cola', qtyPrepared: 5 }] } }, await h.employeeCookie('econ-a'));
await check('a lower cumulative handover quantity is refused', () => assert.equal(regression.status, 422));
assert.equal(checks, EXPECTED, `expected ${EXPECTED} executed checks, got ${checks}`);

