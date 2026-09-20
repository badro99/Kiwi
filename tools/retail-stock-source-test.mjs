import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../assets/stock.js', import.meta.url), 'utf8');
const data = new Map();
const catalogue = {
  venue: 'wrong-demo-key',
  currentVenue() { return this.venue; },
  use(key) { this.venue = key; },
  listCategories() { return [{ id: 'decor', name: 'Décoration' }]; },
  listProducts() { return [{ id: 'vase-1', name: 'Vase Amira', categoryId: 'decor', cost: 125, priceMAD: 250, supplierId: 'sup-amira', parLevel: 4, reorderLevel: 2 }]; },
  productStock(id) { return id === 'vase-1' ? 7 : 0; },
};
const procurement = {
  doc() { return { suppliers: [{ id: 'sup-amira', name: 'Atelier Amira', phone: '+212600000000', address: 'Tanger', categories: 'decor', paymentTerms: 'Net 15', leadDays: 3, active: true }], receipts: [], orders: [], returns: [], invoices: [] }; },
};
const localStorage = { getItem: (k) => data.get(k) || null, setItem: (k, v) => data.set(k, String(v)), removeItem: (k) => data.delete(k) };
const document = {
  readyState: 'loading', addEventListener() {}, querySelector() { return null; }, querySelectorAll() { return []; },
  body: { classList: { contains() { return false; }, add() {}, remove() {} } },
};
const window = {
  document, localStorage, location: { search: '', hostname: 'kiwi-os.com' }, addEventListener() {}, dispatchEvent() {},
  KiwiConfig: { type: 'maison', plan: 'standard' }, KiwiEnv: { isReal: () => true },
  KiwiVenue: {
    getVenue: () => 'own', getVenueType: () => 'maison', isCustom: () => true,
    getInventory() { throw new Error('restaurant inventory must never be read for Maison'); },
    getSuppliers() { throw new Error('restaurant suppliers must never be read for Maison'); },
  },
  KiwiDayReport: { storeSlug: () => 'art-de-table-by-amira', businessDay: () => '2026-09-20' },
  KiwiBoutiqueVenueKey: () => 'art-de-table-by-amira', KiwiBoutiqueCatalog: catalogue, KiwiProcurement: procurement,
  KiwiRestaurantUnits: { normalize: () => 'pièce', list: () => [{ id: 'pièce', label: 'Pièce' }] },
};
window.window = window;
const context = vm.createContext({ window, document, localStorage, console, setTimeout, clearTimeout, CustomEvent: class {}, Event: class {} });
vm.runInContext(source, context, { filename: 'assets/stock.js' });

let checks = 0;
const ok = (value, message) => { assert.ok(value, message); checks += 1; console.log(`  ✓ ${message}`); };
const bridge = window.KiwiStockOperatingDay;
const rows = bridge.catalogue();
ok(catalogue.venue === 'art-de-table-by-amira', 'stock page selects the same canonical catalogue key as Maison caisse');
ok(rows.length === 1 && rows[0].name === 'Vase Amira' && rows[0].currentStock === 7, 'Maison products and live aggregate stock come from KiwiBoutiqueCatalog');
ok(rows[0].category === 'decor' && rows[0].costPerUnit === 125 && rows[0].supplier === 'Atelier Amira', 'Maison category, cost and supplier linkage survive the stock projection');
ok(bridge.categories()[0].label === 'Décoration', 'category filters come from the actual Maison catalogue');
ok(bridge.suppliers()[0].name === 'Atelier Amira' && bridge.suppliers()[0].location === 'Tanger', 'supplier list comes from KiwiProcurement');
ok(!source.includes("if (stShowReal()) {\n      return `\n      <div class=\"st-section\">\n        <div class=\"st-section-head\" style=\"justify-content:space-between;\">\n          <div style=\"display:flex; align-items:center; gap:10px;\">\n            <h3>${esc(t('ordTitle'))}</h3>"), 'real order tab is no longer an unconditional empty placeholder');
ok(source.includes("retailCatalog().updateProduct(existing.id") && source.includes("retailCatalog().archiveProduct(it.id, true)"), 'stock edits and removals write the shared Maison catalogue');
ok(source.includes("window.KiwiProcurement.updateSupplier(existing.id") && source.includes("window.KiwiProcurement.addSupplier"), 'supplier edits and additions write the shared procurement store');

console.log(`\n✓ ${checks} retail stock/source controls passed`);
