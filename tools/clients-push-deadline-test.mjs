#!/usr/bin/env node
/* tools/clients-push-deadline-test.mjs · a hung client push gives up and retries.
 *
 * Council rating 14 (clients G1, both raters): the till's client book sent
 * profile edits, purchases and refunds, reward redemptions and deletions with
 * a bare fetch. A request that never answered (captive Wi-Fi, a stalled
 * proxy) left the event pending forever in this session: no failure, no retry,
 * and a reward probe that never resolved. Only the pull had a deadline.
 * Now all five go through fetchDeadline (12 s, then abort): the request is
 * aborted, the event stays queued, and the next sync sends it again. Every
 * write is idempotent on the server (refs, upsert), so a late success is safe.
 *
 * The shipped bundle runs in a VM; the network accepts requests and never
 * answers; the clock is fast-forwarded. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = fs.readFileSync(path.join(ROOT, 'assets/clients-store.js'), 'utf8');
const BOOK = 'deadline-fixture-shop';
let checks = 0;
const ok = (value, label) => { assert.ok(value, label); checks++; console.log('  ✓ ' + label); };

const storage = new Map();
const stores = {};
const define = (name, opts) => (stores[name] = {
  data: {}, get(k) { return this.data[k] || (opts && opts.blank ? opts.blank() : null); },
  set(v, k) { this.data[k] = JSON.parse(JSON.stringify(v)); }, subscribe() { return () => {}; },
});
const window = { KiwiStore: { define, currentVenue: () => BOOK }, KiwiEnv: { isReal: () => true }, addEventListener() {} };
const localStorage = { getItem: (k) => (storage.has(k) ? storage.get(k) : null), setItem: (k, v) => storage.set(k, String(v)), removeItem: (k) => storage.delete(k) };
const hung = [];
const fetch = (url, opts) => {
  if (!opts || !opts.method) return Promise.resolve({ ok: false, status: 503, json: async () => ({}) });
  const entry = { method: opts.method, url: String(url), body: opts.body ? JSON.parse(opts.body) : null, signal: opts.signal || null };
  hung.push(entry);
  return new Promise(() => {});            /* the server never answers */
};
/* Fast clock: every timer fires on the next turn, so the 12 s deadline passes at once. */
const timers = [];
const setTimeout = (fn) => { timers.push(fn); return timers.length; };
const clearTimeout = (id) => { timers[id - 1] = null; };
const runTimers = () => { const due = timers.splice(0); due.forEach((fn) => fn && fn()); };
const context = vm.createContext({
  window, KiwiStore: window.KiwiStore, KiwiEnv: window.KiwiEnv, localStorage, fetch, AbortController,
  navigator: { onLine: true }, console, setTimeout, clearTimeout, setInterval: () => 1, clearInterval() {},
});
vm.runInContext(SOURCE, context, { filename: 'assets/clients-store.js' });
const api = window.KiwiClients;
const settle = async () => { for (let i = 0; i < 20; i++) await new Promise((r) => setImmediate(r)); };

api.setConfig({ model: 'visit', visit: { target: 1 } }, BOOK);
const client = api.upsert({ name: 'Deadline Fixture', phone: '0611223344' }, BOOK);
api.recordPurchase(client.id, { amount: 90, saleId: 'sale-d1' }, BOOK);
const probe = api.redeem(client.id, BOOK);
const doomed = api.upsert({ name: 'Doomed Fixture', phone: '0699887766' }, BOOK);
api.remove(doomed.id, BOOK);
await settle();

const kinds = (e) => (e.method === 'DELETE' ? 'delete' : e.body && e.body.purchase ? 'purchase' : e.body && e.body.redemption ? 'redemption' : 'profile');
const seen = new Set(hung.map(kinds));
ok(['profile', 'purchase'].every((k) => seen.has(k)), 'profile and purchase pushes went out: ' + [...seen].join(', '));
ok(hung.every((e) => e.signal), 'every client push carries an abort signal (a deadline)');

runTimers();
await settle();
ok(hung.every((e) => e.signal && e.signal.aborted), 'after the deadline every hung push is aborted, none left in flight');
const purchases = JSON.parse(storage.get('kiwi:clients-purchases:v1:' + BOOK) || '[]');
ok(purchases.some((e) => e.ref === 'purchase:' + client.id + ':sale-d1'), 'the timed-out purchase stays queued for the next sync');
const outbox = JSON.parse(storage.get('kiwi:clients-out:v1:' + BOOK) || '[]');
ok(outbox.includes(client.id), 'the timed-out profile edit stays queued for the next sync');
if (probe && typeof probe.then === 'function') {
  const result = await Promise.race([probe.then(() => 'settled'), new Promise((r) => setImmediate(() => setImmediate(() => r('hung'))))]);
  ok(result === 'settled', 'a reward redemption probe settles instead of hanging');
}
console.log(`\n✓ clients-push-deadline-test · ${checks} checks`);
