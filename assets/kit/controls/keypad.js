/* Kiwi · assets/kit/controls/keypad.js · the cash keypad (spec §10.25, §20.6).
 *
 *   KiwiKit.controls.keypad = { css, render(state), bind(root, on), input(text, key, opts) }
 *
 * Rendered by <k-keypad> and inside the payment pane, the cash count, the
 * split and the discount, so there is one keypad. A 3 × 4 grid, direction ltr,
 * one contiguous group (data-k-group) that a sheet never drags (data-k-pad).
 * Key geometry comes from the container: the grid's columns are 1fr, so a key
 * is (content width − 2 × gap) / 3; `form` picks the cap or the phone's flush
 * cells, `short` the 56-tall keys of the compact-short pane.
 * state: { id, form: 'caps'|'flush', short, next (count mode: Next replaces
 *          the decimal key), disabled, decimal ('.'|',') }
 * Adjust fires on pointerdown (the keypad is never a drag region, §15). */
(function (root) {
  'use strict';
  var K = root.KiwiKit;
  if (!K) return;

  var css = [
    '.k-kp{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));column-gap:12px;row-gap:8px;direction:ltr;touch-action:manipulation;-webkit-user-select:none;user-select:none}',
    '.k-kp__k{height:72px;display:flex;align-items:center;justify-content:center;border-radius:var(--k-r-2);background-color:var(--k-surface-2);color:var(--k-ink-1)}',
    '.k-kp__k:active:not([aria-disabled="true"]){background-color:var(--k-surface-3)}',
    '.k-kp__k[aria-disabled="true"]{color:var(--k-ink-3)}',
    '.k-kp__k:focus-visible{box-shadow:inset 0 0 0 var(--k-focus-w) var(--k-focus)}',
    '.k-kp__k--fn{background-color:transparent}',
    '.k-kp--flush{column-gap:0;row-gap:0;box-shadow:inset 0 1px 0 var(--k-line)}',
    '.k-kp--flush .k-kp__k{height:64px;border-radius:0;background-color:transparent;box-shadow:inset -1px -1px 0 var(--k-line)}',
    '.k-kp--flush .k-kp__k:nth-child(3n){box-shadow:inset 0 -1px 0 var(--k-line)}',
    '.k-kp--short .k-kp__k{height:56px}',
    '.k-kp__next{display:inline-flex;align-items:center;gap:4px;color:var(--k-accent-ink);font-weight:var(--k-fw-body-strong)}'
  ].join('\n');

  function decimalMark() {
    var F = K.fmt();
    try { if (F && typeof F.decimal === 'function') return F.decimal(); } catch (_) {}
    var lang = (root.document && root.document.documentElement.lang) || 'en';
    return /^(fr|ar)/.test(lang) ? ',' : '.';
  }

  function render(s) {
    s = s || {};
    var dis = s.disabled ? ' aria-disabled="true"' : '';
    var dec = s.decimal || decimalMark();
    var keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', s.next ? 'next' : 'dec', '0', 'del'];
    return '<div class="k-kp' + (s.form === 'flush' ? ' k-kp--flush' : '') + (s.short ? ' k-kp--short' : '') + '" data-kp="' + K.esc(s.id || 'kp') + '" data-k-group data-k-pad role="group"' +
      (s.label ? ' aria-label="' + K.esc(s.label) + '"' : '') + '>' + keys.map(function (k) {
        if (k === 'del') return '<button type="button" class="k-kp__k k-kp__k--fn" data-kp-key="del" aria-label="' + K.esc(K.t('pin.delete')) + '"' + dis + '>' + K.icon('backspace', 24, 'k-mir') + '</button>';
        if (k === 'next') return '<button type="button" class="k-kp__k k-kp__k--fn k-body-s" data-kp-key="next"' + dis + '><span class="k-kp__next">' + K.esc(K.t('count.next')) + K.icon('arrow_downward', 24) + '</span></button>';
        if (k === 'dec') return '<button type="button" class="k-kp__k k-title" data-kp-key="dec" aria-label="' + (dec === ',' ? ',' : '.') + '"' + dis + '>' + dec + '</button>';
        return '<button type="button" class="k-kp__k k-title k-num" data-kp-key="' + k + '"' + dis + '>' + k + '</button>';
      }).join('') + '</div>';
  }

  /* on(id, key, gestureId). Keys fire on the confirmed tap; the Adjust buzz
     already played on pointerdown, with the same gesture id. */
  function bind(rootNode, on) {
    rootNode.addEventListener('pointerdown', function (e) {
      var el = e.target.closest && e.target.closest('[data-kp-key]');
      if (!el || el.getAttribute('aria-disabled') === 'true') return;
      el.__gid = K.gid('kp');
      K.haptic('Adjust', el.__gid, { trigger: 'pointerdown' });
    });
    K.tap(rootNode, '[data-kp-key]', function (el, e, gid) {
      var box = el.closest('[data-kp]');
      on(box ? box.getAttribute('data-kp') : null, el.getAttribute('data-kp-key'), el.__gid || gid);
    });
  }

  /* The entry rule, kept as a plain string of digits and one '.':
     more than `decimals` decimals is ignored (the caller shakes), a leading
     zero is replaced, and `max` digits before the point cap the amount. */
  function input(text, key, opts) {
    opts = opts || {};
    var decimals = opts.decimals == null ? 2 : opts.decimals;
    var maxInt = opts.maxInt || 7;
    text = text || '';
    if (key === 'del') return { text: text.slice(0, -1), ok: text.length > 0 };
    if (key === 'dec') {
      if (!decimals || text.indexOf('.') >= 0) return { text: text, ok: false };
      return { text: (text || '0') + '.', ok: true };
    }
    if (!/^\d$/.test(key)) return { text: text, ok: false };
    var dot = text.indexOf('.');
    if (dot >= 0 && text.length - dot - 1 >= decimals) return { text: text, ok: false };
    if (dot < 0 && text.replace(/^0+/, '').length >= maxInt) return { text: text, ok: false };
    if (text === '0') return { text: key, ok: true };
    return { text: text + key, ok: true };
  }
  function value(text) { var n = parseFloat(text); return isFinite(n) ? n : 0; }

  K.controls.keypad = { css: css, render: render, bind: bind, input: input, value: value, decimalMark: decimalMark };
})(typeof window !== 'undefined' ? window : globalThis);
