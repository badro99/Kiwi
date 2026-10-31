/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · native-app polish layer. Self-contained, defer-loaded. Every behavior
 * is gated to the phone breakpoint and/or standalone, and no-ops under
 * prefers-reduced-motion. Injected labels use the dashboard dictionary.
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

  /* ── Refresh: re-emit the current date range so every subscriber re-renders.
   *    Uses the real public API window.KiwiDateRange.setDateRange(getDateRange()).
   *    No sheen over the page: the numbers redrawing is the feedback. ── */
  function refresh() {
    try {
      if (window.KiwiDateRange) window.KiwiDateRange.setDateRange(window.KiwiDateRange.getDateRange());
    } catch (_) {}
    return Promise.resolve();
  }

  /* ── Pull-to-refresh: engages ONLY at scroll-top; passive listeners never
   *    call preventDefault, so native scrolling (and the iOS rubber band) is
   *    never hijacked. A thin ring fills with the pull, closes with one light
   *    haptic at the threshold, spins while the page re-reads, then fades. ── */
  (function ptr() {
    var startY = 0, pulling = false, dist = 0, ready = false, busy = false, el = null, arc = null;
    var THRESH = 64, MAX = 96, R = 8, C = 2 * Math.PI * R;
    function atTop() { return (window.scrollY || document.documentElement.scrollTop || 0) <= 0; }
    function damp(d) { return MAX * (1 - Math.exp(-d / (MAX * 1.6))); }
    function ensure() {
      if (el) return el;
      var NS = 'http://www.w3.org/2000/svg';
      el = document.createElement('div');
      el.className = 'kw-ptr';
      el.setAttribute('aria-hidden', 'true');
      var svg = document.createElementNS(NS, 'svg');
      svg.setAttribute('viewBox', '0 0 20 20');
      var track = document.createElementNS(NS, 'circle');
      arc = document.createElementNS(NS, 'circle');
      [track, arc].forEach(function (c) { c.setAttribute('cx', '10'); c.setAttribute('cy', '10'); c.setAttribute('r', String(R)); });
      track.setAttribute('class', 'kw-ptr-track');
      arc.setAttribute('class', 'kw-ptr-arc');
      arc.style.strokeDasharray = C.toFixed(2);
      arc.style.strokeDashoffset = C.toFixed(2);
      svg.appendChild(track); svg.appendChild(arc); el.appendChild(svg);
      document.body.appendChild(el);
      return el;
    }
    function place(pull) {
      var p = Math.min(pull / THRESH, 1);
      el.style.transform = 'translate(-50%,' + (pull * 0.7 - 20).toFixed(1) + 'px) scale(' + (0.7 + 0.3 * p).toFixed(3) + ')';
      el.style.opacity = String(Math.min(pull / 28, 1));
      arc.style.strokeDashoffset = (C * (1 - p * 0.92)).toFixed(2);
    }
    function hide() {
      if (!el) return;
      el.classList.remove('ready', 'spin', 'drag');
      el.style.transform = 'translate(-50%,-20px) scale(.7)';
      el.style.opacity = '0';
      ready = false; busy = false;
    }
    window.addEventListener('touchstart', function (e) {
      if (busy || !phone() || !atTop() || e.touches.length !== 1) { pulling = false; return; }
      startY = e.touches[0].clientY; pulling = true; dist = 0; ready = false;
    }, { passive: true });
    window.addEventListener('touchmove', function (e) {
      if (!pulling) return;
      dist = e.touches[0].clientY - startY;
      if (dist <= 0) { pulling = false; hide(); return; }
      ensure().classList.add('drag');
      var pull = damp(dist);
      place(pull);
      var now = pull >= THRESH;
      if (now && !ready) {
        try { window.dispatchEvent(new CustomEvent('kiwi:native-haptic', { detail: { kind: 'light' } })); } catch (_) {}
      }
      ready = now;
      el.classList.toggle('ready', ready);
    }, { passive: true });
    function release() {
      if (!pulling) return;
      pulling = false;
      if (!el) return;
      el.classList.remove('drag');
      if (!ready) { hide(); return; }
      busy = true;
      el.classList.add('spin');
      arc.style.strokeDashoffset = (C * 0.72).toFixed(2);
      el.style.transform = 'translate(-50%,' + (THRESH * 0.7 - 20) + 'px) scale(1)';
      el.style.opacity = '1';
      var started = Date.now();
      refresh().then(function () {
        /* Long enough to read as "done", short enough not to feel staged. */
        setTimeout(hide, reduce ? 0 : Math.max(0, 650 - (Date.now() - started)));
      });
    }
    window.addEventListener('touchend', release);
    window.addEventListener('touchcancel', release);
  })();
  /* ── Live-sale toasts: a native-style "Nouvelle vente" notification slides
   *    in at intervals while the app is foregrounded, on phones. SIMULATED
   *    (self-contained demo data) — real push notifications need the backend
   *    horizon. Tapping routes to the Transactions destination. ── */
  (function toasts() {
    if (document.documentElement.classList.contains('kiwi-native')) return;
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
      var strong = document.createElement('strong'); strong.setAttribute('data-i18n', 'home.newSale');
      var i18n = window.KiwiI18n;
      strong.textContent = i18n.T[i18n.getLang()]['home.newSale'] || i18n.T.fr['home.newSale'];
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
