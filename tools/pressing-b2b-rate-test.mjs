#!/usr/bin/env node
/* Ruling 2 (owner, 4 Nov 2026): the pressing B2B discount is a per-merchant
 * setting (0 to 50 %, 15 % by default), optionally overridden per client,
 * computed in centimes, frozen on the order, printed with its real rate. Runs
 * the real closure functions of the pressing till (rebuilt from the live files)
 * and the real shared policy module. */
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const pressing = require('./pressing-test-source.cjs');
const { declaration: scan } = require('./js-declarations.cjs');
// The parser needs a top-level declaration: cut the source at the named one first.
function declaration(src, name) {
  const m = new RegExp('(?:^|\\n)\\s*(?:function ' + name + '\\s*\\(|(?:const|let|var) ' + name + '\\s*=)').exec(src);
  if (!m) throw Error(name);
  return scan(src.slice(m.index).trimStart(), name);
}
const Policies = require('../assets/merchant-policies.js');
const source = pressing.pressingTestSource();

function till(setting) {
  const window = setting === undefined ? {} : { KiwiPressingOps: { b2b: { percent: () => setting } } };
  const ctx = vm.createContext({ console, Math, Date, window, ITEMS: { g: { label: 'Garment' } }, priceTable: () => ({}), CUST: { biz: { b2b: true }, big: { b2b: true, b2bPercent: 20 }, walk: {} },
    custOf: () => ({ name: 'Client', phone: '' }), publicOrderNo: (o) => o.id, receiptHead: () => '', dataText: (x) => x, esc: (x) => x, fmtDT: () => '', catalogLabel: (x) => x.label,
    svcCodes: () => 'LAV', barcode: () => '',  fmtMAD: (n) => n.toFixed(2) + ' MAD' });
  const names = ['B2B_LEGACY_PERCENT', 'b2bClean', 'b2bPercentFor', 'b2bPercentOf', 'b2bPercentLabel', 'b2bDiscountCents', 'lineUnit', 'lineTotal', 'orderTotals', 'saleLines', 'ticketTotals', 'receiptHTML'];
  vm.runInContext(names.map((n) => declaration(source, n)).join('\n') + '\nObject.assign(globalThis,{' + names.join(',') + '});', ctx);
  return ctx;
}
const order = (cents, extra = {}) => ({ id: 'T1', b2b: true, lines: [{ itemId: 'g', unitPrice: cents / 100, qty: 1, services: ['lavage'] }], pieces: [{ status: 'recu' }], pay: { mode: 'now', paid: 0 }, ...extra });
const C = (n) => Math.round(n * 100);

{ // today's behaviour is untouched: no setting, no frozen rate = 15 %
  const t = till();
  const r = t.orderTotals(order(100000));
  assert.equal(C(r.remise), 15000); assert.equal(C(r.total), 85000);
  assert.equal(C(t.orderTotals(order(100000, { b2b: false })).remise), 0, 'a non B2B order is never discounted');
}
{ // the rate frozen on the order wins over any later setting
  const t = till(30);
  assert.equal(C(t.orderTotals(order(100000, { b2bPercent: 10 })).remise), 10000, 'frozen 10 % ignores a setting changed to 30 %');
  assert.equal(C(t.orderTotals(order(100000)).remise), 15000, 'an old B2B order without a frozen rate keeps its 15 %, not the new setting');
}
{ // the merchant setting reaches the deposit ticket, a client override beats it
  const t = till(12);
  const open = (id) => t.ticketTotals({ lines: order(100000).lines, customer: { type: 'known', id } });
  const biz = open('biz'), big = open('big'), walk = open('walk');
  assert.equal(biz.b2bPercent, 12); assert.equal(C(biz.remise), 12000); assert.equal(C(biz.total), 88000);
  assert.equal(big.b2bPercent, 20, 'the client override beats the merchant setting'); assert.equal(C(big.remise), 20000);
  assert.ok(!walk.b2b); assert.equal(C(walk.remise), 0);
  assert.equal(C(till(0).ticketTotals({ lines: order(100000).lines, customer: { type: 'known', id: 'biz' } }).remise), 0, '0 % means no discount');
  assert.equal(till(80).ticketTotals({ lines: order(100000).lines, customer: { type: 'known', id: 'biz' } }).b2bPercent, 50, 'a setting above 50 is held at 50');
}
{ // centimes: rounded to the whole dirham once on the total, never per line
  const t = till();
  const two = order(0, { lines: [{ itemId: 'g', unitPrice: 33.33, qty: 1, services: ['lavage'] }, { itemId: 'g', unitPrice: 33.33, qty: 2, services: ['lavage'] }], b2bPercent: 12.5 });
  const r = t.orderTotals(two);       // 99.99 MAD x 12.5 % = 12.49875 -> 12 MAD
  assert.equal(C(r.sub), 9999); assert.equal(C(r.remise), 1200); assert.equal(C(r.total), 8799);
  assert.equal(C(t.orderTotals(order(10000, { b2bPercent: 12.5 })).remise), 1300, '12.5 % of 100 MAD is 12.50, half rounds up to 13');
  for (let cents = 1; cents < 400000; cents += 137) for (const p of [0, 5, 12.5, 15, 33, 50]) {
    assert.equal(t.b2bDiscountCents(cents, p), Policies.b2bDiscountCents(cents, p), `closure and shared module agree (${cents}, ${p})`);
  }
}
{ // the allocation of a received payment still sums to the cent at a custom rate
  const t = till();
  const o = order(0, { lines: [{ itemId: 'g', unitPrice: 10.1, qty: 3, services: ['lavage'] }, { itemId: 'g', unitPrice: 7.77, qty: 2, services: ['lavage'] }], b2bPercent: 12 });
  const total = C(t.orderTotals(o).total);
  for (const received of [Math.floor(total / 3), total]) assert.equal(C(Array.from(t.saleLines(o, received / 100), (l) => l.total).reduce((a, b) => a + b, 0)), received);
}
{ // the receipt prints the real rate
  const t = till();
  assert.match(t.receiptHTML(order(100000, { b2bPercent: 12 })), /Remise B2B –12 %<\/span><span>−120\.00 MAD/);
  assert.match(t.receiptHTML(order(100000, { b2bPercent: 12.5 })), /Remise B2B –12,5 %/);
  assert.match(t.receiptHTML(order(100000)), /Remise B2B –15 %/, 'a legacy order keeps printing 15');
  assert.ok(!t.receiptHTML(order(100000, { b2bPercent: 0 })).includes('Remise B2B'), 'no discount line at 0 %');
}
{ // the policy module itself
  assert.equal(Policies.cleanB2bPercent(undefined), 15); assert.equal(Policies.cleanB2bPercent('abc'), 15);
  assert.equal(Policies.cleanB2bPercent(0), 0); assert.equal(Policies.cleanB2bPercent(51), 50); assert.equal(Policies.cleanB2bPercent(-4), 0); assert.equal(Policies.cleanB2bPercent('12,5'), 12.5);
  assert.equal(Policies.b2bPercentFor(null, 12), 12); assert.equal(Policies.b2bPercentFor(0, 12), 0, 'a client at 0 % is an override, not an absence');
}
console.log('✓ pressing B2B rate: merchant setting, client override, frozen on the order, centimes, receipt label');
