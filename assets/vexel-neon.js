/* KIWI · VEXEL DARK HOME — cursor position for the edge-lighting layer.
 *
 * Writes --vx-mx/--vx-my (the pointer, in card-local percentages) onto whichever
 * interactive homepage card the pointer is over. Layer E in design-vexel.css
 * reads them to place its glow; everything visible — the fade, the colour, the
 * reach — lives in CSS. This file only answers "where is the cursor".
 *
 * If this never runs, the gradient falls back to 50%/0% and the cards light from
 * the top edge instead. Nothing breaks, the effect just stops following.
 *
 * Gated three ways: the vexel skin, dark mode, and the homepage container. On a
 * light dashboard or any subpage it attaches nothing at all.
 */
(function () {
  'use strict';

  var CARDS = [
    '[data-kpi-band] > .kpi-m',
    '.oppo-band .oppo-card',
    '.dash-cols .block',
    '.dash-cols .settle',
    '.dash-more-clip [data-integ-card]'
  ].join(',');

  /* Coarse pointers have no hover to track, and a reduced-motion request should
   * not be answered with a light that chases the finger. CSS still handles the
   * state change in both cases. */
  function shouldTrack() {
    try {
      return window.matchMedia('(hover: hover)').matches &&
             !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    } catch (e) {
      return false;
    }
  }

  function isDarkHome() {
    var b = document.body;
    return !!b &&
           b.classList.contains('design-vexel') &&
           b.getAttribute('data-vexel-mode') === 'dark' &&
           !!document.querySelector('.dash-standard');
  }

  var current = null;   /* card under the pointer */
  var pending = null;   /* event coalesced until the next frame */
  var frame = 0;

  function clear(card) {
    if (!card) return;
    card.style.removeProperty('--vx-mx');
    card.style.removeProperty('--vx-my');
  }

  function paint() {
    frame = 0;
    var ev = pending;
    pending = null;
    if (!ev || !current) return;

    /* Read the box every frame rather than caching it: these cards sit in a
     * grid that reflows on range change, sidebar collapse and window resize,
     * and a stale rect puts the light in the wrong place. */
    var r = current.getBoundingClientRect();
    if (!r.width || !r.height) return;

    current.style.setProperty('--vx-mx', ((ev.clientX - r.left) / r.width * 100).toFixed(2) + '%');
    current.style.setProperty('--vx-my', ((ev.clientY - r.top) / r.height * 100).toFixed(2) + '%');
  }

  function onMove(e) {
    var card = e.target && e.target.closest ? e.target.closest(CARDS) : null;

    if (card !== current) {
      clear(current);
      current = card;
    }
    if (!current) return;

    /* One write per animation frame; pointermove fires far faster than paint. */
    pending = e;
    if (!frame) frame = requestAnimationFrame(paint);
  }

  function onLeave() {
    clear(current);
    current = null;
    pending = null;
    if (frame) { cancelAnimationFrame(frame); frame = 0; }
  }

  function attach() {
    if (!isDarkHome() || !shouldTrack()) return;
    var root = document.querySelector('.dash-standard');
    if (!root || root.dataset.vxNeon === '1') return;
    root.dataset.vxNeon = '1';
    root.addEventListener('pointermove', onMove, { passive: true });
    root.addEventListener('pointerleave', onLeave, { passive: true });
  }

  function detach() {
    var root = document.querySelector('.dash-standard');
    if (!root || root.dataset.vxNeon !== '1') return;
    delete root.dataset.vxNeon;
    root.removeEventListener('pointermove', onMove);
    root.removeEventListener('pointerleave', onLeave);
    onLeave();
  }

  /* The skin controller flips body.design-vexel and data-vexel-mode at runtime,
   * so binding once on load would miss every later toggle. */
  function sync() {
    if (isDarkHome()) attach(); else detach();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', sync);
  } else {
    sync();
  }

  new MutationObserver(sync).observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['class', 'data-vexel-mode'],
    subtree: true
  });
})();
