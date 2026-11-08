/* Kiwi · LOYALTY PRODUCT LINKS — window.KiwiLoyaltyLinks
 *
 * A « per product » loyalty card names its product by a word (« Café »). The
 * word alone stops counting when the merchant renames the item (« Café noir »),
 * so when the programme is saved, the products the word names today are kept
 * by id and keep earning after a rename (note 13, loyalty#0). Saving the same
 * word again keeps the links made earlier.
 *
 * Moved out of features.js on 29 October 2026: the loyalty sheet should not
 * read the menu and boutique catalogues itself. This file reads them; the
 * sheet asks it for ids. Matching uses the same folding as the earning rule
 * (functions/api/_rules-loyalty.js): accents, case and punctuation ignored,
 * whole words only.
 */
(function () {
  'use strict';

  var MAX_IDS = 2000;

  /* The word-matching rule is the earning side's own, generated into this
     file from functions/api/_rules-loyalty.js (r21 loyalty#A0/B1): there is no
     second definition to keep aligned. */
  /* GENERATED SHARED KiwiLoyaltyRules BEGIN */
  /* Copy of functions/api/_rules-loyalty.js made by tools/build-shared-rules.mjs. Edit the source, then run the tool. */
  var KiwiLoyaltyRules = (function () {
    // Loyalty earning, word matching, historical reversals and explicit reward policies.
    const loyaltyOn = (cfg) => !!(cfg && cfg.model && !cfg.auto);
    const pointsFor = (amount, cfg) => Math.max(0,
      Math.floor(amount * Math.max(0, Number(cfg && cfg.amount && cfg.amount.perMad) || 1) + 1e-6));
    const foldName = (v) => String(v || '').normalize('NFD').replace(/\p{M}+/gu, '').toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
    const plainName = (v) => String(v || '').normalize('NFC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
    // The one word-matching rule (r21 loyalty#A0/B1): the earning side below and the programme sheet's
    // product links (assets/loyalty-product-links.js) both ask it. A short word typed with an accent
    // ("Thé") is accent-sensitive: folded it would stamp every "The Burger".
    const wordMatcher = (raw) => {
      const want = foldName(raw), exact = plainName(raw), strict = want.length < 4 && exact !== want;
      return { want, exact, strict, matches: (name) => !!want && (' ' + (strict ? plainName(name) : foldName(name)) + ' ').includes(' ' + (strict ? exact : want) + ' ') };
    };
    // Two spellings of a product word that match the same names (links made for one stay valid for the other).
    const sameWord = (a, b) => { const x = wordMatcher(a), y = wordMatcher(b); return x.want === y.want && x.strict === y.strict && (!x.strict || x.exact === y.exact); };
    const qualifyingQty = (cfg, items) => { // linked products by id (renames keep earning), new ones by word
      const raw = cfg && cfg.product && cfg.product.item, word = wordMatcher(raw), want = word.want, ids = (Array.isArray(cfg && cfg.product && cfg.product.ids) ? cfg.product.ids : []).map(String);
      if (!want && !ids.length) return 0;
      return (Array.isArray(items) ? items : []).reduce((n, item) => {
        const key = String(item && (item.id || item.itemId || item.pid) || '');
        const qty = Math.max(0, Number(item && item.qty) || 0), unit = String(item && item.unit || ''), weighed = /^(weigh|kg|kilos?|kilograms?|g|gr|grams?|l|litres?|liters?|cl|ml)$/i.test(unit) || (qty % 1 !== 0 && !/^(unit|units|piece|pieces|pièce|pièces|pc|pcs|pce|u)$/i.test(unit)); // a fractional quantity is a weighed line unless the unit says pieces
        return (key && ids.indexOf(key) >= 0) || word.matches(item && item.name) ? n + (weighed ? Number(qty > 0) : Math.floor(qty)) : n;
      }, 0);
    }
    const stampsFor = (cfg, items) => {
      if (!loyaltyOn(cfg)) return 0;
      if (cfg.model === 'visit') return 1;
      if (cfg.model !== 'product') return 0;
      return qualifyingQty(cfg, items);
    }
    const refundFor = (sale, amount, cfg, items, client) => {
      const paid = Number(sale && sale.paid || 0), earned = Number(sale && sale.earned || 0);
      const refunded = Number(sale && sale.refunded || 0), clawed = Number(sale && sale.clawed || 0);
      const take = Math.max(0, Math.min(amount, Math.round((paid - refunded) * 100) / 100));
      const claw = paid > 0 && earned > 0
        ? Math.max(0, Math.min(Math.round(earned * (refunded + take) / paid) - clawed, earned - clawed)) : 0;
      const stampsLeft = Math.max(0, Number(sale && sale.stamped || 0) - Number(sale && sale.unstamped || 0));
      const lines = Array.isArray(items) ? items : [];
      const whole = paid > 0 && take >= Math.round((paid - refunded) * 100) / 100 - 0.004;
      const unstamp = cfg.model === 'product' && lines.length
        ? Math.min(stampsLeft, qualifyingQty(cfg, lines)) : (whole ? stampsLeft : 0);
      return { take, claw, unstamp,
        pointsTake: Math.min(claw, Math.max(0, Number(client.points) || 0)),
        stampsTake: Math.min(unstamp, Math.max(0, Number(client.stamps) || 0)) };
    }
    const rewardDiscount = (reward, clientId, base, units) => {
      if (!reward || reward.clientId !== clientId) return 0;
      if (reward.kind !== 'percent') return reward.kind === 'free' && units.length ? Math.min.apply(null, units) : 0;
      const amount = Math.max(0, +base || 0), percent = Math.min(100, Math.max(0, +reward.value || 0));
      return Math.min(amount, Math.round(amount * percent + 1e-9) / 100); // wave Q: nearest centime, every trade
    }
    return { loyaltyOn, pointsFor, foldName, plainName, wordMatcher, sameWord, qualifyingQty, stampsFor, refundFor, rewardDiscount };
  })();
  /* GENERATED SHARED KiwiLoyaltyRules END */
  /* Catalogues that threw during the last read: « menu », « boutique ». */
  var failures = [];

  /* Every product of the current venue: the restaurant menu and the boutique catalogue. */
  function venueItems() {
    var items = [];
    failures = [];
    try {
      var M = window.KiwiMenuStore, V = window.KiwiVenue;
      var vid = V && V.getVenue && V.getVenue();
      if (M && M.items) items = items.concat(M.items(vid) || []);
    } catch (_) { failures.push('menu'); }
    try {
      var B = window.KiwiBoutiqueCatalog;
      if (B && B.listProducts) {
        if (B.use && window.KiwiBoutiqueVenueKey) { var k = window.KiwiBoutiqueVenueKey(); if (k) B.use(k); }
        items = items.concat(B.listProducts() || []);
      }
    } catch (_) { failures.push('boutique'); }
    return items;
  }

  /* word: the product word being saved. prev: the programme's product block before this save. */
  function linkedIds(word, prev, items) {
    var matcher = KiwiLoyaltyRules.wordMatcher(word), ids = new Set();
    /* Earlier links stay only while the new spelling matches the same names: « The » to « Thé »
       switches to accent-sensitive matching, so the links made for « The Burger » must go. */
    if (prev && KiwiLoyaltyRules.sameWord(prev.item, word) && Array.isArray(prev.ids)) prev.ids.forEach(function (id) { if (id) ids.add(String(id)); });
    if (matcher.want) (items || venueItems()).forEach(function (it) {
      if (it && it.id && matcher.matches(it.name)) ids.add(String(it.id));
    });
    return Array.from(ids);
  }

  window.KiwiLoyaltyLinks = Object.freeze({ linkedIds: linkedIds, MAX_IDS: MAX_IDS, unavailable: function () { return failures.slice(); } });
})();
