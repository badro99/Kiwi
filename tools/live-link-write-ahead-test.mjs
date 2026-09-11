#!/usr/bin/env node
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../assets/live-link.js', import.meta.url), 'utf8');
const values = new Map([
  ['kiwiLive', '1'],
  ['kiwiPairedVenue', JSON.stringify({ merchant: 'mixmax', name: 'MixMax' })],
]);
const localStorage = {
  getItem: (key) => values.get(key) ?? null,
  setItem: (key, value) => values.set(key, String(value)),
  removeItem: (key) => values.delete(key),
};
let finishEnqueue;
const enqueueGate = new Promise((resolve) => { finishEnqueue = resolve; });
const KiwiOffline = {
  available: () => true,
  subscribe() {},
  migrateLegacy: () => Promise.resolve(),
  stats: () => Promise.resolve({ pending: 0, blocked: 0, sending: 0, total: 0 }),
  claim: () => Promise.resolve(null),
  enqueue: () => enqueueGate,
};
const document = {
  readyState: 'complete', hidden: false,
  addEventListener() {}, dispatchEvent() {}, createElement: () => ({}),
};
const window = {
  localStorage, KiwiOffline, KiwiEnv: { isReal: () => true },
  addEventListener() {}, dispatchEvent() {}, document,
};
const context = {
  window, document, localStorage, navigator: { onLine: true },
  location: { search: '', hostname: 'kiwi-os.com' }, URLSearchParams,
  CustomEvent: function (type, init) { this.type = type; this.detail = init?.detail; },
  fetch: () => new Promise(() => {}), setTimeout: () => 1, clearTimeout() {}, console,
};
vm.runInNewContext(source, context, { filename: 'assets/live-link.js' });
await new Promise((resolve) => setImmediate(resolve));
await new Promise((resolve) => setImmediate(resolve));

const result = window.KiwiLive.postSale({ id: 'sale-close-race', amount: 377, ref: '35', time: new Date() });
const queue = () => JSON.parse(values.get('kiwiSaleQueue') || '[]');
if (!result?.queued || result.durable !== 'indexeddb' || queue().length !== 1) {
  throw new Error('sale was not synchronously write-ahead protected before IndexedDB commit');
}
console.log('  ✓ payment is durable synchronously before IndexedDB enqueue resolves');

finishEnqueue();
await new Promise((resolve) => setImmediate(resolve));
await new Promise((resolve) => setImmediate(resolve));
if (queue().length !== 0) throw new Error('write-ahead copy was not removed after IndexedDB commit');
console.log('  ✓ write-ahead copy clears only after IndexedDB owns the sale');
