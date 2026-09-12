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
ok(/rp-item--sent[\s\S]{0,420}data-cart-action="dec"/.test(caisse), 'sent line remains cancellable after reopening the menu');
ok(/function cancelSentTable[\s\S]{0,2600}canonicalNumberPromise[\s\S]{0,2600}cancelTable: \{ table: id, expectedSession \}, actorProof/.test(caisse)
  && /if \(!employee && !pinActor\)/.test(queue), 'whole-table cancellation waits for kitchen relay and uses a proved server-authoritative visit');
ok(/cancelSentTable\(tid, who\)/.test(caisse), 'Annuler table routes sent orders through canonical cancellation');
ok(/status <> 'rejected'/.test(queue), 'mobility leaves cancelled history at its original table');

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
