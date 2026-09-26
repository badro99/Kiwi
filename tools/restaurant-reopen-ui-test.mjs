#!/usr/bin/env node
import fs from 'node:fs';
import vm from 'node:vm';
import { execFileSync } from 'node:child_process';

const base = process.env.REOPEN_BASELINE === '1';
const source = file => base ? execFileSync('git', ['show', `HEAD:${file}`], { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 })
  : fs.readFileSync(new URL('../' + file, import.meta.url), 'utf8');
const till = source('kiwi-caisse.html');
const reprint = source('assets/pos-reprint.js');
const waiter = source('kiwi-serveur.html');
const queue = source('functions/api/order/queue.js');
let passed = 0, failed = 0;
function check(label, ok) { if (ok) passed++; else { failed++; console.error('FAIL ' + label); } }
const marker = 'window.KiwiRestaurantReopen = {';
const end = '/* End restaurant reopen bridge */';
check('restaurant bridge is present', till.includes(marker) && till.includes(end));
check('receipt freezes original bill and guest count before table clear',
  till.includes('entry.reopenSnapshot = {') && till.includes('covers: Math.max(1, Number(table.covers)'));
check('saved split retains identity and visit after background/reload',
  till.includes("id: String(splitState.flow.id || '')") && till.includes("session: String(splitState.flow.session || '')"));
check('cashier floor poll keeps an authorized reopen identity for crash recovery',
  till.includes('tables[id].reopenSessionId = String(state.reopenSessionId)')
  && till.includes('table.reopenSessionId === result.sessionId'));
check('reprint exposes explicit reopen choice alongside plain cancel',
  reprint.includes('Annuler et rouvrir la note') && reprint.includes('Annuler définitivement'));
check('cashier payload requests atomic reopen of selected free table',
  reprint.includes('reopenTable: opts.table') && reprint.includes('table occupée · rouvrir sur une autre table'));
check('a crash after the floor reopens can retry even when that table now looks occupied',
  reprint.includes('occupée / reprise existante') && reprint.includes('candidates.push(originalTable)'));
check('waiter queue exposes only the live reopened visit as read-only floor context',
  queue.includes('export async function reopenedFloorBills')
  && queue.includes('return (rows.results || []).flatMap')
  && queue.includes("active.get(String(impact.sessionId || ''))")
  && queue.includes('reopenedBillsAvailable: reopenedBills !== null'));
check('waiter cannot pay or erase a reopened bill as a zero-MAD order',
  waiter.includes("serviceReopenedBills.set(id, bill)")
  && waiter.includes("$('#td-footer').innerHTML = '<button class=\"td-btn ghost\" disabled>Encaisser cette note au comptoir</button>'")
  && waiter.includes('!serviceReopenedBillsAvailable || serviceReopenedBills.has(activeTableId)'));

if (till.includes(marker) && till.includes(end)) {
  const section = till.slice(till.indexOf(marker), till.indexOf(end, till.indexOf(marker)));
  const tables = {
    '1': { status: 'khawya', covers: 0, timerSession: '' },
    '2': { status: 'ka-yaklo', covers: 2, timerSession: 'other-party' },
  };
  const journal = [
    { id: 'card-live', split: { flowId: 'split-a', index: 0 }, method: 'card', voided: false },
    { id: 'cash-void', split: { flowId: 'split-a', index: 1 }, method: 'cash', voided: false },
  ];
  const tableOrders = {}, orders = {}, tableClosedAt = { '1': Date.now() }, tableSplits = new Map();
  let persisted = 0, opened = '';
  const context = {
    window: { KiwiLive: { saleIdFor: row => row.id } }, tables, journal, tableOrders, orders,
    tableClosedAt, tableSplits, phoneSeats: new Map(),
    tableKey: value => String(value), currentMerchantSlug: () => 'fixture',
    money: value => Math.round(value * 100) / 100,
    splitPaidCount: state => state.parts.filter(part => part.paid).length,
    tableSaleLabel: (id, no) => `Table ${id} #${no}`,
    refreshTableNode() {}, persistShift() { persisted++; }, openTable(id) { opened = id; },
    Date, Number, String, Object, Array, Math,
  };
  try {
    vm.runInNewContext(section, context, { filename: 'restaurant-reopen-bridge.js' });
    const bridge = context.window.KiwiRestaurantReopen;
    const receipt = { saleId: 'cash-void', reopenSnapshot: {
      table: '1', covers: 2, orderNo: '77', ref: 'Table 1 #77',
      lines: [{ name: 'Article libre', qty: 2, total: 10 }],
      split: { id: 'split-a', total: 10, mode: 'egal', parts: [
        { amount: 5, paid: true, payMethod: 'carte', lines: [] },
        { amount: 5, paid: true, payMethod: 'cash', lines: [] },
      ] },
    } };
    check('occupied new party is not offered as a free table',
      bridge.freeTables('1').includes('1') && !bridge.freeTables('1').includes('2'));
    check('reopened receipt applies to its original free table', bridge.apply({
      table: '1', sessionId: 'tsx-new-visit', ref: 'Table 1 #77', splitFlowId: 'split-a',
    }, receipt));
    check('only voided split part becomes payable', journal[1].voided === true
      && journal[0].voided === false && tableSplits.get('1')?.paidCount === 1
      && tableSplits.get('1')?.parts[0]?.paid === true && tableSplits.get('1')?.parts[1]?.paid === false);
    check('same bill, guests and visit survive locally', tables['1'].covers === 2
      && tables['1'].orderNo === '77' && tables['1'].reopenRef === 'Table 1 #77'
      && tables['1'].timerSession === 'tsx-new-visit' && tableOrders['1'][0].qty === 2
      && tableOrders['1'][0].price * tableOrders['1'][0].qty === 10
      && persisted === 1 && opened === '1');
    check('never overwrite an occupied table', bridge.apply({ table: '2', sessionId: 'tsx-bad' }, receipt) === false
      && tables['2'].timerSession === 'other-party');
    tables['3'] = { status: 'bgha-ykhlass', covers: 2, timerSession: '', reopenSessionId: 'tsx-recover' };
    check('retry after reload restores a floor-confirmed reopen without overwriting a new party',
      bridge.apply({ table: '3', sessionId: 'tsx-recover', ref: 'Table 1 #77' }, receipt)
      && tables['3'].timerSession === 'tsx-recover' && !tables['3'].reopenSessionId
      && tableOrders['3'][0].name === 'Article libre');
  } catch (error) {
    failed++;
    console.error('FAIL bridge execution: ' + error.stack);
  }
}
console.log(`restaurant reopen UI: ${passed} passed, ${failed} failed${base ? ' (baseline)' : ''}`);
if (failed) process.exitCode = 1;
