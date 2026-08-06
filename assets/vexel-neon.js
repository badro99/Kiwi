/* KIWI · VEXEL HOME — cursor position for the edge-lighting layer.
 *
 * Writes --vx-x/--vx-y (the pointer, in card-local pixels) onto whichever
 * interactive homepage card the pointer is over. Layer G in design-vexel.css
 * feeds them to a `transform` on the glow sprite; everything visible — the fade,
 * the colour, the size — lives in CSS. This file only answers "where is the
 * cursor". Pixels rather than percentages because the value drives a translate,
 * and a percentage there would resolve against the sprite, not the card.
 *
 * If this never runs, the sprite falls back to the card's top-centre and the
 * cards light from above instead. Nothing breaks, the light just stops following.
 *
 * Gated twice: the vexel skin (either climate) and the homepage container. On a
 * subpage it attaches nothing at all.
 */
(function () {
  'use strict';

  /* Must stay in step with the :is() list in design-vexel.css (Layer G). A card
   * present here but absent there gets tracked and never lights; absent here but
   * present there lights from its top edge and never follows the cursor. */
  var CARDS = [
    '[data-kpi-band] > .kpi-m',
    '.oppo-band .oppo-card',
    '.dash-cols .block',
    '.dash-cols .settle',
    '.vexel-bottom-row .block',
    '.vexel-rail-card',
    '.vexel-goals-card',
    '.dash-more-clip [data-integ-card]'
  ].join(',');

  /* The climate flag and the surface actually painted can disagree: a dark theme
   * held from an earlier visit still paints black under ?skin=vexel-light. Mint
   * on white and atlas on black both vanish, so the accent follows the pixels
   * rather than the attribute that claims them. design-vexel.css carries a
   * correct default for each mode, so with this file absent the ordinary case
   * still reads right — this only rescues the mismatch. */
  var MINT = '0, 255, 174';
  var ATLAS = '7, 112, 77';

  function surfaceIsDark(el) {
    for (var n = el; n && n.nodeType === 1; n = n.parentElement) {
      var m = getComputedStyle(n).backgroundColor.match(/rgba?\(([^)]+)\)/);
      if (!m) continue;
      var p = m[1].split(',').map(parseFloat);
      /* See-through: this element is not the surface, keep walking up. */
      if (p.length > 3 && p[3] < 0.5) continue;
      return (p[0] * 299 + p[1] * 587 + p[2] * 114) / 1000 < 128;
    }
    return true;   /* nothing opaque underneath — the home surface is the dark one */
  }

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

  function isVexelHome() {
    var b = document.body;
    return !!b &&
           b.classList.contains('design-vexel') &&
           !!b.getAttribute('data-vexel-mode') &&
           !!document.querySelector('.dash-standard');
  }

  var current = null;   /* card under the pointer */
  var pending = null;   /* event coalesced until the next frame */
  var frame = 0;

  function clear(card) {
    if (!card) return;
    card.style.removeProperty('--vx-x');
    card.style.removeProperty('--vx-y');
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

    /* Pixels, not percentages: these feed a `transform: translate3d(…)`, which
     * the compositor applies without repainting. Percentages would have to
     * resolve against the glow layer's own box (156 %/224 % of the card), so the
     * same number would mean a different place on every card. */
    current.style.setProperty('--vx-x', Math.round(ev.clientX - r.left) + 'px');
    current.style.setProperty('--vx-y', Math.round(ev.clientY - r.top) + 'px');
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
    if (!isVexelHome() || !shouldTrack()) return;
    var root = document.querySelector('.dash-standard');
    if (!root) return;
    /* Re-measured on every sync, not just the first attach: the theme can flip
     * under a card that is already wired up. */
    root.style.setProperty('--vx-neon', surfaceIsDark(root) ? MINT : ATLAS);
    if (root.dataset.vxNeon === '1') return;
    root.dataset.vxNeon = '1';
    root.addEventListener('pointermove', onMove, { passive: true });
    root.addEventListener('pointerleave', onLeave, { passive: true });
  }

  function detach() {
    var root = document.querySelector('.dash-standard');
    if (!root || root.dataset.vxNeon !== '1') return;
    delete root.dataset.vxNeon;
    root.style.removeProperty('--vx-neon');
    root.removeEventListener('pointermove', onMove);
    root.removeEventListener('pointerleave', onLeave);
    onLeave();
  }

  /* The skin controller flips body.design-vexel and data-vexel-mode at runtime,
   * so binding once on load would miss every later toggle. */
  function sync() {
    if (isVexelHome()) attach(); else detach();
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
