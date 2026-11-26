// Restaurant stock · the suppliers entered in Approvisionnement are offered in
// the stock item form too. Jon's Burgers (25 Nov 2026) entered 13 suppliers in
// Approvisionnement, then found « Aucun » alone under « Fournisseur principal »
// in Stock and typed six of them a second time.
import stockTestSource from './stock-test-source.cjs';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { createRequire } from 'node:module';

/* stock-test-source rebuilds the pre-split stock.js, and its replay of recorded
   edits rewinds this very change (the proof keeps the shipped getSup as an
   edit). Re-apply that one edit so the test reads the getSup that ships. */
const split = createRequire(import.meta.url)('./fixtures/stock-controller/split.json');
const supEdit = split.edits.find((e) => e.after.includes('suppliers in Approvisionnement'));
assert.ok(supEdit, 'the shipped getSup edit is recorded in the stock split proof');
let source = stockTestSource();
assert.ok(source.includes(supEdit.before), 'the rebuilt stock source holds the rewound getSup line');
source = source.replace(supEdit.before, () => supEdit.after);
const data = new Map();
const procurement = {
  doc() {
    return {
      suppliers: [
        { id: 'sup-a', name: 'Marjane', phone: '', address: 'Tanger', active: true },
        { id: 'sup-b', name: 'Rachid Orange', phone: '+212600000000', address: '', active: true },
        { id: 'sup-c', name: 'Ancien grossiste', active: false },
      ],
      orders: [], receipts: [], returns: [], invoices: [],
    };
  },
};
const localStorage = { getItem: (k) => data.get(k) || null, setItem: (k, v) => data.set(k, String(v)), removeItem: (k) => data.delete(k) };
const document = {
  readyState: 'loading', addEventListener() {}, querySelector() { return null; }, querySelectorAll() { return []; },
  body: { classList: { contains() { return false; }, add() {}, remove() {} } },
};
const window = {
  document, localStorage, location: { search: '', hostname: 'kiwi-os.com' }, addEventListener() {}, dispatchEvent() {},
  KiwiConfig: { type: 'restaurant', plan: 'pro' }, KiwiEnv: { isReal: () => true },
  KiwiVenue: {
    getVenue: () => 'own', getVenueType: () => 'restaurant', isCustom: () => true,
    getInventory: () => [],
    getSuppliers: () => [{ id: 'v-marjane', name: 'marjane ', location: 'Tanger', category: 'epicerie' }],
  },
  KiwiDayReport: { storeSlug: () => 'jon-s-burgers-blue-tacos', businessDay: () => '2026-11-25' },
  KiwiProcurement: procurement,
  KiwiRestaurantUnits: { normalize: (u) => u, list: () => [{ id: 'kg', label: 'Kilogramme' }] },
};
window.window = window;
const context = vm.createContext({ window, document, localStorage, console, setTimeout, clearTimeout, CustomEvent: class {}, Event: class {} });
vm.runInContext(source, context, { filename: 'assets/stock.js' });

let checks = 0;
const ok = (value, message) => { assert.ok(value, message); checks += 1; console.log(`  ✓ ${message}`); };
const names = window.KiwiStockOperatingDay.suppliers().map((s) => s.name);
ok(names.includes('Rachid Orange'), 'a supplier entered in Approvisionnement is offered in restaurant stock');
ok(names.filter((n) => n.trim().toLowerCase() === 'marjane').length === 1, 'a supplier present in both lists appears once (names compared without case or spaces)');
ok(!names.includes('Ancien grossiste'), 'an archived Approvisionnement supplier is not offered');
ok(names[0] === 'marjane ', 'the stock list keeps its own entries first, unchanged');

console.log(`\n✓ ${checks} restaurant stock supplier controls passed`);
