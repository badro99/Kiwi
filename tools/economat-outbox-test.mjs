import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createHotelRequestHarness, MERCHANT } from './fixtures/hotel-request-db.mjs';
const events = new Map(), memory = new Map();
globalThis.addEventListener = (name, fn) => events.set(name, fn);
globalThis.localStorage = { getItem:key => memory.get(key) || null, setItem:(key,value) => memory.set(key,value) };
Object.defineProperty(globalThis, 'navigator', { configurable:true, value:{ onLine:false } });
const api = await import('../assets/hotel-economat-api.js');
const h = await createHotelRequestHarness();
const body = id => ({ action:'create', id, unitId:'rooftop', idempotencyKey:'ui:' + id + ':create', lines:[{itemId:'cola', unit:'bouteille', qtyRequested:2}] });
const calls = [];
let loseCreate = true;
globalThis.fetch = async (url, options) => {
  const data = JSON.parse(options.body); calls.push(data);
  const response = await h.post(data);
  if (loseCreate && data.action === 'create') { loseCreate = false; throw Error('lost-response'); }
  return response;
};
await api.enqueueRequest(body('offline-a'), MERCHANT);
await api.replay(MERCHANT);
assert.equal(calls.length, 0);
assert.equal((await api.snapshot(MERCHANT))[0].state, 'pending');
assert.equal(JSON.parse(memory.get('kiwi:economat:outbox:' + MERCHANT))[0].body.idempotencyKey, 'ui:offline-a:create');
assert.deepEqual(await api.snapshot('another-merchant'), []);
// Owner ruling docs/decisions/2026-11-04-owner-delegated.md:21: durable replay on reconnect.
navigator.onLine = true;
events.get('online')();
await api.replay(MERCHANT);
assert.equal((await api.snapshot(MERCHANT))[0].state, 'pending');
assert.ok((await api.snapshot(MERCHANT))[0].next > Date.now(), 'network error backs off');
await api.replay(MERCHANT, true);
assert.equal((await api.snapshot(MERCHANT))[0].state, 'sent');
assert.deepEqual(calls.map(c => c.action), ['create','create','submit']);
assert.equal(calls[0].idempotencyKey, calls[1].idempotencyKey);
assert.equal(h.one('SELECT COUNT(*) AS n FROM hotel_internal_requests').n, 1);
const submitted = calls[2];
assert.equal((await (await h.post(submitted)).json()).replayed, true, 'duplicate submit replays');
assert.equal(h.one('SELECT COUNT(*) AS n FROM hotel_internal_requests').n, 1);
assert.equal(h.one('SELECT COUNT(*) AS n FROM hotel_internal_request_events').n, 2);
// Reload the real module with the same durable storage, no in-memory queue.
const fresh = await import('../assets/hotel-economat-outbox.js?reload-test');
assert.equal((await fresh.snapshot(MERCHANT))[0].state, 'sent');
navigator.onLine = false;
await api.enqueueRequest(body('refused'), MERCHANT);
await api.enqueueRequest(body('after-refusal'), MERCHANT);
await api.replay(MERCHANT);
globalThis.fetch = async () => ({ ok:false, status:403, json:async()=>({error:'unit-forbidden'}) });
navigator.onLine = true;
await api.replay(MERCHANT, true);
const refused = await api.snapshot(MERCHANT);
assert.equal(refused[1].state, 'refused');
assert.equal(refused[1].error, 'unit-forbidden');
assert.equal(refused[2].state, 'pending', 'refusal stops later requests');
const before = JSON.stringify(refused);
await api.replay(MERCHANT, true);
assert.equal(JSON.stringify(await api.snapshot(MERCHANT)), before);
// Removing the refused request lets the one behind it go out.
globalThis.fetch = async (url, options) => h.post(JSON.parse(options.body));
await api.discard(MERCHANT, 'ui:refused:create');
const unblocked = await api.snapshot(MERCHANT);
assert.ok(!unblocked.some(row => row.body.id === 'refused'), 'discard removes the refused request');
assert.equal(unblocked.find(row => row.body.id === 'after-refusal').state, 'sent', 'the next request is sent after the discard');
// A row queued under one account never replays under another one.
memory.set('kiwiAccountKey', 'reception@hotel.test');
await api.enqueueRequest(body('other-account'), MERCHANT);
memory.set('kiwiAccountKey', 'night@hotel.test');
await api.replay(MERCHANT, true);
assert.equal((await api.snapshot(MERCHANT)).find(row => row.body.id === 'other-account').state, 'pending', 'another account does not send it');
memory.set('kiwiAccountKey', 'reception@hotel.test');
await api.replay(MERCHANT, true);
assert.equal((await api.snapshot(MERCHANT)).find(row => row.body.id === 'other-account').state, 'sent', 'its own account sends it');
memory.delete('kiwiAccountKey');
// r19 economat#A0: 401 (session expired), 408 and 429 are transient, never a refusal.
for (const status of [401, 408, 429]) {
  navigator.onLine = true;
  globalThis.fetch = async () => ({ ok:false, status, json:async()=>({error:'transient-' + status}) });
  await api.enqueueRequest(body('transient-' + status), MERCHANT);
  await api.replay(MERCHANT, true);
  const row = (await api.snapshot(MERCHANT)).find(r => r.body.id === 'transient-' + status);
  assert.equal(row.state, 'pending', status + ' keeps the request queued, not refused');
  assert.ok(row.next > Date.now(), status + ' backs off');
  globalThis.fetch = async (url, options) => h.post(JSON.parse(options.body));
  await api.replay(MERCHANT, true);
  assert.equal((await api.snapshot(MERCHANT)).find(r => r.body.id === 'transient-' + status).state, 'sent', status + ' goes out once the service answers, without retyping');
}
// Only the five latest sent rows stay; the server list carries the rest.
for (const id of ['p1','p2','p3','p4','p5']) await api.enqueueRequest(body(id), MERCHANT);
await api.replay(MERCHANT, true);
const pruned = await api.snapshot(MERCHANT);
assert.equal(pruned.length, 5, 'sent rows are pruned to five');
assert.deepEqual(pruned.map(row => row.body.id), ['p1','p2','p3','p4','p5']);
// r21 economat#B1 (owner rule: money and stock owed are never silently dropped): a merchant switch no longer
// drops the outbox database; pending rows stay parked for their account. Behaviour: tools/economat-parked-outbox-test.mjs.
{
  const dropped = [], kept = new Map([['kiwi:economat:outbox:' + MERCHANT, '[]']]), purgeWindow = { indexedDB:{ deleteDatabase:name => dropped.push(name) } };
  vm.runInNewContext(fs.readFileSync('assets/tenant-purge.js', 'utf8'), { window:purgeWindow, localStorage:{ get length() { return kept.size; }, key:i => [...kept.keys()][i] ?? null, getItem:k => kept.get(k) ?? null, setItem:(k, v) => kept.set(k, v), removeItem:k => kept.delete(k) } });
  purgeWindow.KiwiTenantPurge.purge();
  assert.ok(!dropped.includes('kiwi-economat-outbox'), 'a merchant switch keeps the outbox database');
  assert.ok(kept.has('kiwi:economat:outbox:' + MERCHANT), 'and its parked rows');
}
// Cached catalogues are available after a reload/offline; 4xx never returns cached data.
const url = '/api/inventory/department-catalogue?merchant=cache-hotel&unitId=roof';
globalThis.fetch = async () => ({ok:true,json:async()=>({data:{items:[{itemId:'cola'}]}})});
await api.getJson(url);
globalThis.fetch = async () => { throw Error('offline'); };
assert.equal((await api.getJson(url)).data.items[0].itemId,'cola');
globalThis.fetch = async () => ({ok:false,status:403,json:async()=>({error:'forbidden'})});
await assert.rejects(api.getJson(url), e => e.status === 403);
// Real screen renders all three states through its own FR/EN/AR language layer.
const source = fs.readFileSync('assets/hotel-economat-requests.js','utf8');
for (const [lang, labels] of Object.entries({fr:['En attente de connexion','Envoyée','Refusée'],en:['Pending connection','Sent','Refused'],ar:['في انتظار الاتصال','مُرسل','مرفوض']})) {
  const window = { Kiwi:{handlers:{}}, KiwiInventory:{merchant:()=>MERCHANT}, KiwiI18n:{getLang:()=>lang} };
  const host = {isConnected:true,innerHTML:''};
  const modified = source.replace(/\}\(function \(\) \{ return import\('\.\/hotel-economat-api\.js\?v=\d+'\); \}\)\);/, '}(async function () { return testApi; }));');
  assert.notEqual(modified, source);
  const testApi = {snapshot:async()=>[...refused, {body:body('pending'),state:'pending'}],subscribe:()=>{},replay:async()=>{},getJson:async()=>{throw Error('offline');}};
  new vm.Script(modified).runInNewContext({window,document:{querySelector:()=>host},testApi});
  await window.KiwiEconomatRequests.reload();
  labels.forEach(label => assert.ok(host.innerHTML.includes(label), lang + ': ' + label));
  assert.ok(host.innerHTML.includes('unit-forbidden'));
}
console.log('PASS durable economat outbox: offline/reconnect, lost-response duplicate on real server, merchant isolation, reload, refusal, cached catalogue, FR/EN/AR states');
// Exercise the IndexedDB transaction path with denied localStorage. This adapter
// implements async open/upgrade/get/put/commit, leaving queue logic unmocked.
const buckets = new Map();
let writes = 0, attempts = 0, allowSend = false;
const db = {
  createObjectStore(name) { assert.equal(name, 'merchants'); },
  transaction(name, mode) {
    assert.equal(name,'merchants');
    const tx = {objectStore:()=>({
      get(key) { const r = {result:structuredClone(buckets.get(key))}; tx.read = true; queueMicrotask(()=>{ r.onsuccess?.(); queueMicrotask(()=>tx.oncomplete()); }); return r; },
      put(value,key) { assert.equal(mode,'readwrite'); writes++; buckets.set(key,structuredClone(value)); if (!tx.read) queueMicrotask(()=>tx.oncomplete()); return {}; },
    })};
    return tx;
  },
};
const context = vm.createContext({
  indexedDB:{open(name,version) { assert.equal(name,'kiwi-economat-outbox'); assert.equal(version,1); const r={result:db}; queueMicrotask(()=>{r.onupgradeneeded();r.onsuccess();}); return r; }},
  localStorage:{getItem(){throw Error('denied');},setItem(){throw Error('denied');}},
  navigator:{onLine:false}, setTimeout, clearTimeout,
  post:async body=>{ attempts++; if(!allowSend) throw Object.assign(Error('server-busy'),{status:503}); return {request:{revision:1}}; },
});
vm.runInContext(['store','outbox'].map(n=>fs.readFileSync('assets/hotel-economat-'+n+'.js','utf8').replace(/^import .*;$/gm,'').replace(/^export /gm,'')).join('\n'),context);
await context.enqueueRequest(body('idb-first'),'idb-hotel');
await context.enqueueRequest(body('idb-second'),'idb-hotel');
await context.replay('idb-hotel');
assert.equal(writes,2);
assert.equal(attempts,0);
context.navigator.onLine = true;
await context.replay('idb-hotel',true);
assert.equal(attempts,1,'5xx stops ordered replay and backs off');
let idbRows = await context.snapshot('idb-hotel');
assert.equal(idbRows[0].attempts,1);
assert.equal(idbRows[1].attempts,0);
await context.replay('idb-hotel');
assert.equal(attempts,1,'backoff prevents immediate retry');
allowSend = true;
await context.replay('idb-hotel',true);
assert.ok((await context.snapshot('idb-hotel')).every(row=>row.state==='sent'));
assert.equal(attempts,5,'both create and submit replay in order');
console.log('PASS IndexedDB persistence with localStorage denied, ordered 5xx retry and backoff');
