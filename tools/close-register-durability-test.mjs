#!/usr/bin/env node
/* Execute the shipped restaurant close function with a failing report store.
 * A toast or a static source check cannot prove the journal survives quota and
 * write failures: the shift must still be present and the count sheet usable. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../kiwi-caisse.html', import.meta.url), 'utf8');
const start = source.indexOf('    let registerClosed = false;');
const end = source.indexOf('    const clockinBtn', start);
assert.ok(start >= 0 && end > start, 'real close function is available');
const openStart = source.indexOf('    function openTableBills() {');
const openEnd = source.indexOf('    function renderCloture(', openStart);
assert.ok(openStart >= 0 && openEnd > openStart, 'real open-bill guard is available');
const closeSource = source.slice(openStart, openEnd) + source.slice(start, end);
const provisionalStart = source.indexOf('    let lastProvisional = 0;');
const provisionalEnd = source.indexOf('    /* Les libellés du ticket.', provisionalStart);
assert.ok(provisionalStart >= 0 && provisionalEnd > provisionalStart, 'real provisional snapshot function is available');

async function exercise(persist, opts = {}) {
  const calls = { cleared: 0, shown: 0, events: 0, finished: 0, toasts: [], sheetOpen: false, zJournal: null, timers: [] };
  const report = { day: '2026-09-14', store: { slug: 'fixture-cafe' }, closedAt: 99, sessionId: 'fixture-shift', cash: {} };
  const count = { value: '100', focus() {} };
  const cardZ = { value: '0', focus() {} };
  const sheet = { classList: { add() { calls.sheetOpen = true; }, remove() { calls.sheetOpen = false; } } };
  const ack = { checked: false };
  const openBox = { hidden: true, scrollIntoView() {} };
  const openLines = { innerHTML: '' };
  calls.openBox = openBox; calls.openLines = openLines; calls.ack = ack;
  const ctx = vm.createContext({
    registerClosing: false, clotureExpected: 0, currentCashier: { name: 'Amira' }, shiftOpenedAt: new Date(1),
    $: (selector) => ({ '#clo-count': count, '#clo-card-z': cardZ, '#clo-open-ack': ack, '#clo-open-box': openBox, '#clo-open-lines': openLines })[selector] || sheet,
    tableOrders: opts.tableOrders || {},
    fmtMAD: (n) => Number(n).toFixed(2).replace('.', ',') + ' MAD',
    reconcileJournalSales() {}, syncSettledBusinessDay: async () => ({ ok: true, complete: true, count: 0 }),
    buildDayReport: () => report,
    journal: [{ id: 'paid', amount: 5, voided: false }, { id: 'cancelled', amount: 5, voided: true }],
    isReportableJournalEntry: (entry) => !entry.voided,
    storeIsReal: () => true,
    window: { KiwiZReconciliation: { queueClose: (_report, entries) => {
      calls.zJournal = entries;
      if (persist === 'z-hangs') return new Promise(() => {});
      return Promise.resolve({ ok: persist !== 'z-fails' });
    } }, KiwiDayReport: {
      save() { if (persist === 'throws') throw new Error('quota'); return report; },
      load() { return ['saved', 'z-fails', 'z-hangs', 'sheet-throws'].includes(persist) ? report : null; },
      isReal: () => true, flush() {},
    } },
    toast: (msg) => calls.toasts.push(msg), journalTotals: () => ({}), drawerExpected: () => 100,
    money: (n) => Math.round(Number(n) * 100) / 100, persistShift() {},
    minor: (n) => Math.round(n * 100), cashSessionId: () => 'fixture-shift', cashActorId: () => 'amira',
    emitCashSession: () => { calls.events++; }, clearPersistedShift: () => { calls.cleared++; },
    showPostClose: () => { calls.shown++; if (persist === 'sheet-throws') throw new Error('sheet'); },
    finishClose() { calls.finished++; }, Date, Number, Math, Promise,
    setTimeout: (fn) => { calls.timers.push(fn); return calls.timers.length; }, clearTimeout() {},
  });
  vm.runInContext(closeSource + '\nthis.isClosed = () => registerClosed;', ctx, { filename: 'kiwi-caisse.html:closeRegister' });
  if (opts.ack) ack.checked = true;
  if (opts.beforeAwait) await opts.beforeAwait(ctx, calls);
  else await ctx.closeRegister();
  return { calls, ctx };
}

for (const failure of ['not-written', 'throws', 'z-fails']) {
  const { calls, ctx } = await exercise(failure);
  assert.equal(calls.cleared, 0, `${failure}: shift remains on disk`);
  assert.equal(calls.events, 0, `${failure}: no false close ledger event`);
  assert.equal(ctx.registerClosing, false, `${failure}: cashier can retry`);
  assert.equal(calls.sheetOpen, true, `${failure}: count sheet reopens`);
  assert.match(calls.toasts.join(' '), /poste conservé/, `${failure}: error is explicit`);
}
const success = await exercise('saved');
assert.deepEqual(success.calls.zJournal.map((entry) => entry.id), ['paid', 'cancelled'],
  'Z reconciliation receives void evidence even though the printed report excludes cancelled receipts');
assert.equal(success.calls.cleared, 1, 'saved report permits shift cleanup');
assert.equal(success.calls.events, 1, 'saved report emits one close event');
assert.equal(success.calls.shown, 1, 'saved report opens the post-close print choice');
const snapshotJournal = [{ id: 'paid', amount: 5, voided: false }, { id: 'cancelled', amount: 5, voided: true }];
let provisionalEntries = null;
const provisionalContext = vm.createContext({
  shiftOpenedAt: new Date(1), shiftOpenedBy: 'Amira', registerClosing: false, journal: snapshotJournal,
  reconcileJournalSales() {}, buildDayReport: () => ({ txns: 1, gross: 5 }),
  storeIsReal: () => true, isReportableJournalEntry: (entry) => !entry.voided,
  window: { KiwiDayReport: { save() {} }, KiwiZReconciliation: {
    queueSnapshot: (_report, entries) => { provisionalEntries = entries; return Promise.resolve({ ok: true }); },
  } }, toast() {}, Date,
});
vm.runInContext(source.slice(provisionalStart, provisionalEnd), provisionalContext, { filename: 'kiwi-caisse.html:saveProvisional' });
provisionalContext.saveProvisional(true);
assert.deepEqual(provisionalEntries.map((entry) => entry.id), ['paid', 'cancelled'],
  'provisional Z snapshot also receives void evidence from the full journal');

/* #0164 · a stalled Z write is announced, then fails safely; a second tap is
   told the close is running instead of being swallowed. */
const hung = await exercise('z-hangs', { beforeAwait: async (ctx, calls) => {
  const running = ctx.closeRegister();
  for (let i = 0; i < 6; i++) await Promise.resolve();
  assert.equal(ctx.registerClosing, true, 'z-hangs: close is in progress');
  assert.equal(calls.sheetOpen, false, 'z-hangs: sheet not reopened while running');
  await ctx.closeRegister();
  assert.match(calls.toasts.join(' '), /Clôture en cours/, 'z-hangs: a second tap is answered, not swallowed');
  calls.timers.splice(0).forEach((fn) => fn());
  await running;
} });
assert.equal(hung.ctx.registerClosing, false, 'z-hangs: cashier can retry after the timeout');
assert.equal(hung.calls.events, 0, 'z-hangs: no close event without a protected Z');
assert.equal(hung.calls.cleared, 0, 'z-hangs: shift stays on disk');
assert.equal(hung.calls.sheetOpen, true, 'z-hangs: count sheet reopens');

/* #0164 · once the close is recorded, a failing paper sheet still finishes
   the close, and any later attempt goes straight to finishClose(). */
const thrown = await exercise('sheet-throws');
assert.equal(thrown.calls.events, 1, 'sheet-throws: close recorded once');
assert.equal(thrown.calls.cleared, 1, 'sheet-throws: shift cleared');
assert.equal(thrown.calls.finished, 1, 'sheet-throws: finishClose runs instead of leaving the service on screen');
assert.equal(thrown.ctx.isClosed(), true, 'sheet-throws: close is remembered');
await thrown.ctx.closeRegister();
assert.equal(thrown.calls.events, 1, 'sheet-throws: a later tap records no second close');
assert.equal(thrown.calls.finished, 2, 'sheet-throws: a later tap finishes the close');

/* Production, 14 October: table 2 held four orders sent to the kitchen
   (131 MAD), never cashed, and the register was closed that evening. The
   close wiped the shift and the bill with it; the next day the table looked
   seated and empty and was reset. A close with an open bill now stops, names
   the table, and only goes through when the cashier ticks "Fermer quand même". */
const table2 = { 2: [
  { name: 'Lasagna', price: 69, qty: 1, sent: true }, { name: 'Coca-Cola', price: 15, qty: 1, sent: true },
  { name: 'Bonet', price: 35, qty: 1, sent: true }, { name: 'Eau', price: 12, qty: 1, committed: true },
  { name: 'brouillon', price: 50, qty: 1 },
], 7: [{ name: 'brouillon', price: 20, qty: 1 }] };
const blocked = await exercise('saved', { tableOrders: table2 });
assert.equal(blocked.calls.cleared, 0, 'open bill: the shift is not wiped');
assert.equal(blocked.calls.events, 0, 'open bill: no close is recorded');
assert.equal(blocked.ctx.registerClosing, false, 'open bill: the cashier can act and retry');
assert.match(blocked.calls.toasts.join(' '), /Table 2 encore ouverte/, 'open bill: the toast names table 2');
assert.equal(blocked.calls.openBox.hidden, false, 'open bill: the close sheet shows the open bills');
assert.match(blocked.calls.openLines.innerHTML, /Table 2[\s\S]*131,00 MAD/, 'open bill: table 2 at 131,00 (sent and validated lines, not the draft)');
assert.doesNotMatch(blocked.calls.openLines.innerHTML, /Table 7/, 'a table with only an unsent draft is not an open bill');
const acknowledged = await exercise('saved', { tableOrders: table2, ack: true });
assert.equal(acknowledged.calls.events, 1, 'ticked "Fermer quand même": the close goes through');
assert.equal(acknowledged.calls.cleared, 1, 'ticked: the shift is cleared as before');
const quiet = await exercise('saved', { tableOrders: { 7: table2[7] } });
assert.equal(quiet.calls.events, 1, 'no open bill: the close is unchanged');
assert.equal(quiet.calls.openBox.hidden, true, 'no open bill: nothing is shown');
console.log('close-register-durability-test: 42 checks passed');
