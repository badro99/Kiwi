#!/usr/bin/env node
/* A paid split can be resumed after a reload before its last tender. The last
 * receipt must retain the original bill, or void-and-reopen loses its lines. */
import fs from 'node:fs';
import vm from 'node:vm';
import { execFileSync } from 'node:child_process';

const baseline = process.env.REOPEN_RESUME_BASELINE === '1';
const html = baseline
  ? execFileSync('git', ['show', 'HEAD:kiwi-caisse.html'], { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 })
  : fs.readFileSync(new URL('../kiwi-caisse.html', import.meta.url), 'utf8');
const reprint = baseline
  ? execFileSync('git', ['show', 'HEAD:assets/pos-reprint.js'], { encoding: 'utf8' })
  : fs.readFileSync(new URL('../assets/pos-reprint.js', import.meta.url), 'utf8');
function section(start, end) {
  const a = html.indexOf(start), b = html.indexOf(end, a + start.length);
  if (a < 0 || b < 0) throw new Error('Missing till section: ' + start);
  return html.slice(a, b);
}
let passed = 0, failed = 0;
function check(label, condition) {
  if (condition) passed++;
  else { failed++; console.error('FAIL ' + label); }
}

const original = [{ name: 'Article libre', qty: 1, total: 10, price: 10 }];
const splits = new Map();
const state = { tableId: '1', isVrap: false, splitMode: 'egal', total: 10,
  sourceLabel: 'Table 1 #3', sourceLines: original.map(line => ({ ...line })),
  flow: { id: 'flow-3', session: 'visit-3', paidCount: 1, parts: [
    { amount: 5, paid: true, lines: [{ name: 'Article libre · 1/2', qty: 1, total: 5 }] },
    { amount: 5, paid: false, lines: [{ name: 'Article libre · 1/2', qty: 1, total: 5 }] },
  ] } };
const context = vm.createContext({ splitState: state, tableSplits: splits, vrapSplit: null,
  vrapEditingNum: null, mode: 'salle', tables: { '1': { covers: 2 } }, cart: [],
  splitPaidCount: saved => saved.parts.filter(part => part.paid).length,
  persistShift() {}, liveTableSplit: id => splits.get(id),
  generateOrder: () => [], lineLabel: line => line.name, String, Number, Array, Object });
vm.runInContext(section('    function saveSplitFlow() {', '    function renderRpSplitCard(id) {'), context);
context.saveSplitFlow();
check('backgrounded split persists the original bill lines',
  splits.get('1')?.sourceLines?.[0]?.name === 'Article libre');
original[0].name = 'Changed after payment';
check('saved bill lines are copied, not linked to mutable table state',
  splits.get('1')?.sourceLines?.[0]?.name === 'Article libre');
state.sourceLines = [];
check('split resumes after reload', context.loadSplitFlow('1') === true);
check('resumed last tender can snapshot the complete original bill',
  state.sourceLines[0]?.name === 'Article libre' && state.sourceLines[0]?.total === 10
    && state.flow.parts[1]?.amount === 5 && state.flow.paidCount === 1);
check('receipt capture falls back to table lines instead of freezing an empty snapshot',
  html.includes('Array.isArray(splitState.sourceLines) && splitState.sourceLines.length'));
check('an old empty snapshot cannot offer a server void followed by an empty reopened bill',
  reprint.includes('Array.isArray(entry.reopenSnapshot.lines) && entry.reopenSnapshot.lines.length'));

console.log(`restaurant reopen resume: ${passed} passed, ${failed} failed${baseline ? ' (baseline)' : ''}`);
if (failed) process.exitCode = 1;
