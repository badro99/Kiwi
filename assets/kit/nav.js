/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · assets/kit/nav.js · selection and navigation (spec §10.6, §10.19,
 * §10.20, §14.3).
 *
 *   <k-segmented>   filters and modes, a radiogroup; the lens; 2 to 5
 *                   segments, more becomes a scrolling track with snap
 *   <k-tabbar>      the phone tab capsule (<nav>, links, aria-current)
 *   <k-rail>        the till rail, 88 wide
 *   <k-sidebar>     the iPad and desktop sidebar, collapsible to a 72 rail
 *   <k-date-button> the resolved range, opening the picker
 *   <k-range-picker> presets, a month grid, the business-day note
 *
 * One selection style everywhere: the lens of assets/kit/lens.js, painted
 * --k-select with a line-strong edge. Choose fires once per change, on the
 * confirmed tap (§15.1); choosing the selected option fires nothing.
 * ═══════════════════════════════════════════════════════════════════════════ */
(function (root) {
  'use strict';
  var K = root.KiwiKit;
  if (!K) return;
  var esc = K.esc, t = K.t, th = K.th, numHtml = K.numHtml, icon = K.icon;

  function lensApi() { return root.KiwiLens && typeof root.KiwiLens.attach === 'function' ? root.KiwiLens : null; }
  /* Fill and 1 px edge, as §10.7 and the chip draw it. It also carried
     var(--k-shadow-1), which is `none` in dark: `inset …, none` is not a valid
     shadow, so the browser dropped the whole declaration and the dark lens
     lost its edge (3.69:1 in the spec, nothing on screen; 2026-10-24). */
  var LENS_PAINT = 'background-color:var(--k-select);box-shadow:inset 0 0 0 var(--k-select-edge-w) var(--k-line-strong)';

  /* ── <k-segmented size value label scroll> + .options ─────────────────────
     The host is the full hit height (44 compact and default, 56 kitchen) and
     the track's layout box; each segment button is 100 % of it, so its hit
     rectangle is the target by construction. The visible track is the host's
     ::before, inset; the lens and labels are inset by the same amount plus
     the 4 px track padding. contain: layout style, never paint (§10.6). */
  var SEG_INSET = { compact: 8, 'default': 4, kitchen: 4 };
  var KSegmented = K.make({
    setup: function () {
      var self = this;
      K.tap(this.shadowRoot, '.sg', function (el, e, gid) {
        if (self.__dragged) { self.__dragged = false; return; }
        self.choose(el.getAttribute('data-v'), gid);
      });
      this.shadowRoot.addEventListener('keydown', function (e) { self.key(e); });
      this.bindDrag();
    },
    get value() { return this.str('value'); },
    set value(v) { this.setAttribute('value', v); },
    opts: function () { return this.options || []; },
    choose: function (v, gid) {
      var o = this.opts().filter(function (x) { return x.value === v; })[0];
      if (!o || o.disabled || v === this.value) return;
      K.haptic('Choose', gid || K.gid('seg'), { trigger: 'tap' });
      this.setAttribute('value', v);
      this.emit('select', null, { value: v, gestureId: gid });
    },
    key: function (e) {
      var keys = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };
      var d = keys[e.key];
      if (!d) return;
      if (/Arrow(Left|Right)/.test(e.key) && this.hasAttribute('data-k-rtl')) d = -d;
      var list = this.opts().filter(function (o) { return !o.disabled; });
      var i = list.map(function (o) { return o.value; }).indexOf(this.value);
      var next = list[(i + d + list.length) % list.length];
      if (!next) return;
      e.preventDefault();
      this.choose(next.value, K.gid('key'));
      var b = this.$('.sg[data-v="' + String(next.value).replace(/"/g, '') + '"]');
      if (b) b.focus();
    },
    attr: function (name) {
      if (name === 'value' && this.$('.sg')) this.sync(); else this.render();
    },
    sync: function () {
      var v = this.value, self = this;
      var idx = -1;
      this.$$('.sg').forEach(function (b, i) {
        var on = b.getAttribute('data-v') === v;
        if (on) idx = i;
        b.setAttribute('aria-checked', on ? 'true' : 'false');
        b.tabIndex = on || (v === '' && i === 0) ? 0 : -1;
        if (b.getAttribute('aria-disabled') === 'true') b.tabIndex = -1;
      });
      var L = lensApi();
      if (L && this.__track) L.move(this.__track, idx);
      var sel = this.$('.sg[aria-checked="true"]');
      if (sel && this.flag('data-scroll') && sel.scrollIntoView) {
        try { sel.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: K.reduced() ? 'auto' : 'smooth' }); } catch (_) {}
      }
      return self;
    },
    render: function () {
      var size = this.str('size', 'default');
      var opts = this.opts();
      var v = this.value;
      var labelStep = size === 'compact' ? 'k-foot-s' : 'k-callout-s';
      var scroll = opts.length > 5 || this.flag('scroll');
      this.toggleAttribute('data-scroll', scroll);
      var html = '<div class="trk" role="radiogroup"' + (this.str('label') ? ' aria-label="' + esc(this.str('label')) + '"' : '') + '>' +
        '<span class="lens" aria-hidden="true"></span>' +
        opts.map(function (o, i) {
          var on = o.value === v;
          return '<button type="button" class="sg k-in ' + labelStep + '" role="radio" data-v="' + esc(o.value) + '" aria-checked="' + (on ? 'true' : 'false') + '"' +
            ' tabindex="' + (on || (!v && i === 0) ? '0' : '-1') + '"' + (o.disabled ? ' aria-disabled="true" tabindex="-1"' : '') + '>' +
            '<span class="lb">' + esc(o.label) + (o.count != null ? ' <span class="k-num">' + esc(o.count) + '</span>' : '') + '</span>' +
            (o.disabled && o.reason ? '<span class="k-vh">' + esc(o.reason) + '</span>' : '') + '</button>';
        }).join('') + '</div>';
      this.shadowRoot.innerHTML = html;
      this.__track = this.$('.trk');
      var L = lensApi();
      if (L) {
        var self = this, inset = SEG_INSET[size] || 4;
        L.attach(this.__track, {
          lens: this.$('.lens'), manual: true,
          items: function () { return self.$$('.sg'); },
          index: function (list) { for (var i = 0; i < list.length; i++) if (list[i].getAttribute('aria-checked') === 'true') return i; return -1; },
          insetY: inset, insetX: 0
        });
      }
      this.sync();
    },
    /* A drag across the control: the lens tracks the finger 1:1 with no
       animation, and on release settles on the nearest option (§14.3). */
    bindDrag: function () {
      var self = this, d = null;
      this.shadowRoot.addEventListener('pointerdown', function (e) {
        var b = e.target.closest && e.target.closest('.sg[aria-checked="true"]');
        if (!b || e.pointerType === 'mouse' && e.button !== 0) { d = null; return; }
        d = { x: e.clientX, lens: self.$('.lens'), moved: false, start: b.offsetLeft };
      });
      this.shadowRoot.addEventListener('pointermove', function (e) {
        if (!d) return;
        var dx = e.clientX - d.x;
        if (!d.moved && Math.abs(dx) < 10) return;
        d.moved = true;
        d.lens.style.transition = 'none';
        var m = /translate\(([-\d.]+)px,\s*([-\d.]+)px\)/.exec(d.lens.style.transform || '');
        var y = m ? m[2] : 0;
        d.lens.style.transform = 'translate(' + (d.start + dx) + 'px,' + y + 'px)';
      });
      function end(e) {
        if (!d) return;
        var was = d; d = null;
        if (!was.moved) return;
        self.__dragged = true;
        var best = null, bestDist = Infinity, x = e.clientX;
        self.$$('.sg').forEach(function (b) {
          if (b.getAttribute('aria-disabled') === 'true') return;
          var r = b.getBoundingClientRect();
          var dist = Math.abs(r.left + r.width / 2 - x);
          if (dist < bestDist) { bestDist = dist; best = b; }
        });
        var L = lensApi();
        if (best && best.getAttribute('data-v') !== self.value) self.choose(best.getAttribute('data-v'), K.gid('drag'));
        else if (L) { var list = self.$$('.sg'); L.move(self.__track, list.indexOf(best), { phase: 'settle' }); }
        setTimeout(function () { self.__dragged = false; }, 0);
      }
      this.shadowRoot.addEventListener('pointerup', end);
      this.shadowRoot.addEventListener('pointercancel', function () { d = null; });
    }
  });
  K.define('k-segmented', KSegmented, {
    attrs: ['value', 'size', 'label', 'scroll'],
    props: ['options'],
    css: ':host{display:block;position:relative;contain:layout style;min-height:44px}' +
      ':host([size="kitchen"]){min-height:56px}' +
      ':host::before{content:"";position:absolute;inset:0;border-radius:999px;background-color:var(--k-surface-2);pointer-events:none}' +
      ':host([size="compact"])::before{inset-block:4px}' +
      '.trk{position:relative;display:flex;height:44px;padding-inline:4px}' +
      ':host([size="kitchen"]) .trk{height:56px}' +
      ':host([data-scroll]){overflow-x:auto;overflow-y:hidden;scroll-snap-type:x mandatory;scrollbar-width:none;' +
      '-webkit-mask-image:linear-gradient(to right,transparent,var(--k-ink-1) 32px,var(--k-ink-1) calc(100% - 32px),transparent);' +
      'mask-image:linear-gradient(to right,transparent,var(--k-ink-1) 32px,var(--k-ink-1) calc(100% - 32px),transparent)}' +
      ':host([data-scroll])::-webkit-scrollbar{display:none}' +
      ':host([data-scroll]) .trk{width:max-content;min-width:100%}' +
      ':host([data-scroll])::before{width:auto}' +
      '.lens{border-radius:999px;' + LENS_PAINT + ';opacity:0;z-index:0}' +
      ':host([size="kitchen"]) .lens{border-radius:var(--k-r-3)}' +
      '.sg{position:relative;z-index:1;flex:1 1 auto;min-width:44px;height:100%;padding-inline:12px;color:var(--k-ink-2);white-space:nowrap;' +
      'scroll-snap-align:center;border-radius:999px;transition:color var(--k-dur-2) var(--k-glide)}' +
      '.sg:active{color:var(--k-ink-1);transition-duration:var(--k-dur-1)}' +
      '.sg[aria-checked="true"]{color:var(--k-ink-1)}' +
      '.sg[aria-disabled="true"]{color:var(--k-ink-3);cursor:default}' +
      '.sg:focus-visible{box-shadow:inset 0 0 0 var(--k-focus-w) var(--k-focus)}'
  });

  /* ── shared nav item markup (tabbar, rail, sidebar) ───────────────────── */
  function badgeHtml(n, tone) {
    if (!n) return '';
    var shown = n > 99 ? '99+' : String(n);
    return '<span class="bd bd--' + (tone || 'danger') + ' k-foot-s k-num" aria-hidden="true">' + esc(shown) + '</span>';
  }
  var BADGE_CSS = '.bd{display:inline-flex;align-items:center;justify-content:center;min-width:20px;min-height:20px;padding-inline:5px;border-radius:999px;' +
    'background-color:var(--k-danger-solid);color:var(--k-on-danger)}.bd--warning{background-color:var(--k-warning-solid);color:var(--k-on-warning)}';

  function navBind(el) {
    K.tap(el.shadowRoot, '.it', function (a, e, gid) {
      /* The press that showed the label HUD is not also a tap. */
      if (el.__hudShown) { el.__hudShown = false; e.preventDefault(); return; }
      var id = a.getAttribute('data-id');
      if (id === el.value) { if (a.tagName === 'A') e.preventDefault(); return; }
      K.haptic('Choose', gid, { trigger: 'tap' });
      if (!el.flag('links')) e.preventDefault();
      el.setAttribute('value', id);
      el.emit('select', id, { gestureId: gid });
    });
  }
  function navAttach(el, axis, itemSel) {
    var L = lensApi();
    var trk = el.$('.trk');
    if (!L || !trk) return;
    L.attach(trk, {
      lens: el.$('.lens'), manual: true, axis: axis,
      items: function () { return el.$$(itemSel); },
      index: function (list) { for (var i = 0; i < list.length; i++) if (list[i].closest('[aria-current="page"]')) return i; return -1; }
    });
    var list = el.$$(itemSel), idx = -1;
    list.forEach(function (x, i) { if (x.closest('[aria-current="page"]')) idx = i; });
    L.move(trk, idx, { phase: el.__navPlaced ? undefined : 'instant' });
    el.__navPlaced = true;
  }
  function navLabelFor(it) {
    if (it.a11y) return it.a11y;
    return it.badge ? t('badge.new', { label: it.label, n: it.badge }) : it.label;
  }
  function navItem(it, cur, inner) {
    var tag = it.href ? 'a' : 'button';
    return '<' + tag + (it.href ? ' href="' + esc(it.href) + '"' : ' type="button"') + ' class="it k-in" data-id="' + esc(it.id) + '"' +
      (cur ? ' aria-current="page"' : '') + (it.badge || it.a11y ? ' aria-label="' + esc(navLabelFor(it)) + '"' : '') + '>' + inner + '</' + tag + '>';
  }

  /* ── <k-tabbar value links> + .items (§10.20) ─────────────────────────────
     An item may carry a dot instead of a count (it.dot = danger | warning |
     neutral): the phone till's sync state on More (§10.26 item 3). Its words
     go in it.a11y, which becomes the item's accessible name. */
  /* Labels when they fit, else icon only (§6.4, §10.20): every item needs
     max(44, label + 16), measured with every label at the selected weight so
     the layout never changes with the selection; when the sum is wider than
     the track, every item is icon only at once, its label kept for screen
     readers, and a 500 ms still press (§14.7) shows the label HUD. */
  var HUD_MS = 500;
  var KTabbar = K.make({
    setup: function () {
      var self = this, timer = 0, at = null;
      navBind(this);
      function stop() { clearTimeout(timer); timer = 0; at = null; var h = self.$('.hud'); if (h) h.removeAttribute('data-shown'); }
      this.shadowRoot.addEventListener('pointerdown', function (e) {
        stop();
        var a = self.flag('data-icons') && e.target.closest ? e.target.closest('.it') : null;
        if (!a) return;
        at = { x: e.clientX, y: e.clientY };
        timer = setTimeout(function () { timer = 0; self.hud(a); }, HUD_MS);
      });
      this.shadowRoot.addEventListener('pointermove', function (e) {
        if (at && timer && (Math.abs(e.clientX - at.x) > 10 || Math.abs(e.clientY - at.y) > 10)) stop();
      });
      ['pointerup', 'pointercancel', 'pointerleave'].forEach(function (n) { self.shadowRoot.addEventListener(n, stop); });
      /* A long press on touch opens no context menu over the HUD. */
      this.shadowRoot.addEventListener('contextmenu', function (e) { if (self.flag('data-icons')) e.preventDefault(); });
    },
    connected: function () {
      var self = this;
      if (!this.__ro && root.ResizeObserver) { this.__ro = new root.ResizeObserver(function () { self.fit(); }); this.__ro.observe(this); }
      if (root.document.fonts && root.document.fonts.ready) root.document.fonts.ready.then(function () { self.fit(); });
    },
    disconnected: function () { if (this.__ro) { this.__ro.disconnect(); this.__ro = null; } },
    hud: function (a) {
      var h = this.$('.hud'), cap = this.$('.cap');
      if (!h || !cap) return;
      var lb = a.querySelector('.lb'), ic = a.getAttribute('data-icon') || '';
      h.innerHTML = icon(ic, 40) + '<span class="k-heading">' + esc(lb ? lb.textContent : '') + '</span>';
      var r = a.getBoundingClientRect(), c = cap.getBoundingClientRect();
      h.style.setProperty('--x', Math.round(r.left + r.width / 2 - c.left) + 'px');
      h.setAttribute('data-shown', '');
      this.__hudShown = true;
    },
    fit: function () {
      var trk = this.$('.trk');
      if (!trk || !trk.clientWidth) return;
      this.removeAttribute('data-icons');
      this.setAttribute('data-k-measure', '');
      var need = 0;
      this.$$('.it .lb').forEach(function (lb) { need += Math.max(44, Math.ceil(lb.getBoundingClientRect().width) + 16); });
      this.removeAttribute('data-k-measure');
      if (need > trk.clientWidth) this.setAttribute('data-icons', '');
      var L = lensApi(), list = this.$$('.it'), idx = -1;
      list.forEach(function (x, i) { if (x.getAttribute('aria-current') === 'page') idx = i; });
      if (L) L.move(trk, idx, { phase: 'instant' });
    },
    get value() { return this.str('value'); },
    attr: function () { this.render(); },
    render: function () {
      var v = this.value;
      this.shadowRoot.innerHTML = '<nav class="cap"' + (this.str('label') ? ' aria-label="' + esc(this.str('label')) + '"' : '') + '><div class="trk">' +
        '<span class="lens" aria-hidden="true"></span>' +
        (this.items || []).map(function (it) {
          var cur = it.id === v;
          var dot = it.dot && !it.badge ? '<span class="dt dt--' + esc(it.dot) + '" data-dot aria-hidden="true"></span>' : '';
          /* The label comes first in the markup and the icon is drawn above
             it (order -1): read in order, the item says "Orders 3", which its
             name "Orders, 3 new" contains (WCAG 2.5.3, 2026-10-25). */
          return navItem(it, cur, '<span class="k-foot lb">' + esc(it.label) + '</span> <span class="pill">' + icon(it.icon, 24, 'ic') + badgeHtml(it.badge, it.badgeTone) + dot + '</span>')
            .replace(' class="it k-in"', ' class="it k-in" data-icon="' + esc(it.icon) + '"');
        }).join('') + '</div><div class="hud" aria-hidden="true"></div></nav>';
      navAttach(this, 'x', '.it');
      this.fit();
    }
  });
  K.define('k-tabbar', KTabbar, {
    attrs: ['value', 'label'], props: ['items'],
    css: BADGE_CSS +
      '.cap{min-height:62px;border-radius:31px;background-color:var(--k-chrome);-webkit-backdrop-filter:var(--k-chrome-filter);backdrop-filter:var(--k-chrome-filter);' +
      'box-shadow:inset 0 0 0 1px var(--k-chrome-edge),var(--k-shadow-2);padding:4px}' +
      '.trk{position:relative;display:flex;min-height:54px}' +
      '.lens{border-radius:27px;' + LENS_PAINT + ';opacity:0}' +
      '.it{position:relative;z-index:1;flex:1 0 auto;min-width:44px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;' +
      'padding-inline:8px;color:var(--k-ink-2);border-radius:27px}' +
      '.it[aria-current="page"]{color:var(--k-ink-1)}.it[aria-current="page"] .ic{color:var(--k-accent-ink)}' +
      '.it[aria-current="page"] .lb{font-weight:var(--k-fw-footnote-strong)}' +
      '.pill{position:relative;display:inline-flex;order:-1}.bd{position:absolute;top:-6px;inset-inline-start:14px}' +
      '.dt{position:absolute;top:-2px;inset-inline-start:18px;width:10px;height:10px;border-radius:50%;box-shadow:0 0 0 2px var(--k-surface-1);background-color:var(--k-ink-2)}' +
      '.dt--danger{background-color:var(--k-danger-solid)}.dt--warning{background-color:var(--k-warning-solid)}' +
      '.lb{white-space:nowrap}' +
      ':host([data-k-measure]) .lb{font-weight:var(--k-fw-footnote-strong)}' +
      ':host([data-icons]) .lb{position:absolute;width:1px;height:1px;margin:-1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap}' +
      ':host([data-icons]) .it{-webkit-touch-callout:none;-webkit-user-select:none;user-select:none}' +
      '.cap{position:relative}' +
      '.hud{position:absolute;bottom:calc(100% + 8px);left:var(--x,50%);transform:translateX(-50%);display:none;flex-direction:column;align-items:center;gap:4px;' +
      'min-width:96px;padding:12px 16px;border-radius:var(--k-r-3);background-color:var(--k-inverse);color:var(--k-on-inverse);box-shadow:var(--k-shadow-2);pointer-events:none;white-space:nowrap}' +
      '.hud[data-shown]{display:flex}' +
      '.it:focus-visible{box-shadow:inset 0 0 0 var(--k-focus-w) var(--k-focus)}'
  });

  /* ── <k-rail value> + .items, .footer (§10.20 till rail) ───────────────────
     88 wide on surface-2; items 72 tall, icon 24 over a Footnote label; the
     lens is 56 tall, radius 12, as wide as the larger of 64 and the label
     plus 16 (at most 84), centred. Bottom slot: the sync indicator and the cashier. */
  var KRail = K.make({
    setup: function () {
      var self = this;
      navBind(this);
      K.tap(this.shadowRoot, '[data-r]', function (el, e, gid) {
        self.emit(el.getAttribute('data-r'), null, { gestureId: gid, anchor: el });
      });
    },
    get value() { return this.str('value'); },
    attr: function () { this.render(); },
    render: function () {
      var v = this.value, f = this.footer || {};
      var sync = f.sync ? '<button type="button" class="sy k-in" data-r="sync" aria-label="' + esc(f.sync.label || '') + '">' +
        icon(f.sync.icon || 'wifi_off', 24, f.sync.tone ? 'tn-' + f.sync.tone : '') + badgeHtml(f.sync.badge, f.sync.badgeTone) + '</button>' : '';
      /* Named by its text: an aria-label repeating the name made a reader
         that joins the visible text ("KA Karim Alaoui") find it missing. */
      var cashier = f.cashier ? '<button type="button" class="ca k-in" data-r="cashier">' +
        '<span class="av k-foot-s" aria-hidden="true">' + esc(String(f.cashier).trim().split(/\s+/).map(function (w) { return w.charAt(0); }).slice(0, 2).join('').toUpperCase()) + '</span>' +
        '<span class="k-foot cn">' + esc(f.cashier) + '</span></button>' : '';
      this.shadowRoot.innerHTML = '<nav class="rail"' + (this.str('label') ? ' aria-label="' + esc(this.str('label')) + '"' : '') + '><div class="trk">' +
        '<span class="lens" aria-hidden="true"></span>' +
        (this.items || []).map(function (it) {
          return navItem(it, it.id === v, '<span class="pill">' + icon(it.icon, 24, 'ic') + '<span class="k-foot lb">' + esc(it.label) + '</span>' + (it.badge ? ' <span class="bdw">' + badgeHtml(it.badge, it.badgeTone) + '</span>' : '') + '</span>');
        }).join('') + '</div><div class="foot">' + sync + cashier + '</div></nav>';
      navAttach(this, 'y', '.pill');
    }
  });
  K.define('k-rail', KRail, {
    attrs: ['value', 'label'], props: ['items', 'footer'],
    css: BADGE_CSS +
      ':host{height:100%}.rail{width:88px;height:100%;display:flex;flex-direction:column;justify-content:space-between;background-color:var(--k-surface-2);padding-block:8px}' +
      '.trk{position:relative;display:flex;flex-direction:column}' +
      '.lens{border-radius:var(--k-r-2);' + LENS_PAINT + ';opacity:0}' +
      '.it{position:relative;z-index:1;min-height:72px;display:flex;align-items:center;justify-content:center;color:var(--k-ink-2)}' +
      '.pill{position:relative;min-width:64px;max-width:84px;min-height:56px;padding-inline:8px;box-sizing:border-box;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;border-radius:var(--k-r-2)}' +
      /* The label keeps one weight: bold on the current item made the lens hug
         « À emporter » with 4 px to spare and every label jump when chosen
         (owner, 2026-10-24). The lens, the accent icon and ink-1 carry it. A
         label too long for the rail (a larger type size) wraps, balanced. */
      '.it[aria-current="page"]{color:var(--k-ink-1)}.it[aria-current="page"] .ic{color:var(--k-accent-ink)}' +
      '.lb{max-width:68px;text-align:center;text-wrap:balance;line-height:1.15}.bdw{position:absolute;top:2px;inset-inline-end:2px}' +
      '.it:focus-visible{box-shadow:inset 0 0 0 var(--k-focus-w) var(--k-focus)}' +
      '.foot{display:flex;flex-direction:column;align-items:center;gap:8px}' +
      '.sy{position:relative;width:44px;height:44px;display:inline-flex;align-items:center;justify-content:center;color:var(--k-ink-2);border-radius:50%}' +
      '.sy .bd{position:absolute;top:0;inset-inline-end:-4px}.tn-danger{color:var(--k-danger)}.tn-warning{color:var(--k-warning)}' +
      '.ca{display:flex;flex-direction:column;align-items:center;gap:2px;min-height:44px;color:var(--k-ink-2)}' +
      '.av{width:44px;height:44px;border-radius:50%;background-color:var(--k-surface-3);color:var(--k-ink-1);display:inline-flex;align-items:center;justify-content:center}' +
      '.cn{max-width:80px;text-align:center;overflow-wrap:anywhere}'
  });

  /* ── <k-sidebar value collapsed flush> + .sections (§10.20) ───────────────
     flush: no ground, no padding, the width of whatever holds it. It is how
     the till's expanded Plus puts this nav at the head of the shipped dark
     sidebar (§18.3, owner 2026-10-16), which paints its own ground. */
  var KSidebar = K.make({
    setup: function () { navBind(this); },
    get value() { return this.str('value'); },
    attr: function () { this.render(); },
    render: function () {
      var v = this.value, col = this.flag('collapsed');
      this.shadowRoot.innerHTML = '<nav class="sb' + (col ? ' col' : '') + (this.flag('flush') ? ' flush' : '') + '"' + (this.str('label') ? ' aria-label="' + esc(this.str('label')) + '"' : '') + '><div class="trk">' +
        '<span class="lens" aria-hidden="true"></span>' +
        (this.sections || []).map(function (s) {
          return (s.label && !col ? '<h2 class="k-foot-s k-ink2 sec">' + esc(s.label) + '</h2>' : '') +
            (s.items || []).map(function (it) {
              return navItem(it, it.id === v, icon(it.icon, 24, 'ic') + '<span class="k-body lb' + (col ? ' k-vh' : '') + '">' + esc(it.label) + '</span>' + (it.badge ? ' ' + badgeHtml(it.badge, it.badgeTone) : ''));
            }).join('');
        }).join('') + '</div></nav>';
      navAttach(this, 'y', '.it');
    }
  });
  K.define('k-sidebar', KSidebar, {
    attrs: ['value', 'collapsed', 'flush', 'label'], props: ['sections'],
    css: BADGE_CSS +
      '.sb{width:280px;min-height:100%;background-color:var(--k-surface-2);padding:12px}' +
      '@media (pointer:fine){.sb{width:248px}}.sb.col{width:72px;padding-inline:14px}' +
      '.sb.flush{width:100%;min-height:0;padding:0;background-color:transparent}' +
      '.trk{position:relative;display:flex;flex-direction:column;gap:2px}' +
      '.lens{border-radius:var(--k-r-2);' + LENS_PAINT + ';opacity:0}' +
      '.sec{margin:16px 12px 4px}' +
      '.it{position:relative;z-index:1;display:flex;align-items:center;gap:12px;min-height:44px;padding-inline:12px;border-radius:var(--k-r-2);color:var(--k-ink-1)}' +
      '.col .it{justify-content:center;padding-inline:0}' +
      '.it .lb{flex:1}.it[aria-current="page"] .ic{color:var(--k-accent-ink)}.it[aria-current="page"] .lb{font-weight:var(--k-fw-body-strong)}' +
      '.it:focus-visible{box-shadow:inset 0 0 0 var(--k-focus-w) var(--k-focus)}'
  });

  /* ── <k-date-button label> (§10.19) ───────────────────────────────────── */
  var KDateButton = K.make({
    setup: function () {
      var self = this;
      K.tap(this.shadowRoot, 'button', function (el, e, gid) { self.emit('open', null, { gestureId: gid, anchor: el }); });
    },
    render: function () {
      this.shadowRoot.innerHTML = '<button type="button" class="db k-foot" aria-haspopup="dialog">' + icon('today', 16) +
        '<span>' + esc(this.str('label')) + '</span>' + icon('expand_more', 16) + '</button>';
    }
  });
  K.define('k-date-button', KDateButton, {
    attrs: ['label'],
    css: ':host{display:inline-block}.db{display:inline-flex;align-items:center;gap:4px;min-height:44px;color:var(--k-ink-2);padding-inline:4px;border-radius:var(--k-r-1)}' +
      '.db:active{background-color:var(--k-surface-2)}'
  });

  /* ── <k-range-picker month start end today cutoff> (§10.19) ───────────────
     Dates are ISO days (YYYY-MM-DD) on the store's business day; the picker
     does no clock arithmetic of its own beyond the calendar grid. */
  var PRESETS = [['today', 'range.today'], ['yesterday', 'range.yesterday'], ['week', 'range.this_week'], ['d7', 'range.d7'], ['d30', 'range.d30'], ['month', 'range.this_month']];
  function isoOf(y, m, d) { return y + '-' + String(m).padStart(2, '0') + '-' + String(d).padStart(2, '0'); }
  function parts(iso) { var p = String(iso || '').split('-').map(Number); return { y: p[0], m: p[1], d: p[2] }; }
  var KRange = K.make({
    setup: function () {
      var self = this;
      K.tap(this.shadowRoot, '[data-p],[data-d],[data-go],[data-nav]', function (el, e, gid) {
        if (el.hasAttribute('data-p')) { self.emit('preset', el.getAttribute('data-p'), { gestureId: gid }); return; }
        if (el.hasAttribute('data-nav')) { self.shiftMonth(Number(el.getAttribute('data-nav'))); return; }
        if (el.hasAttribute('data-go')) { self.emit('apply', null, { start: self.str('start'), end: self.str('end'), gestureId: gid }); return; }
        self.pick(el.getAttribute('data-d'), gid);
      });
    },
    shiftMonth: function (n) {
      var p = parts(this.str('month') || this.str('today'));
      var m = p.m + n, y = p.y;
      while (m < 1) { m += 12; y--; } while (m > 12) { m -= 12; y++; }
      this.setAttribute('month', isoOf(y, m, 1));
    },
    pick: function (iso, gid) {
      var s = this.str('start'), e = this.str('end');
      K.haptic('Choose', gid, { trigger: 'tap' });
      if (!s || (s && e)) { this.setAttribute('start', iso); this.removeAttribute('end'); }
      else this.setAttribute('end', iso);
      this.emit('pick', iso, { start: this.str('start'), end: this.str('end'), gestureId: gid });
    },
    note: function () {
      var c = this.int('cutoff', 5);
      if (c === 0) return t('range.days_calendar');
      var h = String(c).padStart(2, '0') + ':00';
      var e = String((c + 23) % 24).padStart(2, '0') + ':59';
      return t('range.days_run', { start: h, end: e });
    },
    attr: function () { this.render(); },
    render: function () {
      var today = this.str('today');
      var month = parts(this.str('month') || today);
      var s = this.str('start'), e = this.str('end');
      var bad = s && e && e < s;
      var F = K.fmt();
      var first = new Date(Date.UTC(month.y, month.m - 1, 1));
      var lead = (first.getUTCDay() + 6) % 7;                         /* Monday first */
      var days = new Date(Date.UTC(month.y, month.m, 0)).getUTCDate();
      var cells = '';
      for (var i = 0; i < lead; i++) cells += '<span class="c"></span>';
      for (var d = 1; d <= days; d++) {
        var iso = isoOf(month.y, month.m, d);
        var future = today && iso > today;
        var end = iso === s || iso === e;
        var inr = s && e && !bad && iso > s && iso < e;
        cells += '<button type="button" class="c day k-in k-callout k-num' + (end ? ' end' : '') + (inr ? ' inr' : '') + '" data-d="' + iso + '"' +
          (future ? ' aria-disabled="true"' : '') + ' aria-pressed="' + (end ? 'true' : 'false') + '"' +
          ' aria-label="' + esc((F ? F.date(iso) : iso) + (inr ? ', ' + t('range.in_range') : '')) + '">' + d + '</button>';
      }
      var monthName = F ? F.date(isoOf(month.y, month.m, 1)).replace(/^\S+\s/, '') : isoOf(month.y, month.m, 1);
      var show = s && e && !bad ? t('range.show', { from: F ? F.short(s) : s, to: F ? F.short(e) : e }) : t('range.show', { from: F && s ? F.short(s) : '…', to: F && e ? F.short(e) : '…' });
      this.shadowRoot.innerHTML =
        '<ul class="pr">' + PRESETS.map(function (p) { return '<li><button type="button" class="pre k-body k-in" data-p="' + p[0] + '">' + th(p[1]) + '</button></li>'; }).join('') + '</ul>' +
        '<div class="mh"><button type="button" class="nv" data-nav="-1" aria-label="' + esc(t('range.prev_month')) + '">' + icon('chevron_left', 24) + '</button>' +
        '<span class="k-body-s">' + esc(monthName) + '</span>' +
        '<button type="button" class="nv" data-nav="1" aria-label="' + esc(t('range.next_month')) + '">' + icon('chevron_right', 24) + '</button></div>' +
        '<div class="grid" role="group" aria-label="' + esc(monthName) + '">' + cells + '</div>' +
        '<p class="k-foot k-ink2 note">' + esc(this.note()) + '</p>' +
        (bad ? '<p class="k-foot-s err" id="why">' + th('range.end_before_start') + '</p>' : '') +
        K.controls.button.render({ label: show, variant: 'primary', size: 'L', full: true, disabled: !(s && e) || bad, id: 'go', attrs: ' data-go' + (bad ? ' aria-describedby="why"' : '') });
    }
  });
  K.define('k-range-picker', KRange, {
    attrs: ['month', 'start', 'end', 'today', 'cutoff'],
    css: K.controls.button.css +
      '.pr{list-style:none;margin:0 0 8px;padding:0;border-radius:var(--k-r-3);background-color:var(--k-surface-2);overflow:hidden}' +
      '.pre{display:flex;align-items:center;width:100%;min-height:44px;padding-inline:16px}.pre:active{background-color:var(--k-surface-3)}' +
      '.pr li+li .pre{box-shadow:inset 0 1px 0 var(--k-line)}' +
      '.mh{display:flex;align-items:center;justify-content:space-between}' +
      '.nv{width:44px;height:44px;display:inline-flex;align-items:center;justify-content:center;border-radius:50%}' +
      '.grid{display:grid;grid-template-columns:repeat(7,44px);justify-content:center;row-gap:2px}' +
      '.c{width:44px;height:44px}' +
      '.day{border-radius:var(--k-r-2);color:var(--k-ink-1)}' +
      '.day[aria-disabled="true"]{color:var(--k-ink-3);cursor:default}' +
      '.day.inr{background-color:var(--k-accent-tint);box-shadow:inset 0 1px 0 var(--k-line-strong),inset 0 -1px 0 var(--k-line-strong);border-radius:0;font-weight:var(--k-fw-callout-strong)}' +
      '.day.end{' + LENS_PAINT + ';font-weight:var(--k-fw-callout-strong)}' +
      '.day:focus-visible{box-shadow:inset 0 0 0 var(--k-focus-w) var(--k-focus)}' +
      '.note{margin:12px 0}.err{margin:0 0 8px;color:var(--k-danger)}'
  });
})(typeof window !== 'undefined' ? window : globalThis);
