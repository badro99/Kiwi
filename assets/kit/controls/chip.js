/* Kiwi · assets/kit/controls/chip.js · the chip (spec §10.7, §20.6).
 *
 *   KiwiKit.controls.chip = { css, render(state), group(opts), bind(root, on) }
 *
 * 44 × 44 at least, capsule, Callout, inline padding 16 (12, icon 20, 8, label,
 * 16 with a leading icon). Its width is its content; a row wraps to a second
 * row before a chip truncates. The fill is one step from the ground (surface-2
 * on bg or s1, surface-1 on an s2 card: `ground: 's2'`). Selected uses the
 * lens paint. One-of groups are radiogroups (aria-checked); a set where
 * several may be on uses aria-pressed. A source chip (Kiwi AI) is Callout
 * strong in accent ink with a trailing chevron and no selected state.
 * Choose fires on the confirmed tap of a radio chip (§15.1). */
(function (root) {
  'use strict';
  var K = root.KiwiKit;
  if (!K) return;

  var css = [
    '.k-chips{display:flex;flex-wrap:wrap;gap:8px}',
    '.k-chip{display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:44px;min-width:44px;padding-block:8px;padding-inline:16px;',
    'border-radius:999px;background-color:var(--k-surface-2);color:var(--k-ink-1);text-align:center;',
    'transition:background-color var(--k-dur-2) var(--k-glide),color var(--k-dur-2) var(--k-glide)}',
    '.k-chip--ic{padding-inline-start:12px}',
    '.k-chips--s2 .k-chip{background-color:var(--k-surface-1)}',
    '.k-chip:active{background-color:var(--k-surface-3);transition-duration:var(--k-dur-1)}',
    '.k-chip[aria-checked="true"],.k-chip[aria-pressed="true"]{background-color:var(--k-select);',
    'box-shadow:inset 0 0 0 var(--k-select-edge-w) var(--k-line-strong);font-weight:var(--k-fw-callout-strong)}',
    '.k-chip[aria-checked="true"]:focus-visible,.k-chip[aria-pressed="true"]:focus-visible{box-shadow:inset 0 0 0 var(--k-select-edge-w) var(--k-line-strong),0 0 0 2px var(--k-bg),0 0 0 calc(2px + var(--k-focus-w)) var(--k-focus)}',
    '.k-chip:disabled,.k-chip[aria-disabled="true"]{color:var(--k-ink-3);cursor:default}',
    '.k-chip--source{color:var(--k-accent-ink);font-weight:var(--k-fw-callout-strong);padding-inline-end:12px}',
    '.k-chip__l{overflow-wrap:anywhere}'
  ].join('\n');

  /* one chip: { value, label, icon, selected, disabled, ariaLabel, mode } */
  function render(c, mode) {
    mode = mode || 'single';
    var source = mode === 'source';
    var a = '';
    if (mode === 'single') a = ' role="radio" aria-checked="' + (c.selected ? 'true' : 'false') + '" tabindex="' + (c.tab ? '0' : '-1') + '"';
    else if (mode === 'multi') a = ' aria-pressed="' + (c.selected ? 'true' : 'false') + '"';
    return '<button type="button" class="k-chip k-callout' + (c.icon ? ' k-chip--ic' : '') + (source ? ' k-chip--source' : '') + '" data-chip="' + K.esc(c.value) + '"' + a +
      (c.disabled ? ' aria-disabled="true"' : '') + (c.ariaLabel ? ' aria-label="' + K.esc(c.ariaLabel) + '"' : '') + '>' +
      (c.icon ? K.icon(c.icon, 20) : '') + '<span class="k-chip__l">' + K.esc(c.label) + '</span>' +
      (source ? K.icon('chevron_right', 20) : '') + '</button>';
  }

  /* a group: { options:[…], value, mode, label, ground } */
  function group(o) {
    var mode = o.mode || 'single';
    var vals = Array.isArray(o.value) ? o.value : (o.value == null ? [] : [o.value]);
    var opts = o.options || [];
    var anySel = opts.some(function (c) { return vals.indexOf(c.value) >= 0; });
    var html = opts.map(function (c, i) {
      var sel = vals.indexOf(c.value) >= 0;
      return render({ value: c.value, label: c.label, icon: c.icon, ariaLabel: c.ariaLabel, disabled: c.disabled, selected: sel, tab: sel || (!anySel && i === 0) }, mode);
    }).join('');
    var role = mode === 'single' ? ' role="radiogroup"' : (mode === 'multi' ? ' role="group"' : '');
    return '<div class="k-chips' + (o.ground === 's2' ? ' k-chips--s2' : '') + '"' + role + (o.label ? ' aria-label="' + K.esc(o.label) + '"' : '') + ' data-chip-mode="' + mode + '">' + html + '</div>';
  }

  /* on(value, gestureId, mode). Arrow keys move a radio group, mirrored in RTL. */
  function bind(rootNode, on) {
    K.tap(rootNode, '.k-chip', function (el, e, gid) {
      var box = el.closest('[data-chip-mode]');
      var mode = box ? box.getAttribute('data-chip-mode') : 'single';
      if (mode === 'single') {
        if (el.getAttribute('aria-checked') === 'true') return;   /* the one already chosen fires nothing */
        K.haptic('Choose', gid, { trigger: 'tap' });
      }
      on(el.getAttribute('data-chip'), gid, mode, el);
    });
    rootNode.addEventListener('keydown', function (e) {
      var el = e.target && e.target.closest ? e.target.closest('.k-chip[role="radio"]') : null;
      if (!el) return;
      var keys = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };
      var d = keys[e.key];
      if (!d) return;
      var host = rootNode.host || rootNode;
      if (/Arrow(Left|Right)/.test(e.key) && host.hasAttribute && host.hasAttribute('data-k-rtl')) d = -d;
      var all = Array.prototype.slice.call(el.parentNode.querySelectorAll('.k-chip[role="radio"]:not([aria-disabled="true"])'));
      var i = all.indexOf(el);
      var next = all[(i + d + all.length) % all.length];
      if (next && next !== el) { e.preventDefault(); next.focus(); next.click(); }
    });
  }

  K.controls.chip = { css: css, render: render, group: group, bind: bind };
})(typeof window !== 'undefined' ? window : globalThis);
