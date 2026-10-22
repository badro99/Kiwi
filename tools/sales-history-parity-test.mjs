import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { DateTimeFormat } from '../functions/api/_zone-law.js';
import { summarize, saleCents } from '../functions/api/sales-summary.js';
import { businessBoundary, addBusinessDays } from '../functions/api/_business-day.js';

const context = vm.createContext({ window: {} });
vm.runInContext(fs.readFileSync(new URL('../assets/sales-history.js', import.meta.url), 'utf8'), context,
  { filename: 'assets/sales-history.js' });
const math = context.window.KiwiSalesMath;
const zone = 'Africa/Casablanca', cutoff = 5;
const boundary = n => businessBoundary(addBusinessDays('2026-09-01', n), cutoff, zone);
const clock = new DateTimeFormat('en-GB', { timeZone: zone, hour: '2-digit', hourCycle: 'h23' });
const hourOf = ts => +clock.formatToParts(ts).find(p => p.type === 'hour').value;
const methods = ['cash', 'card', 'tap', 'qr', 'credit', 'livraison', 'mystery', 'split', 'wallet', 'transfer', 'compte', 'delivery'];
const parts = [null, [], [{ method: 'cash', amountCents: 300 }, { method: 'tap', amountCents: 700 }],
  [{ method: 'cash', amountCents: -1 }, null, { method: 'card', amountCents: 0 }],
  [{ method: 'credit', amountCents: 100 }, { method: 'card', amountCents: 900 }],
  [{ method: 'cash', amountCents: 333 }, { method: 'card', amountCents: 667 }, { method: 'cash', amountCents: -2 }]];
const rows = [];
for (let day = 0; day < 40; day++) {
  for (let i = 0; i < 12; i++) {
    rows.push({ ts: boundary(day) + (i * 2 + 0.25) * 3600000,
      amount: 12.345 + day + i / 100, amount_cents: i % 3 ? 1201 + day * 13 + i : null,
      method: methods[(day + i) % methods.length], payment_parts: JSON.stringify(parts[(day + i) % parts.length]) });
  }
  for (const [i, method] of ['cash', 'card', 'tap', 'credit', 'livraison', 'mystery'].entries()) {
    rows.push({ ts: boundary(day) + (i + 1) * 3600000, amount: -2.345, amount_cents: i % 2 ? -123 - day : null, method });
  }
}
// Match the feed projection: authoritative cents, legacy rounding, and validated parts.
function dashboardEntry(row) {
  let parsed = JSON.parse(row.payment_parts || 'null');
  parsed = Array.isArray(parsed) ? parsed.slice(0, 8).map(p => ({ method: String(p?.method || '').slice(0, 16), amountCents: Math.round(Number(p?.amountCents)) }))
    .filter(p => /^[a-z-]{1,16}$/.test(p.method) && Number.isSafeInteger(p.amountCents) && p.amountCents > 0) : null;
  return { ts: row.ts, amount: Math.abs(saleCents(row)) / 100, method: row.method, paymentParts: parsed };
}
const sales = rows.filter(r => saleCents(r) > 0).map(dashboardEntry);
const refunds = rows.filter(r => saleCents(r) < 0).map(dashboardEntry);
assert.equal(sales.length, 480);
assert.ok(sales.some(s => hourOf(s.ts) < 5));
const summary = summarize(rows, boundary(0), boundary(40), cutoff, zone);
assert.equal(summary.days.length, 40);
function equalFields(actual, expected, label) {
  assert.deepEqual(Object.keys(actual).sort(), Object.keys(expected).sort(), label);
  for (const key of Object.keys(expected)) assert.ok(Math.abs(actual[key] - expected[key]) < 1e-6,
    `${label}.${key}: ${actual[key]} versus ${expected[key]}`);
}
for (const [start, length] of [[0, 1], [13, 1], [3, 7], [7, 30], [0, 40]]) {
  const from = boundary(start), to = boundary(start + length);
  equalFields(math.statsFromSummary(summary.days, summary.splits, from, to), math.statsFromSales(sales, refunds, from, to), `${length} days stats`);
  equalFields(math.hoursFromSummary(summary.days, from, to), math.hoursFromSales(sales, from, to, hourOf), `${length} days hours`);
}
for (const [from, to] of [[boundary(0) + 1, boundary(7)], [boundary(0), boundary(7) - 1]]) {
  assert.throws(() => math.statsFromSummary(summary.days, summary.splits, from, to), /straddles/);
  assert.throws(() => math.hoursFromSummary(summary.days, from, to), /straddles/);
}
equalFields(math.statsFromSales([], [], 0, Infinity), { revenue: 0, gross: 0, refunds: 0, collected: 0, receivable: 0, count: 0, basket: 0, card: 0, cash: 0 }, 'empty');
// Local ledgers keep fractional MAD as-is; only the server feed rounds them.
const fractional = { ts: 10, amount: 12.345, method: 'split', paymentParts: [
  { method: 'cash', amountCents: 300 }, { method: 'card', amountCents: 700 },
  { method: 'card', amountCents: 1.5 }, { method: 'credit', amountCents: 100 }, null,
] };
equalFields(math.statsFromSales([fractional], [], 10, 11), {
  revenue: 12.345, gross: 12.345, refunds: 0, collected: 12.345, receivable: 0,
  count: 1, basket: 12.345, card: 8.6415, cash: 3.7035,
}, 'local fractional MAD and invalid parts');
assert.equal(math.statsFromSales([fractional], [], 0, 10).count, 0, 'exclusive upper boundary');
const before = JSON.stringify({ sales, refunds, summary });
math.statsFromSales(sales, refunds, boundary(0), boundary(40));
math.statsFromSummary(summary.days, summary.splits, boundary(0), boundary(40));
math.hoursFromSales(sales, boundary(0), boundary(40), hourOf);
math.hoursFromSummary(summary.days, boundary(0), boundary(40));
assert.equal(JSON.stringify({ sales, refunds, summary }), before, 'inputs remain unchanged');
console.log('PASS sales history parity: 480 sales, 240 refunds, 40 Casablanca business days, 5 windows, partial-day rejection');
