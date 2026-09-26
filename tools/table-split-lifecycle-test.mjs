#!/usr/bin/env node
/* A completed split belongs to one visit, never to the next party at a table.
 * Run the shipped till functions, not a reimplementation of their behavior. */
import fs from 'node:fs';
import vm from 'node:vm';
import { execFileSync } from 'node:child_process';

const baseline = process.env.SPLIT_BASELINE === '1';
const source = baseline
  ? execFileSync('git', ['show', 'HEAD:kiwi-caisse.html'], { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 })
  : fs.readFileSync(new URL('../kiwi-caisse.html', import.meta.url), 'utf8');
const section = (start, end) => {
  const at = source.indexOf(start);
  if (at < 0) throw new Error('Missing till function: ' + start);
  const stop = source.indexOf(end, at + start.length);
  if (stop < 0) throw new Error('Missing till boundary: ' + end);
  return source.slice(at, stop);
};
let passed = 0, failed = 0;
function check(ok, description) {
  if (ok) passed++;
  else { failed++; console.error('FAIL ' + description); }
}

{
  const splits = new Map([['1', { id: 'old-party', paidCount: 2, parts: [{ paid: true }, { paid: true }] }]]);
  const context = vm.createContext({
    newTableId: '1', newTableCovers: 2, tableSplits: splits,
    tables: { '1': { status: 'khawya', covers: 0 } }, tableOrders: {}, tableClosedAt: {},
    serviceFloorLocalVersion: {}, serviceFloorRemoteVersion: {},
    $: () => ({ classList: { remove() {} } }), resetTableTimer() {},
    tableKey: value => value, refreshTableNode() {}, setMode() {}, Date, Math,
  });
  vm.runInContext(section('    function confirmNewTable() {', "    document.getElementById('new-table-modal')"), context);
  context.confirmNewTable();
  check(context.tables['1'].status === 'ka-yaklo' && !splits.has('1'),
    'a new party cannot inherit an old fully paid split');
}

{
  const splits = new Map([['1', { id: 'finished-flow', paidCount: 2 }]]);
  const context = vm.createContext({
    tables: { '1': { status: 'bgha-ykhlass', covers: 2, orderNo: '77' } },
    tableSplits: splits, tableOrders: { '1': [{ name: 'Article libre' }] }, orders: {},
    phoneSessionOf: () => '', journal: [], kdsOrders: [],
    releasePhoneTable() {}, resetTableTimer() {}, refreshTableNode() {},
    shift: { tablesPaid: 0 }, renderShiftStats() {}, persistShift() {},
    setTimeout() {},
  });
  vm.runInContext(section('    function markPaid(id) {', '    /* ===========================================================\n       Vente rapida'), context);
  context.markPaid('1');
  check(context.tables['1'].status === 'khlass' && !splits.has('1'),
    'settling the final split part clears its active table flow');
}

const cancelledSent = section('    async function cancelSentTable(id, who) {', '    /* Cancel an open table from Salle');
const cancelledOpen = section('    function cancelOpenTable(id, who = null) {', '    /*');
check(cancelledSent.includes('tableSplits.delete(id)') && cancelledOpen.includes('tableSplits.delete(id)'),
  'both whole-table cancellation paths discard the abandoned split');

if (source.includes('    function liveTableSplit(id) {')) {
  const splits = new Map([['1', { session: 'old-visit', parts: [{ paid: true }, { paid: true }] }]]);
  let persists = 0;
  const context = vm.createContext({
    tableSplits: splits, tables: { '1': { timerSession: 'new-visit' } },
    phoneSessionOf: () => 'new-visit',
    splitPaidCount: saved => saved.parts.filter(part => part.paid).length,
    persistShift() { persists++; }, String, Array,
  });
  vm.runInContext(section('    function liveTableSplit(id) {', '    function splitRemainingTotal(saved) {'), context);
  check(context.liveTableSplit('1') === null && !splits.has('1') && persists === 1,
    'an old completed split is rejected when a waiter or phone opens a new visit');
  splits.set('1', { session: 'new-visit', parts: [{ paid: true }, { paid: false }] });
  check(context.liveTableSplit('1')?.parts[0].paid && splits.has('1'),
    'a genuine partially paid split remains payable on its own visit');
  splits.set('1', { session: 'old-visit', parts: [{ paid: true }, { paid: false }] });
  check(context.liveTableSplit('1') === null && !splits.has('1'),
    'a partially paid split from another visit cannot charge the next party');
} else {
  check(false, 'an old completed split is rejected when a waiter or phone opens a new visit');
  check(false, 'a genuine partially paid split remains payable on its own visit');
  check(false, 'a partially paid split from another visit cannot charge the next party');
}

check(source.includes('const savedSplit = liveTableSplit(id);')
  && source.includes('const saved = isVrap ? vrapSplit : liveTableSplit(tableId);')
  && source.includes('const saved = liveTableSplit(id);'),
  'bill display, split card and resume all share the visit-bound validation');

console.log(`table split lifecycle: ${passed} passed, ${failed} failed${baseline ? ' (baseline)' : ''}`);
if (failed) process.exitCode = 1;
