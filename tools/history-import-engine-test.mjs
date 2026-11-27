/* Le moteur de l'import de l'historique (assets/history-import/engine.js) :
 * des fichiers de vraies caisses (exports type Loyverse, tableurs faits main en
 * français, collages Excel) jusqu'au plan envoyé aux routes. Jon's Burgers,
 * 27 nov. 2026. Le même code que le navigateur, chargé tel quel. */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

globalThis.window = globalThis;
const require = createRequire(import.meta.url);
require('../assets/history-import/engine.js');
require('../assets/pages-pro/catalog-bulk/xlsx.js');
const E = globalThis.KiwiHistoryEngine;
const X = globalThis.KiwiXlsx;

let checks = 0;
async function check(name, fn) { await fn(); checks++; console.log('  ok ' + checks + ' - ' + name); }
const src = (name, rows, kind) => { const d = E.detect(rows); return { id: name, name, rows, headerRow: d.headerRow, kind: kind || d.kind, map: d.map }; };
const CTX = { today: '2026-11-27', cutoff: 5, firstSaleDay: '2026-11-20', firstCashDay: '2026-11-20', menu: [{ name: 'Tacos Indien', price: 45, cat: 'Tacos' }] };

/* Un export de reçus et un export « reçus par article », comme une caisse en ligne les donne. */
const receipts = [
  ['Date', 'Receipt number', 'Receipt type', 'Gross sales', 'Discounts', 'Net sales', 'Taxes', 'Total collected', 'Payment type', 'Dining option', 'Cashier name', 'Status'],
  ['14/03/2026 12:31', '1-1001', 'Sale', '90,00', '0', '90,00', '0', '90,00', 'Cash', 'Dine in', 'Ahmed', 'Closed'],
  ['14/03/2026 12:48', '1-1002', 'Sale', '57,00', '0', '57,00', '0', '57,00', 'Card', 'Take out', 'Ahmed', 'Closed'],
  ['14/03/2026 13:02', '1-1003', 'Refund', '-45,00', '0', '-45,00', '0', '-45,00', 'Cash', '', 'Ahmed', 'Closed'],
  ['15/03/2026 01:40', '1-1004', 'Sale', '120,00', '0', '120,00', '0', '120,00', 'Cash, Card', '', 'Sara', 'Closed'],
  ['15/03/2026 19:10', '1-1005', 'Sale', '30,00', '0', '30,00', '0', '30,00', 'Cash', '', 'Sara', 'Cancelled'],
];
const byItem = [
  ['Date', 'Receipt number', 'Receipt type', 'Category', 'Item', 'Quantity', 'Gross sales', 'Net sales', 'Status'],
  ['14/03/2026 12:31', '1-1001', 'Sale', 'Tacos', 'Tacos Indien', '2', '90,00', '90,00', 'Closed'],
  ['14/03/2026 12:48', '1-1002', 'Sale', 'Tacos', 'Tacos Indien', '1', '45,00', '45,00', 'Closed'],
  ['14/03/2026 12:48', '1-1002', 'Sale', 'Boissons', 'Coca 33cl', '1', '12,00', '12,00', 'Closed'],
  ['14/03/2026 13:02', '1-1003', 'Refund', 'Tacos', 'Tacos Indien', '-1', '-45,00', '-45,00', 'Closed'],
];

await check('receipts and receipt lines are detected, joined by number, refunds and cancellations left out', async () => {
  const a = src('recus.csv', receipts), b = src('articles.csv', byItem);
  assert.equal(a.kind, 'tickets');
  assert.equal(b.kind, 'lines');
  const p = E.build([a, b], CTX);
  const d14 = p.tickets.find((d) => d.day === '2026-03-14');
  assert.equal(d14.tickets.length, 3, '12:31, 12:48 and 01:40 the next night');
  assert.deepEqual(d14.tickets[0], { ref: '1-1001', at: '2026-03-14 12:31', method: 'cash', totalCents: 9000, lines: [{ name: 'Tacos Indien', qty: 2, unitCents: 4500, cat: 'Tacos' }] });
  assert.equal(d14.tickets[1].method, 'card');
  assert.equal(d14.tickets[1].lines.length, 2);
  assert.equal(p.refunds.n, 2, 'the refund receipt and its refund line');
  assert.equal(p.cancelled, 1);
  /* 01:40 belongs to the business day of the 14th, with a mixed payment. */
  const late = p.tickets.flatMap((d) => d.tickets.map((t) => ({ day: d.day, ...t }))).find((t) => t.ref === '1-1004');
  assert.equal(late.day, '2026-03-14');
  assert.equal(late.at, '2026-03-15 01:40');
  assert.equal(late.method, 'other');
  assert.equal(p.stats.tickets, 3);
  assert.equal(p.stats.ticketCents, 9000 + 5700 + 12000);
});

await check('receipt lines alone rebuild the tickets', async () => {
  const p = E.build([src('articles.csv', byItem)], CTX);
  const d = p.tickets[0];
  assert.equal(d.tickets.length, 2);
  assert.equal(d.tickets[1].totalCents, 5700);
  assert.equal(d.tickets[1].at, '2026-03-14 12:48');
});

await check('sales by item per day; a day already covered by tickets keeps the tickets', async () => {
  const items = [['Date', 'Article', 'Quantité', 'Prix'], ['14/03/2026', 'Tacos Indien', '25', ''], ['16/03/2026', 'Burger maison', '3', '55,5']];
  const s = src('ventes.csv', items);
  assert.equal(s.kind, 'items');
  const p = E.build([s, src('recus.csv', receipts)], CTX);
  assert.deepEqual(p.items, [{ day: '2026-03-16', lines: [{ name: 'Burger maison', qty: 3, unitCents: 5550, cat: '' }] }]);
  assert.ok(p.issues.some((i) => i.why === 'itemsInTickets' && i.detail === '1'));
  const alone = E.build([s], CTX);
  assert.equal(alone.items[0].lines[0].unitCents, 4500, 'a missing price comes from the menu');
});

await check('shifts and cash moves: moves join their shift by time, others stay on their day, totals stand in when no moves', async () => {
  const shifts = [
    ['Shift number', 'Opening time', 'Closing time', 'Opened by', 'Starting cash', 'Paid in', 'Paid out', 'Expected cash amount', 'Actual cash amount', 'Difference'],
    ['17', '14/03/2026 09:00', '14/03/2026 23:40', 'Ahmed', '500', '200', '150', '3480', '3460', '-20'],
    ['18', '15/03/2026 09:05', '16/03/2026 00:30', 'Sara', '500', '0', '80', '', '2900', '10'],
  ];
  const moves = [['Date', 'Heure', 'Type', 'Montant', 'Motif'], ['14/03/2026', '10:05', 'Sortie', '120', 'Butane'], ['14/03/2026', '18:20', 'Entrée', '200', 'Monnaie'], ['13/03/2026', '16:00', 'Sortie', '30', 'Pain']];
  const a = src('services.csv', shifts), b = src('caisse.csv', moves);
  assert.equal(a.kind, 'shifts');
  assert.equal(b.kind, 'moves');
  const p = E.build([a, b], CTX);
  const d14 = p.cash.find((d) => d.day === '2026-03-14');
  assert.equal(d14.shifts[0].moves.length, 2, 'the two moves of that shift');
  assert.equal(d14.shifts[0].expectedCents, 348000);
  assert.equal(d14.shifts[0].openingCents, 50000);
  const d15 = p.cash.find((d) => d.day === '2026-03-15');
  assert.deepEqual(d15.shifts[0].moves, [{ at: '', kind: 'out', cents: 8000, reason: 'Sara' }], 'no moves file for it: the shift total stands in');
  assert.equal(d15.shifts[0].expectedCents, 289000, 'expected = counted − difference');
  assert.equal(d15.shifts[0].close, '2026-03-16 00:30');
  const d13 = p.cash.find((d) => d.day === '2026-03-13');
  assert.deepEqual(d13.moves, [{ at: '2026-03-13 16:00', kind: 'out', cents: 3000, reason: 'Pain' }]);
  assert.equal(p.stats.shifts, 2);
  assert.equal(p.stats.gapCents, -2000 + 1000);
});

await check('in/out columns, signed amounts, and rows that say neither', async () => {
  const p = E.build([src('m.csv', [['Date', 'Entrée', 'Sortie', 'Commentaire'], ['10/03/2026', '100', '', 'Fond'], ['10/03/2026', '', '45,5', 'Gaz']])], CTX);
  assert.deepEqual(p.cash[0].moves.map((m) => [m.kind, m.cents]), [['in', 10000], ['out', 4550]]);
  const q = E.build([src('m.csv', [['Date', 'Type', 'Montant', 'Motif'], ['10/03/2026', '', '-20', 'x'], ['10/03/2026', 'Divers', '20', 'y']])], CTX);
  assert.deepEqual(q.cash[0].moves.map((m) => m.kind), ['out']);
  assert.equal(q.issues[0].why, 'noMoveKind');
});

await check('days that cannot be written are counted, not sent', async () => {
  const rows = [['N° ticket', 'Date', 'Heure', 'Total TTC'], ['1', '19/11/2026', '12:00', '10'], ['2', '20/11/2026', '12:00', '10'], ['3', '27/11/2026', '12:00', '10'], ['4', '01/01/2024', '12:00', '10']];
  const p = E.build([src('t.csv', rows)], CTX);
  assert.deepEqual(p.tickets.map((d) => d.day), ['2026-11-19']);
  assert.deepEqual(p.blocked, { live: 1, future: 1, old: 1, heavy: 0 });
});

await check('a title above the header, US dates, Excel serial dates and separate time columns', async () => {
  const rows = [['Rapport des ventes · Jon\'s Burgers'], [], ['Ticket', 'Date', 'Time', 'Amount', 'Payment method'], ['A1', '3/14/2026', '1:45 PM', '$12.50', 'Visa'], ['A2', '3/15/2026', '9:00 AM', '1,234.50', 'cash']];
  const s = src('us.csv', rows);
  assert.equal(s.headerRow, 2);
  assert.equal(s.kind, 'tickets');
  const p = E.build([s], CTX);
  assert.deepEqual(p.tickets.map((d) => [d.day, d.tickets[0].at, d.tickets[0].totalCents, d.tickets[0].method]),
    [['2026-03-14', '2026-03-14 13:45', 1250, 'card'], ['2026-03-15', '2026-03-15 09:00', 123450, 'cash']]);
  assert.deepEqual(E.parseDateTime(46095.5625), { day: '2026-03-14', time: '13:30' });
  assert.deepEqual(E.parseDateTime('14 mars 2026 21h10'), { day: '2026-03-14', time: '21:10' });
  assert.equal(E.parseDateTime('31/02/2026'), null);
});

await check('amounts as spreadsheets write them', async () => {
  for (const [v, n] of [['1 234,50', 1234.5], ['1,5', 1.5], ['(12,00)', -12], ['-45 MAD', -45], ['1.234,50', 1234.5], ['1,234.50', 1234.5], ['٣٤٫٥', 34.5], ['12 DH', 12], [7, 7], ['abc', NaN]]) {
    assert.ok(Object.is(E.num(v), n) || E.num(v) === n, v + ' → ' + E.num(v));
  }
});

await check('sends are cut to what the routes accept, never splitting a day', async () => {
  const day = (i) => '2026-01-' + String(i + 1).padStart(2, '0');
  const mk = (n) => Array.from({ length: n }, (_, i) => ({ ref: String(i), at: '', method: 'cash', totalCents: 100, lines: [] }));
  const plan = { tickets: [{ day: day(0), tickets: mk(300) }, { day: day(1), tickets: mk(300) }, { day: day(2), tickets: mk(900) }, { day: day(3), tickets: mk(10) }],
    items: Array.from({ length: 100 }, (_, i) => ({ day: '2025-' + String(1 + Math.floor(i / 28)).padStart(2, '0') + '-' + String(1 + (i % 28)).padStart(2, '0'), lines: [] })),
    cash: Array.from({ length: 40 }, (_, i) => ({ day: '2025-06-' + String(1 + (i % 30)).padStart(2, '0') + i, shifts: [], moves: [{}] })) };
  const c = E.chunks(plan);
  const t = c.filter((x) => x.kind === 'tickets').map((x) => x.days.map((d) => d.tickets.length));
  assert.deepEqual(t, [[300], [300], [900], [10]]);
  assert.deepEqual(c.filter((x) => x.kind === 'items').map((x) => x.days.length), [92, 8]);
  assert.deepEqual(c.filter((x) => x.kind === 'cash').map((x) => x.days.length), [31, 9]);
});

await check('a real .xlsx (written then read back) goes through the same path, dates as serial numbers', async () => {
  const bytes = X.write([['N° ticket', 'Date', 'Total', 'Paiement'], ['9001', 46095.5625, 88.5, 'Espèces'], ['9002', 46096.75, 40, 'CB']], { sheet: 'Tickets' });
  const book = await X.read(bytes, { sheet: 0, rows: 100001 });
  assert.deepEqual(book.sheets, ['Tickets']);
  const p = E.build([src('export.xlsx', book.rows)], CTX);
  assert.deepEqual(p.tickets.map((d) => [d.day, d.tickets[0].at, d.tickets[0].totalCents, d.tickets[0].method]),
    [['2026-03-14', '2026-03-14 13:30', 8850, 'cash'], ['2026-03-15', '2026-03-15 18:00', 4000, 'card']]);
});

console.log(`\n${checks} history import engine checks passed`);
