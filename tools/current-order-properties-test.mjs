/* Éditions générées contre les fonctions réelles avant/après, sans nouvel arrondi. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url), fc = require('../app/node_modules/fast-check');
const source = require('./caisse-test-source.cjs'), { declaration } = require('./js-declarations.cjs');
const before = JSON.parse(fs.readFileSync('tools/fixtures/caisse-app/cart-before.json')).functions;
const live = source.liveSource(), names = Object.keys(before);
const money = ['money','minor','major'].map(name => declaration(live, name)).join('\n');
const plain = value => JSON.parse(JSON.stringify(value));
function context(modern) {
  const c = vm.createContext({ cart: [], tableOrders: {}, tables: { T1: {} }, orders: {}, IS_DEMO: false,
    kdsOrders: [], vrapDiscount: null, vrapEditingNum: null, vrapResumedExpiredId: null, mode: 'vrap', selectedId: 'T1',
    document: { querySelector: () => null }, window: {}, lineLabel: l => l.name, lineHeld: () => false,
    nativeHapticLight() {}, renderMenu() {}, renderCart() {}, renderOrderPanel() {}, renderVrapBoard() {}, startTableTimer() {},
    optSig: opts => JSON.stringify(opts), promoPrice: (_item, price) => ({ price }), promoKey: () => '',
    newLineUid: (() => { let seq = 0; return () => 'line-' + ++seq; })(), liveTableSplit: () => null,
  });
  vm.runInContext(money + '\n' + (modern ? source.withSettlement(names.map(name => declaration(live, name)).join('\n')) : Object.values(before).join('\n')), c);
  if (modern) { c.currentOrder(); c.cart = c.currentOrder().cart; c.tableOrders = c.currentOrder().tables; }
  return c;
}
const actions = fc.array(fc.record({ kind: fc.constantFrom('add','qty','note','remove','formula','replaceFormula','discount','clear','resume','pay'),
  table: fc.boolean(), pick: fc.nat(30), price: fc.integer({ min: 0, max: 500000 }), qty: fc.integer({ min: -4, max: 5 }),
  pct: fc.boolean(), note: fc.constantFrom('', 'Sans sel', 'Bien cuit') }), { minLength: 30, maxLength: 120 });
let steps = 0;
fc.assert(fc.property(actions, edits => {
  const old = context(false), next = context(true);
  for (const [index, edit] of edits.entries()) {
    for (const [c, modern] of [[old, false], [next, true]]) {
      const lines = edit.table ? c.tableOrders.T1 || [] : c.cart, line = lines[edit.pick % (lines.length || 1)];
      const replace = value => modern ? edit.table ? c.currentOrder().replaceTable('T1', value) : c.currentOrder().replaceCart(value)
        : edit.table ? c.tableOrders.T1 = value : c.cart = value;
      const append = value => modern ? (edit.table && !c.tableOrders.T1 && replace([]), c.currentOrder().append(edit.table ? c.tableOrders.T1 : c.cart, ...value))
        : replace(lines.concat(value));
      if (edit.kind === 'add') {
        const item = { id: 'dish-' + edit.pick % 4, name: 'Plat ' + edit.pick % 4, price: edit.price / 100 };
        if (edit.table) c.pushTableOrderLine('T1', item, []); else c.pushCartLine(item, []);
      } else if (edit.kind === 'qty' && line) {
        if (edit.table) c.changeTableOrderLineQty('T1', line.uid, edit.qty); else c.changeCartLineQty(line.uid, edit.qty);
      } else if (edit.kind === 'note' && line) {
        if (modern) c.currentOrder().patchLine(line, { note: edit.note }); else line.note = edit.note;
      } else if (edit.kind === 'remove' && line) replace(c.removeGroupedLine(lines, line.uid));
      else if (edit.kind === 'formula') {
        const uid = 'formula-' + index;
        append([{ uid, id: uid, kind: 'formula', formulaUid: uid, price: edit.price / 100, qty: 1, name: 'Menu', note: '' },
          { uid: uid + '-part', id: 'drink', kind: 'formula-part', formulaUid: uid, price: 0, qty: 1, name: 'Boisson', note: '' }]);
      } else if (edit.kind === 'replaceFormula' && line?.formulaUid) {
        const uid = line.formulaUid;
        replace(c.replaceFormulaGroup(lines, uid, { parent: { uid, id: uid, formulaUid: uid, kind: 'formula', price: edit.price / 100, qty: 1, name: 'Menu modifié' }, parts: [] }));
      } else if (edit.kind === 'discount') {
        const discount = { kind: edit.pct ? 'pct' : 'amount', value: edit.pct ? edit.pick : edit.price / 100, reason: 'Test' };
        if (edit.table) c.tables.T1.discount = discount;
        else if (modern) c.currentOrder().setDiscount(discount); else c.vrapDiscount = discount;
      } else if (edit.kind === 'clear') {
        if (edit.table) replace([]); else c.clearCart();
      } else if (edit.kind === 'resume') {
        const restored = plain(lines);
        if (edit.pct && restored.length) restored[0].qty = String(restored[0].qty);
        replace(restored);
        if (!edit.table) { if (modern) c.currentOrder().setEditing(edit.pick); else c.vrapEditingNum = edit.pick; }
      } else if (edit.kind === 'pay') { replace([]); }
    }
    assert.deepEqual(plain(next.cart), plain(old.cart));
    assert.deepEqual(plain(next.tableOrders), plain(old.tableOrders));
    assert.deepEqual(plain(next.vrapDiscount), plain(old.vrapDiscount));
    assert.equal(next.vrapEditingNum, old.vrapEditingNum);
    for (const table of [false, true]) {
      const total = c => {
        const rows = table ? c.generateOrder('T1', c.tables.T1) : c.cart;
        const gross = rows.reduce((sum, line) => sum + (table ? line.total : line.price * line.qty), 0);
        return Math.round((gross - (table ? c.discountAmountFor('T1', gross) : c.vrapDiscountAmount(gross))) * 100);
      };
      assert.equal(total(next), total(old), 'Total strictement identique en centimes');
    }
    steps++;
  }
}), { seed: 20261026, numRuns: Number(process.env.KIWI_PROPERTY_RUNS) || 300 });
const c = context(true), input = [{ uid: 'protected', qty: 1, opts: [{ p: 2 }] }];
c.currentOrder().replaceCart(input); input[0].qty = 99; input[0].opts[0].p = 99;
assert.equal(c.cart[0].qty, 1); assert.equal(c.cart[0].opts[0].p, 2);
for (const mutate of [() => c.cart.push({}), () => { c.cart[0].qty++; }, () => { delete c.cart[0].qty; },
  () => Object.assign(c.cart[0], { qty: 9 }), () => { c.cart[0].opts[0].p = 9; },
  () => { Object.getOwnPropertyDescriptor(c.cart, '0').value.qty = 9; }]) assert.throws(mutate, /lecture seule/);
console.log(`PASS panier : ${Number(process.env.KIWI_PROPERTY_RUNS) || 300} séquences, ${steps} éditions, lignes et centimes identiques à l’ancien code, projections protégées`);
