import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const read = (name) => fs.readFileSync(new URL('../' + name, import.meta.url), 'utf8');
const source = read('assets/pos-sale.js');
const values = new Map([['kiwiPairedVenue', JSON.stringify({ merchant: 'receipt-test' })], ['kiwi:posDevice', 'A7']]);
const localStorage = {
  getItem: (key) => values.get(key) ?? null,
  setItem: (key, value) => values.set(key, String(value)),
  removeItem: (key) => values.delete(key),
  key: (index) => [...values.keys()][index] ?? null,
  get length() { return values.size; },
};
const documents = [];
const jobs = [];
const window = {
  localStorage,
  KiwiEnv: { isReal: () => true },
  KiwiReceipt: {
    build(sale) { documents.push(sale); return { receipt: sale.ref, sale }; },
    snapshot(doc) { return { receipt: doc.receipt }; },
  },
  KiwiKitchenPrint: {
    enqueueReceipt(id, doc, intent) { jobs.push({ id, doc, intent }); return { accepted: 1 }; },
  },
  addEventListener() {},
};
window.window = window;
const document = { hidden: false, addEventListener() {}, dispatchEvent() {} };
const context = {
  window, document, localStorage, console, Date, Map, Set, Uint8Array,
  crypto: { getRandomValues(a) { a[0] = 1; a[1] = 2; return a; } },
  CustomEvent: class {}, setTimeout() {}, clearTimeout() {},
};
vm.createContext(context);
vm.runInContext(source, context, { filename: 'pos-sale.js' });

const api = window.KiwiPosSale;
const cash = api.record('boulangerie', {
  total: 85, method: 'especes', label: 'Pain', ref: 'B-42',
  lines: [{ name: 'Pain', qty: 1, total: 85 }], received: 100, change: 15,
});
assert.equal(jobs.length, 1, 'cash confirmation queues exactly one receipt');
assert.equal(jobs[0].intent, 'original');
assert.equal(documents[0].received, 100, 'customer receipt keeps the amount tendered');
assert.equal(documents[0].change, 15, 'customer receipt keeps the change');
assert.equal(cash.rc.receipt, cash.ref, 'paid sale freezes the original receipt');
assert.equal(api.today('boulangerie')[0].rc.receipt, cash.ref, 'frozen receipt survives a reload');

api.record('boulangerie', { total: 20, method: 'carte', label: 'Croissant', ref: 'B-43' });
assert.equal(jobs.length, 2, 'card confirmation also queues a receipt');
api.record('hotel', { total: 400, method: 'room', label: 'Folio', ref: 'H-1' });
api.record('epicerie', { total: 50, method: 'credit', label: 'Ardoise', ref: 'E-1' });
assert.equal(jobs.length, 2, 'room charges and credit do not print as settled payments');
assert.equal(api.record('boulangerie', { total: 0, method: 'especes', ref: 'B-44' }), null);
assert.equal(jobs.length, 2, 'zero-value deferred checkout does not print');

const caisse = read('kiwi-caisse.html');
assert.doesNotMatch(caisse, /id="cash-step-success"/, 'restaurant cash has no third confirmation screen');
assert.match(caisse, /const sale = lastSaleEntry\(\);\s*closeCashModal\(\);\s*openCashDrawer\(\);[\s\S]{0,130}printSaleTicket\(sale\)/);
assert.match(caisse, /const sale = lastSaleEntry\(\);\s*closeCardModal\(\);\s*printSaleTicket\(sale\)/);
assert.match(caisse, /printSaleTicket\(entry \|\| lastSaleEntry\(\)\)/, 'split payments keep their one-print path');
for (const [file, prefix] of [['assets/pos-boutique.js', 'bq'], ['assets/pos-maison.js', 'mz']]) {
  const body = read(file);
  assert.match(body, new RegExp("else \\{ closeVeil\\('#" + prefix + "-pay-veil'\\); printReceiptNow\\(opts, parts\\); \\}"), file + ' closes and prints after paid commit');
  assert.match(body, /if \(res\.delivery \|\| parts\.some\(\(x\) => x\.m === 'livraison'\)\) stepSuccess/, file + ' preserves deferred delivery workflow');
}
assert.match(read('assets/pos-fastfood.js'), /postOrder\(order\);\s*closeVeil\('#ff-pay-veil'\);/, 'fast food paid checkout does not wait on a success screen');

console.log('✓ caisse automatic customer receipts (15 checks)');
