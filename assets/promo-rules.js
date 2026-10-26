/* Règles pures de promotion. Politiques historiques explicites, aucun stockage. */
(function (root) {
  'use strict';
  var TZ = 'Africa/Casablanca', BUSINESS_DAY_START_MIN = 300;
  var HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;
  function toMin(s) { var m = HHMM.exec(s || ''); return m ? +m[1] * 60 + +m[2] : null; }
  function money(v) { var n = Number(v); return Number.isFinite(n) ? Math.max(0, Math.round(n * 100) / 100) : 0; }
  function down(n) { return Math.max(0, Math.floor(n + 1e-6)); }
  var fmt = null;
  function wall(now) {
    if (!fmt) {
      fmt = new (globalThis.KiwiZoneLaw?.DateTimeFormat || Intl.DateTimeFormat)('en-GB', { timeZone: TZ, hourCycle: 'h23',
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
    var w = wall(now == null ? Date.now() : now);
    var date = new Date(Date.UTC(w.y, w.mo - 1, w.d));
    if (w.min < BUSINESS_DAY_START_MIN) date = new Date(date.getTime() - 86400000);
    return { date: date.toISOString().slice(0, 10), weekday: date.getUTCDay(), min: w.min };
  }


  function normalize(p, surface) {
    var kind = ['percent', 'amount', 'fixed'].indexOf(p.kind) >= 0 ? p.kind : 'percent';
    var n = Number(p.value);
    var value = surface === 'boutique' ? Math.max(0, Math.round(Number.isFinite(n) ? n : 0)) : money(p.value);
    if (kind === 'percent') value = Math.min(100, Math.round(value));
    var days = (Array.isArray(p.days) ? p.days : []).map(Number).filter(function (d, i, a) {
      return Number.isInteger(d) && d >= 0 && d <= 6 && a.indexOf(d) === i;
    }).sort(function (a, b) { return a - b; });
    var start = HHMM.test(p.start || '') ? p.start : '';
    var end = HHMM.test(p.end || '') ? p.end : '';
    if (!start || !end || start === end) { start = ''; end = ''; }
    return { kind: kind, value: value, days: days.length === 7 ? [] : days, start: start, end: end };
  }
  function inWindow(p, b) {
    if (p.days && p.days.length && p.days.indexOf(b.weekday) < 0) return false;
    var s = toMin(p.start), e = toMin(p.end);
    if (s == null || e == null) return true;
    return s < e ? b.min >= s && b.min < e : b.min >= s || b.min < e;
  }
  function status(p, now, surface) {
    if (!p) return 'ended';
    if (p.paused) return 'paused';
    var b = surface === 'menu' ? businessMoment(now) : null;
    var at = b ? b.date : now;
    if (p.to && at > p.to) return 'ended';
    if (p.from && at < p.from) return 'scheduled';
    if (!p.days?.length && !(p.start && p.end)) return 'active';
    return inWindow(p, b || businessMoment(now)) ? 'active' : 'waiting';
  }
  function price(p, unit, surface) {
    var boutique = surface === 'boutique';
    var n = Number(unit);
    var base = boutique ? down(Number.isFinite(n) ? n : 0) : money(unit);
    var out = base;
    if (p.kind === 'percent') out = boutique ? base * (100 - p.value) / 100
      : Math.round(Math.round(base * 100) * (100 - p.value) / 100 + 1e-9) / 100;
    else if (p.kind === 'amount') out = base - p.value;
    else out = p.value;
    return Math.min(base, boutique ? down(out) : money(out));
  }
  root.KiwiPromoRules = Object.freeze({ normalize: normalize, businessMoment: businessMoment,
    inWindow: inWindow, status: status, price: price, money: money, down: down, toMin: toMin });
})(globalThis);
