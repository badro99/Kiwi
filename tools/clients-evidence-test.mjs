import { deadlineVmSource, deadlineVmContext } from './deadline-vm-source.mjs';
/* Evidence of money in the local client book: corrupt outbox quarantined, durability visible, integer-centime spend, 100-line cap marked. */
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
    Event: class { constructor(type) { this.type = type; } }, CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init && init.detail; } }, setTimeout, clearTimeout, indexedDB: idb, navigator: { onLine: true }, console, setInterval: () => 1, clearInterval() {},
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



const key = 'kiwi:clients-purchases:v1:' + BOOK;
// A0: a corrupt queue is quarantined with its raw bytes before the next write can replace it.
{
  const corrupt = '[{"ref":"purchase:c:1","clientId":"c","amount":12,';
  const storage = new Map([[key, corrupt]]);
  const d = device(storage, fakeIDB()); await settle();
  ok(d.api.purchaseSyncStatus(BOOK).count === 0, 'corrupt queue reads as empty');
  const q = d.vault.recoveryCopies();
  ok(q.length === 1 && d.vault.recoveryCopies(q[0].key) === corrupt, 'raw corrupt bytes are kept, listed and exportable verbatim');
  d.api.recordPurchase((d.api.upsert({ name: 'Q', phone: '0612345678' }, BOOK)).id, { amount: 10, saleId: 's1' }, BOOK); await settle();
  ok(d.vault.recoveryCopies(q[0].key) === corrupt, 'the next write does not erase the corrupt evidence');
  ok([...storage.keys()].some(k => k.startsWith('kiwi:clients-quarantine:v1:')), 'raw bytes are also written to a durable quarantine key');
  ok(d.vault.status().quarantined === 1, 'status exposes the count');
  ok(d.vault.recoveryCopies(q[0].key, true) === corrupt && d.vault.recoveryCopies().length === 0, 'explicit acknowledgement removes it');
}
// A1: after localStorage refusal the status says memory-only until the vault confirms.
{
  const d = device(new Map(), fakeIDB(), false); await settle();
  const c = d.api.upsert({ name: 'Mem', phone: '0612345679' }, BOOK); await settle(); d.disk.full = true;
  d.api.recordPurchase(c.id, { amount: 5, saleId: 'm1' }, BOOK);
  ok(d.vault.status().memoryOnly.length > 0, 'refused write is memory-only right away');
  await settle();
  ok(d.vault.status().vaulted.length > 0 && d.vault.status().memoryOnly.length === 0, 'IndexedDB confirmation upgrades it to vault');
  const bad = device(new Map(), fakeIDB(new Map(), 'error'), false); await settle();
  const c2 = bad.api.upsert({ name: 'Mem2', phone: '0612345670' }, BOOK); await settle(); bad.disk.full = true;
  bad.api.recordPurchase(c2.id, { amount: 5, saleId: 'm2' }, BOOK); await settle();
  ok(bad.vault.status().memoryOnly.length > 0 && !bad.vault.status().vaulted.length, 'a failed IndexedDB write stays reported as memory-only');
}
// B0: spend is a whole number of centimes offline, before and after reconciliation.
{
  const d = device(new Map(), fakeIDB()); await settle();
  const c = d.api.upsert({ name: 'Cents', phone: '0612345671' }, BOOK);
  for (let i = 0; i < 30; i++) d.api.recordPurchase(c.id, { amount: 0.1, saleId: 'c' + i }, BOOK);
  const spend = d.api.get(c.id, BOOK).spend;
  ok(Math.round(spend * 100) === 300 && spend === 3, 'thirty purchases of 0.10 total exactly 3 (no 2.9999999999999996)');
}
// A1 (loyalty): lines beyond 100 are marked and the stamp-bearing ones are kept first.
{
  const d = device(new Map(), fakeIDB()); await settle();
  d.api.setConfig({ model: 'product', product: { item: 'Café', target: 10, reward: 'x', ids: [] } }, BOOK);
  const c = d.api.upsert({ name: 'Lines', phone: '0612345672' }, BOOK);
  const items = Array.from({ length: 120 }, (_, i) => ({ id: 'p' + i, name: i === 110 ? 'Café noir' : 'Article ' + i, qty: 1, total: 1 }));
  d.api.recordPurchase(c.id, { amount: 120, saleId: 'big', items }, BOOK); await settle();
  const ev = JSON.parse(d.storage.get(key))[0];
  ok(ev.items.length === 100 && ev.itemsDropped === 20, 'the truncation is marked with the number of lines left out');
  ok(ev.items.some(i => i.name === 'Café noir'), 'the stamp-bearing line at position 110 survives the cap');
}
console.log(`✓ clients evidence: ${checks} checks`);
