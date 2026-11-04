import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source = fs.readFileSync('assets/menu-catalog/state.js', 'utf8');
const start = source.indexOf('  function pull()'), end = source.indexOf('  /* ───────────────── boot', start);
const timers = new Map(), events = {}, nodes = new Map(), disk = new Map();
let timerId = 0, fail = true, conflict = false, posts = 0, data = { cats: [{ id: 'cat' }], items: [{ id: 'pending-edit' }] };
const cloud = { read: true, base: {}, updatedTs: 1 };
const document = { body: { appendChild(el) { nodes.set(el.id, el); } }, getElementById: id => nodes.get(id), createElement: () => ({ style: {}, setAttribute() {}, remove() { nodes.delete(this.id); } }) };
const venue = { id: 'shop' };
const window = { addEventListener: (name, fn) => { events[name] = fn; }, KiwiVenue: { getVenueData: () => venue, getCurrentVenueData: () => venue } };
vm.runInNewContext(source.slice(start, end) + '\nwindow.publish = publish; window.schedulePublish = schedulePublish; window.reopen = function () { pendingPublishes.clear(); return pull(); };', { window, document, Map, Promise,
  localStorage: { getItem: key => disk.get(key), setItem: (key,value) => disk.set(key,value), removeItem: key => disk.delete(key) },
  isBoutiqueForRead: () => false, recoverLocalMenu() {}, isCustom: () => false, adoptServerMenu: value => { data = value; },
  isRealSession: () => true, isBoutiqueVenue: () => false, storeSlug: () => 'shop', cloudFor: () => cloud,
  store: { get: () => data }, menuSnapshot: value => JSON.parse(JSON.stringify(value)),
  tr: words => words.en, syncSay: (_, en) => en,
  setTimeout: (fn, delay) => { const id = ++timerId; timers.set(id, { fn, delay }); return id; }, clearTimeout: id => timers.delete(id),
  fetch: async (_, options) => { if (!options.method) return { ok: true, json: async () => ({ merchant: 'shop', updatedTs: 2, menu: { cats: [{ id: 'remote-cat' }], items: [] } }) }; posts++; assert.equal(JSON.parse(options.body).data.items[0].id, 'pending-edit'); if (conflict) return { ok: false, status: 409, json: async () => ({ error: 'foreign-document', data: { cats: [], items: [] }, updatedTs: 99 }) }; if (fail) throw new Error('offline'); return { ok: true, json: async () => ({ ok: true, updatedTs: 2 }) }; },
});
const settle = () => new Promise(resolve => setImmediate(resolve));
window.publish('shop'); await settle();
assert.ok(nodes.has('menu-publish-pending'), 'failed publish remains visibly pending');
assert.equal(nodes.get('menu-publish-pending').textContent, 'Publication pending');
assert.equal(data.items[0].id, 'pending-edit');
assert.equal(JSON.parse(disk.get('kiwiMenuPending:shop')).data.items[0].id, 'pending-edit', 'pending snapshot is durable and tenant-scoped');
let delays = [];
for (let n = 0; n < 12; n++) { const [id, timer] = timers.entries().next().value; timers.delete(id); delays.push(timer.delay); timer.fn(); await settle(); }
assert.equal(delays[0], 1000); assert.equal(delays.at(-1), 300000);
assert.ok(posts > 1, 'timer retries failed publications');
timers.clear(); cloud.read = false;
await window.reopen(); await settle();
assert.equal(data.items[0].id, 'pending-edit', 'boot merges pending edit instead of dropping it during server hydration');
assert.ok(data.cats.some(cat => cat.id === 'remote-cat'), 'boot retains independent server edits');
fail = false; events.online(); await settle();
assert.equal(nodes.size, 0, 'only server acknowledgement clears visible pending status');
assert.equal(timers.size, 0, 'acknowledgement cancels retries');
assert.equal(disk.size, 0, 'only server acknowledgement removes durable pending edit');
console.log('PASS pending menu retained, online retry and capped exponential backoff');

conflict = true; window.publish('shop'); await settle();
assert.deepEqual(data, { cats: [], items: [] }, 'a carte refused as another establishment\'s is replaced by the server carte');
assert.equal(cloud.updatedTs, 99, 'the adopted server carte carries its own revision');
assert.ok(!nodes.has('menu-publish-pending') && !disk.has('kiwiMenuPending:shop'), 'the refused copy is not kept for retry');
data = { cats: [{ id: 'cat' }], items: [{ id: 'pending-edit' }] }; cloud.updatedTs = 2;

conflict = false; window.publish('shop'); data.items[0].name = 'edited-before-ack'; window.schedulePublish('shop'); await settle();
assert.ok(nodes.has('menu-publish-pending'), 'an older acknowledgement cannot clear a newer edit');
assert.equal(JSON.parse(disk.get('kiwiMenuPending:shop')).data.items[0].name, 'edited-before-ack', 'edit is durable before the debounce timer');
