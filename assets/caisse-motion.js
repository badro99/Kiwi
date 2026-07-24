/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi Caisse — motion layer. Self-contained, defer-loaded. Exposes
 * window.CaisseFx. All effects no-op under prefers-reduced-motion.
 * ─────────────────────────────────────────────────────────────────────────── */
(function () {
  'use strict';
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
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
