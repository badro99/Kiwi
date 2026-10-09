#!/usr/bin/env node
/* Ticket #0165 · Customer retention: the rules the owner controls.
 *
 * Groups come from the owner's thresholds and the customer's own rhythm; an
 * offer has a cost, dates and limits; results count who came back after a
 * message. The server keeps the document owner-only and redacted for tills.
 *
 *   node tools/customer-retention-test.mjs
 */
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const read = (p) => fs.readFileSync(new URL('../' + p, import.meta.url), 'utf8');
let passed = 0, failed = 0;
function ok(label, fn) {
  try { fn(); passed++; console.log(`  ✓ ${label}`); }
  catch (e) { failed++; console.log(`  ✗ ${label}\n      ${String(e.message).split('\n')[0]}`); }
}

const window = {
  Kiwi: { handlers: {} },
  KiwiStore: { define: () => ({ get: () => null, set() {}, cloud: () => null, subscribe() {} }) },
};
window.window = window;
const context = { window, document: {}, console, Date, Math, Number, String, JSON, Object, Array, encodeURIComponent };
vm.createContext(context);
vm.runInContext(read('assets/customer-retention.js'), context, { filename: 'customer-retention.js' });
const R = window.KiwiRetention;
const DAY = 86400000;
const NOW = Date.UTC(2026, 9, 9, 12);
const S = R.cleanSettings({ regularDays: 30, inactiveDays: 90, rhythmFactor: 1.5, marginPct: 60 });
const visitsEvery = (days, count, lastDaysAgo) => Array.from({ length: count }, (_, i) => ({ ts: NOW - (lastDaysAgo + i * days) * DAY, amount: 100 }));

ok('the page registers its sidebar handler', () => {
  assert.equal(typeof window.Kiwi.handlers['customer-retention'], 'function');
});
ok('a weekly customer seen 3 days ago is regular', () => {
  assert.equal(R.groupOf({ visits: 6, history: visitsEvery(7, 6, 3) }, S, NOW), 'regular');
});
ok('a weekly customer absent 15 days visits less often (rhythm × 1.5)', () => {
  assert.equal(R.rhythmDays({ history: visitsEvery(7, 6, 15) }, NOW), 7);
  assert.equal(R.groupOf({ visits: 6, history: visitsEvery(7, 6, 15) }, S, NOW), 'less');
});
ok('a monthly customer absent 20 days is still regular: their own rhythm, not a fixed rule', () => {
  assert.equal(R.groupOf({ visits: 4, history: visitsEvery(30, 4, 20) }, S, NOW), 'regular');
});
ok('anyone past the regular threshold visits less often', () => {
  assert.equal(R.groupOf({ visits: 1, history: visitsEvery(1, 1, 40) }, S, NOW), 'less');
});
ok('past the inactive threshold is inactive', () => {
  assert.equal(R.groupOf({ visits: 9, history: visitsEvery(7, 9, 120) }, S, NOW), 'inactive');
});
ok('a customer with no visit is in no group', () => {
  assert.equal(R.groupOf({ visits: 0, history: [] }, S, NOW), null);
});
ok('the owner moves the thresholds and the groups follow', () => {
  const strict = R.cleanSettings({ regularDays: 10, inactiveDays: 30, rhythmFactor: 1.5, marginPct: 60 });
  assert.equal(R.groupOf({ visits: 1, history: visitsEvery(1, 1, 20) }, strict, NOW), 'less');
  assert.equal(R.groupOf({ visits: 1, history: visitsEvery(1, 1, 40) }, strict, NOW), 'inactive');
});
ok('offer cost by kind', () => {
  assert.equal(R.offerCost({ type: 'percent', value: 10 }, 200), 20);
  assert.equal(R.offerCost({ type: 'fixed', value: 50 }, 30), 30);
  assert.equal(R.offerCost({ type: 'item', value: 12 }, 200), 12);
  assert.equal(R.offerCost({ type: 'none', value: 0 }, 200), 0);
});
ok('a suggestion never gives away more than a quarter of the margin', () => {
  assert.equal(R.suggestPercent('inactive', 60), 15);
  assert.equal(R.suggestPercent('less', 60), 10);
  assert.equal(R.suggestPercent('inactive', 20), 5);
});
ok('offers respect their dates', () => {
  assert.equal(R.offerActive({ from: '2026-10-01', to: '2026-10-31' }, '2026-10-09'), true);
  assert.equal(R.offerActive({ from: '2026-10-10', to: '' }, '2026-10-09'), false);
  assert.equal(R.offerActive({ from: '', to: '2026-10-08' }, '2026-10-09'), false);
});
ok('settings and offers are clamped to sane values', () => {
  assert.deepEqual(JSON.parse(JSON.stringify(R.cleanSettings({ regularDays: -4, inactiveDays: 'x', rhythmFactor: 99, marginPct: 0, enabled: 'yes' }))),
    { enabled: false, regularDays: 1, inactiveDays: 90, rhythmFactor: 5, marginPct: 1 });
  const o = R.cleanOffer({ type: 'percent', value: 250, perClient: 0, from: 'soon' }, 'less');
  assert.equal(o.value, 100); assert.equal(o.perClient, 1); assert.equal(o.from, '');
  assert.equal(R.cleanOffer({ type: 'bogus' }, 'regular').type, 'none');
});
ok('results: a visit after the message counts as a return, with its revenue', () => {
  const sentAt = NOW - 10 * DAY;
  const c = { history: [{ ts: NOW - 2 * DAY, amount: 80 }, { ts: NOW - 5 * DAY, amount: 40 }, { ts: NOW - 30 * DAY, amount: 999 }] };
  assert.deepEqual(JSON.parse(JSON.stringify(R.outcome({ sentAt }, c))), { back: true, visits: 2, revenue: 120 });
  assert.equal(R.outcome({ sentAt }, { history: [{ ts: NOW - 30 * DAY, amount: 50 }] }).back, false);
});
ok('Moroccan local numbers become international for WhatsApp', () => {
  assert.equal(R.waPhone('0661 03 44 88'), '212661034488');
  assert.equal(R.waPhone('+33 6 12 34 56 78'), '33612345678');
  assert.equal(R.waPhone(''), '');
});

const store = read('functions/api/store.js');
ok('the server knows the retention document', () => {
  assert.match(store, /retention:\s*\{ keys: \['settings', 'offers', 'sends'\]/);
});
ok('paired tills cannot read the send log nor write the document', () => {
  assert.match(store, /function stripRetention\(\) \{ return \{ settings: null, offers: null, sends: \[\] \}; \}/);
  assert.match(store, /const REDACT = \{[^}]*retention: stripRetention/);
});
const dash = read('dashboard.html');
ok('the sidebar opens the page, sold with the CRM', () => {
  assert.match(dash, /data-action="customer-retention" data-feature="crm"/);
  assert.match(dash, /assets\/customer-retention\.js\?v=\d+/);
});
const src = read('assets/customer-retention.js');
ok('nothing is sent without the owner: WhatsApp opens only from the approve button, only with consent', () => {
  assert.match(src, /if \(x\.blocked \|\| !x\.c\.consent \|\| !phone\) return;/);
  assert.equal((src.match(/wa\.me/g) || []).length, 1);
});
ok('no italics and no em dash in user copy', () => {
  assert.doesNotMatch(src, /font-style:\s*italic/);
  assert.doesNotMatch(src, /—/);
});

console.log(`\ncustomer-retention: ${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
