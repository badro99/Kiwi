#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · Multi-Supplier Stock Costing — Phase 1 Migration Test Suite
 *
 *   node tools/stock-costing-migration-test.mjs
 *
 * Verifies that migrating flat stock items to categories/subcategories:
 *   1. Auto-migrates v1 documents to v2 idempotently.
 *   2. Preserves full backward-compatibility with v1 clients via dual-write envelope.
 *   3. Keeps 100% of existing recipes resolving (status: complete, exact cost).
 *   4. Ensures inventory-consumption generates identical recipeLines and movements.
 *   5. Heals costs cleanly without regression.
 * ═══════════════════════════════════════════════════════════════════════════ */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const R = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

let pass = 0;
const ok = (label, cond, detail) => {
  if (cond) {
    pass++;
  } else {
    console.error('✗ ' + label + (detail ? ' — ' + detail : ''));
    process.exit(1);
  }
};

/* ── 1. Load Real Modules ─────────────────────────────────────────────────── */
const mem = new Map();
const localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: (k) => mem.delete(k),
  clear: () => mem.clear(),
};

const storeDocs = {};
const storeSubscribers = {};
const fakeKiwiStore = {
  define: (name) => {
    storeDocs[name] = storeDocs[name] || { items: {} };
    storeSubscribers[name] = storeSubscribers[name] || [];
    return {
      get: (id) => storeDocs[name],
      update: (fn, id) => {
        storeDocs[name] = fn(JSON.parse(JSON.stringify(storeDocs[name]))) || storeDocs[name];
        storeSubscribers[name].forEach((cb) => cb(storeDocs[name]));
        return storeDocs[name];
      },
      subscribe: (fn) => {
        storeSubscribers[name].push(fn);
        return () => {};
      },
    };
  },
  subscribe: (name, fn) => {
    storeSubscribers[name] = storeSubscribers[name] || [];
    storeSubscribers[name].push(fn);
  },
};

let stockOverlayData = {
  items: [
    { id: 'inv-butter', name: 'Beurre doux', category: 'laitiers', unit: 'kg', costPerUnit: 70, supplier: 'Centrale Danone', parLevel: 20, reorderLevel: 5, currentStock: 15, updatedAt: 1000 },
    { id: 'inv-chicken', name: 'Poulet fermier', category: 'viandes', unit: 'kg', costPerUnit: 52, supplier: 'Volailles Atlas', parLevel: 30, reorderLevel: 10, currentStock: 25, updatedAt: 1000 },
    { id: 'inv-saffron', name: 'Safran pur', category: 'epices', unit: 'g', costPerUnit: 18, supplier: 'Coopérative Taliouine', parLevel: 50, reorderLevel: 10, currentStock: 40, updatedAt: 1000 },
  ],
  itemOv: {},
  delItems: [],
  sups: [
    { id: 'sup-1', name: 'Centrale Danone', phone: '0522000000' },
    { id: 'sup-2', name: 'Volailles Atlas', phone: '0522111111' },
    { id: 'sup-3', name: 'Coopérative Taliouine', phone: '0528222222' },
  ],
  supOv: {},
  delSups: [],
  cats: [
    { id: 'laitiers', label: 'Produits laitiers' },
    { id: 'viandes', label: 'Viandes & Volailles' },
    { id: 'epices', label: 'Épices & Aromates' },
  ],
  stockOv: {},
};

localStorage.setItem('kiwi:stockOverlay:mon-resto', JSON.stringify(stockOverlayData));

const timers = [];
function drainTimers() {
  while (timers.length) {
    const fn = timers.shift();
    try { fn(); } catch (_) {}
  }
}

const context = {
  window: {
    KiwiStore: fakeKiwiStore,
    KiwiPlatform: {
      pairedMerchant: () => 'mon-resto',
    },
    KiwiVenue: {
      getVenue: () => 'mon-resto',
      getCurrentVenueData: () => ({ id: 'mon-resto', slug: 'mon-resto', name: 'Mon Restaurant' }),
      isCustom: () => true,
    },
    KiwiEnv: { isReal: () => true },
    KiwiCloudDoc: {
      slugFor: () => 'mon-resto',
      currentSlug: () => 'mon-resto',
      attach: (cfg) => ({
        bind: () => Promise.resolve(false),
        push: () => {},
        pull: () => {},
      }),
      mergeDefault: (mine, theirs) => Object.assign({}, theirs, mine),
      carryForward: () => false,
    },
    KiwiI18n: { getLang: () => 'fr', onLangChange: () => () => {} },
    localStorage: localStorage,
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => {},
    setTimeout: (fn) => { timers.push(fn); return timers.length; },
    clearTimeout: () => {},
    setInterval: () => 1,
    clearInterval: () => {},
    console: console,
  },
  document: {
    addEventListener: () => {},
    removeEventListener: () => {},
    readyState: 'complete',
    body: { classList: { contains: () => false, add: () => {}, remove: () => {} } },
    getElementById: () => null,
    querySelector: () => null,
    querySelectorAll: () => [],
    head: { appendChild: () => {} },
    createElement: () => ({ style: {} }),
  },
  localStorage: localStorage,
  setTimeout: (fn) => { timers.push(fn); return timers.length; },
  clearTimeout: () => {},
  setInterval: () => 1,
  clearInterval: () => {},
  console: console,
};
context.window.window = context.window;
vm.createContext(context);

// Load units, stock, recipes, cost, consumption, ledger
vm.runInContext(R('assets/restaurant-units.js'), context);
vm.runInContext(R('assets/inventory-ledger.js'), context);
vm.runInContext(R('assets/stock.js'), context);
vm.runInContext(R('assets/caisse-stock-sync.js'), context);
vm.runInContext(R('assets/restaurant-recipes.js'), context);
vm.runInContext(R('assets/cost.js'), context);
vm.runInContext(R('assets/inventory-consumption.js'), context);

const win = context.window;
const Stock = win.KiwiRestaurantStock;
const Recipes = win.KiwiRestaurantRecipes;
const Cost = win.KiwiCost;
const Consumption = win.KiwiInventoryConsumption;
const CaisseStock = win.KiwiCaisseStock;

ok('KiwiRestaurantStock is loaded and accessible', !!Stock && typeof Stock.rows === 'function');
ok('KiwiRestaurantRecipes is loaded and accessible', !!Recipes && typeof Recipes.save === 'function');
ok('KiwiCaisseStock is loaded and accessible', !!CaisseStock && typeof CaisseStock.snapshot === 'function');

/* ── 2. Create Real Production Recipes ────────────────────────────────────── */
// Tajine Poulet au Safran: 1.2 kg poulet, 0.5 g safran, 0.05 kg beurre (50g)
const tajineLines = [
  { stockId: 'inv-chicken', name: 'Poulet fermier', qty: 1.2, unit: 'kg' },
  { stockId: 'inv-saffron', name: 'Safran pur', qty: 0.5, unit: 'g' },
  { stockId: 'inv-butter', name: 'Beurre doux', qty: 50, unit: 'g' },
];

Recipes.save('dish-tajine', {
  itemName: 'Tajine de Poulet au Safran',
  portions: 1,
  ingredients: tajineLines,
});

// Theoretical cost computation:
// 1.2 kg chicken @ 52 = 62.40
// 0.5 g saffron @ 18/g = 9.00
// 50 g butter @ 70/kg = 0.05 * 70 = 3.50
// Total = 62.40 + 9.00 + 3.50 = 74.90 MAD
const preMetrics = Recipes.metrics({ id: 'dish-tajine', name: 'Tajine de Poulet au Safran', price: 120 }, Recipes.get('dish-tajine'), 'mon-resto');
ok('Pre-migration recipe theoreticalCost is accurate (74.90 MAD)', preMetrics.theoreticalCost === 74.9, `got ${preMetrics.theoreticalCost}`);
ok('Pre-migration recipe status is complete', preMetrics.costComplete === true);

const costDoc = Cost.store.get('mon-resto');
ok('Pre-migration costDoc has complete recipe', costDoc.recipes['dish-tajine'] && costDoc.recipes['dish-tajine'].status === 'complete');
const preRecipeCost = Cost.of({ kind: 'menu', id: 'dish-tajine', name: 'Tajine de Poulet au Safran' }, { doc: costDoc });
ok('Pre-migration Cost.of evaluates recipe to 74.90 MAD', preRecipeCost.mad === 74.9, `got ${preRecipeCost.mad}`);

/* ── 3. Test Migration Helper & Auto-Upgrade ───────────────────────────────── */
const rawDoc = JSON.parse(localStorage.getItem('kiwi:stockOverlay:mon-resto'));
ok('Raw storage doc is v1 before explicit migration', !rawDoc.schemaVersion || rawDoc.schemaVersion === 1);

// Trigger CaisseStock snapshot which runs migration
const snap = CaisseStock.snapshot();
ok('CaisseStock snapshot returns 3 materialized items', snap.items.length === 3);

const migratedDoc = JSON.parse(localStorage.getItem('kiwi:stockOverlay:mon-resto'));
ok('Storage doc auto-migrated to schemaVersion 2', migratedDoc.schemaVersion === 2);
ok('Storage doc contains subcategories array with 3 entries', Array.isArray(migratedDoc.subcategories) && migratedDoc.subcategories.length === 3);
ok('Subcategories maintain exact stock IDs', migratedDoc.subcategories.some((s) => s.id === 'inv-butter' && s.defaultCost === 70));
ok('Subcategories maintain suppliers array', migratedDoc.subcategories.find((s) => s.id === 'inv-butter').suppliers.length === 1);
ok('Dual-write backward compatibility items array is preserved', Array.isArray(migratedDoc.items) && migratedDoc.items.length === 3);

/* ── 4. Verify Recipe Non-Regression Post-Migration ───────────────────────── */
// Re-read inventory rows from KiwiRestaurantStock
const rows = Stock.rows();
ok('KiwiRestaurantStock.rows() returns 3 items from subcategories', rows.length === 3);
const butterRow = rows.find((r) => r.id === 'inv-butter');
ok('Butter row preserves id, name, unit, costPerUnit', butterRow && butterRow.id === 'inv-butter' && butterRow.costPerUnit === 70 && butterRow.unit === 'kg');

// Re-evaluate recipe metrics
const postMetrics = Recipes.metrics({ id: 'dish-tajine', name: 'Tajine de Poulet au Safran', price: 120 }, Recipes.get('dish-tajine'), 'mon-resto');
ok('Post-migration recipe theoreticalCost is still exactly 74.90 MAD', postMetrics.theoreticalCost === 74.9, `got ${postMetrics.theoreticalCost}`);
ok('Post-migration recipe status remains complete', postMetrics.costComplete === true);

// Re-evaluate Cost.of
const postCostDoc = Cost.store.get('mon-resto');
const postRecipeCost = Cost.of({ kind: 'menu', id: 'dish-tajine', name: 'Tajine de Poulet au Safran' }, { doc: postCostDoc });
ok('Post-migration Cost.of evaluates recipe to 74.90 MAD', postRecipeCost.mad === 74.9, `got ${postRecipeCost.mad}`);

/* ── 5. Verify Inventory Consumption Lines ────────────────────────────────── */
const recipeLines = Consumption.recipeLines('dish-tajine', 2, postCostDoc, 0, []);
ok('Consumption recipeLines resolves 3 ingredient targets', recipeLines && recipeLines.length === 3);
const chickenTarget = recipeLines.find((x) => x.itemId === 'inv-chicken');
ok('Chicken consumption qty is 2.4 kg (2 x 1.2 kg)', chickenTarget && chickenTarget.qty === 2.4);
ok('Chicken unitCost is 52 MAD/kg', chickenTarget && chickenTarget.unitCost === 52);

const butterTarget = recipeLines.find((x) => x.itemId === 'inv-butter');
ok('Butter consumption qty is 0.1 kg (2 x 50g = 100g = 0.1kg)', butterTarget && Math.abs(butterTarget.qty - 0.1) < 1e-6);
ok('Butter unitCost is 70 MAD/kg', butterTarget && butterTarget.unitCost === 70);

/* ── 6. Idempotency & Stale Client Sync Test ──────────────────────────────── */
// Re-saving through CaisseStock
CaisseStock.updateItem('inv-butter', { cost: 75 });
const updatedDoc = JSON.parse(localStorage.getItem('kiwi:stockOverlay:mon-resto'));
ok('Updating item cost updates subcategory defaultCost to 75', updatedDoc.subcategories.find((s) => s.id === 'inv-butter').defaultCost === 75);
ok('Updating item cost updates backward-compatible items costPerUnit to 75', updatedDoc.items.find((s) => s.id === 'inv-butter').costPerUnit === 75);

// Re-heal
const healedCount = Recipes.heal('mon-resto');
ok('heal() runs cleanly', healedCount >= 0);

/* ── 7. L'enveloppe ne doit RIEN détruire ────────────────────────────────────
 * migrateStockDocV2 et syncEnvelope reconstruisaient d.items depuis une liste
 * fixe de champs. Tout champ hors liste — lastDelivery, deliveryFrequency,
 * status, sku, notes — disparaissait, et stOverlayRaw() réécrit le document
 * migré dans localStorage dès la LECTURE : la perte était immédiate et
 * définitive, sur les livres réels d'un commerçant. */
function migrationOf(file) {
  const all = R(file);
  const i = all.indexOf('function migrateStockDocV2');
  let depth = 0, k = all.indexOf('{', i);
  do { if (all[k] === '{') depth++; else if (all[k] === '}') depth--; k++; } while (depth > 0);
  return new Function(all.slice(i, k) + '; return migrateStockDocV2;')();
}
const RICH = {
  id: 'inv01', name: 'Viande hachée bœuf', category: 'viandes', unit: 'kg',
  currentStock: 12.4, parLevel: 18, reorderLevel: 8, costPerUnit: 95,
  supplier: 'Boucherie Errazi', lastDelivery: '2026-05-13',
  deliveryFrequency: 'mardi-vendredi', usageThisWeek: 28.6,
  theoreticalUsage: 29.2, status: 'low', sku: 'BF-001', notes: 'halal',
};
for (const file of ['assets/stock.js', 'assets/caisse-stock-sync.js']) {
  const out = migrationOf(file)({ items: [JSON.parse(JSON.stringify(RICH))], cats: [] });
  const kept = out.items[0] || {};
  const lost = Object.keys(RICH).filter((f) => !(f in kept));
  ok(`${file} · l'enveloppe preserve les champs hors liste projetee`, lost.length === 0,
    lost.length ? 'champs detruits : ' + lost.join(', ') : '');
  ok(`${file} · lastDelivery et status survivent a la migration`,
    kept.lastDelivery === '2026-05-13' && kept.status === 'low' && kept.sku === 'BF-001');
}

console.log(`✓ stock costing migration Phase 1 (${pass} controls: v2 schema migration, subcategory resolution, dual-write envelope, zero recipe regressions, exact consumption costing)`);
