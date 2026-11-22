#!/usr/bin/env node
import caisseTestSource from './caisse-test-source.cjs';
/* Execute the shipped restaurant close function with a failing report store.
 * A toast or a static source check cannot prove the journal survives quota and
 * write failures: the shift must still be present and the count sheet usable. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = caisseTestSource(readFileSync(new URL('../kiwi-caisse.html', import.meta.url), 'utf8'));
const closeSource = caisseTestSource.declarations('openTableBills','renderOpenTableBills','registerClosed','closeGapReason','tillKitCount','CLOSE_STEP_TIMEOUT_MS','closeStepWithin','setCloseBusy','closeRegister','closeRegisterSteps');
const provisionalSource = caisseTestSource.declarations('lastProvisional','saveProvisional');

async function exercise(persist, opts = {}) {
  const calls = { cleared: 0, shown: 0, events: 0, finished: 0, toasts: [], sheetOpen: false, zJournal: null, timers: [], followUps: [] };
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
    /* The close announces itself on document; the follow-up listens (z-reconciliation.js). */
    CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init && init.detail; } },
    document: { dispatchEvent: (e) => { if (e.type === 'kiwi:till-closed') calls.followUps.push(e.detail); return true; } },
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

for (const failure of ['not-written', 'throws']) {
  const { calls, ctx } = await exercise(failure);
  assert.equal(calls.cleared, 0, `${failure}: shift remains on disk`);
  assert.equal(calls.events, 0, `${failure}: no false close ledger event`);
  assert.equal(ctx.registerClosing, false, `${failure}: cashier can retry`);
  assert.equal(calls.sheetOpen, true, `${failure}: count sheet reopens`);
  assert.match(calls.toasts.join(' '), /poste conservé/, `${failure}: error is explicit`);
}
/* 22 Nov 2026, browse: three closes in a row refused on « Rapprochement Z non
   protégé » while the day report had saved each time. The Z is a second copy
   for the server's comparison (sales sit in Live Link's own outbox): when it
   cannot be written, the close still completes, and the problem waits for
   the next opening instead of locking the till. */
const zFailed = await exercise('z-fails');
assert.equal(zFailed.calls.events, 1, 'z-fails: the close is recorded');
assert.equal(zFailed.calls.cleared, 1, 'z-fails: the shift ends');
assert.equal(zFailed.ctx.isClosed(), true, 'z-fails: the till knows it is closed');
assert.equal(zFailed.calls.shown, 1, 'z-fails: the post-close sheet opens');
assert.equal(zFailed.calls.followUps.length, 1, 'z-fails: the problem is kept for the next opening');
assert.equal(zFailed.calls.followUps[0].zIssue, 'unprotected', 'z-fails: it names the Z');
const success = await exercise('saved');
assert.equal(success.calls.followUps.length, 1, 'a close always leaves its summary for the next opening');
assert.equal(success.calls.followUps[0].zIssue || null, null, 'a protected Z carries no Z issue');
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
vm.runInContext(provisionalSource, provisionalContext, { filename: 'kiwi-caisse.html:saveProvisional' });
provisionalContext.saveProvisional(true);
assert.deepEqual(provisionalEntries.map((entry) => entry.id), ['paid', 'cancelled'],
  'provisional Z snapshot also receives void evidence from the full journal');

/* #0164 · a stalled Z write is announced, and a second tap is told the close
   is running instead of being swallowed; after the timeout the close
   completes (22 Nov 2026) instead of handing the till back. */
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
assert.equal(hung.calls.events, 1, 'z-hangs: after the timeout the close is recorded');
assert.equal(hung.calls.cleared, 1, 'z-hangs: the shift ends');
assert.equal(hung.calls.sheetOpen, false, 'z-hangs: the count sheet is closed');
assert.equal(hung.calls.followUps[0] && hung.calls.followUps[0].zIssue, 'unprotected', 'z-hangs: the stalled Z waits for the next opening');

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
