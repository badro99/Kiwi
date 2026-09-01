#!/usr/bin/env node
import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { makeSession, SESS_COOKIE, TILL_COOKIE, tillToken } from '../functions/auth/_lib.js';

process.on('unhandledRejection', (error) => {
  console.error(error);
  process.exit(1);
});

const EXPECTED = 14;
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
const routePath = path.resolve(process.env.KIWI_HOTEL_REPORTS_ROUTE
  || 'functions/api/inventory/hotel-reports.js');
const hotelReportsRoute = await import(pathToFileURL(routePath).href + `?run=${Date.now()}`);

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
await check('unknown movement reasons are surfaced even when their quantities cancel', async () => {
  const r = reconcileUnitMovements([
    { itemId: 'item-alpha', locationId: 'unit-central', qty: 1, reason: 'future-reason' },
    { itemId: 'item-alpha', locationId: 'unit-central', qty: -1, reason: 'future-reason' },
  ], 'unit-central');
  assert.equal(r.unclassifiedMilli, 0);
  assert.equal(r.unclassifiedCount, 2);
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
await check('missing count storage rejects instead of returning a plausible count-free report', async () => {
  const missingDb = {
    prepare(sql) {
      return { bind() { return { async all() {
        if (sql.includes('inventory_counts')) throw new Error('no such table');
        return { results: movements };
      } }; } };
    },
  };
  await assert.rejects(
    () => queryHotelInventoryReport(missingDb, 'hotel-fixture', { at: 5000 }),
    (error) => error.dependency === 'inventory_counts',
  );
});

const SECRET = 'hotel-report-route-secret-32-bytes';
const MERCHANT = 'hotel-atlas';
const registry = {
  units: [
    { id: 'unit-central', kind: 'economat', name: 'Economat', storeType: 'economat', locationId: 'unit-central', active: true },
    { id: 'unit-outlet', kind: 'outlet', name: 'Outlet', storeType: 'bar', locationId: 'unit-outlet', active: true },
  ],
  terminalUnits: {},
};
function makeRouteDb({ rows = movements, missingCounts = false } = {}) {
  return {
    prepare(sql) {
      const query = String(sql).replace(/\s+/g, ' ').trim();
      const statement = {
        args: [],
        bind(...args) { statement.args = args; return statement; },
        async first() {
          if (query.includes('SELECT till_epoch FROM merchant_config')) return { till_epoch: 0 };
          if (query.includes('SELECT account_id FROM merchant_config')) return { account_id: 'owner-1' };
          if (query.includes('SELECT business FROM accounts')) return { business: 'Hotel Atlas' };
          if (query.includes('SELECT type FROM merchant_config')) return { type: 'hotel' };
          if (query.includes("feature = 'hotel-units'")) return { data: JSON.stringify(registry) };
          return null;
        },
        async all() {
          if (query.includes('inventory_movements')) return { results: rows };
          if (query.includes('inventory_counts')) {
            if (missingCounts) throw new Error('no such table: inventory_counts');
            return { results: [rawCount] };
          }
          return { results: [] };
        },
      };
      return statement;
    },
  };
}
const ownerToken = await makeSession('owner-1', SECRET);
const ownerRequest = () => new Request(
  `https://kiwi.test/api/inventory/hotel-reports?merchant=${MERCHANT}&at=5000`,
  { headers: { cookie: `${SESS_COOKIE}=${ownerToken}` } },
);
await check('the owner route exposes the scoped as-of report', async () => {
  const response = await hotelReportsRoute.onRequestGet({
    request: ownerRequest(), env: { AUTH_SECRET: SECRET, DB: makeRouteDb() },
  });
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.report.asOf, 5000);
  assert.deepEqual(body.report.units.map((unit) => unit.locationId), ['unit-central', 'unit-outlet']);
});
await check('a paired till cannot read hotel inventory or staff behavior', async () => {
  const till = await tillToken(SECRET, MERCHANT);
  const request = new Request(
    `https://kiwi.test/api/inventory/hotel-reports?merchant=${MERCHANT}`,
    { headers: { cookie: `${TILL_COOKIE}=${till}` } },
  );
  const response = await hotelReportsRoute.onRequestGet({
    request, env: { AUTH_SECRET: SECRET, DB: makeRouteDb() },
  });
  assert.equal(response.status, 403);
});
await check('the route returns 409 when an unknown reason makes reconciliation unsafe', async () => {
  const unsafe = [...movements, {
    id: 'unknown', item_id: 'item-alpha', location_id: 'unit-outlet',
    qty_milli: 1, reason: 'future-reason', occurred_ts: 2000,
  }];
  const response = await hotelReportsRoute.onRequestGet({
    request: ownerRequest(), env: { AUTH_SECRET: SECRET, DB: makeRouteDb({ rows: unsafe }) },
  });
  const body = await response.json();
  assert.equal(response.status, 409);
  assert.equal(body.error, 'inventory-unreconciled');
});
await check('an absent counts table is explicit unavailability, never zero observed counts', async () => {
  const response = await hotelReportsRoute.onRequestGet({
    request: ownerRequest(), env: { AUTH_SECRET: SECRET, DB: makeRouteDb({ missingCounts: true }) },
  });
  const body = await response.json();
  assert.equal(response.status, 503);
  assert.equal(body.dependency, 'inventory_counts');
  assert.equal(body.report, undefined);
});

assert.equal(checks, EXPECTED, `expected ${EXPECTED} checks, ran ${checks}`);
process.stdout.write(`hotel-reports-test: ${checks} checks passed\n`);
