#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const memory = new Map();
const localStorage = {
  getItem: key => memory.get(key) ?? null,
  setItem: (key, value) => memory.set(key, String(value)),
};
const menu = [
  { id: 'shawarma', name: 'Shawarma', catId: 'food' },
  { id: 'kebab', name: 'Shawarma Kebab', catId: 'food' },
  { id: 'king', name: 'King Shawarma', catId: 'food' },
  { id: 'assiette', name: 'Assiette Shawarma', catId: 'food' },
  { id: 'literal', name: 'Shawarma (XL)', catId: 'food' },
];
const ctx = vm.createContext({
  localStorage, Date, Intl,
  window: {
    localStorage, addEventListener() {},
    KiwiEnv: { isReal: () => true },
    KiwiI18n: { getLang: () => 'fr' },
    KiwiMenuStore: { data: () => ({ cats: [{ id: 'food', name: 'Shawarma' }], items: menu }) },
  },
});
vm.runInContext(fs.readFileSync(new URL('../assets/day-report.js', import.meta.url), 'utf8'), ctx);
const R = ctx.window.KiwiDayReport;
const day = '2026-09-14';
const ts = Date.parse('2026-09-14T13:00:00Z');
const store = { slug: 'mixmax', name: 'MixMax', type: 'restaurant' };
const lines = [
  { name: 'Shawarma (Pain Pita)', baseName: 'Shawarma', itemId: 'shawarma', qty: 82, total: 2050, cat: 'Shawarma' },
  { name: 'Shawarma (Pain Pita · Fromage)', baseName: 'Shawarma', itemId: 'shawarma', qty: 32, total: 960, cat: 'Shawarma' },
  { name: 'Shawarma (Baguette)', itemId: 'shawarma', qty: 19, total: 570, cat: 'Shawarma' },
  { name: 'Shawarma (Pain Pita · Laitue) · 1/2', baseName: 'Shawarma', itemId: 'shawarma', qty: 1, total: 12.5, cat: 'Shawarma' },
  { name: 'Shawarma Kebab (Laitue)', itemId: 'kebab', qty: 1, total: 40, cat: 'Shawarma' },
  { name: 'King Shawarma', itemId: 'king', qty: 54, total: 3240, cat: 'Shawarma' },
  { name: 'Assiette Shawarma', itemId: 'assiette', qty: 4, total: 200, cat: 'Shawarma' },
  { name: 'Shawarma (XL)', itemId: 'literal', qty: 1, total: 60, cat: 'Shawarma' },
];
const amount = lines.reduce((sum, line) => sum + line.total, 0);
const sale = { id: 'test', ts, amount, method: 'cash', lines };
const report = R.build({ day, store, sales: [sale] });
const products = report.categories[0].products;
assert.deepEqual(Array.from(products, product => product.name).sort(),
  ['Assiette Shawarma', 'King Shawarma', 'Shawarma', 'Shawarma (XL)', 'Shawarma Kebab'].sort());
const shawarma = products.find(product => product.name === 'Shawarma');
assert.equal(shawarma.qty, 134);
assert.equal(shawarma.total, 3592.5);
assert.equal(report.categories[0].qty, lines.reduce((sum, line) => sum + line.qty, 0));
assert.equal(report.categories[0].total, amount);
assert.equal(report.gross, amount);

// An old/current-day line can be regrouped if its current menu item matches;
// a deleted unknown item is never silently guessed from parentheses.
const legacy = R.build({ day, store, sales: [{ ...sale, id: 'legacy', amount: 25, lines: [
  { name: 'Shawarma (Pain Pita)', qty: 1, total: 25 },
] }] });
assert.equal(legacy.categories[0].products[0].name, 'Shawarma');
const unknown = R.build({ day, store, sales: [{ ...sale, id: 'unknown', amount: 25, lines: [
  { name: 'Deleted dish (Special)', qty: 1, total: 25 },
] }] });
assert.equal(unknown.categories[0].products[0].name, 'Deleted dish (Special)');

// Non-restaurant reports keep legitimate variant labels as separate products.
const boutique = R.build({ day, store: { ...store, type: 'boutique' }, sales: [sale] });
assert.ok(boutique.categories[0].products.some(product => product.name === 'Shawarma (Baguette)'));
const archived = {
  day: '2026-09-13', store, closed: true, closedAt: Date.parse('2026-09-13T23:00:00Z'),
  categories: [{ name: 'Shawarma', qty: 1, total: 25, products: [
    { name: 'Shawarma (Pain Pita)', qty: 1, total: 25 },
  ] }],
};
R.save(archived, { by: 'Cashier' });
R.build({ day, store, sales: [sale] });
assert.equal(R.load('2026-09-13', store.slug).categories[0].products[0].name,
  'Shawarma (Pain Pita)', 'previously closed Z snapshots are not rewritten');
console.log('✓ Z report groups restaurant items without changing quantities or revenue');
