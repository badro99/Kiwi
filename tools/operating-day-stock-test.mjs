#!/usr/bin/env node
/* Focused regression coverage for the stock page's operating-day and alert
 * semantics. This loads the shipped asset and exercises its read-only seam,
 * rather than copying the implementation into a test helper. */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../assets/stock.js', import.meta.url), 'utf8');
const consumptionSource = fs.readFileSync(new URL('../assets/inventory-consumption.js', import.meta.url), 'utf8');
assert.equal(source.includes("new Date('2026-05-23"), false,
  'operational stock dates must not be pinned to the old May 23 snapshot');
assert.match(source, /KiwiDayReport\?\.businessDay/,
  'stock operational dates must delegate to the merchant-day source');
assert.match(source, /const statusOf = \(it\) => stockAlertState\(it, currentStockFor\(it\)\)\.status/,
  'production statusOf must use the shared alert computation');
assert.doesNotMatch(source, /if \(!r1Lots\.length\) return;/,
  'tier alerts must allow an exhausted primary when the configured card and next lot are real');
assert.match(source, /const primarySupplier = stockConfiguredSupplierName\(primaryCard\?\.supplierName\)/,
  'tier alerts must reject empty or placeholder primary supplier cards');
assert.match(source, /const \{ out, low, tierLow, alerts, totalAlertCount \} = overviewAlertRows\(items\)/,
  'overview must consume the shared production alert computation');
assert.match(source, /catalogue: \(\) => \{ stEnsureOverlay\(\); return getInv\(\); \}/,
  'the shipped asset must expose its real catalogue projection for regression coverage');

const listeners = new Map();
const storage = new Map();
const pipelineItems = Array.from({ length: 12 }, (_, index) => ({
  id: `form-item-${index + 1}`,
  name: index === 0 ? 'Salade' : `Form ingredient ${index + 1}`,
  category: 'epicerie',
  unit: 'kg',
  costPerUnit: 10,
  currentStock: index === 0 ? 1 : 10,
  reorderLevel: 2,
  usageThisWeek: 0,
  supplier: '',
  status: 'low',
  lastDelivery: '2026-09-08',
}));
storage.set('kiwi:stockOverlay:merchant-riad', JSON.stringify({ schemaVersion: 1, items: pipelineItems }));
const localStorage = {
  getItem(key) { return storage.get(key) || null; },
  setItem(key, value) { storage.set(key, String(value)); },
  removeItem(key) { storage.delete(key); },
};
const document = {
  readyState: 'loading',
  body: { classList: { contains: () => false } },
  addEventListener(type, fn) { listeners.set(type, fn); },
  querySelector() { return null; },
};
const window = {
  document,
  localStorage,
  Kiwi: { handlers: {} },
  KiwiEnv: { isReal: () => true },
  KiwiVenue: {
    getVenue: () => 'merchant-riad',
    isCustom: () => true,
    getInventory: () => [],
    getSuppliers: () => [],
  },
  KiwiInventory: {
    isReal: () => true,
    locationId: () => 'principal',
    unitId: () => 'kg',
    ensureOpening() {},
    balance(itemId) {
      const item = pipelineItems.find((row) => row.id === itemId);
      return item ? item.currentStock : 0;
    },
    history(itemId) {
      if (itemId === 'lot-item') return [{
        id: 'receipt-lot-item', itemId, locationId: 'principal', qty: 2,
        reason: 'receipt', occurredTs: Date.parse('2026-09-08T08:00:00Z'),
        meta: { rank: 50 },
      }];
      if (itemId === 'exhausted-primary') return [
        { id: 'receipt-primary', itemId, locationId: 'principal', qty: 1, reason: 'receipt', occurredTs: 1, meta: { rank: 1, supplierName: 'Marché Local' } },
        { id: 'receipt-secondary', itemId, locationId: 'principal', qty: 2, reason: 'receipt', occurredTs: 2, meta: { rank: 2, supplierName: 'Grossiste' } },
        { id: 'sale-primary', itemId, locationId: 'principal', qty: -1, reason: 'sale', occurredTs: 3, meta: {} },
      ];
      const item = pipelineItems.find((row) => row.id === itemId);
      return item ? [{
        id: `opening-${itemId}`,
        itemId,
        locationId: 'principal',
        qty: item.currentStock,
        reason: 'opening',
        occurredTs: Date.parse('2026-09-08T08:00:00Z'),
        meta: {},
      }] : [];
    },
  },
  KiwiI18n: { getLang: () => 'fr' },
  KiwiDayReport: {
    storeSlug: () => 'canonical-riad',
    businessDay(ts, slug) {
      assert.equal(slug, 'canonical-riad');
      // Simulates a 05:00 merchant cutoff: 00:30 belongs to the prior day.
      return Number(ts) < Date.parse('2026-09-08T05:00:00Z') ? '2026-09-07' : '2026-09-08';
    },
  },
  addEventListener(type, fn) { listeners.set(`window:${type}`, fn); },
  dispatchEvent() {},
  CustomEvent: class CustomEvent {},
};
window.window = window;

const context = {
  window,
  document,
  localStorage,
  CustomEvent: window.CustomEvent,
  setTimeout,
  clearTimeout,
  Date,
  Intl,
  Math,
  Number,
  String,
  Object,
  Array,
  JSON,
  console,
};
vm.runInNewContext(consumptionSource, context, { filename: 'assets/inventory-consumption.js' });
vm.runInNewContext(source, context, { filename: 'assets/stock.js' });

const api = window.KiwiStockOperatingDay;
assert.ok(api, 'stock operating-day seam is published by the shipped asset');
assert.equal(api.businessSlug(), 'canonical-riad', 'business date uses the canonical report slug');

const early = Date.parse('2026-09-08T00:30:00Z');
assert.equal(api.businessDate(early), '2026-09-07', 'business date honors the merchant cutoff');
assert.deepEqual(
  api.calendarDates(early, 3).map((d) => d.toISOString().slice(0, 10)),
  ['2026-09-07', '2026-09-08', '2026-09-09'],
  'calendar starts at the current merchant day and advances by business dates'
);

const noSupplierStocked = api.alertState({ name: 'Tomatoes', unit: 'kg', currentStock: 10, reorderLevel: 0, status: 'low' }, 10);
assert.equal(noSupplierStocked.status, 'ok',
  '10 kg with no supplier/reorder threshold does not create a bogus reorder alert');
assert.equal(noSupplierStocked.supplierEvidence, null, 'stocked item has no supplier evidence');
const noSupplierLow = api.alertState({ id: 'no-supplier', name: 'Tomatoes', unit: 'kg', currentStock: 10, reorderLevel: 12, status: 'low' }, 10);
assert.equal(noSupplierLow.status, 'low', 'actual stock below a configured threshold is classified low');
assert.equal(noSupplierLow.supplierEvidence, null, 'low classification without supplier/lot is not a supplier alert');
const supplierLow = api.alertState({ id: 'supplier-item', name: 'Tomatoes', unit: 'kg', supplier: 'Marché local', reorderLevel: 12, status: 'low' }, 10);
assert.equal(supplierLow.status, 'low', 'a configured low-stock threshold remains actionable');
assert.equal(supplierLow.supplierEvidence.kind, 'supplier', 'configured supplier backs the reorder alert');
const lotLow = api.alertState({ id: 'lot-item', name: 'Milk', unit: 'kg', reorderLevel: 5 }, 2);
assert.equal(lotLow.status, 'low', 'low stock with a live lot remains actionable');
assert.equal(lotLow.supplierEvidence.kind, 'lot', 'a live ledger lot backs the reorder alert even without a supplier label');
assert.equal(api.alertState({ name: 'Tomatoes', unit: 'kg', reorderLevel: 5, status: 'ok' }, 2).status, 'low',
  'actual stock below a configured threshold is low even if a stale status says ok');
assert.equal(api.alertState({ name: 'Tomatoes', unit: 'kg', reorderLevel: 5, status: 'out' }, 0).status, 'out',
  'zero stock remains an out-of-stock alert');

const catalogue = api.catalogue();
assert.equal(catalogue.length, 12, 'normal-form overlay items reach the production catalogue');
assert.equal(catalogue.filter((item) => item.supplier).length, 0,
  'normal-form items remain supplierless when no supplier was configured');
const overview = api.overviewAlerts(catalogue);
assert.equal(overview.out.length, 0, 'stocked normal-form items are not out of stock');
assert.equal(overview.low.length, 1, 'only the genuinely below-threshold Salade is low');
assert.equal(overview.tierLow.length, 0,
  'opening-balance rank-999 lots do not fabricate supplier-tier alerts');
assert.equal(overview.totalAlertCount, 1, 'overview count follows the actual production alert rows');
assert.equal(api.alertState(overview.low[0], overview.low[0].currentStock).supplierEvidence, null,
  'the genuine low item has no supplier alert without supplier or receipt-lot evidence');
assert.equal(api.alertState({ id: 'opening-only', supplier: 'Fournisseur principal', reorderLevel: 5 }, 2).supplierEvidence, null,
  'the UI placeholder supplier label is not supplier evidence');
assert.equal(overview.low[0].lastDelivery, '2026-09-08',
  'the form fixture retains its raw stale field for the enrichment check');
assert.equal(api.lastDelivery(overview.low[0]), null,
  'an opening balance without a receipt does not claim a delivery date');

pipelineItems.push({ id: 'exhausted-primary', name: 'Exhausted primary', unit: 'kg', currentStock: 2, reorderLevel: 1, usageThisWeek: 0, supplier: '', status: 'ok' });
const enriched = JSON.parse(storage.get('kiwi:stockOverlay:merchant-riad'));
enriched.items.push(pipelineItems.at(-1));
enriched.subcategories.push({
  id: 'exhausted-primary', categoryId: 'epicerie', name: 'Exhausted primary', unit: 'kg',
  defaultCost: 10, currentStock: 2, reorderLevel: 1, usageThisWeek: 0,
  suppliers: [{ id: 'primary-card', supplierName: 'Marché Local', defaultPrice: 10, rank: 1, lowBuffer: 1 }],
});
storage.set('kiwi:stockOverlay:merchant-riad', JSON.stringify(enriched));
assert.equal(enriched.subcategories.find((row) => row.id === 'exhausted-primary').suppliers[0].supplierName, 'Marché Local');
assert.equal(JSON.stringify(window.KiwiInventoryConsumption.deriveLots('exhausted-primary').map((lot) => [lot.rank, lot.remainingQty])), JSON.stringify([[2, 2]]),
  'the real consumption projection leaves only the rank-2 lot after primary depletion');
assert.equal(api.alertState(pipelineItems.at(-1), 2).status, 'ok',
  'overall stock remains healthy while the configured primary tier is exhausted');
const exhaustedOverview = api.overviewAlerts([pipelineItems.at(-1)]);
assert.equal(exhaustedOverview.tierLow.length, 1,
  'an exhausted real primary with a remaining rank-2 lot warns at the transition');
assert.equal(exhaustedOverview.tierLow[0].r1Qty, 0,
  'the exhausted primary warning reports zero remaining primary stock');

console.log('operating-day-stock-test: PASS (production overlay/catalogue/overview pipeline, business date, no-supplier, stocked, low-stock, out-of-stock)');
