#!/usr/bin/env node
/* ═════════════════════════════════════════════════════════════════════════
 * « MOIS DERNIER » EST LE MOIS DERNIER
 *
 * 2026-10-12. Le sélecteur de période affiche « Mois dernier » sous la forme
 * « Septembre 2026 », « Ce trimestre » sous la forme « 1 Jul – 12 Oct 2026 »
 * et « Cette année » sous la forme « 2026 ». Les chiffres, eux, venaient de
 * rangeBounds : les 30, 90 et 365 derniers jours. Le 12 octobre,
 * « Septembre 2026 » totalisait du 13 septembre au 12 octobre, octobre
 * compris ; « vs mois préc. » pesait 30 jours contre les 30 d'avant ; « CA
 * moyen par jour » divisait une période personnalisée par 1 (la moyenne valait
 * le total) et l'année par 365. Sur la carte du chiffre d'affaires d'un
 * commerçant réel, les libellés (« AUJOURD'HUI », « Cumul horaire · hier »,
 * « 31 DERNIERS JOURS »…) n'avaient aucune traduction : la carte restait en
 * français sous EN et AR.
 *
 * On extrait les VRAIES fonctions de assets/dateRange.js et on les exécute
 * avec des journées de caisse simples (UTC, coupure 5 h).
 *
 *   node tools/date-range-calendar-truth-test.mjs
 * ═════════════════════════════════════════════════════════════════════════ */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = process.env.KIWI_ROOT || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = readFileSync(path.join(ROOT, 'assets/dateRange.js'), 'utf8');

function block(start) {
  const i = SRC.indexOf(start);
  assert.ok(i >= 0, start + ' found');
  let d = 0;
  for (let k = SRC.indexOf('{', i); k < SRC.length; k++) {
    if (SRC[k] === '{') d++; else if (SRC[k] === '}' && --d === 0) return SRC.slice(i, k + 1);
  }
  throw new Error('unbalanced ' + start);
}
const fn = (name) => block('function ' + name + '(');
const line = (re) => { const m = SRC.match(re); assert.ok(m, String(re)); return m[0]; };

let passed = 0, failed = 0;
function ok(label, f) {
  try { f(); passed++; console.log(`  ✓ ${label}`); }
  catch (e) { failed++; console.log(`  ✗ ${label}\n      ${String(e.message).split('\n')[0]}`); }
}

const H = 3600e3, CUT = 5 * H;
const dayStart = (key) => Date.parse(key + 'T00:00:00Z') + CUT;
const keyOf = (ts) => new Date(ts - CUT).toISOString().slice(0, 10);

function load(nowIso, sales, opts = {}) {
  const NOW = Date.parse(nowIso);
  class FixedDate extends Date { static now() { return NOW; } }
  const ctx = vm.createContext({
    Date: FixedDate, Math, Infinity, Number, String, Object, Array, JSON,
    window: {},
    currentRange: opts.range || 'aujourdhui',
    customRange: opts.customRange || null,
    lang: opts.lang || 'fr',
    getLang() { return ctx.lang; },
    activeMerchantSlug: () => 'cafe',
    merchantDayKey: (ts) => keyOf(ts),
    addMerchantDays: (key, n) => new Date(Date.parse(key + 'T00:00:00Z') + n * 864e5).toISOString().slice(0, 10),
    merchantDayBounds: (key) => ({ from: dayStart(key), to: dayStart(key) + 24 * H }),
    merchantParts: (ts) => ({ hour: String(new Date(ts).getUTCHours()).padStart(2, '0') }),
    dateToIso: (d) => d,
    realMoneyList: () => sales,
    realWindowStats: (a, b) => ({ revenue: sales.filter((s) => s.ts >= a && s.ts < b).reduce((n, s) => n + s.amount, 0) }),
  });
  vm.runInContext([
    line(/^ {2}const RANGE_DAYS = \{.*\};$/m),
    line(/^ {2}const DAY_ABBR = \[.*\];$/m),
    line(/^ {2}const frInt = .*$/m),
    fn('trStr'), fn('trTemplate'), fn('arDays'), fn('trLegend'),
    block('const REV_BADGE = {'), block('const REV_SUB = {'), block('const LEGEND_PREFIX = {'),
    fn('calendarStartKey'), fn('calendarBounds'), fn('rangeBounds'), fn('closedBounds'),
    fn('shiftedBusinessBounds'), fn('windowDays'), fn('realDeltaPct'), fn('niceCeil'),
    fn('hourlyCumul'), fn('dailyTotals'), fn('realRevSeries'),
    'this.api = { rangeBounds, realDeltaPct, windowDays, realRevSeries, trStr, trLegend, REV_BADGE, REV_SUB, LEGEND_PREFIX };',
  ].join('\n'), ctx);
  return { ...ctx.api, setLang: (l) => { ctx.lang = l; } };
}
const iso = (ts) => (ts === Infinity ? 'open' : new Date(ts).toISOString().slice(0, 16));
/* vm arrays come from another realm: copy before deepEqual. */
const isos = (b) => Array.from(b, iso);
const at = (dayIso, hour = 12) => Date.parse(dayIso + 'T' + String(hour).padStart(2, '0') + ':00:00Z');

/* « Maintenant » : lundi 12 octobre 2026, 14 h. Des ventes en août, en
   septembre, et en octobre (que « Mois dernier » ne doit pas compter). */
const SALES = [
  { ts: at('2026-08-05'), amount: 500 },
  { ts: at('2026-08-20'), amount: 500 },
  { ts: at('2026-09-10'), amount: 1500 },
  { ts: at('2026-10-05'), amount: 9000 },
  { ts: at('2025-03-01'), amount: 1000 },
  { ts: at('2025-11-01'), amount: 5000 },
  { ts: at('2026-03-01'), amount: 2000 },
];
const A = load('2026-10-12T14:00:00Z', SALES);

ok('« Mois dernier » le 12 octobre, c\'est septembre entier (pas du 13 septembre au 12 octobre)', () => {
  const [from, to] = A.rangeBounds('moisDernier');
  assert.equal(iso(from), iso(dayStart('2026-09-01')));
  assert.equal(iso(to), iso(dayStart('2026-10-01')));
});
ok('« Ce trimestre » part du 1er octobre, « Cette année » du 1er janvier, et restent ouverts', () => {
  assert.deepEqual(isos(A.rangeBounds('trimestre')), [iso(dayStart('2026-10-01')), 'open']);
  assert.deepEqual(isos(A.rangeBounds('annee')), [iso(dayStart('2026-01-01')), 'open']);
});
ok('« 7 jours » et « 30 jours » restent des fenêtres glissantes', () => {
  assert.equal(iso(A.rangeBounds('septJours')[0]), iso(dayStart('2026-10-06')));
  assert.equal(iso(A.rangeBounds('trenteJours')[0]), iso(dayStart('2026-09-13')));
});
ok('« vs mois préc. » compare septembre (1 500) à août (1 000) : +50 %, octobre exclu', () =>
  assert.equal(A.realDeltaPct('moisDernier', (s) => s.revenue), 50));
ok('« vs année préc. » pèse 2026 jusqu\'ici (13 500) contre 2025 jusqu\'au même jour (1 000), novembre 2025 exclu', () => {
  /* 2026 jusqu'au 12 oct. : 500+500+1500+9000+2000 = 13 500. 2025 jusqu'au 12 oct. 14 h : 1 000. */
  assert.equal(A.realDeltaPct('annee', (s) => s.revenue), 1250);
});
ok('« CA moyen par jour » : l\'année divise par 285 jours écoulés, septembre par 30', () => {
  assert.equal(A.windowDays('annee'), 285);
  assert.equal(A.windowDays('moisDernier'), 30);
  assert.equal(A.windowDays('aujourdhui'), 1);
});
ok('une période personnalisée de trois jours compte trois jours, pas un', () => {
  const C = load('2026-10-12T14:00:00Z', SALES, { range: 'personnalise', customRange: { start: '2026-08-03', end: '2026-08-05' } });
  assert.equal(C.windowDays('personnalise'), 3);
});

/* Bascule d'année : mi-janvier, « Mois dernier » est décembre de l'an passé,
   et le trimestre d'avant est le 4e de l'année précédente. */
const J = load('2027-01-15T14:00:00Z', SALES);
ok('mi-janvier, « Mois dernier » est décembre 2026', () =>
  assert.deepEqual(isos(J.rangeBounds('moisDernier')), [iso(dayStart('2026-12-01')), iso(dayStart('2027-01-01'))]));
ok('en février, « vs trimestre préc. » regarde à partir du 1er octobre de l\'an passé', () => {
  const F = load('2027-02-10T14:00:00Z', [{ ts: at('2026-10-20'), amount: 100 }, { ts: at('2027-01-20'), amount: 300 }]);
  assert.deepEqual(isos(F.rangeBounds('trimestre')), [iso(dayStart('2027-01-01')), 'open']);
  assert.equal(F.realDeltaPct('trimestre', (s) => s.revenue), 200);
});

/* La carte d'un commerçant réel : ce qu'elle produit, traduit. */
const fr = /\b(AUJOURD|HIER|PÉRIODE|MOIS|TRIMESTRE|ANNÉE|DERNIERS|Cumul|journalier|jours|précédents|hier|sélectionnée)\b/;
const ranges = ['aujourdhui', 'hier', 'septJours', 'trenteJours', 'moisDernier', 'trimestre', 'annee'];
ok('la carte nomme la période qu\'elle trace : « MOIS DERNIER », pas « 30 DERNIERS JOURS »', () => {
  assert.equal(A.realRevSeries('moisDernier').rangeBadge, 'MOIS DERNIER');
  assert.equal(A.realRevSeries('moisDernier').sub, 'Total journalier · mois dernier');
  assert.equal(A.realRevSeries('annee').rangeBadge, 'CETTE ANNÉE');
  assert.match(A.realRevSeries('moisDernier').legendPrimary, /^Total 30 jours · /);
  assert.match(A.realRevSeries('annee').legendPrimary, /^Total 285 jours · /);
});
for (const lang of ['en', 'ar']) {
  ok(`every badge, sub-line and legend the real card can produce reads ${lang.toUpperCase()}`, () => {
    A.setLang(lang);
    for (const r of ranges) {
      const d = A.realRevSeries(r);
      for (const [label, s, tr] of [['badge', d.rangeBadge, A.trStr(d.rangeBadge, A.REV_BADGE)], ['sub', d.sub, A.trStr(d.sub, A.REV_SUB)],
        ['legend', d.legendPrimary, A.trLegend(d.legendPrimary, A.LEGEND_PREFIX)], ['compare', d.legendCompare, A.trLegend(d.legendCompare, A.LEGEND_PREFIX)]]) {
        if (!s) continue;
        assert.ok(!fr.test(tr), `${r} ${label}: « ${tr} »`);
      }
    }
    A.setLang('fr');
  });
}
ok('a day count other than 7 or 30 is translated, with the Arabic count agreeing', () => {
  A.setLang('en');
  assert.equal(A.trStr('31 DERNIERS JOURS', A.REV_BADGE), 'LAST 31 DAYS');
  assert.equal(A.trLegend('Total 92 jours · 1 200 MAD', A.LEGEND_PREFIX), '92-day total · 1 200 MAD');
  A.setLang('ar');
  assert.equal(A.trStr('31 DERNIERS JOURS', A.REV_BADGE), 'آخر 31 يومًا');
  assert.equal(A.trLegend('Total 3 jours · 0 MAD', A.LEGEND_PREFIX), 'إجمالي 3 أيام · 0 MAD');
  assert.equal(A.trStr('7 DERNIERS JOURS', A.REV_BADGE), 'آخر 7 أيام', 'the exact key still wins');
  A.setLang('fr');
  assert.equal(A.trStr('31 DERNIERS JOURS', A.REV_BADGE), '31 DERNIERS JOURS', 'French is untouched');
});

console.log(`\ndate-range-calendar-truth: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
