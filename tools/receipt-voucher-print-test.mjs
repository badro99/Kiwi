#!/usr/bin/env node
// A store-credit voucher (bon d'avoir) prints on the till's thermal printer, like a
// receipt: real ESC/POS bytes with the shop header and a scannable Code 128 of the
// exact code, through the durable print queue first. It used to go through the
// system print dialog only, which ended as a PDF.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');

function realm({ printer = true, queue = null } = {}) {
  const storage = new Map();
  const printed = [];
  const document = { readyState: 'loading', addEventListener() {}, getElementById() { return null }, createElement() { return {}; } };
  const window = { document };
  if (printer) window.KiwiPrinter = {
    isConnected() { return true; },
    printBytes(bytes, station) { printed.push({ bytes: Array.from(bytes), station }); return Promise.resolve({ ok: true, via: 'usb' }); },
    browserPrintHTML() { printed.push({ html: true }); return Promise.resolve({ ok: true, via: 'browser' }); },
  };
  if (queue) window.KiwiKitchenPrint = queue;
  const context = vm.createContext({
    window, document, console,
    localStorage: { getItem(k) { return storage.get(k) || null; }, setItem(k, v) { storage.set(k, String(v)); } },
    sessionStorage: { getItem() { return null; }, setItem() {} },
    setTimeout() { return 0; }, clearTimeout() {}, Uint8Array, Uint8ClampedArray, Promise, Date,
  });
  vm.runInContext(read('assets/escpos.js'), context);
  vm.runInContext(read('assets/barcode.js'), context);
  vm.runInContext(read('assets/receipt.js'), context);
  return { R: window.KiwiReceipt, printed, window };
}

const AV = { code: 'AV-01SJZZJ2MV366W', amount: 171, balance: 171, holderName: 'Cliente test', motif: 'Taille, retour 16501',
  from: '16501', at: Date.UTC(2026, 9, 23, 12), until: Date.UTC(2027, 3, 23, 12) };
let n = 0;
const ok = (name, fn) => Promise.resolve(fn()).then(() => { n++; console.log('  ✓ ' + name); });

const { R, printed } = realm();
assert.equal(typeof R.printVoucher, 'function', 'KiwiReceipt.printVoucher exists');

await ok('ESC/POS voucher carries title, amount, code and a Code 128 of the exact code', () => {
  const doc = R.voucher(AV);
  const bytes = Array.from(R.escpos(doc));
  const text = Buffer.from(bytes).toString('latin1');
  assert.ok(text.includes("BON D'AVOIR"));
  assert.ok(text.includes('171'));
  assert.ok(text.includes(AV.code));
  assert.ok(text.includes('Cliente test') && text.includes('16501'));
  // GS k 73 n {B + code : the barcode the payment field reads back from a scanner.
  const data = [...Buffer.from('{B' + AV.code, 'latin1')];
  const at = bytes.findIndex((v, i) => v === 0x1D && bytes[i + 1] === 0x6B && bytes[i + 2] === 73
    && bytes[i + 3] === data.length && data.every((d, j) => bytes[i + 4 + j] === d));
  assert.ok(at > 0, 'Code 128 of the voucher code');
  assert.ok(!text.includes('TOTAL'), 'a voucher is not a sale receipt');
});

await ok('a partly spent voucher prints the balance and what it was issued for', () => {
  const text = Buffer.from(Array.from(R.escpos(R.voucher({ ...AV, balance: 71 })))).toString('latin1');
  assert.ok(text.includes('mis pour') && text.includes('solde restant') && /\b71\b/.test(text));
});

await ok('the voucher prints its last valid day, not the expiry instant', () => {
  // Expires at the 05:00 business-day boundary of 24 April: the last valid day is the 23rd.
  const expiry = new Date(2027, 3, 24, 5, 0, 0).getTime();
  const raw = Buffer.from(Array.from(R.escpos(R.voucher({ ...AV, until: expiry })))).toString('latin1');
  assert.ok(raw.includes('23/04/2027') && !raw.includes('24/04/2027'), 'last valid day');
  const given = Buffer.from(Array.from(R.escpos(R.voucher({ ...AV, until: expiry, untilText: '23 avr. 2027' })))).toString('latin1');
  assert.ok(given.includes('23 avr. 2027'), 'the till’s own formatted day wins');
});

await ok('the system-print fallback shows a real scannable barcode, not a picture', () => {
  const html = R.html(R.voucher(AV));
  assert.ok(html.includes('<svg') && html.includes('code-barres ' + AV.code));
  assert.ok(html.includes(AV.code));
});

await ok('with a printer set up, printVoucher sends thermal bytes to the till station, no PDF', async () => {
  const r = await R.printVoucher(AV);
  assert.equal(r.ok, true);
  assert.equal(printed.length, 1);
  assert.equal(printed[0].station, 'caisse');
  assert.ok(printed[0].bytes && printed[0].bytes.length > 100);
});

await ok('the durable print queue is used first, and every press is its own print', async () => {
  const jobs = [];
  const queue = { enqueueReceipt(id, doc, intent) { jobs.push({ id, intent, kind: doc.kind }); return { accepted: 1 }; } };
  const q = realm({ queue });
  const a = await q.R.printVoucher(AV), b = await q.R.printVoucher(AV);
  assert.equal(a.queued, true); assert.equal(b.queued, true);
  // A voucher only prints on a cashier's press. As « original », a press after a
  // till reload hit the done ledger and nothing came out.
  assert.deepEqual(jobs.map((j) => j.intent), ['manual-reprint', 'manual-reprint']);
  assert.equal(jobs[0].id, 'avoir:' + AV.code);
  assert.equal(jobs[0].kind, 'voucher');
  assert.equal(q.printed.length, 0, 'no direct print and no PDF when the queue took it');
});

await ok('a queue that takes nothing (other jobs pending) is not a print: it prints directly', async () => {
  const queue = { enqueueReceipt() { return { accepted: 0, pending: 3 }; } };
  const q = realm({ queue });
  const r = await q.R.printVoucher(AV);
  assert.equal(r.ok, true);
  assert.notEqual(r.queued, true, 'the till must not say « envoyé à l’imprimante »');
  assert.equal(q.printed.length, 1);
  assert.ok(q.printed[0].bytes && q.printed[0].bytes.length > 100);
});

await ok('the voucher window keeps its print button on a 600 px screen', () => {
  for (const [f, cls] of [['assets/pos-boutique.css', 'bq'], ['assets/pos-maison.css', 'mz']]) {
    const css = read(f);
    assert.ok(new RegExp('\\.modal\\.' + cls + '-avoirm \\.' + cls + '-sheet-foot \\{[^}]*position: sticky').test(css), f);
  }
});

await ok('both retail tills print the voucher through KiwiReceipt, not the system print helper', () => {
  for (const f of ['assets/pos-boutique/checkout.js', 'assets/pos-maison/checkout.js']) {
    const src = read(f);
    const handler = src.slice(src.indexOf("-av-print', el).onclick"), src.indexOf("-av-print', el).onclick") + 1200);
    assert.ok(handler.includes('K.printVoucher'), f);
    assert.ok(handler.includes('untilText: fmtValidUntil(av.until)'), f + ' passes the business-day last valid day');
    assert.ok(!handler.includes('KiwiOperationalPrint'), f + ' no longer opens the system print dialog');
    assert.ok(src.includes("KiwiBarcode.svg(av.code, { format: 'code128', height: 40, showText: false"), f + ' on-screen barcode is real');
  }
});

console.log(`receipt-voucher-print-test: ${n} checks passed`);
