/* r21 boutiquetill#B0 : la liste des notes dit quand elle ne vient que de CET appareil (vrai retail-balances.js en vm). */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { deadlineVmSource, deadlineVmContext } from './deadline-vm-source.mjs';

const note = { id: 'n1', customerId: 'c1', ticketRef: 'T-1', totalCents: 5000, paidCents: 1000, pendingCents: 0, receipts: [] };
function boot({ online = true, fetch }) {
  const memory = new Map([['kiwi:retailBalances:shop', JSON.stringify([note])]]);
  const window = {};
  vm.runInNewContext(deadlineVmSource(fs.readFileSync('assets/retail-balances.js', 'utf8')), deadlineVmContext({
    window, localStorage: { getItem: k => (memory.has(k) ? memory.get(k) : null), setItem: (k, v) => memory.set(k, String(v)) },
    navigator: { onLine: online }, Date, JSON, Math, Number, String, Array, Map, Set, Object, Promise,
    setTimeout, clearTimeout, fetch,
  }));
  return window.KiwiRetailBalances;
}
const remoteNote = { ...note, id: 'n2', ticketRef: 'T-2' };
let r = await boot({ fetch: async () => ({ ok: true, json: async () => ({ balances: [remoteNote] }) }) }).listWithStatus('shop', '');
assert.equal(r.status, 'ok'); assert.equal(r.rows.length, 2, 'serveur lu : notes locales + distantes');
r = await boot({ fetch: async () => ({ ok: false, status: 503, json: async () => ({}) }) }).listWithStatus('shop', '');
assert.equal(r.status, 'read-failed', 'refus serveur'); assert.equal(r.rows.length, 1, 'le journal local reste lisible');
r = await boot({ fetch: async () => { throw new Error('network'); } }).listWithStatus('shop', '');
assert.equal(r.status, 'read-failed', 'panne réseau');
r = await boot({ fetch: async () => ({ ok: true, json: async () => ({ oops: 1 }) }) }).listWithStatus('shop', '');
assert.equal(r.status, 'read-failed', '200 illisible n’est pas « aucune note distante »');
r = await boot({ online: false, fetch: async () => { throw new Error('must not be called'); } }).listWithStatus('shop', '');
assert.equal(r.status, 'offline');
// list() garde sa forme pour les appelants existants.
const rows = await boot({ fetch: async () => { throw new Error('x'); } }).list('shop', '');
assert.ok(Array.isArray(rows) && rows.length === 1);
console.log('PASS retail balances: stale/read-failed/offline status, local journal still listed');
