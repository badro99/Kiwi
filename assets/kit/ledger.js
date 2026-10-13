/* Kiwi · kit/ledger.js : KiwiLedger, in SHADOW MODE (design 2027, §17 and §21.2).
 *
 * One reader for every figure, on each store's business day. Stage 1 adds the
 * module and its tests. NOTHING ADOPTS IT: no shipped surface calls it, no
 * figure on screen comes from it, and it writes nothing (no storage, no
 * network, no console). In `shadow` it computes beside the shipped figure and
 * keeps the difference in memory for the round's evidence file.
 *
 *   KiwiLedger.get(key, range, opts)    -> { value, precision, asOf, businessDay,
 *                                            cutoff, source, ... }
 *   KiwiLedger.compare(key, baseline, opts)
 *                                       -> { delta, baselineValue, baselineLabel, ... }
 *   KiwiLedger.reader(surface)          -> { get, compare }  (the surface is
 *                                          named so a shadow difference says where)
 *   KiwiLedger.shadow.*                 -> mode, eligibility, check, diffs, evidence
 *
 * KEYS    revenue (sales net of refunds, tips excluded), orders, avg_ticket
 *         (revenue / orders), refunds, card_revenue, cash_revenue, card_share
 *         (whole percent of revenue), tips.
 * RANGE   'today' | 'yesterday' | 'last7' | 'last30' | { day } |
 *         { from, to } (business days, both included).
 * PRECISION  the decimals the figure is exact to: 2 for money, 0 for a count
 *         or a percentage. An uncomputable figure is `{ value: null,
 *         computable: false, reason }`, never a zero and never a guess (§17.3).
 *
 * THE DAY    A sale belongs to the business day the server gives it:
 *         `businessDate(ts, cutoff, zone)` of functions/api/_business-day.js,
 *         mirrored below to the letter (same Intl clock, same boundary search).
 *         A day window is [boundary(day), boundary(day + 1)) at that day's own
 *         cutoff. A closed day keeps the cutoff its Z report recorded; two
 *         reports that disagree make the day `cutoff-conflict` with each
 *         report's own figure (z-reconciliation.js, `cutoffConflict`).
 *
 * THE DEFAULTS are not here. `cutoff = config.businessCutoff ?? DEFAULT_CUTOFF`
 * and `zone = config.timezone || DEFAULT_ZONE` live in assets/kit/business-day.js
 * and nowhere else (§17.1, kit-lint). This file asks for them through the
 * `resolve(config)` it is given, or `window.KiwiBusinessDay.resolve(config)`
 * when that module is loaded, and answers "not computable" when neither exists.
 */
(function (root) {
  'use strict';

  var DAY = 86400000;
  var SURFACES = ['home', 'orders', 'report', 'notifications', 'z', 'terminals', 'team', 'ai'];
  var KEYS = {
    revenue: 2, orders: 0, avg_ticket: 2, refunds: 2,
    card_revenue: 2, cash_revenue: 2, card_share: 0, tips: 2,
  };

  /* ── The business day, as the server computes it ───────────────────────── */

  var clocks = {};
  function clock(zone) {
    if (!clocks[zone]) {
      clocks[zone] = new Intl.DateTimeFormat('en-GB', {
        timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
      });
    }
    return clocks[zone];
  }
  function parts(epoch, zone) {
    var o = {};
    clock(zone).formatToParts(epoch).forEach(function (p) { o[p.type] = p.value; });
    return o;
  }
  function addDays(day, n) {
    return new Date(Date.parse(day + 'T00:00:00Z') + n * DAY).toISOString().slice(0, 10);
  }
  function businessDate(epoch, cutoff, zone) {
    var p = parts(epoch, zone);
    var day = p.year + '-' + p.month + '-' + p.day;
    return Number(p.hour) < cutoff ? addDays(day, -1) : day;
  }
  /* The instant the local wall clock reads `calDay` at `minutes` past midnight. */
  function wallToEpoch(calDay, minutes, zone) {
    var target = Date.parse(calDay + 'T00:00:00Z') + minutes * 60000;
    var guess = target;
    for (var i = 0; i < 4; i++) {
      var p = parts(guess, zone);
      var seen = Date.parse(p.year + '-' + p.month + '-' + p.day + 'T' + p.hour + ':' + p.minute + ':' + p.second + 'Z');
      if (seen === target) return guess;
      guess += target - seen;
    }
    return guess;
  }
  function boundary(day, cutoff, zone) { return wallToEpoch(day, cutoff * 60, zone); }

  function validCutoff(v) { return typeof v === 'number' && isFinite(v) && Math.floor(v) === v && v >= 0 && v <= 12; }
  function validDay(d) { return typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d) && !isNaN(Date.parse(d + 'T00:00:00Z')); }
  function pad2(n) { return (n < 10 ? '0' : '') + n; }

  /* ── Tenders, as dateRange.js reads them today (shadow compares like with like) ── */

  function tender(method) {
    var m = String(method || '').trim().toLowerCase();
    if (['cash', 'especes', 'espèces'].indexOf(m) >= 0) return 'cash';
    if (['card', 'carte', 'visa', 'mc', 'mastercard', 'tap'].indexOf(m) >= 0) return 'card';
    return 'other';
  }
  function cents(v) { return Math.round((Number(v) || 0) * 100); }

  /* A split sale attributes its amount to the tenders that paid it, in
   * proportion to what each part received. The last part takes the rounding. */
  function saleParts(e) {
    var total = Math.max(0, cents(e.amount));
    var ps = Array.isArray(e.paymentParts) ? e.paymentParts.filter(function (p) {
      return p && tender(p.method) !== 'other' && Number.isSafeInteger(+p.amountCents) && +p.amountCents > 0;
    }) : [];
    if (!ps.length) return [{ t: tender(e.method), c: total }];
    var received = ps.reduce(function (s, p) { return s + (+p.amountCents); }, 0), left = total;
    return ps.map(function (p, i) {
      var c = i === ps.length - 1 ? left : Math.round(total * (+p.amountCents) / received);
      left -= c;
      return { t: tender(p.method), c: c };
    });
  }

  function emptyAgg() { return { sales: 0, refunds: 0, orders: 0, card: 0, cash: 0, tips: 0 }; }
  function addAgg(a, b) { for (var k in a) a[k] += b[k]; return a; }

  function aggregate(sales, refunds, from, to) {
    var a = emptyAgg();
    for (var i = 0; i < sales.length; i++) {
      var e = sales[i], ts = +(e && e.ts) || 0;
      if (!e || ts < from || ts >= to) continue;
      var c = Math.max(0, cents(e.amount));
      a.sales += c; a.orders++;
      a.tips += e.tipCents != null ? Math.max(0, Math.round(+e.tipCents) || 0) : Math.max(0, cents(e.tip));
      saleParts(e).forEach(function (p) { if (p.t === 'cash') a.cash += p.c; else if (p.t === 'card') a.card += p.c; });
    }
    for (var j = 0; j < refunds.length; j++) {
      var r = refunds[j], rts = +(r && r.ts) || 0;
      if (!r || rts < from || rts >= to) continue;
      var rc = Math.abs(cents(r.amount)), t = tender(r.method);
      a.refunds += rc;
      if (t === 'cash') a.cash -= rc; else if (t === 'card') a.card -= rc;
    }
    return a;
  }

  function figure(key, a) {
    var net = a.sales - a.refunds;
    switch (key) {
      case 'revenue': return net / 100;
      case 'orders': return a.orders;
      case 'avg_ticket': return a.orders ? Math.round(net / a.orders) / 100 : null;
      case 'refunds': return a.refunds / 100;
      case 'card_revenue': return a.card / 100;
      case 'cash_revenue': return a.cash / 100;
      case 'card_share': return net > 0 ? Math.round(a.card / net * 100) : null;
      case 'tips': return a.tips / 100;
    }
    return null;
  }

  /* ── An instance ────────────────────────────────────────────────────────── */

  function create(initial) {
    var src = {};
    function configure(next) { for (var k in next) src[k] = next[k]; return api; }

    function host(name) { return root[name]; }
    function venueId() {
      if (src.venue) return typeof src.venue === 'function' ? src.venue() : src.venue;
      try { return host('KiwiStore') && host('KiwiStore').currentVenue && host('KiwiStore').currentVenue(); } catch (_) { return undefined; }
    }
    function list(kind) {
      try {
        if (typeof src[kind] === 'function') return src[kind]() || [];
        var h = host(kind === 'sales' ? 'KiwiSales' : 'KiwiRefunds');
        return (h && h.list && h.list(venueId())) || [];
      } catch (_) { return []; }
    }
    function rawConfig() {
      try { return (typeof src.config === 'function' ? src.config() : host('KiwiConfig')) || {}; } catch (_) { return {}; }
    }
    function resolver() {
      if (typeof src.resolve === 'function') return src.resolve;
      var bd = host('KiwiBusinessDay');
      return bd && typeof bd.resolve === 'function' ? bd.resolve.bind(bd) : null;
    }
    function now() { return typeof src.now === 'function' ? src.now() : Date.now(); }
    function sourceName() { return src.source || 'sales'; }

    function bad(key, reason, asOf, extra) {
      var o = { value: null, computable: false, reason: reason, precision: KEYS[key] == null ? 0 : KEYS[key],
        asOf: asOf, businessDay: null, cutoff: null, source: sourceName() };
      for (var k in extra || {}) o[k] = extra[k];
      return o;
    }

    function store(asOf) {
      var res = resolver();
      if (!res) return { err: 'no-business-day' };
      var s;
      try { s = res(rawConfig()); } catch (_) { s = null; }
      if (!s || !validCutoff(s.cutoff) || typeof s.zone !== 'string' || !s.zone) return { err: 'no-business-day' };
      try { clock(s.zone); } catch (_) { return { err: 'bad-zone' }; }
      var legacy;
      try { legacy = res({}).cutoff; } catch (_) { legacy = s.cutoff; }
      return { cutoff: s.cutoff, zone: s.zone, legacy: validCutoff(legacy) ? legacy : s.cutoff, asOf: asOf };
    }

    /* The window of one day, at that day's own cutoff (server rule). */
    function dayCutoffs(day, st) {
      var zr = typeof src.zReports === 'function' ? (src.zReports(day) || []) : [];
      if (!zr.length) return { cutoffs: [st.cutoff], conflict: false };
      var seen = [], legacy = false;
      zr.forEach(function (z) {
        var c = z && z.cutoff;
        if (validCutoff(c)) { if (seen.indexOf(c) < 0) seen.push(c); } else legacy = true;
      });
      var conflict = seen.length > 1 || (legacy && seen.some(function (v) { return v !== st.legacy; }));
      if (conflict) {
        var all = seen.slice();
        if (legacy && all.indexOf(st.legacy) < 0) all.push(st.legacy);
        return { cutoffs: all, conflict: true };
      }
      return { cutoffs: seen.length ? seen : [st.legacy], conflict: false };
    }

    function expand(range, today) {
      var days;
      if (range === 'today') days = [today];
      else if (range === 'yesterday') days = [addDays(today, -1)];
      else if (range === 'last7' || range === 'last30') {
        var n = range === 'last7' ? 7 : 30;
        days = []; for (var i = n - 1; i >= 0; i--) days.push(addDays(today, -i));
      } else if (range && typeof range === 'object' && validDay(range.day)) days = [range.day];
      else if (range && typeof range === 'object' && validDay(range.from) && validDay(range.to) && range.from <= range.to) {
        days = []; for (var d = range.from; d <= range.to && days.length < 400; d = addDays(d, 1)) days.push(d);
      }
      return days || null;
    }

    function get(key, range, opts) {
      opts = opts || {};
      var asOf = opts.asOf != null ? +opts.asOf : now();
      if (!(key in KEYS)) return bad(key, 'unknown-key', asOf);
      if (!isFinite(asOf)) return bad(key, 'bad-clock', asOf);
      var st = store(asOf);
      if (st.err) return bad(key, st.err, asOf);
      var today = businessDate(asOf, st.cutoff, st.zone);
      var days = expand(range, today);
      if (!days) return bad(key, 'bad-range', asOf);

      var sales = list('sales'), refunds = list('refunds');
      var total = emptyAgg(), conflicts = [];
      days.forEach(function (day) {
        var dc = dayCutoffs(day, st);
        if (dc.conflict) {
          conflicts.push({
            day: day,
            reports: dc.cutoffs.map(function (c) {
              var a = aggregate(sales, refunds, boundary(day, c, st.zone), Math.min(boundary(addDays(day, 1), c, st.zone), asOf + 1));
              return { cutoff: c, value: figure(key, a) };
            }),
          });
          return;
        }
        var c = dc.cutoffs[0];
        var from = boundary(day, c, st.zone), to = Math.min(boundary(addDays(day, 1), c, st.zone), asOf + 1);
        addAgg(total, aggregate(sales, refunds, from, to));
      });
      var last = days[days.length - 1];
      var out = {
        precision: KEYS[key], asOf: asOf, businessDay: last, cutoff: dayCutoffs(last, st).cutoffs[0],
        zone: st.zone, source: sourceName(), days: days.length,
      };
      if (conflicts.length) {
        out.value = null; out.computable = false; out.reason = 'cutoff-conflict'; out.conflicts = conflicts;
        return out;
      }
      var v = figure(key, total);
      out.value = v; out.computable = v !== null;
      if (v === null) out.reason = key === 'card_share' ? 'no-revenue' : 'no-orders';
      return out;
    }

    /* "vs yesterday at 17:39": the baseline day, cut at the same wall-clock time. */
    function compare(key, baseline, opts) {
      opts = opts || {};
      var asOf = opts.asOf != null ? +opts.asOf : now();
      var range = opts.range == null ? 'today' : opts.range;
      var st = store(asOf);
      var none = { delta: null, baselineValue: null, baselineLabel: null, value: null, asOf: asOf, source: sourceName() };
      if (st.err) { none.reason = st.err; return none; }
      if (range !== 'today') { none.reason = 'range-not-comparable'; return none; }
      if (baseline !== 'yesterday' && baseline !== 'weekday') { none.reason = 'no-baseline'; return none; }
      var today = businessDate(asOf, st.cutoff, st.zone);
      var baseDay = addDays(today, baseline === 'yesterday' ? -1 : -7);
      var p = parts(asOf, st.zone);
      var minutes = Number(p.hour) * 60 + Number(p.minute);
      var calDay = Number(p.hour) < st.cutoff ? addDays(baseDay, 1) : baseDay;
      var baseAsOf = wallToEpoch(calDay, minutes, st.zone);
      var cur = get(key, 'today', { asOf: asOf });
      var base = get(key, { day: baseDay }, { asOf: baseAsOf });
      var label = {
        key: baseline === 'yesterday' ? 'compare.yesterday_at' : 'compare.weekday_at',
        params: { time: pad2(Number(p.hour)) + ':' + pad2(Number(p.minute)) },
        baselineDay: baseDay,
      };
      if (baseline === 'weekday') label.params.weekday = new Date(Date.parse(baseDay + 'T00:00:00Z')).getUTCDay();
      var out = { delta: null, baselineValue: base.value, baselineLabel: label, value: cur.value, asOf: asOf, source: sourceName(),
        businessDay: cur.businessDay, baselineDay: baseDay };
      if (cur.value == null || base.value == null) { out.reason = cur.value == null ? cur.reason : base.reason; return out; }
      out.delta = Math.round((cur.value - base.value) * Math.pow(10, KEYS[key])) / Math.pow(10, KEYS[key]);
      return out;
    }

    /* ── Shadow mode (§21.2) ─────────────────────────────────────────────── */

    var diffs = [];
    var shadow = {
      /* kiwiLedger = off | shadow | on. Absent, blocked or unknown means off. */
      mode: function () {
        try {
          var v = root.localStorage && root.localStorage.getItem('kiwiLedger');
          return v === 'shadow' || v === 'on' ? v : 'off';
        } catch (_) { return 'off'; }
      },
      /* Only demo stores, Amira Cafe and anonymised fixtures. A real merchant is
       * refused before a single sale is read. */
      kindOf: function (ctx) {
        ctx = ctx || {};
        var env = root.KiwiEnv, isReal = false;
        if (env) { try { isReal = !!env.isReal(); } catch (_) { isReal = true; } }
        var slug = '';
        try { slug = String((root.KiwiStore && root.KiwiStore.slugFor && root.KiwiStore.slugFor(venueId())) || ''); } catch (_) {}
        if (slug === 'amira-cafe') return 'amira';
        if (isReal) return 'live';
        if (ctx.fixture === true) return 'fixture';
        return env ? 'demo' : 'live';
      },
      eligible: function (ctx) {
        var kind = shadow.kindOf(ctx);
        return { ok: kind !== 'live' && shadow.mode() === 'shadow', kind: kind, mode: shadow.mode() };
      },
      /* Compare a ledger figure with the shipped one. Read-only; returns the
       * difference record, or null when there is none or shadow is not allowed. */
      check: function (args) {
        args = args || {};
        var gate = shadow.eligible(args.ctx);
        if (!gate.ok) return null;
        var led = get(args.key, args.range, { asOf: args.asOf });
        var shipped = args.shipped;
        var tol = KEYS[args.key] === 0 ? 0 : 0.005;
        var same = led.value != null && shipped != null && Math.abs(led.value - shipped) <= tol;
        if (same) return null;
        if (led.value == null && shipped == null) return null;
        var rec = {
          surface: SURFACES.indexOf(args.surface) >= 0 ? args.surface : 'unknown',
          key: args.key, range: args.range, kind: gate.kind,
          ledger: led.value, shipped: shipped == null ? null : shipped,
          delta: led.value != null && shipped != null ? Math.round((led.value - shipped) * 100) / 100 : null,
          reason: led.computable ? '' : led.reason,
          businessDay: led.businessDay, cutoff: led.cutoff, asOf: led.asOf,
        };
        diffs.push(rec);
        if (diffs.length > 500) diffs.shift();
        /* On Amira Cafe the differences are readable in the page only on request. */
        try {
          if (gate.kind === 'amira' && /[?&]ledgerDebug=1(&|$)/.test(String(root.location && root.location.search))) {
            root.__kiwiLedgerDiff = diffs.slice();
          }
        } catch (_) {}
        return rec;
      },
      diffs: function () { return diffs.slice(); },
      clear: function () { diffs.length = 0; },
      /* What the round's evidence file holds: written by the harness, never by the page. */
      evidence: function () {
        return { schema: 'kiwi-ledger-shadow/1', diffs: diffs.slice() };
      },
    };

    function reader(surface) {
      if (SURFACES.indexOf(surface) < 0) throw new Error('KiwiLedger.reader: unknown surface ' + surface);
      return {
        surface: surface,
        get: get,
        compare: compare,
        shadow: function (key, range, shipped, ctx, asOf) {
          return shadow.check({ surface: surface, key: key, range: range, shipped: shipped, ctx: ctx, asOf: asOf });
        },
      };
    }

    var api = {
      configure: configure, get: get, compare: compare, reader: reader, shadow: shadow,
      keys: function () { return Object.keys(KEYS); },
      surfaces: function () { return SURFACES.slice(); },
      create: create,
      /* The server's own arithmetic, exposed so the tests can hold the two together. */
      _businessDate: businessDate, _boundary: boundary,
    };
    if (initial) configure(initial);
    return api;
  }

  var ledger = create();
  if (typeof module === 'object' && module && module.exports) module.exports = ledger;
  else root.KiwiLedger = ledger;
})(typeof window !== 'undefined' ? window : globalThis);
