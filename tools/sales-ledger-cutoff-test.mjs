import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const pages = fs.readFileSync(new URL('../assets/pages-pro.js', import.meta.url), 'utf8');
const dayReport = fs.readFileSync(new URL('../assets/day-report.js', import.meta.url), 'utf8');

// 1. Static inspection: renderRealTransactions must use the shared merchant
// calendar, not recreate a host-local 24-hour window.
assert.match(pages, /R\?\.businessDay\s*\?\s*R\.businessDay\(now, merchant\)/,
  'renderRealTransactions must consult KiwiDayReport for the business day');
assert.match(pages, /R\?\.dayBounds\s*\?\s*R\.dayBounds\(selectedKey, merchant\)/,
  'renderRealTransactions must use shared merchant-timezone day bounds');
assert.doesNotMatch(pages, /selectedDay\.setHours\(0,\s*0,\s*0,\s*0\);\s*selectedDay\.setDate/,
  'renderRealTransactions must not anchor windows to civil calendar midnight');
assert.match(pages, /window\.addEventListener\('kiwi-day-report-ready'/,
  'pages-pro must listen for kiwi-day-report-ready to refresh the transactions view');

// 2. Exercise the shipped day-report implementation for the same merchant
// timezone that pages-pro consumes. This catches DST/calendar-day drift without
// copying its boundary arithmetic into the fixture.
const storage = new Map([['kiwiPairedVenue', JSON.stringify({ merchant: 'audit-cutoff', timezone: 'Africa/Casablanca' })]]);
const reportWindow = { localStorage: {
  getItem: (key) => storage.get(key) || null,
  setItem: (key, value) => storage.set(key, String(value)),
}, addEventListener() {}, KiwiCaissePairing: {
  pairedVenue: () => ({ merchant: 'audit-cutoff', timezone: 'Africa/Casablanca' }),
} };
reportWindow.window = reportWindow;
vm.runInNewContext(dayReport, { window: reportWindow, localStorage: reportWindow.localStorage, Date, Math, JSON, Intl, String, Number, Object, Array, RegExp });
const R = reportWindow.KiwiDayReport;
const merchant = 'audit-cutoff';
const now = Date.parse('2026-09-06T13:57:00.000Z');
const todayKey = R.businessDay(now, merchant);
const computeWindow = (dayOffset) => {
  const key = R.shiftDay(todayKey, -dayOffset, merchant);
  const bounds = R.dayBounds(key, merchant);
  return { lo: bounds.from, hi: bounds.to };
};

// Sunday Sept 6, 2026 at 15:57 (the time from the merchant screenshot)
// Casablanca is UTC+1 on this date, so 13:57Z is 14:57 merchant time.

// Orders from Pasta Corner on that day:
// 10 orders at ~01:11 AM Sunday morning (Saturday night dinner service)
const lateNightOrder = Date.parse('2026-09-06T00:11:00.000Z');
// 4 orders in Sunday afternoon: 14:08, 14:18, 15:25, 15:57
const afternoonOrder1 = Date.parse('2026-09-06T13:08:00.000Z');
const afternoonOrder2 = Date.parse('2026-09-06T13:18:00.000Z');
const afternoonOrder3 = Date.parse('2026-09-06T14:25:00.000Z');
const afternoonOrder4 = Date.parse('2026-09-06T14:57:00.000Z');

// For dayOffset = 0 ("Aujourd'hui"):
const winToday = computeWindow(0);
assert.equal(winToday.lo, Date.parse('2026-09-06T04:00:00.000Z'), 'Today begins at 05:00 Casablanca time');
assert.equal(R.businessDay(winToday.lo, merchant), todayKey, 'the boundary belongs to the new merchant business day');

// Late night order at 01:11 AM is BEFORE 5:00 AM, so excluded from Aujourd'hui
assert.ok(lateNightOrder < winToday.lo, '01:11 AM order must be excluded from Aujourd\'hui');

// All 4 afternoon orders are inside Aujourd'hui
assert.ok(afternoonOrder1 >= winToday.lo && afternoonOrder1 < winToday.hi);
assert.ok(afternoonOrder2 >= winToday.lo && afternoonOrder2 < winToday.hi);
assert.ok(afternoonOrder3 >= winToday.lo && afternoonOrder3 < winToday.hi);
assert.ok(afternoonOrder4 >= winToday.lo && afternoonOrder4 < winToday.hi);

// For dayOffset = 1 ("Hier"):
const winYesterday = computeWindow(1);
assert.equal(winYesterday.lo, Date.parse('2026-09-05T04:00:00.000Z'), 'Yesterday begins at 05:00 Casablanca time');
assert.equal(winYesterday.hi, winToday.lo, 'Yesterday ends at the next merchant boundary');

// Late night order at 01:11 AM is INSIDE "Hier" (Saturday's business day)
assert.ok(lateNightOrder >= winYesterday.lo && lateNightOrder < winYesterday.hi,
  '01:11 AM order belongs to Yesterday (Saturday night dinner service)');

console.log('sales-ledger-cutoff-test: 8 controls passed');
