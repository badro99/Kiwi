/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · assets/kit/pin.js · <k-pin-pad>, one component for eight uses
 * (spec §10.2, §15.3).
 *
 * The pad draws, listens and announces; it never decides. The caller owns the
 * request, the retry rule and the verdict, and tells the pad what happened:
 *
 *   pad.onsubmit = function (code, gestureId, cause) {}   cause: final | retry
 *   pad.answer({ message, assertive, keys, dots, shake, clear, action,
 *                haptic, automatic, name })
 *   pad.gate(message)      needs-connection: keys aria-disabled before entry
 *   pad.ungate(message)    the connection is back (written politely, once)
 *   pad.reset()            digits cleared, keys enabled, regions emptied
 *
 * A code never leaves through an event: kiwi:action is composed and reaches
 * document, so the digits go only to the caller's onsubmit. Events carry the
 * Face ID key (k.pin-pad.face), the secondary button (k.pin-pad.action) and
 * the Plain below the keypad (k.pin-pad.extra).
 *
 * Rules held here (§10.2 Rules):
 *   two live regions, present and empty from the first frame: progress
 *     (polite, "2 of 4 entered", never a digit) and the message row (status
 *     and alert, at most one holding text, cleared then written next frame);
 *   a key that cannot be used is aria-disabled, never disabled: it keeps its
 *     focus and its place, is drawn ink-3, and ignores click, Enter, Space
 *     and hardware digits, with no haptic and no write;
 *   Choose on pointerdown for every key except the final digit (§15.3);
 *     Failed and the success haptics are the caller's, on the response,
 *     through answer({haptic}), carrying the final digit's gesture id;
 *   an automatic answer whose message is already shown writes nothing.
 * ═══════════════════════════════════════════════════════════════════════════ */
(function (root) {
  'use strict';
  var K = root.KiwiKit;
  if (!K) return;
  var esc = K.esc, t = K.t, icon = K.icon;

  function M() { return root.KiwiMotion || null; }
  function dur(name, fallback) { var m = M(); return (m && m.DUR && m.DUR[name]) || fallback; }

  var KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'face', '0', 'del'];

  var KPinPad = K.make({
    setup: function () {
      var self = this;
      this.__code = '';
      this.__locked = false;          /* keys aria-disabled */
      this.__shown = '';              /* the message now in the row */
      this.__gid = null;              /* the final digit's gesture */
      /* Choose on pointerdown (pads fire on press, §15.1), except the final
         digit, whose haptic is the answer's. */
      this.shadowRoot.addEventListener('pointerdown', function (e) {
        var k = e.target.closest && e.target.closest('[data-key]');
        if (!k || self.__locked || k.getAttribute('aria-disabled') === 'true') return;
        var key = k.getAttribute('data-key');
        var g = K.gid('pin');
        k.__gid = g;
        var final = /^\d$/.test(key) && self.__code.length === self.int('length', 4) - 1;
        if (!final && !(key === 'del' && !self.__code)) K.haptic('Choose', g, { trigger: 'pointerdown' });
      });
      K.tap(this.shadowRoot, '[data-key]', function (el, e, g) { self.press(el.getAttribute('data-key'), el.__gid || g); });
      K.tap(this.shadowRoot, '[data-act]', function (el, e, g) {
        var a = self.__action;
        if (!a) return;
        if (a.id === 'retry') {
          if (el.getAttribute('aria-busy') === 'true') return;
          el.setAttribute('aria-busy', 'true');
          self.send('retry', g);
        } else self.emit('action', a.id, null);
      });
      K.tap(this.shadowRoot, '[data-extra]', function () { self.emit('extra', null, null); });
      this.addEventListener('keydown', function (e) {
        if (e.metaKey || e.ctrlKey || e.altKey) return;
        var key = /^\d$/.test(e.key) ? e.key : (e.key === 'Backspace' ? 'del' : null);
        if (!key) return;
        e.preventDefault();
        self.press(key, K.gid('pin-hw'));
      });
    },
    render: function () {
      if (this.$('.pad')) { this.paintHead(); return; }
      var face = this.flag('face-id');
      var keys = KEYS.map(function (k) {
        if (k === 'face') {
          return face ? '<button type="button" class="key fn" data-key="face" aria-label="' + esc(t('pin.face_id')) + '">' + icon('face', 32) + '</button>' : '<span class="key gap" aria-hidden="true"></span>';
        }
        if (k === 'del') return '<button type="button" class="key fn" data-key="del" aria-label="' + esc(t('pin.delete')) + '" aria-disabled="true">' + icon('backspace', 24, 'k-mir') + '</button>';
        return '<button type="button" class="key k-title k-num" data-key="' + k + '">' + k + '</button>';
      }).join('');
      this.shadowRoot.innerHTML = '<div class="pad">' +
        '<p class="k-body id" id="id"></p>' +
        '<h2 class="k-heading ti" id="ti"></h2>' +
        '<p class="k-foot k-ink2 sub" id="sub"></p>' +
        '<div class="dots" aria-hidden="true"></div>' +
        '<p class="k-vh" aria-live="polite" id="prog"></p>' +
        '<div class="msg k-foot"><p role="status" class="pol"></p><p role="alert" class="ass"></p></div>' +
        '<div class="keys" role="group" aria-labelledby="ti">' + keys + '</div>' +
        '<div class="slot"><button type="button" class="k-callout act" data-act hidden></button></div>' +
        (this.str('extra') ? '<button type="button" class="k-callout plain" data-extra>' + esc(this.str('extra')) + '</button>' : '') +
        '</div>';
      this.paintHead();
      this.paintDots();
    },
    paintHead: function () {
      var set = function (el, v) { if (el) { el.textContent = v; el.hidden = !v; } };
      set(this.$('#id'), this.str('identity'));
      set(this.$('#ti'), this.str('heading') || t('pin.title'));
      set(this.$('#sub'), this.str('sub'));
    },
    paintDots: function (tone) {
      var n = this.int('length', 4), have = this.__code.length, html = '';
      for (var i = 0; i < n; i++) html += '<span class="dot' + (i < have ? ' on' : '') + '"></span>';
      var d = this.$('.dots');
      if (!d) return;
      d.innerHTML = html;
      if (tone) d.setAttribute('data-tone', tone); else d.removeAttribute('data-tone');
      var del = this.$('[data-key="del"]');
      if (del) del.setAttribute('aria-disabled', (!have || this.__locked) ? 'true' : 'false');
    },
    lock: function (on) {
      this.__locked = !!on;
      this.$$('[data-key]').forEach(function (k) {
        if (k.getAttribute('data-key') === 'del') return;
        k.setAttribute('aria-disabled', on ? 'true' : 'false');
      });
      this.paintDots(this.$('.dots') && this.$('.dots').getAttribute('data-tone'));
    },
    press: function (key, g) {
      if (this.__locked) return;
      var n = this.int('length', 4);
      if (key === 'face') { this.emit('face', null, null); return; }
      if (key === 'del') {
        if (!this.__code) return;
        this.__code = this.__code.slice(0, -1);
      } else {
        if (this.__code.length >= n) return;
        this.__code += key;
      }
      this.paintDots();
      if (this.__code.length === n) { this.send('final', g); return; }
      K.say(this.$('#prog'), this.__code.length ? t('pin.progress', { n: this.__code.length, total: n }) : '');
    },
    /* The loading state: keys aria-disabled, the dots pulse together, the
       progress region says pin.checking once. Focus stays where it is. */
    send: function (cause, g) {
      this.__gid = g;
      this.__gat = K.now();
      this.lock(true);
      var d = this.$('.dots');
      d.setAttribute('data-k-loop', '');
      d.classList.add('wait');
      K.say(this.$('#prog'), K.reduced() ? t('state.checking') : t('pin.checking'));
      var fn = this.onsubmit;
      if (typeof fn === 'function') {
        try { fn.call(this, this.__code, g, cause); } catch (err) { if (root.KiwiReportError) root.KiwiReportError(err, 'kit:pin-pad'); }
      }
    },
    write: function (text, assertive, automatic) {
      if (automatic && text === this.__shown) return;
      this.__shown = text || '';
      var pol = this.$('.pol'), ass = this.$('.ass');
      K.say(assertive ? pol : ass, '');
      K.say(assertive ? ass : pol, text || '');
    },
    /* o.keys: 'enabled' | 'disabled' · o.dots: 'accent' | 'danger' ·
       o.clear: digits cleared (after --k-dur-7 when the dots are toned) ·
       o.action: { id, label } (id 'retry' resends the kept digits) */
    answer: function (o) {
      o = o || {};
      var self = this, d = this.$('.dots');
      d.removeAttribute('data-k-loop');
      d.classList.remove('wait');
      K.say(this.$('#prog'), '');
      var act = this.$('[data-act]');
      act.removeAttribute('aria-busy');
      if (o.action) { this.__action = o.action; act.textContent = o.action.label; act.hidden = false; }
      else if (o.action === null) { this.__action = null; act.hidden = true; }
      if (o.haptic && !o.automatic) K.haptic(o.haptic, this.__gid, { trigger: 'response', gestureAt: this.__gat });
      var disabled = o.keys === 'disabled';
      if (o.name) { var ti = this.$('#ti'); ti.textContent = o.name; }
      if (o.message != null) this.write(o.message, o.assertive != null ? o.assertive : disabled, o.automatic);
      if (o.dots) this.paintDots(o.dots);
      if (o.shake && !K.reduced()) {
        d.classList.remove('k-shake'); void d.offsetWidth; d.classList.add('k-shake');
      }
      var after = function () {
        if (o.clear) self.__code = '';
        self.lock(disabled);
        self.paintDots();
      };
      if (o.dots === 'danger') { this.lock(true); clearTimeout(this.__t); this.__t = setTimeout(after, dur('dur7', 700)); }
      else if (o.dots === 'accent') { this.lock(true); clearTimeout(this.__t); this.__t = setTimeout(function () { self.emit('done', null, null); }, dur('dur7', 700)); }
      else after();
    },
    gate: function (message) {
      this.lock(true);
      this.write(message, true, true);
    },
    ungate: function (message) {
      this.lock(false);
      this.write(message, false, false);
    },
    reset: function () {
      clearTimeout(this.__t);
      this.__code = '';
      this.__action = null;
      this.__shown = '';
      var act = this.$('[data-act]'); if (act) { act.hidden = true; act.removeAttribute('aria-busy'); }
      K.say(this.$('.pol'), ''); K.say(this.$('.ass'), ''); K.say(this.$('#prog'), '');
      var d = this.$('.dots'); if (d) { d.removeAttribute('data-k-loop'); d.classList.remove('wait', 'k-shake'); }
      this.paintHead();
      this.lock(false);
    },
    get filled() { return this.__code ? this.__code.length : 0; }
  });
  K.define('k-pin-pad', KPinPad, {
    attrs: ['identity', 'heading', 'sub', 'length', 'face-id', 'extra', 'size'],
    css: ':host{display:block;--key:76px}:host([size="ipad"]){--key:84px}:host([size="kds"]){--key:96px}' +
      '.pad{display:flex;flex-direction:column;align-items:center;text-align:center;gap:8px}' +
      '.id,.ti,.sub{margin:0}.id{color:var(--k-ink-2)}' +
      '.dots{display:flex;gap:16px;direction:ltr;margin-block:16px 4px}' +
      '.dot{width:12px;height:12px;border-radius:50%;box-shadow:inset 0 0 0 1.5px var(--k-ink-2)}' +
      '.dot.on{background-color:var(--k-ink-1);box-shadow:none}' +
      '.dots[data-tone="accent"] .dot.on{background-color:var(--k-accent)}' +
      '.dots[data-tone="danger"] .dot{background-color:var(--k-danger);box-shadow:none}' +
      '.dots.wait{animation:k-pulse var(--k-dur-9) linear infinite alternate}' +
      '.msg{min-height:20px;color:var(--k-danger)}.msg p{margin:0}.msg p:empty{display:none}' +
      '.keys{display:grid;grid-template-columns:repeat(3,var(--key));column-gap:24px;row-gap:16px;direction:ltr;margin-block-start:8px}' +
      '.key{width:var(--key);height:var(--key);border-radius:50%;display:inline-flex;align-items:center;justify-content:center;' +
      'background-color:var(--k-surface-2);color:var(--k-ink-1);touch-action:manipulation}' +
      '.key.fn{background-color:transparent}.key.gap{background:none}' +
      '.key:active:not([aria-disabled="true"]){background-color:var(--k-surface-3)}' +
      '.key[aria-disabled="true"]{color:var(--k-ink-3)}' +
      '.key:focus-visible{box-shadow:inset 0 0 0 var(--k-focus-w) var(--k-focus)}' +
      '.slot{min-height:44px;display:flex;align-items:center}' +
      '.act{min-height:44px;padding-inline:20px;border-radius:999px;background-color:var(--k-surface-2);color:var(--k-ink-1)}' +
      '.act[aria-busy="true"]{color:var(--k-ink-3)}' +
      '.plain{min-height:44px;padding-inline:12px;color:var(--k-accent-ink)}' +
      '@media (prefers-reduced-motion:reduce){.dots.wait{animation:none}}'
  });
})(typeof window !== 'undefined' ? window : globalThis);
