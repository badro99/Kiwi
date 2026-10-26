#!/usr/bin/env node
import caisseTestSource from './caisse-test-source.cjs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const page = caisseTestSource(fs.readFileSync(path.join(ROOT, 'kiwi-caisse.html'), 'utf8'));
const saleApi = fs.readFileSync(path.join(ROOT, 'functions/api/sale.js'), 'utf8');
let failed = 0;
function check(label, condition) {
  if (condition) console.log('✓ ' + label);
  else { failed++; console.error('✗ ' + label); }
}

check('a local table order waits for its permanent number before paper is frozen',
  /order\.canonicalNumberPromise = relayToKitchen\(order\);[\s\S]{0,120}order\.canonicalNumberPromise\.then\(\(\) => printKitchenTickets\(order, items\)\)/.test(page));
check('a recovered server echo replaces the private local counter',
  /if \(o\.number != null && String\(o\.number\)\.trim\(\)\) known\.opNum = o\.number;/.test(page));
check('the takeaway editor title uses the same public number resolver',
  /vrapTitle\.innerHTML = `Commande <strong[^>]*>\$\{ticketNo\(o\)\}<\/strong>/.test(page));
check('the order card, history and KDS all use the public number resolver',
  (page.match(/\$\{ticketNo\(o\)\}/g) || []).length >= 5);
check('payment carries the exact dispatched takeaway into the sale record',
  /const tenderOrder = dispatchUnsentKitchenBeforePayment\(\);[\s\S]{0,700}await awaitCanonicalTicketNumber\(tenderOrder\);[\s\S]{0,700}recordSale\([\s\S]{0,220}tenderOrder\)/.test(page));
check('a permanent number rewrites the already frozen customer receipt',
  /order\.opNum = r\.number;[\s\S]{0,700}reconcileReceiptOrderNumber\(order\);/.test(page)
  && /row\.ref = canonical;[\s\S]{0,700}attachReceipt\(row\);/.test(page));
check('printing heals a persisted receipt-number race before using its snapshot',
  /function receiptDocFor\(entry, opts\)[\s\S]{0,700}reconcileReceiptOrderNumber\(order, entry\);[\s\S]{0,300}K\.fromSnapshot/.test(page));
check('an idempotent replay repairs the dashboard reference without adding a sale',
  /UPDATE sales SET ref = \? WHERE id = \? AND merchant = \?/.test(saleApi));

/* Run: mutation row.ref = 'wrong' after the canonical assignment leaves all
 * text contracts green, but fails receipt/journal/mirror identity below. */
const { declarations } = (await import('node:module')).createRequire(import.meta.url)('./caisse-test-source.cjs');
const vm = await import('node:vm');
const row = { id: 'sale-1', orderId: 'remote-1', ref: 'L9', amount: 12.50 };
const effects = [];
const ctx = vm.createContext({ journal: [row], orderServerInitials: () => '',
  attachReceipt: r => effects.push(['receipt', r.ref]), persistShift: () => effects.push(['persist']),
  window: { KiwiLive: { postSale: r => effects.push(['mirror', r.id, r.ref]) } } });
vm.runInContext(declarations('ticketNo', 'reconcileReceiptOrderNumber'), ctx);
const order = { num: 9, opNum: 72, opId: 'remote-1', opChannel: 'kiwi', type: 'takeaway' };
ctx.reconcileReceiptOrderNumber(order);
check('run: canonical identity repairs the frozen receipt and idempotent mirror',
  row.ref === 'OPD-72' && row.amount === 12.50 && ctx.journal.length === 1
  && JSON.stringify(effects) === JSON.stringify([['receipt', 'OPD-72'], ['mirror', 'sale-1', 'OPD-72'], ['persist']]));
ctx.reconcileReceiptOrderNumber(order);
check('run: replaying the canonical number has no side effects', effects.length === 3);
check('run: a provisional number does not rewrite the receipt',
  ctx.reconcileReceiptOrderNumber({ num: 10 }) === null && effects.length === 3);

// A responsive server gates payment until allocation; refusal releases it.
for (const refused of [false, true]) {
  let release, settled = false;
  const promise = new Promise((resolve, reject) => { release = () => refused ? reject(Error('refused')) : resolve(); });
  const gate = vm.createContext({ mode: 'vrap', selectedId: null, kdsOrders: [],
    setTimeout: () => 1, clearTimeout() {} });
  vm.runInContext(declarations('awaitCanonicalTicketNumber'), gate);
  const waiting = gate.awaitCanonicalTicketNumber({ canonicalNumberPromise: promise }).then(() => { settled = true; });
  for (let i = 0; i < 5; i++) await null;
  check('run: payment waits while allocation is pending', !settled);
  release(); await waiting;
  check('run: server ' + (refused ? 'refusal' : 'answer') + ' releases payment', settled);
}
// An unreachable server is bounded by the shipped deadline.
{
  let timeout, milliseconds, cleared = false;
  const gate = vm.createContext({ mode: 'vrap', selectedId: null, kdsOrders: [],
    setTimeout: (cb, ms) => { timeout = cb; milliseconds = ms; return 1; }, clearTimeout: () => { cleared = true; } });
  vm.runInContext(declarations('awaitCanonicalTicketNumber'), gate);
  const waiting = gate.awaitCanonicalTicketNumber({ canonicalNumberPromise: new Promise(() => {}) });
  timeout(); await waiting;
  check('run: unreachable allocation releases at 2500ms and clears the timer', milliseconds === 2500 && cleared);
}

if (failed) process.exit(1);
console.log('order-number-reconciliation-test: PASS');
