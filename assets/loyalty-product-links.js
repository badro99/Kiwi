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

  function fold(v) {
    return String(v || '').normalize('NFD').replace(/\p{M}+/gu, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  }
  /* Same rule as the earning side (functions/api/_rules-loyalty.js qualifyingQty):
     a word under 4 letters typed with an accent (« Thé ») is accent-sensitive, or
     « The Burger » would be linked by id and then earn through the id path. */
  function plain(v) { return String(v || '').normalize('NFC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim(); }
  function strictWord(raw) { var want = fold(raw); return want.length < 4 && plain(raw) !== want; }
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
    var want = fold(word), strict = strictWord(word), exact = plain(word), ids = new Set();
    if (prev && fold(prev.item) === want && Array.isArray(prev.ids)) prev.ids.forEach(function (id) { if (id) ids.add(String(id)); });
    if (want) (items || venueItems()).forEach(function (it) {
      var name = strict ? plain(it && it.name) : fold(it && it.name);
      if (it && it.id && (' ' + name + ' ').indexOf(' ' + (strict ? exact : want) + ' ') >= 0) ids.add(String(it.id));
    });
    return Array.from(ids);
  }

  window.KiwiLoyaltyLinks = Object.freeze({ linkedIds: linkedIds, MAX_IDS: MAX_IDS, unavailable: function () { return failures.slice(); } });
})();
