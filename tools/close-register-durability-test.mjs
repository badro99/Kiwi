#!/usr/bin/env node
/* Execute the shipped restaurant close function with a failing report store.
 * A toast or a static source check cannot prove the journal survives quota and
 * write failures: the shift must still be present and the count sheet usable. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../kiwi-caisse.html', import.meta.url), 'utf8');
const start = source.indexOf('    async function closeRegister()');
const end = source.indexOf('    const clockinBtn', start);
assert.ok(start >= 0 && end > start, 'real close function is available');
const closeSource = source.slice(start, end);
const provisionalStart = source.indexOf('    let lastProvisional = 0;');
const provisionalEnd = source.indexOf('    /* Les libellés du ticket.', provisionalStart);
assert.ok(provisionalStart >= 0 && provisionalEnd > provisionalStart, 'real provisional snapshot function is available');

async function exercise(persist) {
  const calls = { cleared: 0, shown: 0, events: 0, toasts: [], sheetOpen: false, zJournal: null };
  const report = { day: '2026-09-14', store: { slug: 'fixture-cafe' }, closedAt: 99, sessionId: 'fixture-shift', cash: {} };
  const count = { value: '100', focus() {} };
  const cardZ = { value: '0', focus() {} };
  const sheet = { classList: { add() { calls.sheetOpen = true; }, remove() { calls.sheetOpen = false; } } };
  const ctx = vm.createContext({
    registerClosing: false, clotureExpected: 0, currentCashier: { name: 'Amira' }, shiftOpenedAt: new Date(1),
    $: (selector) => selector === '#clo-count' ? count : (selector === '#clo-card-z' ? cardZ : sheet),
    reconcileJournalSales() {}, syncSettledBusinessDay: async () => ({ ok: true, complete: true, count: 0 }),
    buildDayReport: () => report,
    journal: [{ id: 'paid', amount: 5, voided: false }, { id: 'cancelled', amount: 5, voided: true }],
    isReportableJournalEntry: (entry) => !entry.voided,
    storeIsReal: () => true,
    window: { KiwiZReconciliation: { queueClose: async (_report, entries) => {
      calls.zJournal = entries;
      return { ok: persist !== 'z-fails' };
    } }, KiwiDayReport: {
      save() { if (persist === 'throws') throw new Error('quota'); return report; },
      load() { return persist === 'saved' || persist === 'z-fails' ? report : null; },
      isReal: () => true, flush() {},
    } },
    toast: (msg) => calls.toasts.push(msg), journalTotals: () => ({}), drawerExpected: () => 100,
    money: (n) => Math.round(Number(n) * 100) / 100, persistShift() {},
    minor: (n) => Math.round(n * 100), cashSessionId: () => 'fixture-shift', cashActorId: () => 'amira',
    emitCashSession: () => { calls.events++; }, clearPersistedShift: () => { calls.cleared++; },
    showPostClose: () => { calls.shown++; }, finishClose() {}, Date, Number, Math,
  });
  vm.runInContext(closeSource, ctx, { filename: 'kiwi-caisse.html:closeRegister' });
  await ctx.closeRegister();
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
console.log('close-register-durability-test: 19 checks passed');
