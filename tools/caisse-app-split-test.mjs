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
const workflowMap = JSON.parse(read('tools/fixtures/caisse-app/workflows.json'));
const workflowOriginal = gunzipSync(fs.readFileSync('tools/fixtures/caisse-app/before-workflows.js.gz')).toString();
const workflowPristine = Object.entries(workflowMap.splitFiles).every(([file, hash]) => createHash('sha256').update(fs.readFileSync(file)).digest('hex') === hash);
assert.equal(createHash('sha256').update(workflowOriginal).digest('hex'), workflowMap.sha256);
if (workflowPristine) {
  assert.equal(caisseTestSource.appBeforeWorkflows(), workflowOriginal, 'workflow split reconstructs every original byte');
  for (const file of workflowMap.files) {
    const expected = workflowMap.fragments.filter(f => f.file === file).map(f => workflowOriginal.slice(f.start, f.end)).join('');
    assert.equal(read(file), workflowMap.headers[file] + expected + '\n', 'whole declaration bytes: ' + file);
  }
}
const html = read('kiwi-caisse.html');
if (workflowPristine) {
  assert.equal(createHash('sha256').update(original).digest('hex'), map.sha256);
  assert.ok(caisseTestSource(html).includes('<script>' + original + '</script>'),
    'merged live files reconstruct the complete pre-split original byte for byte');
  const second = JSON.parse(read('tools/fixtures/caisse-app/split-2.json'));
  assert.equal(createHash('sha256').update(caisseTestSource.appBeforeSecondSplit()).digest('hex'), second.sha256,
    'merged live files reconstruct the second pre-split original byte for byte');
  console.log('PASS merged originals: both earlier splits reconstruct byte for byte from live files');
}
if (pristine) assert.ok(caisseTestSource(html).includes('<script>' + original + '</script>'), 'legacy tests use actual production bodies in original order');
/* Since 22 October 2026 the core is four scripts: three preludes of declarations
   (caisse-accounting, caisse-floor, caisse-kitchen), then caisse-app.js. */
const LIVE = caisseTestSource.FILES;
// Execute the production parser loader against the shell registry, then check
// the exact blocking classic scripts it inserts before the core tag.
const registry = [...html.matchAll(/<link[^>]+href="([^"]+)"[^>]+data-caisse-script>/g)].map(m => m[1]);
const inserted = [];
vm.runInNewContext(read('assets/caisse/workflows-loader.js'), {
  window: {}, document: {
    querySelectorAll: () => registry.map(url => ({ getAttribute: () => url })),
    write: text => inserted.push(text),
  },
});
const lazyURLs = [...html.matchAll(/<link[^>]+href="([^"]+)"[^>]+data-caisse-lazy="[^"]+">/g)].map(m => m[1]);
for (const url of lazyURLs) precached(new URL(url, 'https://kiwi.test/'));
const lazy = html.match(/<link[^>]+href="([^"]+)"[^>]+data-caisse-lazy="inventory">/)[1];
precached(new URL(lazy, 'https://kiwi.test/'));
precached(new URL(html.match(/src="([^"]*caisse\/workflows-loader\.js[^"]*)"/)[1], 'https://kiwi.test/'));
assert.match(html, /<script src="assets\/caisse\/workflows-loader\.js(?:\?v=\d+)?"><\/script>\s*<script src="assets\/caisse-app\.js(?:\?v=\d+)?"><\/script>/, 'blocking parser loader immediately precedes core initializers');
const effectiveHTML = inserted.join('\n') + '\n' + lazyURLs.map(url => '<script src="' + url + '"></script>').join('\n') + '\n' + html.match(/<script src="assets\/caisse-app\.js[^"]*"><\/script>/)[0];
const effectiveOrder = [...effectiveHTML.matchAll(/src="([^"?]+)/g)].map(m => m[1]);
// Inventory is lazy in browsers; for synchronous source tests load it with the
// declarations and preserve the same expected file order.
const lazyFiles = lazyURLs.map(url => url.split('?')[0]);
assert.deepEqual(effectiveOrder.filter(f => !lazyFiles.includes(f)), LIVE.filter(f => !lazyFiles.includes(f)));
const orderedHTML = LIVE.map(file => effectiveHTML.match(new RegExp('<script src="' + file.replace(/[./]/g, '\\$&') + '(?:\\?v=\\d+)?"></script>'))[0]).join('\n');
const pair = orderedHTML.match(new RegExp(LIVE.map(f => '<script src="' + f.replace(/[./]/g, '\\$&') + '(?:\\?v=\\d+)?"></script>').join('\\s*')));
assert.ok(pair, 'adjacent blocking classic scripts, declarations before initializers');
assert.ok(!/\b(?:async|defer|type=)/.test(pair[0]));
for (const [, url] of pair[0].matchAll(/src="([^"]+)"/g)) precached(new URL(url, 'https://kiwi.test/'));
/* Second split: runs of declarations moved to caisse-floor.js and caisse-kitchen.js,
   anchored by text in tools/fixtures/caisse-app/split-2.json. */
const map2 = JSON.parse(read('tools/fixtures/caisse-app/split-2.json'));
const pristine2 = Object.entries(map2.splitFiles).every(([file, hash]) => createHash('sha256').update(fs.readFileSync(file)).digest('hex') === hash);
if (pristine2) {
  assert.equal(createHash('sha256').update(caisseTestSource.appBeforeSecondSplit()).digest('hex'), map2.sha256,
    'second split: every run back before its anchor rebuilds caisse-app.js byte for byte');
  for (const file of LIVE.slice(1, -1)) {
    const scope = vm.createContext({});
    vm.runInContext(read(file), scope, { filename: file });
    assert.ok(Object.keys(scope).length && Object.values(scope).every(v => typeof v === 'function'), file + ': top-level declarations only, nothing runs at load');
  }
  console.log('PASS second caisse split: anchored runs rebuild caisse-app.js byte for byte; floor and kitchen hold declarations only');
} else console.log(caisseTestSource.appBeforeSecondSplit() === null
  ? '○ Second caisse split: an anchor moved, legacy tests read the live files in load order'
  : '○ Second caisse split proven at split time; files edited since, anchors still rebuild the old order');
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
      addEventListener: (name, fn) => calls.push(['listen', key, name, String(fn)]), removeEventListener() {},
      appendChild(child) { this.children.push(child); return child; }, append() {}, prepend() {}, insertAdjacentHTML() {}, remove() {}, replaceChildren() {},
      closest: () => null, focus() {}, blur() {}, click() {}, scrollIntoView() {},
      getBoundingClientRect: () => ({ top: 0, left: 0, width: 1280, height: 800, right: 1280, bottom: 800 }),
      matches: () => false, contains: () => false, offsetWidth: 1280, offsetHeight: 800 };
    nodes.set(key, el); return el;
  }
  const document = { querySelector: s => s === '.view-salle .plan-real' ? null : node(s), querySelectorAll: () => [], getElementById: s => node('#' + s),
    createElement: tag => node('created:' + tag + ':' + nodes.size), createElementNS: (_ns, tag) => node('created:' + tag + ':' + nodes.size),
    addEventListener: (name, fn) => calls.push(['document', name, String(fn)]), removeEventListener() {}, dispatchEvent() {}, readyState: 'loading', hidden: false,
    documentElement: node('html'), body: node('body'), head: node('head') };
  document.documentElement.lang = 'fr';
  class Clock extends Date { constructor(...args) { super(...(args.length ? args : [1800000000000])); } static now() { return 1800000000000; } }
  const math = Object.create(Math); let seed = 123; math.random = () => ((seed = seed * 16807 % 2147483647) / 2147483647);
  const context = vm.createContext({ document, console, Date: Clock, Math: math, Intl, URL, URLSearchParams, Map, Set,
    navigator: { onLine: false }, location: { hostname: 'localhost', search: real ? '' : '?demo=1', href: 'http://localhost/kiwi-caisse.html', protocol: 'http:' },
    localStorage: { getItem: k => { k = String(k); calls.push(['read',k]); return storage.get(k) ?? null; }, setItem: (k,v) => { k = String(k); calls.push(['write',k,String(v)]); storage.set(k,String(v)); }, removeItem: k => storage.delete(k) },
    KiwiEnv: { isReal: () => real },
    addEventListener: (name, fn) => calls.push(['window',name,String(fn)]), removeEventListener() {}, dispatchEvent() {},
    setTimeout: (_fn, ms) => { calls.push(['timeout',ms,String(_fn)]); return 1; }, clearTimeout() {}, setInterval: (_fn, ms) => { calls.push(['interval',ms,String(_fn)]); return 1; }, clearInterval() {},
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
  const workflowBefore = realm(real);
  if (workflowPristine) {
    for (const file of LIVE.slice(0, 3)) vm.runInContext(read(file), workflowBefore.context, { filename: file });
    vm.runInContext(workflowOriginal, workflowBefore.context, { filename: 'before-workflows.js' });
  }
  if (pristine || workflowPristine) vm.runInContext(original, before.context, { filename: 'original-caisse-app.js' });
  for (const file of LIVE) vm.runInContext(read(file), after.context, { filename: file });
  await new Promise(resolve => setImmediate(resolve));
  for (const name of ['KiwiCaisseAccounting','KiwiCaisseCarte','KiwiCaisseKitchen','KiwiCaisseContext','KiwiCaisseHeldSales']) assert.ok(after.context[name], name + ' registered');
  assert.equal(typeof after.context.rollupLedger, 'function');
  if (workflowPristine) {
    assert.deepEqual(workflowBefore.calls, after.calls, 'workflow move: identical startup effects and storage order');
    assert.deepEqual([...workflowBefore.storage], [...after.storage]);
    assert.deepEqual([...workflowBefore.nodes].map(([k,n]) => [k,n.innerHTML,n.textContent]), [...after.nodes].map(([k,n]) => [k,n.innerHTML,n.textContent]), 'workflow move: identical DOM writes');
    assert.deepEqual(Object.keys(workflowBefore.context).sort(), Object.keys(after.context).sort());
    for (const key of Object.keys(workflowBefore.context)) if (typeof workflowBefore.context[key] === 'function') {
      assert.equal(workflowBefore.context[key].toString(), after.context[key].toString(), key + ' unchanged body');
      const {value: av, ...ad} = Object.getOwnPropertyDescriptor(workflowBefore.context, key);
      const {value: bv, ...bd} = Object.getOwnPropertyDescriptor(after.context, key);
      assert.deepEqual(ad, bd, key + ' unchanged descriptor');
    }
    const state = 'JSON.stringify({journal,shift,openingFloat,cashMovements,handovers,shiftOpenedAt,currentCashier,tableSplits:Array.from(tableSplits.entries()),tableOrders,cart,totals:rollupLedger(journal)})';
    assert.equal(vm.runInContext(state, workflowBefore.context), vm.runInContext(state, after.context), 'workflow move: identical financial state');
  }
  if (pristine || workflowPristine) {
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

if (workflowPristine) console.log('PASS workflow split: exact reconstruction, declaration bytes, demo/real DOM, storage, financial state and global descriptor parity');

// Test the production lazy entry points, including a listener that retains its
// original wrapper after the real classic declarations replace window[name].
{
  const pending = [], scope = vm.createContext({});
  scope.window = scope;
  scope.document = {
    querySelectorAll: () => [], write() {},
    querySelector: selector => ({ getAttribute: () => selector.includes('orders') ? lazyURLs.find(url => url.includes('/orders.js')) : lazy }),
    createElement: () => ({ remove() { this.removed = true; } }),
    head: { appendChild: script => pending.push(script) },
  };
  vm.runInContext(read('assets/caisse/workflows-loader.js'), scope);
  assert.equal(pending.length, 0, 'no inventory request during bootstrap');
  const entry = scope.openStock, receiver = {}, args = ['first'];
  const failed = entry.apply(receiver, args);
  assert.equal(pending.length, 1);
  pending[0].onerror();
  await assert.rejects(failed, /inventory load failed/);
  assert.ok(pending[0].removed, 'failed script removed before retry');
  const first = entry.apply(receiver, args), second = scope.openRecept('second');
  assert.equal(pending.length, 2, 'retry and concurrent entry share one request');
  const calls = [];
  scope.openStock = function (...a) { calls.push(['stock', this, a]); return 12; };
  scope.openRecept = function (...a) { calls.push(['receipt', this, a]); return 13; };
  pending[1].onload();
  assert.deepEqual(await Promise.all([first, second]), [12, 13]);
  assert.equal(calls[0][1], receiver);
  assert.deepEqual(calls[0][2], args);
  assert.equal(await entry('later'), 12, 'captured event listener calls the live declaration');
  assert.equal(pending.length, 2, 'no request after successful load');
  const review = scope.openOrderReviewModal();
  assert.equal(pending.length, 3, 'order review has an independent first-use request');
  assert.ok(pending[2].src.includes('/orders.js'), 'order-review entry selects its own registry URL');
  scope.openOrderReviewModal = () => 14;
  pending[2].onload();
  assert.equal(await review, 14);
}
console.log('PASS drawer lazy loader: no startup requests, independent owners, single flight, retry, arguments and captured listeners');
