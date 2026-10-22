/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi Caisse — motion layer. Self-contained, defer-loaded. Exposes
 * window.CaisseFx. All effects no-op under prefers-reduced-motion.
 * ─────────────────────────────────────────────────────────────────────────── */
(function () {
  'use strict';
  /* Read once, the setting stuck for the whole shift: turning on Reduce
     Motion mid-service changed nothing until the till reloaded. */
  var motionQuery = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)');
  var reduce = !!(motionQuery && motionQuery.matches);
  if (motionQuery) {
    var follow = function (event) { reduce = !!event.matches; };
    if (typeof motionQuery.addEventListener === 'function') motionQuery.addEventListener('change', follow);
    else if (typeof motionQuery.addListener === 'function') motionQuery.addListener(follow);
  }
  var SPRING = 'cubic-bezier(0.34, 1.45, 0.5, 1)';

  function springIn(el) {
    if (reduce || !el || !el.animate) return;
    el.animate(
      [{ transform: 'translateX(8px)', opacity: 0 },
       { transform: 'translateX(0)',   opacity: 1 }],
      { duration: 320, easing: SPRING, fill: 'both' }
    );
  }

  // Spring the newest ticket row whenever the order list gains a child.
  function watchTicket() {
    var list = document.getElementById('rp-items') ||
               document.querySelector('.order-items');
    if (!list) return;
    new MutationObserver(function (muts) {
      muts.forEach(function (m) {
        m.addedNodes.forEach(function (n) { if (n.nodeType === 1) springIn(n); });
      });
    }).observe(list, { childList: true });
  }

  // Pulse the total when it changes. IMPORTANT: never rewrite the digits — the
  // app owns the number (it's money). A digit count-up that reads its target
  // from the same #rp-total it animates corrupts the value under re-entrant
  // calls. We only read + spring-pulse the element and mirror the real text to
  // the bottom-sheet peek bar.
  var lastTotalText = '';
  function countTotal() {
    var el = document.getElementById('rp-total');
    if (!el) return;
    var txt = el.textContent || '';
    var peek = document.getElementById('rp-peek-total');
    if (peek) peek.textContent = txt;
    if (reduce || !el.animate || txt === lastTotalText) { lastTotalText = txt; return; }
    lastTotalText = txt;
    el.animate(
      [{ transform: 'scale(1)' }, { transform: 'scale(1.06)' }, { transform: 'scale(1)' }],
      { duration: 360, easing: SPRING }
    );
  }

  // Confetti burst — self-contained DOM, no dependency.
  function confetti(originEl) {
    if (reduce) return;
    var r = originEl ? originEl.getBoundingClientRect()
                     : { left: innerWidth / 2, top: innerHeight / 2, width: 0, height: 0 };
    var cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    var colors = ['#0B6E4F', '#7DF2B0', '#3FB67A', '#F7F5F0'];
    for (var i = 0; i < 24; i++) {
      var p = document.createElement('span');
      p.style.cssText = 'position:fixed;z-index: var(--z-overlay, 600);width:8px;height:8px;border-radius:2px;pointer-events:none;left:' +
        cx + 'px;top:' + cy + 'px;background:' + colors[i % colors.length];
      document.body.appendChild(p);
      var ang = (Math.PI * 2 * i) / 24, dist = 80 + (i % 5) * 22;
      (function (node) {
        node.animate(
          [{ transform: 'translate(-50%,-50%) rotate(0)', opacity: 1 },
           { transform: 'translate(' + (Math.cos(ang) * dist - 50) + '%,' + (Math.sin(ang) * dist + 120) + '%) rotate(320deg)', opacity: 0 }],
          { duration: 900 + (i % 4) * 120, easing: 'cubic-bezier(.2,.6,.2,1)', fill: 'forwards' }
        ).onfinish = function () { node.remove(); };
      })(p);
    }
  }

  function ready(fn) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn);
    else fn();
  }
  ready(function () {
    watchTicket();
    // Bottom-sheet ticket toggle (Task 4 peek bar).
    document.addEventListener('click', function (e) {
      if (e.target.closest('[data-action="toggle-ticket"]')) document.body.classList.toggle('ticket-open');
      if (e.target.closest('[data-action="toggle-nav"]')) document.body.classList.toggle('nav-open');
    });
  });

  window.CaisseFx = {
    countTotal: countTotal,
    confetti: confetti,
    // Re-attach the liquid-lens after a menu/category re-render.
    lens: function () { if (window.KiwiLens) window.KiwiLens.rescan(); }
  };
})();

/* ── Ci-dessous, l'ancien assets/caisse-viewport.js (réuni ici le 22 octobre 2026, corps inchangé). ── */
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
