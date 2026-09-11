#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const EXPECTED = 5;
let checks = 0;
process.on('unhandledRejection', (error) => { console.error(error); process.exit(1); });
async function check(name, fn) {
  await fn();
  checks += 1;
  process.stdout.write('  ok ' + checks + ' - ' + name + '\n');
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = fs.readFileSync(path.join(root, 'assets/procurement.js'), 'utf8');
function load(plan, locationId) {
  let doc = { suppliers: [], orders: [], receipts: [], invoices: [], seq: 0 };
  const movements = [];
  const store = {
    get: () => doc,
    update(fn) { doc = fn(doc) || doc; return doc; },
  };
  const sandbox = {
    window: {
      KiwiStore: { define: () => store },
      KiwiVenue: { getPlan: () => plan },
      KiwiConfig: { plan },
      KiwiInventory: {
        locationId: () => locationId,
        add: (movement) => { movements.push(movement); return movement; },
      },
      KiwiCost: { setItemCost: () => {} },
    },
    console,
    Date,
    Map,
    Set,
  };
  vm.runInNewContext(source, sandbox, { filename: 'procurement.js' });
  return { api: sandbox.window.KiwiProcurement, movements };
}

await check('direct supplier receipt lands at the Economat location', () => {
  const runtime = load('basic', 'loc-economat');
  runtime.api.receiveDirect({
    supplierId: 'supplier-1',
    lines: [{ itemId: 'water', qty: 12, unit: 'bottle', unitCost: 2 }],
  });
  assert.equal(runtime.movements.length, 1);
  assert.equal(runtime.movements[0].locationId, 'loc-economat');
});
await check('caller cannot redirect a procurement receipt to an outlet', () => {
  const runtime = load('basic', 'loc-economat');
  runtime.api.receiveDirect({
    locationId: 'loc-rooftop',
    lines: [{ itemId: 'water', qty: 12, unit: 'bottle', unitCost: 2 }],
  });
  assert.equal(runtime.movements[0].locationId, 'loc-economat');
});
await check('purchase-order receipt uses the same Economat destination', () => {
  const runtime = load('ultra', 'loc-economat');
  const order = runtime.api.createOrder({
    supplierId: 'supplier-1',
    lines: [{ itemId: 'flour', qty: 5, unit: 'kg', unitCost: 8 }],
  });
  runtime.api.receiveOrder(order.id, {
    lines: [{ itemId: 'flour', qty: 5, unit: 'kg', unitCost: 8 }],
  });
  assert.equal(runtime.movements[0].locationId, 'loc-economat');
});
await check('pre-scope fallback remains principal for server-side Economat projection', () => {
  const runtime = load('basic', '');
  runtime.api.receiveDirect({
    lines: [{ itemId: 'water', qty: 1, unit: 'bottle', unitCost: 2 }],
  });
  assert.equal(runtime.movements[0].locationId, 'principal');
});
await check('receipt location is explicit on the movement and independent of the form', () => {
  assert.match(source, /locationId: economatReceiptLocation\(\)/);
  assert.doesNotMatch(source, /locationId: input\.locationId/);
});

assert.equal(checks, EXPECTED, 'expected ' + EXPECTED + ' executed checks, got ' + checks);
process.stdout.write('economat-procurement-location-test: ' + checks + ' checks passed\n');
