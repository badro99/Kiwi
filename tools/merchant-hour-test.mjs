#!/usr/bin/env node
import coreTestSource from './core-test-source.cjs';
/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · L'heure d'une vente est celle du COMMERCE, pas celle de l'appareil
 *
 * « Heure de pointe » et plage d'ouverture du tableau de bord buckétaient avec
 * Date#getHours() : le fuseau du navigateur. Un patron qui ouvre le tableau de
 * bord depuis Paris, Dubaï ou son téléphone en voyage voyait ses pics décalés.
 * Même défaut sur « aujourd'hui » lu en date UTC (agent-truth, agent) : entre
 * minuit et 1 h à Casablanca, la date UTC est encore celle de la veille.
 *
 * KiwiDayReport.hourOf() lit l'heure dans le fuseau du commerce (le même que
 * businessDay / dayBounds).
 * ─────────────────────────────────────────────────────────────────────────── */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const read = (rel) => coreTestSource.readFileSync(new URL('../' + rel, import.meta.url), 'utf8');
const src = read('assets/day-report.js');

function boot(zone) {
  const memory = new Map();
  const ls = { getItem: (k) => (memory.has(k) ? memory.get(k) : null), setItem: (k, v) => memory.set(k, String(v)), removeItem: (k) => memory.delete(k) };
  const win = { localStorage: ls, addEventListener: () => {}, KiwiConfig: zone ? { timezone: zone } : {} };
  win.window = win;
  const ctx = vm.createContext({ window: win, localStorage: ls, Date, Math, JSON, RegExp, Array, Object, String, Number, Intl });
  vm.runInContext(src, ctx);
  return win.KiwiDayReport;
}

const ts = Date.UTC(2026, 9, 15, 23, 30); // 23 h 30 UTC
const casa = boot('Africa/Casablanca');
assert.equal(typeof casa.hourOf, 'function', 'hourOf est exposé');
assert.equal(casa.hourOf(ts), 0, '23 h 30 UTC = 00 h 30 à Casablanca (UTC+1)');
assert.equal(casa.businessDay(ts), '2026-10-15', 'et c\'est encore la journée commerciale du 15 (bascule 5 h)');
assert.equal(casa.hourOf(Date.UTC(2026, 9, 15, 12, 0)), 13, '12 h UTC = 13 h à Casablanca');
const auckland = boot('Pacific/Auckland');
assert.equal(auckland.hourOf(ts), 12, 'le fuseau configuré du commerce fait foi, quel que soit celui de la machine');

// Les sites qui buckétaient avec getHours() passent par le fuseau du commerce.
const dr = read('assets/dateRange.js');
assert.ok(/function saleHour\(ts\)/.test(dr) && /R\.hourOf\(ts\)/.test(dr), 'dateRange lit l\'heure via KiwiDayReport.hourOf');
assert.equal((dr.match(/saleHour\(/g) || []).length, 3, 'les buckets directs utilisent le commerce');
assert.match(dr, /hoursFromSales\(rows, from, to, saleHour\)/, 'le bucket partagé reçoit aussi le fuseau du commerce');
assert.ok(!/const hour = new Date\([^)]*\)\.getHours\(\)/.test(dr), 'plus de getHours() dans le résumé d\'insight');
assert.ok(!/const h = new Date\(ts\)\.getHours\(\);\s*byHour\[h\]/.test(dr), 'ni dans la plage d\'ouverture');
for (const f of ['assets/agent-truth.js', 'assets/agent.js']) {
  const s = read(f);
  assert.ok(/KiwiDayReport\.today\(\)/.test(s), f + ' lit « aujourd\'hui » dans la journée commerciale');
}

console.log('merchant-hour-test: ok');
