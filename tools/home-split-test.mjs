import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import home from './home-test-source.cjs';
import dashboardDependencies from './dashboard-dependencies.cjs';
const map = home.metadata();
const original = gunzipSync(fs.readFileSync('tools/fixtures/home-split/original.js.gz')).toString();
assert.equal(createHash('sha256').update(original).digest('hex'), map.sha256);
assert.equal(home.source(), original, 'live fragments reconstruct the complete original byte for byte');
for (const p of map.parts) {
  assert.equal(fs.readFileSync(p.file, 'utf8'), p.prefix + p.fragments.map(f => original.slice(f.start, f.start + f.length)).join('') + p.suffix, p.name + ': bodies and order unchanged');
}
const window = {};
vm.runInNewContext(home.live(), { window });
const reads = [];
const state = new Proxy({}, { get(_, key) { reads.push(key); throw Error('eager read'); } });
const functions = window.__kiwiDateRangeParts(state);
assert.deepEqual(reads, [], 'registration does not read state');
assert.deepEqual(Object.keys(functions).sort(), map.parts.flatMap(p => p.exports).sort());
assert.ok(Object.isFrozen(functions));
for (const p of map.parts) for (const f of p.fragments) if (typeof functions[f.name] === 'function') {
  assert.equal(String(functions[f.name]), original.slice(f.start, f.start + f.length).trimEnd(), f.name + ': actual exported function byte identity');
}
const requests = [];
vm.runInNewContext(fs.readFileSync(map.file, 'utf8'), { window: {}, document: { readyState: 'loading', write: text => requests.push(text) } });
const urls = [...requests.join('').matchAll(/src="([^"]+)"/g)].map(m => m[1]);
assert.deepEqual(urls.map(u => u.split('?')[0]), map.parts.map(p => p.file), 'parser dependencies retain explicit order');
for (const url of urls) assert.ok(fs.readFileSync('kiwi-sw.js', 'utf8').includes("'/" + url + "'"), url + ': precached');
const html = fs.readFileSync('dashboard.html', 'utf8');
assert.match(html, /<script src="assets\/daterange\/renderers.js\?v=\d+"><\/script>/);
assert.ok(html.indexOf('<script src="assets/daterange/renderers.js') < html.indexOf('<script src="assets/dateRange.js'));
const expanded = dashboardDependencies.home(dashboardDependencies.eager(html));
for (const part of map.parts) assert.ok(expanded.indexOf('<script src="' + part.file) < expanded.indexOf('<script src="assets/dateRange.js'), part.name + ': available before synchronous core constants');
console.log('PASS home split: byte reconstruction, exact exported functions, inert registration and ordered parser registry');
