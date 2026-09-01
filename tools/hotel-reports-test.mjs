#!/usr/bin/env node
import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

process.on('unhandledRejection', (error) => {
  console.error(error);
  process.exit(1);
});

const EXPECTED = 9;
let checks = 0;

async function check(name, fn) {
  await fn();
  checks += 1;
  process.stdout.write(`  ok ${checks} - ${name}\n`);
}

const modulePath = process.env.KIWI_HOTEL_REPORTS_MODULE
  ? path.resolve(process.env.KIWI_HOTEL_REPORTS_MODULE)
  : path.resolve('functions/api/inventory/_hotel-reports.js');
const {
  buildHotelInventoryReport,
  queryHotelInventoryReport,
  reconcileUnitMovements,
} = await import(pathToFileURL(modulePath).href + `?run=${Date.now()}`);

const rawCount = {
  id: 'count-alpha',
  store_id: 'unit-central',
  status: 'submitted',
  submitted_at: 3000,
};
const withoutCount = buildHotelInventoryReport({ movements: [], at: 5000 });
const countOnly = buildHotelInventoryReport({ movements: [], physicalCounts: [rawCount], at: 5000 });
await check('a physical count alone changes no balance or reconciliation', async () => {
  assert.deepEqual(countOnly.consolidated, withoutCount.consolidated);
  assert.deepEqual(countOnly.units, withoutCount.units);
  assert.equal(countOnly.physicalCounts.observed, 1);
});

const correctionMovement = {
  id: 'movement-count-alpha',
  item_id: 'item-alpha',
  location_id: 'unit-central',
  qty_milli: 500,
  reason: 'count',
  occurred_ts: 3100,
};
const corrected = buildHotelInventoryReport({
  movements: [correctionMovement],
  physicalCounts: [{ ...rawCount, status: 'applied' }],
  at: 5000,
});
await check('only the linked posted variance movement enters reconciliation', async () => {
  assert.equal(corrected.consolidated.closingMilli, 500);
  assert.equal(corrected.units[0].reconciliation.correctionsMilli, 500);
  assert.equal(corrected.units[0].reconciliation.closingMilli, 500);
  assert.equal(corrected.physicalCounts.applied, 1);
});

const movements = [
  { id: 'm1', item_id: 'item-alpha', location_id: 'unit-central', qty_milli: 10000, reason: 'opening', occurred_ts: 1000 },
  { id: 'm2', item_id: 'item-alpha', location_id: 'unit-central', qty_milli: 5000, reason: 'receipt', occurred_ts: 1100 },
  { id: 'm3', item_id: 'item-alpha', location_id: 'unit-central', qty_milli: -3000, reason: 'transfer-out', occurred_ts: 1200 },
  { id: 'm4', item_id: 'item-alpha', location_id: 'unit-outlet', qty_milli: 3000, reason: 'transfer-in', occurred_ts: 1201 },
  { id: 'm5', item_id: 'item-alpha', location_id: 'unit-central', qty_milli: -1000, reason: 'sale', occurred_ts: 1300 },
  { id: 'm6', item_id: 'item-alpha', location_id: 'unit-outlet', qty_milli: -1000, reason: 'sale', occurred_ts: 1400 },
  { id: 'm7', item_id: 'item-alpha', location_id: 'unit-outlet', qty_milli: 1000, reason: 'sale-reversal', occurred_ts: 1500 },
  { id: 'm8', item_id: 'item-alpha', location_id: 'unit-central', qty_milli: 500, reason: 'count', occurred_ts: 1600 },
  { id: 'm9', item_id: 'item-alpha', location_id: 'unit-outlet', qty_milli: -200, reason: 'manual', occurred_ts: 1700 },
  { id: 'm10', item_id: 'item-beta', location_id: 'unit-central', qty_milli: 2000, reason: 'opening', occurred_ts: 1800 },
  { id: 'future', item_id: 'item-alpha', location_id: 'unit-central', qty_milli: 9000, reason: 'receipt', occurred_ts: 9000 },
];
const report = buildHotelInventoryReport({ movements, at: 5000 });
await check('consolidated inventory equals the sum of unit balances per item', async () => {
  for (const item of report.consolidated.items) {
    const sum = report.units.reduce((total, unit) => {
      const row = unit.items.find((candidate) => candidate.itemId === item.itemId
        && candidate.variantId === item.variantId);
      return total + (row ? row.closingMilli : 0);
    }, 0);
    assert.equal(item.closingMilli, sum);
  }
  assert.equal(report.consolidated.closingMilli,
    report.units.reduce((sum, unit) => sum + unit.reconciliation.closingMilli, 0));
});
await check('each unit satisfies the documented stock equation', async () => {
  for (const unit of report.units) {
    const r = unit.reconciliation;
    assert.equal(r.computedClosingMilli, r.closingMilli);
    assert.equal(r.balanced, true);
  }
});
await check('a linked transfer pair moves units but conserves hotel stock', async () => {
  const transferReport = buildHotelInventoryReport({ movements: movements.filter((row) => /^transfer-/.test(row.reason)), at: 5000 });
  assert.equal(transferReport.consolidated.closingMilli, 0);
  assert.deepEqual(transferReport.units.map((unit) => [unit.locationId, unit.reconciliation.closingMilli]), [
    ['unit-central', -3000],
    ['unit-outlet', 3000],
  ]);
});
await check('the as-of boundary excludes future movements', async () => {
  const alpha = report.consolidated.items.find((item) => item.itemId === 'item-alpha');
  assert.equal(alpha.closingMilli, 14300);
  assert.equal(report.consolidated.closingMilli, 16300);
});
await check('unknown movement reasons are surfaced instead of producing plausible reconciliation', async () => {
  const r = reconcileUnitMovements([
    { itemId: 'item-alpha', locationId: 'unit-central', qty: 1, reason: 'future-reason' },
  ], 'unit-central');
  assert.equal(r.unclassifiedMilli, 1000);
  assert.equal(r.balanced, false);
});
await check('the V1 report exposes none of the deferred planning fields', async () => {
  const encoded = JSON.stringify(report);
  assert.equal(/parLevel|replenishment|suggestedOrder|theoreticalCount/i.test(encoded), false);
});

const queryCalls = [];
const fakeDb = {
  prepare(sql) {
    return {
      bind(...args) {
        queryCalls.push({ sql, args });
        return {
          async all() {
            return { results: sql.includes('inventory_movements') ? movements : [rawCount] };
          },
        };
      },
    };
  },
};
const queried = await queryHotelInventoryReport(fakeDb, 'hotel-fixture', { at: 5000 });
await check('the query layer binds tenant and as-of to movements and count metadata', async () => {
  assert.equal(queryCalls.length, 2);
  assert.deepEqual(queryCalls.map((call) => call.args), [
    ['hotel-fixture', 5000],
    ['hotel-fixture', 5000],
  ]);
  assert.equal(queried.consolidated.closingMilli, report.consolidated.closingMilli);
  assert.equal(queried.physicalCounts.observed, 1);
});

assert.equal(checks, EXPECTED, `expected ${EXPECTED} checks, ran ${checks}`);
process.stdout.write(`hotel-reports-test: ${checks} checks passed\n`);
