/* Actual openPay cash and split commits, with no optional translation layer. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { world } = require('./retail-money-harness.cjs');
const source = fs.readFileSync(process.env.KIWI_CHECKOUT_SOURCE || 'assets/pos-boutique/checkout.js', 'utf8');
const begin = source.indexOf('  function openPay('), end = source.indexOf('  /* ═══════════════════════ OFFLINE', begin);
for (const broken of [undefined, {}, { say() { throw Error('broken copy layer'); } }, { say: () => undefined }]) {
  for (const split of [false, true]) {
    const w = world('boutique');
    w.c.KiwiCaisseStrings = broken;
    vm.runInContext(source.slice(begin, end) + '\nthis.openPay = openPay;', w.c);
    w.start(339.37, { title: 'Encaissement' });
    assert.match(w.panel.innerHTML, /Encaissement/);
    assert.match(w.panel.innerHTML, /Espèces/);
    if (split) { w.part(100.12, 'cash', 120); assert.equal(w.receipts.length, 0); }
    w.part(split ? 239.25 : 339.37, 'cash', split ? 250 : 400);
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(w.receipts.length, 1, 'sale commits once');
    const parts = w.receipts[0].parts;
    assert.equal(parts.reduce((n, p) => n + Math.round(p.amount * 100), 0), 33937);
    assert.equal(parts.length, split ? 2 : 1);
    assert.deepEqual(parts.map(p => p.m), split ? ['espèces', 'espèces'] : ['espèces']);
    assert.deepEqual(parts.map(p => Math.round(p.rendu * 100)), split ? [1988, 1075] : [6063]);
    assert.equal(w.events.filter(e => e[0] === 'print').length, 1);
  }
}
console.log('PASS absent, empty, throwing and undefined copy layers: cash and split commit once, identical centime totals and change');

// The real cart checkout, sale journal, stock movement and fresh-ticket path.
const { load } = require('./retail-money-harness.cjs');
for (const split of [false, true]) {
  const w = world('boutique'), c = w.c, stock = [];
  Object.assign(c, {
    showStockIssue() {}, ticketStockIssue: () => null, ticketClient: () => null, linePromo: () => null,
    ticketOwner: {}, lineDeal: ln => ({ price: ln.promoPrice ?? 339.37 }),
    bqMoney: n => n, saleSeq: 0, useKiwiCl: () => false,
    queueIfOffline() {}, freshTicket() { c.state.ticket = { lines: [] }; },
    headSubVente: () => '', renderTicket() {}, renderGrid() {}, renderBadges() {},
    persistStock: (...args) => stock.push(args),
  });
  c.KiwiLive = { isOn: () => false };
  c.KiwiLoyaltyReserve = { create: () => ({ confirm: async () => true }) };
  c.P.item = { name: 'Test item', price: 339.37 };
  c.state.ticket = { num: 'TEST-1', lines: [{ pid: 'item', size: 'TU', color: 'black', qty: 1, remise: 0 }] };
  const today = { textContent: '' }, originalQuery = c.$;
  c.$ = s => s === '#bq-today' ? today : originalQuery(s);
  load(c, 'assets/pos-boutique.js', ['checkout']);
  vm.runInContext(source.slice(begin, end) + '\nthis.openPay = openPay;', c);
  c.checkout();
  if (split) { w.part(100.12, 'cash', 120); assert.equal(c.SALES.length, 0); }
  w.part(split ? 239.25 : 339.37, 'cash', split ? 250 : 400);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(c.SALES.length, 1);
  assert.equal(Math.round(c.SALES[0].total * 100), 33937);
  assert.equal(c.SALES[0].parts.reduce((n,p) => n + Math.round(p.amount * 100), 0), 33937);
  assert.equal(stock.length, 1);
  assert.equal(stock[0][3], -1);
  assert.equal(c.state.ticket.lines.length, 0);
  assert.equal(c.state.checkoutBusy, false);
}
console.log('PASS full boutique cash and split sales: journal, totals, stock deduction and new ticket complete without strings layer');
