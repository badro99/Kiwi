#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import {
  allocateTransferAllocation, allocateTransferCost,
} from '../functions/api/inventory/internal-requests.js';

const EXPECTED = 7;
let checks = 0;
process.on('unhandledRejection', (error) => { console.error(error); process.exit(1); });
async function check(name, fn) {
  await fn();
  checks += 1;
  process.stdout.write('  ok ' + checks + ' - ' + name + '\n');
}

const rows = [
  {
    id: 'lot-late', qty_milli: 10000, unit_cost_cents: 200,
    occurred_ts: 10, srv_ts: 10,
    meta: JSON.stringify({ expiresAt: 200, batchNum: 'B', supplierName: 'Supplier B' }),
  },
  {
    id: 'lot-early', qty_milli: 10000, unit_cost_cents: 100,
    occurred_ts: 20, srv_ts: 20,
    meta: JSON.stringify({ expiresAt: 100, batchNum: 'A', supplierName: 'Supplier A' }),
  },
  { id: 'prior-sale', qty_milli: -2000, occurred_ts: 30, srv_ts: 30, meta: '{}' },
];
const allocation = allocateTransferAllocation(rows, 10000);
await check('FEFO allocation records every source lot and exact quantity', () => {
  assert.deepEqual(allocation.allocations, [
    {
      sourceMovementId: 'lot-early', qtyMilli: 8000, unitCost: 1,
      expiresAt: 100, batchNum: 'A', supplierName: 'Supplier A',
    },
    {
      sourceMovementId: 'lot-late', qtyMilli: 2000, unitCost: 2,
      expiresAt: 200, batchNum: 'B', supplierName: 'Supplier B',
    },
  ]);
});
await check('blended valuation stays one four-decimal rate', () => {
  assert.equal(allocation.unitCost, 1.2);
  assert.equal(allocateTransferCost(rows, 10000), 1.2);
});
await check('destination inherits the earliest allocated expiry', () => {
  assert.equal(allocation.expiresAt, 100);
});
await check('unknown source cost still refuses the transfer', () => {
  const unknown = rows.map((row) => ({ ...row }));
  unknown[1].unit_cost_cents = null;
  assert.equal(allocateTransferAllocation(unknown, 10000), null);
});

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const consumptionSource = fs.readFileSync(path.join(root, 'assets/inventory-consumption.js'), 'utf8');
const destinationRows = [
  {
    id: 'transfer-in-1', itemId: 'water', locationId: 'loc-bar', qty: 10,
    reason: 'transfer-in', unitCost: 1.2, occurredTs: 1000,
    meta: { expiresAt: 100, allocationBreakdown: allocation.allocations },
  },
  {
    id: 'spoilage-1', itemId: 'water', locationId: 'loc-bar', qty: -2,
    reason: 'spoilage', unitCost: 1.2, occurredTs: 1001, meta: {},
  },
  {
    id: 'return-1', itemId: 'water', locationId: 'loc-bar', qty: -3,
    reason: 'transfer-out', unitCost: 1.2, occurredTs: 1002, meta: {},
  },
];
const sandbox = {
  window: {
    KiwiInventory: {
      history: () => destinationRows,
      listItems: () => [{ id: 'water', name: 'Water', unit: 'bottle' }],
    },
    KiwiCost: { doc: () => ({}) },
  },
  console,
  fetch: undefined,
  setTimeout,
  clearTimeout,
};
vm.runInNewContext(consumptionSource, sandbox, { filename: 'inventory-consumption.js' });
await check('transfer-in creates a destination lot with inherited expiry and cost', () => {
  const lots = sandbox.window.KiwiInventoryConsumption.deriveLots('water', { locationId: 'loc-bar' });
  assert.equal(lots.length, 1);
  assert.equal(lots[0].expiresAt, 100);
  assert.equal(lots[0].unitCost, 1.2);
});
await check('partial return and spoilage conserve destination quantity and value', () => {
  const lots = sandbox.window.KiwiInventoryConsumption.deriveLots('water', { locationId: 'loc-bar' });
  assert.equal(lots[0].remainingQty, 5);
  assert.equal(Math.round(lots[0].remainingQty * lots[0].unitCost * 100) / 100, 6);
});
await check('both transfer directions persist the immutable allocation breakdown', () => {
  const route = fs.readFileSync(path.join(root, 'functions/api/inventory/internal-requests.js'), 'utf8');
  assert.match(route, /SELECT id, qty_milli/);
  assert.match(route, /allocationBreakdown: transfer\.allocation\.allocations/);
  assert.match(route, /expiresAt: transfer\.allocation\.expiresAt/);
});

assert.equal(checks, EXPECTED, 'expected ' + EXPECTED + ' executed checks, got ' + checks);
process.stdout.write('economat-transfer-provenance-test: ' + checks + ' checks passed\n');
