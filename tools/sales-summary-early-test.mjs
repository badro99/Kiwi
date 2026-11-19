/* Chiffre d'affaires d'abord compté par le serveur.
 *
 * Santos Store, 19 nov. 2026 : le propriétaire attendait que le tableau de bord
 * « compte » son chiffre. Mesure sur une copie locale à sa taille (3 650 tickets,
 * 300 ms de réseau) : sans cache, rien pendant 4,1 s ; avec cache, les ventes du
 * jour n'arrivent qu'après 4,3 s. Le navigateur relisait tout l'historique
 * (2,4 Mo, 8 pages à la suite) avant de publier un total, alors que le serveur
 * additionne l'année de Santos en 3 ms (/api/sales-summary).
 *
 * La règle tenue ici, sur le vrai code de assets/sales-history.js et le vrai
 * corps de realWindowStats (assets/dateRange.js) :
 *  - tant que la relecture du flux de CE commerce n'est pas finie, une fenêtre
 *    alignée sur des journées commerciales est comptée par le serveur ;
 *  - dès que la relecture est finie, le registre local reprend la main, comme
 *    avant (il connaît aussi ce que cet appareil n'a pas encore envoyé) ;
 *  - un appareil qui doit encore des ventes au serveur, un autre commerce, un
 *    flux coupé ou une fenêtre qui coupe une journée restent sur le local.
 *   node tools/sales-summary-early-test.mjs
 */
import coreTestSource from './core-test-source.cjs';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { summarize } from '../functions/api/sales-summary.js';
import { businessBoundary, businessDate, addBusinessDays } from '../functions/api/_business-day.js';

const zone = 'Africa/Casablanca', cutoff = 5;
const boundary = n => businessBoundary(addBusinessDays('2026-01-01', n), cutoff, zone);
const rows = [], sales = [], refunds = [];
for (let d = 0; d < 60; d++) {
  for (let i = 0; i < 3; i++) {
    const parts = d % 4 ? null : [{ method: 'cash', amountCents: 400 }, { method: 'card', amountCents: 600 }];
    const entry = { ts: boundary(d) + (i + 1) * 3600000, amount: 100 + d + i, method: ['cash', 'card', 'credit', 'transfer'][(d + i) % 4], paymentParts: parts };
    sales.push(entry);
    rows.push({ ...entry, amount_cents: Math.round(entry.amount * 100), payment_parts: JSON.stringify(parts) });
  }
  if (d % 7 === 0) {
    const entry = { ts: boundary(d) + 1000, amount: 5, method: 'cash' };
    refunds.push(entry); rows.push({ ...entry, amount: -5, amount_cents: -500 });
  }
}
const source = name => coreTestSource.readFileSync(new URL('../assets/' + name, import.meta.url), 'utf8');

function setup({ live } = {}) {
  let calls = 0;
  const status = Object.assign({ on: true, merchant: 'santos', backfillComplete: false, queued: 0 }, live);
  const R = { businessDay: ts => businessDate(ts, cutoff, zone), today: () => businessDate(boundary(59), cutoff, zone),
    dayBounds: day => ({ from: businessBoundary(day, cutoff, zone), to: businessBoundary(addBusinessDays(day, 1), cutoff, zone) }) };
  const storage = new Map();
  const NOW = boundary(59) + 10 * 3600000; // 15:00, store clock, on the last business day
  class Clock extends Date { constructor(...a) { if (a.length) super(...a); else super(NOW); } static now() { return NOW; } }
  const c = vm.createContext({ Date: Clock, window: { KiwiLive: { merchant: () => 'santos', status: () => status }, KiwiDayReport: R },
    localStorage: { getItem: k => storage.get(k) ?? null, setItem: (k, v) => storage.set(k, v), removeItem: k => storage.delete(k) },
    setTimeout, clearTimeout, AbortController, fetch: async (url) => {
      calls++;
      const q = new URL(url, 'https://test.invalid').searchParams;
      return { ok: true, json: async () => ({ merchant: q.get('merchant'), ...summarize(rows, +q.get('from'), +q.get('to'), cutoff, zone) }) };
    } });
  vm.runInContext(source('sales-history.js'), c);
  const body = source('dateRange.js').match(/  function realWindowStats\(from, to\) \{([\s\S]*?)\n  \}/)[1];
  Object.assign(c, { realSalesList: () => c.localSales, realRefundList: () => c.localRefunds,
    getCurrentVenue: () => 'santos', deliveryDue: () => 0 });
  vm.runInContext('function realWindowStats(from, to) {' + body + '\n}', c);
  c.localSales = []; c.localRefunds = [];
  return { c, status, math: c.window.KiwiSalesMath, store: c.window.KiwiSalesSummary, calls: () => calls };
}
const settle = () => new Promise(resolve => setImmediate(resolve));
let passed = 0;
const ok = async (label, fn) => { await fn(); passed++; console.log('  ✓ ' + label); };
function same(a, b) {
  for (const k of ['revenue', 'gross', 'refunds', 'collected', 'receivable', 'count', 'basket', 'card', 'cash']) {
    assert.ok(Math.abs(a[k] - b[k]) < 1e-6, `${k}: ${a[k]} != ${b[k]}`);
  }
}
const today = [boundary(59), boundary(60)], month = [boundary(30), boundary(60)];

await ok('a cold device shows the server total for today before the ledger replay ends', async () => {
  const t = setup();
  same(t.c.realWindowStats(...today), t.math.statsFromSales([], [], ...today)); // nothing invented while it loads
  await settle();
  assert.equal(t.calls(), 1);
  const shown = t.c.realWindowStats(...today);
  same(shown, t.math.statsFromSales(sales, refunds, ...today));
  assert.ok(shown.revenue > 0);
});

await ok('a month, with refunds, receivables and split tenders, matches the full ledger to the centime', async () => {
  const t = setup();
  t.c.realWindowStats(...month); await settle();
  same(t.c.realWindowStats(...month), t.math.statsFromSales(sales, refunds, ...month));
});

await ok('« today so far » (start of the business day to now, or open-ended) uses today\'s server bucket', async () => {
  const t = setup(), now = boundary(59) + 10 * 3600000;
  for (const to of [now + 1, Infinity]) {
    t.c.realWindowStats(boundary(59), to); await settle();
    same(t.c.realWindowStats(boundary(59), to), t.math.statsFromSales(sales, refunds, boundary(59), to));
  }
  t.c.realWindowStats(boundary(30), Infinity); await settle();
  same(t.c.realWindowStats(boundary(30), Infinity), t.math.statsFromSales(sales, refunds, boundary(30), Infinity));
});

await ok('a past window cut at the same hour (« vs hier ») stays local', async () => {
  const t = setup(); t.c.localSales = sales.slice(0, 5);
  const from = boundary(58), to = boundary(58) + 10 * 3600000;
  t.c.realWindowStats(from, to); await settle();
  same(t.c.realWindowStats(from, to), t.math.statsFromSales(t.c.localSales, [], from, to));
});

await ok('a stale cache is replaced by the server count, not added to it', async () => {
  const t = setup();
  t.c.localSales = sales.filter(s => s.ts < boundary(58)); t.c.localRefunds = refunds.filter(s => s.ts < boundary(58));
  t.c.realWindowStats(...month); await settle();
  same(t.c.realWindowStats(...month), t.math.statsFromSales(sales, refunds, ...month));
});

await ok('once the replay is complete the local ledger counts again, with no new request', async () => {
  const t = setup({ live: { backfillComplete: true } });
  t.c.localSales = sales.slice(0, 10); t.c.localRefunds = [];
  same(t.c.realWindowStats(...month), t.math.statsFromSales(t.c.localSales, [], ...month));
  await settle(); assert.equal(t.calls(), 0);
});

await ok('a device that still owes the server sales keeps counting its own ledger', async () => {
  const t = setup({ live: { queued: 2 } });
  t.c.localSales = sales.slice(0, 10);
  same(t.c.realWindowStats(...month), t.math.statsFromSales(t.c.localSales, [], ...month));
  await settle(); assert.equal(t.calls(), 0);
});

await ok('another store, a feed that is off, or no live module: local only', async () => {
  for (const live of [{ merchant: 'other' }, { on: false }]) {
    const t = setup({ live });
    t.c.localSales = sales.slice(0, 5);
    same(t.c.realWindowStats(...month), t.math.statsFromSales(t.c.localSales, [], ...month));
    await settle(); assert.equal(t.calls(), 0);
  }
  const t = setup(); t.c.window.KiwiLive.status = undefined; t.c.localSales = sales.slice(0, 5);
  same(t.c.realWindowStats(...month), t.math.statsFromSales(t.c.localSales, [], ...month));
  await settle(); assert.equal(t.calls(), 0);
});

await ok('a window that starts inside a business day stays local and never throws', async () => {
  const t = setup();
  t.c.localSales = sales.slice(0, 5);
  for (const [from, to] of [[boundary(30) + 3600000, boundary(60)], [boundary(30) + 3600000, Infinity]]) {
    t.c.realWindowStats(from, to); await settle();
    same(t.c.realWindowStats(from, to), t.math.statsFromSales(t.c.localSales, [], from, to));
  }
});

await ok('serves() says whether the server already counts a window (operator view reads it)', async () => {
  const t = setup();
  assert.equal(t.store.serves(...today), false, 'nothing yet: the request is only starting');
  await settle();
  assert.equal(t.store.serves(...today), true, 'today is counted by the server');
  assert.equal(t.store.serves(boundary(58), boundary(58) + 10 * 3600000), false, 'a window cutting a day is not');
  const done = setup({ live: { backfillComplete: true } });
  assert.equal(done.store.serves(...today), false, 'after the replay the ledger counts, not the server');
});

console.log(`sales-summary-early: ${passed} passed`);
