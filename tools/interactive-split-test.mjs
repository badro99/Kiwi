/* interactive.js split · the handler map and the render helpers/KPI data moved to
 * assets/interactive/handlers.js and helpers.js verbatim. This proves it:
 *  1. core + parts rebuild the frozen original byte for byte (no unreviewed edit);
 *  2. registering a part runs nothing (inert factories, no DOM, no storage);
 *  3. every borrowed name is a const or a function in the core (no live binding
 *     copied by value), and the core passes exactly the names each part declares;
 *  4. both parts load before interactive.js on every page that loads it, and are precached;
 *  5. the core stays under 2 500 lines and each part under 3 000. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';

const dir = 'tools/fixtures/interactive-split/';
const map = JSON.parse(fs.readFileSync(dir + 'split.json', 'utf8'));
const original = gunzipSync(fs.readFileSync(dir + 'original.js.gz')).toString();
const sha = (s) => createHash('sha256').update(s).digest('hex');
assert.equal(sha(original), map.sha256, 'frozen original digest');

const core = fs.readFileSync(map.file, 'utf8');
const part = (name) => fs.readFileSync('assets/interactive/' + name + '.js', 'utf8');
const between = (text, tag) => {
  const a = text.indexOf('/* <<split:' + tag + '>> */\n'), b = text.indexOf('/* <</split:' + tag + '>> */');
  assert.ok(a >= 0 && b > a, 'marker ' + tag);
  return text.slice(a + ('/* <<split:' + tag + '>> */\n').length, b);
};
const H = between(part('handlers'), 'handlers');
const [P1, P2] = between(part('helpers'), 'helpers').split('/* <<split:escape>> */\n');
const block = core.match(/  \/\* <<split:moved>>[\s\S]*?<\/split:moved>> \*\/\n/);
assert.ok(block, 'core marks the moved block once');
const E = block[0].slice(block[0].indexOf('*/\n') + 3, block[0].indexOf('  const { '));
assert.ok(E.startsWith('  function escape('), 'escape stays in the core, hoisted where earlier code uses it');
assert.equal(core.replace(block[0], () => H + P1 + E + P2), original, 'core + parts rebuild the original byte for byte');

// 2. registration is inert
for (const name of ['handlers', 'helpers']) {
  const touched = [];
  const trap = new Proxy({}, { get: (_, k) => { touched.push(k); return undefined; } });
  const window = {};
  vm.runInNewContext(part(name), { window, document: trap, localStorage: trap });
  assert.deepEqual(touched, [], name + ': registering reads no DOM or storage');
  assert.equal(typeof window.__kiwiInteractiveParts[name], 'function', name + ' registers one factory');
}

// 3. borrowed names: declared in the part, passed by the core, never live bindings
const declared = (name) => part(name).match(/const \{ ([^}]*) \} = __deps;/)[1].split(', ');
assert.deepEqual(declared('helpers'), map.helperDeps);
assert.deepEqual(declared('handlers'), map.handlerDeps);
const passed = (name) => block[0].match(new RegExp('__kiwiInteractiveParts\\.' + name + '\\.call\\(this, \\{ ([^}]*) \\}\\)'))[1].split(', ');
assert.deepEqual(passed('helpers'), map.helperDeps, 'core passes what helpers borrows');
assert.deepEqual(passed('handlers'), map.handlerDeps, 'core passes what handlers borrows');
for (const n of [...map.helperDeps, ...map.handlerDeps]) {
  assert.ok(!new RegExp('^  let [^;]*\\b' + n + '\\b', 'm').test(core), n + ' is not a live binding in the core');
}

// 4. load order and precache
for (const page of ['dashboard.html', 'brand.html', 'wallet.html']) {
  const html = fs.readFileSync(page, 'utf8');
  const at = (s) => html.indexOf('<script src="assets/' + s);
  assert.ok(at('interactive/helpers.js') >= 0 && at('interactive/helpers.js') < at('interactive.js'), page + ': helpers before core');
  assert.ok(at('interactive/handlers.js') >= 0 && at('interactive/handlers.js') < at('interactive.js'), page + ': handlers before core');
}
const sw = fs.readFileSync('kiwi-sw.js', 'utf8');
for (const p of map.parts) assert.ok(sw.includes("'/" + p + '?v='), p + ' precached');

// 5. sizes
const lines = (s) => s.split('\n').length;
assert.ok(lines(core) <= 2500, 'interactive.js stays under 2 500 lines');
for (const p of map.parts) assert.ok(lines(fs.readFileSync(p, 'utf8')) <= 3000, p + ' under 3 000 lines');
console.log('PASS interactive split: original rebuilt byte for byte, inert parts, borrowed names are constants, load order and precache hold');
