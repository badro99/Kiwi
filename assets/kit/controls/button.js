/* Kiwi · assets/kit/controls/button.js · the one button (spec §10.1, §20.6).
 *
 *   KiwiKit.controls.button = { css, render(state), bind(root, onPress) }
 *
 * Rendered by <k-button> and by every collection that holds a button (bill
 * footer, ticket actions, payment pane), so there is one button and one CSS.
 * state: { label, icon, variant, size, full, disabled, loading, reason, error,
 *          ariaLabel, id, attrs, step }
 *   variant  primary · primary-icon · secondary · item · tonal-danger ·
 *            danger · plain · icon
 *   size     L · M (default) · S · K
 * The amount is part of the keyed label, never a second slot. The button never
 * has a fixed width: full width in its container, or sized to its content. */
(function (root) {
  'use strict';
  var K = root.KiwiKit;
  if (!K) return;

  var css = [
    '.k-btnw{display:flex;flex-direction:column;gap:4px;max-width:100%}',
    '.k-btnw--full{width:100%}',
    '.k-btn{position:relative;display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:44px;padding-block:8px;padding-inline:16px;',
    'border-radius:999px;background-color:var(--k-surface-2);color:var(--k-ink-1);text-align:center;max-width:100%;',
    'transition:transform var(--k-dur-4) var(--k-spring),background-color var(--k-dur-2) var(--k-glide),color var(--k-dur-2) var(--k-glide)}',
    '.k-btn:active{transform:scale(.97);background-color:var(--k-surface-3);transition-duration:var(--k-dur-1);transition-timing-function:var(--k-glide)}',
    '.k-btnw--full .k-btn{width:100%}',
    '.k-btn__l{min-width:0;overflow-wrap:anywhere}',
    '.k-btn--L{min-height:56px;padding-inline:20px}',
    '.k-btn--S{min-height:36px;padding-inline:12px}',
    '.k-btn--S::after{content:"";position:absolute;inset:-4px 0}',
    '.k-btn--K{min-height:64px;padding-inline:24px}',
    '.k-btn--primary{background-color:var(--k-accent);color:var(--k-on-accent)}',
    '.k-btn--primary:active{background-color:var(--k-accent-pressed)}',
    '.k-btn--primary-icon{width:44px;min-width:44px;padding:0;background-color:var(--k-accent);color:var(--k-on-accent)}',
    '.k-btn--primary-icon:active{background-color:var(--k-accent-pressed)}',
    '.k-btn--item{background-color:var(--k-item-fill,var(--k-surface-2));font-weight:var(--k-fw-body-strong)}',
    '.k-btn--tonal-danger{background-color:var(--k-danger-tint);color:var(--k-danger)}',
    '.k-btn--danger{background-color:var(--k-danger-solid);color:var(--k-on-danger)}',
    '.k-btn--danger:active{background-color:var(--k-danger-solid)}',
    '.k-btn--plain{background-color:transparent;color:var(--k-accent-ink);padding-inline:4px;border-radius:var(--k-r-1)}',
    '.k-btn--plain:active{background-color:transparent;transform:none;opacity:.6}',
    '.k-btn--icon{width:44px;min-width:44px;padding:0;background-color:transparent;color:var(--k-ink-1)}',
    '.k-btn--icon:active{background-color:var(--k-surface-2)}',
    '.k-btn:disabled,.k-btn[aria-disabled="true"]{background-color:var(--k-surface-3);color:var(--k-ink-3);transform:none;cursor:default}',
    '.k-btn--plain:disabled,.k-btn--icon:disabled{background-color:transparent}',
    '.k-btn[aria-busy="true"]{cursor:progress}',
    '.k-btn__err{color:var(--k-danger)}',
    '.k-btn__why{color:var(--k-ink-2);text-align:center}',
    /* above text-size factor 1 the icon drops first, then the label wraps (§10.1) */
    '.k-big .k-btn__ic{display:none}'
  ].join('\n');

  var STEP = { L: 'k-body-s', M: 'k-body-s', K: 'k-body-s', S: 'k-callout-s' };

  function bigType() {
    try { return parseFloat(root.getComputedStyle(root.document.documentElement).getPropertyValue('--type-scale')) > 1; } catch (_) { return false; }
  }

  function render(s) {
    s = s || {};
    var v = s.variant || 'secondary';
    var size = s.size || 'M';
    var id = s.id || 'b';
    var iconOnly = v === 'icon' || v === 'primary-icon';
    var step = v === 'plain' ? (s.step === 'footnote' ? 'k-foot-s' : 'k-body-s') : (STEP[size] || 'k-body-s');
    var cls = 'k-btn k-btn--' + v + (iconOnly ? '' : ' k-btn--' + size) + ' ' + step;
    var described = [];
    var out = '<div class="k-btnw' + (s.full ? ' k-btnw--full' : '') + (bigType() ? ' k-big' : '') + '">';
    if (s.error) { out += '<span class="k-btn__err k-foot-s" id="' + id + '-err">' + K.esc(s.error) + '</span>'; described.push(id + '-err'); }
    var spin = s.loading && s.spinning ? '<span class="k-spin" data-k-loop aria-hidden="true"></span>' : '';
    var ic = s.icon ? K.icon(s.icon, iconOnly ? 24 : 20, 'k-btn__ic') : '';
    if (s.loading && s.spinning && s.icon) ic = '';
    if (s.disabled && s.reason) described.push(id + '-why');
    out += '<button type="button" class="' + cls + '" id="' + id + '"' +
      (s.disabled ? ' disabled' : '') +
      (s.loading ? ' aria-busy="true"' : '') +
      (iconOnly || s.ariaLabel ? ' aria-label="' + K.esc(s.ariaLabel || s.label || '') + '"' : '') +
      (described.length ? ' aria-describedby="' + described.join(' ') + '"' : '') +
      (s.attrs || '') + '>' + spin + ic +
      (iconOnly ? '' : '<span class="k-btn__l">' + K.esc(s.label || '') + '</span>') + '</button>';
    if (s.disabled && s.reason) out += '<span class="k-btn__why k-foot" id="' + id + '-why">' + K.esc(s.reason) + '</span>';
    return out + '</div>';
  }

  /* Repeat taps while busy are ignored (§10.1 Loading). */
  function bind(rootNode, onPress, selector) {
    K.tap(rootNode, selector || '.k-btn', function (el, e, gid) {
      if (el.getAttribute('aria-busy') === 'true') return;
      onPress(el, gid, e);
    });
  }

  K.controls.button = { css: css, render: render, bind: bind };
})(typeof window !== 'undefined' ? window : globalThis);
