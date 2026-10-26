#!/usr/bin/env node
import caisseTestSource from './caisse-test-source.cjs';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';

const source = caisseTestSource(fs.readFileSync(new URL('../kiwi-caisse.html', import.meta.url), 'utf8'));
const block = source.match(/function ingestSettledCloudSales\(sales\)[\s\S]*?function startEmployeeSaleJournalSync\(\)/)?.[0] || '';
const ok = (condition, message) => {
  if (!condition) throw new Error(message);
  console.log('  ✓ ' + message);
};

ok(/saleTs\s*<\s*shiftOpenedAt\.getTime\(\)/.test(block),
  'a reopened caisse rejects settlements from the closed service');
ok(/const from\s*=\s*shiftOpenedAt\.getTime\(\)/.test(block),
  'the recovery fetch starts at the current service opening');
ok(!/businessDay\(saleTs/.test(block),
  'the caisse no longer hydrates its counter from the whole dashboard day');
ok(/saveProvisional\(true\)/.test(block),
  'current-service employee settlements still update the dashboard snapshot');

/* Run the shipped ingestion: a reopened service starts at zero even though the
 * feed still carries the earlier service of the same business day. */
const { declarations } = createRequire(import.meta.url)('./caisse-test-source.cjs');
function service(openedAt) {
  const calls = { provisional: 0, persisted: 0, fetched: [] };
  const ctx = {
    window: {}, shiftOpenedAt: openedAt, activeCloudSaleIds: new Set(), journal: [], shift: { tablesPaid: 0 },
    reconcileCloudSaleInJournal: () => false,
    cloudSaleJournalEntry: (s) => ({ id: s.id, amount: s.amount, time: new Date(s.ts).toISOString(), channel: s.channel || 'comptoir' }),
    attachReceipt() {}, persistShift: () => { calls.persisted++; }, saveProvisional: () => { calls.provisional++; },
    renderShiftStats() {}, renderJournal() {}, refreshOpenReconciliationModals() {},
    $: () => ({ classList: { contains: () => false } }),
    currentMerchantSlug: () => 'scope-fixture', Date, Number, String, Promise, Math, isNaN,
    AbortController: undefined, setTimeout, clearTimeout,
    fetch: (url) => { calls.fetched.push(url); return Promise.resolve({ ok: true, json: async () => ({ sales: [] }) }); },
  };
  vm.createContext(ctx);
  vm.runInContext(declarations('ingestSettledCloudSales', 'syncSettledBusinessDay') + '\nthis.ingest = ingestSettledCloudSales; this.sync = syncSettledBusinessDay;', ctx);
  return { ctx, calls };
}
const day = Date.UTC(2026, 9, 26, 8, 0, 0);
const reopened = new Date(day + 11 * 3600e3); // 19:00 the same business day
{
  const s = service(reopened);
  const before = { id: 'lunch-1', amount: 120, ts: day + 4 * 3600e3, channel: 'dining' };
  const after = { id: 'dinner-1', amount: 80, ts: day + 11.5 * 3600e3, channel: 'dining' };
  s.ctx.ingest([before, after]);
  ok(s.ctx.journal.length === 1 && s.ctx.journal[0].id === 'dinner-1', 'run: a lunch settlement from the closed service stays out of the reopened journal');
  ok(s.ctx.shift.tablesPaid === 1, 'run: only the current service counts its paid table');
  ok(s.calls.provisional === 1, 'run: the current settlement still updates the dashboard snapshot');
  s.ctx.ingest([before]);
  ok(s.ctx.journal.length === 1 && s.calls.provisional === 1, 'run: a feed holding only the earlier service changes nothing');
}
{
  const s = service(null);
  ok(s.ctx.ingest([{ id: 'x', amount: 10, ts: day }]) === 0 && s.ctx.journal.length === 0, 'run: nothing enters before a register is open');
}
{
  const s = service(reopened);
  await s.ctx.sync({ timeoutMs: 500 });
  ok(s.calls.fetched.length === 1 && s.calls.fetched[0].endsWith('&from=' + reopened.getTime()), 'run: the recovery fetch asks the feed from the service opening');
}
