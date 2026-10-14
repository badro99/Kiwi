/* Kiwi · assets/kit/controls/switch.js · the switch (spec §10.10, §20.6).
 *
 *   KiwiKit.controls.switch = { css, render(state), bind(root, on) }
 *
 * A native <input type="checkbox" role="switch"> inside the root: iOS geometry,
 * track 51 × 31, knob 27, hit 44. The knob travels on --k-spring over
 * --k-dur-4 (transform only); a press widens it by scale, never by width.
 * Adjust fires on the toggle, once; a remote save that fails sends the knob
 * back with switch.save_failed and no second haptic (§15.4).
 * state: { id, checked, disabled, label, loading, error } */
(function (root) {
  'use strict';
  var K = root.KiwiKit;
  if (!K) return;

  var css = [
    '.k-sw{display:inline-flex;align-items:center;justify-content:center;min-width:51px;min-height:44px;position:relative;cursor:pointer}',
    '.k-sw input{position:absolute;inset:0;width:100%;height:100%;margin:0;opacity:0;cursor:inherit}',
    '.k-sw__t{display:block;width:51px;height:31px;border-radius:999px;background-color:var(--k-surface-3);',
    'box-shadow:inset 0 0 0 1px var(--k-line-strong);transition:background-color var(--k-dur-2) var(--k-glide),box-shadow var(--k-dur-2) var(--k-glide);position:relative}',
    '.k-sw__k{position:absolute;top:2px;inset-inline-start:2px;width:27px;height:27px;border-radius:50%;background-color:var(--k-surface-1);',
    'box-shadow:var(--k-shadow-1);transform-origin:center;transition:transform var(--k-dur-4) var(--k-spring)}',
    '.k-sw input:checked + .k-sw__t{background-color:var(--k-accent);box-shadow:none}',
    '.k-sw input:checked + .k-sw__t .k-sw__k{transform:translateX(20px)}',
    ':host([data-k-rtl]) .k-sw input:checked + .k-sw__t .k-sw__k{transform:translateX(-20px)}',
    '.k-sw input:active + .k-sw__t .k-sw__k{transform:scaleX(1.148)}',
    '.k-sw input:checked:active + .k-sw__t .k-sw__k{transform:translateX(20px) scaleX(1.148)}',
    ':host([data-k-rtl]) .k-sw input:checked:active + .k-sw__t .k-sw__k{transform:translateX(-20px) scaleX(1.148)}',
    '.k-sw input:focus-visible + .k-sw__t{box-shadow:0 0 0 2px var(--k-bg),0 0 0 calc(2px + var(--k-focus-w)) var(--k-focus)}',
    '.k-sw input:disabled + .k-sw__t{opacity:.4}',
    '.k-sw input:disabled{cursor:default}'
  ].join('\n');

  function render(s) {
    s = s || {};
    var id = s.id || 'sw';
    return '<label class="k-sw" data-sw="' + K.esc(id) + '">' +
      '<input type="checkbox" role="switch" id="' + K.esc(id) + '"' + (s.checked ? ' checked' : '') + (s.disabled ? ' disabled' : '') +
      (s.label ? ' aria-label="' + K.esc(s.label) + '"' : '') + (s.describedby ? ' aria-describedby="' + K.esc(s.describedby) + '"' : '') + '>' +
      '<span class="k-sw__t" aria-hidden="true"><span class="k-sw__k"></span></span></label>';
  }

  /* on(id, checked, gestureId): the toggle. Adjust fires here, once. */
  function bind(rootNode, on) {
    var last = null;
    rootNode.addEventListener('pointerdown', function (e) {
      if (e.target && e.target.closest && e.target.closest('.k-sw')) last = K.gid('switch');
    }, true);
    rootNode.addEventListener('change', function (e) {
      var input = e.target;
      if (!input || input.getAttribute('role') !== 'switch') return;
      var gid = last || K.gid('switch'); last = null;
      K.haptic('Adjust', gid, { trigger: 'tap' });
      on(input.id, input.checked, gid);
    });
  }

  K.controls.switch = { css: css, render: render, bind: bind };
})(typeof window !== 'undefined' ? window : globalThis);
