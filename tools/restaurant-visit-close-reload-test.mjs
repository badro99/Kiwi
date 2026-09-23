#!/usr/bin/env node
/* A close debt survives a fresh script context and is removed only after a
   successful POST plus a server snapshot proving the visit is no longer open. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../assets/orderpro-inbox.js', import.meta.url), 'utf8');
const start = source.indexOf('  var CLOSE_CHANNEL =');
const end = source.indexOf('  /* ── attention:', start);
assert.ok(start > 0 && end > start);
const closeCode = source.slice(start, end);
const rows = new Map();
const offline = {
  enqueue(channel, tenant, payload, opts) {
    if (!rows.has(opts.id)) rows.set(opts.id, { id: opts.id, tenant, channel, payload, state: 'pending' });
    return Promise.resolve();
  },
  list(channel, tenant) { return Promise.resolve([...rows.values()].filter(r => r.channel === channel && r.tenant === tenant)); },
  claim(channel, tenant) {
    const row = [...rows.values()].find(r => r.channel === channel && r.tenant === tenant && r.state === 'pending');
    if (row) { row.state = 'sending'; row.leaseToken = 'lease'; }
    return Promise.resolve(row || null);
  },
  acknowledge(id) { rows.delete(id); return Promise.resolve(true); },
  reject(id) { rows.get(id).state = 'pending'; return Promise.resolve(true); },
};
let posts = 0;
function instance(online) {
  const state = { sessions: [{ id: 'visit-reload', table: '6' }], since: 123 };
  const context = vm.createContext({
    state, Promise, navigator: { onLine: online }, window: { KiwiOffline: offline, dispatchEvent() {} },
    merchant: () => 'fixture', document: { getElementById: () => null }, CustomEvent: class {},
    fetch: async () => { posts++; return { ok: true }; },
    pull: async () => { state.sessions = []; return 0; },
  });
  vm.runInContext(closeCode, context);
  return context;
}
const before = instance(false);
before.closeSession({ session: 'visit-reload', why: 'settle' });
await new Promise(resolve => setTimeout(resolve, 0));
assert.equal(rows.size, 1, 'offline close persisted');
assert.equal(posts, 0, 'no online send');
const after = instance(true);
after.verifyCloses();
await new Promise(resolve => setTimeout(resolve, 20));
assert.equal(posts, 1, 'new instance replayed close');
assert.equal(rows.size, 0, 'removed only after server snapshot confirmed close');
console.log('✓ restaurant visit close survives reload and is acknowledged after server proof');
