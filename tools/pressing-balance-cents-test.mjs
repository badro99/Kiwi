#!/usr/bin/env node
/* Pressing money (r19 pressing#A2): cash received and the balance still owed are summed in
 * centimes. A running sum of dirhams drifts (10.7 + 0.1 = 10.799999999999999), and then a
 * ticket paid to the centime kept « Solde à encaisser » and a disabled « Remettre au client ».
 * Runs the real custody and pickup bodies; no browser. */
import assert from 'node:assert/strict';
import vm from 'node:vm';
import path from 'node:path';
import pressingSource from './pressing-test-source.cjs';
import { declaration as scan } from './js-declarations.cjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const src = pressingSource.readFileSync(path.join(ROOT, 'assets/pressing-caisse.js'), 'utf8');
// The scanner needs a top-level declaration: start each one at its own line, as the other pressing suites do.
function declaration(source, name) {
  const m = new RegExp('(?:^|\\n)\\s*(?:function ' + name + '\\s*\\()').exec(source);
  if (!m) throw Error(name);
  return scan(source.slice(m.index).trimStart(), name);
}
const names = ['addPaid', 'balanceDue', 'lineUnit', 'lineTotal', 'orderTotals', 'rtCard'];
const context = vm.createContext({
  console, Math, Number, B2B_REMISE: 0.15, ITEMS: { g: { label: 'G' } }, COLOR: {}, priceTable: () => ({}),
  custOf: () => ({ name: 'Client', phone: '' }), orderStatus: () => 'pret', publicOrderNo: (o) => o.id, dataText: String, esc: String,
  fmtDay: String, fmtDT: String, notifyLine: String, fmtMAD: (n) => n + ' MAD', svcCodes: () => '', catalogLabel: () => 'G',
});
vm.runInContext(names.map((n) => declaration(src, n)).join('\n') + '\nObject.assign(globalThis,{' + names.join(',') + '});', context);
const C = (n) => Math.round(n * 100);

// A deposit then the balance: the running total lands on the centime, never beside it.
assert.equal(context.addPaid(10.7, 0.1), 10.8, 'a deposit plus the balance is exactly the ticket');
let seed = 7;
const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
for (let i = 0; i < 20000; i++) {
  const total = 1000 + Math.floor(rnd() * 400000), deposit = 1000 + Math.floor(rnd() * (total - 999));
  const paid = context.addPaid(deposit / 100, (total - deposit) / 100);
  assert.equal(C(paid), total, 'deposit + balance conserve centimes: ' + deposit + ' + ' + (total - deposit));
  assert.equal(context.balanceDue(total / 100, paid), 0, 'nothing left to collect after the balance');
}
assert.equal(context.balanceDue(10.8, 10.799999999999999), 0, 'a legacy drifted amount owes nothing');
assert.equal(context.balanceDue(10.8, 10.6), 0.2, 'a real balance stays a real balance');

// The pickup card: a ticket paid to the centime can be handed over; an unpaid one cannot.
const order = (paid) => ({ id: '1001', b2b: false, lines: [{ itemId: 'g', unitPrice: 10.8, qty: 1, services: [] }], pieces: [], pay: { mode: 'pickup', paid }, droppedAt: 0 });
const give = (html) => html.match(/<button[^>]*data-px-rt-give[^>]*>/)[0];
assert.ok(!/disabled/.test(give(context.rtCard(order(10.799999999999999)))), 'paid to the centime (drifted float): Remettre is enabled');
assert.ok(!/Solde à encaisser/.test(context.rtCard(order(10.799999999999999))), 'paid to the centime: no balance shown');
assert.ok(/disabled/.test(give(context.rtCard(order(10.7)))), 'ten centimes short: Remettre stays disabled');
console.log('✓ pressing balance · deposit then balance conserve centimes and the pickup card agrees');
