import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../assets/live-link.js', import.meta.url), 'utf8');
const timers = [];
let fetches = 0;
let flushPosts = 0;
const pages = [
  Array.from({ length: 50 }, (_, i) => ({ cursor: i + 1, amount: 10 })),
  [{ cursor: 51, amount: 12 }],
];
const storage = new Map([['kiwiLive', '1']]);
const localStorage = {
  getItem: (key) => storage.has(key) ? storage.get(key) : null,
  setItem: (key, value) => storage.set(key, String(value)),
  removeItem: (key) => storage.delete(key),
};
const window = { localStorage, KiwiEnv: { isReal: () => true }, KiwiMe: { business: 'Santos Store' }, addEventListener() {} };
const document = { hidden: false, readyState: 'loading', addEventListener() {}, dispatchEvent() {}, createElement: () => ({ setAttribute() {}, appendChild() {} }) };
const context = {
  window, document, localStorage, URLSearchParams,
  location: { search: '?op=1&privacy=1&merchant=santos-store', hostname: 'kiwi-os.com' },
  CustomEvent: function (type, init) { this.type = type; this.detail = init?.detail; },
  fetch: async (url, init) => {
    if (init?.method && init.method !== 'GET') { flushPosts++; return { ok: true, json: async () => ({ ok: true }) }; }
    const sales = pages[Math.min(fetches++, pages.length - 1)];
    return { ok: true, json: async () => ({ sales, cursor: sales.at(-1)?.cursor || 0, voided: [] }) };
  },
  setTimeout: (fn, ms) => { timers.push({ fn, ms }); return timers.length; },
  clearTimeout() {}, console,
};
vm.runInNewContext(source, context, { filename: 'assets/live-link.js' });

const batches = [];
window.KiwiLive.watchFeed((sales, backfill) => batches.push({ count: sales.length, backfill }), null, { oneShot: true });
const settle = async () => {
  await Promise.resolve(); await Promise.resolve();
  await new Promise((resolve) => setImmediate(resolve));
};
await settle();
assert.equal(fetches, 1, 'snapshot fetches its first ledger page');
assert.equal(timers.length, 1, 'a full page schedules only its immediate pagination');
assert.equal(timers[0].ms, 0, 'history pagination never waits for the polling interval');
timers.shift().fn();
await settle();
assert.equal(fetches, 2, 'snapshot drains the final ledger page');
assert.deepEqual(batches.map((x) => [x.count, x.backfill]), [[50, true], [1, true]]);
assert.equal(timers.length, 0, 'snapshot stops at the live edge instead of polling every 2.5 seconds');
assert.equal(flushPosts, 0, 'operator snapshot never flushes a browser outbox into the client tenant');

console.log('operator-snapshot-test: 7 controls passed');
