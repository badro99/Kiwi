import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const source = fs.readFileSync(new URL('../assets/pos-sale.js', import.meta.url), 'utf8');
const rows = new Map([
  ['kiwiPairedVenue', JSON.stringify({ merchant: 'amira-snack' })],
  ['kiwi:posDevice', 'A7'],
]);
const localStorage = {
  getItem: (key) => rows.has(key) ? rows.get(key) : null,
  setItem: (key, value) => rows.set(key, String(value)),
  removeItem: (key) => rows.delete(key),
  key: (i) => [...rows.keys()][i] || null,
  get length() { return rows.size; },
};
const events = [];
const document = {
  hidden: false,
  addEventListener() {},
  dispatchEvent(event) { events.push(event); return true; },
};
const window = {
  localStorage, document,
  KiwiEnv: { isReal: () => true },
  KiwiDayReport: {
    businessDay: () => '2026-08-14',
    today: () => '2026-08-14',
    dayBounds: () => ({ from: Date.now() - 3600000, to: Date.now() + 23 * 3600000 }),
  },
  addEventListener() {},
};
let serverSales = [];
let voided = [];
const context = {
  console, window, document, localStorage,
  CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init?.detail; } },
  Date, Map, Set, Uint8Array,
  crypto: { getRandomValues(a) { a[0] = 1; a[1] = 2; return a; } },
  setTimeout: () => 1, clearTimeout() {},
  fetch: async () => ({ ok: true, json: async () => ({ merchant: 'amira-snack', sales: serverSales, voided }) }),
};
window.window = window;
vm.createContext(context);
vm.runInContext(source, context, { filename: 'pos-sale.js' });
const api = window.KiwiPosSale;

const local = api.record('fastfood', { total: 45, method: 'especes', label: 'Comptoir', ref: 'T-1', lines: [{ name: 'Tacos', qty: 1, total: 45, itemId: 'tacos' }] });
assert.equal(local.ref, 'T-1-A7', 'local receipt is terminal-stamped');
assert.equal(api.totals('fastfood').total, 45, 'local offline taking is immediately visible');

const now = Date.now();
serverSales = [
  { cursor: 10, id: 'sale-local', amount: 45, method: 'cash', label: 'Comptoir', ref: 'T-1-A7', ts: now, lines: [{ name: 'Tacos', qty: 1, total: 45, itemId: 'tacos' }] },
  { cursor: 11, id: 'visit-remote-emp', amount: 80, method: 'card', label: 'Table 4', ref: 'SB-4', ts: now, channel: 'dining', lines: [{ name: 'Menu', qty: 2, total: 80 }] },
];
let result = await api.sync('fastfood');
assert.equal(result.added, 1, 'another authorized surface adds one missing receipt');
assert.deepEqual({ ...api.totals('fastfood') }, { total: 125, cash: 45, card: 80, other: 0, count: 2 }, 'till totals equal the canonical paid ledger');
assert.equal(api.today('fastfood').filter((x) => x.ref === 'T-1-A7').length, 1, 'local and server copies never double-count');
assert.ok(events.some((e) => e.type === 'kiwi-pos-sales-synced'), 'native verticals receive a repaint signal');

result = await api.sync('fastfood');
assert.equal(result.added, 0, 'repeated day reconciliation is idempotent');
assert.equal(api.totals('fastfood').count, 2);

/* A server day that has not received the queued offline row yet never erases it. */
serverSales = [serverSales[1]];
await api.sync('fastfood');
assert.equal(api.totals('fastfood').total, 125, 'unsent local receipts survive a partial server response');

voided = [{ r: 'SB-4' }];
await api.sync('fastfood');
assert.equal(api.totals('fastfood').total, 45, 'a server void leaves the till ledger too');

const rejected = api.ingest('fastfood', [{ id: 'foreign', amount: 999, ts: now }], 'rival-store');
assert.equal(rejected.added, 0, 'foreign-tenant rows are rejected');
assert.equal(api.totals('fastfood').total, 45);

/* till#0: an authoritative tip correction on a receipt already in the journal
   reaches it, and a feed row without a tip never erases the local tip. */
voided = [];
serverSales = [{ cursor: 20, id: 'sale-tip', amount: 30, method: 'cash', label: 'Salon', ref: 'TIP-1', ts: now, tipCents: 200 }];
await api.sync('fastfood');
const tipRow = () => api.today('fastfood').find((x) => x.ref === 'TIP-1');
assert.equal(tipRow().tipCents, 200, 'first ingest keeps the tip');
serverSales = [{ cursor: 20, id: 'sale-tip', amount: 30, method: 'cash', label: 'Salon', ref: 'TIP-1', ts: now, tipCents: 350 }];
result = await api.sync('fastfood');
assert.equal(result.changed, 1, 'a tip-only correction counts as a change');
assert.equal(tipRow().tipCents, 350, 'the corrected tip replaces the stale one');
serverSales = [{ cursor: 20, id: 'sale-tip', amount: 30, method: 'cash', label: 'Salon', ref: 'TIP-1', ts: now }];
await api.sync('fastfood');
assert.equal(tipRow().tipCents, 350, 'a feed row without a tip keeps the recorded tip');

/* till#1: the idDay of a receipt uses the merchant business day, not the device date. */
const R = window.KiwiDayReport, keep = R.businessDay;
R.businessDay = () => '2026-03-09';
assert.equal(api.businessDayKey(new Date(2026, 2, 10, 12, 0)), '20260309', 'the merchant zone and cutoff decide the day key');
R.businessDay = keep;

console.log('✓ specialist POS cloud reconciliation (12 controls)');
