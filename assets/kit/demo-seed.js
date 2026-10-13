/* Kiwi · kit/demo-seed.js : demo data with no randomness (design 2027, §17.1 and §17.4).
 *
 * Demo data is seeded by STORE and BUSINESS DAY: the same (storeId, businessDay)
 * always yields the same numbers, on every load, on every machine, in every
 * browser. Nothing here reads a clock, a counter or a random source, so the
 * `no-random-demo` lint can ban all of them in this file without exceptions.
 *
 *   seed      = hash(storeId + businessDay)           FNV-1a, 32 bits
 *   stream    = mulberry32(seed mixed with a salt)    one stream per purpose
 *
 * What it will never invent (§17.3): card last-four digits, bank names, card
 * brands or terminal states. A card sale is a card sale: `method: 'card'`.
 *
 * It knows nothing about time zones or cutoffs. The caller hands it the
 * day's window (`startTs`, `endTs`, from the ledger's own business-day rule),
 * and the seed spreads orders by offset from `startTs`. That keeps the one
 * client copy of the business-day defaults where §17.1 puts it
 * (`assets/kit/business-day.js`).
 *
 * Read-only and adopted by nothing: stage 1 adds the module; stage 5 swaps the
 * dashboard's demo generators for it.
 *
 *   KiwiDemoSeed.hash(text)                       -> uint32
 *   KiwiDemoSeed.seedFor(storeId, businessDay)    -> uint32  (hash(storeId + businessDay))
 *   KiwiDemoSeed.rng(storeId, businessDay, salt)  -> () => float in [0, 1)
 *   KiwiDemoSeed.ordersForDay(storeId, businessDay, { startTs, endTs, until })
 *                                                 -> { sales: [...], refunds: [...] }
 */
(function (root) {
  'use strict';

  var HOUR = 3600000;
  var MIN = 60000;

  /* FNV-1a over UTF-16 code units, 32 bits. */
  function hash(text) {
    var h = 0x811c9dc5, s = String(text);
    for (var i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h >>> 0;
  }

  function seedFor(storeId, businessDay) {
    return hash(String(storeId) + String(businessDay));
  }

  /* mulberry32. A salt gives an independent stream from the same seed. */
  function rng(storeId, businessDay, salt) {
    var a = (seedFor(storeId, businessDay) + hash(String(salt == null ? '' : salt))) >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function int(r, lo, hi) { return lo + Math.floor(r() * (hi - lo + 1)); }

  /* Typical menu prices of a Moroccan café-restaurant, in MAD. A basket is one
   * to four of them. Whole dirhams only, like the printed menu. */
  var PRICES = [15, 19, 22, 25, 30, 35, 38, 45, 52, 85, 95, 110, 120, 140, 150];

  function basket(r) {
    var lines = int(r, 1, 4), total = 0;
    for (var i = 0; i < lines; i++) total += PRICES[int(r, 0, PRICES.length - 1)] * int(r, 1, 2);
    return total;
  }

  /* Orders are placed between 6 h and 19 h after the day's start (11:00 to 24:00
   * on a 05:00 cutoff), thinner in the morning, with a lunch and a dinner peak.
   * The offset weights are fixed numbers, not a distribution fitted to data. */
  function placeOffset(r) {
    var u = r();
    var h = u < 0.12 ? 6 + r() * 2          // morning coffee
          : u < 0.52 ? 8 + r() * 3          // lunch
          : u < 0.62 ? 11 + r() * 3         // afternoon
          : 14 + r() * 5;                   // dinner
    return Math.floor(h * HOUR + r() * HOUR / 2);
  }

  /* One store-day: about 90 to 180 sales (cash 40 %, card 60 %), a refund on
   * roughly one sale in sixty, in time order. `until` cuts the day at a moment,
   * so "today so far" is a prefix of the full day and never a different day. */
  function ordersForDay(storeId, businessDay, win) {
    if (!win || !isFinite(win.startTs) || !isFinite(win.endTs) || win.endTs <= win.startTs) {
      return { sales: [], refunds: [] };
    }
    var r = rng(storeId, businessDay, 'orders');
    var n = int(r, 90, 180);
    var sales = [], refunds = [];
    for (var i = 0; i < n; i++) {
      var ts = win.startTs + placeOffset(r);
      var amount = basket(r);
      var method = r() < 0.4 ? 'cash' : 'card';
      var refund = r() < 1 / 60;
      var cut = r();
      if (ts >= win.endTs) ts = win.endTs - MIN * (1 + (i % 30));
      sales.push({ id: 'demo-' + hash(storeId + businessDay + i).toString(36), ts: ts, amount: amount, method: method });
      if (refund) {
        refunds.push({
          saleId: sales[sales.length - 1].id,
          ts: Math.min(win.endTs - 1, ts + (5 + Math.floor(cut * 40)) * MIN),
          amount: Math.round(amount / 2),
          method: method,
          kind: 'refund',
        });
      }
    }
    sales.sort(function (a, b) { return a.ts - b.ts || (a.id < b.id ? -1 : 1); });
    refunds.sort(function (a, b) { return a.ts - b.ts || (a.saleId < b.saleId ? -1 : 1); });
    if (isFinite(win.until)) {
      sales = sales.filter(function (s) { return s.ts <= win.until; });
      refunds = refunds.filter(function (f) { return f.ts <= win.until; });
    }
    return { sales: sales, refunds: refunds };
  }

  var api = { hash: hash, seedFor: seedFor, rng: rng, ordersForDay: ordersForDay };
  if (typeof module === 'object' && module && module.exports) module.exports = api;
  else root.KiwiDemoSeed = api;
})(typeof window !== 'undefined' ? window : globalThis);
