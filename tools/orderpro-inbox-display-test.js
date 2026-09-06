#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · OrderPro Inbox Display & Filtering Verification Suite
 * ═══════════════════════════════════════════════════════════════════════════ */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = path.resolve(__dirname, '..');

const INBOX_SRC = fs.readFileSync(path.join(ROOT, 'assets/orderpro-inbox.js'), 'utf8');
const CAISSE_SRC = fs.readFileSync(path.join(ROOT, 'kiwi-caisse.html'), 'utf8');

let passed = 0;
let failed = 0;

function ok(name, cond) {
  if (cond) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    console.error(`  ✗ ${name}`);
  }
}

console.log('■ OrderPro Inbox Display & Filtering Verification');

// 1. Static source invariants
ok('list() filters out direct caisse orders (channel === "caisse")',
  /o\.channel === 'caisse'\) return false;/.test(INBOX_SRC));

ok('list() filters out paid table orders',
  /o\.mode === 'table'[\s\S]{0,120}o\.paid && \(status === 'accepted' \|\| status === 'pending'\)\) return false/.test(INBOX_SRC));

ok('list() filters out closed session table orders',
  /closedSet\[String\(o\.session\)\]/.test(INBOX_SRC));

ok('kiwi-table-released marks matching local orders paid and closed',
  /document\.addEventListener\('kiwi-table-released'[\s\S]{0,400}o\.paid = true/.test(INBOX_SRC));

ok('linesHtml supports kind === "formula" and kind === "formula-part"',
  /l\.kind === 'formula'/.test(INBOX_SRC) && /l\.kind === 'formula-part'/.test(INBOX_SRC));

ok('formula parts are indented in kop-formula-parts without 1x repetition',
  /kop-formula-parts/.test(INBOX_SRC) && /kop-part-bullet/.test(INBOX_SRC));

ok('technical formula notes in brackets are stripped from notes',
  /cleanLineNote/.test(INBOX_SRC) && /\^\\\[\.\*\?\\\]/.test(INBOX_SRC));

ok('table badge is an interactive button with data-kop-table',
  /button\.kop-where-btn/.test(INBOX_SRC) && /data-kop-table=/.test(INBOX_SRC));

ok('order cards include clock time and elapsed time',
  /clockTime\(o\.created_ts\)/.test(INBOX_SRC) && /timeAgo\(o\.created_ts\)/.test(INBOX_SRC));

ok('order cards include server name when present',
  /kop-server/.test(INBOX_SRC) && /o\.server/.test(INBOX_SRC));

ok('order cards include print button with data-kop-print',
  /data-kop-print=/.test(INBOX_SRC));

ok('open() click handler routes data-kop-table and data-kop-print',
  /checkoutOrder\(t\.dataset\.kopTable\)/.test(INBOX_SRC) &&
  /printOrder\(t\.dataset\.kopPrint\)/.test(INBOX_SRC));

ok('kiwi-caisse.html exposes printOrder on KiwiCaisseKitchen',
  /printOrder\(orderId\)/.test(CAISSE_SRC) && /printKitchenTickets\(local/.test(CAISSE_SRC));

// 2. Behavioral VM execution test
const domListeners = {};
const fakeStorage = {
  kiwiPaired: '1',
  kiwiLiveMerchant: 'test-resto',
};

const fakeDoc = {
  readyState: 'complete',
  addEventListener: (evt, fn) => { domListeners[evt] = fn; },
  head: { appendChild: () => {} },
  body: { appendChild: () => {} },
  getElementById: () => null,
  querySelector: () => null,
  createElement: (tag) => ({
    id: '', className: '', textContent: '', innerHTML: '', style: {},
    setAttribute: () => {}, appendChild: () => {}, addEventListener: () => {},
  }),
};

const sandbox = {
  window: {
    KiwiConfig: { features: { orderpro: true } },
    KiwiCaissePairing: { isPaired: () => true },
    localStorage: {
      getItem: (k) => fakeStorage[k] || null,
      setItem: (k, v) => { fakeStorage[k] = v; },
    },
    addEventListener: () => {},
  },
  document: fakeDoc,
  navigator: { vibrate: () => {} },
  setTimeout: () => 1,
  clearTimeout: () => {},
  setInterval: () => 1,
  clearInterval: () => {},
  fetch: () => Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true }) }),
  console: console,
};
sandbox.window.window = sandbox.window;
sandbox.window.document = fakeDoc;

const innerSrc = INBOX_SRC.replace(/\(function\s*\(\)\s*\{/, '').replace(/\}\)\(\);?\s*$/, '');
vm.createContext(sandbox);
vm.runInContext(innerSrc, sandbox);

const inbox = sandbox.window.KiwiOrderInbox;
ok('KiwiOrderInbox initialized in VM', inbox && typeof inbox.open === 'function');

// Seed test orders
const orders = inbox.orders();
const now = Date.now();

// Order 1: OrderPro mobile order with Formula (Prépare ton plat)
orders['ord-1'] = {
  id: 'ord-1', number: 179, mode: 'table', table: '3', status: 'accepted', channel: 'kiwi',
  total: 87, server: 'Karim', created_ts: now - 8 * 60000, paid: false,
  lines: [
    { name: 'Prépare ton Plat', qty: 1, unitPrice: 87, kind: 'formula', formulaUid: 'f-10' },
    { name: 'Tagliatelle', qty: 1, unitPrice: 0, kind: 'formula-part', formulaUid: 'f-10', slotLabel: 'Pâtes', note: '[Prépare ton Plat · Pâtes]' },
    { name: 'Crema di Fromaggi', qty: 1, unitPrice: 0, kind: 'formula-part', formulaUid: 'f-10', slotLabel: 'Sauce', note: '[Prépare ton Plat · Sauce]' },
    { name: 'Poulet', qty: 1, unitPrice: 0, kind: 'formula-part', formulaUid: 'f-10', slotLabel: 'Protéine', note: '[Prépare ton Plat · Protéine]' },
  ]
};

// Order 2: Caisse direct order (Coca-Cola)
orders['ord-2'] = {
  id: 'ord-2', number: 180, mode: 'table', table: '3', status: 'accepted', channel: 'caisse',
  total: 15, server: 'Caisse', created_ts: now - 5 * 60000, paid: false,
  lines: [{ name: 'Coca-Cola', qty: 1, unitPrice: 15 }]
};

// Order 3: Paid table order (e.g. from an already-settled table)
orders['ord-3'] = {
  id: 'ord-3', number: 181, mode: 'table', table: '4', status: 'accepted', channel: 'kiwi',
  total: 94, server: 'Karim', created_ts: now - 20 * 60000, paid: true, session: 'sess-4',
  lines: [{ name: 'Tiramisu', qty: 1, unitPrice: 40 }]
};

// Test list() logic via evaluation in sandbox
const evalInSandbox = (expr) => vm.runInContext(expr, sandbox);

const cookingList = evalInSandbox('list("accepted")');
ok('list("accepted") excludes caisse orders and paid table orders',
  cookingList.length === 1 && cookingList[0].id === 'ord-1');

// Test card HTML formatting
const cardHtml = evalInSandbox('cardHtml(state.orders["ord-1"])');
ok('cardHtml contains table button', cardHtml.includes('Table 3') && cardHtml.includes('data-kop-table="ord-1"'));
ok('cardHtml contains server name', cardHtml.includes('Serveur : Karim'));
ok('cardHtml nests formula choices under formula parent',
  cardHtml.includes('kop-formula-parts') && cardHtml.includes('↳') &&
  cardHtml.includes('Tagliatelle') && cardHtml.includes('Crema di Fromaggi') && cardHtml.includes('Poulet'));
ok('cardHtml strips technical bracket notes from choices',
  !cardHtml.includes('[Prépare ton Plat · Pâtes]'));
ok('cardHtml includes print button', cardHtml.includes('data-kop-print="ord-1"'));

// Test table release event
domListeners['kiwi-table-released']({ detail: { table: '3', why: 'settle' } });
ok('kiwi-table-released marks ord-1 as paid', orders['ord-1'].paid === true);
const afterSettleList = evalInSandbox('list("accepted")');
ok('after settlement, ord-1 is no longer listed in active kitchen queue',
  afterSettleList.length === 0);

console.log(`\nResults: ${passed} passed, ${failed} failed.\n`);
if (failed > 0) process.exit(1);
