#!/usr/bin/env node
import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

process.on('unhandledRejection', (error) => {
  console.error(error);
  process.exit(1);
});

const EXPECTED = 8;
let checks = 0;

async function check(name, fn) {
  await fn();
  checks += 1;
  process.stdout.write(`  ok ${checks} - ${name}\n`);
}

const modulePath = process.env.KIWI_ROOM_CHARGE_MODULE
  ? path.resolve(process.env.KIWI_ROOM_CHARGE_MODULE)
  : path.resolve('functions/api/hotel/_room-charge-data.js');
const {
  appendRoomCharge,
  reverseRoomCharge,
  roomChargesByCashier,
  roomChargeId,
  roomChargeReversalId,
} = await import(pathToFileURL(modulePath).href + `?run=${Date.now()}`);

const base = {
  outletId: 'outlet-alpha',
  shiftId: 'shift-alpha',
  cashierName: 'Cashier Alpha',
  occurredTs: 1000,
};

let lines = [];
const first = appendRoomCharge(lines, {
  ...base,
  saleId: 'sale-alpha',
  cashierId: 'cashier-alpha',
  amountCents: 12500,
});
await check('posting uses the sale identity for a deterministic charge id', async () => {
  assert.equal(first.ok, true);
  assert.equal(first.created, true);
  assert.equal(first.line.id, roomChargeId('sale-alpha'));
});
await check('the structured folio line freezes outlet, shift, and cashier identity', async () => {
  assert.equal(first.line.outletId, 'outlet-alpha');
  assert.equal(first.line.shiftId, 'shift-alpha');
  assert.equal(first.line.cashierId, 'cashier-alpha');
  assert.equal(first.line.cashierName, 'Cashier Alpha');
});
lines = first.lines;

const duplicate = appendRoomCharge(lines, {
  ...base,
  saleId: 'sale-alpha',
  cashierId: 'cashier-alpha',
  amountCents: 12500,
});
await check('posting the same sale twice is a no-op', async () => {
  assert.equal(duplicate.created, false);
  assert.equal(duplicate.lines, lines);
  assert.equal(duplicate.lines.length, 1);
});

const reversed = reverseRoomCharge(lines, 'sale-alpha', {
  occurredTs: 2000,
  actorId: 'manager-alpha',
});
await check('reversal appends one exact negative line linked to the charge', async () => {
  assert.equal(reversed.created, true);
  assert.equal(reversed.line.id, roomChargeReversalId('sale-alpha'));
  assert.equal(reversed.line.reversalOf, roomChargeId('sale-alpha'));
  assert.equal(reversed.line.amountCents, -12500);
});
lines = reversed.lines;

const reversedTwice = reverseRoomCharge(lines, 'sale-alpha', {
  occurredTs: 3000,
  actorId: 'manager-alpha',
});
await check('reversing the same linked sale twice changes nothing', async () => {
  assert.equal(reversedTwice.created, false);
  assert.equal(reversedTwice.lines, lines);
  assert.equal(reversedTwice.lines.length, 2);
  assert.equal(reversedTwice.lines.reduce((sum, line) => sum + line.amountCents, 0), 0);
});

const second = appendRoomCharge(lines, {
  ...base,
  saleId: 'sale-beta',
  cashierId: 'cashier-beta',
  cashierName: 'Cashier Beta',
  amountCents: 7600,
  occurredTs: 1500,
});
lines = second.lines;
const report = roomChargesByCashier(lines, { shiftId: 'shift-alpha' });
await check('the shift report groups charges and reversals by the original cashier', async () => {
  assert.deepEqual(report.cashiers.map((row) => [
    row.cashierId, row.chargeCount, row.reversalCount, row.netCents,
  ]), [
    ['cashier-alpha', 1, 1, 0],
    ['cashier-beta', 1, 0, 7600],
  ]);
});
await check('shift totals equal the structured folio lines they aggregate', async () => {
  const source = lines.filter((line) => line.shiftId === 'shift-alpha');
  assert.equal(report.totals.lineCount, source.length);
  assert.equal(report.totals.netCents, source.reduce((sum, line) => sum + line.amountCents, 0));
  assert.equal(report.totals.chargesCents - report.totals.reversalsCents, report.totals.netCents);
});
await check('room-charge lines contain no guest, room, PIN, or code field', async () => {
  for (const line of lines) {
    const keys = Object.keys(line).map((key) => key.toLowerCase());
    assert.equal(keys.some((key) => /guest|room|pin|code/.test(key)), false);
  }
});

assert.equal(checks, EXPECTED, `expected ${EXPECTED} checks, ran ${checks}`);
process.stdout.write(`room-charge-test: ${checks} checks passed\n`);
