#!/usr/bin/env node
/* A client attached to a new takeaway follows it to the board
   (assets/caisse-accounting/sale-client.js, carry()).
 *
 * Before: « Envoyer en cuisine » turned the note into board order N, the
 * attach stayed keyed to the new note, and reopening N to take payment showed
 * no client: no points, no reward (partner, 27 Oct 2026). The part runs in a
 * vm against stubs of the till's shared globals. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = fs.readFileSync(path.join(root, 'assets/caisse-accounting/sale-client.js'), 'utf8');

function till() {
  const el = () => ({ hidden: false, textContent: '', classList: { add() {}, remove() {} }, focus() {} });
  const els = { '#rp-client': el(), '#rp-client-label': el(), '#rp-client-clear': el() };
  const calls = { purchases: [], rekey: [] };
  const listeners = [];
  const document = { querySelector: () => null, getElementById: (id) => (id === 'rp-client' ? clientBtn : null) };
  const clientBtn = { addEventListener: (t, fn) => listeners.push(fn) };
  const ctx = {
    console, setTimeout, document,
    mode: 'vrap', vrapEditingNum: null, selectedId: null, saleClient: null, kdsOrders: [],
    storeIsReal: () => true,
    $: (s) => els[s] || el(),
    toast() {},
    clientModal: { classList: { remove() {} } },
    KiwiCaisseLang: { tr: (s) => s },
    KiwiClients: { bookId: () => 'b', get: () => null, loyaltyOn: () => false,
      recordPurchase: (id, o) => { calls.purchases.push([id, o.amount]); return null; } },
    KiwiSaleReward: { sync() {}, paint() {}, settle() {}, rekey: (a, b) => calls.rekey.push([a, b]) },
  };
  ctx.window = ctx; ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(SRC + '\nthis.__api = { attachClient, renderSaleClient, creditSaleToClient }; hookClientBook();', ctx);
  /* A tap on the shipped « × »: the capture listener, then the till's own handler. */
  const clearTap = () => { listeners.forEach((fn) => fn({ target: { closest: (s) => (s === '#rp-client-clear' ? {} : null) } })); ctx.saleClient = null; ctx.__api.renderSaleClient(); };
  return { ctx, els, calls, api: ctx.__api, SC: ctx.KiwiCaisseSaleClient, clearTap };
}
let n = 0;
const test = (name, fn) => { fn(); n++; console.log('  ✓ ' + name); };
const rec = { id: 'c1', name: 'Test Kiwi' };

test('sent to the kitchen, reopened from the board: the client is back on the note', () => {
  const t = till();
  t.api.attachClient(rec);
  const order = { num: 53, paid: false };
  t.ctx.kdsOrders.push(order);
  t.SC.carry(order);
  assert.deepEqual(JSON.parse(JSON.stringify(order.client)), { id: 'c1', name: 'Test Kiwi' });
  assert.deepEqual(t.calls.rekey, [['vrap:new', 'vrap:53']]);
  /* The counter goes back to a fresh note: no client there. */
  t.api.renderSaleClient();
  assert.equal(t.ctx.saleClient, null);
  t.ctx.vrapEditingNum = 53;
  t.api.renderSaleClient();
  assert.equal(t.ctx.saleClient.id, 'c1');
  assert.equal(t.SC.current(), 'c1');
});

test('paying the order credits the client once and lets the order go', () => {
  const t = till();
  t.api.attachClient(rec);
  const order = { num: 7, paid: false };
  t.ctx.kdsOrders.push(order);
  t.SC.carry(order);
  t.ctx.vrapEditingNum = 7;
  t.api.renderSaleClient();
  t.api.creditSaleToClient({ amount: 81, method: 'cash', ref: 'r', id: 's1', time: new Date(), lines: [] });
  assert.deepEqual(t.calls.purchases, [['c1', 81]]);
  assert.equal(order.client, undefined);
  t.api.renderSaleClient();
  assert.equal(t.ctx.saleClient, null);
});

test('taking the client off a board order keeps it off', () => {
  const t = till();
  const order = { num: 9, paid: false, client: { id: 'c1', name: 'Test Kiwi' } };
  t.ctx.kdsOrders.push(order);
  t.ctx.vrapEditingNum = 9;
  t.api.renderSaleClient();
  assert.equal(t.ctx.saleClient.id, 'c1');
  t.SC.detach();
  assert.equal(order.client, undefined);
  assert.equal(t.ctx.saleClient, null);
  /* The same with the shipped « × » on the client button. */
  order.client = { id: 'c1', name: 'Test Kiwi' };
  t.api.renderSaleClient();
  assert.equal(t.ctx.saleClient.id, 'c1');
  t.clearTap();
  assert.equal(order.client, undefined);
  assert.equal(t.ctx.saleClient, null);
});

test('a client attached on a reopened order is the one it keeps', () => {
  const t = till();
  const order = { num: 4, paid: false };
  t.ctx.kdsOrders.push(order);
  t.ctx.vrapEditingNum = 4;
  t.api.attachClient({ id: 'c2', name: 'Autre' });
  assert.equal(order.client.id, 'c2');
});

test('a table note is never carried, a paid order never brings its client back', () => {
  const t = till();
  t.ctx.mode = 'salle'; t.ctx.selectedId = 'T4';
  t.api.attachClient(rec);
  const order = { num: 3, paid: false };
  t.SC.carry(order);
  assert.equal(order.client, undefined);
  const u = till();
  u.ctx.kdsOrders.push({ num: 5, paid: true, client: { id: 'c1', name: 'x' } });
  u.ctx.vrapEditingNum = 5;
  u.api.renderSaleClient();
  assert.equal(u.ctx.saleClient, null);
});

console.log(`caisse-sale-client-carry: ${n} cases`);
