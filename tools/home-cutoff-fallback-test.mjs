#!/usr/bin/env node
/* home-cutoff-fallback-test · wave 12, lane G (home#2).
 *
 * Until assets/day-report.js publishes the merchant's business-day cutoff, the
 * dashboard's dayCutoffH() used to answer 0, so between 00:00 and 05:00 the
 * Home counted "today" from midnight while the till (5 h business day) still
 * showed yesterday. The fallback is the shared default, 05:00, never midnight.
 * Runs the REAL function from assets/dateRange.js. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = process.env.KIWI_ROOT || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = readFileSync(path.join(ROOT, 'assets/dateRange.js'), 'utf8');
const i = SRC.indexOf('function dayCutoffH(');
assert.ok(i >= 0, 'dayCutoffH found');
let d = 0, end = -1;
for (let k = SRC.indexOf('{', i); k < SRC.length; k++) {
  if (SRC[k] === '{') d++; else if (SRC[k] === '}' && --d === 0) { end = k + 1; break; }
}
const fnSrc = SRC.slice(i, end);

function run(win) {
  const ctx = vm.createContext({ window: win, Number, isFinite });
  vm.runInContext(fnSrc + '\nthis.out = dayCutoffH;', ctx);
  return ctx.out;
}
let n = 0;
const ok = (label, f) => { f(); n++; console.log('  ✓ ' + label); };

ok('no day-report module yet: 05:00, not midnight', () => assert.equal(run({})('shop'), 5));
ok('day-report present but cutoff() throws: 05:00', () =>
  assert.equal(run({ KiwiDayReport: { cutoff() { throw new Error('boom'); } } })('shop'), 5));
ok('day-report answers garbage (NaN, 13, a string, null): 05:00', () => {
  for (const bad of [NaN, 13, -1, '4', null, undefined]) {
    assert.equal(run({ KiwiDayReport: { cutoff: () => bad } })('shop'), 5, String(bad));
  }
});
ok('a real cutoff from the report still wins (0, 3 and 12)', () => {
  for (const h of [0, 3, 12]) assert.equal(run({ KiwiDayReport: { cutoff: () => h } })('shop'), h);
});
console.log(`PASS home cutoff fallback (${n} checks)`);
