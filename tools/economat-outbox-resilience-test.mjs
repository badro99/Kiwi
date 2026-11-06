// r20 economat: the offline outbox never hangs on storage, says when a cached read is stale,
// scopes cached reads to the account and role, and never loses a row to a competing tab.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source = fs.readFileSync('assets/hotel-economat-outbox.js', 'utf8').replace(/^import .*;$/gm, '').replace(/^export /gm, '');
const body = id => ({ action:'create', id, unitId:'rooftop', idempotencyKey:'ui:' + id + ':create', lines:[{ itemId:'cola', unit:'bouteille', qtyRequested:2 }] });
const within = (promise, ms, what) => Promise.race([promise, new Promise((_, no) => setTimeout(() => no(Error('HANG: ' + what)), ms))]);

function localStore(map, denied) {
  return denied ? { getItem(){ throw Error('denied'); }, setItem(){ throw Error('denied'); } }
    : { getItem:key => map.has(key) ? map.get(key) : null, setItem:(key, value) => map.set(key, String(value)) };
}
// A tiny IndexedDB: shared buckets, one microtask per request; `mode` can hang or block on purpose.
function idbFor(buckets, mode = 'ok') {
  return { open() {
    const r = {};
    if (mode === 'hang-open') return r;
    queueMicrotask(() => {
      if (mode === 'blocked') return r.onblocked();
      r.result = { createObjectStore(){}, transaction(_, access) {
        const tx = { objectStore: () => ({
          get(key) { const q = { result:buckets.has(key) ? JSON.parse(buckets.get(key)) : undefined }; tx.read = true;
            queueMicrotask(() => { if (mode === 'hang-tx') return; q.onsuccess?.(); queueMicrotask(() => tx.oncomplete()); }); return q; },
          put(value, key) { buckets.set(key, JSON.stringify(value)); if (!tx.read && mode !== 'hang-tx') queueMicrotask(() => tx.oncomplete()); return {}; },
        }) };
        return tx;
      } };
      r.onupgradeneeded?.(); r.onsuccess();
    });
    return r;
  } };
}
function tab({ ls = new Map(), buckets = new Map(), denied = false, mode = 'ok', post = async () => ({ request:{ revision:1 }, ok:true }) } = {}) {
  const context = vm.createContext({ indexedDB:idbFor(buckets, mode), localStorage:localStore(ls, denied), navigator:{ onLine:true }, setTimeout, clearTimeout, post });
  vm.runInContext(source, context);
  vm.runInContext('storage.deadline = 40', context);
  return context;
}

// A0/B0: a blocked or silent IndexedDB reaches the localStorage fallback instead of hanging.
for (const mode of ['hang-open', 'blocked', 'hang-tx']) {
  const ls = new Map(), t = tab({ ls, mode });
  await within(t.enqueueRequest(body('a-' + mode), 'hotel-x'), 2000, mode + ' enqueue');
  const rows = await within(t.snapshot('hotel-x'), 2000, mode + ' snapshot');
  assert.equal(rows.length, 1, mode + ': the request is kept');
  await within(t.replay('hotel-x', true), 2000, mode + ' replay');
  assert.equal((await t.snapshot('hotel-x'))[0].state, 'sent', mode + ': replay still completes');
  assert.ok(ls.get('kiwi:economat:outbox:hotel-x'), mode + ': rows live in the localStorage fallback');
}

// A1/B1: a read served from the cache after a network failure says so, with its age.
{
  const t = tab(), url = '/api/inventory/department-catalogue?merchant=m&unitId=u';
  const before = Date.now();
  const fresh = await t.cached(url, async () => ({ data:{ items:[1] } }));
  assert.equal(fresh._stale, undefined, 'a live read is not marked');
  const old = await t.cached(url, async () => { throw Error('offline'); });
  assert.deepEqual(old.data.items, [1]);
  assert.ok(old._stale && old._stale.at >= before, 'a cached read carries its saved time');
  await assert.rejects(t.cached('/api/x?merchant=never', async () => { throw Error('offline'); }), /offline/, 'no cache, no invented data');
}

// A2: the read cache is per account and role on a shared device.
{
  const ls = new Map(), buckets = new Map(), t = tab({ ls, buckets, denied:false }), url = '/api/inventory/internal-requests?merchant=m';
  ls.set('kiwiAccountKey', 'night@hotel.test'); ls.set('kiwiRole', 'staff');
  await t.cached(url, async () => ({ requests:['night-only'] }));
  const offline = async () => { throw Error('offline'); };
  assert.deepEqual((await t.cached(url, offline)).requests, ['night-only'], 'same account and role reads its own cache');
  ls.set('kiwiAccountKey', 'reception@hotel.test');
  await assert.rejects(t.cached(url, offline), /offline/, 'another account gets no stored projection');
  ls.set('kiwiAccountKey', 'night@hotel.test'); ls.set('kiwiRole', 'manager');
  await assert.rejects(t.cached(url, offline), /offline/, 'another role gets no stored projection');
}

// B2: two tabs without Web Locks never overwrite each other's rows (localStorage and IndexedDB).
for (const denied of [false, true]) {
  const ls = new Map(), buckets = new Map();
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const slow = tab({ ls, buckets, denied, post: async () => { await gate; return { request:{ revision:1 }, ok:true }; } });
  const other = tab({ ls, buckets, denied, post: async () => { throw Object.assign(Error('busy'), { status:503 }); } });
  other.navigator.onLine = false;
  slow.navigator.onLine = false;
  await slow.enqueueRequest(body('first'), 'hotel-y');
  slow.navigator.onLine = true;
  const running = slow.replay('hotel-y', true);
  await new Promise(resolve => setTimeout(resolve, 15));
  await other.enqueueRequest(body('second'), 'hotel-y');
  release();
  await within(running, 2000, 'slow replay');
  const ids = (await other.snapshot('hotel-y')).map(row => row.body.id);
  assert.deepEqual(ids, ['first', 'second'], (denied ? 'IndexedDB' : 'localStorage') + ': the request added by the other tab survives');
  assert.equal((await other.snapshot('hotel-y'))[0].state, 'sent', 'and the first one keeps its progress');
}

// The request screen shows the stale notice when the read came from the cache, in every language.
{
  const ui = fs.readFileSync('assets/hotel-economat-requests.js', 'utf8');
  for (const [lang, word] of [['fr', 'peut-être dépassées'], ['en', 'out of date'], ['ar', 'قديمة']]) {
    const window = { Kiwi:{ handlers:{} }, KiwiInventory:{ merchant:() => 'm' }, KiwiI18n:{ getLang:() => lang } };
    const host = { isConnected:true, innerHTML:'' };
    const patched = ui.replace(/\}\(function \(\) \{ return import\('\.\/hotel-economat-transport\.js\?v=\d+'\); \}\)\);/, '}(async function () { return api; }));');
    assert.notEqual(patched, ui);
    let stale = true;
    const api = { snapshot:async () => [], subscribe(){}, replay:async () => {}, getJson:async () => (stale ? { requests:[], _stale:{ at:Date.now() - 3600e3 } } : { requests:[] }) };
    new vm.Script(patched).runInNewContext({ window, document:{ querySelector:() => host }, api });
    await window.KiwiEconomatRequests.reload();
    assert.ok(host.innerHTML.includes(word), lang + ': stale notice shown');
    stale = false; await window.KiwiEconomatRequests.reload();
    assert.ok(!host.innerHTML.includes(word), lang + ': no notice on a live read');
  }
}
console.log('PASS economat outbox: storage deadlines, stale cached reads, account/role cache scope, competing tabs');
