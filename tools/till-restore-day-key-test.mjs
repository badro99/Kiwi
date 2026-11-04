#!/usr/bin/env node
/* A till restoring its service on 4 November with day-report.js not yet loaded
 * died in archivedTakeawaySet: the fallback day key "2026-11-4" is not a date,
 * toISOString threw, and the service was parked as a rescue copy while an empty
 * one opened (sync-ledger lost a 12,25 MAD card sale from the till report).
 * Runs the real vrapHistoryDay and archivedTakeawaySet from the shipped file. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const split = require('./split-functions.cjs');
const src = fs.readFileSync('assets/caisse-kitchen.js', 'utf8');
const code = ['vrapHistoryDay', 'archivedTakeawaySet'].map((n) => split.declaration(src, n)).join('\n');
const store = new Map([['kiwi-archived-takeaways:resto', JSON.stringify([{ id: 'old', day: '2026-10-01' }, { id: 'kept', day: '2026-11-01' }, 'legacy'])]]);
for (const at of ['2026-11-04T11:30:00Z', '2026-01-09T03:00:00Z', '2026-12-25T20:00:00Z']) {
  const now = Date.parse(at);
  class FixedDate extends Date { constructor(...a) { super(...(a.length ? a : [now])); } static now() { return now; } }
  const ctx = { window: {}, Date: FixedDate, localStorage: { getItem: (k) => store.get(k) ?? null }, currentMerchantSlug: () => 'resto', opMerchant: () => 'resto', archivedTakeawayScope: null, archivedTakeawayIds: null, String, Number, JSON, Array, Set, Map };
  vm.runInNewContext(code + '\nthis.day = vrapHistoryDay; this.set = archivedTakeawaySet;', ctx);
  const key = ctx.day(now);
  assert.match(key, /^\d{4}-\d{2}-\d{2}$/, `${at}: the fallback day key is a zero-padded date (${key})`);
  assert.ok(Number.isFinite(Date.parse(key + 'T12:00:00Z')), `${at}: the key parses as a date`);
  let ids;
  assert.doesNotThrow(() => { ids = ctx.set(); }, `${at}: the takeaway archive builds without day-report.js`);
  assert.ok(ids.has('legacy'), `${at}: a legacy row is kept under today`);
}
console.log('✓ till restore day key: padded fallback, archive builds without day-report.js (3 dates)');
