#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { createHotelTenant } from './fixtures/hotel-tenant.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
let checks = 0;
let failures = 0;
function ok(label, condition, detail = '') {
  checks += 1;
  if (condition) console.log('  ✓ ' + label);
  else { failures += 1; console.log('  ✗ ' + label + (detail ? ' — ' + detail : '')); }
}

console.log('■ Hotel location attribution (tools/hotel-location-attribution-test.mjs)');

const hotel = createHotelTenant();
const I = hotel.ledger;
const C = hotel.consumption;
ok('seed starts with 12 whisky in the economat', hotel.balanceAt('economat', 'whisky') === 12);
ok('seed starts with 6 whisky on the rooftop', hotel.balanceAt('bar-rooftop', 'whisky') === 6);
ok('hotel total is the sum of all unit balances', hotel.balanceHotel('whisky') === 18);
ok('allocator keeps legacy all-location behavior when no location is supplied',
  C.allocateCost('whisky', 18, null) === 190);

ok('economat cost uses only economat lots',
  C.allocateCost('whisky', 12, null, { locationId: 'u-economat' }) === 135);
ok('rooftop cost uses only the rooftop lot',
  C.allocateCost('whisky', 6, null, { locationId: 'u-bar-rooftop' }) === 300);
ok('economat shortage does not borrow a rooftop cost',
  C.allocateCost('whisky', 13, null, { locationId: 'u-economat' }) === null);

const beforeEconomat = hotel.balanceAt('economat', 'whisky');
const beforeRooftop = hotel.balanceAt('bar-rooftop', 'whisky');
const sale = C.record({
  ref: 'HOTEL-SALE-1',
  ts: Date.now(),
  locationId: 'u-bar-rooftop',
  lines: [{ itemId: 'whisky', name: 'Whisky', kind: 'product', qty: 2 }],
});
ok('a rooftop sale writes one stock movement', sale.written === 1);
ok('the rooftop sale reduces only rooftop stock',
  hotel.balanceAt('bar-rooftop', 'whisky') === beforeRooftop - 2
    && hotel.balanceAt('economat', 'whisky') === beforeEconomat);
ok('hotel total falls by exactly the sold quantity', hotel.balanceHotel('whisky') === 16);
const saleRow = I.history('whisky').find((row) => row.refId === 'HOTEL-SALE-1');
ok('sale movement freezes the selling outlet and its local cost',
  saleRow && saleRow.locationId === 'u-bar-rooftop' && saleRow.unitCost === 300);

/* Legacy rows stay byte-for-byte `principal` in storage. The ledger projects
 * them into the configured Économat only when computing a scoped read. */
const memory = new Map();
const merchant = 'legacy-hotel';
const stored = {
  cursor: 1,
  base: {},
  queued: [],
  unitId: 'u-economat',
  locationId: 'u-economat',
  economatLocationId: 'u-economat',
  rows: [{
    id: 'legacy-opening', itemId: 'olive-oil', variantId: '', locationId: 'principal',
    qty: 8, reason: 'opening', unitCost: 60, currency: 'MAD', refType: 'opening',
    refId: 'olive-oil', note: '', actor: '', occurredTs: 1, reversalOf: '', meta: null, cursor: 1,
  }],
};
memory.set('kiwi:inventoryLedger:v1:' + merchant, JSON.stringify(stored));
const localStorage = {
  getItem: (key) => memory.has(key) ? memory.get(key) : null,
  setItem: (key, value) => memory.set(key, String(value)),
  removeItem: (key) => memory.delete(key),
};
const window = {
  localStorage,
  KiwiEnv: { isReal: () => true },
  KiwiCloudDoc: { currentSlug: () => merchant },
  addEventListener() {},
};
window.window = window;
const context = vm.createContext({
  window, localStorage, navigator: { onLine: false }, crypto: globalThis.crypto,
  console, Date, Math, JSON, Map, Set, Promise,
  setTimeout() { return 0; }, setInterval() { return 0; }, clearTimeout() {},
});
vm.runInContext(read('assets/inventory-ledger.js'), context, { filename: 'inventory-ledger.js' });
ok('legacy principal balance is visible at the economat location',
  window.KiwiInventory.balance('olive-oil', { locationId: 'u-economat' }) === 8);
const projected = window.KiwiInventory.history('olive-oil', { locationId: 'u-economat' });
ok('location-filtered history projects principal to economat',
  projected.length === 1 && projected[0].locationId === 'u-economat');
const unchanged = JSON.parse(memory.get('kiwi:inventoryLedger:v1:' + merchant));
ok('legacy storage is never rewritten during mapping', unchanged.rows[0].locationId === 'principal');
ok('unfiltered history preserves its legacy representation',
  window.KiwiInventory.history('olive-oil')[0].locationId === 'principal');

const stockCode = read('assets/stock.js');
const countCode = read('functions/api/inventory/counts.js');
const movementCode = read('functions/api/inventory/movements.js');
ok('receipts and manual adjustments use the resolved stock location',
  /function moveStock[\s\S]{0,900}itemId:\s*it\.id,\s*locationId,\s*qty/.test(stockCode));
ok('new stock openings carry the resolved location',
  /ensureOpening\(item\.id, currentStock, \{ unitCost: costPerUnit, locationId: stockLocationId\(\)/.test(stockCode));
ok('approved count movements freeze the counted unit id',
  /JSON\.stringify\(\{ countId, unitId: row\.store_id/.test(countCode));
ok('count system balances are filtered to the selected unit location',
  /fetchLedgerBalances\(env, merchant, scope, storeId\)/.test(countCode) && /scope\.storageLocations\(unit\.locationId\)/.test(countCode));
ok('server read projection maps legacy principal to economat',
  /scope\.projectLocation\(r\.location_id\)/.test(movementCode));

if (failures) process.exit(1);
console.log(`  ✓ hotel location attribution (${checks} checks)`);
