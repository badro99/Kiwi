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

  /* GENERATED SHARED KiwiPromotionPricing BEGIN */
  /* Copy of functions/api/_rules-promotion-pricing.js made by tools/build-shared-rules.mjs. Edit the source, then run the tool. */
  var KiwiPromotionPricing = (function () {
    const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;
    const toMin = (s) => { var m = HHMM.exec(s || ''); return m ? +m[1] * 60 + +m[2] : null; }
    const money = (v) => { var n = Number(v); return Number.isFinite(n) ? Math.max(0, Math.round(n * 100) / 100) : 0; }
    const down = (n) => { return Math.max(0, Math.floor(n * 100 + 1e-6) / 100); }
    const normalize = (p, surface) => {
        var kind = ['percent', 'amount', 'fixed'].indexOf(p.kind) >= 0 ? p.kind : 'percent';
        var value = money(p.value);
        if (kind === 'percent') value = Math.min(100, Math.round(value));
        var days = (Array.isArray(p.days) ? p.days : []).map(Number).filter(function (d, i, a) {
          return Number.isInteger(d) && d >= 0 && d <= 6 && a.indexOf(d) === i;
        }).sort(function (a, b) { return a - b; });
        var start = HHMM.test(p.start || '') ? p.start : '';
        var end = HHMM.test(p.end || '') ? p.end : '';
        if (!start || !end || start === end) { start = ''; end = ''; }
        return { kind: kind, value: value, days: days.length === 7 ? [] : days, start: start, end: end };
      }
    const inWindow = (p, b) => {
        if (p.days && p.days.length && p.days.indexOf(b.weekday) < 0) return false;
        var s = toMin(p.start), e = toMin(p.end);
        if (s == null || e == null) return true;
        return s < e ? b.min >= s && b.min < e : b.min >= s || b.min < e;
      }
    const price = (p, unit, surface) => {
        var base = money(unit);
        var out = base;
        if (p.kind === 'percent') out = Math.round(Math.round(base * 100) * (100 - p.value) / 100 + 1e-9) / 100;
        else if (p.kind === 'amount') out = base - p.value;
        else out = p.value;
        return Math.min(base, money(out));
      }
    const statusAt = (p, at, moment) => {
      if (!p) return 'ended';
      if (p.paused) return 'paused';
      if (p.to && at > p.to) return 'ended';
      if (p.from && at < p.from) return 'scheduled';
      if (!p.days?.length && !(p.start && p.end)) return 'active';
      return inWindow(p, moment) ? 'active' : 'waiting';
    }
    const lineDeal = (line, fullPrice, live) => {
      const stamp = (line && line.promo && Number.isFinite(+line.promo.price))
        ? { ...line.promo, price: down(line.promo.price) } : null;
      let best = { price: down(+fullPrice || 0), promo: null };
      if (stamp && stamp.price < best.price) best = { price: stamp.price, promo: stamp };
      if (live && live.price < best.price) best = { price: live.price,
        promo: { price: live.price, badge: live.badge, name: live.promo.name, id: live.promo.id } };
      return best;
    }
    const lineUnit = (base, remise) => { return down(+(base * (100 - remise) / 100) || 0); }
    const appliesMenu = (p, line) => {
      if (!line || line.kind === 'formula' || line.kind === 'formula-part') return false;
      if (p.all) return true;
      if (line.itemId && p.items.indexOf(String(line.itemId)) >= 0) return true;
      return !!line.catId && p.cats.indexOf(String(line.catId)) >= 0;
    }
    const resolveMenu = (promos, line, unit, moment) => {
      const base = money(unit);
      if (!(base > 0) || !Array.isArray(promos) || !promos.length) return null;
      let best = null;
      for (const p of promos) {
        if (!appliesMenu(p, line) || statusAt(p, moment.date, moment) !== 'active') continue;
        const value = price(p, base);
        if (value >= base) continue;
        best = choosePromotion(best, { price: value, promo: p }, true);
      }
      if (!best) return null;
      const p = best.promo;
      const badge = p.kind === 'percent' ? '−' + p.value + ' %' : p.kind === 'amount'
        ? '−' + String(p.value).replace('.', ',') + ' MAD' : String(p.value).replace('.', ',') + ' MAD';
      return { price: best.price, promo: { id: p.id, name: p.name, badge, before: base } };
    }
    const stockOf = (item) => {
        if (!item || !item.sizes) return 0;
        return Object.keys(item.sizes).reduce(function (s, k) { return s + (+item.sizes[k] || 0); }, 0);
      }
    const toTs = (v) => {
        if (!v) return 0;
        if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
        var t = new Date(v).getTime();
        return Number.isFinite(t) ? t : 0;
      }
    const matches = (p, item, stock) => {
        if (!p || !item) return false;
        var sc = p.scope || {};
        if (sc.type === 'tout') return true;
        if (sc.type === 'rayon') return (sc.ids || []).indexOf(item.rayon) >= 0 || (!!item.uncat && (sc.ids || []).indexOf('_uncat') >= 0);
        if (sc.type === 'produits') return (sc.ids || []).indexOf(item.id) >= 0;
        if (sc.type === 'avant') {
          var bef = toTs(sc.before);
          var itAt = toTs(item.createdAt);
          return !!bef && !!itAt && itAt < bef;
        }
        if (sc.type === 'stock') {
          var n = (stock == null) ? stockOf(item) : stock;
          /* Un article épuisé ne porte pas d'affiche « fin de série » : la pastille
             promettrait un prix sur une étagère vide. */
          return n > 0 && n <= (sc.max || 0);
        }
        return false;
      }
    const choosePromotion = (best, candidate, zeroAge = false) => {
      const age = p => zeroAge ? (p.createdAt || 0) : p.createdAt;
      return !best || candidate.price < best.price || (candidate.price === best.price && age(candidate.promo) < age(best.promo)) ? candidate : best;
    }
    return { toMin, money, down, normalize, inWindow, price, statusAt, lineDeal, lineUnit, appliesMenu, resolveMenu, stockOf, toTs, matches, choosePromotion };
  })();
  /* GENERATED SHARED KiwiPromotionPricing END */
  function resolve(promos, line, unit, now) {
    return KiwiPromotionPricing.resolveMenu(promos, line, unit, businessMoment(now));
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
