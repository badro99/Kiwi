import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { pollMode } from '../functions/api/_poll-mode.js';
const source = fs.readFileSync('assets/kiwi-env.js', 'utf8').split('/* Shared read admission.')[1];
function device(real = true, status = 200) {
  let now = 0, hits = 0, seq = 0;
  const timers = new Map(), handlers = new Map();
  const listen = (type, fn) => handlers.set(type, [...(handlers.get(type) || []), fn]);
  const document = { hidden: false, addEventListener: listen, dispatchEvent(e) { for (const fn of handlers.get(e.type) || []) fn(e); } };
  const window = { KiwiEnv: { isReal: () => real }, addEventListener: listen,
    fetch: async () => { hits++; return new Response('{}', { status }); } };
  vm.runInNewContext('/* Shared read admission.' + source, {
    window, document, location: new URL('https://kiwi.test/dashboard.html'), URL, URLSearchParams,
    Promise, Map, Error, CustomEvent: class { constructor(type) { this.type = type; } }, Date: { now: () => now },
    setTimeout(fn, ms) { timers.set(++seq, { fn, at: now + ms }); return seq; },
    clearTimeout(id) { timers.delete(id); }
  });
  const settle = async () => { for (let i = 0; i < 30; i++) await Promise.resolve(); };
  return { window, document, hits: () => hits, settle,
    fire(type) { for (const fn of handlers.get(type) || []) fn({ isTrusted: true }); },
    async advance(ms) { const end = now + ms; for (;;) {
      const next = [...timers].sort((a,b) => a[1].at - b[1].at)[0];
      if (!next || next[1].at > end) break;
      now = next[1].at; timers.delete(next[0]); next[1].fn(); await settle();
    } now = end; await settle(); }
  };
}
for (const path of ['feed', 'config', 'floorplan', 'team', 'orders', 'store?feature=inventory', 'queue']) {
  const d = device(); d.window.KiwiPoll.hint('quiet');
  await d.window.fetch('/api/' + path); await d.settle();
  await assert.rejects(d.window.fetch('/api/' + path)); await d.advance(599999);
  assert.equal(d.hits(), 1, path + ' waits ten minutes');
  d.document.hidden = true; await d.advance(3600000);
  await assert.rejects(d.window.fetch('/api/' + path));
  assert.equal(d.hits(), 1, path + ' hidden');
  d.document.hidden = false; await d.window.fetch('/api/' + path); await d.settle();
  await assert.rejects(d.window.fetch('/api/' + path));
  d.fire('pointerdown'); await d.window.fetch('/api/' + path);
  assert.equal(d.hits(), 3, path + ' action wakes');
}
for (const shell of ['dashboard', 'till']) {
  const d = device(false);
  for (let i = 0; i < 360; i++) {
    await d.window.fetch('/api/feed').catch(() => {});
    await d.window.fetch('/api/store', { method: 'POST' }).catch(() => {});
    await d.advance(10000);
  }
  assert.equal(d.hits(), 0, shell + ' local fixture demo hour');
}
const denied = device(true, 401);
await denied.window.fetch('/api/feed'); await denied.settle();
await assert.rejects(denied.window.fetch('/api/store')); await denied.advance(1799999);
assert.equal(denied.hits(), 1); await denied.advance(1); await denied.window.fetch('/api/store');
const money = device(); money.window.KiwiPoll.hint('quiet'); money.document.hidden = true;
await money.window.fetch('/api/sale', { method: 'POST' });
await money.window.fetch('/api/print/jobs'); assert.equal(money.hits(), 2);
function db({ active = 0, test = 0 } = {}) {
  let checked = null, mode = null, probes = 0;
  return { get probes() { return probes; }, DB: { prepare(sql) { return { bind(...args) { return {
    async first() {
      if (sql.includes('SELECT test_account')) return { test_account: test, poll_checked_ts: checked, poll_mode: mode };
      probes++; return { active };
    }, async run() {
      if (sql.includes('SET poll_checked_ts')) { checked = args[0]; return { meta: { changes: 1 } }; }
      mode = args[0]; return { meta: { changes: 1 } };
    }
  }; } }; } } };
}
for (const active of [0, 1]) {
  const env = db({ active });
  assert.equal(await pollMode(env, 'shop', 1000000), active ? 'live' : 'quiet');
  await pollMode(env, 'shop', 1599999); assert.equal(env.probes, 1);
  await pollMode(env, 'shop', 1600000); assert.equal(env.probes, 2);
}
const test = db({ active: 1, test: 1 });
assert.equal(await pollMode(test, 'amira-cafe'), 'quiet'); assert.equal(test.probes, 0);
console.log('quiet mode: read pacing, hidden pause, action wake, demo hour, money, 401 and server cache passed');
// Execute the production query, including the exact seven-day boundary.
const { DatabaseSync } = await import('node:sqlite');
const sql = new DatabaseSync(':memory:');
sql.exec(fs.readFileSync('schema.sql', 'utf8'));
const now = 2000000000, since = now - 7 * 86400000;
const env = { DB: { prepare(query) { return { bind(...args) { return {
  async first() { return sql.prepare(query).get(...args); },
  async run() { return { meta: { changes: sql.prepare(query).run(...args).changes } }; }
}; } }; } } };
function reset() {
  sql.exec("DELETE FROM sales; DELETE FROM orders; DELETE FROM store_docs; DELETE FROM hotel_reservations; DELETE FROM merchant_config;");
  sql.prepare("INSERT INTO merchant_config (merchant, features, updated_ts) VALUES ('shop', '{}', 0)").run();
}
reset(); assert.equal(await pollMode(env, 'shop', now), 'quiet');
for (const age of [since - 1, since, now]) {
  reset(); sql.prepare("INSERT INTO sales (id, merchant, amount, method, ts) VALUES ('s', 'shop', 0, 'cash', ?)").run(age);
  assert.equal(await pollMode(env, 'shop', now), age < since ? 'quiet' : 'live');
}
for (const feature of ['attendance', 'reservations']) {
  reset(); sql.prepare("INSERT INTO store_docs VALUES ('shop', ?, '{}', 1, ?)").run(feature, now);
  assert.equal(await pollMode(env, 'shop', now), 'live', feature);
}
reset(); sql.prepare("INSERT INTO orders (id, merchant, number, mode, total, lines, status, created_ts, updated_ts) VALUES ('o', 'shop', 1, 'table', 0, '[]', 'pending', ?, ?)").run(now, now);
assert.equal(await pollMode(env, 'shop', now), 'live');
sql.close();
console.log('quiet server: real SQL, seven-day boundary, order, punch and booking passed');
const hour = device(); hour.window.KiwiPoll.hint('quiet');
for (let second = 0; second < 3600; second++) {
  await hour.window.fetch('/api/feed?merchant=shop&cursor=' + second).catch(() => {});
  await hour.advance(1000);
}
assert.equal(hour.hits(), 6, 'quiet resource including moving cursor: six requests/device-hour');
await assert.rejects(denied.window.fetch('/api/operations', { method: 'POST' }));
console.log('quiet budget: 6 HTTP/device-hour per read resource');

// The hint says whether a business has been inactive: only callers allowed to
// read this store get it, and nobody else triggers the activity probe or its write.
{
  const fs = await import('node:fs');
  const src = fs.readFileSync(new URL('../functions/api/config.js', import.meta.url), 'utf8');
  const calls = src.match(/pollMode\(env,[^)]*\)/g) || [];
  if (calls.length !== 1 || !/mayReadPins\s*\?\s*await pollMode\(env, merchant\)\s*:\s*["']live["']/.test(src)) {
    console.error('✗ /api/config computes pollMode for callers who may not read this store');
    process.exit(1);
  }
  console.log('quiet hint: only store-authorised callers get it');
}

// Boot discovery and explicit actions must not inherit a periodic read budget.
const boot = device(true, 401);
await boot.window.fetch('/api/me');
await boot.window.fetch('/api/feed');
await boot.window.fetch('/api/employee');
assert.equal(boot.hits(), 3, 'expected sign-in responses do not prevent boot or session recovery');
const action = device(); action.window.KiwiPoll.hint('quiet');
await action.window.fetch('/api/feed');
await assert.rejects(action.window.fetch('/api/feed'));
await action.window.fetch('/api/sale', { method: 'POST' });
await action.window.fetch('/api/feed');
assert.equal(action.hits(), 3, 'successful write immediately refreshes a previously paced resource');
const backgroundBoot = device(); backgroundBoot.document.hidden = true;
await backgroundBoot.window.fetch('/api/config');
await assert.rejects(backgroundBoot.window.fetch('/api/config'));
assert.equal(backgroundBoot.hits(), 1, 'hidden boot admits initial state but pauses repeated reads');
console.log('quiet boot: identity recovery, action refresh and hidden initial state passed');

const interacting = device(); interacting.fire('pointerdown');
interacting.window.KiwiPoll.hint('quiet');
await interacting.window.fetch('/api/config');
await interacting.window.fetch('/api/config');
assert.equal(interacting.hits(), 2, 'late quiet hint preserves an ongoing setup action');
await interacting.advance(60000);
await assert.rejects(interacting.window.fetch('/api/config'));
console.log('quiet action lease: active setup stays live, then quiet pacing resumes');

const refusedAction = device(true, 401);
await refusedAction.window.fetch('/api/store', { method: 'POST' });
await refusedAction.window.fetch('/api/config');
assert.equal(refusedAction.hits(), 2, 'a refused boot write does not suspend unrelated discovery');

const demoRetry = device(false);
await demoRetry.window.fetch('/api/merchant-health');
await assert.rejects(demoRetry.window.fetch('/api/merchant-health'));
assert.equal(demoRetry.hits(), 1, 'demo boot may load a card once but cannot retry it periodically');

const bootFailure = device(false, 503);
await bootFailure.window.fetch('/api/merchant-health');
await bootFailure.window.fetch('/api/merchant-health');
await assert.rejects(bootFailure.window.fetch('/api/merchant-health'));
assert.equal(bootFailure.hits(), 2, 'one failed demo boot read can retry once, without periodic polling');

// Exercise the real stock-count renderer with an immediately paused transport.
// Bound the simulated rerenders so a regression fails instead of starving Node.
let countNow = 100000, countReads = 0, countRenders = 0, countApi;
const countState = { stCountsLastFetched: 0, stCountsCache: [], stPageActive: true,
  stItemSubView: 'counts', stCountDateFilter: 'tout', stCountStatusFilter: 'all',
  stCountSearch: '', stCountSubTab: 'list',
  rerenderTabBody() { if (++countRenders < 4) countApi.renderCountsHistory(); } };
const countScope = new Proxy(countState, { get(target, key) {
  return key in target ? target[key] : (value) => String(value ?? '');
} });
class CountClock extends Date { static now() { return countNow; } }
const countRealm = {
  window: { KiwiStockInternal: { install(_name, factory) { countApi = factory(countScope); } } },
  Date: CountClock, localStorage: { getItem: () => null },
  fetch: async () => { countReads++; throw new Error('Read paused by device poll policy'); }
};
vm.runInNewContext(fs.readFileSync('assets/stock/state.js', 'utf8'), countRealm);
countState.stockState = countRealm.window.KiwiStockState(() => ({}));
vm.runInNewContext(fs.readFileSync('assets/stock/counts.js', 'utf8'), countRealm);
countApi.renderCountsHistory();
for (let i = 0; i < 20; i++) await Promise.resolve();
assert.equal(countReads, 1, 'paused stock history performs one attempt, not a render/request loop');
assert.equal(countRenders, 1, 'a failed count read settles after one follow-up render');
countNow += 29999; countApi.renderCountsHistory();
assert.equal(countReads, 1, 'failed count reads retain the normal cooldown');
countNow += 2; countApi.renderCountsHistory();
for (let i = 0; i < 20; i++) await Promise.resolve();
assert.equal(countReads, 2, 'stock history retries once its cooldown expires');
assert.equal(countState.stCountsCache.length, 0, 'a failed read preserves the cached book');
console.log('quiet stock history: bounded failed reads and render recovery passed');
