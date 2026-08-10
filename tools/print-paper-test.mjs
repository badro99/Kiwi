import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const paper = read('assets/print-paper.css');
const printer = read('assets/printer-bridge.js');
const barcode = read('assets/barcode.js');
const receipt = read('assets/receipt.js');
const operational = read('assets/operational-print.js');
const invoice = read('assets/invoicing.js');
const qr = read('assets/order-qr.js');
const report = read('assets/report.js');
const caisse = read('kiwi-caisse.html');
const dashboard = read('dashboard.html');
const sw = read('kiwi-sw.js');

const controls = [
  ['pressing ticket preview', paper.includes('.px-receipt')],
  ['pressing garment label preview', paper.includes('.px-tag')],
  ['restaurant receipt preview', paper.includes('.receipt-paper')],
  ['other vertical print previews', ['.ff-receipt', '.ht-facture', '.lb-receipt', '.ph-receipt', '.fl-receipt', '.bq-avoir'].every((s) => paper.includes(s))],
  ['customer card and handover slip', paper.includes('.fl-card-preview') && paper.includes('.ho-slip')],
  ['paper background is white', paper.includes('background: #fff !important')],
  ['paper colour scheme is light', paper.includes('color-scheme: light !important')],
  ['generic browser print root', printer.includes("#kpr-print-root{display:block!important;position:static!important;background:#fff!important;color:#000!important;color-scheme:light!important;}")],
  ['barcode page does not use theme surface', !barcode.includes('html, body { background: var(--surface)') && barcode.includes('color-scheme: light !important')],
  ['shared receipt print root', receipt.includes("#kr-print-root{display:block!important;position:static!important;background:#fff!important;color:#000!important;color-scheme:light!important;}")],
  ['operational documents', operational.includes('html,body{color-scheme:light;background:#fff;color:#0A0F0D}')],
  ['invoice window', invoice.includes('color-scheme:light;background:#fff;color:#102019')],
  ['QR print sheet', qr.includes('html, body { color-scheme: light; background: #fff; color: #0A0F0D; }')],
  ['A4 report', report.includes('color-scheme:light!important;background:#fff!important')],
  ['both apps and offline shell load contract', caisse.includes('assets/print-paper.css?v=1') && dashboard.includes('assets/print-paper.css?v=1') && sw.includes("'/assets/print-paper.css?v=1'")],
];

for (const [name, ok] of controls) assert.equal(ok, true, name);
console.log(`print-paper-test: ${controls.length} controls passed`);
