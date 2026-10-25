#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
 * « VS HIER » À LA MÊME HEURE
 *
 * realDeltaPct promettait, dans son propre commentaire, de comparer « le jour
 * jusqu'ici » à la même tranche du jour de référence. shiftedBusinessBounds
 * rend pourtant des journées ENTIÈRES : à 11h42, six heures de caisse étaient
 * pesées contre toute la journée d'hier, et chaque tuile du matin affichait
 * −80 à −100 %. Mesuré le 2026-10-11 sur le stack local.
 *
 * On extrait la VRAIE fonction de assets/dateRange.js et on l'exécute avec
 * des journées simples (UTC, coupure 5 h) et un registre de ventes inventé.
 *
 *   node tools/kpi-same-slice-test.mjs
 * ═══════════════════════════════════════════════════════════════════════════ */
import assert from 'node:assert/strict';
import coreTestSource from './core-test-source.cjs';
const { readFileSync } = coreTestSource;
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = process.env.KIWI_ROOT || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = readFileSync(path.join(ROOT, 'assets/dateRange.js'), 'utf8');

function grab(name) {
  const i = SRC.indexOf('function ' + name + '(');
  assert.ok(i >= 0, name + ' found');
  let d = 0;
  for (let k = SRC.indexOf('{', i); k < SRC.length; k++) {
    if (SRC[k] === '{') d++; else if (SRC[k] === '}' && --d === 0) return SRC.slice(i, k + 1);
  }
  throw new Error('unbalanced ' + name);
}

let passed = 0, failed = 0;
function ok(label, fn) {
  try { fn(); passed++; console.log(`  ✓ ${label}`); }
  catch (e) { failed++; console.log(`  ✗ ${label}\n      ${String(e.message).split('\n')[0]}`); }
}

const H = 3600e3, CUT = 5 * H;
const dayStart = (key) => Date.parse(key + 'T00:00:00Z') + CUT;
const keyOf = (ts) => new Date(ts - CUT).toISOString().slice(0, 10);

/* « Maintenant » : dimanche 11 octobre 2026, 11h42. Hier, 400 MAD encaissés
   avant 11h42 et 600 MAD le soir. Aujourd'hui, 400 MAD jusqu'ici. */
const NOW = Date.parse('2026-10-11T11:42:00Z');
const SALES = [
  { ts: Date.parse('2026-10-10T09:00:00Z'), amount: 400 },
  { ts: Date.parse('2026-10-10T21:00:00Z'), amount: 600 },
  { ts: Date.parse('2026-10-11T10:00:00Z'), amount: 400 },
];

function run(range, liveEnd) {
  const ctx = vm.createContext({
    Date: Object.assign(function () {}, { now: () => NOW, parse: Date.parse }),
    Math, Infinity,
    currentRange: range,
    activeMerchantSlug: () => 'cafe',
    merchantDayKey: (ts) => keyOf(ts),
    addMerchantDays: (key, n) => new Date(Date.parse(key + 'T00:00:00Z') + n * 864e5).toISOString().slice(0, 10),
    merchantDayBounds: (key) => ({ from: dayStart(key), to: dayStart(key) + 24 * H }),
    rangeBounds: () => liveEnd,
    realWindowStats: (a, b) => ({ revenue: SALES.filter((s) => s.ts >= a && s.ts < b).reduce((n, s) => n + s.amount, 0) }),
  });
  vm.runInContext([grab('closedBounds'), grab('shiftedBusinessBounds'), grab('calendarStartKey'), grab('calendarBounds'), grab('realDeltaPct'), grab('halfUpDiv'), grab('deltaTenths')].join('\n')
    + '\nthis.f = realDeltaPct;', ctx);
  return ctx.f(range, (s) => s.revenue);
}

const today = dayStart('2026-10-11');
ok("« Aujourd'hui » à 11h42 se compare à hier jusqu'à 11h42 (400 vs 400 → 0 %)", () =>
  assert.equal(run('aujourdhui', [today, Infinity]), 0));
ok('pas « −60 % » contre la journée entière d’hier (400 vs 1 000)', () =>
  assert.notEqual(run('aujourdhui', [today, Infinity]), -60));
ok('une plage close (« Hier ») garde la journée entière comme référence', () => {
  const y = dayStart('2026-10-10');
  /* Hier (1 000) contre avant-hier (rien) : pas de référence → null. */
  assert.equal(run('hier', [y, y + 24 * H]), null);
});

console.log(`\nkpi-same-slice: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
