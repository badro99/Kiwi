#!/usr/bin/env node
// A boutique sale receipt carries a scannable Code 128 of its ticket number, so a
// return starts with one scan instead of typing the number and hunting the day.
// Santos asked for it on 26 Nov 2026 (ticket 43015). Only callers that ask for it
// get it: a restaurant bill has no return to look up.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');

function realm() {
  const storage = new Map();
  const document = { readyState: 'loading', addEventListener() {}, getElementById() { return null; }, createElement() { return {}; } };
  const window = { document };
  const context = vm.createContext({
    window, document, console,
    localStorage: { getItem(k) { return storage.get(k) || null; }, setItem(k, v) { storage.set(k, String(v)); }, removeItem(k) { storage.delete(k); } },
    sessionStorage: { getItem() { return null; }, setItem() {} },
    setTimeout() { return 0; }, clearTimeout() {}, Uint8Array, Uint8ClampedArray, Promise, Date,
  });
  vm.runInContext(read('assets/escpos.js'), context);
  vm.runInContext(read('assets/barcode.js'), context);
  vm.runInContext(read('assets/receipt.js'), context);
  return window.KiwiReceipt;
}

const R = realm();
const SALE = { ref: '43015', ts: Date.UTC(2026, 10, 26, 16, 47), cashier: 'Mohamed',
  lines: [{ qty: 1, name: 'JACK0013 S · Noir', total: 350 }], subtotal: 350, total: 350,
  pay: [{ label: 'espèces', amount: 350 }] };
let n = 0;
const ok = (name, fn) => { fn(); n++; console.log('  ✓ ' + name); };

const code128At = (bytes, value) => {
  const data = [...Buffer.from('{B' + value, 'latin1')];
  return bytes.findIndex((v, i) => v === 0x1D && bytes[i + 1] === 0x6B && bytes[i + 2] === 73
    && bytes[i + 3] === data.length && data.every((d, j) => bytes[i + 4 + j] === d));
};

ok('a sale built with ticketCode prints a Code 128 of the exact ticket number', () => {
  const doc = R.build(SALE, { ticketCode: true });
  assert.equal(doc.ticketCode, '43015');
  const bytes = Array.from(R.escpos(doc));
  assert.ok(code128At(bytes, '43015') > 0, 'GS k 73 {B43015');
});

ok('the system-print path draws the same code as a real barcode', () => {
  const html = R.html(R.build(SALE, { ticketCode: true }));
  assert.ok(/<svg[^>]*>/.test(html), 'svg barcode in the HTML ticket');
  assert.ok(html.includes('kr-tcode'), 'barcode block present');
});

ok('without the option, no barcode (restaurant bills stay as they are)', () => {
  const doc = R.build(SALE);
  assert.ok(!doc.ticketCode);
  assert.equal(code128At(Array.from(R.escpos(doc)), '43015'), -1);
  assert.ok(!R.html(doc).includes('kr-tcode'));
});

ok('a refund slip carries no return code', () => {
  const doc = R.build({ ...SALE, kind: 'refund', of: '43010' }, { ticketCode: true });
  assert.ok(!doc.ticketCode);
});

ok('a ticket with no number carries no barcode', () => {
  assert.ok(!R.build({ ...SALE, ref: '' }, { ticketCode: true }).ticketCode);
});

ok('the frozen copy kept for reprints keeps the code', () => {
  const snap = R.snapshot(R.build(SALE, { ticketCode: true }));
  assert.equal(snap.ticketCode, '43015');
});

ok('the boutique asks for the code and the douchette routes a ticket to Échanges', () => {
  const src = read('assets/pos-boutique/checkout.js');
  assert.ok(/ticketCode:\s*true/.test(src), 'boutique receipt asks for the ticket code');
  const at = src.indexOf('function handleWedge(');
  assert.ok(src.slice(at, at + 1200).includes('isTicketScan('), 'the douchette route tries tickets');
  assert.ok(src.includes('ticketDayIn(SALES, q,'), 'the Échanges search jumps to the ticket day');
});

const scan = await import(path.join(root, 'assets/pos-boutique/ticket-scan.js'));
const day = (t) => new Date(t).toISOString().slice(0, 10);
const SALES = [
  { id: '43015', at: Date.UTC(2026, 10, 24, 16) },
  { id: '43016', at: Date.UTC(2026, 10, 26, 10), voided: true },
  { id: '40001', at: Date.UTC(2026, 9, 1, 10) },
];
const none = () => false;

ok('a scanned ticket number is a ticket, unless an article carries that code', () => {
  assert.equal(scan.isTicketScan(SALES, '43015', none), true);
  assert.equal(scan.isTicketScan(SALES, '43015', (c) => c === '43015'), false, 'catalogue wins');
  assert.equal(scan.isTicketScan(SALES, '43016', none), false, 'voided sale');
  assert.equal(scan.isTicketScan(SALES, '99999', none), false, 'unknown');
  assert.equal(scan.isTicketScan(SALES, '', none), false);
});

ok('the exact number finds its day inside the return window, and only there', () => {
  assert.equal(scan.ticketDayIn(SALES, '43015', day, '2026-11-20', '2026-11-26'), '2026-11-24');
  assert.equal(scan.ticketDayIn(SALES, ' 43015 ', day, '2026-11-20', '2026-11-26'), '2026-11-24');
  assert.equal(scan.ticketDayIn(SALES, '40001', day, '2026-11-20', '2026-11-26'), '', 'too old');
  assert.equal(scan.ticketDayIn(SALES, '4301', day, '2026-11-20', '2026-11-26'), '', 'partial number does not jump');
});

console.log(`receipt-ticket-code: ${n} checks passed`);
