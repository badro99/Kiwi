#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = fs.readFileSync(path.join(root, 'assets/day-report.js'), 'utf8');

let pass = 0;
function ok(v, msg) {
  if (!v) { console.error('  ✗ ' + msg); process.exitCode = 1; return; }
  pass++;
}

// 1. Static assertion: day-report.js must not derive merchant from slugStore(name)
ok(!/slugStore\(pv2\.name\)/.test(src), 'fallback path does not derive merchant slug from store name');
ok(/pv2\s*&&\s*\(pv2\.merchant\s*\|\|\s*pv2\.slug\)/.test(src), 'fallback path extracts pv2.merchant || pv2.slug');

// 2. Runtime execution with KiwiCaissePairing present
const memory = new Map();
const ls = {
  getItem: (k) => memory.has(k) ? memory.get(k) : null,
  setItem: (k, v) => memory.set(k, String(v)),
  removeItem: (k) => memory.delete(k),
};
ls.setItem('kiwiPairedVenue', JSON.stringify({
  merchant: 'merchant-slug-canonical',
  venueId: 'v-100',
  name: 'Chez Hamid - Gueliz',
  type: 'restaurant'
}));

const ctx1 = vm.createContext({
  window: {
    localStorage: ls,
    addEventListener: () => {},
    KiwiCaissePairing: {
      pairedVenue: () => ({ merchant: 'merchant-slug-canonical', name: 'Chez Hamid - Gueliz' })
    }
  },
  localStorage: ls,
  Date, Math, JSON, RegExp, Array, Object, String, Number,
});
ctx1.window.window = ctx1.window;
vm.runInContext(src, ctx1);
ok(ctx1.window.KiwiDayReport.storeSlug() === 'merchant-slug-canonical',
  'primary path with KiwiCaissePairing resolves canonical merchant slug');

// 3. Runtime execution on Dashboard / where KiwiCaissePairing is absent
const ctx2 = vm.createContext({
  window: { localStorage: ls, addEventListener: () => {} }, // no KiwiCaissePairing
  localStorage: ls,
  Date, Math, JSON, RegExp, Array, Object, String, Number,
});
ctx2.window.window = ctx2.window;
vm.runInContext(src, ctx2);
ok(ctx2.window.KiwiDayReport.storeSlug() === 'merchant-slug-canonical',
  'fallback path without KiwiCaissePairing resolves identical canonical merchant slug (not name slug)');

// 4. Moroccan late service: midnight is not the accounting boundary. With the
// default 05:00 cutoff, closing and reopening at 03:00 remains on the previous
// evening's dashboard day even though the new caisse service itself starts at 0.
const evening = new Date(2026, 8, 2, 18, 0).getTime();
const afterMidnight = new Date(2026, 8, 3, 3, 0).getTime();
const boundary = new Date(2026, 8, 3, 5, 0).getTime();
ok(ctx2.window.KiwiDayReport.businessDay(evening) === '2026-09-02',
  'an evening service belongs to its opening calendar day');
ok(ctx2.window.KiwiDayReport.businessDay(afterMidnight) === '2026-09-02',
  'a 03:00 close/reopen remains in the same dashboard business day');
ok(ctx2.window.KiwiDayReport.businessDay(boundary) === '2026-09-03',
  'the next dashboard business day starts at the 05:00 safety boundary');

if (process.exitCode) process.exit(process.exitCode);
console.log(`  ✓ day-report paired scope (${pass} controls: canonical merchant consistency)`);
