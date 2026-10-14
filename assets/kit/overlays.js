/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · assets/kit/overlays.js · layers over the page (spec §10.3 to §10.5,
 * §10.17, §14.3 to §14.5).
 *
 *   <k-sheet>    phone sheet (medium and large detents, drag, fling) and the
 *                iPad and desktop form sheet (540, or 720 for the cash count);
 *                role="dialog", aria-modal, the page behind made inert, focus
 *                returned to the opener; the confirm sheet of Tiers B and C
 *                plays Caution on its first frame and nothing after (§11)
 *   <k-popover>  anchored, 360 wide, flips; a medium sheet on compact widths;
 *                never holds a keypad
 *   <k-tooltip>  KiwiTooltip.attach(el, text): 500 ms hover or focus, long
 *                press on touch (rail icons), never the only copy
 *   <k-toast>    KiwiToast.show({message, tone, action}): finished actions
 *                only, one at a time, ×2 for duplicates, role="status",
 *                no haptic, ever (§15.6)
 * ═══════════════════════════════════════════════════════════════════════════ */
(function (root) {
  'use strict';
  var K = root.KiwiKit;
  if (!K) return;
  var esc = K.esc, t = K.t, icon = K.icon;
  var doc = root.document;

  function M() { return root.KiwiMotion || null; }
  function deepActive() {
    var a = doc.activeElement;
    while (a && a.shadowRoot && a.shadowRoot.activeElement) a = a.shadowRoot.activeElement;
    return a;
  }
  function animate(el, to, o) {
    var m = M();
    if (m && typeof m.animate === 'function') return m.animate(el, to, o);
    Object.keys(to).forEach(function (k) { el.style[k] = to[k]; });
    return { finished: Promise.resolve(), cancel: function () {} };
  }
  function wide() { try { return root.matchMedia('(min-width: 700px)').matches; } catch (_) { return false; } }

  /* The page behind a modal layer: every sibling of the layer's branch under
     <body> gets `inert` (iOS 15.5); without inert, aria-hidden, and the layer
     traps focus itself (§10.3). */
  function shield(host, on) {
    /* Climb out of any shadow root that holds the layer (a compare sheet
       lives in its control's root), up to the child of <body>. */
    var branch = host;
    for (;;) {
      var up = branch.parentElement || (branch.parentNode && branch.parentNode.host) || null;
      if (!up || up === doc.body || up === doc.documentElement) break;
      branch = up;
    }
    var hasInert = 'inert' in HTMLElement.prototype;
    Array.prototype.forEach.call(doc.body.children, function (el) {
      if (el === branch || el.tagName === 'SCRIPT' || el.tagName === 'K-TOAST') return;
      if (on) {
        if (el.__kShield) return;
        el.__kShield = { inert: el.inert, hidden: el.getAttribute('aria-hidden') };
        if (hasInert) el.inert = true; else el.setAttribute('aria-hidden', 'true');
      } else if (el.__kShield) {
        if (hasInert) el.inert = el.__kShield.inert; else if (el.__kShield.hidden == null) el.removeAttribute('aria-hidden'); else el.setAttribute('aria-hidden', el.__kShield.hidden);
        el.__kShield = null;
      }
    });
  }
  var openLayers = [];
  function lockScroll(on) {
    var s = doc.documentElement.style;
    if (on) { if (!openLayers.length) { lockScroll.prev = s.overflow; s.overflow = 'hidden'; } }
    else if (!openLayers.length) s.overflow = lockScroll.prev || '';
  }

  /* ── <k-sheet open heading detent size confirm dirty> ───────────────────── */
  var DISMISS_FRACTION = 0.35, FLING = 800;
  var KSheet = K.make({
    setup: function () {
      var self = this;
      K.tap(this.shadowRoot, '[data-x]', function () { self.requestClose('close'); });
      this.shadowRoot.addEventListener('click', function (e) { if (e.target.classList && e.target.classList.contains('scrim')) self.requestClose('scrim'); });
      this.__key = function (e) {
        if (e.key === 'Escape' && openLayers[openLayers.length - 1] === self) { e.stopPropagation(); self.requestClose('escape'); }
        if (e.key === 'Tab' && !('inert' in HTMLElement.prototype)) self.trap(e);
      };
      this.bindDrag();
    },
    attr: function (name) {
      if (name === 'open') { if (this.flag('open')) this.present(); else this.dismiss(); }
      else if (name === 'heading') { var h = this.$('#t'); if (h) h.textContent = this.str('heading'); }
      else this.render();
    },
    render: function () {
      if (this.$('.panel')) return;
      var form = this.str('size') === 'count' ? ' count' : '';
      this.shadowRoot.innerHTML = '<div class="scrim" part="scrim"></div>' +
        '<div class="panel' + form + '" role="dialog" aria-modal="true" aria-labelledby="t" tabindex="-1">' +
        '<div class="grab" aria-hidden="true"><span></span></div>' +
        '<header class="hd"><h2 class="k-heading ti" id="t">' + esc(this.str('heading')) + '</h2>' +
        (this.flag('no-close') ? '' : '<button type="button" class="x" data-x aria-label="' + esc(t('action.close')) + '">' + icon('close', 24) + '</button>') + '</header>' +
        '<div class="bd"><slot></slot></div><div class="ft" hidden><slot name="footer"></slot></div></div>';
      /* The footer bar shows only when something is slotted into it. The CSS
         test `.ft:not(:has(*))` never matched: the <slot> is itself a child. */
      var ft = this.$('.ft'), fs = ft.querySelector('slot');
      var syncFoot = function () {
        ft.hidden = !fs.assignedNodes({ flatten: true }).some(function (n) { return n.nodeType === 1 || (n.nodeType === 3 && n.textContent.trim()); });
      };
      fs.addEventListener('slotchange', syncFoot);
      syncFoot();
      if (this.flag('open')) this.present();
    },
    present: function () {
      if (this.__open) return;
      this.__open = true;
      this.__opener = deepActive();
      openLayers.push(this);
      lockScroll(true);
      shield(this, true);
      doc.addEventListener('keydown', this.__key, true);
      this.setAttribute('data-shown', '');
      var panel = this.$('.panel'), scrim = this.$('.scrim');
      var self = this;
      /* Caution on the first frame of a Tier B or C confirm opened by a tap
         (§11, §15.1); a swipe already played it at the threshold. */
      if (this.flag('confirm') && !this.flag('silent')) K.haptic('Caution', this.__gesture || K.gid('confirm'), { trigger: 'tap' });
      var big = wide();
      animate(scrim, { opacity: 1 }, { from: { opacity: 0 }, dur: 'dur5' });
      /* prefers-reduced-motion: the sheet crossfades in place, no travel. */
      if (K.reduced()) { panel.style.transform = big ? '' : 'translateY(0)'; animate(panel, { opacity: 1 }, { from: { opacity: 0 }, dur: 'dur2' }); }
      else animate(panel, big ? { transform: 'scale(1)', opacity: 1 } : { transform: 'translateY(0)' },
        { from: big ? { transform: 'scale(0.96)', opacity: 0 } : { transform: 'translateY(100%)' }, dur: 'dur5' });
      var raf = root.requestAnimationFrame || function (f) { setTimeout(f, 16); };
      raf(function () {
        var first = self.querySelector('[autofocus]');
        (first || panel).focus({ preventScroll: true });
      });
      this.emit('open');
    },
    /* A dirty sheet asks first: the owner decides, then sets open=false. */
    requestClose: function (why) {
      if (this.flag('dirty')) { this.emit('dismiss-request', null, { reason: why }); return false; }
      this.removeAttribute('open');
      this.emit('close', null, { reason: why });
      return true;
    },
    dismiss: function () {
      if (!this.__open) return;
      this.__open = false;
      var i = openLayers.indexOf(this); if (i >= 0) openLayers.splice(i, 1);
      doc.removeEventListener('keydown', this.__key, true);
      var panel = this.$('.panel'), scrim = this.$('.scrim'), self = this;
      var big = wide();
      animate(scrim, { opacity: 0 }, { dur: 'dur3', curve: 'exit' });
      var a = K.reduced() ? animate(panel, { opacity: 0 }, { dur: 'dur2', curve: 'exit' })
        : animate(panel, big ? { transform: 'scale(0.96)', opacity: 0 } : { transform: 'translateY(100%)' }, { dur: 'dur3', curve: 'exit' });
      (a.finished || Promise.resolve()).then(function () {
        if (self.__open) return;
        self.removeAttribute('data-shown');
        panel.style.transform = ''; panel.style.opacity = '';
        shield(self, false);
        lockScroll(false);
        var o = self.__opener;
        if (o && o.isConnected && typeof o.focus === 'function') o.focus({ preventScroll: true });
      });
    },
    trap: function (e) {
      var f = this.$$('button,[tabindex="0"]').concat(Array.prototype.slice.call(this.querySelectorAll('button,input,select,textarea,a[href],[tabindex="0"],[data-k]')));
      if (!f.length) return;
      var a = deepActive();
      if (e.shiftKey && a === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
      else if (!e.shiftKey && a === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
    },
    /* Drag (§10.3): from the grabber or the header always; from the body only
       when it is at its top and the drag goes down; never from a pad. Past
       35 % or a fling over 800 pt/s dismisses; otherwise the gesture spring
       returns it. Sheet drags never buzz (§15.6). */
    bindDrag: function () {
      var self = this, d = null;
      function inPad(e) {
        var path = e.composedPath ? e.composedPath() : [];
        for (var i = 0; i < path.length; i++) {
          var n = path[i];
          if (n.nodeType === 1 && (n.hasAttribute('data-k-pad') || /^K-(PIN-PAD|KEYPAD)$/.test(n.tagName))) return true;
        }
        return false;
      }
      this.shadowRoot.addEventListener('pointerdown', function (e) {
        if (wide() || !self.__open) return;
        var inHead = e.target.closest && e.target.closest('.grab,.hd');
        var body = self.$('.bd');
        var inBody = e.target.closest && e.target.closest('.bd');
        if (inPad(e)) return;
        if (e.target.closest && e.target.closest('[data-x]')) return;
        if (!inHead && !(inBody && body.scrollTop <= 0)) return;
        d = { y: e.clientY, t: e.timeStamp, last: e.clientY, lt: e.timeStamp, head: !!inHead, on: false, h: self.$('.panel').offsetHeight };
      });
      this.shadowRoot.addEventListener('pointermove', function (e) {
        if (!d) return;
        var dy = e.clientY - d.y;
        if (!d.on) {
          if (Math.abs(dy) < 6) return;
          if (!d.head && dy < 0) { d = null; return; }
          d.on = true;
          if (root.KiwiHaptics) root.KiwiHaptics.suppress('sheet-drag', true);
        }
        d.v = (e.clientY - d.last) / Math.max(1, e.timeStamp - d.lt) * 1000;
        d.last = e.clientY; d.lt = e.timeStamp;
        var p = self.$('.panel');
        p.style.transition = 'none';
        p.style.transform = 'translateY(' + Math.max(0, dy) + 'px)';
      });
      function end(e) {
        if (!d) return;
        var st = d; d = null;
        if (root.KiwiHaptics) root.KiwiHaptics.suppress('sheet-drag', false);
        if (!st.on) return;
        var dy = Math.max(0, e.clientY - st.y);
        var p = self.$('.panel');
        p.style.transition = '';
        if (dy > st.h * DISMISS_FRACTION || (st.v || 0) > FLING) { self.requestClose('drag'); if (self.flag('dirty')) settle(p, dy, 0, st.v); return; }
        settle(p, dy, 0, st.v || 0);
      }
      function settle(p, from, to, v) {
        var m = M();
        if (!m || !m.bindSpring) { p.style.transform = ''; return; }
        m.bindSpring(p, { axis: 'y', from: from, to: to, velocity: v }).to(to, { velocity: v });
      }
      this.shadowRoot.addEventListener('pointerup', end);
      this.shadowRoot.addEventListener('pointercancel', end);
    },
    /* A confirm opened by a tap: the caller hands the gesture so Caution
       carries its id (one gesture, one haptic). */
    openFrom: function (gestureId) { this.__gesture = gestureId; this.setAttribute('open', ''); }
  });
  K.define('k-sheet', KSheet, {
    attrs: ['open', 'heading', 'detent', 'size', 'confirm'],
    css: ':host{display:none;position:fixed;inset:0;z-index:1000}' +
      ':host([data-shown]){display:block}' +
      '.scrim{position:absolute;inset:0;background-color:var(--k-scrim);opacity:0}' +
      '.panel{position:absolute;inset-inline:0;bottom:0;display:flex;flex-direction:column;max-height:calc(100dvh - env(safe-area-inset-top,0px) - 12px);' +
      'background-color:var(--k-surface-1);border-radius:var(--k-r-4) var(--k-r-4) 0 0;box-shadow:var(--k-shadow-3);transform:translateY(100%)}' +
      ':host([detent="medium"]) .panel{height:50dvh}:host([detent="large"]) .panel{height:calc(100dvh - env(safe-area-inset-top,0px) - 12px)}' +
      '.grab{display:flex;justify-content:center;padding-block-start:8px;touch-action:none}' +
      '.grab span{width:36px;height:5px;border-radius:3px;background-color:var(--k-ink-3);opacity:.4}' +
      '.hd{display:flex;align-items:center;gap:8px;min-height:56px;padding-inline:20px 8px;touch-action:none}' +
      '.ti{flex:1;margin:0}' +
      '.x{width:44px;height:44px;display:inline-flex;align-items:center;justify-content:center;border-radius:50%;color:var(--k-ink-1)}.x:active{background-color:var(--k-surface-2)}' +
      '.bd{flex:1;overflow-y:auto;overscroll-behavior:contain;padding-inline:20px;padding-block-end:16px;-webkit-overflow-scrolling:touch}' +
      '.ft{padding:12px 20px calc(12px + env(safe-area-inset-bottom,0px));box-shadow:inset 0 1px 0 var(--k-line)}' +
      '.ft[hidden]{display:none}' +
      '@media (min-width:700px){.panel{inset:auto;top:50%;left:50%;width:540px;max-width:calc(100vw - 24px);max-height:calc(100dvh - 48px);' +
      'border-radius:var(--k-r-4);margin-left:-270px;transform:none;translate:0 -50%}.grab{display:none}' +
      '.panel.count{width:720px;margin-left:-360px}}' +
      '@media (min-width:700px) and (max-width:743px){.panel.count{width:calc(100vw - 24px);margin-left:calc(-50vw + 12px)}}'
  });

  /* ── <k-popover open heading> + .anchor (§10.4) ─────────────────────────── */
  var KPopover = K.make({
    setup: function () {
      var self = this;
      this.__key = function (e) { if (e.key === 'Escape') { e.stopPropagation(); self.close(); } };
      this.__out = function (e) {
        var path = e.composedPath ? e.composedPath() : [];
        if (path.indexOf(self) < 0 && path.indexOf(self.anchor) < 0) self.close();
      };
      K.tap(this.shadowRoot, '[data-x]', function () { self.close(); });
    },
    attr: function (name) { if (name === 'open') { if (this.flag('open')) this.show(); else this.hide(); } },
    render: function () {
      if (this.$('.pop')) return;
      this.shadowRoot.innerHTML = '<div class="pop" role="dialog" aria-labelledby="t" tabindex="-1">' +
        '<span class="arrow" aria-hidden="true"></span>' +
        '<h2 class="k-body-s ti" id="t">' + esc(this.str('heading')) + '</h2><div class="bd"><slot></slot></div></div>';
      if (this.flag('open')) this.show();
    },
    close: function () { this.removeAttribute('open'); this.emit('close'); },
    place: function () {
      var a = this.anchor, pop = this.$('.pop');
      if (!a || !pop) return;
      var r = a.getBoundingClientRect(), vw = root.innerWidth, vh = root.innerHeight;
      var w = Math.min(360, vw - 24), h = pop.offsetHeight;
      var below = r.bottom + 12 + h <= vh - 12 || r.top < h + 24;
      var left = Math.max(12, Math.min(vw - w - 12, r.left + r.width / 2 - w / 2));
      var top = below ? r.bottom + 12 : r.top - 12 - h;
      pop.style.width = w + 'px';
      pop.style.left = left + 'px';
      pop.style.top = Math.max(12, top) + 'px';
      pop.setAttribute('data-side', below ? 'below' : 'above');
      var ar = this.$('.arrow');
      ar.style.left = Math.max(16, Math.min(w - 28, r.left + r.width / 2 - left - 6)) + 'px';
      pop.style.transformOrigin = (r.left + r.width / 2 - left) + 'px ' + (below ? '0' : '100%');
    },
    show: function () {
      if (this.__shown) return;
      this.__shown = true;
      this.__opener = deepActive();
      this.setAttribute('data-shown', '');
      this.place();
      var pop = this.$('.pop');
      animate(pop, { transform: 'scale(1)', opacity: 1 }, { from: { transform: 'scale(0.96)', opacity: 0 }, dur: 'dur3' });
      doc.addEventListener('keydown', this.__key, true);
      doc.addEventListener('pointerdown', this.__out, true);
      var first = this.querySelector('[autofocus]');
      (first || pop).focus({ preventScroll: true });
    },
    hide: function () {
      if (!this.__shown) return;
      this.__shown = false;
      doc.removeEventListener('keydown', this.__key, true);
      doc.removeEventListener('pointerdown', this.__out, true);
      var self = this, pop = this.$('.pop');
      var a = animate(pop, { opacity: 0 }, { dur: 'dur2', curve: 'exit' });
      (a.finished || Promise.resolve()).then(function () {
        if (self.__shown) return;
        self.removeAttribute('data-shown');
        var o = self.anchor || self.__opener;
        if (o && o.isConnected && o.focus) o.focus({ preventScroll: true });
      });
    }
  });
  K.define('k-popover', KPopover, {
    attrs: ['open', 'heading'], props: ['anchor'],
    css: ':host{display:none;position:fixed;inset:0;z-index:900;pointer-events:none}:host([data-shown]){display:block}' +
      '.pop{position:fixed;pointer-events:auto;max-height:calc(100dvh - 24px);overflow:auto;background-color:var(--k-popover);border-radius:var(--k-r-3);' +
      'box-shadow:var(--k-shadow-2);padding:16px;opacity:0}' +
      '.arrow{position:absolute;width:12px;height:12px;background-color:var(--k-popover);transform:rotate(45deg)}' +
      '.pop[data-side="below"] .arrow{top:-6px}.pop[data-side="above"] .arrow{bottom:-6px}' +
      '.ti{margin:0 0 8px}' +
      '@media (max-width:599px){.pop{left:0 !important;right:0;top:auto !important;bottom:0;width:auto !important;border-radius:var(--k-r-4) var(--k-r-4) 0 0;' +
      'max-height:50dvh;padding-bottom:calc(16px + env(safe-area-inset-bottom,0px))}.arrow{display:none}}'
  });

  /* ── <k-tooltip> and KiwiTooltip.attach(el, text) (§10.5) ───────────────── */
  var KTooltip = K.make({
    render: function () {
      this.setAttribute('role', 'tooltip');
      this.shadowRoot.innerHTML = '<span class="tip k-foot">' + esc(this.str('text')) + '</span>';
    }
  });
  K.define('k-tooltip', KTooltip, {
    attrs: ['text'],
    css: ':host{position:fixed;z-index:1100;pointer-events:none;display:none}:host([data-shown]){display:block}' +
      '.tip{display:block;max-width:280px;padding-block:8px;padding-inline:12px;border-radius:var(--k-r-1);background-color:var(--k-inverse);color:var(--k-on-inverse)}'
  });
  var tipEl = null, tipTimer = 0, tipHide = 0;
  function tipShow(el, text) {
    if (!tipEl) { tipEl = doc.createElement('k-tooltip'); tipEl.id = 'k-tooltip'; doc.body.appendChild(tipEl); }
    tipEl.setAttribute('text', text);
    tipEl.setAttribute('data-shown', '');
    var r = el.getBoundingClientRect();
    tipEl.style.left = Math.max(8, Math.min(root.innerWidth - 288, r.left + r.width / 2 - 60)) + 'px';
    tipEl.style.top = (r.bottom + 8) + 'px';
    clearTimeout(tipHide);
    var dur = (M() && M().DUR.toast) || 4000;
    tipHide = setTimeout(tipOff, dur);
  }
  function tipOff() { clearTimeout(tipTimer); if (tipEl) tipEl.removeAttribute('data-shown'); }
  root.KiwiTooltip = {
    attach: function (el, text) {
      var lp = 0;
      el.addEventListener('pointerenter', function (e) { if (e.pointerType === 'mouse') { clearTimeout(tipTimer); tipTimer = setTimeout(function () { tipShow(el, text); }, 500); } });
      el.addEventListener('pointerleave', tipOff);
      el.addEventListener('focus', function () { clearTimeout(tipTimer); tipTimer = setTimeout(function () { tipShow(el, text); }, 500); });
      el.addEventListener('blur', tipOff);
      el.addEventListener('pointerdown', function (e) { if (e.pointerType !== 'mouse') lp = setTimeout(function () { tipShow(el, text); }, 500); });
      el.addEventListener('pointerup', function () { clearTimeout(lp); });
      el.addEventListener('pointercancel', function () { clearTimeout(lp); });
    }
  };

  /* ── <k-toast> and KiwiToast.show(o) (§10.17) ──────────────────────────────
     The host lives in the DOM from the first call, empty, so its status
     region is there before its text. Info stays --k-dur-toast; with an action
     --k-dur-toast-action, paused while touched or focused (and, through the
     bridge, while VoiceOver runs). Swipe down past 24 pt or fling over
     300 pt/s dismisses. Toasts never buzz. */
  var KToast = K.make({
    setup: function () {
      var self = this;
      K.tap(this.shadowRoot, '[data-act]', function (el, e, gid) {
        var cur = self.__cur;
        self.hideNow();
        if (cur && cur.action) self.emit('action', cur.action.id || null, { gestureId: gid });
      });
      var R = this.shadowRoot, s = null;
      ['pointerenter', 'focusin', 'pointerdown'].forEach(function (ev) { R.addEventListener(ev, function () { self.pause(true); }); });
      ['pointerleave', 'focusout'].forEach(function (ev) { R.addEventListener(ev, function () { self.pause(false); }); });
      R.addEventListener('pointerdown', function (e) { s = { y: e.clientY, t: e.timeStamp }; });
      R.addEventListener('pointerup', function (e) {
        if (!s) return;
        var dy = e.clientY - s.y, v = dy / Math.max(1, e.timeStamp - s.t) * 1000;
        s = null;
        if (dy > 24 || v > 300) self.hideNow();
        else self.pause(false);
      });
    },
    render: function () {
      if (!this.$('.reg')) this.shadowRoot.innerHTML = '<div class="reg" role="status" aria-live="polite"></div>';
    },
    show: function (o) {
      this.render();
      var key = (o.tone || 'info') + '|' + o.message;
      if (this.__cur && this.__curKey === key && this.__showing) { this.__count++; }
      else { this.__count = 1; this.__curKey = key; }
      this.__cur = o;
      var reg = this.$('.reg');
      var ic = o.tone === 'danger' ? icon('error', 20, 'ic dg') : icon(o.icon || 'task_alt', 20, 'ic');
      reg.innerHTML = '<div class="t">' + ic + '<span class="k-callout m">' + esc(o.message) + (this.__count > 1 ? ' <span class="k-num">×' + this.__count + '</span>' : '') + '</span>' +
        (o.action ? '<button type="button" class="k-callout-s a" data-act>' + esc(o.action.label) + '</button>' : '') + '</div>';
      var box = reg.firstChild;
      if (!this.__showing) animate(box, { transform: 'translateY(0)', opacity: 1 }, { from: { transform: 'translateY(16px)', opacity: 0 }, dur: 'dur3' });
      this.__showing = true;
      this.__left = o.action ? ((M() && M().DUR.toastAction) || 8000) : ((M() && M().DUR.toast) || 4000);
      if (o.action && root.__kiwiVoiceOver) this.__left = Infinity;
      this.pause(false);
    },
    pause: function (on) {
      var self = this;
      clearTimeout(this.__timer);
      if (on) { if (this.__started) this.__left -= Date.now() - this.__started; this.__started = 0; return; }
      if (!this.__showing || !isFinite(this.__left)) return;
      this.__started = Date.now();
      this.__timer = setTimeout(function () { self.hideNow(); }, Math.max(0, this.__left));
    },
    hideNow: function () {
      clearTimeout(this.__timer);
      if (!this.__showing) return;
      this.__showing = false;
      var reg = this.$('.reg'), box = reg && reg.firstChild, self = this;
      if (!box) return;
      var a = animate(box, { opacity: 0 }, { dur: 'dur2', curve: 'exit' });
      (a.finished || Promise.resolve()).then(function () { if (!self.__showing) reg.innerHTML = ''; });
    }
  });
  K.define('k-toast', KToast, {
    css: ':host{position:fixed;inset-inline:var(--k-grid-margin);bottom:calc(var(--k-toast-bottom,16px) + env(safe-area-inset-bottom,0px));z-index:1200;display:flex;justify-content:center;pointer-events:none}' +
      '.reg{display:contents}' +
      '.t{pointer-events:auto;display:flex;align-items:center;gap:12px;min-height:48px;max-width:440px;padding-block:8px;padding-inline:16px;border-radius:999px;' +
      'background-color:var(--k-inverse);color:var(--k-on-inverse);box-shadow:inset 0 0 0 1px var(--k-toast-edge),var(--k-shadow-2)}' +
      '.ic{color:var(--k-inverse-accent)}.ic.dg{color:var(--k-inverse-danger)}' +
      '.m{display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;overflow:hidden}' +
      '.a{color:var(--k-inverse-accent);min-height:44px;padding-inline:4px;white-space:nowrap}'
  });
  root.KiwiToast = {
    show: function (o) {
      var el = doc.querySelector('k-toast');
      if (!el) { el = doc.createElement('k-toast'); doc.body.appendChild(el); }
      el.show(o || {});
      return el;
    },
    hide: function () { var el = doc.querySelector('k-toast'); if (el) el.hideNow(); }
  };
})(typeof window !== 'undefined' ? window : globalThis);
