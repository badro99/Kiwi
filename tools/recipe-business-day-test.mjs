#!/usr/bin/env node
/* recipe-business-day-test · wave 12, lane G (analysis#1).
 *
 * The menu-analysis "sold" figure (and the theoretical stock usage built on it)
 * counted a rolling 7 x 24 h window on the device clock. "7 jours" everywhere
 * else is the 7 business days (05:00 cutoff, the store's zone): today and the
 * six before it. Between 00:00 and 05:00 the two disagreed by a night of sales.
 * Runs the real restaurant-recipes.js against the real day-report.js. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const read = (f) => fs.readFileSync(new URL('../' + f, import.meta.url), 'utf8');
let n = 0;
const ok = (label, f) => { f(); n++; console.log('  ✓ ' + label); };

function dayReport() {
  const storage = new Map([['kiwiPairedVenue', JSON.stringify({ merchant: 'resto', timezone: 'Africa/Casablanca' })]]);
  const w = {
    localStorage: { getItem: (k) => storage.get(k) || null, setItem: (k, v) => storage.set(k, String(v)) },
    addEventListener() {}, KiwiConfig: { timezone: 'Africa/Casablanca' },
    KiwiCaissePairing: { pairedVenue: () => ({ merchant: 'resto', timezone: 'Africa/Casablanca' }) },
  };
  w.window = w;
  /* The zone law (Casablanca is UTC+0 since 20 Sept 2026) lives in kit/haptics.js: this machine's tzdata may still say +01. */
  const ctx = vm.createContext({ window: w, localStorage: w.localStorage, Date, Math, JSON, Intl, String, Number, Object, Array, RegExp });
  vm.runInContext(read('assets/kit/haptics.js'), ctx);
  vm.runInContext(read('assets/day-report.js'), ctx);
  return w.KiwiDayReport;
}
function recipes(nowIso, sales, { withReport = true } = {}) {
  const NOW = Date.parse(nowIso);
  class FixedDate extends Date { static now() { return NOW; } }
  const docs = {};
  const win = {
    KiwiStore: { define: (name) => { docs[name] = docs[name] || { items: {} }; return { get: () => docs[name], update: (fn) => { docs[name] = fn(docs[name]) || docs[name]; return docs[name]; }, subscribe: () => () => {} }; } },
    KiwiVenue: { getVenue: () => 'resto' },
    KiwiSales: { list: () => sales },
    KiwiRestaurantStock: { items: () => [{ id: 'tomato', name: 'Tomates', unit: 'kg', costPerUnit: 10 }] },
  };
  if (withReport) win.KiwiDayReport = dayReport();
  const ctx = vm.createContext({ window: win, console, Date: FixedDate, Math, JSON, Number, String, Object, Array, Set, Promise });
  vm.runInContext(read('assets/stock-identity.js'), ctx);
  vm.runInContext(read('assets/restaurant-recipes.js'), ctx);
  const R = win.KiwiRestaurantRecipes;
  R.save('dish', { itemName: 'Plat', portions: 1, ingredients: [{ stockId: 'tomato', name: 'Tomates', qty: 1, unit: 'kg' }] });
  return R;
}
const sale = (iso, qty = 1) => ({ id: iso, ts: Date.parse(iso), lines: [{ itemId: 'dish', qty }] });
const sold = (R) => R.metrics({ id: 'dish', name: 'Plat', price: 50 }, R.get('dish'), 'resto').sold;

ok('2 a.m.: the 7 business days start 05:00 six days back, not 7 x 24 h before now', () => {
  /* Casablanca is UTC+0 since 20 Sept 2026: 02:00 on the 20th is still business day 19 (13..19). */
  const R = recipes('2026-10-20T02:00:00Z', [
    sale('2026-10-13T03:00:00Z', 5),   // night of business day 12: out. A rolling window (since 13th 02:00) counted it.
    sale('2026-10-13T06:00:00Z', 2),   // business day 13: in
    sale('2026-10-20T01:00:00Z', 1),   // tonight, business day 19: in
  ]);
  assert.equal(sold(R), 3);
});
ok('afternoon: the 8th business day back is out, even inside 7 x 24 h', () => {
  const R = recipes('2026-10-20T15:00:00Z', [
    sale('2026-10-13T20:00:00Z', 4),   // business day 13, the 8th day (14..20 are the 7): out. A rolling window counted it.
    sale('2026-10-14T05:00:00Z', 3),   // first minute of business day 14: in
    sale('2026-10-14T04:59:00Z', 6),   // last minute of business day 13: out
  ]);
  assert.equal(sold(R), 3);
});
ok('the theoretical stock usage reads the same business-day window', () => {
  const R = recipes('2026-10-20T15:00:00Z', [sale('2026-10-13T20:00:00Z', 4), sale('2026-10-15T10:00:00Z', 2)]);
  assert.equal(R.theoreticalUsage('tomato', 'resto', 7), 2);
});
ok('a longer window counts business days too (30 days)', () => {
  const R = recipes('2026-10-20T02:00:00Z', [sale('2026-09-20T03:00:00Z', 1), sale('2026-09-20T06:00:00Z', 2)]);
  assert.equal(R.theoreticalUsage('tomato', 'resto', 30), 2, '03:00 on 20 Sept is business day 19 Sept, the 31st day back: out');
});
ok('without the day-report module the rolling window still answers', () => {
  const R = recipes('2026-10-20T15:00:00Z', [sale('2026-10-19T15:00:00Z', 2), sale('2026-10-01T10:00:00Z', 9)], { withReport: false });
  assert.equal(sold(R), 2);
});
console.log(`PASS recipe business-day window (${n} checks)`);
