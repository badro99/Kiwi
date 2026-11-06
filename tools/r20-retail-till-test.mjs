#!/usr/bin/env node
/* r20 retail lane · the till decides every day, window and instant on ONE corrected clock; tenders and
 * returns conserve centimes; a 31 to 90 day old sale can be found; a refund invalidates the returns ledger.
 * Every case runs the real module (vm for classic scripts, import for ES modules) and was red before the fix. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { validateRetailTenders } from '../functions/api/_retail-tenders.js';
const require = createRequire(import.meta.url);
const ROOT = process.env.KIWI_ROOT || path.resolve(import.meta.dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
let checks = 0;
const ok = (value, message) => { assert.ok(value, message); checks++; };
const eq = (a, b, message) => { assert.equal(a, b, message); checks++; };
const DEVICE = Date.parse('2026-11-04T03:30:00Z');       // the tablet says 03:30Z: business day 3 Nov (whatever tzdata the host has)
const SKEW = 2 * 3600000;                                // the server says 05:30Z: business day 4 Nov
const RealDate = Date;
class DeviceClock extends RealDate { constructor(...a) { super(...(a.length ? a : [DEVICE])); } static now() { return DEVICE; } }

/* 1 · till clock */
{
  globalThis.KiwiLive = { now: () => DEVICE + SKEW };
  const { tillNow, tillDate } = await import('../assets/pos-boutique/till-clock.js?r20=1');
  eq(tillNow(), DEVICE + SKEW, 'the till clock is the corrected one (KiwiLive.now)');
  eq(+tillDate(), DEVICE + SKEW);
  delete globalThis.KiwiLive;
  globalThis.KiwiTrustedClock = { skewMs: () => SKEW };
  const before = Date.now();
  ok(Math.abs(tillNow() - (before + SKEW)) < 1000, 'without KiwiLive the learned offset still applies');
  delete globalThis.KiwiTrustedClock;
  ok(Math.abs(tillNow() - Date.now()) < 1000, 'no correction learned: the device clock');
}

/* 2 · return window and home "today" on a skewed tablet, near 05:00 (returns#A1, dayreport#A0, home#A0) */
{
  Date.now = () => DEVICE; globalThis.KiwiLive = { now: () => DEVICE + SKEW };
  let doc = { returnWindowDays: 1 };
  globalThis.KiwiStore = { currentVenue: () => 'v1', define: () => ({ get: () => doc, set: (n) => { doc = n; }, cloud: () => null, subscribe() {} }) };
  globalThis.KiwiPolicies = require('../assets/merchant-policies.js');
  const { businessDate } = await import('../functions/api/_business-day.js');
  const dayKey = (ts) => businessDate(ts, 5, 'UTC');
  const till = await import('../assets/pos-boutique/return-window.js?r20=2');
  // Window of 1 day = "the day of purchase". A sale at 03 Nov 12:00Z is, on the server's clock (4 Nov 05:30Z), YESTERDAY: outside.
  eq(till.outsideWindow(Date.parse('2026-11-03T12:00:00Z'), dayKey), true, 'the return window reads the corrected clock, not the tablet');
  globalThis.KiwiLive = { now: () => DEVICE };
  eq(till.outsideWindow(Date.parse('2026-11-03T12:00:00Z'), dayKey), false, 'with no skew the same sale is still inside');
  Date.now = RealDate.now; delete globalThis.KiwiLive;

  const ctx = vm.createContext({ window: null, localStorage: { getItem: () => null, setItem() {}, removeItem() {} }, Date: DeviceClock, Intl, Math, JSON, Number, String, Array, Object, RegExp, console, CustomEvent: function () {} });
  ctx.window = { localStorage: ctx.localStorage, KiwiLive: { now: () => DEVICE + SKEW }, addEventListener() {}, dispatchEvent() {} }; ctx.window.window = ctx.window;
  vm.runInContext(read('assets/day-report.js'), ctx, { filename: 'day-report.js' });
  const DR = ctx.window.KiwiDayReport;
  eq(DR.today('r20-shop'), '2026-11-04', 'today() follows the corrected till clock (device alone would say the 3rd)');
  eq(DR.businessDay(DEVICE, 'r20-shop'), '2026-11-03', 'an explicit timestamp is never shifted');
  ctx.window.KiwiLive = { now: () => DEVICE };
  eq(DR.today('r20-shop'), '2026-11-03', 'no skew: the device day');
  // dayreport#B0 · more than eight tenders all count
  const parts = Array.from({ length: 12 }, () => ({ m: 'espèces', amount: 1 }));
  const row = DR.normSale({ id: 'multi', ts: DEVICE, amount: 12, method: 'split', parts });
  eq(row.parts.reduce((n, p) => n + p.amountCents, 0), 1200, 'twelve tenders are all kept (same method added together)');
  eq(row.parts.length, 1);
}

/* 3 · tenders: whatever the till finishes, the route accepts (till#B0, boutiquetill#B0, gate#B0) */
{
  const { source } = require('./retail-money-harness.cjs');
  const src = source('assets/pos-boutique.js');
  const { declaration } = require('./js-declarations.cjs');
  const ctx = vm.createContext({ Math, Map, Array });
  vm.runInContext(declaration(src, 'BQ_SRV_METHOD') + '\n' + declaration(src, 'bqPaymentParts') + '\nglobalThis.bqPaymentParts = bqPaymentParts;', ctx);
  const parts = Array.from({ length: 12 }, (_, i) => ({ m: i % 2 ? 'carte' : 'espèces', amount: 10.01 }));
  const sent = ctx.bqPaymentParts(parts);
  ok(sent.length <= 8 && sent.length === 2, 'same-method tenders are added together');
  eq(sent.reduce((n, p) => n + p.amountCents, 0), 12012, 'no centime lost');
  ok(validateRetailTenders(sent, 12012, 12012, 0), 'the real server validator accepts it');
  ok(!validateRetailTenders(parts.map((p) => ({ method: 'cash', amountCents: 1001 })), 12012, 12012, 0), 'and refuses the raw twelve lines (the old behaviour)');
}

/* 4 · returns conserve centimes (boutiquetill#B1, returns#B0, gate#B1) */
{
  const mod = await import('../assets/pos-boutique/paid-share.js?r20=4');
  const unit = 19.99, sale = { reward: { kind: 'percent' }, total: 47.98, lines: [{ unit, qty: 3 }] };
  const piece = (returned) => mod.paidCents(sale, 0, returned, 1);
  eq(piece(0) + piece(1) + piece(2), 4798, 'three 19.99 units at -20%: returning every unit refunds exactly the 47.98 paid (was 47.97)');
  eq(mod.paidCents(sale, 0, 1, 2), piece(1) + piece(2), 'a later partial return takes the rest of the balance');
  eq(mod.paidCents(sale, 0, 0, 3), 4798);
  eq(mod.paidCents(sale, 0, 3, 1), 0, 'nothing left once everything is back');
  const two = { reward: {}, total: 10, lines: [{ unit: 3.33, qty: 1 }, { unit: 6.67, qty: 1 }, { unit: 3.34, qty: 1 }] };
  const budgets = mod.lineBudgets(two);
  eq(budgets.reduce((a, b) => a + b, 0), 1000, 'largest remainder: the lines share the paid total exactly');
  const noReward = { total: 20, lines: [{ unit: 10, qty: 2 }] };
  eq(mod.paidCents(noReward, 0, 0, 1), 1000, 'no reward: price times quantity as before');
}

/* 5 · a 31 to 90 day old sale is read from the server by day (returns#A0, landing#A1) */
{
  const { readDayRows } = await import('../assets/pos-boutique/old-sales.js?r20=5');
  const asked = [];
  const pages = [{ merchant: 'm', sales: [{ ref: 'A' }], complete: false, next: 'c1' }, { merchant: 'm', sales: [{ ref: 'B' }], complete: true, next: null }];
  const rows = await readDayRows('m', 1000, 2000, async (url) => { asked.push(url); return pages[asked.length - 1]; });
  eq(rows.map((r) => r.ref).join(), 'A,B', 'every page of the day is read');
  ok(/window=1/.test(asked[0]) && /from=1000&to=2000/.test(asked[0]) && /after=c1/.test(asked[1]));
  eq(await readDayRows('m', 1000, 2000, async () => ({ merchant: 'm', sales: [{ ref: 'A' }], complete: false, next: 'c1' })), null, 'a repeated cursor is an incomplete read, never a partial day');
  eq(await readDayRows('m', 1000, 2000, async () => ({ merchant: 'other', sales: [], complete: true, next: null })), null, 'another merchant is refused');

  const { world } = require('./retail-money-harness.cjs');
  const w = world('boutique'), c = w.c;
  const moduleSource = (f) => read(f).replace(/^export /gm, '');
  vm.runInContext(moduleSource('assets/pos-boutique/old-sales.js') + '\nObject.assign(globalThis,{readDayRows});', c);
  const OLD = Date.parse('2026-09-10T10:00:00Z'), day = '2026-09-10';
  c.IS_DEMO = false; c.fetch = () => {}; c.retainDays = () => 30; c.retDayKey = (ts) => new RealDate(+ts).toISOString().slice(0, 10); c.retShiftDay = (k, d) => k;
  c.window.KiwiDayReport = { dayBounds: () => ({ from: OLD - 3600000, to: OLD + 3600000 }) };
  const urls = [];
  c.window.KiwiPosSale = { feedDay: async (u) => { urls.push(u); return { merchant: 'test-shop', complete: true, next: null, sales: [{ id: 's1', ref: '1042', ts: OLD, method: 'cash', amountCents: 5000, lines: [{ itemId: 'p', name: 'Robe', qty: 1, unitCents: 5000, total: 5000 }] }] }; } };
  c.SALES.length = 0; c.P.p = { id: 'p', name: 'Robe', price: 50 }; c.persistDay = () => {};
  const added = await c.syncReturnSales(day);
  eq(added, 1, 'the old sale is found by its day');
  ok(/window=1/.test(urls[0]), 'by a bounded day read, not a month of journal');
  eq(c.SALES[0].id, '1042');
}

/* 6 · promotions price at the corrected instant (promos#A0, promos#A2) */
{
  const win = { localStorage: { getItem: () => null, setItem() {}, removeItem() {} }, KiwiLive: { now: () => Date.parse('2026-11-04T10:00:00Z') } };
  const ctx = vm.createContext({ window: win, Date: DeviceClock, Intl, Math, JSON, Number, String, Array, Object, Set, Map, RegExp, console });
  win.window = win; ctx.globalThis = ctx;
  vm.runInContext(read('assets/promo-rules.js'), ctx, { filename: 'promo-rules.js' });
  const R = win.KiwiPromoRules;
  const promo = { id: 'happy', name: 'Happy', kind: 'percent', value: 10, days: [], start: '10:00', end: '12:00' };
  // the tablet says 03:30Z, outside 10:00-12:00; the corrected clock says 10:00Z: inside.
  eq(R.status(promo, null, 'boutique'), 'active', 'the hour window opens on the corrected clock although the tablet is hours earlier');
  win.KiwiLive = { now: () => DEVICE };
  eq(R.status(promo, null, 'boutique') === 'active', false, 'with the tablet clock it is not open yet');
}

/* 7 · a refund invalidates the returns ledger across devices (returns#B1) */
{
  const store = new Map();
  globalThis.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
  const listeners = new Map();
  globalThis.document = { addEventListener: (n, f) => listeners.set(n, f), documentElement: { lang: 'fr' } };
  globalThis.window = { KiwiCloudDoc: { currentSlug: () => 'shop' }, KiwiVenue: { getVenue: () => 'v' } };
  let serverList = [];
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ ok: true, list: serverList, next: null }) });
  const ledger = await import('../assets/returns-ledger.js?r20=7');
  eq(await ledger.warmCreditReturns(null), true, 'first read');
  // another device refunds; this tablet read less than a minute ago
  serverList = [{ kind: 'avoir', ts: 5, amount: 80 }];
  eq(await ledger.warmCreditReturns(null), false, 'inside the throttle the new refund is not visible (the old behaviour)');
  listeners.get('kiwi:returns-changed')();
  eq(await ledger.warmCreditReturns(null), true, 'after the refund ack the ledger is re-read at once');
  eq(ledger.ledgerSnapshot().list.length, 1);
}

/* 8 · a blocked pop-up is not "report ready" (dayreport#A1, dayreport#A2) */
{
  const toasts = []; let closed = 0, goClick = null;
  const el = () => ({ dataset: {}, style: {}, classList: { add() {}, remove() {} }, setAttribute() {}, addEventListener() {}, set onclick(fn) { this.fn = fn; }, get onclick() { return this.fn; } });
  const nodes = { '[data-kdx-export]': el(), '[data-kdx-cancel]': el(), '[data-kdx-month]': el(), '[data-kdx-count]': el(), 'input[name="kdx-format"]:checked': { value: 'pdf' } };
  const modalEl = { querySelector: (q) => nodes[q] || el(), querySelectorAll: () => [], addEventListener() {} };
  const win = { KiwiDayReport: { timezone: () => 'Africa/Casablanca', dayBounds: () => ({ from: 0, to: 9e15 }) }, open: () => null,
    Kiwi: { modal: () => ({ el: modalEl, close: () => { closed++; } }), toast: (m, o) => toasts.push([m, o && o.type]) } };
  const doc = { getElementById: () => null, createElement: () => ({}), head: { appendChild() {} } };
  vm.runInNewContext(read('assets/day-report-export.js'), { window: win, document: doc, Intl, Date, Math, JSON, Number, String, Array, Object, RegExp, setTimeout });
  win.KiwiDayReportExport.open({ day: '2026-11-04', store: { slug: 'm' } });
  nodes['[data-kdx-export]'].fn();
  eq(closed, 0, 'the composer stays open when the report window was blocked');
  ok(toasts.length === 1 && toasts[0][1] === 'error', 'only the pop-up warning is shown, never a success message');
  win.open = () => ({ document: { open() {}, write() {}, close() {} }, addEventListener() {}, focus() {}, print() {} });
  nodes['[data-kdx-export]'].fn();
  eq(closed, 1, 'once the window opens the composer closes');
  eq(toasts.at(-1)[1], 'success');
}

console.log(`✓ r20 retail till: ${checks} checks (corrected clock, tenders, centimes, old sales, promotions, returns ledger)`);
