#!/usr/bin/env node
/* promo-business-day-test · wave 12, lane G (promos#0 and promos#1).
 *
 * promos#0 · the boutique promotions dashboard hard-coded Africa/Casablanca and
 * ended a promotion at 23:59:59 of the civil day, while menu promotions use the
 * 05:00 business day in the merchant's zone. "Until the 31st" now ends at the
 * 05:00 bascule that closes business day 31, in the store's own zone, and the
 * date shown back is the business day. Runs the real helpers of
 * assets/boutique-promos-dashboard.js over the real assets/day-report.js.
 * promos#1 · see the second half of this file (percentage precision). */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const read = (f) => fs.readFileSync(new URL('../' + f, import.meta.url), 'utf8');
let n = 0;
const ok = (label, f) => { f(); n++; console.log('  ✓ ' + label); };

function dayReportWindow(zone) {
  const storage = new Map([['kiwiPairedVenue', JSON.stringify({ merchant: 'shop', timezone: zone })]]);
  const w = {
    localStorage: { getItem: (k) => storage.get(k) || null, setItem: (k, v) => storage.set(k, String(v)) },
    addEventListener() {}, KiwiConfig: { timezone: zone },
    KiwiCaissePairing: { pairedVenue: () => ({ merchant: 'shop', timezone: zone }) },
  };
  w.window = w;
  const ctx = vm.createContext({ window: w, localStorage: w.localStorage, Date, Math, JSON, Intl, String, Number, Object, Array, RegExp });
  vm.runInContext(read('assets/kit/haptics.js'), ctx);            // the zone law: this machine's tzdata may be stale
  vm.runInContext(read('assets/day-report.js'), ctx);
  return { w, ctx };
}
const SRC = read('assets/boutique-promos-dashboard.js');
const from = SRC.indexOf('  var FALLBACK_ZONE');
const to = SRC.indexOf('  var endOfDay = function');
assert.ok(from > 0 && to > from, 'helper block found');
const block = SRC.slice(from, SRC.indexOf('\n', to) + 1);
function helpers({ zone = 'Africa/Casablanca', report = true } = {}) {
  const { w, ctx } = dayReportWindow(zone);
  const win = report ? w : {};
  const sandbox = vm.createContext({ window: win, globalThis: ctx, Intl, Date, Math, isFinite, String, Number, loc: () => 'fr-FR' });
  sandbox.globalThis = ctx;                                          // the zone law is a page global, with or without the report
  vm.runInContext(block + '\nthis.api = { boundary, startOfDay, endOfDay, toInput, fmtDay, fmtHM, dayKey };', sandbox);
  return sandbox.api;
}
const iso = (ms) => new Date(ms).toISOString();

ok('"until 31 Oct" ends at the 05:00 bascule, not 23:59:59', () => {
  const H = helpers();
  assert.equal(iso(H.endOfDay('2026-10-31')), '2026-11-01T04:59:59.999Z');
  assert.equal(iso(H.startOfDay('2026-10-31')), '2026-10-31T05:00:00.000Z');
});
ok('a sale at 02:00 on 1 Nov still belongs to the promotion that runs until the 31st', () => {
  const H = helpers();
  const end = H.endOfDay('2026-10-31'), sale = Date.parse('2026-11-01T02:00:00Z');
  assert.ok(sale <= end, 'the night of the 31st is inside the promotion');
  assert.ok(Date.parse('2026-11-01T05:00:00Z') > end, 'the new business day is outside');
});
ok('before 05:00, "today" is still the previous business day', () => {
  const H = helpers();
  assert.equal(iso(H.endOfDay(new Date('2026-10-31T02:00:00Z'))), '2026-10-31T04:59:59.999Z');
  assert.equal(iso(H.endOfDay(new Date('2026-10-31T12:00:00Z'))), '2026-11-01T04:59:59.999Z');
});
ok('the date shown back is the business day, and the stop time reads 05:00', () => {
  const H = helpers();
  const end = H.endOfDay('2026-10-31');
  assert.equal(H.toInput(end), '2026-10-31', 'the date input keeps the day the owner chose');
  assert.equal(H.toInput(H.startOfDay('2026-10-31')), '2026-10-31');
  assert.equal(H.fmtHM(end), '05:00');
  assert.match(H.fmtDay(end), /31/);
  assert.equal(H.toInput(0), '');
});
ok("the store's zone and cutoff come from the day report, not a constant", () => {
  const H = helpers({ zone: 'Europe/Paris' });                      // UTC+2 on 20 Oct 2026
  assert.equal(iso(H.startOfDay('2026-10-20')), '2026-10-20T03:00:00.000Z');
  assert.equal(iso(H.endOfDay('2026-10-20')), '2026-10-21T02:59:59.999Z');
});
ok('without the day report the civil day of Casablanca still answers', () => {
  const H = helpers({ report: false });
  assert.equal(iso(H.startOfDay('2026-10-31')), '2026-10-31T00:00:00.000Z');
  assert.equal(iso(H.endOfDay('2026-10-31')), '2026-10-31T23:59:59.999Z');
});
ok('the date inputs hand the chosen date to the helpers, not a noon instant', () => {
  assert.ok(/startOfDay\(from\.value\)/.test(SRC) && /endOfDay\(to\.value\)/.test(SRC) && /startOfDay\(before\.value\)/.test(SRC));
  assert.ok(!/var zone = 'Africa\/Casablanca'/.test(SRC), 'no hard-coded zone constant drives the wall clock');
});
console.log(`PASS promotion business day (${n} checks)`);
