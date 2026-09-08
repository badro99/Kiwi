#!/usr/bin/env node
/*
 * Kiwi · operating-day inventory cycle (isolated production-path test)
 *
 * This deliberately loads the real browser modules in a VM.  It exercises the
 * same CaisseStock bridge used by kiwi-caisse.html for receipt, count and
 * waste, then the real recipe-driven sale consumer.  No sales are inserted
 * into a database and the VM is network-disabled.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const merchant = 'operating-day-cycle';
const newIntent = (prefix) => `${prefix}:${globalThis.crypto.randomUUID()}`;
const storageMap = new Map();
const localStorage = {
  getItem: (key) => storageMap.has(key) ? storageMap.get(key) : null,
  setItem: (key, value) => storageMap.set(key, String(value)),
  removeItem: (key) => storageMap.delete(key),
};

const overlay = {
  schemaVersion: 1,
  items: [
    { id: 'flour', name: 'Farine', category: 'epicerie', unit: 'kg', currentStock: 10, parLevel: 10, reorderLevel: 2, costPerUnit: 10, supplier: 'Marché Local' },
    { id: 'sauce', name: 'Sauce tomate', category: 'epicerie', unit: 'kg', currentStock: 4, parLevel: 4, reorderLevel: 1, costPerUnit: 5, supplier: '' },
  ],
  subcategories: [],
  sups: [{ id: 'supplier-local', name: 'Marché Local' }],
  cats: [{ id: 'epicerie', label: 'Épicerie' }],
  itemOv: {}, supOv: {}, delItems: [], delSups: [], stockOv: {},
};
storageMap.set(`kiwi:stockOverlay:${merchant}`, JSON.stringify(overlay));

const timers = [];
let networkCalls = 0;
const storeDocs = new Map();
const fakeStore = {
  define(name) {
    if (!storeDocs.has(name)) storeDocs.set(name, { items: {} });
    return {
      get: () => storeDocs.get(name),
      update: (fn) => {
        const next = fn(JSON.parse(JSON.stringify(storeDocs.get(name))));
        storeDocs.set(name, next || storeDocs.get(name));
        return storeDocs.get(name);
      },
      subscribe: () => () => {},
    };
  },
};

const context = {
  window: {
    KiwiStore: fakeStore,
    KiwiEnv: { isReal: () => true },
    KiwiCloudDoc: {
      currentSlug: () => merchant,
      slugFor: () => merchant,
      attach: () => ({ bind: () => Promise.resolve(false), pull: () => false, push: () => false }),
      mergeDefault: (mine, theirs) => Object.assign({}, theirs, mine),
    },
    KiwiPlatform: { pairedMerchant: () => merchant },
    localStorage,
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => {},
    setTimeout: () => 0,
    clearTimeout: () => {},
    setInterval: () => 0,
    clearInterval: () => {},
    fetch: () => { networkCalls++; throw new Error('network disabled in isolated test'); },
    console,
  },
  localStorage,
  navigator: { onLine: false },
  document: { readyState: 'complete', addEventListener: () => {}, removeEventListener: () => {}, body: { classList: { add: () => {}, remove: () => {}, contains: () => false } } },
  crypto: globalThis.crypto,
  console, Date, Math, JSON, Map, Set, Promise,
  setTimeout: () => 0,
  clearTimeout: () => {},
  setInterval: () => 0,
  clearInterval: () => {},
};
context.window.window = context.window;
vm.createContext(context);

// These are the production modules, not test doubles for their behavior.
for (const file of [
  'assets/restaurant-units.js',
  'assets/inventory-ledger.js',
  'assets/stock.js',
  'assets/caisse-stock-sync.js',
  'assets/restaurant-recipes.js',
  'assets/cost.js',
  'assets/inventory-consumption.js',
]) vm.runInContext(read(file), context, { filename: file });

const win = context.window;
const Ledger = win.KiwiInventory;
const Stock = win.KiwiCaisseStock;
const Recipes = win.KiwiRestaurantRecipes;
const Consumption = win.KiwiInventoryConsumption;
assert.equal(Ledger.merchant(), merchant, 'ledger uses the canonical CloudDoc merchant slug');
assert.ok(Stock && Recipes && Consumption, 'production inventory modules loaded');

const initial = Stock.snapshot();
assert.equal(initial.items.find((x) => x.id === 'flour').stock, 10);
assert.equal(initial.items.find((x) => x.id === 'sauce').stock, 4);
assert.equal(Ledger.history('flour').filter((x) => x.reason === 'opening').length, 1);

// These calls mirror the normal kiwi-caisse handlers (commitRecept, count and
// commitWaste), whose source wiring is checked below.
const supplierCard = Stock.resolveSupplierCard('flour', 'Marché Local');
assert.equal(supplierCard.rank, 1, 'receipt has a configured supplier card/rank');
const receiptIntent = newIntent('receipt');
const receiptLine0 = `${receiptIntent}:line:0`;
const receiptLine1 = `${receiptIntent}:line:1`;
Stock.move('flour', 3, 'receipt', receiptLine0, 10, {
  operationId: receiptLine0,
  supplierId: supplierCard.id, supplierName: 'Marché Local', rank: supplierCard.rank,
  receiptRef: 'BON-DAILY-7', purchaseQty: 3, purchaseUnit: 'kg', factor: 1,
});
Stock.move('flour', 2, 'receipt', receiptLine1, 10, {
  operationId: receiptLine1,
  supplierId: supplierCard.id, supplierName: 'Marché Local', rank: supplierCard.rank,
  receiptRef: 'BON-DAILY-7', purchaseQty: 2, purchaseUnit: 'kg', factor: 1,
});
assert.equal(Stock.snapshot().items.find((x) => x.id === 'flour').stock, 15, 'receipt increases real ledger stock');

const countIntent = newIntent('count');
const countDiff = Stock.count('flour', 13, countIntent, null, { operationId: countIntent });
assert.equal(countDiff, -2, 'count records the physical count delta');
assert.equal(Stock.snapshot().items.find((x) => x.id === 'flour').stock, 13);

const wasteIntent = newIntent('waste');
Stock.move('flour', -1, 'loss', wasteIntent, 10, { operationId: wasteIntent, wasteReason: 'casse', actorId: 'operator-1' }, { id: 'operator-1', name: 'Opérateur' });
assert.equal(Stock.snapshot().items.find((x) => x.id === 'flour').stock, 12, 'waste decreases real ledger stock');

Recipes.save('dish-cycle', {
  itemName: 'Plat cycle', portions: 1,
  ingredients: [
    { stockId: 'flour', name: 'Farine', qty: 2, unit: 'kg' },
    { stockId: 'sauce', name: 'Sauce tomate', qty: 1, unit: 'kg' },
  ],
});
const sale = { ref: 'sale-cycle-1', ts: 1725753600000, lines: [{ itemId: 'dish-cycle', name: 'Plat cycle', kind: 'product', qty: 1 }] };
const firstConsumption = Consumption.record(sale);
assert.equal(firstConsumption.written, 2, 'recipe sale writes ingredient movements through production consumer');
assert.equal(Stock.snapshot().items.find((x) => x.id === 'flour').stock, 10);
assert.equal(Stock.snapshot().items.find((x) => x.id === 'sauce').stock, 3);
assert.equal(Ledger.balance('dish-cycle'), 0, 'finished recipe item is not fabricated in inventory');

// Replay the actual callers without supplying a ledger movement ID. The
// bridge must derive one from the caller's operation reference.
const beforeRetry = { flour: Ledger.balance('flour'), rows: Ledger.history().length };
Stock.move('flour', 3, 'receipt', receiptLine0, 10, {
  operationId: receiptLine0,
  supplierId: supplierCard.id, supplierName: 'Marché Local', rank: supplierCard.rank,
  receiptRef: 'BON-DAILY-7', purchaseQty: 3, purchaseUnit: 'kg', factor: 1,
});
const afterReceiptRetry = { flour: Ledger.balance('flour'), rows: Ledger.history().length };
assert.deepEqual(afterReceiptRetry, beforeRetry, 'receipt double-submit is idempotent without an injected ledger movement ID');
Stock.move('flour', 2, 'receipt', receiptLine1, 10, {
  operationId: receiptLine1,
  supplierId: supplierCard.id, supplierName: 'Marché Local', rank: supplierCard.rank,
  receiptRef: 'BON-DAILY-7', purchaseQty: 2, purchaseUnit: 'kg', factor: 1,
});
assert.deepEqual({ flour: Ledger.balance('flour'), rows: Ledger.history().length }, beforeRetry, 'same-ingredient second receipt line also replays once');
assert.equal(Stock.move('flour', 6, 'receipt', receiptLine0, 10, {
  operationId: receiptLine0, supplierId: supplierCard.id, supplierName: 'Marché Local', rank: supplierCard.rank,
  receiptRef: 'BON-DAILY-7', purchaseQty: 6, purchaseUnit: 'kg', factor: 1,
}), null, 'changed retry payload is rejected rather than silently ignored');
assert.equal(Stock.move('flour', 3, 'receipt', receiptLine0, 11, {
  operationId: receiptLine0, supplierId: 'different-supplier', supplierName: 'Autre', rank: 2,
  receiptRef: 'BON-DAILY-7', purchaseQty: 3, purchaseUnit: 'kg', factor: 1,
}), null, 'changed retry cost/supplier payload is rejected');
assert.equal(Stock.move('flour', 3, 'receipt', receiptLine0, 10, {
  operationId: receiptLine0, supplierId: supplierCard.id, supplierName: 'Marché Local', rank: supplierCard.rank,
  receiptRef: 'BON-DAILY-7', purchaseQty: 3, purchaseUnit: 'kg', factor: 1, expiresAt: 123,
}), null, 'changed retry expiry payload is rejected');
assert.equal(Stock.move('flour', 3, 'receipt', receiptLine0, 10, {
  operationId: receiptLine0, supplierId: supplierCard.id, supplierName: 'Marché Local', rank: supplierCard.rank,
  receiptRef: 'BON-DAILY-7', purchaseQty: 3, purchaseUnit: 'kg', factor: 1,
  actorId: 'different-operator', externalRef: 'different-invoice', note: 'different audit note'
}, { id: 'different-operator', name: 'Different Operator' }), null, 'changed actor/audit metadata is rejected');
assert.equal(Ledger.balance('flour'), beforeRetry.flour, 'conflicting retry does not change stock');
const beforeCountRetry = { flour: Ledger.balance('flour'), rows: Ledger.history().length };
assert.equal(Stock.count('flour', 13, countIntent, null, { operationId: countIntent }), countDiff, 'count retry returns the original remembered delta');
const afterCountRetry = { flour: Ledger.balance('flour'), rows: Ledger.history().length };
assert.deepEqual(afterCountRetry, beforeCountRetry, 'count double-submit is idempotent without an injected ledger movement ID');
assert.equal(Stock.count('flour', 12, countIntent, null, { operationId: countIntent }), null, 'changed count target is rejected');
const beforeWasteRetry = { flour: Ledger.balance('flour'), rows: Ledger.history().length };
Stock.move('flour', -1, 'loss', wasteIntent, 10, { operationId: wasteIntent, wasteReason: 'casse', actorId: 'operator-1' }, { id: 'operator-1', name: 'Opérateur' });
const afterWasteRetry = { flour: Ledger.balance('flour'), rows: Ledger.history().length };
assert.deepEqual(afterWasteRetry, beforeWasteRetry, 'waste double-submit is idempotent without an injected ledger movement ID');
assert.equal(Stock.move('flour', -1, 'loss', wasteIntent, 10, {
  operationId: wasteIntent, wasteReason: 'casse', lotId: 'LOT-CHANGED', actorId: 'operator-1'
}, { id: 'operator-1', name: 'Opérateur' }), null, 'changed retry lot payload is rejected');
assert.equal(Ledger.balance('flour'), afterWasteRetry.flour, 'changed lot retry does not change stock');

const beforeSaleRetry = Ledger.history().length;
const secondConsumption = Consumption.record(sale);
assert.equal(secondConsumption.written, 2, 'production consumer reports deterministic replay rows');
assert.equal(Ledger.history().length, beforeSaleRetry, 'recipe sale retry does not add inventory movements');
assert.equal(Ledger.balance('flour'), afterWasteRetry.flour, 'recipe retry does not double-consume flour');

const reloadWindow = {
  KiwiEnv: { isReal: () => true },
  KiwiCloudDoc: {
    currentSlug: () => merchant,
    attach: () => ({ bind: () => Promise.resolve(false), pull: () => false, push: () => false }),
  },
  localStorage,
  addEventListener: () => {},
  dispatchEvent: () => {},
  setTimeout: () => 0,
  setInterval: () => 0,
  clearTimeout: () => {},
  clearInterval: () => {},
  console,
};
const reloadContext = vm.createContext({
  window: reloadWindow,
  localStorage,
  navigator: { onLine: false },
  document: { readyState: 'complete', addEventListener: () => {}, removeEventListener: () => {} },
  crypto: globalThis.crypto,
  console, Date, Math, JSON, Map, Set, Promise,
  setTimeout: () => 0, setInterval: () => 0, clearTimeout: () => {}, clearInterval: () => {},
});
reloadWindow.window = reloadWindow;
vm.runInContext(read('assets/inventory-ledger.js'), reloadContext, { filename: 'inventory-ledger.reload.js' });
vm.runInContext(read('assets/caisse-stock-sync.js'), reloadContext, { filename: 'caisse-stock-sync.reload.js' });
const ReloadLedger = reloadWindow.KiwiInventory;
const ReloadStock = reloadWindow.KiwiCaisseStock;
assert.equal(ReloadLedger.balance('flour'), afterWasteRetry.flour, 'ledger balance survives a VM reload');
const reloadRows = ReloadLedger.history().length;
ReloadStock.move('flour', 3, 'receipt', receiptLine0, 10, {
  operationId: receiptLine0, supplierId: supplierCard.id, supplierName: 'Marché Local', rank: supplierCard.rank,
  receiptRef: 'BON-DAILY-7', purchaseQty: 3, purchaseUnit: 'kg', factor: 1,
});
assert.equal(ReloadLedger.history().length, reloadRows, 'receipt retry remains deduped after reload');
assert.equal(ReloadLedger.balance('flour'), afterWasteRetry.flour, 'reload retry does not alter stock');

const distinctReceiptIntent = newIntent('receipt');
Stock.move('flour', 5, 'receipt', `${distinctReceiptIntent}:line:0`, 10, {
  operationId: `${distinctReceiptIntent}:line:0`,
  supplierId: supplierCard.id, supplierName: 'Marché Local', rank: supplierCard.rank,
  receiptRef: 'BON-DAILY-7', purchaseQty: 5, purchaseUnit: 'kg', factor: 1,
});
assert.equal(Ledger.balance('flour'), 15, 'a distinct receipt reference remains a distinct movement');

Stock.move('sauce', 1, 'receipt', 'BON-DAILY-7', 5, { supplierName: 'Marché Local' });
Stock.move('sauce', 1, 'receipt', 'BON-DAILY-7', 5, { supplierName: 'Marché Local' });
assert.equal(Ledger.balance('sauce'), 5, 'reused human receipt reference is not an implicit dedupe key');
const longLineIntent = `${receiptIntent}:line:123`;
Stock.move('sauce', 1, 'receipt', longLineIntent, 5, { operationId: longLineIntent, supplierName: 'Marché Local', expiresAt: 123 });
assert.ok(Ledger.history('sauce').some((row) => row.id === `inv-caisse-${longLineIntent}` && row.id.length <= 80), 'long valid line intent remains stable within storage limit');
assert.equal(Stock.move('sauce', 1, 'receipt', longLineIntent, 5, { operationId: longLineIntent, supplierName: 'Marché Local', expiresAt: 456 }), null, 'changed long-line expiry is rejected');
assert.equal(Stock.move('sauce', 1, 'receipt', 'human ref *invalid*', 5, { operationId: 'human ref *invalid*' }), null, 'invalid explicit operation ID is rejected, not randomized');
assert.equal(Ledger.balance('sauce'), 6, 'invalid/conflicting operation IDs do not alter stock');

// Isolated SQLite acceptance seam: the same movement UUIDs are accepted once,
// then ignored on retry, matching functions/api/inventory/movements.js.
const db = new DatabaseSync(':memory:');
db.exec('CREATE TABLE inventory_movements (id TEXT PRIMARY KEY, item_id TEXT NOT NULL, qty REAL NOT NULL)');
const insert = db.prepare('INSERT OR IGNORE INTO inventory_movements (id, item_id, qty) VALUES (?, ?, ?)');
const rows = Ledger.history();
for (const row of rows) insert.run(row.id, row.itemId, row.qty);
const accepted = db.prepare('SELECT COUNT(*) AS n FROM inventory_movements').get().n;
for (const row of rows) insert.run(row.id, row.itemId, row.qty);
assert.equal(db.prepare('SELECT COUNT(*) AS n FROM inventory_movements').get().n, accepted, 'isolated SQLite movement acceptance is retry-safe');

const caisseSource = read('kiwi-caisse.html');
const countSource = read('assets/pos-inventory-count.js');
const countApiSource = read('functions/api/inventory/counts.js');
assert.match(caisseSource, /KiwiCaisseStock\.move\(it\.id, stockQty, 'receipt'/, 'normal receive handler uses CaisseStock.move(receipt)');
assert.match(caisseSource, /KiwiPosInventoryCount\.open\(\{ engine: 'ledger' \}\)/, 'normal count handler opens the ledger count module');
assert.match(caisseSource, /KiwiCaisseStock\.move\(it\.id, -qty, ledgerReason/, 'normal waste handler uses CaisseStock.move');
assert.match(caisseSource, /skReceptIntentId = stockIntentId\('receipt'\)/, 'receipt intent is created when the modal opens');
assert.match(caisseSource, /operationId: receiptIntentId \+ ':line:' \+ lineIndex/, 'receipt movement IDs are line-specific within one intent');
assert.match(caisseSource, /skWasteIntentId = stockIntentId\('waste'\)/, 'waste intent is created when the modal opens');
assert.match(caisseSource, /operationId: wasteRef/, 'waste caller carries its modal intent');
assert.match(caisseSource, /if \(!movement\) \{ failed = true; return; \}/, 'receive caller stops success on movement conflict');
assert.match(caisseSource, /if \(!movement\) \{ toast\('Perte refusée/, 'waste caller surfaces movement conflict');
assert.match(countSource, /intentId: newCountIntentId\(\)/, 'count intent is created with the dialog');
assert.match(countSource, /id: countState\.intentId/, 'count retry carries the dialog intent');
assert.match(countApiSource, /existing\.status === 'submitted'/, 'count API replays the frozen submitted intent');
assert.match(countApiSource, /replayed: true/, 'count API marks an idempotent replay');
assert.match(countApiSource, /status IN \('superseded', 'rejected'\)/, 'count upsert cannot overwrite a submitted intent during a retry race');
assert.ok(Ledger.history().every((row) => row.id.length <= 80), 'all generated ledger IDs stay within the 80-character storage limit');
assert.equal(networkCalls, 0, 'isolated VM performed no network/live write');

console.log(`operating-day inventory cycle: ${rows.length} ledger movements, SQLite retry-safe, no network calls`);
