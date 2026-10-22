/* Frozen source reconstruction plus real classic-script execution in one realm. */
import { precached } from './split-live-checks.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import caisseTestSource from './caisse-test-source.cjs';
const read = file => fs.readFileSync(file, 'utf8');
const original = gunzipSync(fs.readFileSync('tools/fixtures/caisse-app/original.js.gz')).toString();
const map = JSON.parse(read('tools/fixtures/caisse-app/split.json'));
const sources = new Map([map.prelude, map.core].map(file => [file, read(file)]));
const pristine = Object.entries(map.splitFiles).every(([file, hash]) => createHash('sha256').update(fs.readFileSync(file)).digest('hex') === hash);
if (pristine) {
assert.equal(createHash('sha256').update(original).digest('hex'), map.sha256);
for (const [file, source] of sources) {
  const expected = map.fragments.filter(f => f.file === file).map(f => original.slice(f.start, f.end)).join('');
  assert.equal(source, expected + (file === map.prelude ? '\n' : ''), 'unchanged body bytes: ' + file);
}
assert.equal(map.fragments.map(f => original.slice(f.start, f.end)).join(''), original);
assert.ok(map.fragments.filter(f => f.file === map.prelude).every(f => f.kind === 'FunctionDeclaration'));
} else console.log('○ Caisse split proven at split time; files edited since, proof archived');
const html = read('kiwi-caisse.html');
if (pristine) assert.ok(caisseTestSource(html).includes('<script>' + original + '</script>'), 'legacy tests use actual production bodies in original order');
const pair = html.match(/<script src="assets\/caisse-accounting\.js\?v=\d+"><\/script>\s*<script src="assets\/caisse-app\.js\?v=\d+"><\/script>/);
assert.ok(pair, 'adjacent blocking classic scripts, declarations before initializers');
assert.ok(!/\b(?:async|defer|type=)/.test(pair[0]));
for (const [, url] of pair[0].matchAll(/src="([^"]+)"/g)) precached(new URL(url, 'https://kiwi.test/'));
if (pristine) {
// Check all global function descriptors and sources without running DOM startup.
const declarations = file => map.fragments.filter(f => f.kind === 'FunctionDeclaration' && (!file || f.file === file)).map(f => original.slice(f.start, f.end)).join('');
const a = vm.createContext({}), b = vm.createContext({});
vm.runInContext(declarations(), a);
vm.runInContext(read(map.prelude), b);
vm.runInContext(declarations(map.core), b);
assert.deepEqual(Object.keys(a).sort(), Object.keys(b).sort());
for (const key of Object.keys(a)) {
  assert.equal(a[key].toString(), b[key].toString(), key);
  const { value: av, ...ad } = Object.getOwnPropertyDescriptor(a, key);
  const { value: bv, ...bd } = Object.getOwnPropertyDescriptor(b, key);
  assert.deepEqual(ad, bd, key + ' global descriptor');
}
}
function realm(real) {
  const calls = [], nodes = new Map(), storage = new Map();
  function node(key) {
    if (nodes.has(key)) return nodes.get(key);
    const el = { id: key, dataset: {}, style: { setProperty() {}, removeProperty() {} }, value: '', textContent: '', innerHTML: '', children: [], childNodes: [],
      classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
      querySelector: s => node(key + ' ' + s), querySelectorAll: () => [],
      getAttribute: () => null, setAttribute() {}, removeAttribute() {}, hasAttribute: () => false,
      addEventListener: (name, fn) => calls.push(['listen', key, name]), removeEventListener() {},
      appendChild(child) { this.children.push(child); return child; }, append() {}, prepend() {}, insertAdjacentHTML() {}, remove() {}, replaceChildren() {},
      closest: () => null, focus() {}, blur() {}, click() {}, scrollIntoView() {},
      getBoundingClientRect: () => ({ top: 0, left: 0, width: 1280, height: 800, right: 1280, bottom: 800 }),
      matches: () => false, contains: () => false, offsetWidth: 1280, offsetHeight: 800 };
    nodes.set(key, el); return el;
  }
  const document = { querySelector: s => s === '.view-salle .plan-real' ? null : node(s), querySelectorAll: () => [], getElementById: s => node('#' + s),
    createElement: tag => node('created:' + tag + ':' + nodes.size), createElementNS: (_ns, tag) => node('created:' + tag + ':' + nodes.size),
    addEventListener: name => calls.push(['document', name]), removeEventListener() {}, dispatchEvent() {}, readyState: 'loading', hidden: false,
    documentElement: node('html'), body: node('body'), head: node('head') };
  document.documentElement.lang = 'fr';
  class Clock extends Date { constructor(...args) { super(...(args.length ? args : [1800000000000])); } static now() { return 1800000000000; } }
  const math = Object.create(Math); let seed = 123; math.random = () => ((seed = seed * 16807 % 2147483647) / 2147483647);
  const context = vm.createContext({ document, console, Date: Clock, Math: math, Intl, URL, URLSearchParams, Map, Set,
    navigator: { onLine: false }, location: { hostname: 'localhost', search: real ? '' : '?demo=1', href: 'http://localhost/kiwi-caisse.html', protocol: 'http:' },
    localStorage: { getItem: k => { k = String(k); calls.push(['read',k]); return storage.get(k) ?? null; }, setItem: (k,v) => { k = String(k); calls.push(['write',k,String(v)]); storage.set(k,String(v)); }, removeItem: k => storage.delete(k) },
    KiwiEnv: { isReal: () => real },
    addEventListener: name => calls.push(['window',name]), removeEventListener() {}, dispatchEvent() {},
    setTimeout: (_fn, ms) => { calls.push(['timeout',ms]); return 1; }, clearTimeout() {}, setInterval: (_fn, ms) => { calls.push(['interval',ms]); return 1; }, clearInterval() {},
    requestAnimationFrame() {}, cancelAnimationFrame() {},
    MutationObserver: class { observe() {} disconnect() {} },
    CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options?.detail; } },
    fetch: async url => { calls.push(['fetch',String(url)]); return { ok: false, status: 503, json: async () => ({}) }; },
    getComputedStyle: () => ({ getPropertyValue: () => '', display: 'block' }), matchMedia: () => ({ matches: false, addEventListener() {} }),
  });
  context.window = context; context.globalThis = context;
  return { context, calls, nodes, storage };
}
for (const real of [false, true]) {
  const before = realm(real), after = realm(real);
  if (pristine) vm.runInContext(original, before.context, { filename: 'original-caisse-app.js' });
  vm.runInContext(read(map.prelude), after.context, { filename: map.prelude });
  vm.runInContext(read(map.core), after.context, { filename: map.core });
  await new Promise(resolve => setImmediate(resolve));
  for (const name of ['KiwiCaisseAccounting','KiwiCaisseCarte','KiwiCaisseKitchen','KiwiCaisseContext','KiwiCaisseHeldSales']) assert.ok(after.context[name], name + ' registered');
  assert.equal(typeof after.context.rollupLedger, 'function');
  if (pristine) {
  const mismatch = before.calls.findIndex((c,i) => JSON.stringify(c) !== JSON.stringify(after.calls[i]));
  if (mismatch >= 0) console.error('first mismatch', mismatch, before.calls[mismatch], after.calls[mismatch]);
  assert.deepEqual(before.calls, after.calls, 'startup effects and storage order');
  assert.deepEqual([...before.storage], [...after.storage]);
  const financialState = 'JSON.stringify({journal,shift,openingFloat,cashMovements,handovers,shiftOpenedAt,currentCashier,tableSplits:Array.from(tableSplits.entries()),tableOrders,cart,totals:rollupLedger(journal)})';
  assert.equal(vm.runInContext(financialState, before.context), vm.runInContext(financialState, after.context), 'shared financial state and rollup');
  assert.deepEqual([...before.nodes].map(([k,n]) => [k,n.innerHTML,n.textContent]), [...after.nodes].map(([k,n]) => [k,n.innerHTML,n.textContent]), 'DOM writes');
  assert.deepEqual(Object.keys(before.context).sort(), Object.keys(after.context).sort());
  for (const key of Object.keys(before.context)) if (typeof before.context[key] === 'function') assert.equal(before.context[key].toString(), after.context[key].toString(), key);
  for (const name of ['KiwiCaisseAccounting','KiwiCaisseCarte','KiwiCaisseKitchen','KiwiCaisseContext','KiwiCaisseHeldSales']) {
    const snapshot = value => JSON.stringify(value, (_k,v) => typeof v === 'function' ? v.toString() : v);
    assert.equal(snapshot(before.context[name]), snapshot(after.context[name]), name);
  }
  }
}
if (pristine) console.log('PASS caisse split: exact bodies; global function descriptors; demo/real startup, registrations, DOM writes and storage parity');

console.log('PASS caisse live scripts: adjacent blocking tags, VM startup and registrations');
