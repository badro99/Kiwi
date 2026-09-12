#!/usr/bin/env node
/* Focused regression coverage for the operating-day split UI in kiwi-caisse.html.
 * This executes the production functions from the inline caisse script with
 * small deterministic DOM/payment seams. It does not load or mutate a browser
 * session, a merchant account, or live data.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = fs.readFileSync(path.join(ROOT, 'kiwi-caisse.html'), 'utf8');
let passed = 0;

function ok(condition, message) {
  assert.ok(condition, message);
  passed += 1;
  console.log(`  ✓ ${message}`);
}

function section(name) {
  console.log(`\n--- ${name} ---`);
}

function between(startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  assert.notEqual(start, -1, `missing source marker: ${startMarker}`);
  const end = source.indexOf(endMarker, start);
  assert.notEqual(end, -1, `missing source marker: ${endMarker}`);
  return source.slice(start, end);
}

const splitHelpers = between('    function splitPaidCount(saved) {', '    function saveSplitFlow()');
const splitCard = between('    function renderRpSplitCard(id) {', '    /* "Plus tard"');
const splitPayment = between('    function markSplitPartPaid(partIdx, method) {', '    /* ---- events ---- */');
const rightPanel = between('    function renderRightPanel(id) {', '    function openTable(id) {');
/* La tranche part de `vrapIsCounterSale`, pas de `vrapOrderCard` : la carte
 * l'appelle, et une extraction qui s'arrête à la carte donne un
 * ReferenceError dans le bac à sable — la fonction existe bien en production,
 * elle est simplement définie un cran plus haut. */
const takeawayCard = between('    function vrapIsCounterSale(o) {', '    function vrapHandoverTimestamp(value) {');
const takeawayHistory = between('    function vrapHistoryRow(o) {', '    /* Une expirée');
const takeawayFinalize = between('    function settleVrapPayment() {', '    /* Click a board order');
/* La règle de provenance est partagée par la carte ET par l'encaissement.
 * On l'injecte telle quelle plutôt que de la simuler : un bouchon dirait
 * « oui » quoi qu'il arrive, et ce contrôle ne verrait plus la différence
 * entre une vente au comptoir et une commande OrderPro. */
const counterSaleRule = between('    function vrapIsCounterSale(o) {', '    function vrapOrderCard(o) {');
const cashTerminal = between('    function cashTerminalId() {', '    function cashActorId');
const dayReport = `${cashTerminal}\n${between('    function dayReportSession(counted) {', '    /* The local journal')}`;

section('Partial split display and duplicate-payment path');
{
  const elements = new Map();
  const element = () => ({ hidden: false, style: {}, dataset: {}, textContent: '', innerHTML: '', value: '', querySelector: () => ({ hidden: false, textContent: '' }) });
  const get = (id) => {
    id = String(id).replace(/^#/, '');
    if (!elements.has(id)) elements.set(id, element());
    return elements.get(id);
  };
  const saved = {
    total: 60,
    parts: [
      { amount: 35, paid: true },
      { amount: 25, paid: false },
    ],
    paidCount: 1,
  };
  const context = vm.createContext({
    tableSplits: new Map([['T1', saved]]),
    splitState: {
      tableId: 'T1', isVrap: false, sourceLabel: 'T1',
      total: 60, flow: { parts: [{ amount: 35, paid: true }, { amount: 25, paid: false }], paidCount: 1 },
    },
    tables: { T1: { status: 'bgha-ykhlass' } },
    money: (n) => Math.round((Number(n) || 0) * 100) / 100,
    fmtMAD: (n) => `${Number(n).toFixed(2)} MAD`,
    fmtMADcents: (n) => `${Number(n).toFixed(2)} MAD`,
    $: get,
    persistShift() { context.persistCalls = (context.persistCalls || 0) + 1; },
    recordSale(amount, method, label, tip, lines, table, order, split) {
      const entry = { id: `sale-${context.journal.length}`, amount, method, label, tip, lines, table, split };
      context.journal.push(entry);
      return entry;
    },
    journal: [],
    renderSplitFlow() {},
    openCashDrawer() {},
    printSaleTicket() {},
    markPaid() {},
    lucide: { createIcons() {} },
    lastSaleEntry() { return null; },
    vrapSplit: null,
    selectedId: 'T1',
  });
  vm.runInContext(`${splitHelpers}\n${splitCard}\n${splitPayment}`, context);
  context.renderRpSplitCard('T1');
  ok(get('rp-split-card-sub').textContent === '1 / 2 parts réglées · 50% · reste 25.00 MAD',
    'reloaded split card shows the 25 MAD outstanding remainder');

  context.markSplitPartPaid(1, 'cash');
  ok(context.journal.length === 1 && context.journal[0].amount === 25,
    'actual split payment path records only the outstanding 25 MAD part');
  context.markSplitPartPaid(1, 'cash');
  ok(context.journal.length === 1,
    'duplicate payment callback cannot collect the same split part twice');
}

section('Right-panel and takeaway-board display paths');
{
  const elements = new Map();
  const element = () => ({ hidden: false, style: {}, dataset: {}, textContent: '', innerHTML: '', value: '', querySelector: () => ({ hidden: false, textContent: '' }) });
  const get = (id) => {
    id = String(id).replace(/^#/, '');
    if (!elements.has(id)) elements.set(id, element());
    return elements.get(id);
  };
  const saved = { total: 60, parts: [{ amount: 35, paid: true }, { amount: 25, paid: false }], paidCount: 1, sourceLabel: 'À emporter #7', orderNum: 7 };
  const context = vm.createContext({
    tableSplits: new Map([['T1', saved]]),
    vrapSplit: saved,
    tables: { T1: { covers: 2, status: 'bgha-ykhlass', elapsed: 4, server: null } },
    tableOrders: { T1: [{ name: 'Plat', price: 60, qty: 1 }] },
    orders: {},
    mode: 'salle',
    selectedId: 'T1',
    servers: {},
    caisseTableLocks: {},
    money: (n) => Math.round((Number(n) || 0) * 100) / 100,
    fmtMAD: (n) => `${Number(n).toFixed(2)} MAD`,
    fmtMADcents: (n) => `${Number(n).toFixed(2)} MAD`,
    kdsEsc: (v) => String(v),
    lineName: (l) => l.name,
    vrapItemsLine: (o) => o.items.map((i) => `${i.q}× ${i.n}`).join(', '),
    vrapElapsed: () => 'à l’instant',
    ticketNo: (o) => `N°${o.num}`,
    $: get,
    $$: () => [],
    generateOrder: () => [{ name: 'Plat', qty: 1, total: 60 }],
    discountAmountFor: () => 0,
    renderSaleClient() {},
    hasTables: () => false,
    storeIsReal: () => false,
    caisseTableKitchenLocked: () => false,
    isFeatureOff: () => true,
    showPayButtons() {
      get('rp-pay-normal').hidden = false;
      get('rp-pay-normal').style.display = 'flex';
    },
    updateRendu() {},
    window: { CaisseFx: { countTotal() {} } },
    lucide: { createIcons() {} },
  });
  vm.runInContext(`${splitHelpers}\n${splitCard}\n${rightPanel}\n${takeawayCard}`, context);
  context.renderRightPanel('T1');
  ok(get('rp-total').textContent === '25.00 MAD' && get('rp-pay-normal').hidden === true,
    'reloaded table panel shows 25 MAD due and removes the full-bill payment route');

  const html = context.vrapOrderCard({
    num: 7, status: 'ready', paid: false, pickedUp: false, total: 60,
    items: [{ q: 1, n: 'Plat' }],
  });
  ok(html.includes('Partiel · reste 25.00 MAD') && html.includes('Reprendre le split · 25.00 MAD') && html.includes('60.00 MAD'),
    'takeaway board shows partial remainder while retaining the original 60 MAD order total');
}

section('Final split total and day-report session metadata');
{
  const context = vm.createContext({
    currentCashier: { name: 'Final Cashier' },
    shiftOpenedAt: new Date('2026-09-08T10:00:00Z'),
    shiftOpenedBy: 'Opening Cashier',
    openingFloat: 500,
    cashMovements: [], handovers: [], shift: { discounts: 0, discountsCount: 0, cancels: 0 },
    cashSessionId: () => 'shift-1725799200000',
    window: { KiwiCashSessions: { terminalId: () => 'terminal-qa-17' }, KiwiDayReport: {
      businessDay: () => '2026-09-08',
      storeSlug: () => 'test',
      build: (payload) => payload,
    } },
    journal: [],
    isReportableJournalEntry: () => true,
    storePaired: () => ({}), storeName: () => 'Test', storeCity: () => 'Rabat',
  });
  vm.runInContext(dayReport, context);
  const open = context.buildDayReport(null, 0);
  ok(open.session.sessionId === 'shift-1725799200000'
    && open.session.terminalId === 'terminal-qa-17'
    && !Object.hasOwn(open.session, 'closedBy'),
    'open day-report snapshot carries sessionId and terminalId without closedBy');
  const closed = context.buildDayReport(null, 123456);
  ok(closed.session.sessionId === 'shift-1725799200000'
    && closed.session.terminalId === 'terminal-qa-17'
    && closed.session.closedBy === 'Final Cashier',
    'closed day-report snapshot carries the same sessionId, terminalId and closedBy');
  context.window.KiwiCashSessions = null;
  ok(context.cashTerminalId() === '', 'missing cash-session terminal API fails soft to an empty terminalId');
}

section('Takeaway finalization and history path');
{
  const order = {
    num: 7, paid: false, pickedUp: false, total: 25, status: 'ready',
    items: [{ q: 1, n: 'Plat' }],
  };
  const context = vm.createContext({
    vrapResumedExpiredId: null,
    vrapEditingNum: 7,
    vrapSplit: { total: 60, parts: [{ amount: 35, paid: true }, { amount: 25, paid: true }] },
    splitState: { total: 60, flow: { parts: [{ amount: 35, paid: true }, { amount: 25, paid: true }] } },
    kdsOrders: [order],
    cart: [{ name: 'Plat', price: 60, qty: 1 }],
    currentTotal: () => 25,
    money: (n) => Math.round((Number(n) || 0) * 100) / 100,
    fmtMAD: (n) => `${Number(n).toFixed(2)} MAD`,
    saveVrapBillItems() {},
    vrapCartItems: () => [{ q: 1, n: 'Plat', p: 60 }],
    dispatchHeldTakeaway() {},
    opPush() {},
    persistShift() { context.persisted = true; },
    clearCart() { context.cleared = true; },
    setVrapView() { context.boardShown = true; },
    toast() {},
    ticketNo: (o) => `N°${o.num}`,
    vrapItemsLine: (o) => o.items.map((i) => `${i.q}× ${i.n}`).join(', '),
    vrapHandoverTimestamp: (value) => Number(value) || null,
    vrapHandoverTime: () => '12:00',
    kdsEsc: (value) => String(value),
  });
  vm.runInContext(`${counterSaleRule}\n${takeawayFinalize}\n${takeawayHistory}`, context);
  context.settleVrapPayment();
  ok(order.paid === true && order.total === 60 && context.persisted && context.boardShown,
    'actual takeaway finalization marks the order paid and restores the original 60 MAD total');
  /* Vente au comptoir (aucune provenance OrderPro) : l'encaissement EST la
   * remise. Sans cela la carte resterait dans « EN COURS » pour le reste du
   * service, et sa session takeout ne se refermerait jamais — puisque les deux
   * boutons qui la fermaient ont disparu. */
  ok(order.pickedUp === true && Number(order.pickedUpTs) > 0,
    'paying a counter sale hands it over in the same gesture, leaving nothing open');
  const history = context.vrapHistoryRow(order);
  ok(history.includes('60.00') || history.includes('60,00'),
    'actual takeaway history row displays the final 60 MAD total');
}

console.log(`\nResults: ${passed} passed`);
