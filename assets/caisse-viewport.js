/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · CAISSE VIEWPORT GUARD  (assets/caisse-viewport.js)
 * ---------------------------------------------------------------------------
 * Ticket #0091 · « il faut toucher un peu au-dessus du bouton », and product
 * creation that only goes through one time out of two.
 *
 * The till never scrolls as a page: body is overflow:hidden and every surface
 * (#pos-maison, #pos-boutique, the modals) is position:fixed. On iPad and
 * iPhone, focusing a field makes Safari scroll the page anyway to lift the
 * field above the keyboard, and after the keyboard closes it does not always
 * scroll back. The screen is painted where it was, but touches are matched
 * against the scrolled page, so every tap lands a few dozen pixels below the
 * finger. The product form is all fields, so its « Créer l'article » button is
 * exactly where the lower half of a tap stopped reaching it.
 *
 * Any page scroll on the till is therefore that glitch, never intent: once no
 * field holds the keyboard, pin the page back to 0,0. A field that still has
 * focus is left alone so Safari can keep it above the keyboard.
 * ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  if (window.__kiwiViewportGuard) return;
  window.__kiwiViewportGuard = true;

  var root = document.scrollingElement || document.documentElement;
  function typing() {
    var a = document.activeElement;
    if (!a || a === document.body) return false;
    if (a.isContentEditable) return true;
    if (a.tagName === 'TEXTAREA' || a.tagName === 'SELECT') return true;
    return a.tagName === 'INPUT' && !/^(button|submit|reset|checkbox|radio|range|color|file|image)$/i.test(a.type || '');
  }
  function displaced() {
    return !!(window.scrollX || window.scrollY || root.scrollTop || root.scrollLeft ||
      (document.body && (document.body.scrollTop || document.body.scrollLeft)));
  }
  function pin() {
    if (typing() || !displaced()) return;
    window.scrollTo(0, 0);
    root.scrollTop = 0; root.scrollLeft = 0;
    if (document.body) { document.body.scrollTop = 0; document.body.scrollLeft = 0; }
  }
  var timer = 0;
  // focusout fires before the next field takes focus; wait a beat so moving
  // from one field to the next does not snap the page between them.
  function settle() { clearTimeout(timer); timer = setTimeout(pin, 80); }

  document.addEventListener('focusout', settle, true);
  window.addEventListener('scroll', settle, { passive: true });
  window.addEventListener('orientationchange', settle);
  window.addEventListener('pageshow', settle);
  if (window.visualViewport) window.visualViewport.addEventListener('resize', settle);
  // Safety net: a tap that starts on a displaced page is re-aimed before the
  // browser resolves which button it hits.
  document.addEventListener('touchstart', pin, { passive: true, capture: true });

  window.KiwiViewportGuard = { pin: pin, displaced: displaced };
})();
