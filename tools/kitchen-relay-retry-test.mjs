#!/usr/bin/env node
/* tools/kitchen-relay-retry-test.mjs · a kitchen order is never dropped for a
 * reason that can clear on its own.
 *
 * Pasta Corner, #0163: the first table 9 order printed in the kitchen, never
 * reached the server, and nothing retried it. The relay treated every 4xx as
 * final (including a till check that failed under load, 403, and refusals the
 * server marks `retry: true`), let a stalled request block for a minute, and
 * swallowed a full-localStorage write of its own retry queue.
 *
 * Runs the shipped assets/kitchen-relay.js in a VM with a scripted network.
 *
 *   node tools/kitchen-relay-retry-test.mjs
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../assets/kitchen-relay.js', import.meta.url), 'utf8');
let checks = 0;
const ok = (cond, label, detail) => { assert.ok(cond, label + (detail ? ' · ' + JSON.stringify(detail) : '')); checks++; };

function relay({ respond, storageFull = false }) {
  const store = new Map([['kiwiPaired', '1'], ['kiwiPairedVenue', JSON.stringify({ merchant: 'relay-fixture' })]]);
  const timers = [];
  const ctx = {
    JSON, Date, Math, Array, Object, String, Number, Promise, Uint8Array, crypto, AbortController,
    localStorage: {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => { if (storageFull && k === 'kiwiKitchenQueue') throw new Error('QuotaExceededError'); store.set(k, String(v)); },
      removeItem: (k) => store.delete(k),
    },
    setTimeout: (fn) => { timers.push(fn); return timers.length; }, clearTimeout() {},
    setInterval: () => 0, clearInterval() {},
    addEventListener() {}, dispatchEvent() {}, CustomEvent: class {},
    fetch: (url, init) => respond(init),
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(source, ctx, { filename: 'assets/kitchen-relay.js' });
  const queued = () => JSON.parse(store.get('kiwiKitchenQueue') || '[]').map((row) => row.create.id);
  return { R: ctx.KiwiKitchenRelay, queued, timers };
}
const reply = (status, body) => () => Promise.resolve(new Response(JSON.stringify(body), { status }));
const ticket = (R) => ({ id: R.newId(), mode: 'table', table: '9', lines: [{ name: 'Lasagna', qty: 1, unitPrice: 69 }] });

for (const [label, status, body] of [
  ['a till check refused under load (403)', 403, { error: 'forbidden-merchant' }],
  ['an expired till session (401)', 401, { error: 'unauthorized' }],
  ['a refusal the server marks retry:true', 409, { error: 'stale-table-visit', retry: true }],
]) {
  const h = relay({ respond: reply(status, body) });
  const t = ticket(h.R);
  const r = await h.R.send(t);
  ok(r && r.ok === false && r.queued === true, `${label}: reported as waiting, not final`, r);
  ok(h.queued().includes(t.id), `${label}: stays in the retry queue`, h.queued());
}

for (const [label, status, body] of [
  ['a malformed order (400)', 400, { error: 'empty-order' }],
  ['a final conflict without retry', 409, { error: 'archived', archived: ['x'] }],
]) {
  const h = relay({ respond: reply(status, body) });
  const t = ticket(h.R);
  const r = await h.R.send(t);
  ok(!h.queued().includes(t.id), `${label}: not hammered every fifteen seconds`, h.queued());
  ok(r && r.error === body.error, `${label}: the refusal reaches the caller`, r);
}

{
  const h = relay({ respond: () => Promise.reject(new TypeError('offline')) });
  const t = ticket(h.R);
  const r = await h.R.send(t);
  ok(r.queued === true && h.queued().includes(t.id), 'a network failure is queued durably', r);
}

{
  const h = relay({ respond: (init) => new Promise((_, reject) => {
    init.signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
  }) });
  const t = ticket(h.R);
  const pending = h.R.send(t);
  h.timers.splice(0).forEach((fn) => fn());   // the send timeout fires
  const r = await pending;
  ok(r.queued === true && h.queued().includes(t.id), 'a stalled send is cut off and queued instead of blocking', r);
}

{
  const h = relay({ respond: () => Promise.reject(new TypeError('offline')), storageFull: true });
  const t = ticket(h.R);
  const r = await h.R.send(t);
  ok(r.queued === false, 'a full localStorage is reported, not swallowed', r);
  ok(h.R.pending() === 1, 'the order still waits in memory for the next retry', h.R.pending());
}

console.log(`kitchen-relay-retry-test: ${checks} checks passed`);
