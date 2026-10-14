/* Kiwi · assets/kit/controls/stepper.js · the stepper (spec §10.11, §20.6).
 *
 *   KiwiKit.controls.stepper = { css, render(state), bind(root, on) }
 *
 * Two 44 circles (remove, add) and the value between them, which is itself a
 * button that opens the cash keypad or a numeric field: the circles are for
 * small corrections. In RTL the minus sits at the start, on the right, which
 * flex does by itself. Adjust fires on the confirmed tap (every stepper in the
 * kit sits in a scroller, §15.2), including a step from 1 to 0 that removes an
 * unsent line, and only Adjust (§15.4).
 * state: { id, value, min, max, label, error } */
(function (root) {
  'use strict';
  var K = root.KiwiKit;
  if (!K) return;

  var css = [
    '.k-st{display:inline-flex;flex-direction:column;align-items:center;gap:4px}',
    '.k-st__row{display:inline-flex;align-items:center;gap:8px}',
    '.k-st__b{width:44px;height:44px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;',
    'background-color:var(--k-surface-2);color:var(--k-ink-1);transition:background-color var(--k-dur-2) var(--k-glide),transform var(--k-dur-4) var(--k-spring)}',
    '.k-st__b:active{background-color:var(--k-surface-3);transition-duration:var(--k-dur-1)}',
    '.k-st__b:disabled{color:var(--k-ink-3);background-color:var(--k-surface-2);cursor:default}',
    '.k-st__v{min-width:44px;min-height:44px;padding-inline:4px;border-radius:var(--k-r-1);text-align:center}',
    '.k-st__v:active{background-color:var(--k-surface-2)}',
    '.k-st__err{color:var(--k-danger)}'
  ].join('\n');

  function render(s) {
    s = s || {};
    var id = s.id || 'st';
    var v = Number(s.value) || 0;
    var min = s.min == null ? 0 : s.min;
    var max = s.max == null ? Infinity : s.max;
    var label = s.label || '';
    var F = K.fmt();
    var shown = F ? F.num(v) : String(v);
    return '<div class="k-st" data-st="' + K.esc(id) + '">' +
      '<div class="k-st__row' + (s.shake ? ' k-shake' : '') + '" role="group" aria-label="' + K.esc(label) + '">' +
      '<button type="button" class="k-st__b" data-st-dir="-1" aria-label="' + K.esc(K.t('stepper.decrease', { label: label })) + '"' + (v <= min ? ' disabled' : '') + '>' + K.icon('remove', 24) + '</button>' +
      '<button type="button" class="k-st__v k-heading k-num" data-st-dir="0" aria-label="' + K.esc(K.t('stepper.value', { label: label, n: v })) + '">' + K.esc(shown) + '</button>' +
      '<button type="button" class="k-st__b" data-st-dir="1" aria-label="' + K.esc(K.t('stepper.increase', { label: label })) + '"' + (v >= max ? ' disabled' : '') + '>' + K.icon('add', 24) + '</button>' +
      '</div>' +
      (s.error ? '<span class="k-st__err k-foot" role="status">' + K.esc(s.error) + '</span>' : '') +
      '</div>';
  }

  /* on(id, dir, gestureId): dir -1 or +1 for a step, 0 for the value button. */
  function bind(rootNode, on) {
    K.tap(rootNode, '[data-st-dir]', function (el, e, gid) {
      var box = el.closest('[data-st]');
      var dir = Number(el.getAttribute('data-st-dir'));
      if (dir !== 0) K.haptic('Adjust', gid, { trigger: 'tap' });
      on(box ? box.getAttribute('data-st') : null, dir, gid);
    });
  }

  K.controls.stepper = { css: css, render: render, bind: bind };
})(typeof window !== 'undefined' ? window : globalThis);
