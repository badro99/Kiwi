#!/usr/bin/env node
/* Focused regressions for the 2026-09-08 money audit.
 *
 * This file intentionally runs the shipped cash-session module and sale routes,
 * backed by an in-memory SQLite database through a small D1-shaped adapter. The
 * caisse closure probe evaluates the actual function body from kiwi-caisse.html;
 * it is not a reimplementation of the behavior under test.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { onRequestPost as refundPost } from '../functions/api/sale/refund.js';
import { onRequestPost as cancelPost } from '../functions/api/sale/cancel.js';
import { managerRefundProof, tillToken } from '../functions/auth/_lib.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const audit = (label, condition) => {
  assert.ok(condition, label);
  console.log('  ✓ ' + label);
};

/* ── F01/F02 · actual cash-session browser module ───────────────────────── */
const cashSource = fs.readFileSync(path.join(ROOT, 'assets/cash-sessions.js'), 'utf8');
function cashFixture() {
  const storage = new Map();
  const pending = [];
  const window = {
    KiwiEnv: { isReal: () => true },
    KiwiCloudDoc: { currentSlug: () => 'audit-money' },
    dispatchEvent() {},
  };
  const context = {
    window,
    localStorage: {
      getItem(key) { return storage.has(key) ? storage.get(key) : null; },
      setItem(key, value) { storage.set(key, value); },
    },
    document: { readyState: 'loading', addEventListener() {} },
    crypto, Date, Math, JSON, CustomEvent,
    setTimeout() {},
    fetch(_url, options) {
      return new Promise((resolve) => pending.push({ resolve, event: JSON.parse(options.body) }));
    },
  };
  vm.runInNewContext(cashSource, context, { filename: 'assets/cash-sessions.js' });
  return { api: window.KiwiCashSessions, pending };
}

for (const status of [403, 409]) {
  const f = cashFixture();
  f.api.emit({ id: `cash-${status}`, sessionId: 'shift-1', eventType: 'open', occurredAt: 1 });
  assert.equal(f.pending.length, 1);
  f.pending[0].resolve({ ok: false, status });
  await new Promise((resolve) => setImmediate(resolve));
  audit(`cash event survives HTTP ${status} for later recovery`, f.api._test.readOutbox().length === 1);
  f.api._test.flush();
  f.pending[1]?.resolve({ ok: true, status: 201 });
  await new Promise((resolve) => setImmediate(resolve));
  audit(`cash event retries with the same ID after HTTP ${status}`, f.pending.at(-1)?.event.id === `cash-${status}`);
}

{
  const f = cashFixture();
  f.api.emit({ id: 'cash-422', sessionId: 'shift-1', eventType: 'close', occurredAt: 3 });
  f.pending[0].resolve({ ok: false, status: 422 });
  await new Promise((resolve) => setImmediate(resolve));
  audit('HTTP 422 moves the cash event to a durable rejected queue',
    f.api._test.readOutbox().length === 0
    && f.api._test.readRejected().some((event) => event.id === 'cash-422'
      && event.deliveryStatus === 'rejected' && event.rejectedStatus === 422));
}

{
  const f = cashFixture();
  for (let i = 0; i < 205; i += 1) {
    f.api.emit({ id: `cash-overflow-${i}`, sessionId: 'shift-1', eventType: 'movement', occurredAt: i + 10 });
  }
  audit('cash outbox preserves events beyond the former 200-row window', f.api._test.readOutbox().length === 205);
}

{
  const f = cashFixture();
  f.api.emit({ id: 'cash-a', sessionId: 'shift-1', eventType: 'open', occurredAt: 1 });
  f.api.emit({ id: 'cash-b', sessionId: 'shift-1', eventType: 'movement', occurredAt: 2 });
  assert.equal(f.pending.length, 1, 'the first send owns the flush lock');
  f.pending[0].resolve({ ok: true, status: 201 });
  await new Promise((resolve) => setImmediate(resolve));
  audit('acknowledging A does not erase newer unsent B', f.api._test.readOutbox().map((x) => x.id).join() === 'cash-b');
  f.api._test.flush();
  audit('B is sent after A with its own durable ID', f.pending.length === 2 && f.pending[1].event.id === 'cash-b');
  f.pending[1].resolve({ ok: true, status: 201 });
  await new Promise((resolve) => setImmediate(resolve));
  audit('both cash-session events are eventually acknowledged', f.api._test.readOutbox().length === 0);
}

/* ── F04/F05 · actual D1-shaped routes and SQLite atomicity ──────────────── */
const sqlite = new DatabaseSync(':memory:');
sqlite.exec(fs.readFileSync(path.join(ROOT, 'schema.sql'), 'utf8'));
const secret = 'audit-money-secret';
const merchant = 'audit-money';
const now = Date.now();
sqlite.prepare(`INSERT INTO merchant_config
  (merchant, features, type, account_id, name, status, updated_ts)
  VALUES (?, '{}', 'restaurant', NULL, 'Audit Money', 'active', ?)`).run(merchant, now);
sqlite.prepare(`INSERT INTO staff_pins
  (id, merchant, pin, name, role, created_ts)
  VALUES ('audit-manager', ?, '2819', 'Sara', 'manager', ?)`).run(merchant, now);
sqlite.prepare(`INSERT INTO sales
  (id, merchant, amount, amount_cents, method, label, ref, ts, lines, channel)
  VALUES ('audit-sale', ?, 100, 10000, 'cash', 'Audit sale', 'AUD-1', ?,
          '[{"n":"Plat","q":1,"t":100}]', 'caisse')`).run(merchant, now - 1000);
sqlite.prepare(`INSERT INTO sales
  (id, merchant, amount, amount_cents, method, label, ref, ts, lines, channel)
  VALUES ('audit-concurrent-sale', ?, 50, 5000, 'cash', 'Concurrent sale', 'AUD-CONCURRENT', ?,
          '[{"n":"Plat","q":1,"t":50}]', 'caisse')`).run(merchant, now - 1000);

let faultAuditInsert = false;
let concurrentSaleReads = 0;
let releaseConcurrentSaleReads;
const concurrentSaleReadBarrier = new Promise((resolve) => { releaseConcurrentSaleReads = resolve; });
let batchQueue = Promise.resolve();
const DB = {
  prepare(sql) {
    let args = [];
    const statement = {
      sql,
      bind(...values) { args = values; return statement; },
      async first() {
        if (args[0] === 'audit-concurrent-sale' && /FROM sales/i.test(sql)) {
          concurrentSaleReads += 1;
          if (concurrentSaleReads === 2) releaseConcurrentSaleReads();
          if (concurrentSaleReads < 2) await concurrentSaleReadBarrier;
        }
        return sqlite.prepare(sql).get(...args) || null;
      },
      async all() { return { results: sqlite.prepare(sql).all(...args) }; },
      async run() {
        if (faultAuditInsert && /INSERT\s+(?:OR\s+IGNORE\s+)?INTO\s+sale_audit/i.test(sql)) {
          throw new Error('injected-audit-write-failure');
        }
        const result = sqlite.prepare(sql).run(...args);
        return { meta: { changes: result.changes, last_row_id: result.lastInsertRowid }, changes: result.changes };
      },
    };
    return statement;
  },
  batch(statements) {
    const runBatch = async () => {
      sqlite.exec('BEGIN IMMEDIATE');
      try {
        const results = [];
        for (const statement of statements) results.push(await statement.run());
        sqlite.exec('COMMIT');
        return results;
      } catch (error) {
        sqlite.exec('ROLLBACK');
        throw error;
      }
    };
    const result = batchQueue.then(runBatch, runBatch);
    batchQueue = result.catch(() => {});
    return result;
  },
};
const till = await tillToken(secret, merchant);
const cookieHeaders = { 'content-type': 'application/json', cookie: `kiwi_till=${till}` };
const env = { DB, AUTH_SECRET: secret };

async function refund(id, amountCents) {
  const approval = await managerRefundProof(secret, {
    merchant, staffId: 'audit-manager', staffName: 'Sara', staffRole: 'manager',
    refundId: id, originalSaleId: 'audit-sale', amountCents,
  });
  return refundPost({
    env,
    request: new Request('https://kiwi.test/api/sale/refund', {
      method: 'POST', headers: cookieHeaders,
      body: JSON.stringify({ merchant, id, originalSaleId: 'audit-sale', amountCents, approval }),
    }),
  });
}

const refundResponses = await Promise.all([refund('audit-refund-a', 8000), refund('audit-refund-b', 8000)]);
const refundStatuses = refundResponses.map((r) => r.status).sort((a, b) => a - b);
audit('concurrent refunds accept only one amount within the original balance', refundStatuses.join(',') === '200,409');
const rejectedRefundId = refundResponses[0].status === 409 ? 'audit-refund-a' : 'audit-refund-b';
audit('rejected refund creates no durable negative sale or audit row',
  sqlite.prepare('SELECT COUNT(*) AS n FROM sales WHERE channel=\'refund\' AND id=?').get(rejectedRefundId).n === 0
  && sqlite.prepare('SELECT COUNT(*) AS n FROM sale_audit WHERE action=\'refund\' AND note=?').get(rejectedRefundId).n === 0);

const noBatchResponse = await cancelPost({
  env: { ...env, DB: { prepare: DB.prepare } },
  request: new Request('https://kiwi.test/api/sale/cancel', {
    method: 'POST', headers: cookieHeaders,
    body: JSON.stringify({ merchant, id: 'audit-sale', pin: '2819', source: 'cashier', reason: 'no-batch' }),
  }),
});
audit('cancel refuses adapters without an atomic batch primitive',
  noBatchResponse.status === 503
  && sqlite.prepare("SELECT void_ts FROM sales WHERE id='audit-sale'").get().void_ts == null);

const originalNow = Date.now;
const frozenVoidTs = now;
Date.now = () => frozenVoidTs;
let concurrentVoidResponses;
try {
  concurrentVoidResponses = await Promise.all([
    cancelPost({
      env,
      request: new Request('https://kiwi.test/api/sale/cancel', {
        method: 'POST', headers: cookieHeaders,
        body: JSON.stringify({ merchant, id: 'audit-concurrent-sale', pin: '2819', source: 'cashier', reason: 'same-ms-a' }),
      }),
    }),
    cancelPost({
      env,
      request: new Request('https://kiwi.test/api/sale/cancel', {
        method: 'POST', headers: cookieHeaders,
        body: JSON.stringify({ merchant, id: 'audit-concurrent-sale', pin: '2819', source: 'cashier', reason: 'same-ms-b' }),
      }),
    }),
  ]);
} finally {
  Date.now = originalNow;
}
const concurrentVoidStatuses = concurrentVoidResponses.map((r) => r.status).sort((a, b) => a - b);
audit('same-millisecond concurrent voids produce one winner and one conflict', concurrentVoidStatuses.join(',') === '200,409');
audit('same-millisecond loser cannot append a duplicate void audit',
  sqlite.prepare("SELECT COUNT(*) AS n FROM sale_audit WHERE sale_id='audit-concurrent-sale' AND action='void'").get().n === 1);

faultAuditInsert = true;
const voidResponse = await cancelPost({
  env,
  request: new Request('https://kiwi.test/api/sale/cancel', {
    method: 'POST', headers: cookieHeaders,
    body: JSON.stringify({ merchant, id: 'audit-sale', pin: '2819', source: 'cashier', reason: 'mistake' }),
  }),
});
audit('audit failure returns an error without committing the void', voidResponse.status === 500);
audit('money state and audit state remain coupled after audit failure',
  sqlite.prepare("SELECT void_ts FROM sales WHERE id='audit-sale'").get().void_ts == null
  && sqlite.prepare("SELECT COUNT(*) AS n FROM sale_audit WHERE sale_id='audit-sale' AND action='void'").get().n === 0);
faultAuditInsert = false;
const successfulVoid = await cancelPost({
  env,
  request: new Request('https://kiwi.test/api/sale/cancel', {
    method: 'POST', headers: cookieHeaders,
    body: JSON.stringify({ merchant, id: 'audit-sale', pin: '2819', source: 'cashier', reason: 'mistake' }),
  }),
});
audit('successful void commits its required audit row atomically',
  successfulVoid.status === 200
  && sqlite.prepare("SELECT void_ts FROM sales WHERE id='audit-sale'").get().void_ts != null
  && sqlite.prepare("SELECT COUNT(*) AS n FROM sale_audit WHERE sale_id='audit-sale' AND action='void'").get().n === 1);
const duplicateVoid = await cancelPost({
  env,
  request: new Request('https://kiwi.test/api/sale/cancel', {
    method: 'POST', headers: cookieHeaders,
    body: JSON.stringify({ merchant, id: 'audit-sale', pin: '2819', source: 'cashier', reason: 'second-click' }),
  }),
});
audit('a duplicate void is rejected without a second audit event',
  duplicateVoid.status === 409
  && sqlite.prepare("SELECT COUNT(*) AS n FROM sale_audit WHERE sale_id='audit-sale' AND action='void'").get().n === 1);

/* ── F04 · actual caisse picker / state rules ────────────────────────────── */
const caisseSource = fs.readFileSync(path.join(ROOT, 'kiwi-caisse.html'), 'utf8');
audit('refund picker excludes voided originals',
  caisseSource.includes(".filter(e => !e.voided && e.kind !== 'refund' && e.amount > 0)")
  || caisseSource.includes(".filter(e => !e.voided && e.kind !== 'refund' && e.amount > 0)"));
audit('refund sync has an explicit rejected state and preserves cash exceptions',
  caisseSource.includes("refundSyncStatus = 'rejected'")
  && caisseSource.includes('cashHandedOut')
  && caisseSource.includes('refundLedgerReversed'));

/* The source checks above cannot prove the report path. Run the actual
 * aggregator and buildDayReport functions with a journal fixture instead. */
const refundExceptionFn = caisseSource.match(/function refundHasCashException\(entry\) \{[\s\S]*?\n    \}/)?.[0];
const reportableFn = caisseSource.match(/function isReportableJournalEntry\(entry\) \{[\s\S]*?\n    \}/)?.[0];
const rollupFn = caisseSource.match(/function rollupLedger\(sinceMs\) \{[\s\S]*?\n    \}\n\n    \/\* Roll up the ledger/)?.[0]?.replace(/\n\n    \/\* Roll up the ledger[\s\S]*$/, '');
const totalsFn = caisseSource.match(/function journalTotals\(\) \{[\s\S]*?\n    \}/)?.[0];
const buildFn = caisseSource.match(/function buildDayReport\(counted, closedAt\) \{[\s\S]*?\n    \}\n    \/\* The local journal/)?.[0]?.replace(/\n    \/\* The local journal[\s\S]*$/, '');
assert.ok(refundExceptionFn && reportableFn && rollupFn && totalsFn && buildFn,
  'actual refund aggregation functions are extractable');
const journalFixture = [
  { id: 'sale-1', ref: 'R-1', amount: 100, method: 'cash', time: new Date('2026-09-08T10:00:00Z') },
  { id: 'refund-rejected', ref: 'R-REFUSED', refundOf: 'R-1', kind: 'refund', amount: -30,
    method: 'cash', refundSyncStatus: 'rejected', time: new Date('2026-09-08T10:01:00Z') },
  { id: 'refund-cash-out', ref: 'R-CASH', refundOf: 'R-1', kind: 'refund', amount: -20,
    method: 'cash', refundSyncStatus: 'rejected', cashHandedOut: true,
    refundReconciliation: 'cash-handed-out', time: new Date('2026-09-08T10:02:00Z') },
];
const aggregate = new Function('journal', 'cashMovements', 'minor', 'major',
  `${refundExceptionFn}\n${reportableFn}\n${rollupFn}\n${totalsFn}\nreturn journalTotals;`)(
    journalFixture, [], (value) => Math.round(Number(value || 0) * 100), (value) => Number(value || 0) / 100,
  );
const aggregateResult = aggregate();
audit('rejected non-cash refund is excluded from actual journal totals',
  aggregateResult.revenue === 80 && aggregateResult.txns === 1 && aggregateResult.cash === 80);

let builtReportInput = null;
const reportWindow = {
  KiwiDayReport: {
    businessDay: () => '2026-09-08', storeSlug: () => merchant,
    build(input) { builtReportInput = input; return input; },
  },
};
const buildReport = new Function('journal', 'window', 'shiftOpenedAt', 'dayReportSession',
  'currentBusinessDay', 'storeName', 'storeCity', 'storePaired',
  `${refundExceptionFn}\n${reportableFn}\n${buildFn}\nreturn buildDayReport;`)(
    journalFixture, reportWindow, new Date('2026-09-08T10:00:00Z'), () => ({}),
    () => '2026-09-08', () => 'Audit Money', () => 'Test', () => ({ type: 'restaurant' }),
  );
buildReport(null, Date.now());
audit('buildDayReport excludes the rejected refund but retains the cash-handed-out exception',
  builtReportInput && builtReportInput.sales.length === 2
  && builtReportInput.sales.some((entry) => entry.ref === 'R-CASH')
  && !builtReportInput.sales.some((entry) => entry.ref === 'R-REFUSED'));

/* ── F03 · actual closure reconciliation function ────────────────────────── */
const closeFnMatch = caisseSource.match(/function syncSettledBusinessDay\(\) \{[\s\S]*?\n    \}/);
assert.ok(closeFnMatch, 'actual closure reconciliation function is extractable');
const makeSync = (feed, delayMs = 0) => {
  const opened = new Date('2026-09-08T10:00:00Z');
  const ingested = [];
  const fetchImpl = (_url, options) => new Promise((resolve) => {
    const finish = () => resolve({ ok: true, json: async () => feed });
    if (delayMs) setTimeout(finish, delayMs);
    else finish();
    void options;
  });
  const sync = new Function('shiftOpenedAt', 'currentMerchantSlug', 'fetch', 'ingestSettledCloudSales', 'refreshOpenReconciliationModals',
    `return (${closeFnMatch[0]});`)(
      opened, () => merchant, fetchImpl, (sales) => { ingested.push(...sales); }, () => {},
    );
  return { sync, ingested };
};
{
  const f = makeSync({ sales: [{ id: 'remote-sale', amount: 42, ts: Date.now() }] });
  const result = await f.sync({ timeoutMs: 100 });
  audit('closure waits for and ingests the actual remote sale feed', result.ok === true && result.complete === true && f.ingested.length === 1);
}
{
  const f = makeSync({ sales: [{ id: 'slow-remote-sale', amount: 42, ts: Date.now() }] }, 400);
  const result = await f.sync({ timeoutMs: 250 });
  audit('closure marks a delayed feed incomplete instead of certifying it silently', result.ok === false && result.complete === false);
}

console.log('audit-remediation-money-test: all focused checks passed');
