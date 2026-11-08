#!/usr/bin/env node
/* r21 creditbook#A2: the credit book (store_docs `verticalops`) hits the server's BOOK_MAX and answers 413.
   An unsynced settlement must stay pending (dirty + refused marks, no "in sync" bookmark), stay readable and
   exportable from this device, and be re-offered after a reload; it is only cleared once the server accepts.
   Real assets/cloud-doc.js over a persistent fake storage; the 413 comes from the server's own constant. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { BOOK_MAX } from '../functions/api/_credit-book-store.js';
const DOC = fs.readFileSync(new URL('../assets/cloud-doc.js', import.meta.url), 'utf8');
const tick = (n = 20) => new Promise((resolve) => setTimeout(resolve, n));
const disk = new Map();
const storage = { getItem: (k) => (disk.has(k) ? disk.get(k) : null), setItem: (k, v) => { disk.set(k, String(v)); }, removeItem: (k) => { disk.delete(k); }, get length() { return disk.size; }, key: (i) => [...disk.keys()][i] ?? null };
const keyLike = (prefix) => [...disk.keys()].find((k) => k.startsWith(prefix));
let serverMode = '413', calls = [];
/* "Reload": a fresh realm and a fresh cloud-doc over the same persistent storage. */
function session() {
  const refusals = [];
  const window = { KiwiEnv: { isReal: () => true }, addEventListener() {}, dispatchEvent() { return true; } };
  window.window = window;
  const context = vm.createContext({ window, localStorage: storage, console, Date, JSON, Math, Promise, setTimeout, clearTimeout, setInterval: () => 1, clearInterval() {}, AbortController, URL,
    document: { addEventListener() {}, visibilityState: 'visible' },
    fetch: async (url, init) => {
      const method = (init && init.method) || 'GET'; calls.push(method);
      if (method === 'GET') return { ok: true, status: 200, json: async () => ({ data: { carnet: [] }, rev: 3 }), text: async () => '{}', headers: { get: () => null } };
      if (serverMode === '413') return { ok: false, status: 413, json: async () => ({ error: 'too-large', why: 'too-large', max: BOOK_MAX }), text: async () => '{}', headers: { get: () => null } };
      return { ok: true, status: 200, json: async () => ({ ok: true, rev: 4 }), text: async () => '{}', headers: { get: () => null } };
    } });
  context.globalThis = context;
  storage.setItem('kiwiLiveMerchant', 'credit-shop');
  vm.runInContext(DOC, context, { filename: 'assets/cloud-doc.js' });
  const local = () => JSON.parse(storage.getItem('kiwi:test:verticalops') || '{"carnet":[]}');
  const handle = window.KiwiCloudDoc.attach({ feature: 'verticalops', slug: () => 'credit-shop', read: local, write: (d) => storage.setItem('kiwi:test:verticalops', JSON.stringify(d)),
    isEmpty: (d) => !d || !d.carnet || !d.carnet.length, merge: (mine, theirs) => ({ carnet: mine.carnet.length ? mine.carnet : theirs.carnet }), onRefused: (why) => refusals.push(why) });
  return { handle, refusals, local };
}
/* A settlement the cashier took in cash that the server has not seen. */
const settlement = { id: 'client-1', name: 'TEST KIWI', hist: [{ id: 'pay-1', type: 'settle', cents: 25000, at: 1 }] };
storage.setItem('kiwi:test:verticalops', JSON.stringify({ carnet: [settlement] }));
{
  const s = session();
  await tick(); s.handle.pull(); await tick(80);
  assert.ok(calls.includes('PUT') || calls.includes('POST'), 'the settlement was offered to the server: ' + calls);
  assert.deepEqual(s.refusals, ['too-large'], 'the refusal is reported to the surface');
  assert.ok(keyLike('kiwiDocRefused:v1:verticalops'), 'the refused mark is persisted');
  assert.ok(keyLike('kiwiDocDirty:v1:verticalops'), 'the unsynced settlement stays marked as pending work');
  assert.deepEqual(JSON.parse(JSON.stringify(s.local().carnet[0].hist)), settlement.hist, 'the local book still holds the settlement, whole');
  assert.equal(JSON.stringify(s.local()), JSON.stringify({ carnet: [settlement] }), 'and it exports byte for byte');
}
{
  calls = [];
  const s = session();   /* reload at BOOK_MAX */
  await tick(); s.handle.pull(); await tick(80);
  assert.ok(calls.some((m) => m !== 'GET'), 'after a reload the pending settlement is offered again: ' + calls);
  assert.deepEqual(s.refusals, ['too-large'], 'and the refusal is shown again, not forgotten');
  assert.ok(keyLike('kiwiDocRefused:v1:verticalops') && keyLike('kiwiDocDirty:v1:verticalops'), 'marks survive the reload');
  assert.equal(JSON.stringify(s.local()), JSON.stringify({ carnet: [settlement] }), 'local settlement untouched');
}
{
  serverMode = 'ok'; calls = [];
  const s = session();
  await tick(); s.handle.pull(); await tick(80);
  assert.ok(!keyLike('kiwiDocRefused:v1:verticalops'), 'once the server accepts, the refused mark clears');
  assert.ok(!keyLike('kiwiDocDirty:v1:verticalops'), 'and the pending mark with it');
}
console.log('✓ credit book at BOOK_MAX: unsynced settlement stays pending, exportable and re-offered after reload');
