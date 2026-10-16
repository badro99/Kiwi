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
             total, sendOnPay, paying, plain }
     plain: a counter sale with no kitchen (the business-type tills, §18.3):
     one list without sent groups, no split, discount, print or overflow. */
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
      /* The bill's customer (owner, 2026-10-16): the kit shows who the note is
         for and reports the two gestures; the till owns the book and the
         picker, as it already does for the shipped pane. */
      K.tap(R, '[data-bill-client]', function (el, e, g) {
        if (el.getAttribute('aria-disabled') === 'true') return;
        self.emit(el.getAttribute('data-bill-client') === 'clear' ? 'client-clear' : 'client', null, { gestureId: g, anchor: el });
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
        (b.plain ? '' : C.button.render({ variant: 'icon', icon: 'print', label: t('bill.print'), id: 'pr', attrs: ' data-w="print"' }) +
        C.button.render({ variant: 'icon', icon: 'more_horiz', label: t('action.more'), id: 'mo', attrs: ' data-w="overflow"' })) + '</header>';
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
              (b.plain ? '' : C.button.render({ label: t('bill.edit_options'), size: 'S', id: 'eo-' + l.id, attrs: ' data-w="edit-options"' })) +
              C.button.render({ label: t(l.sent ? 'bill.void' : 'bill.remove'), variant: 'tonal-danger', size: 'S', id: 'rm-' + l.id, attrs: ' data-w="' + (l.sent ? 'void' : 'remove') + '"' }) +
              '</div></div>';
          }
          return '<li class="ln' + (open ? ' on' : '') + '" data-line="' + esc(l.id) + '"' + (paying ? ' aria-disabled="true"' : '') + ' tabindex="0" aria-expanded="' + (open ? 'true' : 'false') + '">' +
            '<div class="r"><span class="qt k-callout k-num">' + esc(l.qty) + '×</span>' +
            '<span class="nm"><span class="k-body">' + esc(l.name) + '</span>' +
            (l.mods || []).map(function (m) { return '<span class="k-foot k-ink2 md">' + esc(m) + '</span>'; }).join('') + '</span>' +
            '<span class="k-body k-num pr" data-k-part>' + numHtml(money(l.price)) + '</span></div>' + ex + '</li>';
        };
        body = b.plain ? '<ul class="ls">' + lines.map(row).join('') + '</ul>' : (unsent.length ? '<p class="k-foot gh ns">' + th('bill.not_sent', { n: unsent.length }) + '</p><ul class="ls">' + unsent.map(row).join('') + '</ul>' : '') +
          (sent.length ? '<p class="k-foot k-ink2 gh">' + th('bill.sent_at', { time: (sent[0] && sent[0].sentAt) || '' }) + '</p><ul class="ls">' + sent.map(row).join('') + '</ul>' : '');
      }
      var part = function (p) { return p && cents(p.amount) ? '<div class="pt k-body" data-k-part><span class="k-ink2">' + esc(p.label) + '</span><span class="k-num">' + numHtml(K.fmt() ? K.fmt().signedMoney(p.amount, 2) : p.amount) + '</span></div>' : ''; };
      var sendFirst = unsent.length && !b.sendOnPay && !b.plain;
      var primary = sendFirst
        ? C.button.render({ variant: 'primary', size: 'L', full: true, label: t('bill.send', { n: unsent.length }), id: 'pri', attrs: ' data-w="send"', disabled: paying })
        : C.button.render({ variant: 'primary', size: 'L', full: true, label: t('bill.take_payment', { amount: money(b.total || 0) }), id: 'pri', attrs: ' data-w="pay"', disabled: !lines.length || paying });
      /* bill.clients says the book is on for this shop; bill.client is who is
         attached, with the loyalty progress the cashier reads out loud. */
      var client = !b.clients ? '' : '<div class="cl' + (b.client ? ' on' : '') + '">' +
        '<button type="button" class="clb k-body" data-bill-client="pick"' + (paying ? ' aria-disabled="true"' : '') + '>' +
        icon(b.client ? 'person' : 'person_add', 24, 'k-ink2') +
        '<span class="cnm">' + esc(b.client ? b.client.name : t('bill.client')) + '</span>' +
        (b.client && b.client.progress ? '<span class="k-foot k-ink2">' + esc(b.client.progress) + '</span>' : icon('chevron_right', 20, 'k-mir k-ink2')) +
        '</button>' +
        (b.client ? '<button type="button" class="clx" data-bill-client="clear"' + (paying ? ' aria-disabled="true"' : '') + ' aria-label="' + esc(t('bill.client_clear')) + '">' + icon('close', 20) + '</button>' : '') +
        '</div>';
      var foot = '<footer class="ft">' + client + part(b.discount) + part(b.service) +
        '<div class="tot"><span class="k-body k-ink2">' + th('bill.total') + '</span><span class="k-title k-num" data-k-total>' + numHtml(money(b.total || 0)) + '</span></div>' +
        (b.plain ? '' : '<div class="sec2">' + C.button.render({ label: t('bill.split'), id: 'sp', attrs: ' data-w="split"', disabled: !lines.length || paying }) +
        C.button.render({ label: t('bill.discount'), id: 'dc', attrs: ' data-w="discount"', disabled: !lines.length || paying }) + '</div>') +
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
      '.cl{display:flex;align-items:center;gap:4px;margin-block-end:8px}' +
      '.clb{flex:1;min-width:0;display:flex;align-items:center;gap:12px;min-height:56px;padding-inline:16px;border-radius:var(--k-r-2);background-color:var(--k-surface-2);color:var(--k-ink-1);text-align:start}' +
      '.cl.on .clb{background-color:var(--k-accent-tint)}.clb:active{background-color:var(--k-surface-3)}' +
      '.cnm{flex:1;min-width:0;overflow-wrap:anywhere}' +
      '.clx{flex:none;width:44px;height:44px;display:flex;align-items:center;justify-content:center;border-radius:var(--k-r-2);color:var(--k-ink-2)}' +
      '.clb:focus-visible,.clx:focus-visible{box-shadow:inset 0 0 0 var(--k-focus-w) var(--k-focus)}' +
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

  /* ── <k-pay form state> .pay {bill, due, method, tipPct, received, noTip} ──
     noTip: no tip row, for a till whose sale record carries no tip.
     form: 'caps' (iPad pane) | 'flush' (phone sheet). */
  var TIPS = [0, 5, 10, 15];
  /* What a Moroccan till is handed (owner, 2026-10-16): four notes and three
     coins. Tapping one adds it to Received, so 122 is 100 · 20 · 1 · 1 and
     nobody types. A note is drawn as a note (a wide double-framed card) and a
     coin as a coin (a disc), in the kit's own inks: the palette is locked
     (§5.1), so the shape carries the money, never a borrowed banknote colour.
     The keypad is one tap away for a sum these cannot build (a centime). */
  var PAY_NOTES = [200, 100, 50, 20], PAY_COINS = [10, 5, 1];
  var KPay = K.make({
    setup: function () {
      var self = this, R = this.shadowRoot;
      this.__recv = ''; this.__tipText = ''; this.__tipEntry = false;
      /* The taps, in order, so one wrong note is undone rather than the lot. */
      this.__hist = []; this.__pad = 'denoms';
      K.tap(R, '[data-method]', function (el, e, g) {
        var m = el.getAttribute('data-method');
        if (self.p().method === m) return;               /* the row already chosen fires nothing */
        K.haptic('Choose', g, { trigger: 'tap' });
        self.p().method = m;
        self.render();
        self.emit('method', m, { gestureId: g });
      });
      K.tap(R, '[data-tip]', function (el, e, g) { self.openTip(el, g); });
      C.chip.bind(R, function (v, g) { self.__recv = String(v); self.__hist = []; self.render(); self.emit('quick', v, { gestureId: g }); });
      K.tap(R, '[data-denom]', function (el, e, g) {
        var add = Number(el.getAttribute('data-denom'));
        K.haptic('Adjust', g, { trigger: 'tap' });
        var v = Math.round((C.keypad.value(self.__recv) + add) * 100) / 100;
        if (v > 9999999) return;
        self.__hist.push(add);
        self.__recv = String(v);
        self.render();
      });
      K.tap(R, '[data-denom-undo]', function (el, e, g) {
        K.haptic('Adjust', g, { trigger: 'tap' });
        var back = self.__hist.pop();
        var v = back == null ? 0 : Math.round((C.keypad.value(self.__recv) - back) * 100) / 100;
        /* Nothing left to take back is nothing received, not a zero: the entry
           is optional, and an empty Received is what lets Confirm through. */
        self.__recv = self.__hist.length && v > 0 ? String(v) : '';
        self.render();
      });
      C.keypad.bind(R, function (id, key, g) {
        var tip = self.__tipEntry;
        var res = C.keypad.input(tip ? self.__tipText : self.__recv, key, { decimals: tip ? 1 : 2, maxInt: tip ? 3 : 7 });
        if (tip && res.ok && C.keypad.value(res.text) > 100) res.ok = false;
        if (!res.ok) { var d = self.$('.disp'); if (d && key !== 'del') { d.classList.remove('k-shake'); void d.offsetWidth; d.classList.add('k-shake'); } return; }
        if (tip) self.__tipText = res.text; else { self.__recv = res.text; self.__hist = []; }
        self.paint();
      });
      C.button.bind(R, function (el, g) {
        var w = el.getAttribute('data-w');
        if (w === 'confirm') {
          self.__gat = K.now(); self.__gid = g;
          /* Received is optional (owner, 2026-10-16): left empty it is null, « the
             cashier did the change in their head », not a zero the host would
             read as a short payment. */
          var got = self.p().method === 'cash' && self.__recv !== '' ? C.keypad.value(self.__recv) : null;
          self.emit('confirm', self.p().method, { amount: self.p().due, tip: self.tip(), received: got, gestureId: g });
        } else if (w === 'leave') {                     /* the header's Back: out of the payment (§18.3) */
          self.__tipEntry = false;
          self.emit('leave', null, { gestureId: g });
        } else if (w === 'back') {
          if (self.__tipEntry) { self.__tipEntry = false; self.render(); return; }
          self.p().method = null; self.render(); self.emit('back', null, { gestureId: g });
        } else if (w === 'pad') {
          self.__pad = self.__pad === 'keys' ? 'denoms' : 'keys'; self.render();
        } else if (w === 'tip-done') {
          self.__tipEntry = false; self.p().tipPct = Math.min(100, C.keypad.value(self.__tipText)); self.render();
          self.emit('tip', null, { pct: self.p().tipPct, gestureId: g });
        }
      }, '[data-w]');
    },
    p: function () { return this.__pay || (this.__pay = {}); },
    tip: function () { var p = this.p(); if (p.noTip) return 0; return fromCents(Math.round(cents(p.due) * (p.tipPct || 0) / 100)); },
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
      /* Counting what the guest handed over is optional (owner, 2026-10-16):
         a cashier who makes the change in their head confirms straight away,
         and only a count that is actually SHORT holds the button. */
      var none = this.__recv === '', recv = C.keypad.value(this.__recv), owed = this.owed();
      var short = !none && recv < owed;
      if (d) d.innerHTML = '<span class="k-heading' + (none ? ' k-ink2' : ' k-num') + '">' + (none ? th('pay.received_optional') : th('pay.received', { amount: money(recv) })) + '</span>';
      if (ch) ch.textContent = !none && recv >= owed ? t('pay.change', { amount: money(fromCents(cents(recv) - cents(owed))) }) : '';
      if (ft) ft.innerHTML = C.button.render({ variant: 'primary', size: 'L', full: true, id: 'cf', attrs: ' data-w="confirm"', label: t('pay.cash.confirm'),
        disabled: short, reason: short ? t('pay.cash.short', { amount: money(owed) }) : '', error: this.str('state') === 'not-recorded' ? t('pay.not_recorded') : '' });
    },
    /* A note is a card, a coin is a disc; both are plain kit surfaces with a
       double hairline frame, which reads as money without inventing a colour
       the palette does not hold (§5.1). The group is a pad like the keypad:
       never a drag region, never scrolled (§10.3, §15). */
    denoms: function (lay) {
      var cell = function (d, cls) {
        return '<button type="button" class="dk ' + cls + ' k-heading k-num" data-denom="' + d + '" aria-label="' +
          esc(t('pay.denom_a11y', { amount: money(d) })) + '">' + numHtml(String(d)) + '</button>';
      };
      return '<div class="dn' + (lay === 'compact-short' ? ' dns' : '') + '" data-k-group data-k-pad role="group" aria-label="' + esc(t('pay.denoms')) + '">' +
        '<div class="dr dn4">' + PAY_NOTES.map(function (d) { return cell(d, 'db'); }).join('') + '</div>' +
        '<div class="dr dc4">' + PAY_COINS.map(function (d) { return cell(d, 'dc'); }).join('') +
        '<button type="button" class="dk du" data-denom-undo aria-label="' + esc(t('pay.denom_undo')) + '">' + icon('backspace', 24, 'k-mir') + '</button>' +
        '</div></div>';
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
        var keys = this.__tipEntry || this.__pad === 'keys';
        var pad = keys ? C.keypad.render({ form: form, short: lay === 'compact-short', label: t('pay.cash') }) : this.denoms(lay);
        if (!this.__tipEntry) chips = '<div class="cr">' + chips +
          C.button.render({ variant: 'icon', icon: keys ? 'payments' : 'dialpad', label: t(keys ? 'pay.pad.denoms' : 'pay.pad.keys'), id: 'pd', attrs: ' data-w="pad"' }) + '</div>';
        lower = '<div class="cash"><div class="disp" aria-live="polite"></div>' + chips + pad +
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
        (p.noTip ? '' : '<button type="button" class="row k-body" data-tip aria-haspopup="dialog"><span>' + th('pay.tip') + '</span><span class="k-ink2 tv">' + esc(tipVal) + '</span>' + icon('chevron_right', 20, 'k-mir k-ink2') + '</button>') +
        (this.__tipEntry ? '' : '<div class="ms" role="radiogroup" aria-label="' + esc(t('pay.title', { bill: p.bill || '' })) + '">' + methods + '</div>');
      /* The paid moment's line (§10.26): .pay.note, set by the host from the
         till's own save — sync.saved_here, or sync.screen_only in warning ink. */
      var paid = st === 'paid' ? '<p class="k-title paid" role="status">' + icon('task_alt', 32) + th('pay.paid') + '</p>' +
        (p.note ? '<p class="k-foot nt' + (p.noteTone === 'warning' ? ' wn' : ' k-ink2') + '">' + (p.noteTone === 'warning' ? icon('warning', 16) : '') + esc(p.note) + '</p>' : '') : '';
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
      '.cr{display:flex;align-items:center;gap:8px;min-height:44px}.cr .k-chips{flex:1;min-width:0}' +
      '.dn{display:flex;flex-direction:column;gap:8px;direction:ltr;touch-action:manipulation;-webkit-user-select:none;user-select:none}' +
      '.dr{display:grid;gap:8px}.dn4{grid-template-columns:repeat(2,minmax(0,1fr))}.dc4{grid-template-columns:repeat(4,minmax(0,1fr))}' +
      '.dk{display:flex;align-items:center;justify-content:center;height:64px;color:var(--k-ink-1);background-color:var(--k-surface-2);border-radius:var(--k-r-2)}' +
      '.dk:active{background-color:var(--k-surface-3)}.dk:focus-visible{box-shadow:inset 0 0 0 var(--k-focus-w) var(--k-focus)}' +
      /* the two frames of a banknote, and a coin's rim: shape, not colour */
      '.db{box-shadow:inset 0 0 0 1px var(--k-line-strong),inset 0 0 0 6px var(--k-surface-2),inset 0 0 0 7px var(--k-line)}' +
      '.dc{width:64px;justify-self:center;border-radius:999px;box-shadow:inset 0 0 0 1px var(--k-line-strong),inset 0 0 0 4px var(--k-surface-2),inset 0 0 0 5px var(--k-line)}' +
      '.du{background-color:transparent;color:var(--k-ink-2)}' +
      '.dns .dk{height:56px}.dns .dc{width:56px}' +
      '.done .ms,.done .cash,.done .card{visibility:hidden}.paid{display:flex;align-items:center;gap:8px;color:var(--k-accent-ink);margin:0}' +
      '.nt{display:flex;align-items:center;gap:6px;margin:0;max-width:272px}.nt.wn{color:var(--k-warning);font-weight:var(--k-fw-footnote-strong)}'
  });

  /* ── <k-cash-count mode tolerance> .count {opening, cashSales, refundsCash,
     cashTips, cashIn, cashOut, lastFloat} .cardKiwi ──────────────────────────
     cardKiwi, when the host sets it on a close: after the cash, a second step
     asks the card total printed on the terminal's Z, beside Kiwi's own (owner,
     2026-10-14). Outside tolerance a reason is required (GAP_REASONS). */
  var GAP_REASONS = [['counting', 'count.reason.counting'], ['change', 'count.reason.change'], ['unrecorded', 'count.reason.unrecorded'], ['other', 'reason.other']];
  var NOTES = [200, 100, 50, 20], COINS = [10, 5, 2, 1, 0.5, 0.2, 0.1];
  var KCashCount = K.make({
    setup: function () {
      var self = this, R = this.shadowRoot;
      this.__n = {}; this.__sel = null; this.__any = false; this.__reason = null; this.__stage = 'cash'; this.__card = '';
      /* An opening types its total on the keypad (owner, 2026-10-16): counting
         the drawer note by note is the second way in, not the first. */
      this.__amt = ''; this.__detail = false;
      K.tap(R, '[data-denom]', function (el) {
        self.__sel = el.getAttribute('data-denom');
        self.__typed = false;
        self.render();
        var b = self.$('[data-denom="' + self.__sel + '"]'); if (b) b.focus();
      });
      C.keypad.bind(R, function (id, key) {
        if (self.__stage === 'card') {
          var rc = C.keypad.input(self.__card, key, { decimals: 2, maxInt: 7 });
          if (!rc.ok && key !== 'del') return;
          self.__card = rc.text; self.render(); return;
        }
        if (self.totalMode()) {
          var ra = C.keypad.input(self.__amt, key, { decimals: 2, maxInt: 7 });
          if (!ra.ok && key !== 'del') return;
          self.__amt = ra.text;
          self.__total = ra.text === '' ? null : C.keypad.value(ra.text);
          self.__any = ra.text !== '';
          self.render(); return;
        }
        var all = NOTES.concat(COINS).map(String);
        if (self.__sel == null) self.__sel = all[0];
        if (key === 'next') { var i = all.indexOf(self.__sel); self.__sel = all[Math.min(all.length - 1, i + 1)]; self.__typed = false; self.render(); return; }
        var cur = self.__typed ? String(self.__n[self.__sel] || '') : '';
        var res = C.keypad.input(cur, key, { decimals: 0, maxInt: 4 });
        if (!res.ok && key !== 'del') return;
        self.__typed = true;
        self.__total = null;                 /* a row typed after "Last float" counts the rows */
        self.__n[self.__sel] = res.text ? parseInt(res.text, 10) : 0;
        self.__any = true;
        self.render();
      });
      C.chip.bind(R, function (v, g, mode, el) {
        if (el && el.closest && el.closest('[data-reasons]')) { self.__reason = v; self.render(); return; }
        if (v === 'same') { self.__total = self.c().lastFloat; self.__amt = String(self.__total); self.__any = true; self.render(); }
      });
      C.button.bind(R, function (el, g) {
        if (el.getAttribute('data-w') === 'commit') {
          var closing = self.str('mode', 'close') !== 'open';
          if (closing && self.__stage === 'cash' && self.cardKiwi != null) { self.__stage = 'card'; self.render(); return; }
          self.__gid = g;
          self.emit(closing ? 'close' : 'open', null, { counts: self.__n, counted: self.counted(), difference: self.diff(),
            reason: self.outside() ? self.__reason : null, cardTotal: self.__stage === 'card' ? C.keypad.value(self.__card) : null, gestureId: g });
        } else if (el.getAttribute('data-w') === 'card-back') { self.__stage = 'cash'; self.render();
        } else if (el.getAttribute('data-w') === 'enter-total') {
          /* On an opening the kit holds both ways itself; on a close the host
             still opens its shipped total box. */
          if (self.str('mode', 'close') === 'open') {
            /* What was counted comes back as the typed figure, editable. */
            var c = self.counted();
            self.__amt = self.__any && c ? String(c) : '';
            self.__total = self.__amt === '' ? null : c;
            self.__detail = false; self.render(); return;
          }
          self.emit('enter-total', null, { gestureId: g });
        } else if (el.getAttribute('data-w') === 'by-denom') { self.__detail = true; self.render(); }
      }, '[data-w]');
    },
    c: function () { return this.__count || (this.__count = {}); },
    /* The opening's first screen: one amount on the keypad, no rows. */
    totalMode: function () { return this.str('mode', 'close') === 'open' && !this.__detail; },
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
    tol: function () { return Number(this.str('tolerance', '20')) || 20; },
    /* A close whose difference is beyond the tolerance needs its reason. */
    outside: function () { return this.str('mode', 'close') !== 'open' && this.__any && Math.abs(this.diff()) > this.tol(); },
    /* One Paid on the frame the close is committed; Commit for the opening
       float's local write (§15.3). */
    committed: function () {
      var open = this.str('mode', 'close') === 'open';
      K.haptic(open ? 'Commit' : 'Paid', this.__gid || K.gid('count'), { trigger: 'local-record' });
    },
    render: function () {
      var self = this, s = this.c(), open = this.str('mode', 'close') === 'open', f = F();
      var tol = this.tol();
      if (this.__stage === 'card') { this.renderCard(); return; }
      if (this.totalMode()) { this.renderTotal(); return; }
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
        '<div class="sl ex"' + (this.__any ? '' : ' style="visibility:hidden"') + '><span class="k-body">' + th('count.expected') + '</span><span class="k-heading k-num" data-k-total>' + numHtml(money(this.expected())) + '</span></div>' +
        /* Counted is read against Expected, never added into it: no data-k-part. */
        (this.__any ? '<div class="sl"><span class="k-body k-ink2">' + th('count.counted') + '</span><span class="k-body k-num">' + numHtml(money(this.counted())) + '</span></div>' : '');
      var outside = this.outside(), needReason = outside && !this.__reason;
      var canCommit = this.__any && !needReason;
      var why = !this.__any && !open ? t('count.close_hint') : (needReason ? t('count.reason_hint') : '');
      var reasons = outside ? '<div class="rs" data-reasons><p class="k-callout rq">' + th('count.reason') + '</p>' +
        C.chip.group({ options: GAP_REASONS.map(function (r) { return { value: r[0], label: t(r[1]) }; }), value: this.__reason, label: t('count.reason') }) + '</div>' : '';
      this.shadowRoot.innerHTML = '<div class="cc"><div class="col">' +
        '<h2 class="k-heading ti">' + th('count.title') + '</h2>' +
        '<div class="fig" data-tone="' + tone + '"><span class="k-foot k-ink2">' + esc(figLabel) + '</span><span class="k-display k-num" data-key-figure>' + numHtml(fig) + '</span></div>' + reasons +
        (open && s.lastFloat ? C.chip.group({ options: [{ value: 'same', label: t('count.same_as_last', { amount: money(s.lastFloat) }), ariaLabel: t('count.same_as_last_a11y', { amount: money(s.lastFloat) }) }], mode: 'multi' }) : '') +
        '<div data-k-group><p class="k-foot k-ink2 sh">' + th('count.notes') + '</p><ul class="dl">' + NOTES.map(row).join('') + '</ul>' +
        '<p class="k-foot k-ink2 sh">' + th('count.coins') + '</p><ul class="dl">' + COINS.map(row).join('') + '</ul></div>' +
        '<div class="alt">' + C.button.render({ variant: 'plain', label: t(open ? 'count.back_to_total' : 'count.enter_total'), id: 'et', attrs: ' data-w="enter-total"' }) + '</div>' +
        '<div class="sum">' + summary + '</div></div>' +
        '<div class="kp">' + C.keypad.render({ next: true, label: t('count.title') }) +
        C.button.render({ variant: 'primary', size: 'L', full: true, id: 'cm', attrs: ' data-w="commit"', label: t(open ? 'count.open' : 'count.close'), disabled: !canCommit, reason: !canCommit ? why : '' }) +
        '</div></div>';
    },
    /* The opening float, typed (owner, 2026-10-16). The drawer's amount is one
       figure on the keypad; the last float is a chip; counting note by note is
       the second way in, one tap away and unchanged. */
    renderTotal: function () {
      var s = this.c(), canOpen = this.__any;
      this.shadowRoot.innerHTML = '<div class="cc cc--t"><div class="col">' +
        '<h2 class="k-heading ti">' + th('count.open_title') + '</h2>' +
        '<div class="fig"><span class="k-foot k-ink2">' + th('count.opening_float') + '</span>' +
        '<span class="k-display k-num" data-key-figure>' + numHtml(money(this.counted())) + '</span></div>' +
        '<p class="k-body k-ink2 hint">' + th('count.float_hint') + '</p>' +
        (s.lastFloat ? C.chip.group({ options: [{ value: 'same', label: t('count.same_as_last', { amount: money(s.lastFloat) }), ariaLabel: t('count.same_as_last_a11y', { amount: money(s.lastFloat) }) }], mode: 'multi' }) : '') +
        '<div class="alt">' + C.button.render({ variant: 'plain', label: t('count.by_denomination'), id: 'bd', attrs: ' data-w="by-denom"' }) + '</div>' +
        '</div><div class="kp">' + C.keypad.render({ label: t('count.opening_float') }) +
        C.button.render({ variant: 'primary', size: 'L', full: true, id: 'cm', attrs: ' data-w="commit"',
          label: t('count.open'), disabled: !canOpen, reason: !canOpen ? t('count.open_hint') : '' }) +
        '</div></div>';
    },
    /* The card step: the terminal's Z total typed beside Kiwi's own. */
    renderCard: function () {
      var f = F(), typed = C.keypad.value(this.__card), kiwi = Number(this.cardKiwi) || 0, has = this.__card !== '';
      var cd = fromCents(cents(typed) - cents(kiwi));
      this.shadowRoot.innerHTML = '<div class="cc"><div class="col">' +
        '<div class="hd">' + C.button.render({ variant: 'icon', icon: 'chevron_left', label: t('action.back'), id: 'cb', attrs: ' data-w="card-back"' }) +
        '<h2 class="k-heading ti">' + th('count.card_title') + '</h2></div>' +
        '<div class="fig"><span class="k-foot k-ink2">' + th('count.card_title') + '</span><span class="k-display k-num" data-key-figure>' + numHtml(money(typed)) + '</span></div>' +
        '<p class="k-body">' + th('count.card_kiwi', { amount: money(kiwi) }) + '</p>' +
        (has ? '<p class="k-body"><span class="k-ink2">' + th('count.difference') + '</span> <span class="k-num">' + numHtml(f ? f.signedMoney(cd, 2) : String(cd)) + '</span></p>' : '') +
        '<p class="k-foot k-ink2">' + th('count.card_hint') + '</p></div>' +
        '<div class="kp">' + C.keypad.render({ label: t('count.card_title') }) +
        C.button.render({ variant: 'primary', size: 'L', full: true, id: 'cm', attrs: ' data-w="commit"', label: t('count.close'), disabled: !has, reason: !has ? t('count.card_hint') : '' }) +
        '</div></div>';
    }
  });
  K.define('k-cash-count', KCashCount, {
    attrs: ['mode', 'tolerance'], props: ['count', 'cardKiwi'],
    css: C.button.css + C.chip.css + C.keypad.css + ':host{display:block}' +
      '.cc{display:grid;grid-template-columns:minmax(0,360px) 288px;gap:24px}' +
      '@media (max-width:719px){.cc{grid-template-columns:minmax(0,1fr)}}' +
      '.ti{margin:0 0 8px}.fig{display:flex;flex-direction:column;margin-block-end:12px}' +
      '.hd{display:flex;align-items:center;gap:4px;margin-inline-start:-12px}.hd .ti{margin:0}.rs{margin-block-end:12px}.rq{margin:0 0 8px}' +
      '.fig[data-tone="warning"] .k-display{color:var(--k-warning)}.fig[data-tone="danger"] .k-display{color:var(--k-danger)}' +
      '.sh{margin:12px 0 4px;font-weight:var(--k-fw-footnote-strong)}.dl{list-style:none;margin:0;padding:0}' +
      '.dr{display:flex;align-items:center;gap:8px;min-height:56px;padding-inline:16px;box-shadow:inset 0 -1px 0 var(--k-line)}' +
      '.dr .dl{flex:1;min-width:0}.cnt{width:72px;min-height:44px;border-radius:var(--k-r-1);background-color:var(--k-surface-2);font-weight:var(--k-fw-body-strong)}' +
      '.dr.on .cnt{background-color:var(--k-select);box-shadow:inset 0 0 0 var(--k-select-edge-w) var(--k-accent)}' +
      '.sb{width:96px;text-align:end}' +
      '.sum{position:sticky;bottom:0;padding-block:12px;background-color:var(--k-surface-1);box-shadow:inset 0 1px 0 var(--k-line)}' +
      '.sl{display:flex;justify-content:space-between;gap:12px;min-height:28px;align-items:baseline}.sub{margin:0 0 4px}' +
      '.kp{display:flex;flex-direction:column;gap:16px;align-self:start;position:sticky;top:0}' +
      /* The typed opening: no rows, so the column breathes and the keypad leads. */
      '.cc--t{align-items:start}.cc--t .fig{margin-block-end:8px}.hint{margin:0 0 16px;max-width:30ch}' +
      '.alt{margin-block-start:16px;margin-inline-start:-4px}.cc--t .alt{margin-block-start:24px}' +
      /* The wrapper is a column flex box: without this the plain button
         stretches and its label reads as centred. */
      '.alt .k-btnw{align-items:flex-start}'
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
