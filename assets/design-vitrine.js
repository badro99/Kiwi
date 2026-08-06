/* KIWI · VITRINE skin controller — opt-in, reversible, light-tier only.
 *
 * Deliberately has no dark mode. The vexel skin carries dark; the product's
 * warm paper is what makes dark a Kiwi Ultra upsell, and a second free dark
 * surface would give that away. See design-vitrine.css for the full rationale.
 */
(function () {
  'use strict';

  var KEY = 'kiwiDesignVitrine';
  var CLASS = 'design-vitrine';
  var REVEAL_ATTR = 'data-vitrine-reveal';
  var PANELS = '.kpi-m, .block';

  var initialPreference = null;
  var observer = null;
  var revealed = 0;
  var watchdog = null;

  /* Fail-safe. The reveal hides every panel up front and waits for the observer
   * to bring them back, which means any environment where the callback never
   * fires renders an empty dashboard — not a degraded one, an empty one. Seen
   * for real in a zero-size viewport, where nothing can intersect.
   *
   * So: once the panels actually have layout, they get one grace period to
   * start arriving. If none has, the mechanism is not working here and the
   * whole reveal is torn down, leaving the plain skin. Panels with no layout
   * yet are not evidence of failure — the lock screen hides the app behind
   * .kw-app-hidden for as long as the intro runs — so the check re-arms instead
   * of firing while the dashboard is legitimately off-screen. */
  function armWatchdog() {
    var waited = 0;
    var STEP = 700;
    var GRACE = 2100;   /* after layout exists */
    var CEILING = 20000; /* absolute stop, so this can never poll forever */

    clearTimeout(watchdog);
    (function tick() {
      watchdog = setTimeout(function () {
        if (!observer) return;
        if (revealed > 0) return;              /* working — nothing to do */

        waited += STEP;
        if (waited >= CEILING) { bailOut(); return; }

        var panel = document.querySelector(PANELS);
        var hasLayout = panel && panel.getBoundingClientRect().height > 0;
        if (!hasLayout) { tick(); return; }    /* still behind the lock */

        if (waited >= GRACE) bailOut();
        else tick();
      }, STEP);
    })();
  }

  function bailOut() {
    if (observer) { observer.disconnect(); observer = null; }
    clearTimeout(watchdog);
    document.body.removeAttribute(REVEAL_ATTR);
  }

  function readPreference() {
    var raw = null;
    try { raw = localStorage.getItem(KEY); } catch (e) {}
    return raw === '1';
  }

  function writePreference(on) {
    try { localStorage.setItem(KEY, on ? '1' : '0'); } catch (e) {}
  }

  /* URL state wins and is persisted. The default surface remains off. */
  function fromUrl() {
    var skin;
    try { skin = new URLSearchParams(location.search).get('skin'); } catch (e) { return null; }
    if (skin === 'vitrine') return true;
    if (skin === 'off' || skin === 'none') return false;
    /* Any other named skin means another controller is taking the page. Stand
     * down rather than stacking two skins on one body. */
    if (skin) return false;
    return null;
  }

  function reducedMotion() {
    try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; }
    catch (e) { return false; }
  }

  /* The un-revealed state is gated behind an attribute this function sets, so a
   * script that never runs leaves every panel at its normal opacity instead of
   * hiding the whole dashboard behind a reveal that will never fire. */
  function startReveal() {
    if (reducedMotion() || !('IntersectionObserver' in window)) return;
    document.body.setAttribute(REVEAL_ATTR, '');

    observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-in');
        revealed += 1;
        observer.unobserve(entry.target);   /* once — the site's replay:false */
      });
    }, { rootMargin: '0px 0px -12% 0px', threshold: 0.01 });

    armWatchdog();
    register();

    /* The KPI band and several blocks are built at runtime, so panels appear
     * after this controller has already walked the DOM once. */
    if ('MutationObserver' in window) {
      new MutationObserver(register).observe(document.body, {
        childList: true,
        subtree: true
      });
    }
  }

  function register() {
    if (!observer) return;
    document.querySelectorAll(PANELS).forEach(function (el) {
      if (el.dataset.vitrineSeen) return;
      el.dataset.vitrineSeen = '1';
      observer.observe(el);
    });
  }

  function stopReveal() {
    if (observer) { observer.disconnect(); observer = null; }
    clearTimeout(watchdog);
    revealed = 0;
    document.body.removeAttribute(REVEAL_ATTR);
    document.querySelectorAll(PANELS).forEach(function (el) {
      el.classList.remove('is-in');
      delete el.dataset.vitrineSeen;
    });
  }

  /* First-paint bridge, mirroring the vexel controller: this file is loaded
   * synchronously in <head>, and dashboard.html calls prime() immediately after
   * <body> so the field is painted with the first frame rather than swapped in. */
  function primeBody() {
    if (!document.body) return false;
    var on = initialPreference;
    if (on == null) on = fromUrl();
    if (on == null) on = readPreference();
    if (on) document.body.classList.add(CLASS);
    return true;
  }

  /* One skin per body. Three were stacked in practice — a body carrying
   * design-vitrine + design-2026 + design-ios27 at once, because the last two
   * persist from any 1111 session and nothing had ever told them to stand down.
   * Panels then get their surface from whichever rule happens to win, which is
   * how a skin ends up looking like none of its own CSS.
   *
   * The passcode tiers are suspended by class rather than through their
   * controllers' disable(), because disable() persists: switching skins would
   * silently discard a preference the merchant set behind the PIN. Class
   * removal is session-only and exactly reversible.
   *
   * Vexel is the exception and does go through its own disable() — it owns
   * html[data-theme] and colorScheme as well as its class, so dropping only the
   * class would strand the page in a dark palette with none of the skin that
   * asked for it. */
  var OTHER_SKINS = ['design-2026', 'design-ios27'];
  var suspended = [];

  function suspendOtherSkins() {
    if (window.KiwiDesignVexel && window.KiwiDesignVexel.isOn()) {
      window.KiwiDesignVexel.disable();
    }
    suspended = OTHER_SKINS.filter(function (cls) {
      return document.body.classList.contains(cls);
    });
    suspended.forEach(function (cls) { document.body.classList.remove(cls); });
  }

  function restoreOtherSkins() {
    suspended.forEach(function (cls) { document.body.classList.add(cls); });
    suspended = [];
  }

  function apply(on, persist) {
    var body = document.body;

    if (on) {
      suspendOtherSkins();
      body.classList.add(CLASS);
      startReveal();
    } else {
      body.classList.remove(CLASS);
      stopReveal();
      restoreOtherSkins();
    }

    if (persist !== false) writePreference(on);
    window.dispatchEvent(new CustomEvent('kiwi:vitrinechange', {
      detail: { on: !!on }
    }));
  }

  function init() {
    var url = fromUrl();
    var on = initialPreference;
    if (on == null) on = url;
    if (on == null) on = readPreference();
    primeBody();
    if (on) apply(true, url != null);
    else if (url != null) apply(false, true);
  }

  initialPreference = fromUrl();
  if (initialPreference == null) initialPreference = readPreference();

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  window.KiwiDesignVitrine = {
    prime: primeBody,
    enable: function () { apply(true); },
    disable: function () { apply(false); },
    toggle: function () { apply(!document.body.classList.contains(CLASS)); },
    isOn: function () { return document.body.classList.contains(CLASS); }
  };
})();
