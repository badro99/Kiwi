// r21 economat B0/B1/B2: an IndexedDB timeout never hides older queued requests, a merchant switch
// parks the pending requests for their own account instead of deleting them, and a transaction that
// commits after its deadline neither duplicates nor resurrects a request.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const flat = file => fs.readFileSync(file, 'utf8').replace(/^import .*;$/gm, '').replace(/^export /gm, '');
const source = flat('assets/hotel-economat-store.js') + '\n' + flat('assets/hotel-economat-outbox.js');
const body = id => ({ action:'create', id, unitId:'rooftop', idempotencyKey:'ui:' + id + ':create', lines:[{ itemId:'cola', unit:'bouteille', qtyRequested:2 }] });
const within = (promise, ms, what) => Promise.race([promise, new Promise((_, no) => setTimeout(() => no(Error('HANG: ' + what)), ms))]);
const KEY = 'kiwi:economat:outbox:hotel-x';

function localStore(map) {
  return { get length() { return map.size; }, key:i => [...map.keys()][i] ?? null,
    getItem:key => map.has(key) ? map.get(key) : null, setItem:(key, value) => map.set(key, String(value)), removeItem:key => map.delete(key) };
}
// A tiny IndexedDB with shared buckets. `late`: the write lands at once but the transaction reports
// completion only after the deadline, as a slow disk does.
function idbFor(buckets, mode) {
  return { open() {
    const r = {};
    if (mode === 'hang-open') return r;
    queueMicrotask(() => {
      r.result = { createObjectStore(){}, transaction() {
        const tx = { objectStore: () => ({
          get(key) { const q = { result:buckets.has(key) ? JSON.parse(buckets.get(key)) : undefined }; tx.read = true;
            queueMicrotask(() => { if (mode === 'hang-tx') return; q.onsuccess?.(); if (mode === 'late') setTimeout(() => tx.oncomplete(), 300); else queueMicrotask(() => tx.oncomplete()); }); return q; },
          put(value, key) { buckets.set(key, JSON.stringify(value)); if (!tx.read && mode !== 'hang-tx') queueMicrotask(() => tx.oncomplete()); return {}; },
        }) };
        return tx;
      } };
      r.onupgradeneeded?.(); r.onsuccess();
    });
    return r;
  } };
}
function tab({ ls, buckets, mode = 'ok', online = true, sent = [] }) {
  const context = vm.createContext({ indexedDB:idbFor(buckets, mode), localStorage:localStore(ls), navigator:{ onLine:online }, setTimeout, clearTimeout,
    post:async b => { sent.push(b.idempotencyKey); return { request:{ revision:1 }, ok:true }; } });
  vm.runInContext(source, context);
  vm.runInContext('storage.deadline = 40', context);
  return context;
}

// B0: a request queued in IndexedDB, then a storage timeout that falls back to localStorage, then a reload.
{
  const ls = new Map(), buckets = new Map();
  const first = tab({ ls, buckets, online:false });
  await within(first.enqueueRequest(body('first'), 'hotel-x'), 2000, 'seed');
  assert.equal(ls.has(KEY), false, 'the seed lives in IndexedDB');
  const hung = tab({ ls, buckets, mode:'hang-tx', online:false });
  await within(hung.enqueueRequest(body('second'), 'hotel-x'), 2000, 'fallback enqueue');
  assert.ok(ls.has(KEY), 'the storage timeout fell back to localStorage');
  const sent = [];
  const reloaded = tab({ ls, buckets, sent });
  const view = await within(reloaded.snapshot('hotel-x'), 2000, 'snapshot');
  assert.deepEqual(view.map(row => row.body.id), ['first', 'second'], 'the older IndexedDB request is still visible next to the local bucket');
  await within(reloaded.replay('hotel-x', true), 2000, 'replay');
  assert.deepEqual(sent, ['ui:first:create', 'ui:first:submit:r1', 'ui:second:create', 'ui:second:submit:r1'], 'both go out, oldest first');
  assert.deepEqual((await reloaded.snapshot('hotel-x')).map(row => row.state), ['sent', 'sent']);
  assert.deepEqual(JSON.parse(buckets.get(KEY)), [], 'IndexedDB is drained once the local bucket owns the rows');
  assert.equal(JSON.parse(ls.get(KEY)).length, 2, 'and nothing was lost on the way');
}

// B2: a transaction that commits after its deadline must not duplicate the request or bring a sent one back.
{
  const ls = new Map(), buckets = new Map(), sent = [];
  const slow = tab({ ls, buckets, mode:'late', online:false, sent });
  await within(slow.enqueueRequest(body('late'), 'hotel-x'), 2000, 'late enqueue');
  await new Promise(resolve => setTimeout(resolve, 400));
  assert.equal(JSON.parse(buckets.get(KEY)).length, 1, 'the late commit really landed in IndexedDB');
  const reloaded = tab({ ls, buckets, sent });
  assert.deepEqual((await reloaded.snapshot('hotel-x')).map(row => row.body.id), ['late'], 'one request, not two');
  await within(reloaded.replay('hotel-x', true), 2000, 'replay');
  assert.deepEqual((await reloaded.snapshot('hotel-x')).map(row => row.state), ['sent']);
  await within(reloaded.replay('hotel-x', true), 2000, 'second replay');
  const again = tab({ ls, buckets, sent });
  assert.deepEqual((await again.snapshot('hotel-x')).map(row => row.state), ['sent'], 'a stale pending copy in IndexedDB does not bring it back');
  assert.equal(sent.filter(key => key.endsWith(':create')).length, 1, 'the create went out once');
}

// B1: a merchant switch parks the pending request for its own account.
{
  const ls = new Map(), buckets = new Map(), sent = [];
  ls.set('kiwiAccountKey', 'night@hotel.test');
  const night = tab({ ls, buckets, mode:'hang-open', online:false, sent });
  await within(night.enqueueRequest(body('owed'), 'hotel-x'), 2000, 'enqueue as night');
  ls.set('kiwi:economat:outbox:cache:night|staff|/api/x?merchant=hotel-x', '{"value":{},"at":1}');
  ls.set('kiwiSales:scoped@hotel-x', '[]');
  const dropped = [], win = { indexedDB:{ deleteDatabase:name => dropped.push(name) } };
  vm.runInNewContext(fs.readFileSync('assets/tenant-purge.js', 'utf8'), { window:win, localStorage:localStore(ls) });
  win.KiwiTenantPurge.purge();
  assert.ok(ls.has(KEY), 'the pending request survives the purge');
  assert.ok(!ls.has('kiwiSales:scoped@hotel-x'), 'tenant data still goes');
  assert.ok(![...ls.keys()].some(key => key.startsWith('kiwi:economat:outbox:cache:')), 'the read cache goes');
  assert.ok(!dropped.includes('kiwi-economat-outbox'), 'the outbox database is not deleted');
  ls.set('kiwiAccountKey', 'day@other.test');
  const day = tab({ ls, buckets, mode:'hang-open', sent });
  await within(day.replay('hotel-x', true), 2000, 'replay as day');
  assert.deepEqual(sent, [], 'another account never sends it');
  ls.set('kiwiAccountKey', 'night@hotel.test');
  const back = tab({ ls, buckets, mode:'hang-open', sent });
  await within(back.replay('hotel-x', true), 2000, 'replay as night');
  assert.equal(sent[0], 'ui:owed:create', 'the owning account sends it when it returns');
  assert.equal((await back.snapshot('hotel-x'))[0].state, 'sent');
}
console.log('PASS economat parked outbox: IndexedDB debt stays visible, late commits do not duplicate, purge parks rows for their account');
