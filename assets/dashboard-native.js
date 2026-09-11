/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · native-app polish layer. Self-contained, defer-loaded. Every behavior
 * is gated to the phone breakpoint and/or standalone, and no-ops under
 * prefers-reduced-motion. FR-only injected UI; no data-action / data-i18n.
 * ─────────────────────────────────────────────────────────────────────────── */
(function () {
  'use strict';
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  function phone() { return window.matchMedia && window.matchMedia('(max-width: 860px)').matches; }

  /* ── Page-enter transition: cosmetic slide/fade on nav intent. Decoupled
   *    from pages.js routing — it only animates the .main container when a
   *    sidebar link or a bottom tab is tapped. ── */
  function animateMain() {
    if (reduce) return;
    var main = document.querySelector('.main') || document.querySelector('.container');
    if (!main) return;
    main.classList.remove('kw-enter');
    void main.offsetWidth; // reflow so the animation restarts
    main.classList.add('kw-enter');
    main.addEventListener('animationend', function h() {
      main.classList.remove('kw-enter');
      main.removeEventListener('animationend', h);
    });
  }
  document.addEventListener('click', function (e) {
    if (!phone()) return;
    var nav = e.target.closest('.sidebar nav a[data-nav]') || e.target.closest('.kw-tab');
    if (nav) animateMain();
  }, true);

  /* ── Refresh: re-emit the current date range so every subscriber re-renders,
   *    with a brief shimmer for the "fetching" feel. Uses the real public API
   *    window.KiwiDateRange.setDateRange(getDateRange()). ── */
  function refresh() {
    document.body.classList.add('kw-refreshing');
    function done() {
      try {
        if (window.KiwiDateRange) window.KiwiDateRange.setDateRange(window.KiwiDateRange.getDateRange());
      } catch (_) {}
      document.body.classList.remove('kw-refreshing');
    }
    if (reduce) { done(); return Promise.resolve(); }
    return new Promise(function (res) { setTimeout(function () { done(); res(); }, 620); });
  }

  /* ── Pull-to-refresh: engages ONLY at scroll-top; passive listeners never
   *    call preventDefault, so native scrolling is never hijacked. The pull is
   *    a cosmetic spinner; releasing past the threshold triggers refresh(). ── */
  (function ptr() {
    var startY = 0, pulling = false, dist = 0, spinner = null;
    var THRESH = 72;
    function atTop() { return (window.scrollY || document.documentElement.scrollTop || 0) <= 0; }
    function ensure() {
      if (spinner) return spinner;
      spinner = document.createElement('div');
      spinner.className = 'kw-ptr';
      spinner.appendChild(document.createElement('i'));
      document.body.appendChild(spinner);
      return spinner;
    }
    function hide() {
      if (!spinner) return;
      spinner.classList.remove('ready', 'spin');
      spinner.style.opacity = '0';
      spinner.style.transform = 'translateX(-50%) translateY(-8px)';
    }
    window.addEventListener('touchstart', function (e) {
      if (!phone() || !atTop() || e.touches.length !== 1) { pulling = false; return; }
      startY = e.touches[0].clientY; pulling = true; dist = 0;
    }, { passive: true });
    window.addEventListener('touchmove', function (e) {
      if (!pulling) return;
      dist = e.touches[0].clientY - startY;
      if (dist <= 0) { pulling = false; hide(); return; }
      var pull = Math.min(dist * 0.5, 96);
      var s = ensure();
      s.style.transform = 'translateX(-50%) translateY(' + (pull - 8) + 'px)';
      s.style.opacity = String(Math.min(pull / THRESH, 1));
      s.classList.toggle('ready', pull >= THRESH);
    }, { passive: true });
    window.addEventListener('touchend', function () {
      if (!pulling) return;
      pulling = false;
      if (spinner && (dist * 0.5) >= THRESH) {
        spinner.classList.add('spin');
        refresh().then(hide);
      } else { hide(); }
    });
  })();
  /* ── Live-sale toasts: a native-style "Nouvelle vente" notification slides
   *    in at intervals while the app is foregrounded, on phones. SIMULATED
   *    (self-contained demo data) — real push notifications need the backend
   *    horizon. Tapping routes to the Transactions destination. ── */
  (function toasts() {
    /* This is demo scenery, never merchant activity. Real/custom venues must
     * not receive fabricated restaurant sales (especially on non-food stores). */
    try {
      if (window.KiwiVenue && window.KiwiVenue.isCustom && window.KiwiVenue.isCustom()) return;
    } catch (_) {
      return;
    }
    var ITEMS = ['Café noir', 'Cappuccino', 'Thé à la menthe', 'Jus d\'orange',
                 'Msemen', 'Sandwich', 'Pizza Margherita', 'Salade', 'Formule déj', 'Croissant'];
    var timer = null;
    function amount() { return (Math.floor(Math.random() * 180) + 12) + ',00 MAD'; }
    function show() {
      if (!phone()) { schedule(); return; }
      var t = document.createElement('button');
      t.type = 'button';
      t.className = 'kw-toast';
      var strong = document.createElement('strong'); strong.textContent = 'Nouvelle vente';
      var span = document.createElement('span');
      span.textContent = ITEMS[Math.floor(Math.random() * ITEMS.length)] + ' · ' + amount();
      t.appendChild(strong); t.appendChild(span);
      t.addEventListener('click', function () {
        t.remove();
        var link = document.querySelector('.sidebar nav a[data-nav="transactions"]');
        if (link) link.click();
      });
      document.body.appendChild(t);
      requestAnimationFrame(function () { t.classList.add('in'); });
      setTimeout(function () {
        t.classList.remove('in');
        setTimeout(function () { t.remove(); }, 360);
      }, 4200);
      schedule();
    }
    function schedule() {
      clearTimeout(timer);
      if (document.hidden) return;
      timer = setTimeout(show, 18000 + Math.floor(Math.random() * 22000)); // 18–40 s
    }
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) clearTimeout(timer); else schedule();
    });
    schedule();
  })();
})();
