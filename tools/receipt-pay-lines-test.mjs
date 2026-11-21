#!/usr/bin/env node
// One payment method prints as ONE line on the receipt. Santos ticket 36577
// (21 Nov 2026): a 200 MAD sale settled as two cash parts (50 then 150) printed
// "Espèces 50 MAD" and "Espèces 150 MAD", which reads like two payments or a
// mistake to the customer. The server already stores it as one cash payment.
// Two different credit notes stay on their own lines: each names its own code.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');

const storage = new Map();
const document = { readyState: 'loading', addEventListener() {}, getElementById() { return null; }, createElement() { return {}; } };
const window = { document };
const context = vm.createContext({
  window, document, console,
  localStorage: { getItem(k) { return storage.get(k) || null; }, setItem(k, v) { storage.set(k, String(v)); }, key() { return null; }, length: 0 },
  sessionStorage: { getItem() { return null; }, setItem() {} },
  setTimeout() { return 0; }, clearTimeout() {}, Uint8Array, Uint8ClampedArray, Promise, Date,
});
vm.runInContext(read('assets/escpos.js'), context);
vm.runInContext(read('assets/receipt.js'), context);
const R = window.KiwiReceipt;

let n = 0;
const ok = (name, fn) => { fn(); n++; console.log('  ✓ ' + name); };
const sale = (pay) => ({ ref: '36577', lines: [{ qty: 1, name: 'Pantalon juens M', total: 200 }], total: 200, pay });

ok('two cash parts print as one Espèces line with their sum', () => {
  const doc = R.build(sale([{ label: 'espèces', amount: 50 }, { label: 'espèces', amount: 150 }]));
  assert.equal(doc.pay.length, 1);
  assert.equal(doc.pay[0].amount, 200);
  assert.equal(doc.pay[0].label, 'Espèces');
  const txt = R.text(doc);
  assert.equal((txt.match(/Espèces/g) || []).length, 1, txt);
});

ok('cash and card stay two lines, in the order they were paid', () => {
  const doc = R.build(sale([{ label: 'carte', amount: 120 }, { label: 'espèces', amount: 30 }, { label: 'carte', amount: 50 }]));
  assert.equal(JSON.stringify(doc.pay.map((p) => [p.label, p.amount])), JSON.stringify([['Carte bancaire', 170], ['Espèces', 30]]));
});

ok('two different credit notes keep their own lines', () => {
  const doc = R.build(sale([{ label: 'Avoir AV-1', amount: 80 }, { label: 'Avoir AV-2', amount: 120 }]));
  assert.equal(doc.pay.length, 2);
});

ok('merged amounts add in centimes, not floats', () => {
  const doc = R.build(sale([{ label: 'espèces', amount: 0.1 }, { label: 'espèces', amount: 0.2 }]));
  assert.equal(doc.pay[0].amount, 0.3);
});

console.log(`receipt-pay-lines: ${n} checks passed`);
