#!/usr/bin/env node
/* retail-basket-cents-test · a boutique or Maison receipt's lines add up to the ticket, to the centime.
 *
 *   node tools/retail-basket-cents-test.mjs
 *
 * Read in production on 21 October: a boutique ticket cashed at 171,00 had
 * 190,00 of lines on the server. The loyalty reward lowers the ticket, not a
 * line, and every line left at its price before the reward, so each article
 * looked 10 % better than it sold. And each line was rounded to the dirham, so
 * a 249,90 caftan was filed at 250. bqLineTotals() fixes both, in the two
 * tills; this suite runs the function itself and checks that every basket the
 * tills send goes through it. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let n = 0;
const ok = (yes, msg) => { assert.ok(yes, msg); n++; console.log('  ✓ ' + msg); };
const eq = (a, b, msg) => { assert.deepEqual(JSON.parse(JSON.stringify(a)), b, msg); n++; console.log('  ✓ ' + msg); };

const grab = (src, name) => {
  const at = src.indexOf('  function ' + name + '(');
  assert.ok(at >= 0, name + ' is present');
  const end = src.indexOf('\n  }\n', at);
  return src.slice(at, end + 4);
};
const boutique = fs.readFileSync(path.join(root, 'assets/pos-boutique.js'), 'utf8');
const maison = fs.readFileSync(path.join(root, 'assets/pos-maison.js'), 'utf8');
const fb = grab(boutique, 'bqLineTotals');
ok(fb === grab(maison, 'bqLineTotals'), 'boutique and Maison share the same bqLineTotals');
const ctx = {}; vm.createContext(ctx); vm.runInContext(fb + '\nthis.f = bqLineTotals;', ctx);
const f = ctx.f;
const sum = (a) => Math.round(a.reduce((s, x) => s + x * 100, 0));

eq(f([249.9], 249.9), [249.9], 'a 249,90 caftan leaves at 249,90, not 250');
eq(f([190], 171), [171], 'one line under a 10 % reward leaves at the ticket, 171,00');
const two = f([100, 90], 171);
ok(sum(two) === 17100, 'two lines under the reward add up to the ticket exactly (' + two.join(' + ') + ')');
eq(two, [90, 81], 'and the reward is shared in proportion');
const three = f([10, 10, 10], 20);
ok(sum(three) === 2000, 'three equal lines on a 20,00 ticket add up to 20,00 (' + three.join(' + ') + ')');
ok(three.every((x) => Math.round(x * 100) === x * 100), 'every share is a whole number of centimes');
const odd = f([33.33, 49.99, 120.5], 180.01);
ok(sum(odd) === 18001, 'awkward prices still add up to the centime (' + odd.join(' + ') + ')');
eq(f([50, 40], 0), [50, 40], 'an unknown ticket (0) leaves the lines whole, never at zero');
eq(f([50, 40], undefined), [50, 40], 'an absent ticket leaves the lines whole');
eq(f([50, 40], 120), [50, 40], 'a ticket above its lines changes nothing');
eq(f([], 30), [], 'an empty basket stays empty');
eq(f([-5, 20], 20), [0, 20], 'a negative line never goes out below zero');

for (const [name, src] of [['boutique', boutique], ['maison', maison]]) {
  ok(!/total:\s*Math\.round\((?:\(\+?ln\.unit|ln\.unit|lineUnit\(ln\)|\(\+line\.unit)[^)]*\)\s*\*\s*[^,]*?\),/.test(src.replace(/\* 100\) \/ 100/g, '')),
    `${name}: no line total is rounded to the dirham any more`);
  ok((src.match(/total: lineTotals\[i\]/g) || []).length === 2, `${name}: the live sale and the replayed sale both send bqLineTotals`);
  ok(/bqLineTotals\(\(sale\.lines \|\| \[\]\)[\s\S]{0,140}Number\(sale\.balanceTotal\) \|\|/.test(src),
    `${name}: a replayed deposit spreads over the whole ticket, not over the deposit`);
}
console.log(`retail-basket-cents: ${n} controls passed`);
