#!/usr/bin/env node
// Actual Boutique payment/receipt functions and actual archive modules, synthetic
// memory only. This is not native, authenticated cloud or physical print proof.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const read = name => fs.readFileSync(new URL('../' + name, import.meta.url), 'utf8');
const source = read('assets/pos-boutique.js');
let checks = 0;
function check(value, label) { assert.ok(value, label); checks++; console.log('  ✓ ' + label); }
function bounded(start, end) {
  const a = source.indexOf(start), b = source.indexOf(end, a + start.length);
  assert.ok(a >= 0 && b > a, 'actual function anchors: ' + start);
  assert.equal(source.indexOf(start, a + start.length), -1, 'unique start: ' + start);
  assert.equal(source.indexOf(end, b + end.length), -1, 'unique end: ' + end);
  return source.slice(a, b);
}
const selected = [
  bounded('  function businessDayKey(ts) {', '  function whenLabel(d) {'),
  bounded('  function persistDay() {', '  (function restoreDay() {'),
  bounded('  function promoFor(pid) {', '  function lineDeal(ln) {'),
  bounded('  function lineDeal(ln) {', '  function rewardDiscount(t, base) {'),
  bounded('  function rewardDiscount(t, base) {', '  function ticketTotals(t) {'),
  bounded('  function ticketTotals(t) {', '  function promoLabelForTicket(t) {'),
  bounded('  function promoLabelForTicket(t) {', '  const ticketCount ='),
  bounded('  function addToTicket(pid, cfg, opts) {', '  function defaultSize(p) {'),
  bounded('  function lineReturnedQty(ln) {', '  function pickedQty(ret, idx, ln) {'),
  bounded('  function printReceiptNow(opts, parts) {', '  function checkout() {'),
  bounded('  function checkout() {', '  function renderAcomptes() {'),
  bounded('  function bqMoneyParts(s) {', '  function bqDayTotals() {'),
  bounded('  function bqDayTotals() {', '  function bqReportSales() {'),
  bounded('  function bqReportSales() {', '  function bqReportSession(counted) {'),
  bounded('  function bqReportSession(counted) {', '  function bqBuildReport(counted, closedAt) {'),
  bounded('  function bqBuildReport(counted, closedAt) {', "  /* L'instantané provisoire"),
];
const memory = new Map();
const storage = {
  getItem: k => memory.get(k) ?? null,
  setItem: (k, value) => memory.set(k, String(value)),
  removeItem: k => memory.delete(k),
  key: i => [...memory.keys()][i] ?? null,
  get length() { return memory.size; },
};
const merchant = 'fixture-promo-archive';
const paired = { merchant, name: 'Fixture <&> متجر', type: 'boutique' };
storage.setItem('kiwiPairedVenue', JSON.stringify(paired));
let clock = Date.parse('2026-10-04T12:00:00Z');
class FixtureDate extends Date {
  constructor(...args) { super(...(args.length ? args : [clock])); }
  static now() { return clock; }
}
let network = 0, hardware = 0;
const rejectNetwork = () => { network++; throw new Error('Synthetic guard forbids network'); };
const rejectHardware = () => { hardware++; throw new Error('Synthetic guard forbids hardware'); };
function moduleContext() {
  const document = { readyState: 'loading', addEventListener() {}, getElementById() { return null; },
    documentElement: { lang: 'fr', getAttribute: () => 'fr' } };
  const window = { document, localStorage: storage, addEventListener() {},
    fetch: rejectNetwork, print: rejectHardware,
    KiwiConfig: { timezone: 'Africa/Casablanca' },
    KiwiCaissePairing: { pairedVenue: () => paired } };
  window.window = window;
  return vm.createContext({ window, document, localStorage: storage, sessionStorage: storage,
    Date: FixtureDate, console, Promise, Uint8Array, Map, Set, fetch: rejectNetwork,
    setTimeout: () => 0, clearTimeout() {}, CustomEvent: class {} });
}
const context = moduleContext();
for (const file of ['assets/promos.js', 'assets/receipt.js', 'assets/day-report.js']) {
  vm.runInContext(read(file), context, { filename: file });
}
const PR = context.window.KiwiPromos, R = context.window.KiwiReceipt, DR = context.window.KiwiDayReport;
PR.use(merchant);
const queued = [], movements = [];
context.window.KiwiPrinter = { printReceipt: rejectHardware };
context.window.KiwiKitchenPrint = { enqueueReceipt(id, doc, intent) {
  queued.push({ id, doc, intent }); return { accepted: 1 };
} };
const noop = () => {};
Object.assign(context, {
  P: { fixture: { id: 'fixture', name: 'Opaque <&> عرض', price: 100, sizes: { M: 20 } } },
  SALES: [], AVOIRS: [], DAY_KEY: 'kiwi:bqDay', IS_DEMO: false,
  state: { ticket: null, checkoutBusy: false }, STAFF: { caissiere: { name: 'Fixture' } },
  bqShift: { openedAt: clock - 60000, openedBy: 'Fixture', float: 0 }, bqOutstandingCents: 0,
  root: {}, merchantSlug: () => merchant, pvPaired: () => paired,
  stockOf: () => 20, availableStock: () => 20, stockAdd: noop,
  ticketClient: () => null, ticketPeriod: () => 'fixture-period', ticketStockIssue: () => null,
  showStockIssue: rejectHardware, assignTicketNumber: rejectNetwork, newSaleId: rejectNetwork,
  rayonOf: () => 'Fixture department', toast: noop, esc: value => String(value),
  renderTicket: noop, renderGrid: noop, renderBadges: noop, icons: noop,
  bqSaveProvisional: noop, queueIfOffline: noop, headSubVente: () => '',
  $: () => ({ textContent: '' }), fmtMAD: value => String(value),
  persistStock: (...args) => movements.push(args),
  freshTicket: () => { context.state.ticket = { lines: [] }; },
  openPay: opts => { context.payment = opts; },
});
vm.runInContext(selected.join('\n'), context, { filename: 'actual Boutique bounded functions' });
function begin(ref) {
  context.state.ticket = { num: ref, syncId: 'fixture-sync-' + ref, period: 'fixture-period', lines: [] };
  context.state.checkoutBusy = false;
  check(context.addToTicket('fixture', { size: 'M', color: 'fixture', qty: 1, remise: 0 }, { quiet: true }), ref + ': actual ticket accepts synthetic item');
  context.checkout();
  check(context.state.checkoutBusy && !!context.payment, ref + ': actual checkout opens payment');
  return context.payment;
}
const label = 'Fixture promotion <&> عرض';
PR.save({ id: 'fixture-promo', name: label, kind: 'percent', value: 20, scope: { type: 'tout' } });
const cancelled = begin('fixture-cancel');
const beforeCancel = JSON.stringify([...memory]);
cancelled.onCancel();
check(!context.state.checkoutBusy && context.SALES.length === 0, 'actual payment cancel creates no paid sale');
check(queued.length === 0 && movements.length === 0 && JSON.stringify([...memory]) === beforeCancel, 'cancel creates no receipt, stock commit or archive mutation');
function paid(ref, expected, savings) {
  const opts = begin(ref);
  check(opts.amount === expected && opts.lines[0].amount === expected && opts.subtotal === 100, ref + ': actual receipt input agrees with checkout price');
  check(savings ? opts.promo.amount === savings && opts.promo.label === label : opts.promo === null, ref + ': actual input carries applicable promotion only');
  const parts = [{ m: 'espèces', amount: expected }];
  const result = opts.onPaid(parts, { partial: false });
  opts.sale = result.sale;
  check(result.sale.total === expected && result.sale.lines[0].unit === expected && result.sale.promoOff === savings, ref + ': actual committed journal freezes price');
  context.printReceiptNow(opts, parts);
  const job = queued.at(-1), doc = job.doc;
  check(job.id === 'boutique:' + ref && job.intent === 'original', ref + ': actual receipt queues once without printing');
  check(doc.totals.total === expected && doc.lines[0].total === expected && doc.totals.subtotal === 100, ref + ': real receipt builder retains paid total and lines');
  check(doc.totals.promo === savings && (savings ? doc.totals.promoLabel === label : doc.totals.promoLabel === ''), ref + ': real receipt keeps correct savings and opaque name');
  check(result.sale.rc.totals.total === expected && result.sale.rc.lines[0].total === expected, ref + ': actual receipt snapshot is attached to paid sale');
  const restored = JSON.parse(storage.getItem('kiwi:bqDay')).s.find(s => s.id === ref);
  check(restored.rc.totals.total === expected && restored.lines[0].unit === expected, ref + ': actual persistDay retains snapshot and paid unit');
  return JSON.stringify(result.sale.rc);
}
const first = paid('fixture-20', 80, 20);
clock += 1000;
PR.save({ ...PR.get('fixture-promo'), value: 30 });
const second = paid('fixture-30', 70, 30);
clock += 1000;
PR.setPaused('fixture-promo', true);
paid('fixture-paused', 100, 0);
check(JSON.stringify(context.SALES.find(s => s.id === 'fixture-20').rc) === first && JSON.stringify(context.SALES.find(s => s.id === 'fixture-30').rc) === second, 'edit and pause do not rewrite earlier actual receipt snapshots');
check(queued.length === 3 && movements.length === 3, 'three actual paid callbacks queue three receipts and stock commits');
const day = DR.businessDay(clock);
const report = context.bqBuildReport(250, clock + 1000);
check(report.net === 250 && report.methods.cash === 250 && report.txns === 3, 'actual Boutique Z builder matches all three receipt payments');
check(report.cash.expected === 250 && report.cash.counted === 250 && report.cash.ecart === 0, 'actual Z drawer agrees with paid cash');
check(report.closed === true && report.closedAt === clock + 1000, 'actual builder carries closed state');
check(DR.save(report, { by: 'Fixture' }) !== null, 'actual archive save accepts strictly synthetic paired context');
const archiveBefore = JSON.stringify(DR.load(day, merchant));
clock += 1000;
PR.save({ ...PR.get('fixture-promo'), value: 90, paused: false });
check(JSON.stringify(DR.load(day, merchant)) === archiveBefore, 'later promotion edit cannot change archived Z');
const fresh = moduleContext();
vm.runInContext(read('assets/day-report.js'), fresh, { filename: 'fresh actual day-report.js' });
const restored = fresh.window.KiwiDayReport.load(day, merchant);
check(restored.net === 250 && restored.methods.cash === 250 && restored.txns === 3, 'fresh module reload restores exact archived financial totals');
check(restored.closed && restored.closedAt === report.closedAt && restored.closedCount === 1, 'fresh archive reload retains closure and one revision');
check(restored.categories.reduce((sum, c) => sum + c.total, 0) === 250 && restored.categories.reduce((sum, c) => sum + c.qty, 0) === 3, 'fresh archived product totals and units agree with receipts');
check(fresh.window.KiwiDayReport.load(day, 'fixture-other-merchant') === null, 'archive does not leak into another synthetic merchant');
check(network === 0 && hardware === 0, 'no network, credentials or hardware operation occurred');
console.log(`✓ promotions receipt/archived-Z contract: ${checks} checks passed; synthetic actual-source only`);
