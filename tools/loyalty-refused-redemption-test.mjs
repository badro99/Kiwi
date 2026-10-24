#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../assets/clients-store.js', import.meta.url), 'utf8');
const book = 'refused-test';
const key = 'kiwi:clients-redemptions:v1:' + book;
function sandbox(response, storage = new Map(), toasts = null) {
  storage.set('kiwiLive', '1');
  storage.set('kiwiLiveMerchant', book);
  const stores = {};
  const window = {
    KiwiEnv: { isReal: () => true }, addEventListener() {},
    ...(toasts ? { KiwiCaisseToast: (msg, ms, kind, desc) => toasts.push({ msg, kind, desc }) } : {}),
    KiwiStore: { currentVenue: () => book, define(name, options) {
      return stores[name] ||= { get: () => options.blank ? options.blank() : null, set() {}, subscribe: () => () => {} };
    } },
  };
  const localStorage = { getItem: k => storage.get(k) ?? null, setItem: (k, v) => storage.set(k, String(v)) };
  vm.runInNewContext(source, { window, KiwiStore: window.KiwiStore, localStorage, console, setInterval: () => 1,
    fetch: async (url, opts) => opts?.body && JSON.parse(opts.body).redemption ? response() : { ok: false },
  });
  return { clients: window.KiwiClients, storage };
}
const settle = () => new Promise(resolve => setImmediate(resolve));
let checks = 0;
async function scenario(status, error, terminal) {
  const storage = new Map([[key, JSON.stringify([{ ref: 'r1', clientId: 'c1' }])]]);
  const response = () => {
    if (status === 'network') throw new Error('offline');
    return { ok: status >= 200 && status < 300, status, json: async () => ({ error }) };
  };
  const { clients } = sandbox(response, storage);
  await settle();
  const queued = JSON.parse(storage.get(key));
  assert.equal(queued.length, terminal || status === 200 ? 0 : 1, `${status} ${error}: queue`);
  assert.equal(typeof clients.refusedRedemptions, 'function', 'public refused accessor');
  const refused = clients.refusedRedemptions(book);
  assert.equal(refused.length, terminal ? 1 : 0);
  if (terminal) {
    assert.equal(refused[0].ref, 'r1');
    assert.equal(refused[0].clientId, 'c1');
    assert.equal(refused[0].error, error);
    assert.ok(refused[0].at > 0);
    assert.equal(clients.refusedRedemptions('other-book').length, 0);
    assert.equal(sandbox(response, storage).clients.refusedRedemptions(book).length, 1, 'persists after reload');
  }
  checks++;
}
await scenario(409, 'reward-not-ready', true);
for (const [status, error] of [[409, 'loyalty-off'], [409, 'ref-conflict'], [400, 'client-and-ref-required']]) await scenario(status, error, true);
/* client-not-found: the client is created first; if that fails, the redemption stays queued. */
await scenario(404, 'client-not-found', false);
for (const status of [401, 403, 408, 429, 503, 'network']) await scenario(status, 'reward-not-ready', false);
await scenario(409, 'unknown-error', false);
await scenario(200, undefined, false);
const storage = new Map([[key, JSON.stringify(Array.from({ length: 60 }, (_, i) => ({ ref: 'r' + i, clientId: 'c1' })))]]);
const { clients } = sandbox(() => ({ ok: false, status: 409, json: async () => ({ error: 'reward-not-ready' }) }), storage);
for (let i = 0; i < 4; i++) { clients.sync(); await settle(); }
assert.equal(JSON.parse(storage.get(key)).length, 0);
assert.equal(clients.refusedRedemptions(book).length, 60, 'all refusal records remain available');
assert.equal(new Set(clients.refusedRedemptions(book).map(e => e.ref)).size, 60, 'no duplicate refusals');
/* The till that gave the discount is told at once. */
{
  const toasts = [];
  const storage = new Map([[key, JSON.stringify([{ ref: 'r1', clientId: 'c1' }])]]);
  sandbox(() => ({ ok: false, status: 409, json: async () => ({ error: 'reward-not-ready' }) }), storage, toasts);
  await settle();
  assert.equal(toasts.length, 1, 'the till shows the refusal');
  assert.equal(toasts[0].msg, 'Récompense refusée par le serveur');
  assert.equal(toasts[0].kind, 'warn');
  const quiet = [];
  sandbox(() => ({ ok: false, status: 503, json: async () => ({}) }), new Map([[key, JSON.stringify([{ ref: 'r2', clientId: 'c1' }])]]), quiet);
  await settle();
  assert.equal(quiet.length, 0, 'a passing outage says nothing');
  checks++;
}
/* client-not-found after the client was created: final. */
{
  const storage = new Map([[key, JSON.stringify([{ ref: 'r1', clientId: 'c1' }])]]);
  const stores = {};
  const window = {
    KiwiEnv: { isReal: () => true }, addEventListener() {},
    KiwiStore: { currentVenue: () => book, define(name, options) {
      const value = name === 'clients' ? { list: [{ id: 'c1', name: 'Test' }], seq: 1 } : (options.blank ? options.blank() : null);
      return stores[name] ||= { get: () => value, set() {}, subscribe: () => () => {} };
    } },
  };
  storage.set('kiwiLive', '1'); storage.set('kiwiLiveMerchant', book);
  let redemptions = 0, clientPosts = 0;
  const localStorage = { getItem: k => storage.get(k) ?? null, setItem: (k, v) => storage.set(k, String(v)) };
  vm.runInNewContext(source, { window, KiwiStore: window.KiwiStore, localStorage, console, setInterval: () => 1,
    fetch: async (url, opts) => {
      const body = opts?.body ? JSON.parse(opts.body) : {};
      if (body.redemption) { redemptions++; return { ok: false, status: 404, json: async () => ({ error: 'client-not-found' }) }; }
      if (body.id === 'c1') { clientPosts++; return { ok: true, status: 200, json: async () => ({ ok: true }) }; }
      return { ok: false, status: 500, json: async () => ({}) };
    },
  });
  for (let i = 0; i < 4; i++) await settle();
  const c = window.KiwiClients;
  assert.ok(clientPosts >= 1 && redemptions >= 2, `the client is pushed and the redemption retried once (${clientPosts}, ${redemptions})`);
  assert.equal(c.refusedRedemptions(book).length, 1, 'still not found after creating the client: final');
  checks++;
}
/* reward-not-ready while a purchase of that client is still queued: keep waiting. */
{
  const storage = new Map([[key, JSON.stringify([{ ref: 'r1', clientId: 'c1' }])]]);
  storage.set('kiwi:clients-purchases:v1:' + book, JSON.stringify([{ ref: 'p1', clientId: 'c1', kind: 'purchase', amount: 100 }]));
  const { clients } = sandbox(() => ({ ok: false, status: 409, json: async () => ({ error: 'reward-not-ready' }) }), storage);
  await settle();
  assert.equal(JSON.parse(storage.get(key)).length, 1, 'the redemption waits for the purchase that earned the points');
  assert.equal(clients.refusedRedemptions(book).length, 0);
  checks++;
}
console.log(`PASS: ${checks} response scenarios, persistence, book isolation and complete local refusal history`);
