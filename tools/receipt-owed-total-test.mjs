#!/usr/bin/env node
/* « Total dû » sous le nom de la cliente, sur le reçu boutique et maison
 * (propriétaire, 23 nov. 2026). Une cliente qui doit de l'argent (avance,
 * compte client) voit, sous son nom en haut du ticket, le total de TOUT ce
 * qu'elle doit, toutes notes confondues. Rien quand elle ne doit rien.
 * Vrais retail-balances.js et receipt.js en vm. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { deadlineVmSource, deadlineVmContext } from './deadline-vm-source.mjs';

let n = 0;
const ok = async (name, fn) => { await fn(); n++; console.log('  ✓ ' + name); };

/* ── retail-balances.js : le total d'une cliente ── */
const SRC = fs.readFileSync('assets/retail-balances.js', 'utf8');
const note = (id, customerId, totalCents, paidCents) => ({ id, customerId, ticketRef: 'T-' + id, totalCents, paidCents, pendingCents: 0, receipts: [] });
function boot(local, fetch) {
  const memory = new Map([['kiwi:retailBalances:shop', JSON.stringify(local)]]);
  const window = {};
  vm.runInNewContext(deadlineVmSource(SRC), deadlineVmContext({
    window, localStorage: { getItem: k => (memory.has(k) ? memory.get(k) : null), setItem: (k, v) => memory.set(k, String(v)) },
    navigator: { onLine: true }, Date, JSON, Math, Number, String, Array, Map, Set, Object, Promise,
    setTimeout, clearTimeout, fetch: fetch || (async () => { throw new Error('offline'); }),
  }));
  return window.KiwiRetailBalances;
}
const clients = { c1: { id: 'c1', name: 'Cliente Une', phone: '0600000001' }, c2: { id: 'c2', name: 'Cliente Deux', phone: '0600000002' } };
const d = { merchant: 'shop', clById: id => clients[id] || null };

await ok('journal seul : les notes de la cliente s’additionnent, pas celles des autres', () => {
  const R = boot([note('a', 'c1', 50000, 20000), note('b', 'c1', 12000, 0), note('c', 'c2', 9000, 0)]);
  assert.equal(R.owedBy('shop', 'c1'), 42000);
  const c = R.receiptCustomer({ customerId: 'c1', customer: { name: 'Cliente Une', phone: '0600000001', points: 4 } }, d);
  assert.equal(c.owed, 420); assert.equal(c.points, 4, 'le reste du bloc client est gardé');
});
await ok('rien quand elle ne doit rien (note soldée, autre cliente, aucune note)', () => {
  const R = boot([note('a', 'c1', 50000, 50000), note('c', 'c2', 9000, 0)]);
  const base = { name: 'Cliente Une', phone: '0600000001' };
  assert.equal(R.receiptCustomer({ customerId: 'c1', customer: base }, d), base);
  assert.equal(R.receiptCustomer({ customer: null }, d), null, 'cliente de passage');
});
await ok('serveur + journal : la note d’une autre caisse compte, une note vue deux fois prend son plus petit reste', async () => {
  const R = boot([note('a', 'c1', 50000, 30000)], async () => ({ ok: true, json: async () => ({ balances: [note('a', 'c1', 50000, 20000), note('x', 'c1', 7000, 0)] }) }));
  await R.listWithStatus('shop', '');
  assert.equal(R.owedBy('shop', 'c1'), 20000 + 7000);
});
await ok('une note que le serveur dit terminée ne compte plus', async () => {
  const R = boot([note('a', 'c1', 50000, 0), note('b', 'c1', 3000, 0)], async () => ({ ok: true, json: async () => ({ balances: [note('b', 'c1', 3000, 0)], settled: ['a'] }) }));
  await R.listWithStatus('shop', '');
  assert.equal(R.owedBy('shop', 'c1'), 3000);
});
await ok('ticket sans cliente affichée (différence d’échange) : la cliente qui doit y apparaît', () => {
  const R = boot([note('a', 'c1', 10000, 0)]);
  const c = R.receiptCustomer({ customerId: 'c1', customer: null }, d);
  assert.deepEqual({ name: c.name, owed: c.owed }, { name: 'Cliente Une', owed: 100 });
});

/* ── receipt.js : la ligne sous le nom ── */
const storage = new Map();
const document = { readyState: 'loading', addEventListener() {}, getElementById() { return null; }, createElement() { return {}; } };
const win = { document };
const ctx = vm.createContext({
  window: win, document, console,
  localStorage: { getItem(k) { return storage.get(k) || null; }, setItem(k, v) { storage.set(k, String(v)); }, key() { return null; }, length: 0 },
  sessionStorage: { getItem() { return null; }, setItem() {} },
  setTimeout() { return 0; }, clearTimeout() {}, Uint8Array, Uint8ClampedArray, Promise, Date, TextEncoder,
});
vm.runInContext(fs.readFileSync('assets/escpos.js', 'utf8'), ctx);
vm.runInContext(fs.readFileSync('assets/receipt.js', 'utf8'), ctx);
const K = win.KiwiReceipt;
const sale = (customer) => ({ ref: '40012', lines: [{ qty: 1, name: 'Caftan', total: 1200 }], total: 1200, pay: [{ label: 'espèces', amount: 1200 }], customer });

await ok('le reçu imprime « Total dû » juste sous le nom, en HTML et sur la thermique', () => {
  const doc = K.build(sale({ name: 'Cliente Une', phone: '0600000001', owed: 420 }));
  assert.equal(doc.customer.owed, 420);
  const h = K.html(doc);
  const iName = h.indexOf('Cliente Une'), iOwed = h.indexOf('Total dû');
  assert.ok(iName > 0 && iOwed > iName, 'Total dû après le nom');
  assert.ok(iOwed < h.indexOf('Caftan'), 'en haut du ticket, avant les articles');
  assert.match(h.slice(iOwed, iOwed + 200), /420/);
  const bytes = K.escpos(doc);
  const s = Buffer.from(bytes).toString('latin1');
  assert.ok(s.indexOf('Total d') > s.indexOf('Cliente Une'), 'thermique : sous le nom');
});
await ok('aucune ligne « Total dû » quand la cliente ne doit rien', () => {
  const h = K.html(K.build(sale({ name: 'Cliente Une', phone: '0600000001' })));
  assert.ok(h.includes('Cliente Une')); assert.ok(!h.includes('Total dû'));
  assert.ok(!K.html(K.build(sale({ name: 'Cliente Une', owed: -5 }))).includes('Total dû'));
});

console.log(`receipt-owed-total-test: ${n} ok`);
