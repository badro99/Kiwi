#!/usr/bin/env node
/* #0068 · The physical evidence is a cashier receipt for table 13 #154 at
 * 00:04, the same 60 MAD still due on the tablet at 00:27, and the same
 * reference in the journal at 00:52. OrderPro was not used. Exercise the
 * cashier-origin visit before the first queue poll and after a reload.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = fs.readFileSync(path.join(ROOT, 'kiwi-caisse.html'), 'utf8');

const START = '    function attachOrderProTable(o) {';
const END = "\n    /* Une commande du serveur → un ticket d'ici.";
const a = source.indexOf(START);
const b = source.indexOf(END, a);
assert.notEqual(a, -1, 'attachOrderProTable exists');
assert.notEqual(b, -1, 'its end marker exists');
const fn = source.slice(a, b);

let passed = 0;
const ok = (label, cond) => { assert.ok(cond, label); passed++; console.log(`  ✓ ${label}`); };

function bench({ closedAt, seatSince, journal = [] }) {
  const tables = { 13: { status: 'khawya', covers: 0 } };
  const tableOrders = {};
  const phoneSeats = new Map();
  if (seatSince) phoneSeats.set('13', { session: 'sess-new', since: seatSince });
  const tableClosedAt = Object.create(null);
  if (closedAt) tableClosedAt['13'] = closedAt;
  const ctx = vm.createContext({
    tables, tableOrders, phoneSeats, tableClosedAt, journal,
    servers: {}, orders: {},
    selectedId: null, mode: 'salle',
    caisseTableId: (v) => String(v),
    tableKey: (v) => String(v),
    ticketNo: () => 'N°1',
    menuLineFind: () => null,
    newLineUid: () => 'uid-' + Math.random(),
    resetTableTimer() {}, startTableTimer() {},
    refreshTableNode() {}, renderRightPanel() {}, persistShift() {},
    locallySettledVisit: (id, session) => !!session && journal.some(entry => entry.visitClosed === true
      && entry.table === String(id) && entry.session === String(session)),
  });
  vm.runInContext(fn, ctx);
  return { ctx, tables, tableOrders };
}

/* Le bon de la soirée : un QR client, ni session ni serveur. */
const ticket = (createdTs) => ({
  id: 'op-13-a', mode: 'table', table: '13', status: 'pending',
  channel: 'kiwi', created_ts: createdTs, number: 41,
  lines: [{ id: 'p1', name: 'Pizza Royale', unitPrice: 95, qty: 1 }],
});

const SETTLED_AT = 1757635200000;   // l'encaissement

/* 1 · Le comportement qu'on veut garder : hors encaissement, le bon s'attache. */
{
  const { ctx, tableOrders, tables } = bench({});
  ok('un bon sans session s’attache normalement à une table ouverte',
    ctx.attachOrderProTable(ticket(SETTLED_AT)) === true
    && (tableOrders['13'] || []).length === 1
    && tables['13'].status === 'ka-yaklo');
}

/* 2 · Le bug : la même commande, après l'encaissement de la table. */
{
  const { ctx, tableOrders, tables } = bench({ closedAt: SETTLED_AT });
  const reattached = ctx.attachOrderProTable(ticket(SETTLED_AT - 60000));
  ok('un bon antérieur à l’encaissement ne rouvre plus la table', reattached === false);
  ok('la table réglée reste libre', tables['13'].status === 'khawya');
  ok('aucune note fantôme n’est reconstruite', !(tableOrders['13'] || []).length);
}

/* 3 · Ce que la garde ne doit PAS casser · une nouvelle commande, après. */
{
  const { ctx, tableOrders } = bench({ closedAt: SETTLED_AT });
  ok('une commande passée APRÈS l’encaissement ouvre bien la table suivante',
    ctx.attachOrderProTable(ticket(SETTLED_AT + 60000)) === true
    && (tableOrders['13'] || []).length === 1);
}

/* 4 · Un nouveau client s'assied avec son téléphone après le règlement : la
 *     table repart, et sa commande à lui s'attache comme avant. */
{
  const { ctx, tableOrders } = bench({ closedAt: SETTLED_AT, seatSince: SETTLED_AT + 30000 });
  ok('la table qui se rassied après le règlement accepte sa nouvelle commande',
    ctx.attachOrderProTable(ticket(SETTLED_AT + 45000)) === true
    && (tableOrders['13'] || []).length === 1);
}

/* 5 · Sans horodatage, on ne sait pas · et on ne refuse pas une vraie
 *     commande sur un soupçon. Perdre un plat coûte plus cher que rouvrir. */
{
  const { ctx, tableOrders } = bench({ closedAt: SETTLED_AT });
  const t = ticket(0); delete t.created_ts;
  ok('un bon sans horodatage reste accepté · le doute ne fait pas perdre une commande',
    ctx.attachOrderProTable(t) === true && (tableOrders['13'] || []).length === 1);
}

/* 6 · CE QUE CETTE GARDE NE COUVRE PAS, ET POURQUOI.
 *     `tableClosedAt` vit en mémoire : un F5 l'efface, et le bon déjà réglé
 *     redevient recevable jusqu'au prochain encaissement. C'est délibéré, pas
 *     un oubli · field-table-transfer-test exige explicitement que ces pierres
 *     tombales NE SOIENT PAS dans l'instantané du service (« close tombstones
 *     are not persisted »), sans quoi une table transférée puis rechargée
 *     perdrait la visite qu'on vient d'y déplacer. Fermer cette fenêtre-là
 *     demande de faire porter la preuve au serveur, pas au blob local.
 *     On verrouille les deux faits pour que personne ne « répare » l'un en
 *     cassant l'autre sans le voir. */
ok('la fermeture reste hors de l’instantané · les transferts en dépendent',
  !/tableClosedAt: tableClosedAt,/.test(source));
ok('la garde est bien en mémoire, dans la fonction de rattachement',
  /const closedAt = Number\(tableClosedAt\[tableKey\(id\)\] \|\| 0\);/.test(source));

/* 7 · Cashier kitchen relay returns a visit even if OrderPro is not enabled.
 * Payment must retain it before the first floor poll has populated seats. */
{
  const start = source.indexOf('    function relayToKitchen(order) {');
  const end = source.indexOf('\n    /* ═══════ REVENIR', start);
  assert.ok(start >= 0 && end > start, 'cashier relay is extractable');
  const tables = { 13: { orderNo: '154' } };
  const win = { KiwiKitchenRelay: {
    merchant: () => 'mixmax', newId: () => 'ord-caisse-154',
    send: async () => ({ ok: true, number: 154, session: 'ses-13-154' }),
  } };
  const ctx = vm.createContext({ window: win, KiwiKitchenRelay: win.KiwiKitchenRelay,
    tables, opTickets: new Map(), ticketNo: () => '154', reconcileReceiptOrderNumber() {},
    updateKdsCount() {}, kdsEl: { classList: { contains: () => false } },
    persistShift() {}, mode: 'salle', vrapView: '',
  });
  vm.runInContext(source.slice(start, end), ctx);
  const order = { type: 'dineIn', table: '13', num: 154, relayLines: [{ id: 'salad', name: 'Salade Maison', qty: 1 }] };
  await ctx.relayToKitchen(order);
  ok('cashier-origin queue response retains the canonical visit before the next poll',
    order.session === 'ses-13-154' && tables[13].timerSession === 'ses-13-154');

  const functionStart = source.indexOf('    function phoneSessionOf(id) {');
  const functionEnd = source.indexOf('    /* ═══════════════════════════════════════════════════════════════════════', functionStart);
  const paidStart = source.indexOf('    function markPaid(id) {');
  const paidEnd = source.indexOf('    /* ===========================================================', paidStart);
  assert.ok(functionStart >= 0 && functionEnd > functionStart && paidStart >= 0 && paidEnd > paidStart);
  const events = [];
  const receipt = { id: 'visit-ses-13-154-emp', table: '13', session: 'ses-13-154', amount: 60 };
  const payCtx = vm.createContext({ tables, tableOrders: { 13: [{ id: 'salad', qty: 1 }] }, orders: {},
    journal: [receipt], kdsOrders: [order], phoneSeats: new Map(), phonePending: new Map(),
    tableClosedAt: Object.create(null), tableKey: String,
    document: { dispatchEvent: event => events.push(event.detail) },
    CustomEvent: class { constructor(_, options) { this.detail = options.detail; } },
    resetTableTimer: table => { delete table.timerSession; }, refreshTableNode() {},
    persistShift() {}, renderShiftStats() {}, shift: { tablesPaid: 0 }, setTimeout() {}, Date,
  });
  vm.runInContext(source.slice(functionStart, functionEnd) + '\n' + source.slice(paidStart, paidEnd), payCtx);
  payCtx.markPaid('13');
  ok('cashier payment closes by the exact visit even before a phone-seat poll',
    events.length === 1 && events[0].session === 'ses-13-154' && events[0].why === 'settle');
  ok('paid visit is marked durably on its receipt for reload recovery', receipt.visitClosed === true);

  const stale = { id: 'ord-caisse-154', mode: 'table', table: '13', status: 'accepted',
    channel: 'caisse', session: 'ses-13-154', created_ts: SETTLED_AT - 60000,
    lines: [{ uid: 'line-salad', id: 'salad', name: 'Salade Maison', qty: 1, unitPrice: 60 }] };
  const reloaded = bench({ journal: [receipt] });
  ok('after reload, the paid CASHIER order cannot revive table 13',
    reloaded.ctx.attachOrderProTable(stale) === false
    && reloaded.tables[13].status === 'khawya' && !(reloaded.tableOrders[13] || []).length);
  const nextParty = bench({ journal: [receipt], seatSince: SETTLED_AT + 30000 });
  ok('the next visit at table 13 remains orderable', nextParty.ctx.attachOrderProTable({ ...stale,
    id: 'ord-new-party', session: 'sess-new', created_ts: SETTLED_AT + 45000 }) === true);
}

/* A second cashier confirmation of the same visit must reuse its receipt.
 * The server also deduplicates this visit ID, but the local journal/stock must
 * not double-count before its response arrives. */
{
  const start = source.indexOf('    function recordSale(amount, method, label, tip, lines, settlementTable, tenderOrder, split) {');
  const end = source.indexOf('    /* Every completed payment already exists', start);
  assert.ok(start >= 0 && end > start, 'recordSale is extractable');
  const journal = [];
  let discountCalls = 0;
  const saleCtx = vm.createContext({ journal, tables: { 13: { zone: 'salle' } }, mode: 'salle',
    selectedId: '13', currentCashier: { name: 'Hafid' }, window: {},
    money: Number, activeSaleDiscount: () => null, accountActiveDiscount: () => { discountCalls++; },
    phoneSessionOf: () => 'ses-13-154', settledOrderLabel: () => 'Table 13 #154',
    genRef: () => '154', attachReceipt() {}, persistShift() {}, creditSaleToClient() {},
    renderShiftStats() {}, refreshOpenReconciliationModals() {},
    $: () => ({ classList: { contains: () => false } }), Date,
  });
  vm.runInContext(source.slice(start, end), saleCtx);
  const first = saleCtx.recordSale(60, 'cash', 'Table 13 #154', 0,
    [{ id: 'salad', name: 'Salade Maison', qty: 1, price: 60, total: 60 }], '13');
  const replay = saleCtx.recordSale(60, 'cash', 'Table 13 #154', 0,
    [{ id: 'salad', name: 'Salade Maison', qty: 1, price: 60, total: 60 }], '13');
  ok('a repeated cashier confirmation keeps one journal row for visit #154',
    first === replay && journal.length === 1 && first.id === 'visit-ses-13-154-emp');
  ok('a repeated confirmation does not account its discount twice', discountCalls === 1);
}

console.log(`\nsettled-table-reopen-test: ${passed} controls passed\n`);
