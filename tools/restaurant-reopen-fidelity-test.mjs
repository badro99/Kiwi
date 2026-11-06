#!/usr/bin/env node
/* Une note rouverte revient avec TOUTES ses lignes d'origine, identité, options
 * et note comprises : ni plafond de quarante lignes, ni « reopen-N » générique.
 * Exécute le vrai snapshotLine() de recordSale() puis le vrai pont de réouverture. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import caisseTestSource from './caisse-test-source.cjs';

const read = f => fs.readFileSync(new URL('../' + f, import.meta.url), 'utf8');
const rec = read('assets/caisse-accounting/record-sale.js');
const fn = (rec.match(/\n      function snapshotLine\(line\) \{[\s\S]*?\n      \}\n/) || [])[0];
assert.ok(fn, 'snapshotLine() existe dans recordSale()');
const money = v => Math.round(v * 100) / 100;
const snapshotLine = vm.runInNewContext(`(function(){${fn}; return snapshotLine;})()`, { money, Number, String, Array, JSON, Math });

/* Une table bâtie sur plusieurs envois cuisine : 57 lignes distinctes. */
const live = Array.from({ length: 57 }, (_, i) => ({
  id: 'item-' + i, uid: 'u' + i, qty: 1 + (i % 3), name: 'Plat ' + i + (i % 2 ? ' (Sans sel)' : ''), baseName: 'Plat ' + i,
  price: 10 + i, total: (10 + i) * (1 + (i % 3)), note: i % 4 === 0 ? 'bien cuit ' + i : '',
  opts: i % 2 ? [{ n: 'Sans sel', p: 0 }, { n: 'Extra harissa', p: 2 }] : undefined, optSig: i % 2 ? 'sans-sel|harissa' : '',
}));
const saved = live.map(snapshotLine);
assert.equal(saved.length, 57);
assert.equal(saved[56].id, 'item-56');
assert.deepEqual(saved[1].opts, live[1].opts, 'les options sont gardées');
assert.equal(saved[4].note, 'bien cuit 4');
assert.equal(saved[1].baseName, 'Plat 1');
assert.notEqual(saved[1].opts, live[1].opts, 'copie, pas la référence vivante');

const marker = 'window.KiwiRestaurantReopen = {', end = '/* End restaurant reopen bridge */';
const till = caisseTestSource(read('kiwi-caisse.html'));
const section = till.slice(till.indexOf(marker), till.indexOf(end, till.indexOf(marker)));
function run(lines, split) {
  const tables = { '1': { status: 'khawya', covers: 0, timerSession: '' } };
  const tableOrders = {}, orders = {}, tableSplits = new Map();
  const journal = [{ id: 'p0', split: { flowId: 'f', index: 0 }, method: 'cash', voided: false, amount: 5 },
    { id: 'p1', split: { flowId: 'f', index: 1 }, method: 'card', voided: false, amount: 5 }];
  const ctx = { window: { KiwiLive: { saleIdFor: r => r.id } }, tables, journal, tableOrders, orders,
    tableClosedAt: {}, tableSplits, phoneSeats: new Map(), tableKey: String, currentMerchantSlug: () => 'f', money,
    splitPaidCount: s => s.parts.filter(p => p.paid).length, tableSaleLabel: (a, b) => a + b,
    refreshTableNode() {}, persistShift() {}, openTable() {}, Date, Number, String, Object, Array, Math, JSON };
  vm.runInNewContext(caisseTestSource.withSettlement(section), ctx);
  const receipt = { saleId: 'p1', reopenSnapshot: { table: '1', covers: 2, orderNo: '9', ref: 'T1 #9', lines,
    split: split ? { id: 'f', total: 10, mode: 'egal', parts: [{ amount: 5, paid: true, lines: lines.slice(0, 45) }, { amount: 5, paid: true, lines: lines.slice(0, 45) }] } : null } };
  assert.equal(ctx.window.KiwiRestaurantReopen.apply({ table: '1', sessionId: 's2', ref: 'T1 #9', splitFlowId: 'f' }, receipt), true);
  return { tableOrders, tableSplits };
}
const out = run(saved, true);
const restored = out.tableOrders['1'];
assert.equal(restored.length, 57, 'aucune ligne perdue au-delà de 40');
assert.equal(restored[50].id, 'item-50', "l'identité de l'article revient, pas reopen-50");
assert.equal(restored[50].uid, 'u50');
assert.equal(restored[1].name, 'Plat 1', 'nom de base : le libellé réajoute les options');
assert.deepEqual(restored[1].opts, live[1].opts);
assert.equal(restored[1].optSig, 'sans-sel|harissa');
assert.equal(restored[4].note, 'bien cuit 4');
assert.equal(restored.reduce((s, l) => s + l.price * l.qty, 0), live.reduce((s, l) => s + l.total, 0), 'même addition au centime');
assert.equal(out.tableSplits.get('1').parts[0].lines.length, 45, 'chaque part du partage garde ses lignes (plus de coupe à 40)');
/* Une note enregistrée avant ce correctif reste rouvrable. */
const old = run([{ name: 'Article libre', qty: 2, total: 10 }], false).tableOrders['1'];
assert.equal(old[0].id, 'reopen-0');
assert.equal(old[0].name, 'Article libre');
assert.equal(old[0].price * old[0].qty, 10);
console.log('✓ restaurant-reopen-fidelity-test : 57 lignes, identité, options, notes et partage restaurés');
