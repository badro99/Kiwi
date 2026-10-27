#!/usr/bin/env node
/* planning-store-day-pay-test · planning periods and pay, in the store's terms.
 *
 * 1. Period anchors. assets/team.js anchored the planning week on the
 *    device's local date and assets/planning-core.js, without an anchor, on
 *    the UTC date. Neither is the store's business day (its zone, its 05:00
 *    cutoff, CLAUDE.md "Two clocks"), so a manager abroad, or anyone between
 *    midnight and the cutoff, saw the week or month shift by a day.
 *    KiwiPlanningCore.storeToday() now gives the store's day (KiwiDayReport
 *    when loaded, else the shared rule in kit/business-day.js), and both
 *    anchor on it.
 * 2. Pay precision. "Reporter le planifié" copied each shift rounded to
 *    0.01 h, the rounding _worked-hours.js documents as paying 1 min 12 s for
 *    a minute; and the hours grid showed pay with no centimes although
 *    hourlyPayFor computes it to the centime.
 * Runs the real modules (planning-core in vm, payroll-view as ES module). */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

let checks = 0;
const ok = (yes, msg) => { assert.ok(yes, msg); checks++; console.log('  ✓ ' + msg); };
console.log('planning-store-day-pay-test');

/* ── 1. anchors ── */
const coreSource = fs.readFileSync(new URL('../assets/planning-core.js', import.meta.url), 'utf8');
const kitSource = fs.readFileSync(new URL('../assets/kit/business-day.js', import.meta.url), 'utf8');
// Sunday 16 Aug 2026, 23:30 UTC = Monday 17 Aug 08:30 in Auckland.
const instant = Date.parse('2026-08-16T23:30:00Z');
class FixedDate extends Date {
  constructor(...a) { super(...(a.length ? a : [instant])); }
  static now() { return instant; }
}
function core(extra = {}) {
  const context = vm.createContext({ console, structuredClone, Date: FixedDate, Math, JSON, Set, Map, Intl, ...extra });
  vm.runInContext(coreSource, context, { filename: 'planning-core.js' });
  return context;
}
{
  const ctx = core({ KiwiDayReport: { today: () => '2026-08-17' } });
  const P = ctx.KiwiPlanningCore;
  ok(typeof P.storeToday === 'function' && P.storeToday() === '2026-08-17', 'the planning day is the store business day (KiwiDayReport)');
  ok(P.calendarPeriod('week').start === '2026-08-17', 'a period without anchor starts on the store week, not the UTC one');
  ok(P.calendarPeriod('month').start === '2026-08-01', 'month periods anchor on the same store day');
}
{
  // No day report on the page: the shared rule (Casablanca, 05:00) decides.
  const at = Date.parse('2026-08-17T03:30:00Z'); // 03:30 UTC Monday: before 05:00 in Casablanca whatever its offset.
  class EarlyDate extends Date { constructor(...a) { super(...(a.length ? a : [at])); } static now() { return at; } }
  const ctx = vm.createContext({ console, structuredClone, Date: EarlyDate, Math, JSON, Set, Map, Intl });
  ctx.globalThis = ctx;
  vm.runInContext(kitSource, ctx, { filename: 'business-day.js' });
  vm.runInContext(coreSource, ctx, { filename: 'planning-core.js' });
  ok(ctx.KiwiPlanningCore.storeToday() === '2026-08-16', 'before the 05:00 cutoff the planning still stands on yesterday');
  ok(ctx.KiwiPlanningCore.calendarPeriod('week').start === '2026-08-10', 'so the week does not jump at midnight');
}
{
  const teamSource = fs.readFileSync(new URL('../assets/team.js', import.meta.url), 'utf8');
  const build = teamSource.slice(teamSource.indexOf('  function buildPeriod(kind) {'), teamSource.indexOf('  function periodNavigatorHtml('));
  ok(/KiwiPlanningCore\?\.storeToday\?\.\(\)/.test(build) && !/calendarPeriod\?\.\(kind, toISO\(today\)/.test(build),
    'team.js anchors the period on the store day, not the device date');
}

/* ── 2. pay precision ── */
globalThis.window = {
  __kiwiTeamV2: { periodKind: 'week', hoursByVenue: {}, shiftsByVenue: { v: { m1: { '2026-08-17': { start: '09:00', end: '16:10' } } } } },
  KiwiVenue: { getCurrentVenueData: () => ({ type: 'restaurant' }) },
};
globalThis.document = { addEventListener() {}, documentElement: { lang: 'fr' }, querySelector: () => null, querySelectorAll: () => [] };
const { createPayrollView } = await import('../assets/planning/payroll-view.js');
/* La paie en centimes (payCents, fmtPay) vit dans team.js et arrive dans la vue par injection : on prend les vraies fonctions. */
const teamSrc = fs.readFileSync(new URL('../assets/team.js', import.meta.url), 'utf8');
const grabConst = (start) => {
  const i = teamSrc.indexOf(start);
  let d = 0;
  for (let k = teamSrc.indexOf('{', i); k < teamSrc.length; k++) {
    if (teamSrc[k] === '{') d++; else if (teamSrc[k] === '}' && --d === 0) return teamSrc.slice(i, k + 1);
  }
  throw new Error('unbalanced ' + start);
};
const { payCents, fmtPay } = vm.runInNewContext(`${grabConst('const payCents = ')};\n${grabConst('const fmtPay = ')};\n({ payCents, fmtPay })`, { window: globalThis.window, document: globalThis.document, Math, Number });
const handlers = {};
const fn = () => '';
const minutes = (s) => { const [h, m] = String(s).split(':').map(Number); return h * 60 + m; };
const member = { id: 'm1', firstName: 'Test', hourlyRate: 17.29 };
const view = createPayrollView({
  AVATAR_COLORS: {}, IC: {}, Kiwi: { toast() {} }, handlers, live: {},
  buildPeriod: () => ({ days: ['2026-08-17'], startFr: '17/08', endFr: '17/08' }),
  correctionsHtml: fn, dateLocale: () => 'fr-FR', fmtPay, payCents, deferredMark: fn, esc: (v) => String(v), fmtHours: (v) => String(v), fmtMad: (n) => String(Math.round(n)) + ' MAD',
  getHours: () => window.__kiwiTeamV2.hoursByVenue.v || {}, getMembers: () => [member],
  hourlyPayFor: (m, h) => Math.round(h * m.hourlyRate * 100) / 100,
  initials: () => 'T', jobName: (v) => v, memberFullName: (m) => m.firstName, pad: (n) => String(n).padStart(2, '0'),
  payrollFigures: () => ({ totalHours: 0, variablePay: 0, baseMass: 0, onDuty: 0, salaried: 0, rated: 0, share: 1, baseDue: 0 }),
  periodNavigatorHtml: fn, periodPillsHtml: fn, render() {}, renderPlanningPane: fn, saveCustomTeams() {},
  shiftHours: (s) => (minutes(s.end) - minutes(s.start)) / 60, svgIcon: fn,
  t: () => ({ plNothing: '', plApplied: () => '' }), teamKey: () => 'v', toISO: (d) => new Date(d).toISOString().slice(0, 10), trLang: () => 'fr',
});
handlers['kt-plan-apply']();
const copied = window.__kiwiTeamV2.hoursByVenue.v.m1['2026-08-17'];
ok(copied === 430 / 60, 'a planned 7 h 10 is copied exactly, not rounded up to 7,17 h');
const T = new Proxy({}, { get: () => Object.assign(() => '', { toString: () => '' }) });
const html = view.renderHoursPane(T, {}, 'v', [member]);
const pay = Math.round((430 / 60) * 17.29 * 100) / 100; // 123.91
const cell = html.match(/kt-h-pay mono"><b>([^<]+)<\/b>/);
ok(cell && cell[1].replace(/\s/g, ' ') === pay.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).replace(/\s/g, ' '),
  'the hours grid shows the pay to the centime (' + (cell && cell[1]) + ')');
ok(/kt-h-foot-tot mono">[\s\S]*?<b>[^<]*,91<\/b><span>MAD/.test(html), 'and so does the period total');
const tiles = view.payTiles(T, { totalHours: 1, variablePay: 123.91, baseMass: 0, salaried: 0, rated: 1, share: 1, baseDue: 0 }, { days: ['2026-08-17'] }, 1);
ok(/123,91/.test(tiles[0].v) && /123,91/.test(tiles[2].v), 'the amount to pay and the variable pay keep their centimes');
console.log(`✓ planning-store-day-pay-test · ${checks} checks`);
