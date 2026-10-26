import dashboardDependencies from './dashboard-dependencies.cjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const layout = fs.readFileSync(new URL('../assets/design-vexel-layout.js', import.meta.url), 'utf8');
const dashboard = dashboardDependencies.eager(fs.readFileSync(new URL('../dashboard.html', import.meta.url), 'utf8'));
const channelSource = fs.readFileSync(new URL('../assets/channel-sales.js', import.meta.url), 'utf8');
const context = { window: {} };
vm.runInNewContext(channelSource, context);
const truth = context.window.KiwiChannelSales;
const restaurant = { base: () => 'restaurant' };
const ids = ['dining', 'takeaway', 'delivery', 'orderpro'];

assert.match(
  layout,
  /var pct = Math\.round\(\(empty \? 0 : share\) \* 100\) \+ ' %';/,
  'every channel ring keeps its percentage unit, including an empty 0 % ring'
);
assert.doesNotMatch(
  layout,
  /var pct = empty \? ['"]—['"] :/,
  'channel rings never replace a percentage with a dash'
);
assert.match(
  layout,
  /var splitLabel = hasAmounts \? copy\.share : \(total > 0 \? copy\.unavailable : copy\.noSales\)/,
  'the subtitle still distinguishes measured shares from unavailable breakdowns'
);
assert.match(dashboard, /assets\/channel-sales\.js\?v=\d+/);
assert.match(dashboard, /assets\/design-vexel-layout\.js\?v=\d+/);
assert.match(layout, /rawBase !== authoritative/, 'the active venue family overrides stale venue metadata');

assert.equal(truth.key({ channel: 'salle' }, ids, restaurant, 'restaurant'), 'dining');
assert.equal(truth.key({ session: 'visit-12' }, ids, restaurant, 'restaurant'), 'dining');
assert.equal(truth.key({ id: 'visit-12-emp' }, ids, restaurant, 'restaurant'), 'dining');
assert.equal(truth.key({ label: 'À emporter #12', origin: 'caisse' }, ids, restaurant, 'restaurant'), 'takeaway');
assert.equal(truth.key({ origin: 'orderpro' }, ids, restaurant, 'restaurant'), 'orderpro');
assert.equal(truth.key({ origin: 'caisse', label: 'SB-27' }, ids, restaurant, 'restaurant'), 'dining');
const boutique = { base: () => 'boutique' };
const boutiqueIds = ['counter', 'pickup', 'delivery'];
assert.equal(truth.key({ origin: 'caisse' }, boutiqueIds, boutique, 'boutique'), 'counter');
assert.equal(truth.key({ origin: 'caisse', method: 'delivery' }, boutiqueIds, boutique, 'boutique'), 'delivery');
assert.equal(truth.key({ origin: 'caisse', raw: 'livraison' }, boutiqueIds, boutique, 'boutique'), 'delivery');
assert.equal(truth.key({ origin: 'caisse', label: 'Réservation-retrait #17' }, boutiqueIds, boutique, 'boutique'), 'pickup');
assert.equal(truth.key({ origin: 'shopify' }, boutiqueIds, boutique, 'boutique'), '');

const yesterday = truth.breakdown([
  { ts: 110, amount: 180, origin: 'caisse', label: 'SB-24' },
  { ts: 120, amount: 97, origin: 'caisse', label: 'Table 3' },
], ids, 100, 200, restaurant, 'restaurant');
assert.equal(yesterday.total, 277);
assert.equal(yesterday.amounts.dining, 277);
assert.equal(yesterday.amounts.dining / yesterday.total, 1, 'all dining-room takings render Salle 100 %');

const boutiqueYesterday = truth.breakdown([
  { ts: 110, amount: 180, origin: 'caisse', label: 'Caftan +2 art.' },
  { ts: 120, amount: 97, origin: 'caisse', label: 'Jean noir' },
], boutiqueIds, 100, 200, boutique, 'boutique');
assert.equal(boutiqueYesterday.total, 277);
assert.equal(boutiqueYesterday.amounts.counter, 277);
assert.equal(boutiqueYesterday.unknown, 0);
assert.equal(boutiqueYesterday.amounts.counter / boutiqueYesterday.total, 1, 'legacy boutique caisse takings render Comptoir 100 %');

const boutiqueMixed = truth.breakdown([
  { ts: 110, amount: 50, origin: 'caisse' },
  { ts: 120, amount: 30, origin: 'caisse', method: 'delivery' },
  { ts: 130, amount: 20, origin: 'caisse', label: 'Réservation-retrait #17' },
], boutiqueIds, 100, 200, boutique, 'boutique');
assert.equal(boutiqueMixed.amounts.counter, 50);
assert.equal(boutiqueMixed.amounts.delivery, 30);
assert.equal(boutiqueMixed.amounts.pickup, 20);
assert.equal(boutiqueMixed.unknown, 0);

const partial = truth.breakdown([
  { ts: 110, amount: 10, channel: 'dining' },
  { ts: 120, amount: 90 },
], ids, 100, 200, restaurant, 'restaurant');
assert.equal(partial.amounts.dining / partial.total, 0.1, 'unknown money stays in the denominator');
assert.equal(partial.unknown, 90);

/* Refunds come off the channel of the sale they reverse (sync ledger, 20 Oct):
 * 404,10 kept after a 20,40 card refund must not read 425 on the rings. */
const refunded = truth.breakdown([
  { ts: 110, amount: 300, saleId: 's-1', channel: 'dining' },
  { ts: 120, amount: 124.5, saleId: 's-2', label: 'À emporter #4' },
], ids, 100, 200, restaurant, 'restaurant', [
  { ts: 150, amount: 20.4, saleId: 's-1', method: 'card' },
]);
assert.equal(refunded.total, 404.1, 'a refund comes off the total: 424,50 sold, 20,40 refunded, 404,10 kept');
assert.equal(refunded.amounts.dining, 279.6, 'the refund comes off the channel of the sale it reverses');
assert.equal(refunded.amounts.takeaway, 124.5, 'other channels keep their takings');
assert.equal(refunded.unknown, 0);
const outside = truth.breakdown([{ ts: 110, amount: 100, saleId: 's-3', channel: 'dining' }], ids, 100, 200, restaurant, 'restaurant',
  [{ ts: 250, amount: 100, saleId: 's-3' }, { ts: 150, amount: 40, saleId: 'gone' }]);
assert.equal(outside.total, 60, 'a refund paid after the window stays out; one whose sale is unknown still leaves the total');
assert.equal(outside.classified, 0, 'an unmatched refund makes the remaining net unclassified rather than inventing an allocation');
assert.equal(outside.unknown, 60, 'the whole remaining net is visible as unknown');
assert.match(layout, /var shareBase = Math\.max\(total, classifiedTotal\);/, 'an unmatched refund leaves classified above the net: rings divide by the larger, never past 100 %');
assert.match(layout, /amount \/ shareBase/, 'each ring reads its share of shareBase');
const over = truth.breakdown([{ ts: 110, amount: 30, saleId: 's-4', channel: 'dining' }], ids, 100, 200, restaurant, 'restaurant',
  [{ ts: 150, amount: 80, saleId: 's-4' }]);
assert.equal(over.amounts.dining, 0, 'a channel never goes below zero');
assert.equal(over.total, 0, 'the total never goes below zero');
assert.match(layout, /KiwiChannelSales\.breakdown\(rows, ids, from, to, window\.KiwiTrades, activeTrade\(\), refunds\)/,
  'the dashboard passes the refund ledger to the channel rings');

assert.match(layout, /distribution = channels\.map/);
assert.match(layout, /split\.unknown \/ split\.total/);

console.log('channel-percentage-test: 42 controls passed');
