/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · assets/kit/dashboard.js · the figures (spec §10.21, §10.22, §10.33).
 *
 *   <k-kpi-grid>    .tiles, one root for the whole group (the collection
 *                   rule): label, value and unit, a delta signed by §6.3 whose
 *                   colour follows the KPI's polarity (KiwiLedger.polarity),
 *                   never its sign; loading, empty, not computable, error and
 *                   stale states
 *   <k-chart>       the revenue line: legend band, gridlines from the band
 *                   edge, the business-day x axis, scrub with a Choose
 *                   bracket, role="img" summary, Show data
 *   <k-compare>     the delta row that is a button, and its radiogroup
 *   <k-data-table>  the table Show data opens
 *
 * Nothing here persists anything: k-compare emits its choice and the page's
 * adapter writes localStorage['kiwiRevCompare'] (the gallery writes nothing).
 * ═══════════════════════════════════════════════════════════════════════════ */
(function (root) {
  'use strict';
  var K = root.KiwiKit;
  if (!K) return;
  var esc = K.esc, t = K.t, th = K.th, numHtml = K.numHtml, icon = K.icon;
  var doc = root.document;

  function F() { return root.KiwiFormat || null; }
  function num(n, d) { var f = F(); return f ? f.num(n, d || 0) : String(n); }
  function polarityOf(tile) {
    if (tile.polarity) return tile.polarity;
    var L = root.KiwiLedger;
    return (L && typeof L.polarity === 'function' && L.polarity(tile.key)) || 'neutral';
  }
  /* §6.3: + or − on a change, nothing on zero. */
  function signed(delta, kind, digits) {
    var f = F();
    if (!f) return (delta > 0 ? '+' : '') + delta;
    if (kind === 'money') return f.signedMoney(delta, digits || 0);
    if (kind === 'pts') return f.pts(delta, digits || 0);
    return f.signed(delta, digits || 0);
  }
  /* The colour a delta takes: polarity first, then direction (§10.21). */
  function deltaTone(delta, polarity) {
    if (!delta || polarity === 'neutral') return 'neutral';
    var up = delta > 0;
    if (polarity === 'up-bad') up = !up;
    return up ? 'good' : 'bad';
  }
  /* text: a delta already written by the host (the dashboard's shipped
     percentages, stage 5), drawn as given; note: what it compares with. */
  function deltaHtml(delta, kind, polarity, digits, text, note) {
    if (delta == null || !isFinite(delta)) return '';
    var tone = deltaTone(delta, polarity);
    var arrow = delta > 0 ? icon('arrow_upward', 16) : (delta < 0 ? icon('arrow_downward', 16) : '');
    return '<span class="dl k-foot k-num" data-tone="' + tone + '" data-polarity="' + polarity + '">' + arrow + '<span>' +
      (text != null && text !== '' ? '<bdi dir="ltr">' + esc(text) + '</bdi>' : numHtml(signed(delta, kind, digits))) + '</span>' +
      (note ? '<span class="k-ink2 nt"> ' + esc(note) + '</span>' : '') + '</span>';
  }

  /* ── <k-kpi-grid> .tiles ───────────────────────────────────────────────── */
  var KKpiGrid = K.make({
    setup: function () {
      var self = this;
      K.tap(this.shadowRoot, '[data-tile]', function (el, e, g) {
        if (e.target.closest && e.target.closest('[data-do]')) return;
        self.emit('open', el.getAttribute('data-tile'), { gestureId: g });
      });
      K.tap(this.shadowRoot, '[data-do]', function (el) {
        var tile = el.closest('[data-tile]');
        self.emit(el.getAttribute('data-do'), tile && tile.getAttribute('data-tile'), null);
      });
    },
    render: function () {
      var tiles = this.tiles || [];
      this.shadowRoot.innerHTML = '<div class="grid" role="list">' + tiles.map(function (tl) {
        var st = tl.state || 'rest';
        var body;
        if (st === 'loading') {
          body = '<span class="k-skel sk sk1"></span><span class="k-skel sk sk2"></span><span class="k-skel sk sk3"></span>';
        } else {
          var label = '<span class="k-foot k-ink2 lb">' + esc(tl.label) + '</span>';
          if (st === 'na') {
            body = label + '<span class="k-foot k-ink2 na">' + esc(tl.note || t('kpi.margin_needs_costs')) + '</span>' +
              '<button type="button" class="k-foot-s plain" data-do="add-costs">' + esc(tl.action || t('kpi.add_costs')) + '</button>';
          } else if (st === 'error') {
            body = label + '<span class="k-foot k-danger-ink na">' + th('state.load_failed') + '</span>' +
              '<button type="button" class="k-foot-s plain" data-do="retry">' + th('action.try_again') + '</button>';
          } else {
            var v = tl.value == null ? '0' : tl.value;
            var unit = tl.unit ? '<span class="k-foot k-ink2 un"> ' + esc(tl.unit) + '</span>' : '';
            var foot = st === 'empty' ? '<span class="k-foot k-ink2">' + th('chart.empty') + '</span>'
              : st === 'stale' ? '<span class="k-foot k-ink2 st">' + icon('wifi_off', 16) + th('state.updated', { time: tl.updated || '' }) + '</span>'
              : deltaHtml(tl.delta, tl.deltaKind, polarityOf(tl), tl.digits, tl.deltaText, tl.deltaNote);
            body = label + '<span class="vl"><span class="k-title k-num">' + esc(v) + '</span>' + unit + '</span><span class="ft">' + foot + '</span>';
          }
        }
        var busy = st === 'loading' ? ' aria-busy="true"' : '';
        return '<div class="tile" role="listitem" data-tile="' + esc(tl.key) + '"' + busy + ' tabindex="0">' + body + '</div>';
      }).join('') + '</div>';
    }
  });
  K.define('k-kpi-grid', KKpiGrid, {
    props: ['tiles'],
    css: ':host{display:block}' +
      '.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:var(--k-grid-gap,12px)}' +
      '@media (min-width:700px){.grid{grid-template-columns:repeat(4,minmax(0,1fr))}}' +
      '.tile{display:flex;flex-direction:column;gap:4px;min-height:108px;padding:16px;border-radius:var(--k-r-3);background-color:var(--k-surface-1);' +
      'transition:transform var(--k-dur-4) var(--k-spring);cursor:pointer;min-width:0}' +
      '.tile:active{transform:scale(.97);transition-duration:var(--k-dur-1);transition-timing-function:var(--k-glide)}' +
      '.tile:focus-visible{box-shadow:0 0 0 2px var(--k-bg),0 0 0 calc(2px + var(--k-focus-w)) var(--k-focus)}' +
      '.vl{display:flex;align-items:baseline;min-width:0;white-space:nowrap;overflow:hidden}' +
      '.dl{display:inline-flex;align-items:center;gap:2px;font-weight:var(--k-fw-footnote-strong)}' +
      '.dl[data-tone="good"]{color:var(--k-accent-ink)}.dl[data-tone="bad"]{color:var(--k-danger)}.dl[data-tone="neutral"]{color:var(--k-ink-2)}' +
      '.st{display:inline-flex;align-items:center;gap:4px}' +
      '.plain{align-self:flex-start;min-height:44px;margin-block:-12px;color:var(--k-accent-ink)}' +
      '.sk{display:block;border-radius:6px}.sk1{width:60%;height:14px}.sk2{width:80%;height:28px}.sk3{width:40%;height:14px}' +
      '@media (prefers-reduced-motion:reduce){.tile,.tile:active{transition:none;transform:none}}'
  });

  /* ── <k-data-table> .columns .rows ─────────────────────────────────────── */
  var KDataTable = K.make({
    render: function () {
      var cols = this.columns || [], rows = this.rows || [];
      this.shadowRoot.innerHTML = '<table class="k-body"><thead><tr>' +
        cols.map(function (c) { return '<th scope="col" class="k-foot k-ink2' + (c.num ? ' n' : '') + '">' + esc(c.label) + '</th>'; }).join('') +
        '</tr></thead><tbody>' + rows.map(function (r) {
          return '<tr>' + r.map(function (cell, i) {
            var n = cols[i] && cols[i].num;
            return i === 0 ? '<th scope="row" class="k-body">' + esc(cell) + '</th>' : '<td class="k-num' + (n ? ' n' : '') + '">' + esc(cell) + '</td>';
          }).join('') + '</tr>';
        }).join('') + '</tbody></table>';
    }
  });
  K.define('k-data-table', KDataTable, {
    props: ['columns', 'rows'],
    css: ':host{display:block}table{width:100%;border-collapse:collapse}th,td{text-align:start;padding-block:10px;font-weight:inherit}' +
      'tbody tr{box-shadow:inset 0 -1px 0 var(--k-line)}.n{text-align:end}'
  });

  /* ── <k-chart> .series ─────────────────────────────────────────────────────
     series: { today: [{h, v}], baseline: [{h, v}] | null, cutoff, nowH,
               baselineKey: 'yesterday'|'weekday', baselineTime, weekday,
               delta, unit } — h is hours since the business day's cutoff,
               v the cumulative revenue at that hour. */
  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  /* The store's cutoff comes with the series, or from business-day.js, which
     alone holds the default (§17.1); with neither, the axis has no labels. */
  function cutOf(s) {
    if (s && s.cutoff != null) return Number(s.cutoff);
    var B = root.KiwiBusinessDay;
    try { if (B && B.resolve) return B.resolve({}).cutoff; } catch (_) {}
    return NaN;
  }
  function hourLabel(cutoff, h) {
    if (!isFinite(cutoff)) return ''; var x = (cutoff + Math.floor(h)) % 24; var m = Math.round((h % 1) * 60); return pad2(x) + ':' + pad2(m === 60 ? 0 : m); }
  function niceStep(max) {
    if (!(max > 0)) return 0;
    var p = Math.pow(10, Math.floor(Math.log(max) / Math.LN10));
    var cands = [1, 2, 5, 10, 20, 50].map(function (m) { return m * p / 10; }).concat([p, 2 * p, 5 * p, 10 * p]);
    cands.sort(function (a, b) { return a - b; });
    for (var i = 0; i < cands.length; i++) if (Math.floor(max / cands[i]) <= 3) return cands[i];
    return 10 * p;
  }
  function typeScale(el) {
    var v = 1;
    try { v = parseFloat(root.getComputedStyle(el).getPropertyValue('--type-scale')) || 1; } catch (_) {}
    return v;
  }
  function plotHeight() {
    var w = root.innerWidth || 0, h = root.innerHeight || 0;
    if (w >= 700) return 240;
    return h >= 800 ? 160 : 120;
  }
  var AXIS = 24;
  /* A figure inside an svg <text>: numHtml's <bdi> is HTML, which svg text
     does not draw (the digits vanished and "K" stayed); a tspan keeps the
     figure left to right in an RTL axis. */
  function svgNum(v) { return '<tspan direction="ltr" unicode-bidi="isolate">' + esc(v) + '</tspan>'; }

  var KChart = K.make({
    setup: function () {
      var self = this;
      this.__idx = -1;
      if (root.ResizeObserver) { try { new ResizeObserver(function () { self.draw(); }).observe(this); } catch (_) {} }
      var R = this.shadowRoot, hold = 0, sc = null;
      R.addEventListener('pointerdown', function (e) {
        if (!e.target.closest || !e.target.closest('.plot')) return;
        sc = { x: e.clientX, y: e.clientY, id: e.pointerId, on: false, g: K.gid('scrub'), at: e.timeStamp };
        if (e.pointerType === 'mouse') return;
        clearTimeout(hold);
        hold = setTimeout(function () { if (sc) { sc.on = true; self.scrubAt(sc.x, sc.g); } }, (root.KiwiMotion && root.KiwiMotion.DUR.dur3) || 240);
      });
      R.addEventListener('pointermove', function (e) {
        if (e.pointerType === 'mouse' && e.target.closest && e.target.closest('.plot')) { self.scrubAt(e.clientX, null); return; }
        if (!sc || e.pointerId !== sc.id) return;
        if (!sc.on && (Math.abs(e.clientX - sc.x) > 10 || Math.abs(e.clientY - sc.y) > 10)) { clearTimeout(hold); sc = null; return; }
        if (sc.on) { e.preventDefault(); self.scrubAt(e.clientX, sc.g); }
      });
      function end(e) {
        clearTimeout(hold);
        if (!sc) return;
        var s = sc; sc = null;
        if (s.on) { if (root.KiwiHaptics && root.KiwiHaptics.end) root.KiwiHaptics.end(s.g); self.scrubEnd(); return; }
        if (e.type === 'pointerup' && Math.abs(e.clientX - s.x) <= 10 && Math.abs(e.clientY - s.y) <= 10) self.showData();
      }
      R.addEventListener('pointerup', end);
      R.addEventListener('pointercancel', function () { clearTimeout(hold); if (sc && sc.on && root.KiwiHaptics && root.KiwiHaptics.end) root.KiwiHaptics.end(sc.g); sc = null; self.scrubEnd(); });
      R.addEventListener('pointerleave', function (e) { if (e.pointerType === 'mouse') self.scrubEnd(); });
      this.addEventListener('keydown', function (e) {
        var pts = self.points();
        if (!pts.length) return;
        var rtl = self.hasAttribute('data-k-rtl');
        var step = { ArrowRight: rtl ? -1 : 1, ArrowLeft: rtl ? 1 : -1, Home: -1e9, End: 1e9 }[e.key];
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); self.showData(); return; }
        if (step == null) return;
        e.preventDefault();
        var i = self.__idx < 0 ? pts.length - 1 : self.__idx;
        i = Math.max(0, Math.min(pts.length - 1, step === -1e9 ? 0 : step === 1e9 ? pts.length - 1 : i + step));
        self.focusPoint(i);
      });
      this.addEventListener('blur', function () { self.scrubEnd(); });
    },
    connected: function () { if (!this.hasAttribute('tabindex')) this.tabIndex = 0; },
    points: function () { var s = this.series || {}; return s.today || []; },
    render: function () {
      var st = this.str('state');
      this.shadowRoot.innerHTML = '<div class="wrap">' +
        (st === 'error' ? '<k-banner tone="danger" live message="' + esc(t('state.load_failed')) + '"></k-banner>' : '') +
        '<div class="plot" role="img"' + (st === 'loading' ? ' aria-busy="true"' : '') + '></div>' +
        '<div class="tip k-foot" aria-hidden="true" hidden></div>' +
        '<p class="k-vh" aria-live="polite" id="say"></p></div>';
      this.draw();
    },
    summary: function () {
      var s = this.series || {}, pts = s.today || [];
      var f = F();
      var last = pts.length ? pts[pts.length - 1] : { h: 0, v: 0 };
      var amount = f ? f.money(last.v, 0) : String(last.v);
      var busiest = 0, best = -1;
      for (var i = 1; i < pts.length; i++) { var d = pts[i].v - pts[i - 1].v; if (d > best) { best = d; busiest = pts[i - 1].h; } }
      var args = { amount: amount, time: hourLabel(cutOf(s), s.nowH != null ? s.nowH : last.h), hour: hourLabel(cutOf(s), Math.floor(busiest)) };
      if (s.delta == null || !s.baseline) return t('chart.summary_none', args);
      args.baseline = t(s.baselineKey === 'weekday' ? 'compare.weekday_at' : 'compare.yesterday_at', { time: s.baselineTime || args.time, weekday: s.weekday });
      args.delta = f ? f.money(Math.abs(s.delta), 0) : String(Math.abs(s.delta));
      return t(s.delta > 0 ? 'chart.summary_up' : (s.delta < 0 ? 'chart.summary_down' : 'chart.summary_same'), args);
    },
    draw: function () {
      var plot = this.$('.plot');
      if (!plot) return;
      var W = Math.max(200, Math.round(this.clientWidth || 320)), H = plotHeight();
      var st = this.str('state');
      if (st === 'loading') { plot.innerHTML = '<span class="k-skel sk" style="height:' + H + 'px"></span>'; plot.removeAttribute('aria-label'); return; }
      var s = this.series || {}, today = s.today || [], base = s.baseline || null;
      var rtl = this.hasAttribute('data-k-rtl'), f = F();
      var band = Math.ceil(8 + 17.55 * typeScale(this));
      var bottom = H - AXIS;
      var max = 0;
      today.forEach(function (p) { if (p.v > max) max = p.v; });
      if (base) base.forEach(function (p) { if (p.v > max) max = p.v; });
      var empty = !max;
      var Y = function (v) { return empty ? bottom : bottom - (v / max) * (bottom - band); };
      var X = function (h) { var x = (h / 24) * W; return rtl ? W - x : x; };
      this.__geom = { W: W, H: H, X: X, Y: Y, rtl: rtl };
      var g = '';
      /* Gridlines: the band edge, labelled with the maximum, then round
         steps below it; a step within 18 of the band edge is left out. */
      if (!empty) {
        g += '<line class="grid" x1="0" x2="' + W + '" y1="' + band + '" y2="' + band + '"/>' +
          '<text class="gl" x="' + (rtl ? 0 : W) + '" y="' + (band - 4) + '" text-anchor="' + (rtl ? 'start' : 'end') + '">' + svgNum(f ? f.compact(max) : max) + '</text>';
        var step = niceStep(max);
        for (var v = step; v < max; v += step) {
          var y = Y(v);
          if (y - band < 18) continue;
          g += '<line class="grid" x1="0" x2="' + W + '" y1="' + y + '" y2="' + y + '"/>' +
            '<text class="gl" x="' + (rtl ? 0 : W) + '" y="' + (y - 4) + '" text-anchor="' + (rtl ? 'start' : 'end') + '">' + svgNum(f ? f.compact(v) : v) + '</text>';
        }
      }
      g += '<line class="grid base" x1="0" x2="' + W + '" y1="' + bottom + '" y2="' + bottom + '"/>';
      /* The svg's text inherits the page's direction, so in RTL "start" is
         the label's right edge: the first hour ends at the plot's edge in
         both directions instead of running past it. */
      [0, 6, 12, 18].forEach(function (h) {
        g += '<text class="xl" x="' + X(h) + '" y="' + (H - 6) + '" text-anchor="' + (h === 0 ? 'start' : 'middle') + '">' + hourLabel(cutOf(s), h) + '</text>';
      });
      var path = function (pts) { return pts.map(function (p, i) { return (i ? 'L' : 'M') + X(p.h).toFixed(1) + ' ' + Y(p.v).toFixed(1); }).join(''); };
      if (base && !empty) g += '<path class="bl" d="' + path(base) + '"/>';
      if (today.length) {
        var d = path(today), lastP = today[today.length - 1];
        g += '<path class="area" d="' + d + 'L' + X(lastP.h).toFixed(1) + ' ' + bottom + 'L' + X(today[0].h).toFixed(1) + ' ' + bottom + 'Z"/>' +
          '<path class="ln" d="' + d + '"/>' +
          '<circle class="now" cx="' + X(lastP.h) + '" cy="' + Y(lastP.v) + '" r="5.5"/>';
      }
      g += '<line class="cur" y1="' + band + '" y2="' + bottom + '" x1="-10" x2="-10"/>';
      var legend = '<div class="lg k-foot k-ink2"><span class="sw"></span>' + th('chart.legend_today') +
        (base ? '<span class="sw d"></span>' + th(s.baselineKey === 'weekday' ? 'chart.legend_weekday_at' : 'chart.legend_yesterday_at', { time: s.baselineTime || '', weekday: s.weekday }) : '') + '</div>';
      plot.innerHTML = legend + '<svg width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + ' ' + H + '" aria-hidden="true" focusable="false">' + g + '</svg>' +
        (empty ? '<p class="k-foot k-ink2 em">' + th('chart.empty') + '</p>' : (!base ? '<p class="k-foot k-ink2 em">' + th('compare.no_data') + '</p>' : ''));
      plot.setAttribute('aria-label', this.summary());
      plot.setAttribute('aria-roledescription', 'chart');
      plot.setAttribute('aria-description', t('chart.show_data'));
    },
    nearest: function (clientX) {
      var pts = this.points(), G = this.__geom;
      if (!pts.length || !G) return -1;
      var r = this.$('svg').getBoundingClientRect(), x = clientX - r.left, best = 0, bd = Infinity;
      pts.forEach(function (p, i) { var dx = Math.abs(G.X(p.h) - x); if (dx < bd) { bd = dx; best = i; } });
      return best;
    },
    scrubAt: function (clientX, g) {
      var i = this.nearest(clientX);
      if (i < 0) return;
      if (i !== this.__idx && g && root.KiwiHaptics) {
        /* The scrub's Choose bracket: one tick per hour bucket entered. */
        try { root.KiwiHaptics.play('Choose', g, Math.floor(this.points()[i].h), { trigger: 'step' }); } catch (_) {}
      }
      this.focusPoint(i, true);
    },
    focusPoint: function (i, quiet) {
      var pts = this.points(), G = this.__geom, s = this.series || {};
      if (!G || !pts[i]) return;
      this.__idx = i;
      var p = pts[i], f = F(), x = G.X(p.h);
      var cur = this.$('.cur'); cur.setAttribute('x1', x); cur.setAttribute('x2', x);
      var text = hourLabel(cutOf(s), p.h) + ' · ' + (f ? f.money(p.v, 0) : p.v);
      var tip = this.$('.tip');
      tip.textContent = text; tip.hidden = false;
      tip.style.insetInlineStart = Math.max(0, Math.min((G.W - 140), (G.rtl ? G.W - x : x) - 70)) + 'px';
      var now = Date.now();
      if (!this.__said || now - this.__said >= 500) { this.__said = now; K.say(this.$('#say'), text); }
    },
    scrubEnd: function () {
      this.__idx = -1;
      var tip = this.$('.tip'); if (tip) tip.hidden = true;
      var cur = this.$('.cur'); if (cur) { cur.setAttribute('x1', -10); cur.setAttribute('x2', -10); }
    },
    /* Show data: a sheet titled chart.show_data with the hours and values. */
    showData: function () {
      var s = this.series || {}, f = F();
      var sheet = this.__sheet;
      if (!sheet) {
        sheet = this.__sheet = doc.createElement('k-sheet');
        sheet.setAttribute('detent', 'large');
        sheet.appendChild(doc.createElement('k-data-table'));
        doc.body.appendChild(sheet);
      }
      sheet.setAttribute('heading', t('chart.show_data'));
      var tab = sheet.querySelector('k-data-table');
      var baseAt = {};
      (s.baseline || []).forEach(function (p) { baseAt[p.h] = p.v; });
      tab.columns = [{ label: '' }, { label: t('chart.legend_today'), num: true }].concat(s.baseline ? [{ label: t(s.baselineKey === 'weekday' ? 'chart.legend_weekday_at' : 'chart.legend_yesterday_at', { time: s.baselineTime || '', weekday: s.weekday }), num: true }] : []);
      tab.rows = (s.today || []).map(function (p) {
        var r = [hourLabel(cutOf(s), p.h), f ? f.money(p.v, 0) : String(p.v)];
        if (s.baseline) r.push(baseAt[p.h] != null ? (f ? f.money(baseAt[p.h], 0) : String(baseAt[p.h])) : '—');
        return r;
      });
      sheet.setAttribute('open', '');
      this.emit('show-data', null, null);
    }
  });
  K.define('k-chart', KChart, {
    attrs: ['state'], props: ['series'],
    css: ':host{display:block;position:relative;border-radius:var(--k-r-1)}' +
      ':host(:focus-visible){outline:none;box-shadow:0 0 0 2px var(--k-bg),0 0 0 calc(2px + var(--k-focus-w)) var(--k-focus)}' +
      '.wrap{position:relative}.plot{position:relative;touch-action:pan-y;-webkit-user-select:none;user-select:none}' +
      '.lg{position:absolute;inset-inline-start:0;top:0;display:flex;align-items:center;gap:6px;pointer-events:none}' +
      '.sw{display:inline-block;width:14px;height:0;border-top:2px solid var(--k-accent-ink)}.sw.d{border-top:1.5px dashed var(--k-ink-3);margin-inline-start:10px}' +
      'svg{display:block;overflow:visible}' +
      '.grid{stroke:var(--k-line);stroke-width:1}.grid.base{stroke:var(--k-line-strong)}' +
      '.gl,.xl{fill:var(--k-ink-2);font-size:var(--k-fs-footnote);font-family:var(--k-font)}' +
      '.ln{fill:none;stroke:var(--k-accent-ink);stroke-width:2;stroke-linejoin:round;stroke-linecap:round}' +
      '.area{fill:var(--k-accent-ink);fill-opacity:.08;stroke:none}' +
      '.bl{fill:none;stroke:var(--k-ink-3);stroke-width:1.5;stroke-dasharray:4 4}' +
      '.now{fill:var(--k-chart-dot,var(--k-accent));stroke:var(--k-surface-1);stroke-width:3}' +
      '.cur{stroke:var(--k-ink-3);stroke-width:1}.cur[x1="-10"]{visibility:hidden}' +
      '.tip{position:absolute;top:0;padding-block:6px;padding-inline:10px;border-radius:var(--k-r-1);background-color:var(--k-inverse);color:var(--k-on-inverse);white-space:nowrap;pointer-events:none}' +
      '.em{position:absolute;inset-inline:0;top:40%;margin:0;text-align:center}' +
      '.sk{display:block;width:100%;border-radius:var(--k-r-2)}'
  });

  /* ── <k-compare delta delta-kind polarity baseline value> .options ─────────
     options: [{ value: 'yesterday'|'weekday'|'none', label, figure }] */
  var KCompare = K.make({
    setup: function () {
      var self = this;
      K.tap(this.shadowRoot, '[data-open]', function (el, e, g) { self.openChoice(g); });
    },
    render: function () {
      var d = this.getAttribute('delta');
      var delta = d == null || d === '' ? null : Number(d);
      var pol = this.str('polarity', 'up-good');
      var head = delta == null ? '<span class="k-foot k-ink2">' + th('compare.no_data') + '</span>'
        : deltaHtml(delta, this.str('delta-kind', 'money'), pol, 0);
      this.shadowRoot.innerHTML = '<button type="button" class="cmp" data-open aria-haspopup="dialog">' +
        '<span class="r1">' + head + '</span>' +
        '<span class="r2"><span class="k-foot k-ink2">' + esc(this.str('baseline')) + '</span>' + icon('expand_more', 16, 'k-ink2') + '</span></button>';
      if (this.__choice) this.paintChoice();
    },
    paintChoice: function () {
      var c = this.__choice, opts = this.options || [], val = this.str('value', 'yesterday');
      if (!c) return;
      c.setAttribute('heading', t('compare.title'));
      var list = c.querySelector('k-list') || c.appendChild(doc.createElement('k-list'));
      list.setAttribute('label', t('compare.title'));
      list.rows = opts.map(function (o) { return { id: o.value, title: o.label, value: o.figure || '', radio: true, selected: o.value === val }; });
    },
    openChoice: function (g) {
      var self = this;
      if (!this.__choice) {
        var wide = root.matchMedia && root.matchMedia('(min-width: 600px)').matches;
        var c = this.__choice = doc.createElement(wide ? 'k-popover' : 'k-sheet');
        if (!wide) c.setAttribute('detent', 'medium');
        doc.body.appendChild(c);
        c.addEventListener('kiwi:action', function (e) {
          var dd = e.detail || {};
          if (dd.action !== 'k.list.select') return;
          e.stopPropagation();
          /* k-list has already played Choose for the radio row. */
          self.setAttribute('value', dd.id);
          c.removeAttribute('open');
          self.emit('select', dd.id, null);
        });
      }
      this.paintChoice();
      if (this.__choice.localName === 'k-popover') this.__choice.anchor = this.$('[data-open]');
      this.__choice.setAttribute('open', '');
      this.emit('open', null, { gestureId: g });
    }
  });
  K.define('k-compare', KCompare, {
    attrs: ['delta', 'delta-kind', 'polarity', 'baseline', 'value'], props: ['options'],
    css: ':host{display:block}' +
      '.cmp{display:flex;flex-wrap:wrap;align-items:center;column-gap:6px;row-gap:0;min-height:44px;width:100%;text-align:start;color:inherit}' +
      '.r1,.r2{display:inline-flex;align-items:center;gap:4px}' +
      '.dl{display:inline-flex;align-items:center;gap:4px;font-weight:var(--k-fw-footnote-strong)}' +
      '.dl[data-tone="good"]{color:var(--k-accent-ink)}.dl[data-tone="bad"]{color:var(--k-danger)}.dl[data-tone="neutral"]{color:var(--k-ink-2)}'
  });

  K.dashboard = { deltaTone: deltaTone, signed: signed, niceStep: niceStep, hourLabel: hourLabel };
})(typeof window !== 'undefined' ? window : globalThis);
