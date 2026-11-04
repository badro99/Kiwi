// Journal boutique (r19) : la fenêtre « 7 jours » se compte en jours d'activité
// (coupure 05:00), comme le reste de la caisse, pas en jours civils à minuit.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import split from './split-functions.cjs';
const src = fs.readFileSync('assets/pos-boutique.js', 'utf8');
const pick = (...n) => n.map((x) => split.declaration(src, x)).join('\n');
// Jour d'activité = date UTC de (t - 5 h) : la boutique de test vit en UTC.
const businessDay = (t) => new Date(t - 5 * 3600000).toISOString().slice(0, 10);
const base = { window: { KiwiDayReport: { businessDay } }, Date, Number, Math, isNaN, RegExp, String, RETAIN_DAYS: 7, retainDays: () => 7 };
const ctx = vm.createContext(base);
vm.runInContext(pick('retDayKey', 'retShiftDay', 'withinRetention').replace('function withinRetention', 'const RETAIN_DAYS = 7;\nfunction withinRetention') + ';this.within=withinRetention;this.key=retDayKey;this.shift=retShiftDay;', ctx);
const oldest = ctx.shift(ctx.key(Date.now()), -6);
const oldestStart = Date.parse(oldest + 'T05:00:00Z');
assert.equal(ctx.within(oldestStart + 1), true, 'the first minute of the oldest kept business day is kept');
assert.equal(ctx.within(oldestStart - 1), false, 'a sale a millisecond before it (previous business day) is out');
assert.equal(ctx.within(Date.now()), true);
assert.equal(ctx.within('nope'), false);

// syncReturnSales : la borne « from » couvre tout le plus ancien jour d'activité, et rien de plus ancien n'entre.
const urls = [], SALES = [];
const feed = { sales: [
  { ref: 'old', ts: oldestStart - 3600000, lines: [{ x: 1 }], method: 'cash' },
  { ref: 'edge', ts: oldestStart + 3600000, lines: [{ x: 1 }], method: 'cash' } ] };
const sctx = vm.createContext({ window: { KiwiDayReport: { businessDay }, KiwiPosSale: { feedDay: (u) => { urls.push(u); return Promise.resolve(feed); } } },
  Date, Number, Math, isNaN, RegExp, String, Array, encodeURIComponent, fetch() {}, IS_DEMO: false, merchantSlug: () => 'm', SALES, RETAIN_DAYS: 7, retainDays: () => 7,
  remoteLine: (l) => l, srvMethod: (m) => [m], remoteMoney: () => ({}), persistDay() {}, root: null, state: {}, renderEchanges() {}, renderBadges() {}, icons() {} });
vm.runInContext(pick('retDayKey', 'retShiftDay', 'syncReturnSales').replace('function syncReturnSales', 'function syncReturnSales') + ';this.sync=syncReturnSales;', sctx);
await sctx.sync();
const from = Number(/from=(\d+)/.exec(urls[0])[1]);
assert.ok(from <= oldestStart, 'from reaches back to the start of the oldest business day, even at 02:00 before the cutoff');
assert.ok(from > oldestStart - 24 * 3600000, 'but not a whole extra day');
assert.deepEqual(SALES.map((s) => s.id), ['edge'], 'a sale from the previous business day is not imported');
console.log('✓ boutique return journal counts business days (05:00)');
