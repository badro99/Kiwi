#!/usr/bin/env node
/* End-of-day card reconciliation has two independent facts:
 *   1. Kiwi's card ledger for the whole commercial day.
 *   2. The total printed by the external terminal's Z report.
 * This test proves the comparison, multi-service carry, save idempotency and
 * the actual caisse/print wiring without touching merchant data. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const daySrc = fs.readFileSync(path.join(ROOT, 'assets/day-report.js'), 'utf8');
const caisse = fs.readFileSync(path.join(ROOT, 'kiwi-caisse.html'), 'utf8');
const escpos = fs.readFileSync(path.join(ROOT, 'assets/escpos.js'), 'utf8');
const bridge = fs.readFileSync(path.join(ROOT, 'assets/printer-bridge.js'), 'utf8');
let passed = 0;
function ok(value, label) { assert.ok(value, label); passed++; }

const memory = new Map();
const ls = {
  getItem: (key) => memory.has(key) ? memory.get(key) : null,
  setItem: (key, value) => memory.set(key, String(value)),
  removeItem: (key) => memory.delete(key),
};
ls.setItem('kiwiPairedVenue', JSON.stringify({ merchant: 'card-z-test', type: 'restaurant' }));
const context = vm.createContext({
  window: { localStorage: ls, addEventListener() {} }, localStorage: ls,
  Date, Math, JSON, RegExp, Array, Object, String, Number,
});
context.window.window = context.window;
vm.runInContext(daySrc, context, { filename: 'assets/day-report.js' });
const DR = context.window.KiwiDayReport;
const day = '2026-09-16';
const store = { slug: 'card-z-test', name: 'Card Z test', type: 'restaurant' };
const at = (iso) => Date.parse(iso);
const sale = (id, ts, amount, method = 'card') => ({ id, ts: at(ts), amount, method, ref: id });

const exact = DR.build({
  day, store, sales: [sale('c1', '2026-09-16T10:00:00Z', 250)],
  session: { sessionId: 'shift-exact', openedAt: at('2026-09-16T09:00:00Z'), terminalCardTotal: 250 },
});
ok(exact.cardReconciliation.kiwi === 250 && exact.cardReconciliation.terminal === 250,
  'the report keeps both independent card totals');
ok(exact.cardReconciliation.gap === 0 && exact.cardReconciliation.status === 'matched',
  'an exact centime match is named matched');

const terminalHigh = DR.build({
  day, store, sales: [sale('c2', '2026-09-16T10:01:00Z', 250)],
  session: { sessionId: 'shift-high', openedAt: at('2026-09-16T09:00:00Z'), terminalCardTotal: 260 },
});
ok(terminalHigh.cardReconciliation.gap === 10 && terminalHigh.cardReconciliation.status === 'gap',
  'positive gap means the terminal is 10 MAD above Kiwi');

const kiwiHigh = DR.build({
  day, store, sales: [sale('c3', '2026-09-16T10:02:00Z', 250)],
  session: { sessionId: 'shift-low', openedAt: at('2026-09-16T09:00:00Z'), terminalCardTotal: 240 },
});
ok(kiwiHigh.cardReconciliation.gap === -10,
  'negative gap means Kiwi is 10 MAD above the terminal');

const unverified = DR.build({
  day, store, sales: [sale('c4', '2026-09-16T10:03:00Z', 25)],
  session: { sessionId: 'shift-open', openedAt: at('2026-09-16T09:00:00Z') },
});
ok(unverified.cardReconciliation.terminal === null && unverified.cardReconciliation.status === 'unverified',
  'a provisional report never invents a terminal total');
ok(unverified.cash.sales === 0 && unverified.cash.expected === 0,
  'card reconciliation does not move the physical cash drawer');

/* First closed service: 100 card. */
const first = DR.build({
  day, store, sales: [sale('s1', '2026-09-16T18:00:00Z', 100)],
  session: {
    sessionId: 'shift-1', terminalId: 'till-1', openedAt: at('2026-09-16T17:00:00Z'),
    closedAt: at('2026-09-16T20:00:00Z'), terminalCardTotal: 100,
  },
});
DR.save(first, { by: 'Amira' });

/* Second service is after the first closure but before the 05:00 cutoff. */
const second = DR.build({
  day, store, sales: [sale('s2', '2026-09-16T22:00:00Z', 50)],
  session: {
    sessionId: 'shift-2', terminalId: 'till-1', openedAt: at('2026-09-16T21:00:00Z'),
    closedAt: at('2026-09-16T23:00:00Z'), terminalCardTotal: 150,
  },
});
const preview = DR.preview(second);
ok(preview.methods.card === 150 && preview.cardReconciliation.kiwi === 150,
  'closing preview compares against the full commercial-day card ledger');
ok(preview.cardReconciliation.status === 'matched',
  'the cumulative 150 MAD terminal Z matches the cumulative Kiwi day');
DR.save(preview, { by: 'Amira' });
const saved = DR.load(day, store.slug);
ok(saved.methods.card === 150 && saved.cardReconciliation.kiwi === 150,
  'saving a preview does not carry the first service twice');

/* Reclosing the same last shift recomputes on the original carried base. */
const revised = DR.build({
  day, store, sales: [sale('s2', '2026-09-16T22:00:00Z', 50), sale('s3', '2026-09-16T22:30:00Z', 25)],
  session: {
    sessionId: 'shift-2', terminalId: 'till-1', openedAt: at('2026-09-16T21:00:00Z'),
    closedAt: at('2026-09-16T23:30:00Z'), terminalCardTotal: 175,
  },
});
const revisedPreview = DR.preview(revised);
ok(revisedPreview.methods.card === 175 && revisedPreview.cardReconciliation.gap === 0,
  'same-shift revision inherits earlier services exactly once');

ok(caisse.includes('id="clo-card-z"') && caisse.includes('Total carte du Z terminal'),
  'the real closing sheet asks for the terminal Z total');
ok(caisse.includes("'Terminal + ' + fmtMAD(gap)") && caisse.includes("'Kiwi + ' + fmtMAD(Math.abs(gap))"),
  'the closing sheet names which ledger is higher');
ok(caisse.includes("Saisissez le total carte du Z terminal (0 si aucune carte)"),
  'closing is blocked until an explicit terminal total, including zero, is entered');
ok(caisse.includes('terminalCardTotal: typeof terminalCardTotal') && caisse.includes('d.terminalCardTotal'),
  'a valid terminal count survives a refresh before closing');
ok(escpos.includes("o.cardTitle || 'RAPPROCHEMENT CARTE'") && bridge.includes("o.cardTitle || 'RAPPROCHEMENT CARTE'"),
  'both ESC/POS and system-driver Z reports print the reconciliation');
ok(!caisse.includes('terminalCardTotal = window.KiwiHardware'),
  'the feature remains independent of terminal/ECR integration');

console.log(`card-z-reconciliation-test: ${passed} controls passed`);
