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

/* The server pays only what the visit's receipts covered. When it answers that
   money is still owed, the till names the table and the amount, once. */
const toasts = [];
const stack = { appendChild(el) { toasts.push(el.textContent); } };
function owedInstance(answer) {
  const state = { sessions: [{ id: 'visit-owed', table: '4' }], since: 1,
    orders: { a: { session: 'visit-owed', table: 'Table 4', mode: 'table' } } };
  const context = vm.createContext({
    state, Promise, setTimeout: () => 0, navigator: { onLine: true }, window: { KiwiOffline: offline, dispatchEvent() {} },
    merchant: () => 'fixture', CustomEvent: class {},
    document: { getElementById: id => (id === 'toast-stack' ? stack : null),
      createElement: () => ({ className: '', textContent: '', classList: { add() {} }, remove() {} }) },
    fetch: async () => ({ ok: true, json: async () => answer }),
    pull: async () => { state.sessions = []; return 0; },
  });
  vm.runInContext(closeCode, context);
  return context;
}
const owed = owedInstance({ ok: true, closed: 1, owedCents: 5250, owedOrders: 1 });
owed.closeSession({ session: 'visit-owed', why: 'settle' });
await new Promise(resolve => setTimeout(resolve, 20));
assert.equal(rows.size, 0, 'an owed answer still acknowledges the close');
assert.deepEqual(toasts, ['Table 4 · 52,50 MAD restent dus : une commande est arrivée après l’addition']);
owed.warnOwed({ closeSession: 'visit-owed' }, { owedCents: 5250 });
assert.equal(toasts.length, 1, 'a replayed close does not repeat the warning');
const settled = owedInstance({ ok: true, closed: 1 });
settled.closeSession({ session: 'visit-paid', why: 'settle' });
await new Promise(resolve => setTimeout(resolve, 20));
assert.equal(toasts.length, 1, 'a fully paid visit says nothing');
console.log('✓ a close the server answers with money still owed names the table and the amount, once');
