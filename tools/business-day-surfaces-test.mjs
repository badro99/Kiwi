#!/usr/bin/env node
import retailSource from './pos-retail-test-source.cjs';
/* The report's custom range, « Vendus » and the reprint list count a sale by
   the store's business day (cutoff 05:00, store zone), like the Z and the
   dashboard. Before, each one cut at the device's calendar midnight, so a
   01:15 sale landed in the next day's report and vanished from the reprint
   list mid-service. The modules run as shipped, in a vm, on a device whose
   clock is not the store's (Berlin vs Casablanca). */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { businessBoundary } from '../functions/api/_business-day.js';
import { DateTimeFormat } from '../functions/api/_zone-law.js';

process.env.TZ = 'Europe/Berlin';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => retailSource(fs.readFileSync(path.join(root, p), 'utf8'));

const merchant = 'business-day-surfaces';
const zone = 'Africa/Casablanca';
const NOW = Date.parse('2026-10-21T00:30:00Z');          /* 01:30 in Casablanca, 02:30 in Berlin */
const evening = Date.parse('2026-10-20T19:00:00Z');      /* 20:00 Casablanca, 20 Oct */
const lateNight = Date.parse('2026-10-21T00:15:00Z');    /* 01:15 Casablanca, still the 20th's service */
const nextMorning = Date.parse('2026-10-21T09:00:00Z');  /* 10:00 Casablanca, the 21st */

const memory = new Map();
const localStorage = {
  getItem: (k) => (memory.has(k) ? memory.get(k) : null),
  setItem: (k, v) => memory.set(k, String(v)),
  removeItem: (k) => memory.delete(k),
};
const FixedDate = class extends Date {
  constructor(...a) { if (a.length) super(...a); else super(NOW); }
  static now() { return NOW; }
};
const venue = { id: merchant, slug: merchant, name: 'Surfaces', timezone: zone, type: 'boutique', fullDisplay: 'Surfaces', goal: 0 };
const windowBase = () => ({
  localStorage,
  KiwiEnv: { isReal: () => true },
  KiwiConfig: { timezone: zone },
  KiwiVenue: { getVenue: () => merchant, isCustom: () => true, getCurrentVenueData: () => venue },
  KiwiLive: { merchant: () => merchant },
  KiwiI18n: { getLang: () => 'fr', T: { fr: {}, en: {}, ar: {} } },
  addEventListener: () => {},
  dispatchEvent: () => {},
});
const globals = { localStorage, Date: FixedDate, Intl, Math, JSON, Number, String, Array, Object, RegExp, Set, Map, console, CustomEvent: function CustomEvent() {} };

function load(file, win, extra = {}) {
  const ctx = vm.createContext({ window: win, ...globals, ...extra });
  win.window = win;
  vm.runInContext(read(file), ctx, { filename: file });
  return win;
}

const dayReport = load('assets/day-report.js', windowBase()).KiwiDayReport;
const day = dayReport.dayBounds('2026-10-20', merchant);
assert.equal(dayReport.today(merchant), '2026-10-20', 'at 01:30 the business day is still the 20th');
assert.equal(dayReport.businessDay(lateNight, merchant), '2026-10-20');
assert.equal(new Date(day.from).toISOString(), '2026-10-20T04:00:00.000Z', 'the 20th starts at 05:00 Casablanca');

const sale = (id, ts, amount) => ({ id, ref: id, ts, amount, method: 'cash', label: 'Vente', lines: [{ name: 'Chemise', qty: 1, total: amount }] });
const sales = [sale('S-EVE', evening, 300), sale('S-LATE', lateNight, 200), sale('S-NEXT', nextMorning, 999)];
let checks = 0;

/* 1. Rapport d'activité, custom range 20 → 20 October. */
{
  memory.set('kiwiCustomRange', '2026-10-20|2026-10-20');
  const win = Object.assign(windowBase(), {
    KiwiDayReport: dayReport,
    KiwiSales: { list: () => sales },
    KiwiRefunds: { list: () => [] },
    KiwiDateRange: { getDateRange: () => 'personnalise', bounds: () => [day.from, day.to] },
  });
  const document = { baseURI: 'https://kiwi.test/', createElement: () => ({ style: {}, click() {}, remove() {} }), body: { appendChild() {} } };
  load('assets/report.js', win, { document, Blob, URL: { createObjectURL: () => 'blob:x', revokeObjectURL() {} }, setTimeout: () => 1 });
  const snap = win.KiwiReport.snapshot();
  assert.equal(snap.period.from, day.from, 'report starts at the business day cutoff, not device midnight');
  assert.equal(snap.period.to, day.to, 'report ends at the next cutoff');
  assert.equal(snap.grossSales, 500, 'the 01:15 sale belongs to the 20th; the 10:00 sale of the 21st does not');
  memory.delete('kiwiCustomRange');
  checks += 3;
}

/* 2. Vendus, a custom single day. */
{
  const win = Object.assign(windowBase(), { KiwiDayReport: dayReport });
  load('assets/sold-insights.js', win, { document: { documentElement: { lang: 'fr' } }, setTimeout: () => 1 });
  const res = win.KiwiSoldInsights.analyze(sales, { from: '2026-10-20', to: '2026-10-20' });
  assert.equal(res.from, day.from, 'Vendus starts the day at the cutoff');
  assert.equal(res.to, day.to);
  assert.equal(res.tickets, 2, 'Vendus counts the evening and the 01:15 ticket');
  assert.equal(res.revenue, 500);
  checks += 4;
}

/* 2b. Vendus' comparison period across a DST change (Paris, 29 March 2026):
   the business day of the 28th lasts 23 hours. The previous day must still
   start at 05:00 on the 27th, not an hour later. */
{
  const paris = 'Europe/Paris';
  const parisWindow = () => Object.assign(windowBase(), {
    KiwiConfig: { timezone: paris },
    KiwiVenue: { getVenue: () => merchant, isCustom: () => true, getCurrentVenueData: () => ({ ...venue, timezone: paris }) },
  });
  const R = load('assets/day-report.js', parisWindow()).KiwiDayReport;
  assert.equal(R.dayBounds('2026-03-28', merchant).to - R.dayBounds('2026-03-28', merchant).from, 23 * 3600000, 'the fixture day is the 23-hour one');
  const win = Object.assign(parisWindow(), { KiwiDayReport: R });
  load('assets/sold-insights.js', win, { document: { documentElement: { lang: 'fr' } }, setTimeout: () => 1 });
  const early27 = sale('S-27', Date.parse('2026-03-27T04:30:00Z'), 80); /* 05:30 Paris on the 27th */
  const res = win.KiwiSoldInsights.analyze([early27, sale('S-28', Date.parse('2026-03-28T12:00:00Z'), 90)], { from: '2026-03-28', to: '2026-03-28' });
  assert.equal(res.tickets, 1);
  assert.equal(res.previousTickets, 1, 'a 05:30 sale on the 27th is in the previous day across the DST change');
  checks += 3;
}

/* 3. Réimprimer: at 01:30 the evening's receipts are still in the list. */
{
  const win = Object.assign(windowBase(), { KiwiDayReport: dayReport, KiwiLive: { merchant: () => merchant } });
  const document = { createElement: () => ({ style: {}, setAttribute() {}, appendChild() {} }), head: { appendChild() {} }, body: { appendChild() {} }, querySelector: () => null, getElementById: () => null };
  load('assets/pos-reprint.js', win, { document, setTimeout: () => 1, fetch: () => Promise.reject(new Error('offline')) });
  const P = win.KiwiPosReprint;
  P.provide('boutique', () => [
    { ref: 'S-EVE', ts: evening, total: 300 },
    { ref: 'S-LATE', ts: lateNight, total: 200 },
    { ref: 'S-OLD', ts: Date.parse('2026-10-19T19:00:00Z'), total: 50 },
  ]);
  const refs = P.rows('boutique').map((r) => r.ref);
  assert.deepEqual(refs, ['S-LATE', 'S-EVE'], 'the reprint list keeps the whole service, and only it');
  checks += 1;
}

/* 3b. The boutique's « Échanges & avoirs » picker files a 01:15 sale under
   the evening it belongs to, the same day its « aujourd'hui » header uses.
   The two helpers are lifted from the shipped file and run as they are. */
{
  const src = read('assets/pos-boutique.js');
  const grab = (name) => {
    const at = src.indexOf(`  function ${name}(`);
    assert.ok(at > 0, `${name} found in pos-boutique.js`);
    return src.slice(at, src.indexOf('\n', at)); /* each helper is one line */
  };
  const win = { KiwiDayReport: dayReport };
  const ctx = vm.createContext({ window: win, ...globals });
  vm.runInContext(`${grab('retDayKey')}\n${grab('retShiftDay')}\nwindow.retDayKey = retDayKey; window.retShiftDay = retShiftDay;`, ctx);
  assert.equal(win.retDayKey(lateNight), '2026-10-20', 'a 01:15 sale is the 20th in the returns picker');
  assert.equal(win.retDayKey(NOW), '2026-10-20', '« Aujourd\'hui » at 01:30 is still the 20th');
  assert.equal(win.retShiftDay('2026-10-20', -1), '2026-10-19');
  assert.equal(win.retShiftDay('2026-10-01', -6), '2026-09-25');
  assert.match(src, /const dateKey = retDayKey;/, 'renderEchanges files sales with the business-day key');
  checks += 5;
}

/* 4. The dashboard loads report.js on demand. That URL must be the stamped
   one the page preloads, or a returning browser keeps the old report (and a
   root-absolute path breaks under the GitHub Pages sub-path). */
{
  const preload = /<link rel="preload" href="(assets\/report\.js\?v=\d+)"/.exec(read('dashboard.html'));
  const loader = /new URL\('([^']*report\.js\?v=\d+)', document\.baseURI\)/.exec(read('assets/dashboard-extra.js'));
  assert.ok(preload && loader, 'report.js preload and loader found');
  assert.equal(loader[1], preload[1], 'the on-demand report loader asks for the preloaded, stamped URL');
  checks += 1;
}

/* 5. Un avoir expire à la bascule qui clôt sa dernière journée (05:00 le
   lendemain, functions/api/store-credits.js). La caisse (bon imprimé, liste
   des avoirs) et le tableau de bord (registre des avoirs, fiche cliente)
   affichent tous la même date : cette dernière journée commerciale, lue dans
   le fuseau du magasin et non à la date civile de l'instant d'expiration, qui
   serait le lendemain. Les avoirs plus anciens, à un instant quelconque,
   gardent leur journée commerciale. */
{
  const report = load('assets/day-report.js', windowBase(), { KiwiZoneLaw: { DateTimeFormat } }).KiwiDayReport;
  const helper = /(?:const creditLastDay = \(until\) => \{[\s\S]*?\n  \};|function creditLastDay\(until\) \{[\s\S]*?\n  \})/;
  const surfaces = {
    'assets/pos-boutique/sales.js': [/fmtDayY\((?:av|a|credit)\.until\)/],
    'assets/pos-maison/sales.js': [/fmtDayY\((?:av|a|credit)\.until\)/],
    'assets/pages-pro/boutique-promos-returns.js': [/new Date\(Number\(credit\.expiresAt\)[^)]*\)\.toLocaleDateString/],
    'assets/clients-book.js': [/new Date\(credit\.expiresAt\)\.toLocaleDateString/],
  };
  const sameDay = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const cases = [
    [businessBoundary('2026-10-21', 5, zone), '2026-10-20', 'server expiry at 05:00 on the 21st shows the 20th'],
    [Date.parse('2026-10-20T14:23:00Z'), '2026-10-20', 'a legacy afternoon expiry keeps its day'],
    [Date.parse('2026-10-21T01:00:00Z'), '2026-10-20', 'a legacy 01:00 expiry belongs to the previous service'],
  ];
  for (const [file, banned] of Object.entries(surfaces)) {
    const text = fs.readFileSync(path.join(root, file), 'utf8');
    const m = helper.exec(text);
    assert.ok(m, `${file} defines creditLastDay`);
    const ctx = vm.createContext({ window: { KiwiDayReport: report }, Date, Number, String, RegExp });
    const lastDay = vm.runInContext(`${m[0]}; creditLastDay`, ctx);
    for (const [until, want, why] of cases) assert.equal(sameDay(lastDay(until)), want, `${file}: ${why}`);
    const fallback = vm.runInContext(`${m[0]}; creditLastDay`, vm.createContext({ window: {}, Date, Number, String, RegExp }));
    assert.equal(fallback(businessBoundary('2026-10-21', 5, 'UTC')).getTime() < businessBoundary('2026-10-21', 5, 'UTC'), true, `${file}: without the report the fallback stays before the expiry`);
    for (const re of banned) assert.ok(!re.test(text), `${file} no longer shows the raw expiry instant`);
    checks += cases.length + 2;
  }
  for (const file of ['assets/pos-boutique/checkout.js', 'assets/pos-maison/checkout.js']) {
    const text = fs.readFileSync(path.join(root, file), 'utf8');
    assert.ok(!/fmtDayY\((?:av|a)\.until\)/.test(text), `${file} prints the voucher validity through fmtValidUntil`);
    assert.equal((text.match(/fmtValidUntil\((?:av|a)\.until\)/g) || []).length, 3, `${file} uses fmtValidUntil on the voucher, its receipt and the voucher list`);
    checks += 2;
  }
}

console.log(`business-day surfaces · ${checks} checks green`);
