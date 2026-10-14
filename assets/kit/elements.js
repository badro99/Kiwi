/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · assets/kit/elements.js · the general elements of the 2027 kit.
 *
 *   <k-icon> <k-figure>                      light DOM, no root (§20.6)
 *   <k-button> <k-badge> <k-avatar> <k-skeleton> <k-spinner> <k-empty>
 *   <k-banner> <k-switch> <k-stepper> <k-chips> <k-field> <k-list>
 *   <k-page-header>
 *
 * Spec §10.1 and §10.7 to §10.18. Every label is a key (KiwiKit.t), every
 * action is one composed kiwi:action named k.<component>.<verb> (§20.4), and
 * collections (<k-list>) render their rows inside their own root, with the
 * controls of assets/kit/controls/ (§20.6).
 * ═══════════════════════════════════════════════════════════════════════════ */
(function (root) {
  'use strict';
  var K = root.KiwiKit;
  if (!K) return;
  var C = K.controls;
  var esc = K.esc, t = K.t, th = K.th, numHtml = K.numHtml, icon = K.icon;
  var doc = root.document;

  /* ── <k-icon name size mirror> · light DOM (§8, §20.6) ─────────────────── */
  function KIcon() { return Reflect.construct(HTMLElement, [], new.target || KIcon); }
  KIcon.prototype = Object.create(HTMLElement.prototype);
  KIcon.prototype.constructor = KIcon;
  Object.setPrototypeOf(KIcon, HTMLElement);
  Object.defineProperty(KIcon, 'observedAttributes', { get: function () { return ['name', 'size']; } });
  KIcon.prototype.connectedCallback = function () { this.draw(); };
  KIcon.prototype.attributeChangedCallback = function () { if (this.isConnected) this.draw(); };
  KIcon.prototype.draw = function () {
    var size = parseInt(this.getAttribute('size'), 10) || 24;
    this.innerHTML = icon(this.getAttribute('name'), size);
    this.setAttribute('aria-hidden', 'true');
  };
  if (!customElements.get('k-icon')) customElements.define('k-icon', KIcon);

  /* ── <k-figure key range step unit> · light DOM, reads KiwiLedger (§17) ──
     Nothing is invented: with no ledger answer and no figure handed in, it
     draws "—". A changed value rolls its digits (§14.4); the rolling glyphs
     are aria-hidden and a visually hidden sibling holds the true value
     (§14.6). No count-up on first paint. */
  function KFigure() { return Reflect.construct(HTMLElement, [], new.target || KFigure); }
  KFigure.prototype = Object.create(HTMLElement.prototype);
  KFigure.prototype.constructor = KFigure;
  Object.setPrototypeOf(KFigure, HTMLElement);
  Object.defineProperty(KFigure, 'observedAttributes', { get: function () { return ['key', 'range']; } });
  Object.defineProperty(KFigure.prototype, 'figure', {
    get: function () { return this.__fig; },
    set: function (v) { this.__fig = v; if (this.isConnected) this.draw(); }
  });
  KFigure.prototype.connectedCallback = function () {
    if (Object.prototype.hasOwnProperty.call(this, 'figure')) { var v = this.figure; delete this.figure; this.figure = v; }
    this.draw();
  };
  KFigure.prototype.attributeChangedCallback = function () { if (this.isConnected) this.draw(); };
  KFigure.prototype.read = function () {
    if (this.__fig) return this.__fig;
    var L = root.KiwiLedger, key = this.getAttribute('key');
    if (L && key && typeof L.get === 'function') {
      try { var r = L.get(key, this.getAttribute('range') || 'today'); if (r && r.value != null) return r; } catch (_) { /* no figure */ }
    }
    return null;
  };
  KFigure.prototype.text = function (f) {
    var F = K.fmt();
    if (!f || f.value == null || !isFinite(f.value)) return { num: '—', unit: '' };
    var digits = f.precision == null ? 0 : f.precision;
    var num = F ? F.num(f.value, digits) : String(f.value);
    var unit = f.unit === 'none' ? '' : (f.unit || (f.kind === 'money' ? (F ? F.money(0).split(F.NBSP).pop() : 'MAD') : ''));
    return { num: num, unit: unit };
  };
  KFigure.prototype.draw = function () {
    var x = this.text(this.read());
    var before = this.__num;
    this.__num = x.num;
    var full = x.unit ? x.num + ' ' + x.unit : x.num;
    var rolled = before != null && before !== x.num && x.num !== '—' && !K.reduced();
    var digits = '<span class="k-fig__n" aria-hidden="true">' + (rolled ? roll(before, x.num) : esc(x.num)) + '</span>';
    this.innerHTML = digits + (x.unit ? '<span class="k-fig__u" aria-hidden="true">&nbsp;' + esc(x.unit) + '</span>' : '') +
      '<span class="k-fig__sr">' + esc(full) + '</span>';
  };
  /* An increase enters from below, a decrease from above, the same in RTL. */
  function roll(a, b) {
    var M = root.KiwiMotion;
    var dir = M ? M.rollDirection(parseFloat(String(a).replace(/[^\d.-]/g, '')), parseFloat(String(b).replace(/[^\d.-]/g, ''))) : 'from-below';
    var out = '', pad = Math.max(a.length, b.length);
    a = (Array(pad + 1).join(' ') + a).slice(-pad);
    b = (Array(pad + 1).join(' ') + b).slice(-pad);
    for (var i = 0; i < pad; i++) {
      var ch = b.charAt(i) === ' ' ? '' : esc(b.charAt(i));
      out += a.charAt(i) !== b.charAt(i) ? '<span class="k-fig__d k-fig__d--' + dir + '">' + ch + '</span>' : ch;
    }
    return out;
  }
  if (!customElements.get('k-figure')) customElements.define('k-figure', KFigure);

  /* ── <k-button> ─────────────────────────────────────────────────────────── */
  var KButton = K.make({
    setup: function () {
      var self = this;
      C.button.bind(this.shadowRoot, function (el, gid) { self.emit('press', null, { gestureId: gid }); });
    },
    attr: function (name) {
      if (name === 'loading') this.loadingTimer();
      this.render();
    },
    loadingTimer: function () {
      var self = this;
      clearTimeout(this.__spinT);
      this.__spin = false;
      if (this.flag('loading')) this.__spinT = setTimeout(function () { self.__spin = true; self.render(); }, 300);
    },
    render: function () {
      var dis = this.flag('disabled');
      this.toggleAttribute('aria-disabled', dis);
      this.shadowRoot.innerHTML = C.button.render({
        label: this.str('label'), icon: this.str('icon'), variant: this.str('variant', 'secondary'), size: this.str('size', 'M'),
        full: this.flag('full'), disabled: dis, loading: this.flag('loading'), spinning: this.__spin, reason: this.str('reason'),
        error: this.str('error'), ariaLabel: this.getAttribute('aria-label') || this.str('label'), step: this.str('step'), id: 'b'
      });
    },
    focus: function () { var b = this.$('button'); if (b) b.focus(); }
  });
  K.define('k-button', KButton, { css: C.button.css, attrs: ['label', 'icon', 'variant', 'size', 'full', 'disabled', 'loading', 'reason', 'error', 'aria-label', 'step'] });

  /* ── <k-badge count tone label> (§10.13) ────────────────────────────────── */
  var KBadge = K.make({
    render: function () {
      var n = this.int('count', 0);
      var shown = n > 99 ? '99+' : String(n);
      var lab = this.str('label');
      if (lab) this.setAttribute('aria-label', t('badge.new', { label: lab, n: n })); else this.removeAttribute('aria-label');
      this.setAttribute('role', 'img');
      this.shadowRoot.innerHTML = '<span class="b b--' + esc(this.str('tone', 'danger')) + ' k-foot-s k-num" aria-hidden="true">' + esc(shown) + '</span>';
    }
  });
  K.define('k-badge', KBadge, {
    attrs: ['count', 'tone', 'label'],
    css: ':host{display:inline-block}' +
      '.b{display:inline-flex;align-items:center;justify-content:center;min-width:20px;min-height:20px;padding-inline:5px;border-radius:999px}' +
      '.b--danger{background-color:var(--k-danger-solid);color:var(--k-on-danger)}' +
      '.b--warning{background-color:var(--k-warning-solid);color:var(--k-on-warning)}' +
      '.b--accent{background-color:var(--k-accent);color:var(--k-on-accent);min-width:28px;min-height:28px}'
  });

  /* ── <k-avatar name size photo decorative> (§10.14) ─────────────────────── */
  function initials(name) {
    var w = String(name || '').trim().split(/\s+/).filter(Boolean);
    return ((w[0] || '').charAt(0) + (w.length > 1 ? w[w.length - 1].charAt(0) : '')).toUpperCase();
  }
  var KAvatar = K.make({
    render: function () {
      var size = this.int('size', 40) === 56 ? 56 : (this.int('size', 40) === 44 ? 44 : 40);
      var name = this.str('name'), photo = this.str('photo');
      if (this.flag('decorative')) this.setAttribute('aria-hidden', 'true');
      this.shadowRoot.innerHTML = '<span class="a a' + size + ' k-foot-s"' + (this.flag('decorative') ? '' : ' role="img" aria-label="' + esc(name) + '"') + '>' +
        (photo ? '<img src="' + esc(photo) + '" alt="">' : '<span aria-hidden="true">' + esc(initials(name)) + '</span>') + '</span>';
    }
  });
  K.define('k-avatar', KAvatar, {
    attrs: ['name', 'size', 'photo', 'decorative'],
    css: ':host{display:inline-block}.a{display:inline-flex;align-items:center;justify-content:center;border-radius:50%;overflow:hidden;' +
      'background-color:var(--k-surface-3);color:var(--k-ink-1)}.a40{width:40px;height:40px}.a44{width:44px;height:44px}.a56{width:56px;height:56px}' +
      '.a img{width:100%;height:100%;object-fit:cover}'
  });

  /* ── <k-skeleton> and <k-spinner> (§10.15) ───────────────────────────────
     A skeleton shows only after 150 ms; both loop by design (data-k-loop),
     which motion-park-test exempts, and stand still under reduced motion. */
  var KSkeleton = K.make({
    connected: function () {
      var self = this;
      clearTimeout(this.__t);
      this.__t = setTimeout(function () { var s = self.$('.sk'); if (s) s.classList.add('on'); }, 150);
    },
    render: function () {
      var lines = Math.max(1, this.int('lines', 1));
      var h = this.int('height', 16);
      var html = '';
      for (var i = 0; i < lines; i++) html += '<span class="k-skel" data-k-loop style="height:' + h + 'px;width:' + (i === lines - 1 && lines > 1 ? 62 : 100) + '%"></span>';
      this.shadowRoot.innerHTML = '<span class="sk" aria-hidden="true">' + html + '</span>';
    }
  });
  K.define('k-skeleton', KSkeleton, {
    attrs: ['lines', 'height'],
    css: '.sk{display:flex;flex-direction:column;gap:8px;opacity:0}.sk.on{opacity:1}'
  });

  var KSpinner = K.make({
    render: function () {
      var big = this.int('size', 20) === 32;
      this.setAttribute('role', 'status');
      this.shadowRoot.innerHTML = K.reduced()
        ? '<span class="r k-callout k-ink2">' + icon('progress_activity', big ? 32 : 20) + '<span>' + th('state.loading') + '</span></span>'
        : '<span class="k-spin' + (big ? ' k-spin--32' : '') + '" data-k-loop aria-hidden="true"></span><span class="k-vh">' + th('state.loading') + '</span>';
    }
  });
  K.define('k-spinner', KSpinner, { attrs: ['size'], css: ':host{display:inline-flex}.r{display:inline-flex;align-items:center;gap:8px}' });

  /* ── <k-empty kind icon heading body action-label> (§10.16) ─────────────── */
  var EMPTY_ACTION = { 'first-use': 'primary', filtered: 'plain', error: 'secondary', offline: '' };
  var KEmpty = K.make({
    setup: function () {
      var self = this;
      C.button.bind(this.shadowRoot, function () { self.emit('action'); });
    },
    render: function () {
      var kind = this.str('kind', 'first-use');
      var offline = kind === 'offline';
      var ic = offline ? 'wifi_off' : this.str('icon', 'inbox');
      var h = offline ? t('state.offline_title') : this.str('heading');
      var b = offline ? t('state.offline_body') : this.str('body');
      var v = EMPTY_ACTION[kind];
      var label = this.str('action-label');
      this.shadowRoot.innerHTML = '<div class="e"><span class="c">' + icon(ic, 40) + '</span>' +
        '<h2 class="k-heading h">' + esc(h) + '</h2>' + (b ? '<p class="k-callout k-ink2 p">' + esc(b) + '</p>' : '') +
        (v && label ? C.button.render({ label: label, variant: v, size: 'M', id: 'a' }) : '') + '</div>';
    }
  });
  K.define('k-empty', KEmpty, {
    attrs: ['kind', 'icon', 'heading', 'body', 'action-label'],
    css: C.button.css + '.e{display:flex;flex-direction:column;align-items:center;text-align:center;gap:8px;padding-block:24px;padding-inline:16px}' +
      '.c{display:inline-flex;align-items:center;justify-content:center;width:72px;height:72px;border-radius:50%;background-color:var(--k-surface-2);color:var(--k-ink-2);margin-block-end:8px}' +
      '.h{margin:0}.p{margin:0;max-width:320px}'
  });

  /* ── <k-banner tone message action-label dismissible live> (§10.12) ──────
     A live banner (one that appears without a user action) keeps its region
     in the DOM from load, empty; writing the text announces it once, and a
     re-render with the same text writes nothing. danger → role="alert",
     others → role="status". At most one Plain action; info may be closed. */
  var TONE_ICON = { warning: 'warning', danger: 'error', info: 'info', accent: 'task_alt' };
  var KBanner = K.make({
    setup: function () {
      var self = this;
      K.tap(this.shadowRoot, '[data-b]', function (el) {
        var w = el.getAttribute('data-b');
        if (w === 'close') { self.removeAttribute('message'); self.emit('dismiss'); }
        else self.emit('action');
      });
    },
    render: function () {
      var tone = this.str('tone', 'info');
      var msg = this.str('message');
      var live = this.flag('live');
      if (!this.$('.slot')) {
        this.shadowRoot.innerHTML = '<div class="slot"' + (live ? ' role="' + (tone === 'danger' ? 'alert' : 'status') + '"' : '') + '></div>';
      }
      var slot = this.$('.slot');
      if (live) slot.setAttribute('role', tone === 'danger' ? 'alert' : 'status');
      var key = tone + '|' + msg + '|' + this.str('action-label');
      if (key === this.__last) return;              /* the same banner writes nothing */
      this.__last = key;
      if (!msg) { slot.innerHTML = ''; return; }
      var html = '<div class="bn bn--' + esc(tone) + '">' + icon(TONE_ICON[tone] || 'info', 20, 'ic') +
        '<p class="k-callout m">' + esc(msg) + '</p>' +
        (this.str('action-label') ? '<button type="button" class="act k-callout-s" data-b="act">' + esc(this.str('action-label')) + '</button>' : '') +
        (this.flag('dismissible') && tone === 'info' ? '<button type="button" class="x" data-b="close" aria-label="' + esc(t('action.close')) + '">' + icon('close', 20) + '</button>' : '') + '</div>';
      slot.innerHTML = html;
    }
  });
  K.define('k-banner', KBanner, {
    attrs: ['tone', 'message', 'action-label', 'dismissible', 'live'],
    css: '.bn{display:flex;align-items:flex-start;gap:12px;padding-block:12px;padding-inline:16px;border-radius:var(--k-r-2);color:var(--k-ink-1);' +
      'transition:background-color var(--k-dur-2) var(--k-glide)}' +
      '.bn--warning{background-color:var(--k-warning-tint)}.bn--danger{background-color:var(--k-danger-tint)}' +
      '.bn--info{background-color:var(--k-info-tint)}.bn--accent{background-color:var(--k-accent-tint)}' +
      '.bn--warning .ic{color:var(--k-warning)}.bn--danger .ic{color:var(--k-danger)}.bn--info .ic{color:var(--k-info)}.bn--accent .ic{color:var(--k-accent-ink)}' +
      '.ic{margin-block-start:1px}.m{margin:0;flex:1;min-width:0}' +
      '.act{color:var(--k-accent-ink);min-height:44px;margin-block:-12px;padding-inline:4px}' +
      '.x{width:44px;height:44px;margin-block:-12px;margin-inline-end:-12px;display:inline-flex;align-items:center;justify-content:center;color:var(--k-ink-2)}'
  });

  /* ── <k-switch checked label loading error> (§10.10) ─────────────────────── */
  var KSwitch = K.make({
    setup: function () {
      var self = this;
      C.switch.bind(this.shadowRoot, function (id, checked, gid) {
        if (checked) self.setAttribute('checked', ''); else self.removeAttribute('checked');
        self.removeAttribute('error');
        self.emit('toggle', null, { checked: checked, gestureId: gid });
      });
    },
    get checked() { return this.hasAttribute('checked'); },
    set checked(v) { if (v) this.setAttribute('checked', ''); else this.removeAttribute('checked'); },
    render: function () {
      var lab = this.str('label');
      var err = this.str('error');
      this.shadowRoot.innerHTML = '<div class="row">' +
        (lab ? '<label class="k-body l" for="sw">' + esc(lab) + '</label>' : '') +
        (this.flag('loading') ? '<span class="k-spin k-spin16" data-k-loop aria-hidden="true"></span>' : '') +
        C.switch.render({ id: 'sw', checked: this.flag('checked'), disabled: this.flag('disabled'), label: lab ? '' : this.getAttribute('aria-label'), describedby: err ? 'err' : '' }) +
        '</div>' + (err ? '<p class="k-foot err" id="err" role="status">' + esc(err) + '</p>' : '');
    }
  });
  K.define('k-switch', KSwitch, {
    attrs: ['checked', 'label', 'disabled', 'loading', 'error', 'aria-label'],
    css: C.switch.css + '.row{display:flex;align-items:center;gap:8px;min-height:44px}.l{flex:1}.err{margin:0;color:var(--k-danger)}' +
      ':host([disabled]) .l{color:var(--k-ink-3)}.k-spin16{width:16px;height:16px}'
  });

  /* ── <k-stepper value min max label limit> (§10.11) ─────────────────────── */
  var KStepper = K.make({
    setup: function () {
      var self = this;
      C.stepper.bind(this.shadowRoot, function (id, dir, gid) {
        if (dir === 0) { self.emit('edit', null, { gestureId: gid }); return; }
        var v = self.int('value', 0) + dir;
        var max = self.getAttribute('max') == null ? Infinity : self.int('max', Infinity);
        if (v > max) { self.overLimit(); return; }
        self.setAttribute('value', String(v));
        self.emit('step', null, { value: v, dir: dir, gestureId: gid });
      });
    },
    /* Stock exceeded (a quantity typed past the limit): the value shakes once
       and the Footnote names what is left (§10.11). */
    overLimit: function () {
      this.__err = t('stepper.only_left', { n: this.int('max', 0) });
      this.__shake = true;
      this.render();
      this.__shake = false;
    },
    exceeded: function () { this.overLimit(); },
    attr: function (name) { if (name === 'value') this.__err = ''; this.render(); },
    render: function () {
      this.shadowRoot.innerHTML = C.stepper.render({
        id: 'st', value: this.int('value', 0), min: this.int('min', 0),
        max: this.getAttribute('max') == null ? Infinity : this.int('max', Infinity),
        label: this.str('label'), error: this.__err, shake: this.__shake
      });
    }
  });
  K.define('k-stepper', KStepper, { attrs: ['value', 'min', 'max', 'label'], css: C.stepper.css });

  /* ── <k-chips mode label ground value> + .options (§10.7) ─────────────── */
  var KChips = K.make({
    setup: function () {
      var self = this;
      C.chip.bind(this.shadowRoot, function (value, gid, mode) {
        if (mode === 'multi') {
          var on = self.values(), i = on.indexOf(value);
          if (i >= 0) on.splice(i, 1); else on.push(value);
          self.setAttribute('value', on.join(','));
          self.emit('select', null, { value: on, gestureId: gid });
        } else if (mode === 'source') {
          self.emit('open', null, { value: value, gestureId: gid });
        } else {
          self.setAttribute('value', value);
          self.emit('select', null, { value: value, gestureId: gid });
        }
      });
    },
    values: function () { return this.str('value') ? this.str('value').split(',') : []; },
    get value() { return this.str('value'); },
    render: function () {
      var mode = this.str('mode', 'single');
      var focusVal = this.shadowRoot.activeElement && this.shadowRoot.activeElement.getAttribute('data-chip');
      this.shadowRoot.innerHTML = C.chip.group({ options: this.options || [], value: mode === 'multi' ? this.values() : this.str('value'), mode: mode, label: this.str('label'), ground: this.str('ground') });
      if (focusVal) { var f = this.$('[data-chip="' + focusVal.replace(/"/g, '') + '"]'); if (f) f.focus(); }
    }
  });
  K.define('k-chips', KChips, { attrs: ['mode', 'label', 'ground', 'value'], props: ['options'], css: C.chip.css });

  /* ── <k-field> (§10.9) ───────────────────────────────────────────────────
     Label above, native <label for> in the same root; value in Body ink-1,
     placeholder in Body ink-3, so the field never changes size; helper or
     error linked by aria-describedby. Not form-associated: it exposes name
     and value and re-dispatches change as composed. */
  var KField = K.make({
    setup: function () {
      var self = this;
      this.shadowRoot.addEventListener('input', function (e) {
        if (e.target.id !== 'f') return;
        self.__value = e.target.value;
        self.syncClear();
      });
      this.shadowRoot.addEventListener('change', function (e) {
        if (e.target.id !== 'f') return;
        self.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
      });
      K.tap(this.shadowRoot, '.clr', function () {
        var f = self.$('#f');
        f.value = ''; self.__value = '';
        f.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
        self.syncClear(); f.focus();
        self.emit('clear');
      });
    },
    get value() { var f = this.$('#f'); return f ? f.value : (this.__value != null ? this.__value : this.str('value')); },
    set value(v) { this.__value = v == null ? '' : String(v); var f = this.$('#f'); if (f) f.value = this.__value; this.syncClear && this.syncClear(); },
    get name() { return this.str('name'); },
    syncClear: function () {
      var c = this.$('.clr');
      if (c) c.hidden = !this.value || this.flag('loading');
    },
    attr: function (name) {
      if (name === 'error' || name === 'helper' || name === 'disabled' || name === 'loading' || name === 'label') this.render();
    },
    render: function () {
      var search = this.flag('search');
      var err = this.str('error'), helper = this.str('helper');
      var val = this.__value != null ? this.__value : this.str('value');
      var desc = err ? 'e' : (helper ? 'h' : '');
      var type = this.str('type', search ? 'search' : 'text');
      var focused = this.shadowRoot.activeElement && this.shadowRoot.activeElement.id === 'f';
      this.shadowRoot.innerHTML = '<div class="w">' +
        (this.str('label') ? '<label for="f" class="k-foot-s k-ink2 lb">' + esc(this.str('label')) + '</label>' : '') +
        '<div class="box' + (search ? ' s' : '') + (err ? ' bad' : '') + '">' +
        (search ? icon('search', 20, 'lead') : '') +
        '<input id="f" class="k-body" type="' + esc(type === 'number' ? 'text' : type) + '"' +
        (this.str('name') ? ' name="' + esc(this.str('name')) + '"' : '') +
        ' value="' + esc(val) + '"' +
        (this.str('placeholder') ? ' placeholder="' + esc(this.str('placeholder')) + '"' : '') +
        (this.str('inputmode') ? ' inputmode="' + esc(this.str('inputmode')) + '"' : '') +
        (this.str('autocomplete') ? ' autocomplete="' + esc(this.str('autocomplete')) + '"' : '') +
        (this.str('enterkeyhint') ? ' enterkeyhint="' + esc(this.str('enterkeyhint')) + '"' : '') +
        (!this.str('label') && this.getAttribute('aria-label') ? ' aria-label="' + esc(this.getAttribute('aria-label')) + '"' : '') +
        (desc ? ' aria-describedby="' + desc + '"' : '') + (err ? ' aria-invalid="true"' : '') + (this.flag('disabled') ? ' disabled' : '') + '>' +
        (search ? (this.flag('loading') ? '<span class="k-spin trail" data-k-loop aria-hidden="true"></span>' : '<button type="button" class="clr" aria-label="' + esc(t('field.clear')) + '" hidden>' + icon('close', 20) + '</button>') : '') +
        '</div>' +
        (err ? '<p class="k-foot msg bad-t" id="e">' + icon('error', 16) + '<span>' + esc(err) + '</span></p>' : (helper ? '<p class="k-foot k-ink2 msg" id="h">' + esc(helper) + '</p>' : '')) +
        '</div>';
      this.syncClear();
      if (focused) this.$('#f').focus();
    }
  });
  K.define('k-field', KField, {
    attrs: ['label', 'error', 'helper', 'disabled', 'loading'],
    css: '.w{display:flex;flex-direction:column;gap:4px}.lb{display:block}' +
      '.box{display:flex;align-items:center;gap:8px;min-height:44px;padding-inline:12px;border-radius:var(--k-r-2);background-color:var(--k-surface-1);' +
      'box-shadow:inset 0 0 0 1px var(--k-line-strong);transition:box-shadow var(--k-dur-2) var(--k-glide)}' +
      '.box.s{border-radius:999px;padding-inline-end:0}' +
      '.box:focus-within{box-shadow:inset 0 0 0 2px var(--k-accent)}' +
      '.box.bad,.box.bad:focus-within{box-shadow:inset 0 0 0 2px var(--k-danger)}' +
      'input{flex:1;min-width:0;border:0;background:transparent;color:var(--k-ink-1);padding-block:10px;outline:none;-webkit-appearance:none;appearance:none}' +
      'input::placeholder{color:var(--k-ink-3);opacity:1}' +
      'input:focus-visible{box-shadow:none}' +
      'input::-webkit-search-cancel-button{-webkit-appearance:none}' +
      ':host([disabled]) .box{background-color:var(--k-surface-2)}:host([disabled]) input{color:var(--k-ink-3)}' +
      '.lead{color:var(--k-ink-2)}.clr{width:44px;height:44px;display:inline-flex;align-items:center;justify-content:center;color:var(--k-ink-2);border-radius:50%}' +
      '.trail{margin-inline-end:12px}.msg{margin:0;display:flex;gap:4px;align-items:flex-start}.bad-t{color:var(--k-danger)}'
  });

  /* ── <k-list ground selectable> + .rows (§10.8) ────────────────────────────
     A collection: every row renders in this one root (§20.6). Rows with
     actions get an overflow button on iPad and desktop, and a trailing swipe
     on a phone; every swipe action also exists as a visible control. */
  var SWIPE_W = 72;
  var KList = K.make({
    setup: function () {
      var self = this;
      var R = this.shadowRoot;
      K.tap(R, '[data-row],[data-btn],[data-act],[data-more],[data-retry]', function (el, e, gid) {
        var row = el.closest('[data-id]');
        var id = row ? row.getAttribute('data-id') : null;
        if (el.hasAttribute('data-act')) { self.closeSwipe(); self.emit('action', id, { action: el.getAttribute('data-act'), gestureId: gid }); return; }
        if (el.hasAttribute('data-more')) { self.emit('overflow', id, { gestureId: gid, anchor: el }); return; }
        if (el.hasAttribute('data-retry')) { self.emit('retry', id, { gestureId: gid }); return; }
        if (el.hasAttribute('data-btn')) { self.emit('button', id, { gestureId: gid }); return; }
        if (self.__swiped) { self.closeSwipe(); return; }
        var r = self.rowById(id);
        if (r && r.disabled) return;
        if (r && r.radio) {
          if (r.selected) return;                                          /* the one already chosen fires nothing */
          K.haptic('Choose', gid, { trigger: 'tap' });
        }
        self.emit('select', id, { gestureId: gid });
      });
      C.switch.bind(R, function (swId, checked, gid) {
        var id = swId.replace(/^sw-/, '');
        var r = self.rowById(id); if (r) r.checked = checked;
        self.emit('toggle', id, { checked: checked, gestureId: gid });
      });
      this.bindSwipe();
    },
    rowById: function (id) { return (this.rows || []).filter(function (r) { return String(r.id) === String(id); })[0]; },
    fine: function () { try { return root.matchMedia('(pointer: fine)').matches || root.innerWidth >= 600; } catch (_) { return true; } },
    row: function (r, i, n) {
      var two = !!r.subtitle;
      var lead = r.avatar ? '<span class="lead av">' + '<span class="k-foot-s avi" aria-hidden="true">' + esc(initials(r.avatar)) + '</span></span>'
        : (r.icon ? '<span class="lead sq">' + icon(r.icon, 24) + '</span>' : '');
      var trail = '';
      if (r.loading) trail = '<span class="k-skel" data-k-loop style="width:64px;height:16px"></span>';
      else if (r.error) trail = '<button type="button" class="plain k-body-s" data-retry>' + th('action.try_again') + '</button>';
      else if (r.trailing === 'switch') trail = C.switch.render({ id: 'sw-' + r.id, checked: r.checked, disabled: r.disabled, label: r.title });
      else if (r.trailing === 'button') trail = '<button type="button" class="plain k-body-s" data-btn>' + esc(r.buttonLabel || '') + '</button>';
      else {
        if (r.value != null && r.value !== '') trail += '<span class="k-body k-num val' + (r.disabled ? ' k-ink3' : '') + '">' + esc(r.value) + '</span>';
        if (r.trailing === 'chevron' && !r.disabled) trail += icon('chevron_right', 20, 'chev');
        if (r.radio) trail += '<span class="rad' + (r.selected ? ' on' : '') + '" aria-hidden="true"></span>';
      }
      var acts = r.actions || [];
      var more = acts.length && this.fine() ? '<button type="button" class="more" data-more aria-label="' + esc(t('action.more')) + '">' + icon('more_horiz', 24) + '</button>' : '';
      var swipe = acts.length && !this.fine() ? '<div class="sw-acts" aria-hidden="true">' + acts.map(function (a) {
        return '<button type="button" tabindex="-1" class="sw-a ' + (a.tone === 'danger' ? 'dng' : '') + ' k-foot-s" data-act="' + esc(a.id) + '" data-tier="' + esc(a.tier || 'A') + '">' + esc(a.label) + '</button>';
      }).join('') + '</div>' : '';
      var name = r.title + (r.subtitle ? ', ' + r.subtitle : '') + (r.value ? ', ' + r.value : '');
      var sel = this.flag('selectable');
      var role = r.radio ? ' role="radio" aria-checked="' + (r.selected ? 'true' : 'false') + '"' : (sel ? ' role="option" aria-selected="' + (r.selected ? 'true' : 'false') + '"' : '');
      var mainTag = r.trailing === 'switch' || r.trailing === 'button' || r.error ? 'div' : 'button';
      return '<li class="li' + (i === n - 1 ? ' last' : '') + '" data-id="' + esc(r.id) + '"' + (r.radio || sel ? ' role="none"' : '') + '>' + swipe +
        '<' + mainTag + (mainTag === 'button' ? ' type="button" data-row' : '') + ' class="r k-in' + (two ? ' two' : '') + (r.avatar ? ' avr' : '') + (r.selected && !r.radio ? ' sel' : '') + (r.disabled ? ' dis' : '') + '"' +
        (mainTag === 'button' ? role + ' aria-label="' + esc(name) + '"' + (r.disabled ? ' aria-disabled="true"' : '') : '') + '>' +
        lead + '<span class="tx"><span class="k-body ti' + (r.disabled ? ' k-ink3' : '') + '">' + esc(r.title) + '</span>' +
        (two ? '<span class="k-foot k-ink2 su">' + esc(r.subtitle) + '</span>' : '') + '</span>' +
        '<span class="tr">' + trail + '</span></' + mainTag + '>' + more + '</li>';
    },
    render: function () {
      var rows = this.rows || [];
      var self = this;
      var radio = rows.some(function (r) { return r.radio; });
      var role = radio ? ' role="radiogroup"' : (this.flag('selectable') ? ' role="listbox"' : '');
      this.shadowRoot.innerHTML = '<ul class="g' + (this.str('ground') === 's1' ? ' on-s1' : '') + '"' + role + (this.str('label') ? ' aria-label="' + esc(this.str('label')) + '"' : '') + '>' +
        rows.map(function (r, i) { return self.row(r, i, rows.length); }).join('') + '</ul>';
    },
    /* Swipe on a phone: the row follows the finger; crossing 60 % fires Grab
       (Tier A) or Caution (Tier B) once; a release past it performs the first
       action; otherwise it settles open on the action buttons or closed. */
    bindSwipe: function () {
      var self = this, R = this.shadowRoot, s = null;
      R.addEventListener('pointerdown', function (e) {
        var r = e.target.closest && e.target.closest('.r');
        var li = r && r.closest('.li');
        if (!li || !li.querySelector('.sw-acts') || e.pointerType === 'mouse') { s = null; return; }
        s = { li: li, r: r, x: e.clientX, y: e.clientY, dx: 0, on: false, fired: false, gid: K.gid('swipe'), w: li.getBoundingClientRect().width, n: li.querySelectorAll('.sw-a').length };
      });
      R.addEventListener('pointermove', function (e) {
        if (!s) return;
        var dx = e.clientX - s.x, dy = e.clientY - s.y;
        var rtl = self.hasAttribute('data-k-rtl');
        var pull = rtl ? dx : -dx;                                       /* trailing edge */
        if (!s.on) { if (Math.abs(dy) > 10) { s = null; return; } if (pull > 10) s.on = true; else return; }
        s.dx = Math.max(0, pull);
        s.r.style.transition = 'none';
        s.r.style.transform = 'translateX(' + (rtl ? s.dx : -s.dx) + 'px)';
        var past = s.dx >= s.w * 0.6;
        if (past && !s.fired) {
          s.fired = true;
          var first = s.li.querySelector('.sw-a');
          K.haptic(first && first.getAttribute('data-tier') === 'B' ? 'Caution' : 'Grab', s.gid, { trigger: 'threshold' });
        }
      });
      function end() {
        if (!s || !s.on) { s = null; return; }
        var st = s; s = null;
        var rtl = self.hasAttribute('data-k-rtl');
        st.r.style.transition = '';
        var first = st.li.querySelector('.sw-a');
        if (st.dx >= st.w * 0.6 && first) {
          st.r.style.transform = '';
          self.emit('action', st.li.getAttribute('data-id'), { action: first.getAttribute('data-act'), gestureId: st.gid, swipe: true });
          return;
        }
        var open = st.dx > SWIPE_W * st.n / 2;
        st.r.style.transform = open ? 'translateX(' + (rtl ? 1 : -1) * SWIPE_W * st.n + 'px)' : '';
        self.__swiped = open ? st.li : null;
      }
      R.addEventListener('pointerup', end);
      R.addEventListener('pointercancel', end);
    },
    closeSwipe: function () {
      if (this.__swiped) { var r = this.__swiped.querySelector('.r'); if (r) r.style.transform = ''; this.__swiped = null; }
    }
  });
  K.define('k-list', KList, {
    attrs: ['ground', 'selectable', 'label'],
    props: ['rows'],
    css: C.switch.css +
      ':host{display:block}' +
      '.g{list-style:none;margin:0;padding:0;border-radius:var(--k-r-3);background-color:var(--k-surface-1);overflow:hidden}' +
      '.g.on-s1{background-color:var(--k-surface-2)}' +
      '.li{position:relative;display:flex;align-items:stretch}' +
      '.r{position:relative;z-index:1;flex:1;min-width:0;display:flex;align-items:center;gap:12px;min-height:52px;padding-block:8px;padding-inline:16px;' +
      'background-color:var(--k-surface-1);text-align:start;transition:background-color var(--k-dur-2) var(--k-glide),transform var(--k-dur-3) var(--k-glide)}' +
      '.on-s1 .r{background-color:var(--k-surface-2)}' +
      '.r.two{min-height:64px}.r.avr{min-height:72px}' +
      '@media (pointer:fine){.r,.r.two,.r.avr{min-height:44px}}' +
      'button.r:active{background-color:var(--k-surface-3);transition-duration:0s}' +
      '.r.sel{background-color:var(--k-select);box-shadow:inset 0 0 0 var(--k-select-edge-w) var(--k-line-strong)}' +
      '.r.sel::before{content:"";position:absolute;inset-block:8px;inset-inline-start:0;width:3px;border-radius:2px;background-color:var(--k-accent-ink)}' +
      '.li:not(.last) .r::after{content:"";position:absolute;inset-inline-end:0;bottom:0;height:1px;background-color:var(--k-line);inset-inline-start:var(--sep,16px)}' +
      '.li:not(.last) .r:has(.lead)::after{--sep:64px}' +
      '.lead{flex:none;display:inline-flex;align-items:center;justify-content:center}' +
      '.sq{width:36px;height:36px;border-radius:var(--k-r-1);background-color:var(--k-surface-2);color:var(--k-ink-1)}' +
      '.on-s1 .sq{background-color:var(--k-surface-3)}' +
      '.av{width:40px;height:40px;border-radius:50%;background-color:var(--k-surface-3)}' +
      '.tx{flex:1;min-width:0;display:flex;flex-direction:column}' +
      '.ti,.su{display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;overflow:hidden;overflow-wrap:anywhere}' +
      '.tr{flex:none;display:inline-flex;align-items:center;gap:4px}' +
      '.chev{color:var(--k-ink-3)}' +
      '.plain{color:var(--k-accent-ink);min-height:44px;padding-inline:4px}' +
      '.rad{width:22px;height:22px;border-radius:50%;box-shadow:inset 0 0 0 2px var(--k-line-strong)}' +
      '.rad.on{box-shadow:inset 0 0 0 7px var(--k-accent)}' +
      '.more{flex:none;width:44px;align-self:center;height:44px;display:inline-flex;align-items:center;justify-content:center;color:var(--k-ink-2);margin-inline-end:4px;border-radius:50%}' +
      '.sw-acts{position:absolute;inset-block:0;inset-inline-end:0;display:flex}' +
      '.sw-a{width:72px;background-color:var(--k-surface-3);color:var(--k-ink-1);text-align:center}' +
      '.sw-a.dng{background-color:var(--k-danger-tint);color:var(--k-danger)}' +
      '@media (prefers-reduced-motion:reduce){.r{transition:background-color var(--k-dur-2) var(--k-glide)}}'
  });

  /* ── <k-page-header kind heading subtitle back offline demo loading> (§10.18)
     Phone reading screens: inline title, never a large one. Task screens: a
     large title collapsing to the inline one after 44 of scroll. iPad and
     desktop: Heading on the leading edge. At most two trailing actions. */
  var KHeader = K.make({
    setup: function () {
      var self = this;
      K.tap(this.shadowRoot, '[data-h]', function (el, e, gid) {
        var w = el.getAttribute('data-h');
        if (w === 'back') self.emit('back', null, { gestureId: gid });
        else self.emit('action', w, { gestureId: gid, anchor: el });
      });
    },
    connected: function () {
      var self = this;
      if (this.str('kind') === 'large' && !this.__scroll) {
        this.__scroll = function () { var y = root.scrollY || 0; self.toggleAttribute('data-collapsed', y > 44); };
        root.addEventListener('scroll', this.__scroll, { passive: true });
      }
    },
    disconnected: function () { if (this.__scroll) { root.removeEventListener('scroll', this.__scroll); this.__scroll = null; } },
    render: function () {
      var kind = this.str('kind', 'inline');
      var h = this.str('heading');
      var acts = (this.actions || []).slice(0, 2);
      var caps = (this.flag('offline') ? '<span class="cap k-foot-s">' + th('state.offline') + '</span>' : '') +
        (this.flag('demo') ? '<span class="cap k-foot-s">' + th('state.demo') + '</span>' : '');
      var sub = this.flag('loading') ? '<span class="k-skel" data-k-loop style="width:140px;height:14px"></span>' : (this.str('subtitle') ? '<span class="k-foot k-ink2">' + esc(this.str('subtitle')) + '</span>' : '');
      var back = this.flag('back') ? '<button type="button" class="ib" data-h="back" aria-label="' + esc(t('action.back')) + '">' + icon('chevron_left', 24) + '</button>' : '<span class="sp"></span>';
      var trail = '<span class="acts">' + acts.map(function (a) {
        return '<button type="button" class="ib" data-h="' + esc(a.id) + '" aria-label="' + esc(a.label) + '">' + icon(a.icon, 24) + '</button>';
      }).join('') + '</span>';
      var html;
      if (kind === 'pane') {
        html = '<header class="pane"><div class="pt"><h1 class="k-heading t">' + esc(h) + '</h1>' + caps + '</div>' + trail + (sub ? '<div class="ps">' + sub + '</div>' : '') + '</header>';
      } else {
        html = '<header class="bar">' + back + '<div class="mid"><span class="k-body-s it" ' + (kind === 'large' ? 'aria-hidden="true"' : '') + '>' + esc(h) + '</span>' + caps + '</div>' + trail + '</header>' +
          (kind === 'large' ? '<h1 class="k-title big">' + esc(h) + '</h1>' : '<h1 class="k-vh">' + esc(h) + '</h1>') + (sub ? '<div class="ps">' + sub + '</div>' : '');
      }
      this.shadowRoot.innerHTML = html;
    }
  });
  K.define('k-page-header', KHeader, {
    attrs: ['kind', 'heading', 'subtitle', 'back', 'offline', 'demo', 'loading'],
    props: ['actions'],
    css: '.bar{display:flex;align-items:center;min-height:44px;gap:8px}' +
      '.mid{flex:1;min-width:0;display:flex;align-items:center;justify-content:center;gap:8px}' +
      '.it{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}' +
      ':host([kind="large"]) .it{opacity:0;transition:opacity var(--k-dur-2) var(--k-glide)}' +
      ':host([kind="large"][data-collapsed]) .it{opacity:1}' +
      '.big{margin:0;padding-block:4px 8px}' +
      '.ib{width:44px;height:44px;flex:none;display:inline-flex;align-items:center;justify-content:center;border-radius:50%;color:var(--k-ink-1)}' +
      '.ib:active{background-color:var(--k-surface-2)}' +
      '.sp{width:44px;flex:none}.acts{display:inline-flex;gap:8px;min-width:44px;justify-content:flex-end}' +
      '.cap{display:inline-flex;align-items:center;min-height:24px;padding-inline:8px;border-radius:999px;background-color:var(--k-warning-tint);color:var(--k-ink-1);white-space:nowrap}' +
      '.pane{display:flex;flex-wrap:wrap;align-items:center;gap:8px;padding-block-start:24px}' +
      '.pt{flex:1;min-width:0;display:flex;align-items:center;gap:8px}.t{margin:0}.ps{flex-basis:100%}'
  });
})(typeof window !== 'undefined' ? window : globalThis);
