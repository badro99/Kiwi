/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · MENU PROMOTIONS — window.KiwiMenuPromos (and globalThis on the server)
 * ---------------------------------------------------------------------------
 * The restaurant and café counterpart of assets/promos.js (boutique). A
 * promotion is a RULE the owner sets once on the menu (« Happy hour : −20 %
 * sur les boissons, 17 h–19 h, du lundi au jeudi ») and that prices itself,
 * on every device, without anyone at the counter remembering it. A discount
 * (« remise ») stays what it was: a gesture on one bill, approved by a
 * manager.
 *
 * ONE FILE, THREE RUNTIMES. The till (kiwi-caisse.html), the waiter app
 * (kiwi-serveur.html) and the server's canonical pricer (priceOrder in
 * functions/api/order/_lib.js) all load this file, so a drink costs the same
 * on the tablet, on the till and on the ticket the server writes. It is a
 * classic script with no import/export: the browser loads it with <script>,
 * the Worker and node import it for its side effect and read
 * globalThis.KiwiMenuPromos.
 *
 * The server is the authority. A tablet shows the price this file computes
 * locally, but the order it sends is repriced by priceOrder at the moment it
 * arrives; a device cannot invent a discount.
 *
 * ── The rules ────────────────────────────────────────────────────────────
 *   · Scope: whole menu, some categories, or some items. Composed menus
 *     (formules) and their components are never discounted: a formula has
 *     its own price.
 *   · Kind: percent off, amount off (MAD), or a fixed price. Never below
 *     zero, never above the regular price.
 *   · Window: optional first/last business day, weekdays, and daily hours.
 *     All in Casablanca time, on the 05:00 business day the till uses: a
 *     22:00–01:00 window on Friday still counts as Friday at 00:30.
 *   · Two promotions on one item never add up. The LOWEST price wins; on a
 *     tie, the older one, so the price does not jump when an equivalent
 *     promotion is created.
 *   · Prices keep their centimes (the restaurant till is centime-exact).
 *
 * The price is frozen on the line when the item is ordered, like a paper
 * ticket: a tea ordered at 18:55 keeps its happy-hour price when the bill is
 * paid at 19:10.
 * ═══════════════════════════════════════════════════════════════════════════ */
(function (root) {
  'use strict';

  var rules = root.KiwiPromoRules;
  var TZ = 'Africa/Casablanca';
  var BUSINESS_DAY_START_MIN = 5 * 60;      /* the till's 05:00 boundary */
  var KINDS = ['percent', 'amount', 'fixed'];
  var MAX_PROMOS = 40;

  var str = function (v, max) { return String(v == null ? '' : v).trim().slice(0, max); };
  var money = rules.money;
  var DAY = /^\d{4}-\d{2}-\d{2}$/;
  var businessMoment = rules.businessMoment;

  /* Bounded and typed, the same on every writer. Unknown categories and items
     are dropped; a promotion that targets nothing is dropped. */
  function sanitize(list, menu) {
    var catIds = null, itemIds = null;
    if (menu && typeof menu === 'object') {
      catIds = new Set((menu.cats || []).map(function (c) { return c && String(c.id); }).filter(Boolean));
      itemIds = new Set((menu.items || []).map(function (i) { return i && String(i.id); }).filter(Boolean));
    }
    var seen = new Set();
    return (Array.isArray(list) ? list.slice(0, MAX_PROMOS) : []).map(function (p) {
      if (!p || typeof p !== 'object') return null;
      var id = str(p.id, 40);
      var name = str(p.name, 60);
      if (!id || !name || seen.has(id)) return null;
      seen.add(id);
      var common = rules.normalize(p, 'menu');
      var kind = common.kind, value = common.value;
      if (!(value > 0) && kind !== 'fixed') return null;
      var all = p.all === true;
      var cats = (Array.isArray(p.cats) ? p.cats.slice(0, 60) : []).map(function (x) { return str(x, 40); })
        .filter(function (x) { return x && (!catIds || catIds.has(x)); });
      var items = (Array.isArray(p.items) ? p.items.slice(0, 400) : []).map(function (x) { return str(x, 40); })
        .filter(function (x) { return x && (!itemIds || itemIds.has(x)); });
      if (!all && !cats.length && !items.length) return null;
      var days = common.days, start = common.start, end = common.end;
      return {
        id: id, name: name, kind: kind, value: value,
        all: all, cats: all ? [] : cats, items: all ? [] : items,
        from: DAY.test(p.from || '') ? p.from : '',
        to: DAY.test(p.to || '') ? p.to : '',
        days: days.length === 7 ? [] : days,
        start: start, end: end,
        paused: p.paused === true,
        createdAt: Math.max(0, Math.round(Number(p.createdAt) || 0)),
      };
    }).filter(Boolean);
  }

  /* Is the promotion running at `now`? */
  function isActive(p, now) { return rules.status(p, now, 'menu') === 'active'; }
  function status(p, now) { return rules.status(p, now, 'menu'); }

  function badge(p) {
    if (!p) return '';
    if (p.kind === 'percent') return '−' + p.value + ' %';
    if (p.kind === 'amount') return '−' + String(p.value).replace('.', ',') + ' MAD';
    return String(p.value).replace('.', ',') + ' MAD';
  }

  function applies(p, line) {
    if (!line || line.kind === 'formula' || line.kind === 'formula-part') return false;
    if (p.all) return true;
    if (line.itemId && p.items.indexOf(String(line.itemId)) >= 0) return true;
    return !!line.catId && p.cats.indexOf(String(line.catId)) >= 0;
  }

  function priceWith(p, unit) { return rules.price(p, unit, 'menu'); }

  /* The price of one unit of `line` ({ itemId, catId, kind }) whose regular
     unit price is `unit`, at `now`. Null when no running promotion lowers it.
     Otherwise { price, promo: { id, name, badge, before } }: the stamp the
     line keeps for the receipt and for reporting. */
  function resolve(promos, line, unit, now) {
    var base = money(unit);
    if (!(base > 0) || !Array.isArray(promos) || !promos.length) return null;
    var best = null;
    for (var i = 0; i < promos.length; i++) {
      var p = promos[i];
      if (!applies(p, line) || !isActive(p, now)) continue;
      var price = priceWith(p, base);
      if (price >= base) continue;
      if (!best || price < best.price
          || (price === best.price && (p.createdAt || 0) < (best.p.createdAt || 0))) best = { price: price, p: p };
    }
    if (!best) return null;
    return { price: best.price, promo: { id: best.p.id, name: best.p.name, badge: badge(best.p), before: base } };
  }

  /* Same identity on both sides of a stack: two units at two different
     prices are two lines, never one. */
  var stackKey = function (stamp) { return stamp && stamp.id ? stamp.id + '@' + stamp.before : ''; };

  var api = {
    TZ: TZ, KINDS: KINDS.slice(),
    sanitize: sanitize, isActive: isActive, status: status, resolve: resolve,
    badge: badge, businessMoment: businessMoment, stackKey: stackKey,
  };
  root.KiwiMenuPromos = api;
})(typeof window !== 'undefined' ? window : globalThis);
