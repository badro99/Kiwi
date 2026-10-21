#!/usr/bin/env node
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

process.env.TZ = 'Europe/Berlin';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

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

console.log(`business-day surfaces · ${checks} checks green`);
