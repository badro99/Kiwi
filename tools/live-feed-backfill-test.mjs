import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../assets/live-link.js', import.meta.url), 'utf8');
const timers = [];
const batches = [
  Array.from({ length: 50 }, (_, i) => ({ cursor: i + 1, amount: 10, method: 'cash' })),
  [{ cursor: 51, amount: 32, method: 'cash', label: 'ancienne vente' }],
  [{ cursor: 52, amount: 44, method: 'card', label: 'nouvelle vente' }],
];
const seen = [];
let fetches = 0;

const storage = new Map([['kiwiLive', '1']]);
const localStorage = {
  getItem: (key) => storage.has(key) ? storage.get(key) : null,
  setItem: (key, value) => storage.set(key, String(value)),
  removeItem: (key) => storage.delete(key),
};
const window = {
  localStorage,
  KiwiEnv: { isReal: () => true },
  KiwiMe: { business: 'Amira Boutique' },
  addEventListener() {},
  dispatchEvent() {},
};
const document = {
  readyState: 'loading', hidden: false,
  addEventListener() {},
  createElement: () => ({ setAttribute() {}, appendChild() {} }),
};
const context = {
  window, document, localStorage,
  location: { search: '', hostname: 'kiwi-os.com' },
  URLSearchParams,
  CustomEvent: function (type, init) { this.type = type; this.detail = init?.detail; },
  fetch: async () => {
    const sales = batches[Math.min(fetches++, batches.length - 1)];
    return { ok: true, json: async () => ({ sales, cursor: sales.at(-1)?.cursor || 51, voided: [] }) };
  },
  setTimeout: (fn, ms) => { timers.push({ fn, ms }); return timers.length; },
  clearTimeout() {},
  console,
};

vm.runInNewContext(source, context, { filename: 'assets/live-link.js' });
window.KiwiLive.watchFeed((sales, backfill) => {
  seen.push({ cursors: sales.map((sale) => sale.cursor), backfill });
});

const settle = async () => {
  await Promise.resolve();
  await Promise.resolve();
  await new Promise((resolve) => setImmediate(resolve));
};
const runNextTimer = async () => {
  assert.ok(timers.length, 'the feed should schedule its next poll');
  timers.shift().fn();
  await settle();
};

await settle();
assert.equal(seen.length, 1);
assert.equal(seen[0].backfill, true, 'the first full history page stays silent');
assert.equal(timers[0]?.ms, 0, 'a full history page drains immediately');

await runNextTimer();
assert.equal(seen.length, 2);
assert.equal(seen[1].backfill, true, 'the final partial history page also stays silent');
assert.equal(seen[1].cursors[0], 51);

await runNextTimer();
assert.equal(seen.length, 3);
assert.equal(seen[2].backfill, false, 'only sales arriving after history become notifications');
assert.equal(seen[2].cursors[0], 52);

console.log('live-feed-backfill-test: 7 controls passed');
