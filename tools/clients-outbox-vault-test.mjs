import { deadlineVmSource, deadlineVmContext } from './deadline-vm-source.mjs';
/* Shipped queue + durable vault, fresh VM reloads, no browser or network. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const SOURCE = fs.readFileSync('assets/clients-store.js', 'utf8');
const VAULT = fs.readFileSync('assets/clients-outbox-vault.js', 'utf8');
assert.equal(fs.readFileSync('assets/clients-store-vault.js', 'utf8'), VAULT + SOURCE, 'till asset is vault then frozen store, with no extra script slot');
const BOOK = 'vault-fixture-shop';
const QUEUE = /^kiwi:clients-(out|purchases|redemptions|refused-redemptions):v1:/;
let checks = 0;
const ok = (v, label) => { assert.ok(v, label); checks++; };
// Requests/cursors/transactions are asynchronous; databases survive new VMs.
function fakeIDB(rows = new Map(), mode = '') {
  const later = (fn) => setImmediate(fn);
  return { rows, open() {
    if (mode === 'throw') throw Error('disabled');
    const request = {};
    later(() => {
      if (mode === 'blocked') { request.onblocked(); return; }
      if (mode === 'error') { request.onerror(); return; }
      request.result = {
        createObjectStore() {}, close() {},
        transaction(name, access) {
          if (mode === 'transaction') throw Error('transaction failed');
          const tx = { objectStore: () => ({
            put(value, key) { later(() => { rows.set(key, structuredClone(value)); tx.oncomplete?.(); }); },
            delete(key) { later(() => { rows.delete(key); tx.oncomplete?.(); }); },
            openCursor() {
              const req = {}, entries = [...rows]; let index = 0;
              const next = () => later(() => {
                const entry = entries[index++];
                req.result = entry ? { key: entry[0], value: structuredClone(entry[1]), continue: next } : null;
                req.onsuccess();
                if (!entry) tx.oncomplete?.();
              });
              next(); return req;
            },
          }) };
          return tx;
        },
      };
      request.onupgradeneeded(); request.onsuccess();
    });
    return request;
  } };
}
function device(storage = new Map(), idb = fakeIDB(), full = false, persisted = {}, provider, deferStore = false) {
  const net = { online: false, sent: [] };
  const disk = { full };
  const stores = {};
  const define = (name, opts) => (stores[name] = {
    data: persisted[name] || (persisted[name] = {}),
    get(k) { return this.data[k] || (opts && opts.blank ? opts.blank() : null); },
    set(v, k) { this.data[k] = JSON.parse(JSON.stringify(v)); },
    subscribe() { return () => {}; },
  });
  const listeners = {};
  const window = {
    KiwiStore: { define, currentVenue: () => BOOK },
    KiwiEnv: { isReal: () => true },
    addEventListener(name, fn) { (listeners[name] ||= []).push(fn); },
    dispatchEvent(event) { (listeners[event.type] || []).forEach(fn => fn(event)); },
  };
  const localStorage = {
    getItem: (k) => (storage.has(k) ? storage.get(k) : null),
    setItem: (k, v) => {
      if (disk.full && QUEUE.test(k)) { const e = new Error('QuotaExceededError'); e.name = 'QuotaExceededError'; throw e; }
      storage.set(k, String(v));
    },
    removeItem: (k) => storage.delete(k),
  };
  const fetch = (url, opts) => {
    if (!opts || !opts.method) return Promise.resolve({ ok: false, status: 503, json: async () => ({}) });
    if (!net.online) return Promise.reject(new Error('offline'));
    net.sent.push({ method: opts.method, url: String(url), body: opts.body ? JSON.parse(opts.body) : null });
    return Promise.resolve({ ok: true, status: 200, json: async () => ({ ok: true }) });
  };
  const context = vm.createContext({
    window, KiwiStore: window.KiwiStore, KiwiEnv: window.KiwiEnv, localStorage, fetch,
    Event: class { constructor(type) { this.type = type; } }, setTimeout, clearTimeout, indexedDB: idb, navigator: { onLine: true }, console, setInterval: () => 1, clearInterval() {},
  });
  vm.runInContext(deadlineVmSource(VAULT), deadlineVmContext(context), { filename: 'assets/clients-outbox-vault.js' });
  if (provider === 'absent') delete window.KiwiOutboxVault;
  if (provider === 'throwing') window.KiwiOutboxVault = { loaded: true, get(){throw Error();}, save(){throw Error();}, drop(){throw Error();} };
  const boot = () => vm.runInContext(deadlineVmSource(SOURCE.replace('  window.KiwiClients = {', '  window.probe = {read: outboxRead, write: outboxWrite}; window.KiwiClients = {')), deadlineVmContext(context), { filename: 'assets/clients-store.js' });
  if (!deferStore) { boot(); window.dispatchEvent({type: 'load'}); }
  return { boot() { boot(); window.dispatchEvent({type: 'load'}); this.api = window.KiwiClients; this.probe = window.probe; }, api: window.KiwiClients, vault: window.KiwiOutboxVault, probe: window.probe, net, disk, storage, persisted };
}
const settle = async () => { for (let i = 0; i < 20; i++) await new Promise((r) => setImmediate(r)); };
const queued = (d, kind) => JSON.parse(d.storage.get('kiwi:clients-' + kind + ':v1:' + BOOK) || '[]');


// Refused writes persist offline, reload with the same IDB/storage and replay.
{
  const idb = fakeIDB(), storage = new Map(), persisted = {};
  const d = device(storage, idb, false, persisted);
  await settle();
  d.api.setConfig({ model: 'visit', visit: { target: 1 } }, BOOK);
  const client = d.api.upsert({ name: 'Vault Fixture', phone: '0612345678' }, BOOK);
  await settle(); d.disk.full = true;
  d.api.recordPurchase(client.id, { amount: 120, saleId: 'vault-sale' }, BOOK);
  d.api.redeem(client.id, BOOK);
  d.api.upsert({ id: client.id, notes: 'offline edit' }, BOOK);
  await settle();
  const key = 'kiwi:clients-purchases:v1:' + BOOK;
  ok(!queued(d, 'purchases').length, 'full localStorage has no purchase');
  const after = device(storage, idb, true, persisted);
  await settle();
  ok(after.api.purchaseSyncStatus(BOOK).count === 1, 'reload retains purchase only present in vault');
  const before = after.api.get(client.id, BOOK).visits;
  after.api.recordPurchase(client.id, { amount: 120, saleId: 'vault-sale' }, BOOK);
  ok(after.api.get(client.id, BOOK).visits === before, 'vault purchase prevents local double counting');
  after.disk.full = false; after.net.online = true; after.api.sync(); await settle();
  ok(after.net.sent.filter(r => r.body?.purchase).length === 1, 'reloaded purchase sent exactly once');
  ok(after.net.sent.some(r => r.body?.redemption), 'reloaded redemption sent');
  ok(after.net.sent.some(r => r.body?.notes === 'offline edit'), 'reloaded profile edit sent');
  ok(!idb.rows.has(key), 'acknowledged vault entry dropped after successful post-load write');
  const again = device(storage, idb, false, persisted); await settle();
  again.net.online = true; again.api.sync(); await settle();
  ok(!again.net.sent.some(r => r.body?.purchase || r.body?.redemption), 'acknowledged events do not resurrect on another reload');
}
// Vault load itself invokes the existing public sync path when online.
{
  const key = 'kiwi:clients-purchases:v1:' + BOOK;
  const d = device(new Map(), fakeIDB(new Map([[key, [{ ref: 'startup', clientId: 'c', amount: 1 }]]])));
  d.net.online = true; await settle();
  ok(d.net.sent.filter(r => r.body?.purchase?.ref === 'startup').length === 1, 'load completion flushes through KiwiClients.sync');
}
// A slow store download can finish after IndexedDB has already loaded.
{
  const key = 'kiwi:clients-purchases:v1:' + BOOK;
  const d = device(new Map(), fakeIDB(new Map([[key, [{ ref: 'late-store', clientId: 'c', amount: 1 }]]])), false, {}, undefined, true);
  await settle(); d.net.online = true; d.boot(); await settle();
  ok(d.net.sent.filter(r => r.body?.purchase?.ref === 'late-store').length === 1, 'page load attaches vault even when load precedes store execution');
}
// All four key families share the same union and durability semantics.
for (const kind of ['out', 'purchases', 'redemptions', 'refused-redemptions']) {
  const key = 'kiwi:clients-' + kind + ':v1:' + 'other-book';
  const objects = kind !== 'out';
  const a = objects ? { ref: 'a', clientId: 'c', amount: 1 } : 'a';
  const b = objects ? { ref: 'b', clientId: 'c' } : '-b';
  const idb = fakeIDB(new Map([[key, [a, b, b]]]));
  const local = objects ? { ...a, amount: 2 } : a;
  const storage = new Map([[key, JSON.stringify([local, local])]]);
  const d = device(storage, idb); await settle();
  ok(JSON.stringify(d.probe.read(key)) === JSON.stringify([local, b]), kind + ' union deduplicates by token/ref, local order first');
  d.probe.write(key, []); await settle();
  ok(!idb.rows.has(key), kind + ' successful write drops vault');
}
// Startup writes must not erase entries whose asynchronous load is pending.
{
  const key = 'kiwi:clients-purchases:v1:' + 'other-book', old = { ref: 'old', clientId: 'c' }, fresh = { ref: 'new', clientId: 'c' };
  const idb = fakeIDB(new Map([[key, [old]]]));
  const d = device(new Map(), idb, true);
  d.probe.write(key, [fresh]); await settle();
  ok(JSON.stringify(d.probe.read(key)) === JSON.stringify([fresh, old]), 'pre-load refused write merges unseen vault events');
  d.disk.full = false; d.api.sync(); await settle();
  ok(JSON.parse(d.storage.get(key) || '[]').length === 2, 'held persistence writes union rather than deleting unseen vault items');
  const idb2 = fakeIDB(new Map([[key, [old]]]));
  const early = device(new Map(), idb2);
  early.probe.write(key, [fresh]); await settle();
  ok(early.probe.read(key).length === 2, 'successful pre-load write leaves unseen vault entry intact');
}
for (const mode of ['absent', 'throw', 'blocked', 'error', 'transaction']) {
  const d = device(new Map(), mode === 'absent' ? null : fakeIDB(new Map(), mode));
  await settle(); d.disk.full = true;
  const key = 'kiwi:clients-purchases:v1:' + BOOK;
  d.probe.write(key, [{ ref: mode, clientId: 'c' }]);
  ok(d.probe.read(key).length === 1, mode + ': refused queue still held in memory');
  d.disk.full = false; d.api.sync(); await settle();
  ok(queued(d, 'purchases').length === 1, mode + ': held queue returns to localStorage');
}
// A missing or synchronously throwing vault preserves the old store behavior.
for (const provider of ['absent', 'throwing']) {
  const d = device(new Map(), null, false, {}, provider); await settle();
  d.api.attachOutboxVault(provider === 'absent' ? undefined : { loaded: true, get(){throw Error();}, save(){throw Error();}, drop(){throw Error();} });
  d.disk.full = true; d.probe.write('fixture', ['held']);
  ok(d.probe.read('fixture')[0] === 'held', provider + ' vault cannot break held queue');
}
console.log('✓ clients outbox vault: ' + checks + ' checks');
