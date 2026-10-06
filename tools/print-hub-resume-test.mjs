#!/usr/bin/env node
/* tools/print-hub-resume-test.mjs · a print hub that slept is still the hub.
 *
 * Browse, 2026-10-05: the counter till was the restaurant's print hub at
 * 11:04, lost it at 11:09, was re-enabled by hand at 11:44, and lost it for
 * good at 12:08 while the till was still in use at 16:14. Every order from the
 * waiter phone after that had no device to print it. The local lease (45 s)
 * ran out while Android froze the tab, and renewHub() only renewed a LIVE
 * lease, so one pause switched the hub off forever, silently.
 *
 * Also guards the activation boundary: it used `updatedAt`, which every 15 s
 * renewal moves, so an OrderPro order picked up more than 5 s after a renewal
 * was dropped as "older than the hub".
 *
 *   node tools/print-hub-resume-test.mjs [path/to/kitchen-print-queue.js]
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const file = process.argv[2] || new URL('../assets/kitchen-print-queue.js', import.meta.url);
const QUEUE = fs.readFileSync(file, 'utf8');
let checks = 0;
const ok = (cond, label, detail) => { assert.ok(cond, label + (detail !== undefined ? ' · ' + JSON.stringify(detail) : '')); checks++; };
const tick = () => new Promise((r) => setImmediate(r));
async function settle(n = 12) { for (let i = 0; i < n; i++) await tick(); }

function load(responder) {
  const map = new Map();
  const storage = {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
  };
  const timers = [];
  const printed = [];
  const listeners = {};
  const sandbox = {
    localStorage: storage, JSON, Math, Date, String, Number, Object, Array, Error, RegExp, Promise, console,
    encodeURIComponent,
    setTimeout: (fn, ms) => { timers.push({ fn, ms: Number(ms) || 0 }); return timers.length; },
    clearTimeout() {}, setInterval: () => 0,
    CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init && init.detail; } },
    document: { readyState: 'complete', title: 'Caisse comptoir', hidden: false, addEventListener() {}, getElementById: () => null },
    fetch(url, opts) {
      const out = responder(url, opts);
      if (out === 'hang') return new Promise(() => {});
      if (out === null) return Promise.reject(new Error('offline'));
      return Promise.resolve({ status: out.status || 200, json: () => Promise.resolve(out.body) });
    },
  };
  sandbox.window = sandbox;
  sandbox.addEventListener = (type, fn) => { (listeners[type] ||= []).push(fn); };
  sandbox.dispatchEvent = () => true;
  sandbox.KiwiPrinter = {
    printKitchen: (payload) => { printed.push(payload); return Promise.resolve({ ok: true, via: 'bridge' }); },
    isConnected: () => true,
  };
  storage.setItem('kiwiPaired', '1');
  storage.setItem('kiwiLiveMerchant', 'browse-fixture');
  vm.createContext(sandbox);
  vm.runInContext(QUEUE, sandbox, { filename: 'kitchen-print-queue.js' });
  const api = sandbox.KiwiKitchenPrint;
  /* Run the short timers (retries, the 120 ms follow-up flush) but not the
     resume cap, unless asked. */
  const runTimers = (maxMs = 1000) => {
    const due = timers.splice(0).filter((t) => { if (t.ms <= maxMs) return true; timers.push(t); return false; });
    due.forEach((t) => t.fn());
  };
  const lapse = (ms = 10 * 60 * 1000) => {
    const hub = JSON.parse(storage.getItem('kiwiKitchenPrintHubV1'));
    hub.expiresAt = Date.now() - ms; hub.updatedAt = Date.now() - ms - 30000;
    storage.setItem('kiwiKitchenPrintHubV1', JSON.stringify(hub));
    api._remote.holder = null;
  };
  return { api, printed, storage, timers, runTimers, lapse, listeners };
}
const granted = (url, opts) => (opts && opts.method === 'POST') ? { body: { ok: true, rev: 9 } } : { body: { rev: 8, data: null } };
const waiterTicket = (id) => [{ id: id + ':cuisine', createdAt: Date.now(), payload: { title: 'CUISINE', table: 'Table 8', items: [{ qty: 1, name: 'Le Veggie' }] } }];

/* 1 · the till slept ten minutes, the server still has nobody else: the
       waiter's ticket prints, and the hub is claimed again. */
{
  const h = load(granted);
  h.api.setHub(true); await settle();
  h.lapse();
  const r = h.api.enqueue(waiterTicket('ord-table-8'), { remote: 'connected' });
  ok(r.accepted === 1, 'a waiter ticket after a sleep is accepted, not skipped as not-print-hub', r);
  await settle(); h.runTimers(); await settle();
  ok(h.printed.length === 1, 'and it reaches the printer', h.printed.length);
  const hub = JSON.parse(h.storage.getItem('kiwiKitchenPrintHubV1'));
  ok(hub.enabled === true && hub.expiresAt > Date.now(), 'the local lease is taken back', hub);
  ok(h.api.isHub(), 'and the till is the hub again');
}

/* 2 · another till took over while this one slept: hand its tickets over. */
{
  let other = false;
  const h = load((url, opts) => {
    if (!(opts && opts.method === 'POST')) return { body: { rev: 8, data: null } };
    return other
      ? { status: 409, body: { error: 'print-hub-taken', holder: { deviceId: 'ipad-bar', name: 'Bar', expiresAt: Date.now() + 60000 } } }
      : { body: { ok: true, rev: 9 } };
  });
  h.api.setHub(true); await settle();
  other = true;
  h.lapse();
  h.api.enqueue(waiterTicket('ord-table-9'), { remote: 'connected' });
  await settle(); h.runTimers(); await settle();
  ok(h.printed.length === 0, 'a ticket the other hub owns is not printed twice', h.printed.length);
  ok(!h.api.isHub(), 'the till stands down');
  ok(h.api.pending() === 0, 'and does not keep the ticket waiting here', h.api.pending());
}

/* 3 · the server does not answer: the kitchen does not wait on it. */
{
  let hang = false;
  const h = load((url, opts) => (hang ? 'hang' : granted(url, opts)));
  h.api.setHub(true); await settle();
  hang = true;
  h.lapse();
  h.api.enqueue(waiterTicket('ord-table-3'), { remote: 'connected' });
  await settle(); h.runTimers(); await settle();
  ok(h.printed.length === 0, 'while the claim is in flight, the remote ticket waits', h.printed.length);
  h.runTimers(5000); await settle(); h.runTimers(); await settle();
  ok(h.printed.length === 1, 'after the four-second cap it prints anyway', h.printed.length);
}

/* 4 · an OrderPro order picked up after a lease renewal still prints. */
{
  const h = load(granted);
  h.api.setHub(true); await settle();
  const hub = JSON.parse(h.storage.getItem('kiwiKitchenPrintHubV1'));
  hub.activatedAt = Date.now() - 60000;   // enabled a minute ago
  hub.updatedAt = Date.now();             // renewed just now
  hub.expiresAt = Date.now() + 45000;
  h.storage.setItem('kiwiKitchenPrintHubV1', JSON.stringify(hub));
  const r = h.api.enqueue([{ id: 'op-qr-1:cuisine', createdAt: Date.now() - 12000, payload: { title: 'CUISINE', items: [] } }], { remote: true });
  ok(r.accepted === 1, 'a QR order 12 s old is not mistaken for one older than the hub', r);
  const before = h.api.enqueue([{ id: 'op-qr-0:cuisine', createdAt: Date.now() - 10 * 60000, payload: { title: 'CUISINE', items: [] } }], { remote: true });
  ok(before.accepted === 0, 'an order from before the hub was switched on still is', before);
}

/* 5 · a till that never chose to print does not become the hub by waking up. */
{
  const h = load(granted);
  const r = h.api.enqueue(waiterTicket('ord-table-1'), { remote: 'connected' });
  ok(r.skipped === 'not-print-hub' && !h.api.isHub(), 'no opt-in, no hub', r);
}

console.log(`print-hub-resume-test: ${checks} checks passed`);
