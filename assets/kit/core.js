/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · assets/kit/core.js · the element layer of the 2027 kit (spec §10.0, §20).
 *
 *   window.KiwiKit
 *
 * Every kit component is a custom element with an OPEN shadow root (§20.1,
 * §20.4), styled by one sheet per component type: a constructed CSSStyleSheet
 * shared through adoptedStyleSheets where the engine has them (iOS 16.4+), one
 * <style> per root below that (§20.6). The host contract of §20.2 is the first
 * rule of every sheet, so page CSS cannot reach in and only the inherit list
 * and the --k-* tokens cross.
 *
 * What a component gets from here, so no component invents its own:
 *   · Element         the base class: root, sheet, data-k on the host (the feel
 *                     layer skips [data-k] hosts, §20.3), RTL flag, labels;
 *   · icon()          the <svg><use> of §8, no viewBox, the sprite URL read
 *                     from the shell's literal <meta name="kiwi-sprite">;
 *   · t(), fmt()      keyed strings and KiwiFormat, never a literal;
 *   · emit()          the one event contract, kiwi:action {action, id, value};
 *   · tap()           the confirmed tap of §14.7 (10 pt, no pointercancel);
 *   · haptic()        KiwiHaptics.play with its trigger, never a direct call;
 *   · say()           a live region write: cleared, then written next frame,
 *                     so a repeat is announced again (§10.2 Rules).
 *
 * Zero dependencies. Loads after tokens-2027.css; strings, format, motion and
 * haptics are optional at load and read at call time.
 * ═══════════════════════════════════════════════════════════════════════════ */
(function (root) {
  'use strict';
  var doc = root.document;
  if (!doc || !root.customElements) return;

  /* ── §20.2 · the host contract, then the parts every root shares ───────── */
  var BASE = [
    ':host{all:initial;visibility:inherit;pointer-events:inherit;cursor:inherit;direction:inherit;color-scheme:inherit;',
    '-webkit-text-size-adjust:inherit;-webkit-tap-highlight-color:inherit;-webkit-touch-callout:inherit;',
    '-webkit-user-select:inherit;user-select:inherit;font-family:var(--k-font);color:var(--k-ink-1);display:block}',
    ':host([hidden]){display:none}',
    '*,*::before,*::after{box-sizing:border-box}',
    'button,input,select,textarea,label,a{font:inherit;color:inherit;letter-spacing:inherit;margin:0;',
    '-webkit-tap-highlight-color:transparent;-webkit-touch-callout:none}',
    'button,label,a,[role="button"],[role="radio"],[role="switch"]{-webkit-user-select:none;user-select:none}',
    'input,textarea{-webkit-user-select:text;user-select:text}',
    'button{background:none;border:0;padding:0;cursor:pointer;touch-action:manipulation;text-align:inherit}',
    'a{text-decoration:none}',
    /* §10.0 focus: a box-shadow ring follows the radius on every WebKit; the
       transparent outline keeps a ring in forced colours. Script-moved focus
       draws none, because only :focus-visible draws. */
    ':focus{outline:none}',
    ':focus-visible{outline:2px solid transparent;box-shadow:0 0 0 2px var(--k-bg),0 0 0 calc(2px + var(--k-focus-w)) var(--k-focus)}',
    '.k-in:focus-visible{box-shadow:inset 0 0 0 var(--k-focus-w) var(--k-focus)}',
    '.k-vh{position:absolute;width:1px;height:1px;margin:-1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap;border:0;padding:0}',
    '.k-ic{display:inline-block;flex:none;width:24px;height:24px;fill:currentColor;vertical-align:middle;overflow:visible}',
    '.k-ic16{width:16px;height:16px}.k-ic20{width:20px;height:20px}.k-ic32{width:32px;height:32px}.k-ic40{width:40px;height:40px}',
    ':host([data-k-rtl]) .k-mir{transform:scaleX(-1)}',
    '.k-num{font-variant-numeric:tabular-nums}',
    /* the six steps (§6.2), plain and strong; a component never sets its own root */
    '.k-display{font-size:var(--k-fs-display);line-height:var(--k-lh-display);font-weight:var(--k-fw-display);letter-spacing:var(--k-track-display)}',
    '.k-title{font-size:var(--k-fs-title);line-height:var(--k-lh-title);font-weight:var(--k-fw-title);letter-spacing:var(--k-track-title)}',
    '.k-heading{font-size:var(--k-fs-heading);line-height:var(--k-lh-heading);font-weight:var(--k-fw-heading);letter-spacing:var(--k-track-heading)}',
    '.k-body{font-size:var(--k-fs-body);line-height:var(--k-lh-body);font-weight:var(--k-fw-body);letter-spacing:var(--k-track-body)}',
    '.k-body-s{font-size:var(--k-fs-body);line-height:var(--k-lh-body);font-weight:var(--k-fw-body-strong);letter-spacing:var(--k-track-body)}',
    '.k-callout{font-size:var(--k-fs-callout);line-height:var(--k-lh-callout);font-weight:var(--k-fw-callout);letter-spacing:var(--k-track-callout)}',
    '.k-callout-s{font-size:var(--k-fs-callout);line-height:var(--k-lh-callout);font-weight:var(--k-fw-callout-strong);letter-spacing:var(--k-track-callout)}',
    '.k-foot{font-size:var(--k-fs-footnote);line-height:var(--k-lh-footnote);font-weight:var(--k-fw-footnote);letter-spacing:var(--k-track-footnote)}',
    '.k-foot-s{font-size:var(--k-fs-footnote);line-height:var(--k-lh-footnote);font-weight:var(--k-fw-footnote-strong);letter-spacing:var(--k-track-footnote)}',
    '.k-ink2{color:var(--k-ink-2)}.k-ink3{color:var(--k-ink-3)}.k-accent-ink{color:var(--k-accent-ink)}.k-danger-ink{color:var(--k-danger)}',
    /* §10.15 skeleton block and loop, shared by every component that loads */
    '.k-skel{display:block;background-color:var(--k-surface-2);border-radius:var(--k-r-1);animation:k-pulse var(--k-dur-9) linear infinite alternate}',
    '@keyframes k-pulse{from{opacity:1}to{opacity:.6}}',
    '@keyframes k-shake{0%{transform:translateX(0)}14%{transform:translateX(-10px)}28%{transform:translateX(10px)}42%{transform:translateX(-8px)}',
    '57%{transform:translateX(8px)}71%{transform:translateX(-4px)}85%{transform:translateX(4px)}100%{transform:translateX(0)}}',
    '.k-shake{animation:k-shake var(--k-dur-6) var(--k-glide)}',
    /* §10.15 spinner: a 2 px accent arc, one turn per --k-dur-9; static under reduced motion */
    '.k-spin{display:inline-block;flex:none;width:20px;height:20px;border-radius:50%;border:2px solid transparent;border-top-color:var(--k-accent);',
    'border-inline-end-color:var(--k-accent);animation:k-turn var(--k-dur-9) linear infinite}',
    '.k-spin--32{width:32px;height:32px}',
    '@keyframes k-turn{to{transform:rotate(360deg)}}',
    '@media (prefers-reduced-motion:reduce){.k-skel{animation:none}.k-shake{animation:none}.k-spin{animation:none;border-color:var(--k-line-strong);border-top-color:var(--k-accent)}}'
  ].join('\n');

  /* ── sheets: one per component type (§20.6) ────────────────────────────── */
  var canAdopt = (function () {
    try { return 'adoptedStyleSheets' in Document.prototype && typeof CSSStyleSheet.prototype.replaceSync === 'function' && !!new CSSStyleSheet(); }
    catch (_) { return false; }
  })();
  /* §9.6: in the DOM an argument is a <bdi>; U+2068 and U+2069 belong to
     attributes. A label built with t() (a caller's fixture, a page's own
     string) arrives with FSI … PDI around each argument; written into a text
     node it would put the isolates in the corpus and, in Arabic, let a sign
     drift off its number. Every text a kit root receives is rewritten before
     it paints (a mutation callback is a microtask): FSI x PDI becomes
     <bdi>x</bdi>, and a figure x keeps its number in <bdi dir="ltr"> (§6.3). */
  var FSI = '\u2068', PDI = '\u2069';
  function isolateText(n) {
    var v = n.nodeValue, a = v.indexOf(FSI);
    if (a < 0) return;
    var S = root.KiwiStrings, frag = doc.createDocumentFragment(), at = 0;
    while (a >= 0) {
      var b = v.indexOf(PDI, a + 1);
      if (b < 0) break;
      if (a > at) frag.appendChild(doc.createTextNode(v.slice(at, a)));
      var bdi = doc.createElement('bdi');
      var x = v.slice(a + 1, b);
      if (S && typeof S.fig === 'function') bdi.innerHTML = S.fig(x); else bdi.textContent = x;
      frag.appendChild(bdi);
      at = b + 1;
      a = v.indexOf(FSI, at);
    }
    if (at < v.length) frag.appendChild(doc.createTextNode(v.slice(at).replace(/[\u2068\u2069]/g, '')));
    if (n.parentNode) n.parentNode.replaceChild(frag, n);
  }
  function isolateTree(node) {
    if (node.nodeType === 3) { isolateText(node); return; }
    if (node.nodeType !== 1 && node.nodeType !== 11) return;
    var w = doc.createTreeWalker(node, 4), list = [], n;
    while ((n = w.nextNode())) if (n.nodeValue.indexOf(FSI) >= 0) list.push(n);
    list.forEach(isolateText);
  }
  function isolateRoot(shadow) {
    isolateTree(shadow);
    try {
      new MutationObserver(function (records) {
        records.forEach(function (r) {
          if (r.type === 'characterData') isolateText(r.target);
          else for (var i = 0; i < r.addedNodes.length; i++) isolateTree(r.addedNodes[i]);
        });
      }).observe(shadow, { childList: true, subtree: true, characterData: true });
    } catch (_) {}
  }

  var sheetCache = {};
  function styleRoot(shadow, type, css) {
    var text = BASE + '\n' + (css || '');
    if (canAdopt) {
      var s = sheetCache[type];
      if (!s) { s = new CSSStyleSheet(); s.replaceSync(text); sheetCache[type] = s; }
      shadow.adoptedStyleSheets = [s];
    } else {
      /* Below iOS 16.4: a <style> in the root. A render that writes the
         root's innerHTML removes it, so it is put back before the frame
         paints (a mutation callback runs as a microtask). */
      var st = doc.createElement('style');
      st.textContent = text;
      shadow.appendChild(st);
      try {
        new MutationObserver(function () { if (st.parentNode !== shadow) shadow.insertBefore(st, shadow.firstChild); })
          .observe(shadow, { childList: true });
      } catch (_) {}
    }
  }

  /* ── small helpers ──────────────────────────────────────────────────────── */
  var ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  function esc(s) { return s == null ? '' : String(s).replace(/[&<>"']/g, function (c) { return ESC[c]; }); }

  function t(key, args) {
    var S = root.KiwiStrings;
    if (!key) return '';
    if (S && typeof S.t === 'function') {
      try { var v = S.t(key, args); if (Array.isArray(v)) v = v.join(' '); return v; } catch (_) { /* a missing key reads as itself */ }
    }
    return key;
  }
  /* t() for text inside a template: escaped HTML, each argument in its own
     <bdi> (§9.6). t() itself stays for attributes, where FSI/PDI isolate. */
  function th(key, args) {
    var S = root.KiwiStrings;
    if (!key) return '';
    if (S && typeof S.html === 'function') {
      try { var v = S.html(key, args); if (Array.isArray(v)) v = v.join(' '); return v; } catch (_) { /* a missing key reads as itself */ }
    }
    return esc(t(key, args));
  }
  /* A KiwiFormat figure inside a template: the number in <bdi dir="ltr">,
     the unit outside it (§6.3), so a sign stays on its number in Arabic. */
  function numHtml(text) {
    var S = root.KiwiStrings;
    return S && typeof S.fig === 'function' ? S.fig(text) : esc(text);
  }
  function fmt() { return root.KiwiFormat || null; }
  function money(n, digits) {
    var F = fmt();
    if (n == null || n === '' || !isFinite(n)) return '';
    return F ? F.money(n, digits == null ? 2 : digits) : String(n);
  }

  var spriteUrl = null;
  function sprite() {
    if (spriteUrl !== null) return spriteUrl;
    var m = doc.querySelector('meta[name="kiwi-sprite"]');
    spriteUrl = (m && m.getAttribute('content')) || '';
    return spriteUrl;
  }
  /* §8: the referencing svg has NO viewBox; the <use> spans the whole box.
     Mirrored glyphs (§9.5) carry k-mir and flip only in RTL. */
  var MIRROR = { chevron_left: 1, chevron_right: 1, arrow_back: 1, arrow_forward: 1, send: 1, backspace: 1, undo: 1, redo: 1, logout: 1, open_in_new: 1, reply: 1 };
  function icon(name, size, extra) {
    if (!name) return '';
    var cls = 'k-ic' + (size && size !== 24 ? ' k-ic' + size : '') + (MIRROR[name] ? ' k-mir' : '') + (extra ? ' ' + extra : '');
    return '<svg class="' + cls + '" width="1em" height="1em" aria-hidden="true" focusable="false" data-i="' + esc(name) + '">' +
      '<use href="' + esc(sprite()) + '#' + esc(name) + '" width="100%" height="100%"></use></svg>';
  }

  function emit(host, action, id, value) {
    if (!/^k\.[a-z0-9-]+\.[a-z0-9-]+$/.test(action)) throw new Error('KiwiKit: action name must be k.<component>.<verb>: ' + action);
    host.dispatchEvent(new CustomEvent('kiwi:action', { bubbles: true, composed: true, detail: { action: action, id: id == null ? (host.id || null) : id, value: value } }));
  }

  var gidSeq = 0;
  function gid(prefix) {
    var H = root.KiwiHaptics;
    if (H && typeof H.gid === 'function') { try { return H.gid(prefix); } catch (_) {} }
    gidSeq += 1;
    return (prefix || 'g') + ':' + Date.now().toString(36) + ':' + gidSeq;
  }
  function haptic(cls, gestureId, meta) {
    var H = root.KiwiHaptics;
    if (!H || typeof H.play !== 'function') return null;
    try { return H.play(cls, gestureId, undefined, meta || { trigger: 'tap' }); } catch (_) { return null; }
  }

  /* §10.2 Rules: a region present and empty from the start; a write is a clear,
     then the text in the next frame, so the same words are announced again. */
  function say(region, text) {
    if (!region) return;
    region.textContent = '';
    if (!text) return;
    var raf = root.requestAnimationFrame || function (f) { return setTimeout(f, 16); };
    raf(function () { region.textContent = text; });
  }

  /* The haptics clock: a verdict buzzes only within 600 ms of this stamp. */
  function now() {
    try { if (root.performance && typeof root.performance.now === 'function') return root.performance.now(); } catch (_) {}
    return Date.now();
  }

  function reduced() {
    try { return !!(root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (_) { return false; }
  }

  /* ── §14.7 · the confirmed tap ───────────────────────────────────────────
     A pointer that moved more than 10 pt or was cancelled by a scroll is not a
     tap. Keyboard activation (Enter, Space) has no pointer and is a tap. The
     handler gets (target, event, gestureId); the gesture id is minted at the
     press so a haptic and its action share it. */
  var TAP_SLOP = 10;
  function tap(rootNode, selector, fn) {
    var press = null;
    rootNode.addEventListener('pointerdown', function (e) {
      var el = e.target && e.target.closest ? e.target.closest(selector) : null;
      press = el ? { el: el, x: e.clientX, y: e.clientY, moved: false, id: e.pointerId, gid: gid('tap'), at: e.timeStamp } : null;
    }, true);
    rootNode.addEventListener('pointermove', function (e) {
      if (!press || e.pointerId !== press.id) return;
      if (Math.abs(e.clientX - press.x) > TAP_SLOP || Math.abs(e.clientY - press.y) > TAP_SLOP) press.moved = true;
    }, true);
    rootNode.addEventListener('pointercancel', function () { if (press) press.moved = true; }, true);
    rootNode.addEventListener('click', function (e) {
      var el = e.target && e.target.closest ? e.target.closest(selector) : null;
      if (!el) return;
      var p = press; press = null;
      if (p && p.el === el && p.moved) return;                   /* a scroll or a drag, not a tap */
      if (el.getAttribute('aria-disabled') === 'true' || el.disabled) return;
      fn(el, e, p && p.el === el ? p.gid : gid('key'));
    });
  }

  /* ── the base element ───────────────────────────────────────────────────── */
  var Element = (function () {
    function KitElement() { return Reflect.construct(HTMLElement, [], new.target); }
    KitElement.prototype = Object.create(HTMLElement.prototype);
    KitElement.prototype.constructor = KitElement;
    Object.setPrototypeOf(KitElement, HTMLElement);
    return KitElement;
  })();

  Element.prototype.connectedCallback = function () {
    if (!this.shadowRoot) {
      this.attachShadow({ mode: 'open' });
      var C = this.constructor;
      styleRoot(this.shadowRoot, C.tag || this.localName, C.css || '');
      isolateRoot(this.shadowRoot);
    }
    this.setAttribute('data-k', this.localName.slice(2));
    this.syncDir();
    if (!this.__kSetup) { this.__kSetup = true; upgrade(this); if (this.setup) this.setup(); }
    if (this.render) this.render();
    if (this.connected) this.connected();
    var self = this;
    if (!this.__kLang) {
      this.__kLang = function () { self.syncDir(); if (self.render) self.render(); };
      root.addEventListener('kiwi:langchange', this.__kLang);
    }
  };
  Element.prototype.disconnectedCallback = function () {
    if (this.__kLang) { root.removeEventListener('kiwi:langchange', this.__kLang); this.__kLang = null; }
    if (this.disconnected) this.disconnected();
  };
  Element.prototype.attributeChangedCallback = function (name, before, after) {
    if (before === after || !this.shadowRoot) return;
    if (this.attr) this.attr(name, before, after);
    else if (this.render) this.render();
  };
  Element.prototype.syncDir = function () {
    var rtl = false;
    try { rtl = root.getComputedStyle(this).direction === 'rtl'; } catch (_) {}
    if (rtl) this.setAttribute('data-k-rtl', ''); else this.removeAttribute('data-k-rtl');
    return rtl;
  };
  Element.prototype.$ = function (sel) { return this.shadowRoot ? this.shadowRoot.querySelector(sel) : null; };
  Element.prototype.$$ = function (sel) { return this.shadowRoot ? Array.prototype.slice.call(this.shadowRoot.querySelectorAll(sel)) : []; };
  Element.prototype.flag = function (name) { return this.hasAttribute(name); };
  Element.prototype.str = function (name, dflt) { var v = this.getAttribute(name); return v == null ? (dflt == null ? '' : dflt) : v; };
  Element.prototype.int = function (name, dflt) { var v = parseInt(this.getAttribute(name), 10); return isFinite(v) ? v : dflt; };
  Element.prototype.emit = function (verb, id, value) { emit(this, 'k.' + this.localName.slice(2) + '.' + verb, id, value); };
  /* A property set before the element upgraded lives on the instance and
     would shadow the class accessor: take it over once. */
  function upgrade(el) {
    var props = el.constructor.props || [];
    props.forEach(function (p) {
      if (Object.prototype.hasOwnProperty.call(el, p)) { var v = el[p]; delete el[p]; el[p] = v; }
    });
  }

  /* A data property that re-renders on set: define(Klass, 'rows'). */
  function prop(Klass, name, after) {
    Object.defineProperty(Klass.prototype, name, {
      configurable: true,
      get: function () { return this['__' + name]; },
      set: function (v) { this['__' + name] = v; if (this.shadowRoot && this.render) { if (after) after.call(this, v); this.render(); } }
    });
    (Klass.props = Klass.props || []).push(name);
  }

  function define(tag, Klass, opts) {
    opts = opts || {};
    Klass.tag = tag;
    Klass.css = opts.css || Klass.css || '';
    if (opts.attrs) Object.defineProperty(Klass, 'observedAttributes', { get: function () { return opts.attrs; } });
    (opts.props || []).forEach(function (p) { prop(Klass, p); });
    if (!root.customElements.get(tag)) root.customElements.define(tag, Klass);
    return Klass;
  }

  /* class X extends KiwiKit.Element, without the class keyword (ES5 files). */
  function make(proto) {
    function C() { return Reflect.construct(Element, [], new.target || C); }
    C.prototype = Object.create(Element.prototype);
    C.prototype.constructor = C;
    Object.setPrototypeOf(C, Element);
    Object.keys(proto || {}).forEach(function (k) { Object.defineProperty(C.prototype, k, Object.getOwnPropertyDescriptor(proto, k)); });
    return C;
  }

  root.KiwiKit = {
    Element: Element, define: define, make: make, prop: prop,
    BASE: BASE, styleRoot: styleRoot, canAdopt: canAdopt,
    esc: esc, t: t, th: th, numHtml: numHtml, fmt: fmt, money: money, icon: icon, sprite: sprite,
    emit: emit, gid: gid, haptic: haptic, say: say, tap: tap, reduced: reduced, now: now,
    controls: {}
  };
})(typeof window !== 'undefined' ? window : globalThis);
