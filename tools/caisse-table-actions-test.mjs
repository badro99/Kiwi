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
ok(/data-table-void/.test(caisse) && /openCaisseVoidModal\(selectedId, line\)/.test(caisse), 'sent bill line exposes the audited kitchen cancellation');
ok(/const sent = sendTableToKitchen\(tableId\);[\s\S]{0,700}if \(selectedId === tableId\) renderRightPanel\(tableId\);/.test(caisse),
  'sending to kitchen immediately rerenders the bill with sent-item cancellation controls');
ok(/or-item-void-btn[\s\S]{0,180}data-review-action="void"/.test(caisse)
  && /closeOrderReviewModal\(\);[\s\S]{0,120}openCaisseVoidModal\(selectedId, line\)/.test(caisse),
  'full bill exposes sent-item cancellation through the same audited void flow');
ok(/const liveLines = tableOrders\[tableId\][\s\S]{0,120}liveLines\.length[\s\S]{0,420}sent: !!l\.sent/.test(caisse),
  'cashier-built Atlas lines win over stale generated demo bills and preserve cancellation identity');
ok(/rp-item--sent[\s\S]{0,420}data-cart-action="dec"/.test(caisse), 'sent line remains cancellable after reopening the menu');
ok(/function cancelSentTable[\s\S]{0,2600}canonicalNumberPromise[\s\S]{0,2600}cancelTable: \{ table: id, expectedSession \}, actorProof/.test(caisse)
  && /if \(!employee && !pinActor\)/.test(queue), 'whole-table cancellation waits for kitchen relay and uses a proved server-authoritative visit');
ok(/cancelSentTable\(tid, who\)/.test(caisse), 'Annuler table routes sent orders through canonical cancellation');
ok(/status <> 'rejected'/.test(queue), 'mobility leaves cancelled history at its original table');

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
