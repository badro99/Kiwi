import printerTestSource from './printer-test-source.cjs';
/* Byte-exact UI extraction, public API and the real lazy-loader lifecycle. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
const read = file => fs.readFileSync(file, 'utf8');
const hash = value => createHash('sha256').update(value).digest('hex');
const map = JSON.parse(read('tools/fixtures/printer/split.json'));
const original = gunzipSync(fs.readFileSync('tools/fixtures/printer/original.js.gz')).toString();
const core = printerTestSource(), ui = read('assets/printer/pairing-ui.js');
assert.equal(hash(original), map.sha256);
assert.equal(ui, map.prefix + original.slice(map.start, map.end) + map.suffix, 'entire moved section is byte-identical');
for (const fn of map.moved) {
  const body = original.slice(fn.start, fn.end);
  assert.equal(hash(body), fn.sha256, fn.name);
  assert.ok(ui.includes(body), fn.name + ': unchanged body');
  assert.ok(!core.includes(body), fn.name + ': removed from core');
}
const publicKeys = source => [...source.slice(source.indexOf('  window.KiwiPrinter = {'), source.indexOf('\n  };', source.indexOf('  window.KiwiPrinter = {'))).matchAll(/\b(\w+)\s*:/g)].map(m => m[1]).sort();
assert.deepEqual(publicKeys(core), publicKeys(original), 'public API keys unchanged');
assert.match(core, /script\.src = '\/assets\/printer\/pairing-ui\.js\?v=\d+'/);
for (const source of [core, ui]) new vm.Script(source);
const require = createRequire(import.meta.url);
assert.ok(require('./stamps.js').scan().get('assets/printer/pairing-ui.js')?.sites.some(s => s.file === 'assets/printer-bridge.js'), 'lazy stamp discovered');
function realm(source = core, lang = 'fr', idleCallback = true) {
  const scripts = [], nodes = [], notices = [], idle = [], timers = [], listeners = new Map();
  function element(tag) {
    const children = new Map();
    const el = { tag, style: {}, value: '', className: '', textContent: '', innerHTML: '', isConnected: true,
      setAttribute() {}, addEventListener() {}, remove() { this.isConnected = false; },
      querySelector(id) { if (!children.has(id)) children.set(id, element(id)); return children.get(id); },
      querySelectorAll() { return []; },
    };
    return el;
  }
  const storage = new Map();
  const context = vm.createContext({ console, Promise, Uint8Array, AbortController,
    localStorage: { getItem: k => storage.get(k) || null, setItem: (k,v) => storage.set(k,String(v)), removeItem: k => storage.delete(k) },
    navigator: {}, document: { createElement: element, getElementById: () => null,
      head: { appendChild: el => { if (el.tag === 'script') scripts.push(el); } },
      body: { appendChild: el => nodes.push(el) }, addEventListener: (name, fn) => listeners.set(name,fn) },
    setTimeout: fn => { timers.push(fn); return 1; }, clearTimeout() {},
    addEventListener() {}, dispatchEvent() {}, CustomEvent: class {},
    fetch: () => Promise.resolve({ ok: false, status: 503, json: () => Promise.resolve(null) }),
    Kiwi: { toast: msg => notices.push(msg) }, KiwiCaisseLang: { tr: msg => lang + ':' + msg },
  });
  context.window = context;
  if (idleCallback) context.requestIdleCallback = fn => idle.push(fn);
  vm.runInContext(source, context);
  return { context, scripts, nodes, notices, idle, timers, listeners };
}
for (const lang of ['fr', 'en', 'ar']) {
  const r = realm(core, lang);
  assert.equal(r.scripts.length, 0, 'startup waits for idle');
  const api = r.context.KiwiPrinter;
  assert.deepEqual(Object.keys(api).sort(), Object.keys(realm(original).context.KiwiPrinter).sort());
  assert.ok(Object.isFrozen(api.__core));
  const one = api.openSetup({ kind: 'receipt' }), two = api.openSetup({ kind: 'label' });
  assert.equal(r.nodes.length, 0, 'cold opening waits');
  assert.equal(r.scripts.length, 1, 'concurrent callers share one script');
  r.idle[0]();
  assert.equal(r.scripts.length, 1, 'idle shares in-flight load');
  const calls = [];
  api.__core.install({ openSetup: context => { calls.push(context.kind); } });
  r.scripts[0].onload();
  await Promise.all([one, two]);
  assert.deepEqual(calls, ['receipt', 'label']);
  assert.equal(api.openSetup({ kind: 'warm' }), undefined, 'warm return stays synchronous');
  assert.deepEqual(calls, ['receipt', 'label', 'warm']);
  const failed = realm(core, lang);
  failed.idle[0]();
  failed.scripts[0].onerror();
  await Promise.resolve();
  assert.equal(failed.notices.length, 0, 'idle failure is fail-soft');
  const opening = failed.context.KiwiPrinter.openSetup();
  failed.scripts[1].onerror();
  await opening;
  assert.match(failed.notices[0], new RegExp('^' + lang + ':'));
  const retry = failed.context.KiwiPrinter.openSetup();
  vm.runInContext(ui, failed.context);
  assert.equal(String(failed.context.KiwiPrinter.__core.getConfig), String(realm(original).context.KiwiPrinter.getConfig));
  // Intercept after the actual UI has registered; verify its original source.
  const actual = realm();
  let installed;
  const scope = actual.context.KiwiPrinter.__core;
  actual.context.KiwiPrinter = { __core: Object.assign({}, scope, { install: value => { installed = value; } }) };
  vm.runInContext(ui, actual.context);
  const moved = map.moved.find(f => f.name === 'openSetup');
  assert.equal(String(installed.openSetup), original.slice(moved.start, moved.end));
  failed.scripts[2].onload();
  await retry;
  const before = realm(original), after = realm();
  vm.runInContext(ui, after.context);
  before.context.KiwiPrinter.openSetup({ kind: 'receipt' });
  after.context.KiwiPrinter.openSetup({ kind: 'receipt' });
  await Promise.resolve();
  assert.deepEqual(after.nodes.map(n => n.innerHTML), before.nodes.map(n => n.innerHTML), 'real modal markup identical');
}
// Discovery changes primitive state after the UI has loaded. The core pushes
// the new mode and capability to the UI, so it never reads a stale snapshot.
{
  const hook = core.replace('  var bridgeMode =', '  window.__setBridge = function (mode, cap) { bridgeMode = mode; bridgeCapability = cap; noteBridgeState(); };\n  var bridgeMode =');
  assert.notEqual(hook, core);
  assert.equal((core.match(/noteBridgeState\(\);/g) || []).length, 2, 'both discovery outcomes notify the UI');
  const r = realm(hook);
  let installed;
  const probe = ui.replace('core.install({ openSetup: openSetup });',
    'core.install({ mode: function () { return bridgeMode; }, cap: function () { return bridgeCapability; } });');
  const scope = r.context.KiwiPrinter.__core;
  r.context.KiwiPrinter = { __core: Object.assign({}, scope, { install: value => { installed = value; } }) };
  vm.runInContext(probe, r.context);
  assert.equal(installed.mode(), 'unknown');
  r.context.__setBridge('legacy', '');
  assert.equal(installed.mode(), 'legacy');
  r.context.__setBridge('secure', 'kbc_x');
  assert.equal(installed.mode(), 'secure');
  assert.equal(installed.cap(), 'kbc_x');
  assert.ok(!/\bwith\s*\(/.test(ui), 'no with statement');
}
const fallback = realm(core, 'fr', false);
assert.equal(fallback.scripts.length, 0);
fallback.timers.at(-1)();
assert.equal(fallback.scripts.length, 1, 'timeout fallback warms UI');
console.log(`✓ printer-split: ${map.moved.length} unchanged functions, API, actual modal, lazy concurrency, idle, failure, retry and language routing`);
