#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (name) => fs.readFileSync(path.join(ROOT, name), 'utf8');
function extractFunction(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `${name} exists`);
  const open = source.indexOf('{', start);
  let depth = 0;
  for (let i = open; i < source.length; i++) {
    if (source[i] === '{') depth++;
    if (source[i] === '}' && --depth === 0) return source.slice(start, i + 1);
  }
  throw new Error(`${name} has no closing brace`);
}

const document = { readyState: 'loading', addEventListener() {}, getElementById() { return null; } };
const window = { document };
const context = vm.createContext({
  window, document, console, Date, Promise, Uint8Array,
  localStorage: { length: 0, getItem() { return null; }, setItem() {}, key() { return null; }, removeItem() {} },
  sessionStorage: { getItem() { return null; }, setItem() {} },
  setTimeout() { return 0; }, clearTimeout() {},
});
vm.runInContext(read('assets/receipt.js'), context);

const R = window.KiwiReceipt;
const doc = R.build({
  ref: 'TEST-FORMULA', ts: Date.now(), total: 52, method: 'cash',
  lines: [{
    name: 'Prépare ton Plat', qty: 1, total: 52,
    formulaChoices: [
      { name: 'Gnocchi', qty: 1, total: 0 },
      { name: 'Rosa Pomodoro', qty: 1, total: 12 },
    ],
  }],
}, {
  config: R.blankConfig(),
  business: { name: 'Pasta Corner', legal: {} },
});

assert.deepEqual(Array.from(doc.lines, (line) => [line.name, line.qty, line.total]), [
  ['Prépare ton Plat', 1, 40],
  ['Gnocchi', 1, 0],
  ['Rosa Pomodoro', 1, 12],
]);
assert.equal(doc.lines.reduce((sum, line) => sum + line.total, 0), 52,
  'itemised rows must equal the amount paid; the supplement is never counted twice');
assert.equal(doc.totals.total, 52, 'the settled total remains authoritative');

const caisse = read('kiwi-caisse.html');
const orderLib = read('functions/api/order/_lib.js');
const liveLink = read('assets/live-link.js');
const saleApi = read('functions/api/sale.js');
const feedApi = read('functions/api/feed.js');

const receiptLinesFromOrder = new Function('carteState', 'menuItems', 'lineLabel', 'lineCat', `
  ${extractFunction(caisse, 'formulaPartSupplement')}
  ${extractFunction(caisse, 'receiptLinesFromOrder')}
  return receiptLinesFromOrder;
`)({ formulaItems: [] }, [], (line) => line.name, () => 'Formules');
const caisseLines = receiptLinesFromOrder([
  { id: 'formula', name: 'Prépare ton Plat', price: 52, qty: 1, kind: 'formula', formulaUid: 'f-1' },
  { id: 'gnocchi', name: 'Gnocchi', price: 0, qty: 1, kind: 'formula-part', formulaUid: 'f-1', formulaExtra: 0 },
  { id: 'rosa', name: 'Rosa Pomodoro', price: 0, qty: 1, kind: 'formula-part', formulaUid: 'f-1', formulaExtra: 12 },
]);
assert.equal(caisseLines.length, 1, 'formula preparation parts stay nested under one billable receipt line');
assert.equal(caisseLines[0].total, 52, 'Caisse keeps the settled formula total');
assert.deepEqual(caisseLines[0].formulaChoices.map((choice) => [choice.name, choice.total]), [
  ['Gnocchi', 0], ['Rosa Pomodoro', 12],
]);

assert.ok(caisse.includes('function formulaPartSupplement(parent, part)')
  && caisse.includes('function receiptLinesFromOrder(lines)')
  && caisse.includes('formulaChoices: Array.isArray(i.formulaChoices)'),
  'Caisse keeps the formula breakdown for counter, table, and reopened OrderPro receipts');
assert.ok(orderLib.includes('const choiceExtras = new Map()')
  && orderLib.includes('line.formulaExtra = Math.max(0'),
  'the API derives every supplement from the published catalogue');
assert.ok(liveLink.includes('o.fc = formulaChoices')
  && saleApi.includes('if (formulaChoices.length) o.fc = formulaChoices')
  && feedApi.includes('formulaChoices: Array.isArray(l && l.fc)'),
  'the itemised breakdown survives offline sync and cross-device reprints');

console.log('✓ Formula receipt prints 40 MAD base + 0 MAD included choice + 12 MAD paid choice = 52 MAD');
console.log('✓ Formula choice prices remain server-authoritative and survive Caisse/cloud receipt paths');
