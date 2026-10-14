/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · assets/kit/till.js · the till's components (spec §10.23 to §10.27,
 * §10.30 to §10.32, §10.34, §10.35, §18.3, §18.9).
 *
 *   <k-keypad>        the cash keypad as an element (controls/keypad.js)
 *   <k-menu-grid>     .sections of tiles, one root for every tile
 *   <k-bill>          .bill: lines, the expanded line, the footer, one primary
 *   <k-options>       .item: required and optional groups, note, quantity
 *   <k-pay>           .pay: key figure, tip row, method list, cash and card
 *   <k-cash-count>    .count: denominations, keypad column, summary, Display
 *   <k-split>         .bill: equally (stepper) or by item (share chips)
 *   <k-discount>      .bill + .policy: percent or amount, reason, preview
 *   <k-bill-bar>      the phone till's capsule
 *   <k-code-display>  the attendance code and the printer code
 *
 * Every component draws and reports; none records a sale, sends to the
 * kitchen or calls a server. The haptics that belong to a record (Paid,
 * Commit) are played by the caller through the component's method on the
 * frame the record exists (§15.3): pay.paid(), count.committed().
 * Money is computed in cents and formatted by KiwiFormat.
 * ═══════════════════════════════════════════════════════════════════════════ */
(function (root) {
  'use strict';
  var K = root.KiwiKit;
  if (!K || !K.controls.keypad) return;
  var esc = K.esc, t = K.t, th = K.th, numHtml = K.numHtml, icon = K.icon, C = K.controls;
  var doc = root.document;

  function money(n) { return K.money(n, 2); }
  function cents(n) { return Math.round((Number(n) || 0) * 100); }
  function fromCents(c) { return Math.round(c) / 100; }
  function F() { return root.KiwiFormat || null; }
  function pctText(p) { var f = F(); return f ? f.share(p / 100) : p + '%'; }
  function M() { return root.KiwiMotion || null; }
  function fade(el) {
    var m = M();
    if (el && m && m.animate) m.animate(el, { opacity: 1 }, { from: { opacity: 0 }, dur: 'dur2' });
  }

  /* §10.30: rounded down to the cent, the cents left over one each to the
     first shares (the shipped shareMoney). */
  function shareMoney(totalCents, n) {
    n = Math.max(1, n | 0);
    var base = Math.floor(totalCents / n), left = totalCents - base * n, out = [];
    for (var i = 0; i < n; i++) out.push(base + (i < left ? 1 : 0));
    return out;
  }
  /* Pro rata to weights, leftover cents by largest remainder, ties to the
     earlier share (the shipped shareWeighted). */
  function shareWeighted(totalCents, weights) {
    var sum = weights.reduce(function (a, b) { return a + b; }, 0);
    if (!sum) return weights.map(function () { return 0; });
    var raw = weights.map(function (w) { return totalCents * w / sum; });
    var out = raw.map(Math.floor);
    var left = totalCents - out.reduce(function (a, b) { return a + b; }, 0);
    var order = raw.map(function (r, i) { return { i: i, f: r - Math.floor(r) }; })
      .sort(function (a, b) { return b.f - a.f || a.i - b.i; });
    for (var k = 0; k < left; k++) out[order[k % order.length].i] += 1;
    return out;
  }
  /* The next two round amounts above what is due (§10.25 quick chips). */
  function roundUps(due) {
    var seen = {}, out = [];
    [10, 50, 100, 200].forEach(function (step) {
      var v = Math.ceil(due / step) * step;
      if (v > due + 0.004 && !seen[v]) { seen[v] = 1; out.push(v); }
    });
    return out.sort(function (a, b) { return a - b; }).slice(0, 2);
  }

  /* ── <k-keypad form short next disabled label> ─────────────────────────── */
  var KKeypad = K.make({
    setup: function () {
      var self = this;
      C.keypad.bind(this.shadowRoot, function (id, key, g) { self.emit('key', null, { key: key, gestureId: g }); });
    },
    render: function () {
      this.shadowRoot.innerHTML = C.keypad.render({ form: this.str('form', 'caps'), short: this.flag('short'), next: this.flag('next'), disabled: this.flag('disabled'), label: this.str('label') });
    }
  });
  K.define('k-keypad', KKeypad, { attrs: ['form', 'short', 'next', 'disabled', 'label'], css: ':host{display:block}' + C.keypad.css });

  /* ── <k-menu-grid> .sections [{id, title, items:[{id, name, price,
     options, soldOut, qty}]}] ─────────────────────────────────────────────── */
  var KMenuGrid = K.make({
    setup: function () {
      var self = this, R = this.shadowRoot, lp = 0, lpEl = null, fired = false;
      /* A long press (500 ms) is a shortcut to the options sheet, never the
         only way to it (§10.24). */
      R.addEventListener('pointerdown', function (e) {
        var el = e.target.closest && e.target.closest('[data-item]');
        if (!el || el.getAttribute('aria-disabled') === 'true') return;
        fired = false; lpEl = el; clearTimeout(lp);
        lp = setTimeout(function () { fired = true; self.emit('options', el.getAttribute('data-item'), { gestureId: K.gid('menu-lp'), long: true }); }, 500);
      });
      ['pointerup', 'pointercancel', 'pointerleave'].forEach(function (ev) { R.addEventListener(ev, function () { clearTimeout(lp); }); });
      R.addEventListener('pointermove', function (e) { if (lpEl && e.buttons) { /* a scroll cancels the hold */ } });
      R.addEventListener('scroll', function () { clearTimeout(lp); }, true);
      K.tap(R, '[data-item]', function (el, e, g) {
        if (fired) { fired = false; return; }
        var id = el.getAttribute('data-item');
        if (el.hasAttribute('data-opts')) { self.emit('options', id, { gestureId: g }); return; }
        K.haptic('Adjust', g, { trigger: 'tap' });
        self.emit('add', id, { gestureId: g });
      });
    },
    render: function () {
      var secs = this.sections || [];
      this.shadowRoot.innerHTML = secs.map(function (s) {
        return '<section class="sec" data-sec="' + esc(s.id) + '" aria-labelledby="h-' + esc(s.id) + '">' +
          '<h3 class="k-heading hd" id="h-' + esc(s.id) + '">' + esc(s.title) + '</h3><div class="grid">' +
          (s.items || []).map(function (it) {
            var price = money(it.price);
            var name = t(it.options ? 'menu.tile_label_options' : 'menu.tile_label', { name: it.name, price: price });
            if (it.soldOut) name += ', ' + t('menu.sold_out');
            return '<button type="button" class="tile' + (it.soldOut ? ' out' : '') + '" data-item="' + esc(it.id) + '"' + (it.options ? ' data-opts' : '') +
              (it.soldOut ? ' aria-disabled="true"' : '') + ' aria-label="' + esc(name) + '">' +
              '<span class="nm k-body-s">' + esc(it.name) + '</span>' +
              '<span class="pr k-callout k-num">' + esc(it.soldOut ? t('menu.sold_out') : price) + '</span>' +
              (it.options ? icon('tune', 20, 'op') : '') +
              (it.qty ? '<span class="q k-foot-s k-num" aria-hidden="true">' + esc(it.qty) + '</span>' : '') + '</button>';
          }).join('') + '</div></section>';
      }).join('');
    },
    /* The qty badge, without redrawing 200 tiles. */
    setQty: function (id, n) {
      var el = this.$('[data-item="' + (root.CSS && CSS.escape ? CSS.escape(id) : id) + '"]');
      if (!el) return;
      var q = el.querySelector('.q');
      if (!n) { if (q) q.remove(); return; }
      if (!q) { q = doc.createElement('span'); q.className = 'q k-foot-s k-num'; q.setAttribute('aria-hidden', 'true'); el.appendChild(q); }
      q.textContent = n;
      var m = M();
      if (m && m.animate) m.animate(q, { transform: 'scale(1)' }, { from: { transform: 'scale(0.6)' }, dur: 'dur4', curve: 'spring' });
    }
  });
  K.define('k-menu-grid', KMenuGrid, {
    props: ['sections'],
    css: ':host{display:block}' +
      '.hd{position:sticky;top:var(--k-menu-sticky,0);margin:0;padding-block:12px 8px;background-color:var(--k-bg);z-index:1}' +
      '.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:16px;padding-block-end:16px}' +
      '.sec{content-visibility:auto;contain-intrinsic-size:auto 400px}' +
      '.tile{position:relative;display:flex;flex-direction:column;justify-content:space-between;gap:8px;min-height:112px;padding:16px;border-radius:var(--k-r-3);' +
      'background-color:var(--k-surface-1);color:var(--k-ink-1);text-align:start;transition:transform var(--k-dur-4) var(--k-spring)}' +
      '.tile:active:not([aria-disabled="true"]){transform:scale(.97);transition-duration:var(--k-dur-1);transition-timing-function:var(--k-glide)}' +
      /* clear of the 28 px qty badge (8 px in from the corner, the tile pads 16) */
      '.nm{display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;overflow:hidden;font-weight:var(--k-fw-body-strong);padding-inline-end:20px}' +
      '.pr{color:var(--k-ink-2)}.op{position:absolute;inset-inline-end:16px;bottom:16px;color:var(--k-ink-2)}' +
      '.q{position:absolute;inset-inline-end:8px;top:8px;min-width:28px;height:28px;padding-inline:6px;border-radius:14px;display:flex;align-items:center;justify-content:center;' +
      'background-color:var(--k-accent);color:var(--k-on-accent)}' +
      '.out .nm,.out .pr{color:var(--k-ink-3)}' +
      '@media (prefers-reduced-motion:reduce){.tile,.tile:active{transition:none;transform:none}}'
  });

  /* ── <k-bill state> .bill ──────────────────────────────────────────────────
     bill: { title, meta, lines:[{id, qty, name, mods:[], price, sent, sentAt,
             sentQty}], discount:{label, amount}, service:{label, amount},
             total, sendOnPay, paying } */
  var KBill = K.make({
    setup: function () {
      var self = this, R = this.shadowRoot;
      this.__sel = null;
      K.tap(R, '[data-line]', function (el, e, g) {
        if (e.target.closest && e.target.closest('.ex')) return;
        var id = el.getAttribute('data-line');
        self.__sel = self.__sel === id ? null : id;
        self.render();
        self.emit('line-select', id, { gestureId: g, open: self.__sel === id });
      });
      C.stepper.bind(R, function (id, dir, g) {
        var line = self.line(id);
        if (!line || dir === 0) return;
        var min = line.sent ? (line.sentQty || line.qty) : 0;
        if (dir < 0 && line.qty <= min) { self.emit(line.sent ? 'void' : 'remove', id, { gestureId: g }); return; }
        self.emit('step', id, { dir: dir, gestureId: g });
      });
      C.button.bind(R, function (el, g) {
        var w = el.getAttribute('data-w');
        if (!w) return;
        var id = el.closest('[data-line]') ? el.closest('[data-line]').getAttribute('data-line') : null;
        self.emit(w, id, { gestureId: g, anchor: el });
      });
    },
    line: function (id) { var b = this.bill || {}; return (b.lines || []).filter(function (l) { return l.id === id; })[0] || null; },
    render: function () {
      var b = this.bill || {}, st = this.str('state'), self = this;
      var lines = b.lines || [];
      var unsent = lines.filter(function (l) { return !l.sent; });
      var sent = lines.filter(function (l) { return l.sent; });
      var paying = !!b.paying;
      var head = '<header class="hd"><div class="ht"><h2 class="k-title ti">' + esc(b.title || '') + '</h2>' +
        (b.meta ? '<p class="k-foot k-ink2 mt">' + esc(b.meta) + '</p>' : '') + '</div>' +
        C.button.render({ variant: 'icon', icon: 'print', label: t('bill.print'), id: 'pr', attrs: ' data-w="print"' }) +
        C.button.render({ variant: 'icon', icon: 'more_horiz', label: t('action.more'), id: 'mo', attrs: ' data-w="overflow"' }) + '</header>';
      var body;
      if (st === 'loading') body = '<div class="sk"><span class="k-skel"></span><span class="k-skel"></span><span class="k-skel"></span></div>';
      else if (!lines.length) body = '<div class="em"><p class="k-heading">' + th('bill.empty.title') + '</p><p class="k-foot k-ink2">' + th('bill.empty.body') + '</p></div>';
      else {
        var row = function (l) {
          var open = self.__sel === l.id && !paying;
          var ex = '';
          if (open) {
            ex = '<div class="ex">' + C.stepper.render({ id: l.id, value: l.qty, min: 0, label: l.name }) +
              '<div class="acts">' +
              C.button.render({ label: t('bill.edit_options'), size: 'S', id: 'eo-' + l.id, attrs: ' data-w="edit-options"' }) +
              C.button.render({ label: t(l.sent ? 'bill.void' : 'bill.remove'), variant: 'tonal-danger', size: 'S', id: 'rm-' + l.id, attrs: ' data-w="' + (l.sent ? 'void' : 'remove') + '"' }) +
              '</div></div>';
          }
          return '<li class="ln' + (open ? ' on' : '') + '" data-line="' + esc(l.id) + '"' + (paying ? ' aria-disabled="true"' : '') + ' tabindex="0" aria-expanded="' + (open ? 'true' : 'false') + '">' +
            '<div class="r"><span class="qt k-callout k-num">' + esc(l.qty) + '×</span>' +
            '<span class="nm"><span class="k-body">' + esc(l.name) + '</span>' +
            (l.mods || []).map(function (m) { return '<span class="k-foot k-ink2 md">' + esc(m) + '</span>'; }).join('') + '</span>' +
            '<span class="k-body k-num pr">' + numHtml(money(l.price)) + '</span></div>' + ex + '</li>';
        };
        body = (unsent.length ? '<p class="k-foot gh ns">' + th('bill.not_sent', { n: unsent.length }) + '</p><ul class="ls">' + unsent.map(row).join('') + '</ul>' : '') +
          (sent.length ? '<p class="k-foot k-ink2 gh">' + th('bill.sent_at', { time: (sent[0] && sent[0].sentAt) || '' }) + '</p><ul class="ls">' + sent.map(row).join('') + '</ul>' : '');
      }
      var part = function (p) { return p && cents(p.amount) ? '<div class="pt k-body" data-k-part><span class="k-ink2">' + esc(p.label) + '</span><span class="k-num">' + numHtml(K.fmt() ? K.fmt().signedMoney(p.amount, 2) : p.amount) + '</span></div>' : ''; };
      var sendFirst = unsent.length && !b.sendOnPay;
      var primary = sendFirst
        ? C.button.render({ variant: 'primary', size: 'L', full: true, label: t('bill.send', { n: unsent.length }), id: 'pri', attrs: ' data-w="send"', disabled: paying })
        : C.button.render({ variant: 'primary', size: 'L', full: true, label: t('bill.take_payment', { amount: money(b.total || 0) }), id: 'pri', attrs: ' data-w="pay"', disabled: !lines.length || paying });
      var foot = '<footer class="ft">' + part(b.discount) + part(b.service) +
        '<div class="tot"><span class="k-body k-ink2">' + th('bill.total') + '</span><span class="k-title k-num" data-k-total>' + numHtml(money(b.total || 0)) + '</span></div>' +
        '<div class="sec2">' + C.button.render({ label: t('bill.split'), id: 'sp', attrs: ' data-w="split"', disabled: !lines.length || paying }) +
        C.button.render({ label: t('bill.discount'), id: 'dc', attrs: ' data-w="discount"', disabled: !lines.length || paying }) + '</div>' +
        primary + '</footer>';
      var warn = st === 'error' ? '<p class="wn k-foot" role="status">' + icon('warning', 16) + th('bill.unsaved') + '</p>' : '';
      var prevLabel = this.__primary;
      this.shadowRoot.innerHTML = '<div class="bill' + (paying ? ' paying' : '') + '">' + head + warn + '<div class="bd">' + body + '</div>' + foot + '</div>';
      this.__primary = sendFirst ? 'send' : 'pay';
      if (prevLabel && prevLabel !== this.__primary) fade(this.$('#pri .k-btn__l'));
    }
  });
  K.define('k-bill', KBill, {
    attrs: ['state'], props: ['bill'],
    css: C.button.css + C.stepper.css + ':host{display:block;height:100%}' +
      '.bill{display:flex;flex-direction:column;height:100%;background-color:var(--k-surface-1)}' +
      '.hd{display:flex;align-items:flex-start;gap:8px;padding:24px 24px 8px}.ht{flex:1;min-width:0}.ti,.mt{margin:0}' +
      '.bd{flex:1;overflow-y:auto;padding-inline:24px}' +
      '.gh{margin:16px 0 4px;font-weight:var(--k-fw-footnote-strong)}.gh.ns{color:var(--k-accent-ink)}' +
      '.ls{list-style:none;margin:0;padding:0}' +
      '.ln{min-height:56px;padding-block:8px;box-shadow:inset 0 -1px 0 var(--k-line);border-radius:var(--k-r-1)}' +
      '.ln.on{background-color:var(--k-select)}' +
      '.ln:focus-visible{box-shadow:inset 0 0 0 var(--k-focus-w) var(--k-focus)}' +
      '.r{display:flex;align-items:flex-start;gap:8px}.qt{width:32px;flex:none;font-weight:var(--k-fw-callout-strong)}' +
      '.nm{flex:1;min-width:0;display:flex;flex-direction:column;overflow-wrap:anywhere}.pr{flex:none}' +
      '.ex{display:flex;flex-wrap:wrap;align-items:center;gap:12px;padding:12px 0 4px 40px}.acts{display:flex;gap:8px;flex-wrap:wrap}' +
      '.paying .ln{color:var(--k-ink-3)}' +
      '.em{padding-block:48px;text-align:center}.em p{margin:4px 0}' +
      '.sk{display:flex;flex-direction:column;gap:12px;padding-block:16px}.sk span{height:40px;border-radius:var(--k-r-1)}' +
      '.wn{display:flex;align-items:center;gap:6px;margin:0 24px 8px;padding:8px 12px;border-radius:var(--k-r-1);background-color:var(--k-warning-tint);color:var(--k-ink-1)}' +
      '.ft{display:flex;flex-direction:column;gap:12px;padding:16px 24px calc(16px + env(safe-area-inset-bottom,0px));box-shadow:inset 0 1px 0 var(--k-line);background-color:var(--k-surface-1)}' +
      '.pt,.tot{display:flex;justify-content:space-between;align-items:baseline;gap:12px}' +
      '.sec2{display:grid;grid-template-columns:1fr 1fr;gap:8px}.sec2 .k-btn{width:100%}'
  });

  /* ── <k-options> .item {name, price, groups:[{id, label, required, max,
     options:[{id, label, price, soldOut}]}]} ─────────────────────────────── */
  var KOptions = K.make({
    setup: function () {
      var self = this, R = this.shadowRoot;
      this.__pick = {}; this.__qty = 1;
      R.addEventListener('change', function (e) {
        var inp = e.target;
        if (!inp || !inp.name) return;
        var g = inp.name.slice(2), cur = self.__pick[g] || [];
        if (inp.type === 'radio') cur = [inp.value];
        else cur = inp.checked ? cur.concat(inp.value) : cur.filter(function (v) { return v !== inp.value; });
        self.__pick[g] = cur;
        if (inp.type === 'radio') K.haptic('Choose', K.gid('opt'), { trigger: 'tap' });
        self.paintFoot();
      });
      C.stepper.bind(R, function (id, dir) { if (dir) { self.__qty = Math.max(1, self.__qty + dir); self.render(); } });
      C.button.bind(R, function (el, g) {
        if (el.getAttribute('data-w') !== 'add') return;
        var note = self.$('textarea');
        self.emit('add', null, { choices: self.__pick, qty: self.__qty, note: note ? note.value : '', gestureId: g });
      }, '[data-w]');
    },
    missing: function () {
      var it = this.item || {}, pick = this.__pick;
      return (it.groups || []).filter(function (g) { return g.required && !(pick[g.id] && pick[g.id].length); })[0] || null;
    },
    total: function () {
      var it = this.item || {}, pick = this.__pick, c = cents(it.price);
      (it.groups || []).forEach(function (g) { (g.options || []).forEach(function (o) { if ((pick[g.id] || []).indexOf(o.id) >= 0) c += cents(o.price); }); });
      return fromCents(c * this.__qty);
    },
    paintFoot: function () {
      var ft = this.$('.ft');
      if (!ft) return;
      var miss = this.missing();
      ft.innerHTML = C.button.render({ variant: 'primary', size: 'L', full: true, id: 'add', attrs: ' data-w="add"', label: t('options.add', { amount: money(this.total()) }),
        disabled: !!miss, reason: miss ? t('options.missing', { group: miss.label }) : '' });
    },
    render: function () {
      var it = this.item || {}, pick = this.__pick;
      var groups = (it.groups || []).map(function (g) {
        var type = g.required && (g.max || 1) === 1 ? 'radio' : 'checkbox';
        return '<fieldset class="gp"><legend class="k-foot gl">' + esc(g.label) + ' · ' + th(g.required ? 'options.required' : 'options.optional', { n: g.max || 1 }) + '</legend>' +
          (g.options || []).map(function (o) {
            var on = (pick[g.id] || []).indexOf(o.id) >= 0;
            return '<label class="op' + (o.soldOut ? ' out' : '') + '"><input type="' + type + '" name="g-' + esc(g.id) + '" value="' + esc(o.id) + '"' + (on ? ' checked' : '') + (o.soldOut ? ' disabled' : '') + '>' +
              '<span class="k-body ol">' + esc(o.label) + '</span><span class="k-body k-num k-ink2">' + numHtml(o.soldOut ? t('menu.sold_out') : (o.price ? '+' + money(o.price) : '')) + '</span></label>';
          }).join('') + '</fieldset>';
      }).join('');
      this.shadowRoot.innerHTML = '<div class="o"><h2 class="k-heading ti">' + esc(it.name || '') + ' · <span class="k-num">' + numHtml(money(it.price || 0)) + '</span></h2>' + groups +
        '<label class="nt"><span class="k-foot k-ink2">' + th('options.note') + '</span><textarea class="k-body" rows="2"></textarea></label>' +
        C.stepper.render({ id: 'qty', value: this.__qty, min: 1, max: 99, label: it.name || '' }) + '<div class="ft"></div></div>';
      this.paintFoot();
    }
  });
  K.define('k-options', KOptions, {
    props: ['item'],
    css: C.button.css + C.stepper.css + ':host{display:block}.o{display:flex;flex-direction:column;gap:16px}.ti{margin:0}' +
      '.gp{border:0;margin:0;padding:0}.gl{font-weight:var(--k-fw-footnote-strong);padding:0;margin-block-end:4px}' +
      '.op{display:flex;align-items:center;gap:12px;min-height:52px;box-shadow:inset 0 -1px 0 var(--k-line)}.ol{flex:1}' +
      '.op input{width:22px;height:22px;accent-color:var(--k-accent);margin:0}.out .ol{color:var(--k-ink-3)}' +
      '.nt{display:flex;flex-direction:column;gap:4px}textarea{border:0;border-radius:var(--k-r-1);background-color:var(--k-surface-2);color:var(--k-ink-1);padding:10px 12px;resize:vertical}'
  });

  /* ── <k-pay form state> .pay {bill, due, method, tipPct, received} ─────────
     form: 'caps' (iPad pane) | 'flush' (phone sheet). */
  var TIPS = [0, 5, 10, 15];
  var KPay = K.make({
    setup: function () {
      var self = this, R = this.shadowRoot;
      this.__recv = ''; this.__tipText = ''; this.__tipEntry = false;
      K.tap(R, '[data-method]', function (el, e, g) {
        var m = el.getAttribute('data-method');
        if (self.p().method === m) return;               /* the row already chosen fires nothing */
        K.haptic('Choose', g, { trigger: 'tap' });
        self.p().method = m;
        self.render();
        self.emit('method', m, { gestureId: g });
      });
      K.tap(R, '[data-tip]', function (el, e, g) { self.openTip(el, g); });
      C.chip.bind(R, function (v, g) { self.__recv = String(v); self.render(); self.emit('quick', v, { gestureId: g }); });
      C.keypad.bind(R, function (id, key, g) {
        var tip = self.__tipEntry;
        var res = C.keypad.input(tip ? self.__tipText : self.__recv, key, { decimals: tip ? 1 : 2, maxInt: tip ? 3 : 7 });
        if (tip && res.ok && C.keypad.value(res.text) > 100) res.ok = false;
        if (!res.ok) { var d = self.$('.disp'); if (d && key !== 'del') { d.classList.remove('k-shake'); void d.offsetWidth; d.classList.add('k-shake'); } return; }
        if (tip) self.__tipText = res.text; else self.__recv = res.text;
        self.paint();
      });
      C.button.bind(R, function (el, g) {
        var w = el.getAttribute('data-w');
        if (w === 'confirm') {
          self.__gat = K.now(); self.__gid = g;
          self.emit('confirm', self.p().method, { amount: self.p().due, tip: self.tip(), received: self.p().method === 'cash' ? C.keypad.value(self.__recv) : null, gestureId: g });
        } else if (w === 'leave') {                     /* the header's Back: out of the payment (§18.3) */
          self.__tipEntry = false;
          self.emit('leave', null, { gestureId: g });
        } else if (w === 'back') {
          if (self.__tipEntry) { self.__tipEntry = false; self.render(); return; }
          self.p().method = null; self.render(); self.emit('back', null, { gestureId: g });
        } else if (w === 'tip-done') {
          self.__tipEntry = false; self.p().tipPct = Math.min(100, C.keypad.value(self.__tipText)); self.render();
          self.emit('tip', null, { pct: self.p().tipPct, gestureId: g });
        }
      }, '[data-w]');
    },
    p: function () { return this.__pay || (this.__pay = {}); },
    tip: function () { var p = this.p(); return fromCents(Math.round(cents(p.due) * (p.tipPct || 0) / 100)); },
    owed: function () { return fromCents(cents(this.p().due) + cents(this.tip())); },
    openTip: function (row, g) {
      var self = this, p = this.p();
      var pop = this.__pop;
      if (!pop) {
        pop = this.__pop = doc.createElement('k-popover');
        pop.appendChild(doc.createElement('k-list'));
        doc.body.appendChild(pop);
        pop.addEventListener('kiwi:action', function (e) {
          var d = e.detail || {};
          if (d.action !== 'k.list.select') return;
          e.stopPropagation();
          pop.removeAttribute('open');
          if (d.id === 'other') { self.__tipEntry = true; self.__tipText = ''; self.render(); return; }
          self.p().tipPct = Number(d.id);
          self.render();
          self.emit('tip', null, { pct: self.p().tipPct, gestureId: d.value && d.value.gestureId });
        });
      }
      pop.setAttribute('heading', t('pay.tip'));
      var cur = p.tipPct || 0;
      pop.querySelector('k-list').rows = TIPS.map(function (pct) {
        return { id: String(pct), radio: true, selected: cur === pct, title: pct ? t('pay.tip.pct', { pct: pctText(pct), amount: money(fromCents(Math.round(cents(p.due) * pct / 100))) }) : t('pay.tip.none') };
      }).concat([{ id: 'other', title: t('pay.tip.other'), trailing: 'chevron' }]);
      pop.anchor = row;
      pop.setAttribute('open', '');
      this.emit('tip-open', null, { gestureId: g });
    },
    /* The paid moment: the frame the local record exists (§10.26). */
    paid: function () {
      K.haptic('Paid', this.__gid || K.gid('paid'), { trigger: 'local-record' });
      this.setAttribute('state', 'paid');
    },
    notRecorded: function () {
      this.setAttribute('state', 'not-recorded');
      K.haptic('Failed', this.__gid || K.gid('pay'), { trigger: 'response', gestureAt: this.__gat || K.now() });
    },
    paint: function () {
      var p = this.p(), d = this.$('.disp'), ch = this.$('.chg'), ft = this.$('.pri');
      if (this.__tipEntry) {
        if (d) d.innerHTML = '<span class="k-foot k-ink2">' + th('pay.tip.other_title') + '</span><span class="k-heading k-num">' + esc(this.__tipText || '0') + ' %</span>';
        return;
      }
      var recv = C.keypad.value(this.__recv), owed = this.owed();
      if (d) d.innerHTML = '<span class="k-heading k-num">' + th('pay.received', { amount: money(recv) }) + '</span>';
      if (ch) ch.textContent = recv >= owed ? t('pay.change', { amount: money(fromCents(cents(recv) - cents(owed))) }) : '';
      if (ft) ft.innerHTML = C.button.render({ variant: 'primary', size: 'L', full: true, id: 'cf', attrs: ' data-w="confirm"', label: t('pay.cash.confirm'),
        disabled: recv < owed, reason: recv < owed ? t('pay.cash.short', { amount: money(owed) }) : '', error: this.str('state') === 'not-recorded' ? t('pay.not_recorded') : '' });
    },
    render: function () {
      var p = this.p(), st = this.str('state'), form = this.str('form', 'caps');
      /* §18.3 height forms (layout.js paymentForm): regular is one stack in the
         bill pane; compact puts the summary over the menu pane and the keys in
         the bill pane; compact-short does the same on 56-tall keys. */
      var lay = this.str('layout', 'regular'), cmp = lay === 'compact' || lay === 'compact-short';
      var tip = this.tip(), owed = this.owed();
      var tipVal = p.tipPct ? t('pay.tip.pct', { pct: pctText(p.tipPct), amount: money(tip) }) : t('pay.tip.none');
      var methods = ['cash', 'card', 'other'].map(function (m) {
        var on = p.method === m;
        return '<button type="button" class="mt k-body" role="radio" aria-checked="' + on + '" tabindex="' + (on || (!p.method && m === 'cash') ? 0 : -1) + '" data-method="' + m + '">' +
          icon(m === 'cash' ? 'payments' : m === 'card' ? 'credit_card' : 'account_balance_wallet', 24) + '<span>' + th('pay.' + m) + '</span></button>';
      }).join('');
      var lower = '';
      if (this.__tipEntry || p.method === 'cash') {
        var chips = this.__tipEntry ? '<div class="chips" aria-hidden="true"></div>' : C.chip.group({ label: t('pay.received', { amount: '' }), options: [{ value: String(owed), label: t('pay.exact'), ariaLabel: t('pay.exact_a11y', { amount: money(owed) }) }]
          .concat(roundUps(owed).map(function (v) { return { value: String(v), label: money(v) }; })), value: this.__recv });
        lower = '<div class="cash"><div class="disp" aria-live="polite"></div>' + chips + C.keypad.render({ form: form, short: lay === 'compact-short', label: t('pay.cash') }) +
          '<p class="k-heading k-num chg" aria-live="polite"></p>' +
          (this.__tipEntry ? C.button.render({ variant: 'primary', size: 'L', full: true, id: 'td', attrs: ' data-w="tip-done"', label: t('action.done') }) : '<div class="pri"></div>') + '</div>';
      } else if (p.method) {
        lower = '<div class="card"><p class="k-body">' + th('pay.card.body', { amount: money(owed) }) + '</p>' +
          C.button.render({ variant: 'primary', size: 'L', full: true, id: 'cf', attrs: ' data-w="confirm"', label: t(p.method === 'card' ? 'pay.card.confirm' : 'pay.cash.confirm'),
            error: st === 'not-recorded' ? t('pay.not_recorded') : '' }) +
          C.button.render({ label: t('action.back'), full: true, id: 'bk', attrs: ' data-w="back"' }) + '</div>';
      }
      var summary =
        '<div class="hd">' + C.button.render({ variant: 'icon', icon: 'chevron_left', label: t('action.back'), id: 'lv', attrs: ' data-w="leave"', disabled: st === 'paid' }) +
        '<h2 class="k-heading ti">' + th('pay.title', { bill: p.bill || '' }) + '</h2></div>' +
        '<div class="kf"><span class="k-foot k-ink2">' + th('pay.amount_due') + '</span>' +
        '<span class="k-title k-num" data-key-figure>' + numHtml(money(owed)) + '</span>' +
        '<span class="k-foot k-ink2 brk">' + (tip ? '<span data-k-part>' + th('pay.tip_breakdown', { bill: money(p.due), tip: money(tip) }) + '</span>' : '') + '</span></div>' +
        '<button type="button" class="row k-body" data-tip aria-haspopup="dialog"><span>' + th('pay.tip') + '</span><span class="k-ink2 tv">' + esc(tipVal) + '</span>' + icon('chevron_right', 20, 'k-mir k-ink2') + '</button>' +
        (this.__tipEntry ? '' : '<div class="ms" role="radiogroup" aria-label="' + esc(t('pay.title', { bill: p.bill || '' })) + '">' + methods + '</div>');
      var paid = st === 'paid' ? '<p class="k-title paid" role="status">' + icon('task_alt', 32) + th('pay.paid') + '</p>' : '';
      /* Compact: the two columns are one group named by pay.title, read
         summary first (§18.3). */
      this.shadowRoot.innerHTML = cmp
        ? '<div class="pay cmp' + (st === 'paid' ? ' done' : '') + '" role="group" aria-label="' + esc(t('pay.title', { bill: p.bill || '' })) + '">' +
          '<div class="sum">' + summary + paid + '</div><div class="keys">' + lower + '</div></div>'
        : '<div class="pay' + (st === 'paid' ? ' done' : '') + '">' + summary + lower + paid + '</div>';
      this.paint();
    }
  });
  K.define('k-pay', KPay, {
    attrs: ['form', 'state', 'layout'], props: ['pay'],
    css: C.button.css + C.chip.css + C.keypad.css + ':host{display:block}' +
      '.pay{display:flex;flex-direction:column;gap:12px;min-height:100%}.ti{margin:0}.hd{display:flex;align-items:center;gap:4px;margin-inline-start:-12px}' +
      /* the primary pinned to the column's foot, as the bill's is (§18.3) */
      '.cash{flex:1}.pri{margin-block-start:auto}' +
      '.cmp{display:grid;grid-template-columns:minmax(0,1fr) var(--k-pay-keys,432px);gap:0;height:100%;min-height:0}' +
      '.cmp .sum{justify-self:end;align-self:start;box-sizing:content-box;width:384px;max-width:calc(100% - 96px);margin:24px;padding:12px 24px 24px;display:flex;flex-direction:column;gap:12px;' +
      'background-color:var(--k-surface-1);border-radius:var(--k-r-3)}' +
      '.cmp .sum .row,.cmp .sum .mt{background-color:var(--k-bg)}' +
      '.cmp .keys{display:flex;flex-direction:column;min-height:0;padding:24px 24px 52px;background-color:var(--k-surface-1);border-inline-start:1px solid var(--k-line)}' +
      '.cmp .card{flex:1}' +
      '.kf{display:flex;flex-direction:column}.brk{min-height:18px}' +
      '.row,.mt{display:flex;align-items:center;gap:12px;min-height:64px;padding-inline:16px;border-radius:var(--k-r-2);background-color:var(--k-surface-1);color:var(--k-ink-1);text-align:start}' +
      '.row span:first-child{flex:1}.ms{display:flex;flex-direction:column;gap:8px}' +
      '.mt[aria-checked="true"]{background-color:var(--k-select);box-shadow:inset 0 0 0 var(--k-select-edge-w) var(--k-accent)}' +
      '.cash,.card{display:flex;flex-direction:column;gap:12px}.disp{display:flex;flex-direction:column;min-height:32px}.chips{min-height:44px}.chg{margin:0;min-height:26px}' +
      '.done .ms,.done .cash,.done .card{visibility:hidden}.paid{display:flex;align-items:center;gap:8px;color:var(--k-accent-ink);margin:0}'
  });

  /* ── <k-cash-count mode tolerance> .count {opening, cashSales, refundsCash,
     cashTips, cashIn, cashOut, lastFloat} ────────────────────────────────── */
  var NOTES = [200, 100, 50, 20], COINS = [10, 5, 2, 1, 0.5, 0.2, 0.1];
  var KCashCount = K.make({
    setup: function () {
      var self = this, R = this.shadowRoot;
      this.__n = {}; this.__sel = null; this.__any = false;
      K.tap(R, '[data-denom]', function (el) {
        self.__sel = el.getAttribute('data-denom');
        self.__typed = false;
        self.render();
        var b = self.$('[data-denom="' + self.__sel + '"]'); if (b) b.focus();
      });
      C.keypad.bind(R, function (id, key) {
        var all = NOTES.concat(COINS).map(String);
        if (self.__sel == null) self.__sel = all[0];
        if (key === 'next') { var i = all.indexOf(self.__sel); self.__sel = all[Math.min(all.length - 1, i + 1)]; self.__typed = false; self.render(); return; }
        var cur = self.__typed ? String(self.__n[self.__sel] || '') : '';
        var res = C.keypad.input(cur, key, { decimals: 0, maxInt: 4 });
        if (!res.ok && key !== 'del') return;
        self.__typed = true;
        self.__n[self.__sel] = res.text ? parseInt(res.text, 10) : 0;
        self.__any = true;
        self.render();
      });
      C.chip.bind(R, function (v, g) {
        if (v === 'same') { self.__total = self.c().lastFloat; self.__any = true; self.render(); }
      });
      C.button.bind(R, function (el, g) {
        if (el.getAttribute('data-w') === 'commit') {
          self.__gid = g;
          self.emit(self.str('mode', 'close') === 'open' ? 'open' : 'close', null, { counts: self.__n, counted: self.counted(), difference: self.diff(), gestureId: g });
        } else if (el.getAttribute('data-w') === 'enter-total') self.emit('enter-total', null, { gestureId: g });
      }, '[data-w]');
    },
    c: function () { return this.__count || (this.__count = {}); },
    counted: function () {
      if (this.__total != null) return this.__total;
      var n = this.__n, c = 0;
      Object.keys(n).forEach(function (d) { c += Math.round(Number(d) * 100) * (n[d] || 0); });
      return fromCents(c);
    },
    expected: function () {
      var s = this.c();
      return fromCents(cents(s.opening) + cents(s.cashSales) + cents(s.cashTips) + cents(s.cashIn) - cents(s.cashOut));
    },
    diff: function () { return fromCents(cents(this.counted()) - cents(this.expected())); },
    /* One Paid on the frame the close is committed; Commit for the opening
       float's local write (§15.3). */
    committed: function () {
      var open = this.str('mode', 'close') === 'open';
      K.haptic(open ? 'Commit' : 'Paid', this.__gid || K.gid('count'), { trigger: 'local-record' });
    },
    render: function () {
      var self = this, s = this.c(), open = this.str('mode', 'close') === 'open', f = F();
      var tol = Number(this.str('tolerance', '20')) || 20;
      var row = function (d) {
        var n = self.__n[d] || 0, sub = fromCents(Math.round(d * 100) * n), lab = money(d);
        var on = String(d) === self.__sel;
        return '<li class="dr' + (on ? ' on' : '') + '"><span class="k-body dl">' + th('count.denom', { value: lab }) + '</span>' +
          '<button type="button" class="cnt k-body k-num" data-denom="' + d + '" aria-pressed="' + on + '" aria-label="' + esc(t('count.row_a11y', { denomination: lab, n: n, subtotal: money(sub) })) + '">' + n + '</button>' +
          '<span class="k-body k-num sb">' + numHtml(f ? f.num(sub, 2) : sub) + '</span></li>';
      };
      var fig, figLabel, tone = 'neutral';
      if (open) { fig = money(this.counted()); figLabel = t('count.opening_float'); }
      else if (!this.__any) { fig = money(this.expected()); figLabel = t('count.expected'); }
      else {
        var d = this.diff();
        fig = f ? f.signedMoney(d, 2) : String(d); figLabel = t('count.difference');
        var a = Math.abs(d);
        tone = a <= tol ? 'neutral' : (a > 5 * tol ? 'danger' : 'warning');
      }
      var part = function (key, v, sign, extra) {
        return '<div class="sl' + (extra || '') + '" data-k-part><span class="k-body k-ink2">' + th(key) + '</span><span class="k-body k-num">' + numHtml((sign || '') + money(v)) + '</span></div>';
      };
      var summary = open ? '' : part('count.opening_float', s.opening) + part('count.cash_sales', s.cashSales, '+ ') +
        (s.refundsCash ? '<p class="k-foot k-ink2 sub">' + th('count.cash_refunds_sub', { amount: money(s.refundsCash) }) + '</p>' : '') +
        part('count.cash_tips', s.cashTips, '+ ') + part('count.cash_in', s.cashIn, '+ ') + part('count.cash_out', s.cashOut, '− ') +
        '<div class="sl ex"' + (this.__any ? '' : ' style="visibility:hidden"') + '><span class="k-body">' + th('count.expected') + '</span><span class="k-heading k-num">' + numHtml(money(this.expected())) + '</span></div>' +
        (this.__any ? part('count.counted', this.counted()) : '');
      var canCommit = open ? this.__any : this.__any;
      this.shadowRoot.innerHTML = '<div class="cc"><div class="col">' +
        '<h2 class="k-heading ti">' + th('count.title') + '</h2>' +
        '<div class="fig" data-tone="' + tone + '"><span class="k-foot k-ink2">' + esc(figLabel) + '</span><span class="k-display k-num" data-key-figure>' + numHtml(fig) + '</span></div>' +
        (open && s.lastFloat ? C.chip.group({ options: [{ value: 'same', label: t('count.same_as_last', { amount: money(s.lastFloat) }), ariaLabel: t('count.same_as_last_a11y', { amount: money(s.lastFloat) }) }], mode: 'multi' }) : '') +
        '<div data-k-group><p class="k-foot k-ink2 sh">' + th('count.notes') + '</p><ul class="dl">' + NOTES.map(row).join('') + '</ul>' +
        '<p class="k-foot k-ink2 sh">' + th('count.coins') + '</p><ul class="dl">' + COINS.map(row).join('') + '</ul></div>' +
        C.button.render({ variant: 'plain', label: t('count.enter_total'), id: 'et', attrs: ' data-w="enter-total"' }) +
        '<div class="sum">' + summary + '</div></div>' +
        '<div class="kp">' + C.keypad.render({ next: true, label: t('count.title') }) +
        C.button.render({ variant: 'primary', size: 'L', full: true, id: 'cm', attrs: ' data-w="commit"', label: t(open ? 'count.open' : 'count.close'), disabled: !canCommit, reason: !canCommit && !open ? t('count.close_hint') : '' }) +
        '</div></div>';
    }
  });
  K.define('k-cash-count', KCashCount, {
    attrs: ['mode', 'tolerance'], props: ['count'],
    css: C.button.css + C.chip.css + C.keypad.css + ':host{display:block}' +
      '.cc{display:grid;grid-template-columns:minmax(0,360px) 288px;gap:24px}' +
      '@media (max-width:719px){.cc{grid-template-columns:minmax(0,1fr)}}' +
      '.ti{margin:0 0 8px}.fig{display:flex;flex-direction:column;margin-block-end:12px}' +
      '.fig[data-tone="warning"] .k-display{color:var(--k-warning)}.fig[data-tone="danger"] .k-display{color:var(--k-danger)}' +
      '.sh{margin:12px 0 4px;font-weight:var(--k-fw-footnote-strong)}.dl{list-style:none;margin:0;padding:0}' +
      '.dr{display:flex;align-items:center;gap:8px;min-height:56px;padding-inline:16px;box-shadow:inset 0 -1px 0 var(--k-line)}' +
      '.dr .dl{flex:1;min-width:0}.cnt{width:72px;min-height:44px;border-radius:var(--k-r-1);background-color:var(--k-surface-2);font-weight:var(--k-fw-body-strong)}' +
      '.dr.on .cnt{background-color:var(--k-select);box-shadow:inset 0 0 0 var(--k-select-edge-w) var(--k-accent)}' +
      '.sb{width:96px;text-align:end}' +
      '.sum{position:sticky;bottom:0;padding-block:12px;background-color:var(--k-surface-1);box-shadow:inset 0 1px 0 var(--k-line)}' +
      '.sl{display:flex;justify-content:space-between;gap:12px;min-height:28px;align-items:baseline}.sub{margin:0 0 4px}' +
      '.kp{display:flex;flex-direction:column;gap:16px;align-self:start;position:sticky;top:0}'
  });

  /* ── <k-split> .bill {total, lines:[{id, name, amount}]} .paidShares ────── */
  var KSplit = K.make({
    setup: function () {
      var self = this, R = this.shadowRoot;
      this.__mode = 'equal'; this.__n = 2; this.__assign = {}; this.__pick = 0;
      R.addEventListener('kiwi:action', function (e) {
        var d = e.detail || {};
        if (d.action !== 'k.segmented.select') return;
        e.stopPropagation();
        self.__mode = d.value && d.value.value || d.id; self.render();
      });
      C.stepper.bind(R, function (id, dir) { if (!dir) return; self.__n = Math.max(2, Math.min(20, self.__n + dir)); self.__pick = 0; self.render(); });
      C.chip.bind(R, function (v, g, mode, el) {
        var line = el.closest('[data-l]').getAttribute('data-l');
        if (v === '+') { self.__n = Math.min(20, self.__n + 1); v = String(self.__n); }
        self.__assign[line] = Number(v);
        self.render();
      });
      K.tap(R, '[data-share]', function (el, e, g) { var i = Number(el.getAttribute('data-share')); if (i !== self.__pick) { K.haptic('Choose', g, { trigger: 'tap' }); self.__pick = i; self.render(); } });
      C.button.bind(R, function (el, g) {
        if (el.getAttribute('data-w') === 'leave') { self.emit('leave', null, { gestureId: g }); return; }   /* the header's Back (§10.30) */
        if (el.getAttribute('data-w') !== 'pay') return;
        var sh = self.shares();
        self.emit('pay-share', String(self.__pick + 1), { n: self.__pick + 1, amount: fromCents(sh[self.__pick] || 0), mode: self.__mode, gestureId: g });
      }, '[data-w]');
    },
    /* What the host needs to build the shares the same way: the mode, the
       count and, by item, which share each line went to. */
    plan: function () { return { mode: this.__mode, n: this.__n, assign: Object.assign({}, this.__assign) }; },
    shares: function () {
      var b = this.bill || {}, total = cents(b.total);
      if (this.__mode === 'equal') return shareMoney(total, this.__n);
      var self = this, sums = [];
      for (var i = 0; i < this.__n; i++) sums.push(0);
      (b.lines || []).forEach(function (l) { var s = self.__assign[l.id]; if (s) sums[s - 1] += cents(l.amount); });
      var gross = sums.reduce(function (a, c) { return a + c; }, 0);
      /* A discount comes off pro rata to the shares' sums (§10.30). */
      return gross > total ? shareWeighted(total, sums) : sums;
    },
    render: function () {
      var b = this.bill || {}, self = this, paid = this.paidShares || [];
      var sh = this.shares();
      var unassigned = (b.lines || []).filter(function (l) { return !self.__assign[l.id]; }).length;
      while (paid.indexOf(this.__pick + 1) >= 0 && this.__pick < sh.length - 1) this.__pick++;
      var shares = '<ul class="sh" role="radiogroup" aria-label="' + esc(t('split.title', { amount: money(b.total || 0) })) + '">' + sh.map(function (c, i) {
        var done = paid.indexOf(i + 1) >= 0, on = i === self.__pick;
        return '<li><button type="button" class="srow k-body" role="radio" aria-checked="' + on + '" data-share="' + i + '"' + (done ? ' aria-disabled="true"' : '') + '>' +
          '<span>' + th('split.share_n', { n: i + 1 }) + ' · <span class="k-num">' + numHtml(money(fromCents(c))) + '</span></span>' + (done ? icon('task_alt', 20, 'k-accent-ink') : '') + '</button></li>';
      }).join('') + '</ul>';
      var mid = this.__mode === 'equal'
        ? C.stepper.render({ id: 'n', value: this.__n, min: 2, max: 20, label: t('split.shares') })
        : '<ul class="items">' + (b.lines || []).map(function (l) {
          var opts = []; for (var i = 1; i <= self.__n; i++) opts.push({ value: String(i), label: String(i) });
          opts.push({ value: '+', label: '+', ariaLabel: t('split.shares') });
          return '<li class="it" data-l="' + esc(l.id) + '"><span class="k-body">' + esc(l.name) + '</span><span class="k-body k-num k-ink2">' + numHtml(money(l.amount)) + '</span>' +
            C.chip.group({ options: opts, value: self.__assign[l.id] ? String(self.__assign[l.id]) : null, label: l.name }) + '</li>';
        }).join('') + '</ul>' + (unassigned ? '<p class="k-foot k-ink2">' + th('split.unassigned', { n: unassigned }) + '</p>' : '');
      var blocked = this.__mode === 'item' && unassigned > 0;
      this.shadowRoot.innerHTML = '<div class="sp"><div class="hd">' + C.button.render({ variant: 'icon', icon: 'chevron_left', label: t('action.back'), id: 'lv', attrs: ' data-w="leave"' }) + '<h2 class="k-heading ti">' + th('split.title', { amount: money(b.total || 0) }) + '</h2></div>' +
        '<k-segmented id="mode" value="' + this.__mode + '" label="' + esc(t('split.title', { amount: '' })) + '"></k-segmented>' + mid + shares +
        (paid.length ? '<p class="k-foot k-ink2">' + th('split.progress', { paid: paid.length, total: sh.length }) + '</p>' : '') +
        C.button.render({ variant: 'primary', size: 'L', full: true, id: 'ps', attrs: ' data-w="pay"', label: t('split.pay_share', { n: this.__pick + 1 }), disabled: blocked }) + '</div>';
      var seg = this.$('#mode');
      seg.options = [{ value: 'equal', label: t('split.equally') }, { value: 'item', label: t('split.by_item') }];
    }
  });
  K.define('k-split', KSplit, {
    props: ['bill', 'paidShares'],
    css: C.button.css + C.chip.css + C.stepper.css + ':host{display:block}.hd{display:flex;align-items:center;gap:4px;margin-inline-start:-12px}.sp{display:flex;flex-direction:column;gap:16px}.ti{margin:0}' +
      '.sh,.items{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:8px}' +
      '.srow{display:flex;justify-content:space-between;align-items:center;width:100%;min-height:52px;padding-inline:16px;border-radius:var(--k-r-2);background-color:var(--k-surface-1);text-align:start}' +
      '.srow[aria-checked="true"]{background-color:var(--k-select);box-shadow:inset 0 0 0 var(--k-select-edge-w) var(--k-accent)}.srow[aria-disabled="true"]{color:var(--k-ink-3)}' +
      '.it{display:grid;grid-template-columns:1fr auto;gap:4px 12px;padding-block:8px;box-shadow:inset 0 -1px 0 var(--k-line)}.it .k-chips{grid-column:1/-1}'
  });

  /* ── <k-discount> .bill {total} .policy {configured, percentages} ──────── */
  var REASONS = [['commercial', 'discount.reason.commercial'], ['loyal-customer', 'discount.reason.loyal'], ['kitchen-error', 'discount.reason.kitchen'], ['other', 'reason.other']];
  var KDiscount = K.make({
    setup: function () {
      var self = this, R = this.shadowRoot;
      this.__mode = 'percent'; this.__text = ''; this.__reason = null;
      R.addEventListener('kiwi:action', function (e) {
        var d = e.detail || {};
        if (d.action !== 'k.segmented.select') return;
        e.stopPropagation();
        self.__mode = d.value && d.value.value || d.id; self.__text = ''; self.render();
      });
      C.chip.bind(R, function (v, g, mode, el) {
        if (el.closest('[data-reasons]')) self.__reason = v; else self.__text = v;
        self.render();
      });
      C.keypad.bind(R, function (id, key) {
        var res = C.keypad.input(self.__text, key, { decimals: self.__mode === 'percent' ? 1 : 2, maxInt: self.__mode === 'percent' ? 3 : 7 });
        if (!res.ok && key !== 'del') return;
        self.__text = res.text; self.render();
      });
      C.button.bind(R, function (el, g) {
        if (el.getAttribute('data-w') === 'leave') { self.emit('leave', null, { gestureId: g }); return; }   /* the header's Back (§10.31) */
        if (el.getAttribute('data-w') !== 'apply') return;
        /* The Apply tap fires nothing; the approval's answer does (§10.31). */
        self.emit('apply', null, { mode: self.__mode, value: C.keypad.value(self.__text), reason: self.__reason, amount: self.amount(), gestureId: g });
      }, '[data-w]');
    },
    pols: function () { var p = this.policy || {}; return (p.percentages && p.percentages.length) ? p.percentages : [5, 10, 15, 20]; },
    amount: function () {
      var total = cents((this.bill || {}).total), v = C.keypad.value(this.__text);
      return fromCents(this.__mode === 'percent' ? Math.round(total * v / 100) : cents(v));
    },
    render: function () {
      var b = this.bill || {}, p = this.policy || {}, v = C.keypad.value(this.__text), amt = this.amount();
      var err = '';
      if (amt > (b.total || 0)) err = t('discount.too_large');
      else if (this.__mode === 'percent' && p.configured && v && this.pols().indexOf(v) < 0) err = t('discount.not_allowed');
      var ready = v > 0 && this.__reason && !err;
      var pctChips = this.__mode === 'percent' ? C.chip.group({ options: this.pols().map(function (x) { return { value: String(x), label: pctText(x) }; }), value: this.__text, label: t('discount.percent') }) : '';
      var newTotal = fromCents(cents(b.total) - cents(amt));
      this.shadowRoot.innerHTML = '<div class="dc"><div class="hd">' + C.button.render({ variant: 'icon', icon: 'chevron_left', label: t('action.back'), id: 'lv', attrs: ' data-w="leave"' }) + '<h2 class="k-heading ti">' + th('discount.title') + '</h2></div>' +
        '<k-segmented id="mode" value="' + this.__mode + '" label="' + esc(t('discount.title')) + '"></k-segmented>' + pctChips +
        '<p class="k-heading k-num disp">' + numHtml(this.__mode === 'percent' ? (this.__text || '0') + ' %' : money(v)) + '</p>' +
        C.keypad.render({ label: t('discount.title') }) +
        '<div data-reasons>' + C.chip.group({ options: REASONS.map(function (r) { return { value: r[0], label: t(r[1]) }; }), value: this.__reason, label: t('reason.choose') }) + '</div>' +
        (v ? '<p class="k-callout pv">' + th('discount.preview', { pct: pctText(b.total ? Math.round(amt / b.total * 1000) / 10 : 0), amount: money(amt), total: money(newTotal) }) + '</p>' : '') +
        (err ? '<p class="k-foot er" role="status">' + esc(err) + '</p>' : '') +
        '<p class="k-foot k-ink2">' + th('discount.manager') + '</p>' +
        C.button.render({ variant: 'primary', size: 'L', full: true, id: 'ap', attrs: ' data-w="apply"', label: t('discount.apply', { amount: money(amt) }), disabled: !ready }) + '</div>';
      this.$('#mode').options = [{ value: 'percent', label: t('discount.percent') }, { value: 'amount', label: t('discount.amount') }];
    }
  });
  K.define('k-discount', KDiscount, {
    props: ['bill', 'policy'],
    css: C.button.css + C.chip.css + C.keypad.css + ':host{display:block}.hd{display:flex;align-items:center;gap:4px;margin-inline-start:-12px}.dc{display:flex;flex-direction:column;gap:12px}.ti,.disp,.pv{margin:0}.er{margin:0;color:var(--k-danger)}'
  });

  /* ── <k-bill-bar count total disabled> ─────────────────────────────────── */
  var KBillBar = K.make({
    setup: function () {
      var self = this;
      K.tap(this.shadowRoot, '.bar', function (el, e, g) { self.emit('open', null, { gestureId: g }); });
    },
    render: function () {
      var n = this.int('count', 0), total = this.str('total');
      if (!n) { this.shadowRoot.innerHTML = ''; this.setAttribute('hidden', ''); return; }
      this.removeAttribute('hidden');
      var prev = this.$('.amt');
      var amount = money(Number(total) || 0);
      if (prev) {
        var badge = this.$('.n'); if (badge) badge.textContent = n;
        if (prev.textContent !== amount) { prev.textContent = amount; fade(prev); }
        var b = this.$('.bar');
        b.setAttribute('aria-label', t('bill.view_a11y', { n: n, amount: amount }));
        if (this.flag('disabled')) b.setAttribute('aria-disabled', 'true'); else b.removeAttribute('aria-disabled');
        return;
      }
      this.shadowRoot.innerHTML = '<button type="button" class="bar k-body-s" aria-label="' + esc(t('bill.view_a11y', { n: n, amount: amount })) + '"' + (this.flag('disabled') ? ' aria-disabled="true"' : '') + '>' +
        '<span class="ic">' + icon('receipt_long', 20) + '<span class="n k-foot-s k-num">' + n + '</span></span>' +
        '<span class="lb">' + th('bill.view') + '</span><span class="amt k-num">' + esc(amount) + '</span></button>';
    }
  });
  K.define('k-bill-bar', KBillBar, {
    attrs: ['count', 'total', 'disabled'],
    css: ':host{display:block}:host([hidden]){display:none}' +
      '.bar{display:flex;align-items:center;gap:16px;width:100%;min-height:56px;padding-inline:20px;border-radius:999px;background-color:var(--k-accent);color:var(--k-on-accent);' +
      'font-weight:var(--k-fw-body-strong);transition:transform var(--k-dur-4) var(--k-spring)}' +
      '.bar:active:not([aria-disabled="true"]){transform:scale(.97);background-color:var(--k-accent-pressed);transition-duration:var(--k-dur-1);transition-timing-function:var(--k-glide)}' +
      '.bar[aria-disabled="true"]{opacity:.5}' +
      '.ic{position:relative;display:inline-flex;width:28px}.n{position:absolute;top:-8px;inset-inline-end:-6px;min-width:18px;height:18px;border-radius:9px;padding-inline:4px;' +
      'display:flex;align-items:center;justify-content:center;background-color:var(--k-on-accent);color:var(--k-accent)}' +
      '.lb{flex:1;text-align:start}'
  });

  /* ── <k-code-display kind state code time venue> ───────────────────────────
     kind: attendance | printer. state: loading | shown | expired | failed |
     refresh-failed | not-ready | unpaired | subscription | suspended. */
  function group3(code) { code = String(code || ''); return code.length === 6 ? code.slice(0, 3) + ' ' + code.slice(3) : code; }
  var KCodeDisplay = K.make({
    setup: function () {
      var self = this;
      C.button.bind(this.shadowRoot, function (el, g) { self.emit(el.getAttribute('data-w'), null, { gestureId: g }); }, '[data-w]');
    },
    attr: function (name, before, after) {
      if (name === 'code' && before && after && this.str('state') === 'shown') { this.render(); fade(this.$('.code')); K.say(this.$('#say'), this.str('kind') === 'attendance' ? t('attendance.changed') : ''); return; }
      this.render();
    },
    render: function () {
      var kind = this.str('kind', 'attendance'), st = this.str('state', 'loading'), att = kind === 'attendance';
      var code = this.str('code'), time = this.str('time'), venue = this.str('venue');
      var title = t(att ? 'attendance.show' : 'printer.code.title');
      var codeHtml = '', note = '', btn = null;
      if (st === 'loading') {
        codeHtml = '<span class="code sk" aria-hidden="true">' + [0, 1, 2, 3, 4, 5].map(function (i) { return '<span class="k-skel d' + (i === 3 ? ' gap' : '') + '"></span>'; }).join('') + '</span>';
        btn = { label: t(att ? 'attendance.replace' : 'printer.code.new'), w: 'replace', disabled: true };
      } else if (st === 'shown' || st === 'refresh-failed' || st === 'expired') {
        var expired = st === 'expired';
        codeHtml = '<span class="code k-title k-num' + (expired ? ' old' : '') + '"' + (expired ? ' aria-hidden="true"' : '') + '>' + esc(group3(code)) + '</span>';
        if (expired) note = '<p class="k-foot k-ink2">' + th('printer.code.expired') + '</p>';
        else if (st === 'refresh-failed') note = '<p class="k-foot k-ink2 ln">' + icon('info', 16) + th('attendance.refresh_failed', { time: time }) + '</p>';
        else note = '<p class="k-foot k-ink2">' + esc(att ? t('attendance.changes_at', { time: time }) : t('printer.code.body', { time: time })) + '</p>';
        btn = { label: t(att ? 'attendance.replace' : 'printer.code.new'), w: 'replace' };
      } else if (st === 'failed') {
        note = '<p class="k-foot er">' + th(att ? 'attendance.failed' : 'printer.code.failed') + '</p>';
        btn = { label: t('action.try_again'), w: 'retry' };
      } else if (st === 'unpaired') {
        note = '<p class="k-foot er">' + th(att ? 'attendance.unpaired' : 'printer.code.unpaired', { venue: venue }) + '</p>';
        btn = { label: t('pin.pair_till'), w: 'pair' };
      } else {
        var key = { 'not-ready': 'printer.code.not_ready', subscription: 'access.subscription', suspended: 'access.suspended' }[st] || 'access.unavailable';
        note = '<p class="k-foot er">' + th(key) + '</p>';
      }
      var body = att && (st === 'shown' || st === 'refresh-failed') ? '<p class="k-foot k-ink2">' + th('attendance.body') + '</p>' : '';
      this.shadowRoot.innerHTML = '<div class="cd"><h2 class="k-heading ti">' + esc(title) + '</h2>' + body + codeHtml + note +
        '<p class="k-vh" aria-live="polite" id="say">' + '</p>' +
        (btn ? C.button.render({ size: 'L', full: true, label: btn.label, id: 'b', attrs: ' data-w="' + btn.w + '"', disabled: btn.disabled }) : '') + '</div>';
      if (st === 'loading') K.say(this.$('#say'), t(att ? 'attendance.creating' : 'printer.code.creating'));
    }
  });
  K.define('k-code-display', KCodeDisplay, {
    attrs: ['kind', 'state', 'code', 'time', 'venue'],
    css: C.button.css + ':host{display:block}.cd{display:flex;flex-direction:column;gap:12px}.ti,.cd p{margin:0}' +
      '.code{letter-spacing:.04em}.code.old{color:var(--k-ink-3)}.sk{display:flex;gap:6px}.sk .d{width:22px;height:32px;border-radius:6px}.sk .gap{margin-inline-start:10px}' +
      '.ln{display:flex;align-items:center;gap:6px}.er{color:var(--k-danger)}'
  });

  K.till = { shareMoney: shareMoney, shareWeighted: shareWeighted, roundUps: roundUps, cents: cents };
})(typeof window !== 'undefined' ? window : globalThis);
