#!/usr/bin/env node
import assert from 'node:assert/strict';
import { createHotelTenant } from './fixtures/hotel-tenant.mjs';
import { createHotelRequestHarness, MERCHANT } from './fixtures/hotel-request-db.mjs';

const EXPECTED = 14;
let checks = 0;
process.on('unhandledRejection', (error) => { console.error(error); process.exit(1); });
async function check(name, fn) { await fn(); checks += 1; process.stdout.write(`  ok ${checks} - ${name}\n`); }
const confirm = (h, id, revision, key, itemId, qty, cookie) => h.post({ action: 'confirm', merchant: MERCHANT, id, revision, idempotencyKey: key, data: { lines: [{ itemId, qtyReceived: qty }] } }, cookie === undefined ? h.ownerCookie : cookie);

const h = await createHotelRequestHarness();
await h.ready('pair', 'whisky', 12);
const beforeHotel = h.balance('whisky', 'u-economat') + h.balance('whisky', 'u-bar-rooftop');
const firstResponse = await confirm(h, 'pair', 4, 'confirm:pair', 'whisky', 12);
const first = await firstResponse.json();
const pairRows = h.rows("SELECT * FROM inventory_movements WHERE merchant = ? AND ref_id = ? ORDER BY srv_ts", MERCHANT, first.transferRef);
await check('confirmation writes exactly one linked movement pair', () => {
  assert.equal(firstResponse.status, 200);
  assert.equal(pairRows.length, 2);
  assert.equal(new Set(pairRows.map((row) => row.ref_id)).size, 1);
  assert.deepEqual(pairRows.map((row) => row.reason), ['transfer-out', 'transfer-in']);
});
const replayResponse = await confirm(h, 'pair', 4, 'confirm:pair', 'whisky', 12);
const replay = await replayResponse.json();
await check('confirming twice is idempotent and leaves balances unchanged', () => {
  assert.equal(replay.replayed, true);
  assert.equal(h.rows("SELECT * FROM inventory_movements WHERE merchant = ? AND ref_id = ?", MERCHANT, first.transferRef).length, 2);
});

const wrong = await createHotelRequestHarness();
await wrong.ready('wrong-side', 'cola', 2);
const wrongSide = await confirm(wrong, 'wrong-side', 4, 'confirm:wrong', 'cola', 2, await wrong.employeeCookie('econ-a'));
await check('the non-selected confirmation side is refused server-side', () => assert.equal(wrongSide.status, 403));

const partial = await createHotelRequestHarness();
await partial.ready('partial', 'cola', 6);
const partialResponse = await confirm(partial, 'partial', 4, 'confirm:partial', 'cola', 2);
const partialBody = await partialResponse.json();
await check('partial confirmation moves only its delta and keeps the request open', () => {
  assert.equal(partialResponse.status, 200);
  assert.equal(partialBody.request.state, 'open');
  assert.deepEqual(partialBody.movements.map((movement) => Math.abs(movement.qty)), [2, 2]);
});

await check('the transfer preserves the hotel-wide balance in SQL and the seeded client ledger', () => {
  const afterHotel = h.balance('whisky', 'u-economat') + h.balance('whisky', 'u-bar-rooftop');
  assert.equal(afterHotel, beforeHotel);
  const seeded = createHotelTenant({ merchant: MERCHANT });
  assert.equal(seeded.ledger.acknowledge(first.movements), 2);
  assert.equal(seeded.balanceHotel('whisky'), 18);
  assert.equal(seeded.balanceAt('economat', 'whisky'), 0);
  assert.equal(seeded.balanceAt('bar-rooftop', 'whisky'), 18);
});
await check('both movements retain the non-zero blended source rate', () => {
  assert.deepEqual(pairRows.map((row) => Number(row.unit_cost_cents)), [13500, 13500]);
  assert.deepEqual(first.movements.map((movement) => movement.unitCost), [135, 135]);
});

const unknown = await createHotelRequestHarness();
await unknown.ready('unknown-cost', 'verrerie', 2);
const unknownBefore = unknown.rows("SELECT * FROM inventory_movements WHERE merchant = ?", MERCHANT).length;
const unknownResponse = await confirm(unknown, 'unknown-cost', 4, 'confirm:unknown', 'verrerie', 2);
await check('unknown source cost refuses the confirmation and writes nothing', async () => {
  assert.equal(unknownResponse.status, 409);
  assert.match((await unknownResponse.json()).error, /^source-cost-unknown:/);
  assert.equal(unknown.rows("SELECT * FROM inventory_movements WHERE merchant = ?", MERCHANT).length, unknownBefore);
  assert.equal(unknown.one("SELECT state FROM hotel_internal_requests WHERE id = 'unknown-cost'").state, 'open');
});
await check('several FEFO lots still produce one pair at one blended rate', () => {
  assert.equal(pairRows.length, 2);
  assert.equal(new Set(pairRows.map((row) => row.unit_cost_cents)).size, 1);
});
const offlineReplay = await confirm(h, 'pair', 4, 'confirm:pair', 'whisky', 12);
await check('an offline replay is a no-op after server acknowledgement', async () => {
  assert.equal((await offlineReplay.json()).replayed, true);
  assert.equal(h.rows("SELECT * FROM inventory_movements WHERE merchant = ? AND ref_id = ?", MERCHANT, first.transferRef).length, 2);
});
await check('cursor reservation consumes one ordered cursor per movement', () => {
  assert.equal(Number(pairRows[1].srv_ts) - Number(pairRows[0].srv_ts), 1);
  assert.equal(new Set(pairRows.map((row) => row.srv_ts)).size, 2);
});

const rollback = await createHotelRequestHarness();
await rollback.ready('rollback', 'cola', 2);
rollback.raw.exec("CREATE TRIGGER fail_transfer_in BEFORE INSERT ON inventory_movements WHEN NEW.reason = 'transfer-in' BEGIN SELECT RAISE(ABORT, 'forced second insert failure'); END");
const rollbackResponse = await confirm(rollback, 'rollback', 4, 'confirm:rollback', 'cola', 2);
await check('a failed second insert rolls back the first movement, request and event', () => {
  assert.equal(rollbackResponse.status, 503);
  assert.equal(rollback.rows("SELECT * FROM inventory_movements WHERE ref_id LIKE 'request:rollback:%'").length, 0);
  assert.equal(Number(rollback.one("SELECT revision FROM hotel_internal_requests WHERE id = 'rollback'").revision), 4);
  assert.equal(rollback.rows("SELECT * FROM hotel_internal_request_events WHERE request_id = 'rollback' AND event = 'confirm'").length, 0);
});

const stale = await createHotelRequestHarness();
await stale.ready('stale', 'cola', 2);
const staleResponse = await confirm(stale, 'stale', 3, 'confirm:stale', 'cola', 2);
await check('a stale revision returns 409 and writes no movement', () => {
  assert.equal(staleResponse.status, 409);
  assert.equal(stale.rows("SELECT * FROM inventory_movements WHERE ref_id LIKE 'request:stale:%'").length, 0);
});

const anonymous = await createHotelRequestHarness();
await anonymous.ready('anonymous', 'cola', 2);
const anonymousResponse = await confirm(anonymous, 'anonymous', 4, 'confirm:anonymous', 'cola', 2, '');
await check('a paired device without active employee identity is refused', () => assert.equal(anonymousResponse.status, 403));

const changed = await createHotelRequestHarness();
await changed.createSubmitted('changed-stock', 'cola', 6);
await changed.post({ action: 'review', merchant: MERCHANT, id: 'changed-stock', revision: 2, idempotencyKey: 'changed:review:6', data: { lines: [{ itemId: 'cola', qtyApproved: 6, resolution: 'approved' }] } });
changed.addMovement({ id: 'sale-after-approval', itemId: 'cola', qty: -20, reason: 'sale' });
let changedResponse = await changed.post({ action: 'review', merchant: MERCHANT, id: 'changed-stock', revision: 3, idempotencyKey: 'changed:review:4', data: { lines: [{ itemId: 'cola', qtyApproved: 4, resolution: 'reduced' }] } });
assert.equal(changedResponse.status, 200);
changedResponse = await changed.post({ action: 'accept', merchant: MERCHANT, id: 'changed-stock', revision: 4, idempotencyKey: 'changed:accept:4' });
assert.equal(changedResponse.status, 200);
changedResponse = await changed.post({ action: 'prepare', merchant: MERCHANT, id: 'changed-stock', revision: 5, idempotencyKey: 'changed:prepare:4', data: { fulfilmentMethod: 'pickup', handover: true, lines: [{ itemId: 'cola', qtyPrepared: 4 }] } });
assert.equal(changedResponse.status, 200);
const changedConfirm = await confirm(changed, 'changed-stock', 6, 'changed:confirm:4', 'cola', 4);
const changedBody = await changedConfirm.json();
await check('a changed source balance moves only a newly reviewed and accepted reduction', () => {
  assert.equal(changedConfirm.status, 200);
  assert.deepEqual(changedBody.movements.map((movement) => Math.abs(movement.qty)), [4, 4]);
  assert.equal(changed.balance('cola', 'u-economat'), 0);
});

assert.equal(checks, EXPECTED, `expected ${EXPECTED} executed checks, got ${checks}`);
process.stdout.write(`hotel-transfer-test: ${checks} checks passed\n`);

