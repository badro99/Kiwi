/* Règles pures de promotion. Politiques historiques explicites, aucun stockage. */
(function (root) {
  'use strict';
  var TZ = 'Africa/Casablanca', BUSINESS_DAY_START_MIN = 300;
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
  var money = KiwiPromotionPricing.money, down = KiwiPromotionPricing.down, toMin = KiwiPromotionPricing.toMin;
  var normalize = KiwiPromotionPricing.normalize, inWindow = KiwiPromotionPricing.inWindow, price = KiwiPromotionPricing.price;
  var fmt = null, fmtZone = null;
  function clock() {
    var report = root.KiwiDayReport;
    return { zone: report && report.timezone ? report.timezone() : TZ,
      cutoff: report && report.cutoff ? report.cutoff() * 60 : BUSINESS_DAY_START_MIN };
  }
  function wall(now, zone) {
    if (!fmt || fmtZone !== zone) {
      fmtZone = zone;
      fmt = new (globalThis.KiwiZoneLaw?.DateTimeFormat || Intl.DateTimeFormat)('en-GB', { timeZone: zone, hourCycle: 'h23',
        year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
    }
    var p = {};
    fmt.formatToParts(new Date(now)).forEach(function (x) { p[x.type] = x.value; });
    return { y: +p.year, mo: +p.month, d: +p.day, min: (+p.hour) * 60 + (+p.minute) };
  }

  /* The business day a moment belongs to: before 05:00 it is still the day
     before. Returns its date (YYYY-MM-DD), weekday (0 = Sunday) and the wall
     minutes of the moment. */
  function businessMoment(now) {
    var config = clock();
    var w = wall(now == null ? Date.now() : now, config.zone);
    var date = new Date(Date.UTC(w.y, w.mo - 1, w.d));
    if (w.min < config.cutoff) date = new Date(date.getTime() - 86400000);
    return { date: date.toISOString().slice(0, 10), weekday: date.getUTCDay(), min: w.min };
  }


  function status(p, now, surface) {
    var b = surface === 'menu' ? businessMoment(now) : null;
    // Preserve date-only boutique eligibility; compute the clock only for a timed window.
    var moment = b || (p && (p.days?.length || (p.start && p.end)) ? businessMoment(now) : null);
    return KiwiPromotionPricing.statusAt(p, b ? b.date : now, moment);
  }


  root.KiwiPromoRules = Object.freeze({ normalize: normalize, businessMoment: businessMoment,
    inWindow: inWindow, status: status, price: price, money: money, down: down, toMin: toMin });
})(/** @type {any} */ (globalThis).window || globalThis);
