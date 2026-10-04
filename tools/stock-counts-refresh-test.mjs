#!/usr/bin/env node
// Portable pure-source regression: node <this-file> [Kiwi-checkout].
// No browser, network, storage, fixture seeding, runtime edits or gate overrides.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
const root = path.resolve(process.argv[2] || path.join(path.dirname(fileURLToPath(import.meta.url)), '..'));
assert.ok(process.argv.length <= 3, 'only the checkout path is accepted');
const sources = {
  stock: fs.readFileSync(path.join(root, 'assets/stock.js'), 'utf8'),
  menu: fs.readFileSync(path.join(root, 'assets/restaurant-menu-workspace.js'), 'utf8'),
  interactive: fs.readFileSync(path.join(root, 'assets/interactive.js'), 'utf8'),
};
const sha = value => createHash('sha256').update(value).digest('hex');
function extract(which, name) {
  const source = sources[which], start = new RegExp('^  (?:async )?function ' + name + '\\(', 'm').exec(source);
  assert.ok(start, 'actual source function exists: ' + name);
  const rest = source.slice(start.index), end = /^  }$/m.exec(rest);
  assert.ok(end, 'actual source function closing line exists: ' + name);
  const code = rest.slice(0, end.index + end[0].length);
  new vm.Script(code, { filename: name + '-actual-source' });
  return { name, code, line: source.slice(0, start.index).split('\n').length, sha256: sha(code) };
}
const functions = [
  ...['fetchServerCounts', 'getAllCounts', 'filterCounts', 'renderCountsHistory', 'renderItems', 'renderTabBody', 'rerenderTabBody'].map(name => extract('stock', name)),
  extract('interactive', 'pageShell'), extract('menu', 'show'),
];
const epoch = 1791130000000;
const flush = async () => { await new Promise(resolve => setImmediate(resolve)); await new Promise(resolve => setImmediate(resolve)); };
const cacheRecord = { id: 'OPAQUE EXISTING 02', storeId: 'location-A', status: 'applied', submittedAt: epoch, totalLines: 0, totalVarianceCostMAD: 0, absVarianceCostMAD: 0 };
const localRecord = { ref: 'LOCAL OPAQUE 03', ts: epoch, counted: 0, varMad: 0, gaps: [] };
function fixture(kind, { deferred = false, cached = false, local = false } = {}) {
  let now = epoch, attempts = 0, paints = 0;
  const requested = [], pending = [], classes = new Set(['page-stock']);
  const classList = { add: key => classes.add(key), remove: key => classes.delete(key), contains: key => classes.has(key), [Symbol.iterator]: () => classes[Symbol.iterator]() };
  const body = { set innerHTML(_html) { paints++; } }, menuRoot = { hidden: true };
  const payload = kind === 'populated' ? [{ ...cacheRecord, id: 'RETURNED OPAQUE 01', storeId: 'location-B' }] : [];
  const context = vm.createContext({
    Date: class extends Date { static now() { return now; } }, setTimeout, clearTimeout,
    document: { body: { classList }, querySelector: selector => selector === '.st-tab-body' ? body : null },
    window: { Kiwi: {} },
    fetch: url => {
      requested.push(url); attempts++;
      // Only a harness safety cap; no replacement data or retry bypass. If the
      // old source recurses, its sixth request remains pending and assertions fail.
      if (attempts >= 6) return new Promise(() => {});
      if (deferred) return new Promise((resolve, reject) => pending.push({ resolve, reject }));
      if (kind === 'reject') return Promise.reject(new Error('controlled-local-unavailable'));
      return Promise.resolve({ json: async () => {
        if (kind === 'json-error') throw new Error('controlled-local-json-error');
        return kind === 'invalid' ? { error: 'controlled-local-unavailable' } : { counts: payload };
      } });
    },
    stCountsCache: cached ? [{ ...cacheRecord }] : [], stCountsLastFetched: 0, stPageActive: true,
    stCurrentTab: 'items', stItemSubView: 'counts', stCountDateFilter: 'tout',
    stCountStatusFilter: 'all', stCountSearch: '', stCountSubTab: 'list',
    stCountHistory: () => local ? [{ ...localRecord, gaps: [] }] : [],
    catalogLabel: (_key, fallback) => fallback, esc: value => String(value), svg: () => '', fmtMad: value => String(value),
    enhanceAfterRender() {}, renderOverview: () => '<div>overview</div>',
    $: selector => selector === '[data-menu-root]' ? menuRoot : null,
    $$: () => [], S: () => ({}), isRestaurant: () => true, render() {}, readyTimer: 0, readyTries: 0,
  });
  for (const fn of functions) new vm.Script(fn.code, { filename: fn.name + '-actual-source' }).runInContext(context);
  context.window.Kiwi.pageShell = context.pageShell;
  return {
    context, requested, classes, payload, menuRoot,
    get attempts() { return attempts; }, get paints() { return paints; },
    advance: ms => { now += ms; },
    render: () => context.renderTabBody(),
    settle: success => {
      const first = pending.shift(); assert.ok(first, 'controlled original request is pending');
      if (success) first.resolve({ json: async () => ({ counts: payload }) });
      else first.reject(new Error('controlled-local-unavailable'));
    },
  };
}
let checks = 0;
const results = [], failures = [];
const equal = (actual, expected, label) => { checks++; assert.deepEqual(actual, expected, label); };
async function run(label, verify) {
  try { await verify(); results.push({ label, pass: true }); }
  catch (error) { failures.push({ label, assertion: error.message }); results.push({ label, pass: false }); }
}
for (const kind of ['reject', 'invalid', 'json-error']) await run(kind + ' throttles failure without losing cached/local records', async () => {
  const f = fixture(kind, { cached: true, local: true }); f.render(); await flush();
  equal(f.attempts, 1, 'failure must not recursively refetch');
  equal(f.paints, 1, 'visible history has one settled repaint');
  equal(f.context.stCountsLastFetched, epoch, 'attempt timestamp throttles failure');
  equal(JSON.parse(JSON.stringify(f.context.stCountsCache)), [cacheRecord], 'failure preserves opaque cache exactly');
  equal(Array.from(f.context.getAllCounts(), row => row.id).sort(), [cacheRecord.id, localRecord.ref].sort(), 'local/cached identities retained');
  equal(f.requested, ['/api/inventory/counts'], 'request path remains read-only and unchanged');
});
for (const kind of ['valid', 'populated']) await run(kind + ' response preserves normal visible refresh and payload boundaries', async () => {
  const f = fixture(kind, { local: true }); f.render(); await flush();
  equal(f.attempts, 1, 'one original read request'); equal(f.paints, 1, 'one actual visible tab repaint');
  equal(JSON.parse(JSON.stringify(f.context.stCountsCache)), f.payload, 'server location/opaque record fields remain exact');
  equal(Array.from(f.context.getAllCounts(), row => row.id).sort(), [...f.payload.map(row => row.id), localRecord.ref].sort(), 'server/local records still merge normally');
  f.render(); await flush(); equal(f.attempts, 1, 'fresh visible history render is throttled');
});
await run('user revisit/render retries after the existing30-second refresh window', async () => {
  const f = fixture('reject', { cached: true }); f.render(); await flush();
  equal(f.attempts, 1, 'first failure bounded');
  f.advance(30000); f.render(); await flush(); equal(f.attempts, 1, 'existing strict30-second boundary retained');
  f.advance(1); f.render(); await flush(); equal(f.attempts, 2, 'next visible render after window retries normally');
  equal(JSON.parse(JSON.stringify(f.context.stCountsCache)), [cacheRecord], 'retry failure still preserves cache');
});
await run('concurrent renders while a request is pending are throttled at attempt start', async () => {
  const f = fixture('valid', { deferred: true }); f.render(); f.render(); f.render();
  equal(f.attempts, 1, 'no duplicate pending read requests');
  f.advance(5000); f.settle(true); await flush();
  equal(f.paints, 1, 'visible completion paints once');
  equal(f.context.stCountsLastFetched, epoch + 5000, 'valid completion preserves freshness timestamp behavior');
});
for (const destination of ['menu', 'dashboard', 'overview', 'catalog', 'inactive']) {
  for (const success of [false, true]) await run(destination + ' suppresses stale async repaint on ' + (success ? 'success' : 'failure'), async () => {
    const f = fixture('valid', { deferred: true, cached: true }); f.render();
    if (destination === 'menu') {
      equal(f.context.show(true), true, 'actual Menu renderer used');
      equal(f.classes.has('page-menu'), true, 'actual pageShell switched to Menu');
      equal(f.context.stPageActive, true, 'reproduces the genuine stale Stock flag');
    } else if (destination === 'dashboard') f.context.pageShell('');
    else if (destination === 'overview') f.context.stCurrentTab = 'overview';
    else if (destination === 'catalog') f.context.stItemSubView = 'catalog';
    else f.context.stPageActive = false;
    f.settle(success); await flush();
    equal(f.attempts, 1, 'completion must not start another request');
    equal(f.paints, 0, 'only currently visible Stock/items/counts may repaint');
    equal(JSON.parse(JSON.stringify(f.context.stCountsCache)), success ? f.payload : [cacheRecord], 'normal success/failure cache semantics retained');
  });
}
console.log(JSON.stringify({
  boundary: 'Pure current-source dependency regression; not original151/native failure proof',
  currentSourceHashes: Object.fromEntries(Object.entries(sources).map(([name, source]) => [name, sha(source)])),
  actualFunctions: functions.map(({ name, line, sha256 }) => ({ name, line, sha256 })), checks, results, failures,
}, null, 2));
process.exitCode = failures.length ? 1 : 0;
