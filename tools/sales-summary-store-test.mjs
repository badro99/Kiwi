import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { summarize } from '../functions/api/sales-summary.js';
import { businessBoundary, businessDate, addBusinessDays } from '../functions/api/_business-day.js';
const zone = 'Africa/Casablanca', cutoff = 5;
const boundary = n => businessBoundary(addBusinessDays('2026-01-01', n), cutoff, zone);
const rows = [], sales = [], refunds = [];
for (let d = 0; d < 200; d++) {
  for (let i = 0; i < 2; i++) {
    const parts = d % 3 ? null : [{ method: 'cash', amountCents: 333 }, { method: 'card', amountCents: 667 }];
    const entry = { ts: boundary(d) + (i + 1) * 3600000, amount: 10 + d / 100, method: ['cash', 'card', 'credit', 'split'][d % 4], paymentParts: parts };
    sales.push(entry);
    rows.push({ ...entry, amount_cents: Math.round(entry.amount * 100), payment_parts: JSON.stringify(parts) });
  }
  if (d % 5 === 0) {
    const entry = { ts: boundary(d) + 1000, amount: 2, method: d % 2 ? 'cash' : 'card' };
    refunds.push(entry); rows.push({ ...entry, amount: -2, amount_cents: -200 });
  }
}
const source = name => fs.readFileSync(new URL('../assets/' + name, import.meta.url), 'utf8');
function setup({ fail = false, status = 200, storage = new Map() } = {}) {
  let tenant = 'alpha', calls = 0;
  const R = { businessDay: ts => businessDate(ts, cutoff, zone), today: () => businessDate(boundary(200), cutoff, zone),
    dayBounds: day => ({ from: businessBoundary(day, cutoff, zone), to: businessBoundary(addBusinessDays(day, 1), cutoff, zone) }) };
  const c = vm.createContext({ window: { KiwiLive: { merchant: () => tenant }, KiwiDayReport: R },
    localStorage: { getItem: k => storage.get(k) ?? null, setItem: (k, v) => storage.set(k, v) },
    setTimeout, clearTimeout, AbortController, fetch: async (url, options) => {
      calls++; assert.equal(options.credentials, 'include'); assert.equal(options.headers.Accept, 'application/json');
      if (fail) throw Error('offline');
      if (status !== 200) return { ok: false, status };
      const q = new URL(url, 'https://test.invalid').searchParams;
      const from = +q.get('from'), to = +q.get('to');
      assert.ok(to - from <= 400 * 86400000 + 7200000);
      return { ok: true, json: async () => ({ merchant: q.get('merchant'), ...summarize(rows, from, to, cutoff, zone) }) };
    } });
  vm.runInContext(source('sales-history.js'), c);
  // Execute the actual production realWindowStats body, including lazy fallback.
  const body = source('dateRange.js').match(/  function realWindowStats\(from, to\) \{([\s\S]*?)\n  \}/)[1];
  Object.assign(c, { realSalesList: () => c.localSales, realRefundList: () => c.localRefunds,
    activeMerchantSlug: () => tenant, getCurrentVenue: () => tenant, deliveryDue: () => 0 });
  vm.runInContext('function realWindowStats(from, to) {' + body + '\n}', c);
  c.localSales = sales; c.localRefunds = refunds;
  return { c, storage, store: c.window.KiwiSalesSummary, math: c.window.KiwiSalesMath,
    calls: () => calls, tenant: v => { tenant = v; } };
}
const settle = () => new Promise(resolve => setImmediate(resolve));
let assertions = 0;
function equal(a, b) {
  assert.deepEqual(Object.keys(a).sort(), Object.keys(b).sort());
  for (const k of Object.keys(b)) { assert.ok(Math.abs(a[k] - b[k]) < 1e-6, `${k}: ${a[k]} != ${b[k]}`); assertions++; }
}
const t = setup();
assert.equal(t.store.coverageStart(), null);
let seed = 42;
for (let i = 0; i < 100; i++) {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  const from = boundary(seed % 190) + seed % 3600000, to = i % 2 ? Infinity : from + 10 * 86400000;
  equal(t.c.realWindowStats(from, to), t.math.statsFromSales(sales, refunds, from, to));
}
assert.equal(t.calls(), 0);
t.storage.set('kiwiSalesCoverage:alpha', String(boundary(80)));
t.c.localSales = sales.filter(r => r.ts >= boundary(80));
t.c.localRefunds = refunds.filter(r => r.ts >= boundary(80));
let landed = 0; const unsub = t.store.subscribe(() => landed++);
assert.equal(t.store.get(boundary(0), boundary(80)), null);
assert.equal(t.store.get(boundary(0), boundary(80)), null);
await settle(); assert.equal(t.calls(), 1); assert.equal(landed, 1); unsub();
for (const [a, b] of [[100, 150], [0, 50], [60, 100], [0, 200]]) {
  equal(t.c.realWindowStats(boundary(a), boundary(b)), t.math.statsFromSales(sales, refunds, boundary(a), boundary(b)));
}
equal(t.c.realWindowStats(boundary(0), Infinity), t.math.statsFromSales(sales, refunds, boundary(0), Infinity));
assert.equal(t.c.realWindowStats(boundary(0) + 1, boundary(50)).partial, true);
await settle();
const alphaCache = t.storage.get('kiwiSalesSummary:v1:alpha'); assert.ok(alphaCache);
t.tenant('beta'); assert.equal(t.store.get(boundary(0), boundary(80)), null); await settle();
assert.ok(t.storage.has('kiwiSalesSummary:v1:beta')); assert.equal(t.storage.get('kiwiSalesSummary:v1:alpha'), alphaCache);
const reload = setup({ storage: t.storage }); assert.ok(reload.store.get(boundary(0), boundary(80))); assert.equal(reload.calls(), 0);
const f = setup({ fail: true }); f.storage.set('kiwiSalesCoverage:alpha', String(boundary(80)));
f.c.localSales = t.c.localSales; f.c.localRefunds = t.c.localRefunds;
const expected = f.math.statsFromSales(f.c.localSales, f.c.localRefunds, boundary(0), boundary(200));
for (let i = 0; i < 2; i++) {
  const actual = f.c.realWindowStats(boundary(0), boundary(200)); assert.equal(actual.partial, true);
  delete actual.partial; equal(actual, expected); await settle();
}
assert.equal(f.calls(), 1);
for (const status of [401, 404, 400]) {
  const denied = setup({ status });
  denied.storage.set('kiwiSalesCoverage:alpha', String(boundary(80)));
  assert.equal(denied.c.realWindowStats(boundary(0), boundary(90)).partial, true);
  await settle();
  assert.equal(denied.store.get(boundary(0), boundary(80)), null);
  assert.equal(denied.storage.has('kiwiSalesSummary:v1:alpha'), false);
}
// An overlapping request fetches only the newly missing days.
const overlap = setup();
overlap.store.get(boundary(0), boundary(50));
overlap.store.get(boundary(20), boundary(80));
await settle(); assert.equal(overlap.calls(), 2);
assert.equal(overlap.store.get(boundary(0), boundary(80)).days.length, 80);
// Yesterday and today must be fetched again after a reload.
const mutable = setup();
mutable.store.get(boundary(199), boundary(201)); await settle();
assert.equal(JSON.parse(mutable.storage.get('kiwiSalesSummary:v1:alpha')).length, 0);
const mutableReload = setup({ storage: mutable.storage });
assert.equal(mutableReload.store.get(boundary(199), boundary(201)), null);
await settle(); assert.equal(mutableReload.calls(), 1);
// Mutable buckets are excluded from persistence; long spans chunk safely.
const long = setup(); long.store.get(boundary(0), boundary(805)); await settle(); assert.equal(long.calls(), 3);
const cached = JSON.parse(long.storage.get('kiwiSalesSummary:v1:alpha'));
assert.ok(cached.every(r => r.day.to <= boundary(199))); assert.ok(cached.length <= 800);
const missing = setup(); delete missing.c.window.KiwiSalesSummary;
equal(missing.c.realWindowStats(boundary(0), Infinity), missing.math.statsFromSales(sales, refunds, boundary(0), Infinity));
console.log(`PASS sales summary store: 400 sales, 40 refunds, 200 business days, 100 unchanged windows, 5 trimmed windows; ${assertions} field comparisons, dedupe, offline, isolation, persistence, chunks, missing module`);
