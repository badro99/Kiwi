/* A move must rebuild the two originals exactly and execute its live bindings. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import source from './core-test-source.cjs';
import sourceHome from './home-test-source.cjs';
import { precached } from './split-live-checks.mjs';
const sha = value => createHash('sha256').update(value).digest('hex');
for (const area of ['daterange', 'agent']) {
  const dir = 'tools/fixtures/' + area + '-split/';
  const map = JSON.parse(fs.readFileSync(dir + 'split.json', 'utf8'));
  const original = gunzipSync(fs.readFileSync(dir + 'original.js.gz')).toString();
  assert.equal(sha(original), map.sha256, 'frozen original digest');
  assert.equal(source.source(map.file), original, 'every live function reconstructs its original body and order');
  const part = area === 'daterange' ? sourceHome.source() : fs.readFileSync(map.part, 'utf8');
  assert.equal(sha(part), map.partHash, 'no unreviewed changes to moved bodies');
  const window = {};
  vm.runInNewContext(area === 'daterange' ? sourceHome.live() : part, { window });
  const register = Object.entries(window).filter(([key]) => key !== '__kiwiHomeRenderers').map(([, value]) => value);
  assert.equal(register.length, 1, 'one registration factory and no load-time side effects');
  const accessed = [];
  const state = new Proxy({}, { get: (_, key) => { accessed.push(key); throw new Error('eager state read'); } });
  const functions = register[0](state);
  assert.deepEqual(Object.keys(functions).sort(), [...map.entries, ...(map.constants || [])].map(e => e.name).sort());
  assert.deepEqual(accessed, [], 'registration reads no merchant state or DOM');
  for (const entry of map.entries) assert.equal(typeof functions[entry.name], 'function');
  precached(new URL('/' + fs.readFileSync(map.file, 'utf8').match(/const partUrl = '([^']+)'/)[1], 'https://kiwi.test'));
  // Exercise the production loader's lazy, single-flight and retry paths.
  const requests = [], removals = [];
  const registry = area === 'agent' ? '__kiwiAgentParts' : '__kiwiDateRangeParts';
  const names = [...map.bridge.matchAll(/^    (\w+): \{ get:/gm)].map(m => m[1]);
  const realm = vm.createContext({ window: {}, document: {
    createElement: () => ({ remove() { removals.push(this); } }),
    head: { appendChild(script) { requests.push(script); } },
  } });
  vm.runInContext('let ' + names.join(', ') + ';' + map.bridge +
    '\nglobalThis.loader = { callPart, partState };', realm);
  assert.equal(requests.length, 0, 'no part request before first use');
  const self = {}, calls = [];
  const a = realm.loader.callPart('probe', self, ['first']);
  const b = realm.loader.callPart('probe', self, ['second']);
  assert.equal(requests.length, 1, 'concurrent opens/renders share a request');
  requests[0].onerror();
  await Promise.all([a, b]);
  assert.equal(removals.length, 1, 'failed script removed');
  const retry = realm.loader.callPart('probe', self, ['retry']);
  assert.equal(requests.length, 2, 'next use retries failed loading');
  const binding = area === 'agent' ? 'L' : 'currentRange';
  realm.window[registry] = state => ({ probe(value) {
    calls.push([this, value, state[binding]]); return 'loaded';
  } });
  vm.runInContext(binding + " = 'latest';", realm);
  requests[1].onload();
  assert.equal(await retry, 'loaded');
  assert.deepEqual(calls, [[self, 'retry', 'latest']], 'arguments, receiver and live state preserved');
  vm.runInContext(binding + " = 'changed';", realm);
  assert.equal(realm.loader.callPart('probe', self, ['sync']), 'loaded', 'loaded calls are synchronous');
  assert.equal(calls[1][2], 'changed', 'callbacks read current state rather than a captured copy');
  assert.ok(Object.isSealed(realm.loader.partState), 'private bridge cannot gain extra bindings');

}
const html = fs.readFileSync('dashboard.html', 'utf8');
for (const [core, part] of [['dateRange', 'daterange/renderers'], ['agent', 'agent/ui']]) {
  assert.ok(fs.readFileSync('assets/' + core + '.js', 'utf8').split('\n').length <= 3000, core + ' stays below 3000 lines');
  assert.ok(html.indexOf('assets/' + part + '.js') < html.indexOf('<script src="assets/' + core + '.js'), 'factory available before synchronous public APIs');
}
// Les découpages interactive et venues ajoutent chacun deux parties, celui de l'imprimante une (transports.js).
/* Tags added after these splits are named here; the shell total itself is
   pinned by file-size-ratchet-test (+3 slack), so this check only proves the
   splits' own net count. */
const laterTags = ['assets/team/merge.js', 'assets/field-merge.js'];
const splitTags = [...html.matchAll(/<script\b[^>]*\bsrc="([^"?]+)/g)].filter(m => !laterTags.includes(m[1]));
assert.equal(splitTags.length, 119, 'dashboard script count after merged splits');
console.log('PASS core split: both originals reconstructed byte for byte; factories are inert; parts precached; 119 shell scripts');
