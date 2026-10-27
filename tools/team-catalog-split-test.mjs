/* Kiwi · team catalogue split, second stage of the team.js split.
 * The venue-aware role catalogue (departments and functions per trade, the
 * function to department map, the trade of a venue) left assets/team.js for
 * assets/team/catalog.js. This proves the move was a move and nothing else:
 *   - the block is byte-identical to the frozen pre-split team.js, and core
 *     equals that original with the block swapped for one relay line;
 *   - catalog.js loads before team.js in the dashboard and the offline shell;
 *   - it registers one frozen namespace, touches nothing else, and behaves
 *     the same as the original code for every trade and every venue shape;
 *   - team.js still runs without Kiwi (early return), and with it reads the
 *     catalogue instead of carrying a copy. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import dashboardDependencies from './dashboard-dependencies.cjs';
import teamSource from './team-test-source.cjs';
import owners from './team-owners-test-source.cjs';

const read = (f) => fs.readFileSync(f, 'utf8');
const hash = (s) => createHash('sha256').update(s).digest('hex');
const original = gunzipSync(fs.readFileSync('tools/fixtures/team-catalog/original.js.gz')).toString();
const map = JSON.parse(read('tools/fixtures/team-catalog/split.json'));
const core = owners.originalFile('assets/team.js'), catalog = read('assets/team/catalog.js');
let n = 0;
const ok = (cond, msg) => { assert.ok(cond, msg); n++; };

ok(hash(original) === map.sha256, 'frozen original matches its recorded hash');
const [seg] = map.segments;
const body = original.slice(seg.start, seg.end);
ok(hash(body) === seg.sha256, 'catalogue block hash');
const start = '  /* team-part:catalog */\n', end = '  /* /team-part:catalog */';
ok(catalog.slice(catalog.indexOf(start) + start.length, catalog.indexOf(end)) === body, 'catalog.js carries the block byte for byte');
ok(!core.includes('const CATALOG = {') && !core.includes('function deptForFunction('), 'core keeps no copy');
ok(core.split(seg.relay).length === 2, 'core carries the relay exactly once');
/* Core is the original with only the block replaced. Later edits to team.js
   elsewhere are allowed, so compare the regions around the relay that still
   match, and require the whole file to match while the original is current. */
const at = core.indexOf(seg.relay);
ok(original.slice(0, seg.start).endsWith(core.slice(Math.max(0, at - 2000), at)), 'text before the relay is unchanged');
ok(original.slice(seg.end).startsWith(core.slice(at + seg.relay.length, at + seg.relay.length + 2000)), 'text after the relay is unchanged');
ok(teamSource().includes(body), 'source-reading tests see the catalogue through team-test-source');

/* Load order: catalogue before core, in the parser-time list and the offline shell. */
const graph = dashboardDependencies(read('dashboard.html'));
const iCat = graph.indexOf('src="assets/team/catalog.js?'), iCore = graph.indexOf('src="assets/team.js?');
ok(iCat >= 0 && iCore > iCat, 'dashboard loads catalog.js before team.js');
const sw = read('kiwi-sw.js');
const sCat = sw.indexOf("'/assets/team/catalog.js?"), sCore = sw.indexOf("'/assets/team.js?");
ok(sCat >= 0 && sCore > sCat, 'offline shell precaches catalog.js');

/* Registration: one frozen namespace, nothing else on window. */
const win = {};
vm.runInNewContext(catalog, { window: win });
ok(Object.keys(win).join() === 'KiwiTeamCatalog', 'registers only window.KiwiTeamCatalog');
const api = win.KiwiTeamCatalog;
ok(Object.isFrozen(api), 'namespace is frozen');
ok(Object.keys(api).sort().join() === 'CATALOG,FN_DEPT,catalogFor,deptForFunction,tradeKey,unionCatalog', 'namespace keys');

/* Behaviour: the moved code against the same code evaluated from the original. */
const ref = vm.runInNewContext('(function(){' + body + '\nreturn { CATALOG, unionCatalog, catalogFor, FN_DEPT, deptForFunction, tradeKey };})()', {});
const same = (a, b, msg) => { assert.deepEqual(JSON.parse(JSON.stringify(a)), JSON.parse(JSON.stringify(b)), msg); n++; };
same(api.CATALOG, ref.CATALOG, 'catalogue data');
same(api.FN_DEPT, ref.FN_DEPT, 'function to department map');
same(api.unionCatalog(), ref.unionCatalog(), 'union of every trade');
for (const trade of [...Object.keys(ref.CATALOG), 'inconnu', undefined]) {
  same(api.catalogFor(trade), ref.catalogFor(trade), 'catalogFor ' + trade);
  for (const fn of Object.keys(ref.FN_DEPT)) {
    const deps = ref.catalogFor(trade).departments;
    assert.equal(api.deptForFunction(fn, deps), ref.deptForFunction(fn, deps), fn + ' in ' + trade);
  }
  n++;
}
const venues = [null, {}, { custom: true }, { type: 'boutique' }, { type: 'spa', subtype: 'barbier' }, { type: 'restaurant', subtype: 'nope' },
  { custom: true, subtype: 'pressing' }, { custom: true, type: 'hotel' }];
for (const v of venues) assert.equal(api.tradeKey(v), ref.tradeKey(v), JSON.stringify(v));
n++;

/* Core without Kiwi returns early and never reads the catalogue; with Kiwi it
   reads the namespace, so loading it alone fails loudly instead of silently. */
vm.runInNewContext(core, { window: {} });
n++;
assert.throws(() => vm.runInNewContext(core, { window: { Kiwi: { handlers: {} } } }), /KiwiTeamCatalog|undefined/);
n++;

console.log(`✓ team catalogue split: ${n} checks (byte-exact move, load order, frozen namespace, same answers for every trade and venue shape)`);
