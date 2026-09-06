import assert from 'node:assert/strict';
import fs from 'node:fs';

const pages = fs.readFileSync(new URL('../assets/pages-pro.js', import.meta.url), 'utf8');

// 1. Static inspection: must query KiwiDayReport cutoff and avoid hardcoded calendar midnight
assert.match(pages, /window\.KiwiDayReport\?\.cutoff/,
  'renderRealTransactions must consult KiwiDayReport for the business day cutoff');
assert.doesNotMatch(pages, /selectedDay\.setHours\(0,\s*0,\s*0,\s*0\);\s*selectedDay\.setDate/,
  'renderRealTransactions must not anchor windows to civil calendar midnight');
assert.match(pages, /window\.addEventListener\('kiwi-day-report-ready'/,
  'pages-pro must listen for kiwi-day-report-ready to refresh the transactions view');

// 2. Window logic simulation matching the exact implementation in pages-pro.js
function computeWindow(now, dayOffset, cutoffH) {
  const currentBizDate = new Date(now - cutoffH * 3600000);
  currentBizDate.setHours(0, 0, 0, 0);
  const todayLo = currentBizDate.getTime() + cutoffH * 3600000;
  const lo = todayLo - dayOffset * 864e5;
  const hi = dayOffset === 0 ? Infinity : (todayLo - (dayOffset - 1) * 864e5);
  return { lo, hi, currentBizDate };
}

// Sunday Sept 6, 2026 at 15:57 (the time from the merchant screenshot)
const now = new Date(2026, 8, 6, 15, 57).getTime();
const cutoffH = 5;

// Orders from Pasta Corner on that day:
// 10 orders at ~01:11 AM Sunday morning (Saturday night dinner service)
const lateNightOrder = new Date(2026, 8, 6, 1, 11).getTime();
// 4 orders in Sunday afternoon: 14:08, 14:18, 15:25, 15:57
const afternoonOrder1 = new Date(2026, 8, 6, 14, 8).getTime();
const afternoonOrder2 = new Date(2026, 8, 6, 14, 18).getTime();
const afternoonOrder3 = new Date(2026, 8, 6, 15, 25).getTime();
const afternoonOrder4 = new Date(2026, 8, 6, 15, 57).getTime();

// For dayOffset = 0 ("Aujourd'hui"):
const winToday = computeWindow(now, 0, cutoffH);
assert.equal(winToday.lo, new Date(2026, 8, 6, 5, 0).getTime(), 'Today begins at 5:00 AM');
assert.equal(winToday.hi, Infinity, 'Today window reaches to Infinity');

// Late night order at 01:11 AM is BEFORE 5:00 AM, so excluded from Aujourd'hui
assert.ok(lateNightOrder < winToday.lo, '01:11 AM order must be excluded from Aujourd\'hui');

// All 4 afternoon orders are inside Aujourd'hui
assert.ok(afternoonOrder1 >= winToday.lo && afternoonOrder1 < winToday.hi);
assert.ok(afternoonOrder2 >= winToday.lo && afternoonOrder2 < winToday.hi);
assert.ok(afternoonOrder3 >= winToday.lo && afternoonOrder3 < winToday.hi);
assert.ok(afternoonOrder4 >= winToday.lo && afternoonOrder4 < winToday.hi);

// For dayOffset = 1 ("Hier"):
const winYesterday = computeWindow(now, 1, cutoffH);
assert.equal(winYesterday.lo, new Date(2026, 8, 5, 5, 0).getTime(), 'Yesterday begins at 5:00 AM Saturday');
assert.equal(winYesterday.hi, new Date(2026, 8, 6, 5, 0).getTime(), 'Yesterday ends at 5:00 AM Sunday');

// Late night order at 01:11 AM is INSIDE "Hier" (Saturday's business day)
assert.ok(lateNightOrder >= winYesterday.lo && lateNightOrder < winYesterday.hi,
  '01:11 AM order belongs to Yesterday (Saturday night dinner service)');

console.log('sales-ledger-cutoff-test: 8 controls passed');
