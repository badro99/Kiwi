#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const caisse = fs.readFileSync(new URL('../kiwi-caisse.html', import.meta.url), 'utf8');
const serveur = fs.readFileSync(new URL('../kiwi-serveur.html', import.meta.url), 'utf8');
const queue = fs.readFileSync(new URL('../functions/api/order/queue.js', import.meta.url), 'utf8');
let checks = 0;
function ok(condition, label) {
  assert.ok(condition, label);
  checks += 1;
  console.log(`✓ ${label}`);
}

ok(!queue.includes("from './_table-mobility.js'"), 'server no longer refuses a table merely because its ticket reached kitchen');
ok(!/openCaisseTransferModal\(tableId\)[\s\S]{0,180}caisseTableKitchenLocked/.test(caisse), 'caisse transfer opens for a sent order');
ok(!/openCaisseMergeModal\(tableId\)[\s\S]{0,180}caisseTableKitchenLocked/.test(caisse), 'caisse merge opens for a sent order');
ok(/data-action="transfer-table"/.test(serveur) && /data-action="merge-table"/.test(serveur)
  && !/data-action="(?:transfer-table|merge-table)"[^>]*disabled/.test(serveur), 'server-phone mobility controls remain tappable');
ok(/uid: l\.uid[\s\S]{0,180}sent: !!l\.sent/.test(caisse), 'bill projection preserves sent-line identity');
ok(/data-table-void/.test(caisse) && /cancelCaisseLineImmediately\(selectedId, line\)/.test(caisse), 'sent bill line exposes the audited one-tap kitchen cancellation');
const oneTapCancel = caisse.slice(caisse.indexOf('async function cancelCaisseLineImmediately('),
  caisse.indexOf('    /* ---- table order management ---- */'));
ok(oneTapCancel.includes("reason: 'item_cancelled'") && !oneTapCancel.includes('requireTillOperator'),
  'one-item cancellation asks for neither reason nor PIN');
ok(/const sent = sendTableToKitchen\(tableId\);[\s\S]{0,700}if \(selectedId === tableId\) renderRightPanel\(tableId\);/.test(caisse),
  'sending to kitchen immediately rerenders the bill with sent-item cancellation controls');
ok(/or-item-void-btn[\s\S]{0,180}data-review-action="void"/.test(caisse)
  && /closeOrderReviewModal\(\);[\s\S]{0,120}cancelCaisseLineImmediately\(selectedId, line\)/.test(caisse),
  'full bill exposes sent-item cancellation through the same audited void flow');
ok(!/data-order-cancel/.test(caisse), 'bill no longer exposes cancellation by kitchen order number');
ok(/const liveLines = tableOrders\[tableId\][\s\S]{0,120}liveLines\.length[\s\S]{0,420}sent: !!l\.sent/.test(caisse),
  'cashier-built Atlas lines win over stale generated demo bills and preserve cancellation identity');
ok(/const canonicalUid = l\.uid \|\| l\.id \|\| ''[\s\S]{0,700}existing\.canonicalUid !== canonicalUid[\s\S]{0,300}existing\.canonicalUid = canonicalUid/.test(caisse),
  'equal-value cashier lines still converge to the canonical server UID before cancellation');
ok(/rp-item--sent[\s\S]{0,420}data-cart-action="dec"/.test(caisse), 'sent line remains cancellable after reopening the menu');
ok(/function cancelSentTable[\s\S]{0,2600}canonicalNumberPromise[\s\S]{0,2600}cancelTable: \{ table: id, expectedSession \}, actorProof/.test(caisse)
  && /if \(!employee && !pinActor\)/.test(queue), 'whole-table cancellation waits for kitchen relay and uses a proved server-authoritative visit');
ok(/cancelSentTable\(tid, who\)/.test(caisse), 'Annuler table routes sent orders through canonical cancellation');
ok(/status <> 'rejected'/.test(queue), 'mobility leaves cancelled history at its original table');

const journalListSource = caisse.slice(caisse.indexOf('    function renderJournalList() {'),
  caisse.indexOf('    function renderJournal() {'));
assert.ok(journalListSource.includes('function renderJournalList'));
{
  const body = { innerHTML: '' };
  const entries = [
    { id: 'free', time: new Date('2026-09-13T20:00:00Z'), label: 'Table 1 · offerte', amount: 0,
      method: 'complimentary', kind: 'complimentary', settlementKind: 'complimentary', ref: 'Table 1' },
    { id: 'card', time: new Date('2026-09-13T20:01:00Z'), label: 'Table 2', amount: 25,
      method: 'card', ref: 'Table 2' },
    { id: 'cash', time: new Date('2026-09-13T20:02:00Z'), label: 'Table 3', amount: 28,
      method: 'cash', ref: 'Table 3' },
  ];
  const screen = vm.createContext({
    journal: entries, journalSearch: '', journalFilter: 'all', lastSaleId: null,
    $: () => body, window: {}, rpEsc: (value) => value, escTeam: (value) => String(value), fmtMAD: (value) => `${value} MAD`,
    String, Math,
  });
  vm.runInContext(journalListSource, screen);
  screen.renderJournalList();
  ok(body.innerHTML.includes('Offerte · Table 1') && body.innerHTML.includes('data-lucide="gift"')
    && !body.innerHTML.includes('Carte · Table 1'), 'complimentary journal sale is not presented as a card payment');
  ok(body.innerHTML.includes('Carte · Table 2') && body.innerHTML.includes('Espèces · Table 3'),
    'ordinary card and cash journal labels stay intact');
  screen.journalFilter = 'complimentary';
  screen.renderJournalList();
  ok(body.innerHTML.includes('Table 1') && !body.innerHTML.includes('Table 2') && !body.innerHTML.includes('Table 3'),
    'Offerte filter shows only complimentary settlements');
  screen.journalFilter = 'card';
  screen.renderJournalList();
  ok(body.innerHTML.includes('Table 2') && !body.innerHTML.includes('Table 1'),
    'card filter excludes complimentary settlements');
}

const shiftStatsSource = caisse.slice(caisse.indexOf('    function renderShiftStats() {'),
  caisse.indexOf('    function fmtDur(min) {'));
assert.ok(shiftStatsSource.includes('function renderShiftStats'));
{
  const fields = new Map();
  const totals = { txns: 1, revenue: 0, card: 0, cash: 0 };
  const screen = vm.createContext({
    journalTotals: () => totals, $: (id) => {
      if (!fields.has(id)) fields.set(id, { textContent: '' });
      return fields.get(id);
    },
    shift: { tablesPaid: 1 }, shiftOpenedAt: null, fmtMAD: (value) => `${value} MAD`, Math, String,
  });
  vm.runInContext(shiftStatsSource, screen);
  screen.renderShiftStats();
  ok(fields.get('#stat-txns-delta').textContent === 'Aucun encaissement',
    'a complimentary-only shift does not falsely show 100% cash');
  totals.revenue = 100; totals.card = 25; totals.cash = 75;
  screen.renderShiftStats();
  ok(fields.get('#stat-txns-delta').textContent === 'Carte 25% · Cash 75%',
    'paid shift keeps its card and cash split');
}

const launchSplitSource = caisse.slice(caisse.indexOf('    function launchSplitFlow() {'),
  caisse.indexOf('    function renderSplitFlow() {'));
assert.ok(launchSplitSource.includes('function launchSplitFlow'));
{
  const messages = [];
  let paid = '';
  let recorded = null;
  const modal = { classList: { remove() {} } };
  const zero = vm.createContext({
    splitState: {
      total: 0, isVrap: false, tableId: 'T4', sourceLabel: 'Table 4',
      sourceLines: [{ id: 'shawarma', name: 'Shawarma', qty: 1, total: 25 }],
    },
    minor: (value) => Math.round(Number(value) * 100),
    activeSaleDiscount: () => ({ grossAmountCents: 2500, discountAmountCents: 2500, actorId: 'manager-1' }),
    recordSale: (...args) => (recorded = args, { id: 'sale-free-4' }),
    markPaid: (id) => { paid = id; },
    toast: (message) => messages.push(message),
    $: () => modal,
    Array, Object,
  });
  vm.runInContext(launchSplitSource, zero);
  zero.launchSplitFlow();
  ok(recorded && recorded[0] === 0 && recorded[1] === 'complimentary' && paid === 'T4',
    'a manager-approved 100% discount writes an audited complimentary receipt before closing the table');

  recorded = null; paid = '';
  zero.activeSaleDiscount = () => null;
  zero.launchSplitFlow();
  ok(!recorded && !paid && messages.some(message => message.includes('Montant nul non justifié')),
    'an unexplained zero total remains blocked and cannot silently close a table');
}

const cancelSource = caisse.slice(caisse.indexOf('    async function cancelSentTable(id, who) {'),
  caisse.indexOf('    /* Cancel an open table from Salle'));
const retireSource = caisse.slice(caisse.indexOf('    function retireRejectedKitchenTicket(ticket) {'),
  caisse.indexOf('    function canRecoverCaisseTable(o) {'));
assert.ok(cancelSource.includes('async function cancelSentTable') && retireSource.includes('function retireRejectedKitchenTicket'));
const ticket = { opId: 'ord-table-13', num: 154, type: 'dineIn', table: 'T13', status: 'new', paid: false,
  canonicalNumberPromise: Promise.resolve({ ok: true, session: 'ses-table-13' }) };
let requested = null;
const screen = vm.createContext({
  Promise, String, Number, Map,
  kdsOrders: [ticket], opTickets: new Map([[ticket.opId, ticket]]),
  tableOrders: { T13: [{ uid: 'item-13', sent: true }] }, orders: { T13: [] },
  tables: { T13: { status: 'ka-yaklo', covers: 2, timerSession: 'ses-table-13' } },
  selectedId: 'T13', mode: 'salle', vrapEditingNum: null,
  phoneSessionOf: () => 'ses-table-13', tableSentCount: () => 1,
  canonicalOrdersForTable: () => [{ id: ticket.opId, order: ticket }],
  currentMerchantSlug: () => 'test-restaurant',
  postCaisseCancellation: async (body) => { requested = body; return { ok: true, ordersCancelled: 1 }; },
  fetch: async (_url, options) => { requested = JSON.parse(options.body); return { ok: true, json: async () => ({ ok: true, ordersCancelled: 1 }) }; },
  caisseTableId: (v) => v, renderRightPanel() {}, refreshTableNode() {},
  resetTableTimer: (table) => { delete table.timerSession; },
  releasePhoneTable() {}, persistShift() {}, publishServiceFloor() {},
  updateKdsCount() {}, kdsEl: { classList: { contains: () => false } }, kdsPaint() {},
  backToSalle() {}, toast() {}, clearCart() {}, setVrapView() {},
});
vm.runInContext(retireSource + cancelSource, screen);
await screen.cancelSentTable('T13', { actorProof: 'test-operator' });
ok(requested.cancelTable.expectedSession === 'ses-table-13' && screen.tables.T13.status === 'khawya',
  'cashier clears the exact cancelled visit only after canonical acknowledgement');
ok(screen.kdsOrders.length === 0 && !screen.opTickets.has(ticket.opId),
  'whole-table cancellation removes the cashier kitchen card and its relay index');

console.log(`\n✓ ${checks} table-action regression checks green.`);
