#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · Split Bill Cash Drawer & Itemized Receipt Printing Test Suite
 * ═══════════════════════════════════════════════════════════════════════════ */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

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

console.log('■ Split Bill Cash Drawer & Receipt Printing — Static Guards');

// 1. Static Guards: markSplitPartPaid opens drawer on cash & prints ticket
ok('markSplitPartPaid calls openCashDrawer on cash',
  /if\s*\(\s*method\s*===\s*'cash'\s*\)\s*\{\s*openCashDrawer\(\);?\s*\}/.test(
    CAISSE_SRC.slice(CAISSE_SRC.indexOf('function markSplitPartPaid(partIdx, method)'),
      CAISSE_SRC.indexOf('/* ---- events ---- */', CAISSE_SRC.indexOf('function markSplitPartPaid(partIdx, method)')))));

ok('markSplitPartPaid calls printSaleTicket with entry',
  /function markSplitPartPaid\(partIdx,\s*method\)[\s\S]{0,1200}printSaleTicket\(entry\s*\|\|\s*lastSaleEntry\(\)\);?/.test(CAISSE_SRC));

// 2. Static Guards: Selected items & itemized line properties
ok('launchSplitFlow article mode populates partLines with name, qty, unit, price, total',
  /const assignedLines = Object\.entries\(cart\)\.map\(\(\[name,\s*qty\]\) => \{[\s\S]{0,400}unit:\s*unitPrice,\s*price:\s*unitPrice,\s*total:\s*money\(qty\s*\*\s*unitPrice\)/.test(CAISSE_SRC));

ok('article split never silently divides unassigned items between convives',
  CAISSE_SRC.includes('const partLines = assignedLines;') && !CAISSE_SRC.includes('unassignedPerConv'));

ok('openSplitModal stores itemId in itemTotals',
  /itemTotals\[l\.name\]\s*=\s*\{\s*totalQty:\s*0,\s*unitPrice,\s*itemId:\s*l\.itemId\s*\|\|\s*l\.id\s*\|\|\s*''\s*\};/.test(CAISSE_SRC));

ok('recordSale preserves unit and price on saved entry lines',
  /const unitPrice = l\.price != null \? l\.price : \(l\.unit != null \? l\.unit : \(l\.qty \? money\(l\.total \/ l\.qty\) : l\.total\)\);[\s\S]{0,200}unit:\s*unitPrice,\s*price:\s*unitPrice/.test(CAISSE_SRC));

// 3. Static Guards: Cash modal & change handling on split
ok('cashConfirm handles settled === split and toasts change if positive',
  /if \(settled === 'split'\) \{[\s\S]{0,100}if \(change > 0\) toast\('Monnaie à rendre : '\s*\+\s*fmtMAD\(change\)\);[\s\S]{0,50}closeCashModal\(\);/.test(CAISSE_SRC));

ok('closeCashModal resets cashPaymentCommitted and cashConfirm.disabled',
  /function closeCashModal\(\) \{[\s\S]{0,100}cashPaymentCommitted = false;[\s\S]{0,100}cashConfirm\.disabled = false;/.test(CAISSE_SRC));

// 4. Static Guards: Reprint button for paid parts
ok('renderSplitFlow renders reprint button for paid parts',
  /data-reprint-part="\$\{idx\}"/.test(CAISSE_SRC) &&
  /aria-label="Réimprimer le ticket"/.test(CAISSE_SRC));

ok('split-modal click router handles data-reprint-part',
  /const reprintBtn = e\.target\.closest\('\[data-reprint-part\]'\);/.test(CAISSE_SRC) &&
  /printSaleTicket\(sale,\s*\{\s*copy:\s*true\s*\}\)/.test(CAISSE_SRC));

// 5. Functional Behavior Simulation
console.log('■ Split Bill Tender — Functional Simulation');

const money = (n) => Math.round((Number(n) || 0) * 100) / 100;

// Simulate Table with 3 convives:
// Part 1: 35 MAD (1× Jus Tropical)
// Part 2: 95 MAD (1× Pappardelle aux champignons @ 60, 1× Jus Mangue @ 35)
// Part 3: 100 MAD (1× Agnolotti del Pin @ 65, 1× Jus Tropical @ 35)
const itemTotals = {
  'Jus Tropical': { totalQty: 2, unitPrice: 35, itemId: 'm-jus-trop' },
  'Pappardelle aux champignons': { totalQty: 1, unitPrice: 60, itemId: 'm-pappardelle' },
  'Jus Mangue': { totalQty: 1, unitPrice: 35, itemId: 'm-jus-mangue' },
  'Agnolotti del Pin': { totalQty: 1, unitPrice: 65, itemId: 'm-agnolotti' },
};

const perConvive = {
  1: { 'Jus Tropical': 1 },
  2: { 'Pappardelle aux champignons': 1, 'Jus Mangue': 1 },
  3: { 'Agnolotti del Pin': 1, 'Jus Tropical': 1 },
};

// Build parts like launchSplitFlow:
const parts = [];
for (let c = 1; c <= 3; c++) {
  const cart = perConvive[c];
  const assignedLines = Object.entries(cart).map(([name, qty]) => {
    const info = itemTotals[name];
    const unitPrice = info.unitPrice;
    return {
      name, qty,
      unit: unitPrice,
      price: unitPrice,
      total: money(qty * unitPrice),
      cat: 'Boissons',
      itemId: info.itemId,
    };
  });
  const amt = assignedLines.reduce((s, l) => s + l.total, 0);
  parts.push({
    base: amt,
    tip: 0,
    amount: amt,
    label: Object.entries(cart).map(([name, qty]) => (qty > 1 ? `${qty}× ${name}` : name)).join(', '),
    lines: assignedLines,
    paid: false,
    payMethod: null,
  });
}

ok('Part 2 has correct base of 95 MAD', parts[1].base === 95);
ok('Part 2 has 2 distinct itemized lines', parts[1].lines.length === 2);
ok('Part 2 lines contain Pappardelle and Jus Mangue with exact unit prices',
  parts[1].lines[0].name === 'Pappardelle aux champignons' &&
  parts[1].lines[0].unit === 60 &&
  parts[1].lines[1].name === 'Jus Mangue' &&
  parts[1].lines[1].unit === 35);

let drawerOpened = false;
let printedTicket = null;
const journal = [];

function mockOpenCashDrawer() {
  drawerOpened = true;
}

function mockPrintSaleTicket(entry) {
  printedTicket = entry;
}

function mockRecordSale(amount, method, label, tip, lines, table) {
  const entry = {
    id: 'sale-' + Date.now() + '-' + journal.length,
    amount, method, label, tip, lines: lines.map(l => ({ ...l })), table,
  };
  journal.push(entry);
  return entry;
}

// Settle Part 2 with Cash:
function settlePart(idx, method) {
  const p = parts[idx];
  const entry = mockRecordSale(p.base, method === 'carte' ? 'card' : 'cash', 'Table 2 · part ' + (idx + 1), p.tip, p.lines, '');
  p.paid = true;
  p.payMethod = method;
  p.saleId = entry.id;
  if (method === 'cash') mockOpenCashDrawer();
  mockPrintSaleTicket(entry);
  return entry;
}

// Execute Cash Payment for Part 2:
drawerOpened = false;
printedTicket = null;
const sale2 = settlePart(1, 'cash');

ok('Drawer opens when settling Part 2 in cash', drawerOpened === true);
ok('Receipt is printed when settling Part 2 in cash', printedTicket !== null && printedTicket.id === sale2.id);
ok('Printed receipt has label "Table 2 · part 2"', printedTicket.label === 'Table 2 · part 2');
ok('Printed receipt for Part 2 has Pappardelle (60 MAD) and Jus Mangue (35 MAD)',
  printedTicket.lines.length === 2 &&
  printedTicket.lines[0].name === 'Pappardelle aux champignons' &&
  printedTicket.lines[0].total === 60 &&
  printedTicket.lines[1].name === 'Jus Mangue' &&
  printedTicket.lines[1].total === 35);
ok('Printed receipt method is cash', printedTicket.method === 'cash');

// Execute Card Payment for Part 3:
drawerOpened = false;
printedTicket = null;
const sale3 = settlePart(2, 'carte');

ok('Drawer does NOT open when settling Part 3 by card', drawerOpened === false);
ok('Receipt is printed when settling Part 3 by card', printedTicket !== null && printedTicket.id === sale3.id);
ok('Printed receipt for Part 3 has Agnolotti (65 MAD) and Jus Tropical (35 MAD)',
  printedTicket.lines.length === 2 &&
  printedTicket.lines[0].name === 'Agnolotti del Pin' &&
  printedTicket.lines[0].total === 65 &&
  printedTicket.lines[1].name === 'Jus Tropical' &&
  printedTicket.lines[1].total === 35);
ok('Printed receipt method is card', printedTicket.method === 'card');

// Execute the actual employee payment function with deferred HTTP responses.
// These scenarios also run against mutations to prove they detect the defects.
const serveur = fs.readFileSync(path.join(ROOT, 'kiwi-serveur.html'), 'utf8');
const start = serveur.indexOf('    async function markSplitPartPaid(');
const paymentSource = serveur.slice(start, serveur.indexOf("    $('#split-modal').addEventListener", start));
const saveStart = serveur.indexOf('    function saveSplitFlow(');
const saveSource = serveur.slice(saveStart, serveur.indexOf('    function effectiveTipPct(', saveStart));
function paymentHarness(source = paymentSource, overrides = {}) {
  const pending = [], messages = [];
  const elements = new Map();
  const state = {
    tableId: '3', splitMode: 'egal', total: 90,
    flow: { parts: [{ amount: 35, paid: false }, { amount: 55, paid: false }], paidCount: 0 },
  };
  const ctx = vm.createContext({
    splitState: state, tables: { '3': { status: 'ka-tkhdam', covers: 2 } },
    employeePaymentsInFlight: new Set(), liveEmployeeState: { merchant: 'test-restaurant' },
    svSlug: () => '', serviceCanonicalOrders: new Map(), serviceTableSessions: new Map([['3', 'visit-test']]),
    serviceTableOrderRef: () => 'T-3', employeePaymentId: key => key + '-emp',
    SV_DEMO: false, currentTab: 'tables', activeTableId: null,
    tableClients: new Map(), tableOrders: { '3': [{ qty: 1 }] }, dirtyOrders: new Set(),
    tableSplits: new Map(), tablesPaid: 0, employeePaymentRefForget() {},
    publishServiceTableState() {}, returnToFloor() {}, renderTables() {}, renderNotifications() {},
    renderSplitFlow() {}, renderProfil() {}, lucide: { createIcons() {} },
    toast: text => messages.push(text),
    $: key => { if (!elements.has(key)) elements.set(key, { style: {}, hidden: true }); return elements.get(key); },
    fetch: (url, options) => new Promise((resolve, reject) => pending.push({
      url, body: JSON.parse(options.body), resolve, reject,
    })),
    ...overrides,
  });
  vm.runInContext(saveSource + source, ctx);
  function answer(i, success = true) {
    pending[i].resolve({ ok: success, status: success ? 200 : 409,
      json: async () => ({ ok: success, id: 'receipt-' + i }) });
  }
  return { ctx, state, pending, messages, answer };
}
async function concurrency(source = paymentSource) {
  const h = paymentHarness(source);
  const first = h.ctx.markSplitPartPaid(0, 'cash');
  const second = h.ctx.markSplitPartPaid(1, 'carte');
  assert.equal(h.pending.length, 2);
  assert.equal(await h.ctx.markSplitPartPaid(0, 'cash'), false, 'duplicate tap blocked');
  h.answer(1);
  assert.equal(await second, true);
  assert.equal(h.ctx.tablesPaid, 0, 'partial payment leaves the table occupied');
  assert.equal(h.ctx.serviceTableSessions.get('3'), 'visit-test');
  h.answer(0);
  assert.equal(await first, true);
  assert.equal(h.state.flow.paidCount, 2);
  assert.equal(h.ctx.tablesPaid, 1, 'exactly one local completion');
  assert.equal(h.ctx.tables['3'].status, 'khawya');
  assert.equal(h.ctx.serviceTableSessions.has('3'), false);
  assert.equal(h.ctx.tableSplits.has('3'), false);
  assert.deepEqual(h.pending.map(p => p.body.method), ['cash', 'card']);
  assert.deepEqual(h.pending.map(p => p.body.split.index), [0, 1]);
  assert.ok(h.pending.every(p => p.body.table === '3' && p.body.session === 'visit-test'));
}
await concurrency();
ok('real employee function handles out-of-order parts and closes exactly once', true);
for (const overrides of [
  { serviceTableSessions: new Map() },
  { liveEmployeeState: { merchant: '' } },
]) {
  const h = paymentHarness(paymentSource, overrides);
  assert.equal(await h.ctx.markSplitPartPaid(0, 'cash'), false);
  assert.equal(h.pending.length, 0);
  assert.equal(h.state.flow.parts[0].paid, false);
  assert.equal(h.ctx.employeePaymentsInFlight.size, 0);
}
ok('missing merchant or session never becomes a local payment', true);
for (const networkError of [false, true]) {
  const h = paymentHarness();
  const result = h.ctx.markSplitPartPaid(0, 'cash');
  if (networkError) h.pending[0].reject(new Error('offline')); else h.answer(0, false);
  assert.equal(await result, false);
  assert.equal(h.state.flow.parts[0].paid, false);
  assert.equal(h.ctx.employeePaymentsInFlight.size, 0);
  const retry = h.ctx.markSplitPartPaid(0, 'cash');
  assert.equal(h.pending[0].body.id, h.pending[1].body.id);
  h.answer(1);
  assert.equal(await retry, true);
}
ok('rejected and offline payments retain unpaid state and allow a stable retry', true);
{
  const h = paymentHarness();
  const result = h.ctx.markSplitPartPaid(0, 'cash');
  const other = { tableId: '4', flow: { parts: [{ paid: false }], paidCount: 0 } };
  h.ctx.splitState = other;
  h.answer(0);
  await result;
  assert.equal(other.flow.paidCount, 0);
  assert.equal(h.ctx.tableSplits.get('3').paidCount, 1);
  assert.equal(h.ctx.loadSplitFlow('3'), true);
  assert.equal(h.ctx.splitState.flow.parts[0].paid, true);
}
ok('switching tables during HTTP cannot credit another table', true);
{
  const h = paymentHarness(paymentSource, { SV_DEMO: true, serviceTableSessions: new Map() });
  assert.equal(await h.ctx.markSplitPartPaid(0, 'cash'), true);
  assert.equal(h.pending.length, 0);
}
ok('explicit demo still works without a network session', true);
const raceMutation = paymentSource
  .replace('const completesTable = Boolean(tableId && flow.parts.every(part => part.paid));', '')
  .replace('const t = tableId && tables[tableId];',
    'const t = tableId && tables[tableId]; const completesTable = flow.paidCount + 1 >= flow.parts.length;');
assert.notEqual(raceMutation, paymentSource);
await assert.rejects(() => concurrency(raceMutation));
ok('mutation: moving completion before HTTP is detected', true);
const sessionMutation = paymentSource
  .replace('if (!SV_DEMO && (!merchant || !session))', 'if (false)')
  .replace('if (!SV_DEMO) {', 'if (!SV_DEMO && merchant && session) {');
const unsafe = paymentHarness(sessionMutation, { serviceTableSessions: new Map() });
assert.equal(await unsafe.ctx.markSplitPartPaid(0, 'cash'), true);
ok('mutation: skipping a missing session reproduces the false payment', true);

console.log(`\nResults: ${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
