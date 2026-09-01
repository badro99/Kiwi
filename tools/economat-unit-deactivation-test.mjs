#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { hotelUnitDeactivationBlockers } from '../functions/api/inventory/_hotel-unit-deactivation.js';

const EXPECTED = 6;
let checks = 0;
process.on('unhandledRejection', (error) => { console.error(error); process.exit(1); });
async function check(name, fn) {
  await fn();
  checks += 1;
  process.stdout.write('  ok ' + checks + ' - ' + name + '\n');
}

const activeRegistry = { units: [
  { id: 'economat', kind: 'economat', locationId: 'loc-economat', active: true },
  { id: 'bar', kind: 'outlet', locationId: 'loc-bar', active: true },
] };
const inactiveRegistry = { units: [
  activeRegistry.units[0],
  { ...activeRegistry.units[1], active: false },
] };
class FakeDb {
  constructor(row) { this.row = row; this.calls = 0; }
  prepare(sql) {
    const db = this;
    assert.match(sql, /inventory_movements/);
    assert.match(sql, /hotel_internal_requests/);
    return {
      bind(...args) {
        assert.deepEqual(args, [
          'hotel-atlas', 'loc-bar', 'hotel-atlas', 'bar',
          'hotel-atlas', 'bar', 'hotel-atlas', 'bar',
        ]);
        return this;
      },
      async first() { db.calls += 1; return db.row; },
    };
  }
}

await check('unchanged registries do not query operational tables', async () => {
  const db = new FakeDb({});
  const result = await hotelUnitDeactivationBlockers(db, 'hotel-atlas', activeRegistry, activeRegistry);
  assert.equal(result.ok, true);
  assert.equal(db.calls, 0);
});
await check('non-zero on-hand blocks deactivation', async () => {
  const result = await hotelUnitDeactivationBlockers(
    new FakeDb({ on_hand_milli: 1000 }), 'hotel-atlas', activeRegistry, inactiveRegistry,
  );
  assert.equal(result.ok, false);
  assert.equal(result.error, 'hotel-unit-not-drained');
  assert.equal(result.blockers[0].onHandMilli, 1000);
});
await check('negative on-hand also blocks instead of hiding an imbalance', async () => {
  const result = await hotelUnitDeactivationBlockers(
    new FakeDb({ on_hand_milli: -1000 }), 'hotel-atlas', activeRegistry, inactiveRegistry,
  );
  assert.equal(result.ok, false);
});
await check('open requests, reservations and handover transit are reported explicitly', async () => {
  const result = await hotelUnitDeactivationBlockers(new FakeDb({
    on_hand_milli: 0, open_requests: 2, reserved_lines: 1, in_transit_lines: 1,
  }), 'hotel-atlas', activeRegistry, inactiveRegistry);
  assert.equal(result.ok, false);
  assert.deepEqual(result.blockers[0], {
    unitId: 'bar', locationId: 'loc-bar', onHandMilli: 0,
    openRequests: 2, reservedLines: 1, inTransitLines: 1,
  });
});
await check('a fully drained unit with no open work may be deactivated', async () => {
  const result = await hotelUnitDeactivationBlockers(new FakeDb({
    on_hand_milli: 0, open_requests: 0, reserved_lines: 0, in_transit_lines: 0,
  }), 'hotel-atlas', activeRegistry, inactiveRegistry);
  assert.equal(result.ok, true);
});
await check('store save enforces the blocker while manager drain semantics stay intact', () => {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const store = fs.readFileSync(path.join(root, 'functions/api/store.js'), 'utf8');
  const scope = fs.readFileSync(path.join(root, 'functions/api/inventory/_unit-scope.js'), 'utf8');
  assert.match(store, /await hotelUnitDeactivationBlockers\(env\.DB, merchant, mine, clean\.value\)/);
  assert.match(scope, /return role === 'manager' && reason === 'transfer-out'/);
  assert.match(scope, /publicScope\(true, 'manager', units, active, null, economat\)/);
});

assert.equal(checks, EXPECTED, 'expected ' + EXPECTED + ' executed checks, got ' + checks);
process.stdout.write('economat-unit-deactivation-test: ' + checks + ' checks passed\n');
