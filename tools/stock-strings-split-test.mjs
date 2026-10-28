import undoLabelEdits from './lane-c-historical.cjs';
/* Kiwi · stock string pack split, second stage of the stock.js split.
 * The FR/EN/AR strings of the Stock & approvisionnement page (993 lines, 117
 * formatting closures) left assets/stock.js for assets/stock/strings.js. This
 * proves the move was a move:
 *   - the block is byte-identical to the frozen pre-split stock.js, core keeps
 *     no copy and carries the relay once, and the text around it is unchanged;
 *   - strings.js loads before stock.js in the dashboard and the offline shell;
 *   - it registers one frozen global, reads nothing from its scope, and every
 *     string and closure answers the same as the original, in all three languages. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import dashboardDependencies from './dashboard-dependencies.cjs';
import stockSource from './stock-test-source.cjs';
import stockControllerSource from './stock-controller-test-source.cjs';

const read = (f) => fs.readFileSync(f, 'utf8');
const hash = (s) => createHash('sha256').update(s).digest('hex');
const original = gunzipSync(fs.readFileSync('tools/fixtures/stock-strings/original.js.gz')).toString();
const map = JSON.parse(read('tools/fixtures/stock-strings/split.json'));
const core = stockControllerSource(), part = undoLabelEdits(read('assets/stock/strings.js'), 'assets/stock/strings.js');
let n = 0;
const ok = (cond, msg) => { assert.ok(cond, msg); n++; };

ok(hash(original) === map.sha256, 'frozen original matches its recorded hash');
const [seg] = map.segments;
const body = original.slice(seg.start, seg.end);
ok(hash(body) === seg.sha256, 'string pack hash');
const a = '  /* stock-part:strings */\n', b = '  /* /stock-part:strings */';
ok(part.slice(part.indexOf(a) + a.length, part.indexOf(b)) === body, 'strings.js carries the block byte for byte');
ok(!/\n  const STR = \{/.test(core), 'core keeps no copy');
ok(core.split(seg.relay).length === 2, 'core carries the relay exactly once');
const at = core.indexOf(seg.relay);
ok(original.slice(0, seg.start).endsWith(core.slice(Math.max(0, at - 2000), at)), 'text before the relay is unchanged');
ok(original.slice(seg.end).startsWith(core.slice(at + seg.relay.length, at + seg.relay.length + 2000)), 'text after the relay is unchanged');
ok(undoLabelEdits(stockSource(), 'assets/stock/strings.js').includes(body), 'source-reading tests see the strings through stock-test-source');

const graph = dashboardDependencies(read('dashboard.html'));
const iS = graph.indexOf('src="assets/stock/strings.js?'), iC = graph.indexOf('src="assets/stock.js?');
ok(iS >= 0 && iC > iS, 'dashboard loads strings.js before stock.js');
const sw = read('kiwi-sw.js');
const sS = sw.indexOf("'/assets/stock/strings.js?"), sC = sw.indexOf("'/assets/stock.js?");
ok(sS >= 0 && sC > sS, 'offline shell precaches strings.js before stock.js');

const win = {};
vm.runInNewContext(part, { window: win });   // nothing else in scope: a free reference would throw
ok(Object.keys(win).join() === 'KiwiStockStrings', 'registers only window.KiwiStockStrings');
const STR = win.KiwiStockStrings;
ok(Object.isFrozen(STR), 'namespace is frozen');
const ref = vm.runInNewContext('(function(){' + body + '\nreturn STR;})()', {});
ok(JSON.stringify(Object.keys(STR)) === JSON.stringify(Object.keys(ref)), 'same languages');
const samples = [[0], [1], [2, 3, 4], [12, 'Métro', 1500.5], ['x', 'y', 'z', 7]];
let closures = 0;
for (const lang of Object.keys(ref)) {
  ok(JSON.stringify(Object.keys(STR[lang])) === JSON.stringify(Object.keys(ref[lang])), lang + ' keys in order');
  for (const [k, v] of Object.entries(ref[lang])) {
    if (typeof v !== 'function') { assert.deepEqual(STR[lang][k], v, lang + '.' + k); continue; }
    closures++;
    for (const args of samples) {
      let x, y;
      try { x = String(v(...args)); } catch (e) { x = 'throws ' + e.name; }
      try { y = String(STR[lang][k](...args)); } catch (e) { y = 'throws ' + e.name; }
      assert.equal(y, x, lang + '.' + k + '(' + args.join(',') + ')');
    }
  }
  n++;
}
ok(closures === 117, `117 formatting closures compared (${closures})`);
console.log(`✓ stock strings split: ${n} checks (byte-exact move of 993 lines, load order, frozen global with nothing in scope, same text for every key and closure in FR/EN/AR)`);
