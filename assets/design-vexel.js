/* ═══════════════════════════════════════════════════════════════════════════
 * KIWI · SKIN "VEXEL" — activation controller
 *
 * Pairs with design-vexel.css. See that file's header for what the skin is and
 * where its values come from.
 *
 * This controller does three things:
 *   1. Flips `body.design-vexel` AND `body[data-vexel-mode]`. Both, always:
 *      the class carries the geometry, type and layout, but the palette is
 *      split into a light block and a dark block that are each guarded by the
 *      attribute. The skin does not CHOOSE the climate — it no longer forces
 *      `data-theme` — it follows whichever one is painted. Setting the class
 *      without the attribute is the failure mode this file is written to
 *      prevent; see syncMode().
 *   2. Injects the SVG gradient the chart area fill references. A CSS file
 *      cannot declare `<linearGradient>`, and `fill: url(#id)` silently
 *      renders nothing when the id is absent — so the def has to be real DOM.
 *   3. Remembers the choice in localStorage, like every other skin here.
 *
 * ON by default for every merchant, like design-2026. This was an explicit
 * product call during the v2 design migration: the skin IS the new dashboard,
 * so it ships to everyone rather than sitting behind `?skin=vexel`.
 * `?skin=off` (or `?skin=none`) still opts a session out and persists the
 * choice, and `KiwiDesignVexel.disable()` does the same.
 *
 * Absence of a stored preference means "take the default", so init() does NOT
 * write '1' on a plain load — only an explicit opt-in or opt-out persists.
 * Changing the default later therefore reaches merchants who never chose.
 *
 * ── The surface climate is a separate preference ──
 * The skin shipped forcing `data-theme="dark"`, which made the dark surface the
 * default dashboard. That is reversed: the merchant lands on the light surface
 * and switches to dark from the topbar if they want it. The choice lives in
 * `kiwiDashTheme` and is primed here, in the head-synchronous pass, so a
 * merchant who chose dark never sees a white flash. It is deliberately NOT the
 * `kiwiTheme` key i18n.js writes — brand.html, pitch.html and wallet.html share
 * that key and have no dark surface, so a dashboard choice must not follow the
 * merchant onto them. See KiwiDashTheme at the bottom of this file.
 * ─────────────────────────────────────────────────────────────────────────── */
(function () {
  'use strict';

  var KEY = 'kiwiDesignVexel';
  var THEME_KEY = 'kiwiDashTheme';
  var CLASS = 'design-vexel';
  var MODE_ATTR = 'data-vexel-mode';
  var GRAD_ID = 'kwVexelArea';

  /**
   * The skin's palette lives behind `body.design-vexel[data-vexel-mode="…"]`:
   * one guarded block per climate, ~329 rules deep. The class alone matches
   * NONE of it. Without this attribute every `--vx-*` token resolves to the
   * empty string, and because a declaration referencing an undefined custom
   * property is invalid at computed-value time — it fails silently AFTER
   * winning the cascade, so nothing lower gets a turn — the cards lose their
   * borders, the dome gradient paints transparent and the CTA loses its fill.
   * The page looks stripped rather than broken, which is why it reads as a
   * design problem and not a missing attribute.
   *
   * Mirrors what is PAINTED (`<html data-theme>`), not what was chosen: fusion
   * mode (venues.js) paints dark over a light preference, and the tokens have
   * to follow the surface they are drawn on, not the merchant's stored answer.
   *
   * Removed with the skin — vexel-neon.js observes this attribute, and a
   * leftover value would keep it animating over a page that is no longer Vexel.
   */
  function syncMode() {
    var body = document.body;
    if (!body) return;
    if (!body.classList.contains(CLASS)) { body.removeAttribute(MODE_ATTR); return; }
    body.setAttribute(MODE_ATTR, document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light');
  }

  function stored() {
    try { return localStorage.getItem(KEY); } catch (e) { return null; }
  }

  /* The URL wins over the stored value and persists, so a link can hand someone
   * the skin without walking them through the console. `?skin=off` reverts by
   * the same route. */
  function fromUrl() {
    var v;
    try { v = new URLSearchParams(location.search).get('skin'); } catch (e) { return null; }
    if (v === 'vexel') return '1';
    if (v === 'off' || v === 'none') return '0';
    return null;
  }

  /**
   * The chart's area fill. `.rev-area` is filled with url(#kwVexelArea) by the
   * stylesheet; this is the def behind that reference.
   *
   * It lives in its own 0×0 <svg> pinned out of flow rather than inside the
   * chart's own svg, because the revenue chart is re-rendered from scratch
   * every time the date range changes (dateRange.js subscribers) — a def
   * injected into that node disappears on the next range switch, and the area
   * silently goes transparent. A document-level def survives.
   */
  function injectGradient() {
    if (document.getElementById(GRAD_ID)) return;
    var NS = 'http://www.w3.org/2000/svg';
    var svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('width', '0');
    svg.setAttribute('height', '0');
    svg.setAttribute('aria-hidden', 'true');
    svg.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden';
    svg.dataset.vexelDefs = '';

    var defs = document.createElementNS(NS, 'defs');
    var grad = document.createElementNS(NS, 'linearGradient');
    grad.setAttribute('id', GRAD_ID);
    grad.setAttribute('x1', '0');
    grad.setAttribute('y1', '0');
    grad.setAttribute('x2', '0');
    grad.setAttribute('y2', '1');

    /* Mint at the curve, nothing at the axis. 0.28 rather than 0.5 because the
     * fill sits over the page's own dome glow and the two add. */
    [['0%', 0.28], ['55%', 0.08], ['100%', 0]].forEach(function (s) {
      var stop = document.createElementNS(NS, 'stop');
      stop.setAttribute('offset', s[0]);
      stop.setAttribute('stop-color', '#00ffae');
      stop.setAttribute('stop-opacity', String(s[1]));
      grad.appendChild(stop);
    });

    defs.appendChild(grad);
    svg.appendChild(defs);
    document.body.appendChild(svg);
  }

  function removeGradient() {
    var svg = document.querySelector('svg[data-vexel-defs]');
    if (svg) svg.remove();
  }

  /**
   * Turning the skin on and off no longer touches `data-theme`. It used to,
   * and that was the bug behind "the dashboard is dark and I never asked for
   * it": the skin owned the surface climate, so every merchant inherited the
   * dark theme as a side effect of getting the new geometry. Climate is now
   * the merchant's own choice (KiwiDashTheme, below) and outlives the skin —
   * which also means fusion-mode (venues.js) is the only other writer of the
   * attribute and no longer needs an ownership flag to protect it from us.
   */
  function apply(on, persist) {
    document.body.classList.toggle(CLASS, on);
    syncMode();

    if (on) injectGradient();
    else removeGradient();

    if (persist !== false) {
      try { localStorage.setItem(KEY, on ? '1' : '0'); } catch (e) {}
    }
  }

  /* ─── Surface climate ───
   * Light is the default: absence of the key means light, and light is what
   * theme.css paints when `data-theme` is anything other than "dark". So the
   * only thing to do on a light session is nothing at all.
   *
   * Written to the DOM here rather than through KiwiI18n.setTheme, because
   * that helper persists to the shared `kiwiTheme` key that the marketing
   * pages also read. */
  function storedTheme() {
    try { return localStorage.getItem(THEME_KEY) === 'dark' ? 'dark' : 'light'; }
    catch (e) { return 'light'; }
  }

  function applyTheme(theme, persist) {
    var dark = theme === 'dark';
    var html = document.documentElement;
    if (dark) html.setAttribute('data-theme', 'dark');
    else html.setAttribute('data-theme', 'light');
    /* After the paint, never before — syncMode() reads the attribute we just
     * wrote, so the skin's palette and the surface can never disagree. */
    syncMode();
    if (persist !== false) {
      try { localStorage.setItem(THEME_KEY, dark ? 'dark' : 'light'); } catch (e) {}
    }
    syncThemeButtons(dark);
    try {
      window.dispatchEvent(new CustomEvent('kiwi:themechange', { detail: { theme: dark ? 'dark' : 'light' } }));
    } catch (e) {}
  }

  /* The button carries both icons in the markup and hides one in CSS, so the
   * icon is right on the first frame. Only the label and the pressed state
   * need JS — a screen reader has no CSS to read. */
  function syncThemeButtons(dark) {
    var label = dark ? 'Passer en mode clair' : 'Passer en mode sombre';
    document.querySelectorAll('[data-action="toggle-theme"]').forEach(function (btn) {
      btn.setAttribute('aria-pressed', dark ? 'true' : 'false');
      btn.setAttribute('aria-label', label);
      btn.setAttribute('title', label);
    });
  }

  /* Delegated rather than bound, because the topbar is re-rendered by several
   * surfaces (role switch, fusion mode) and a bound listener would be lost. */
  document.addEventListener('click', function (e) {
    var btn = e.target.closest && e.target.closest('[data-action="toggle-theme"]');
    if (!btn) return;
    e.preventDefault();
    applyTheme(storedTheme() === 'dark' ? 'light' : 'dark');
  });

  /* applyTheme() is not the only writer of `data-theme` — fusion mode
   * (venues.js) paints dark directly, and i18n.js adopts whatever it finds.
   * Following the attribute instead of trusting our own call sites means the
   * palette can never be left one climate behind the surface. */
  try {
    new MutationObserver(syncMode).observe(document.documentElement, {
      attributes: true, attributeFilter: ['data-theme'],
    });
  } catch (e) {}

  /* `?skin=off` has to run apply(false) rather than fall through, or it can
   * only ever fail to turn the skin on for one page load — the stored '0'
   * would not be written and the default would take over again on the next
   * navigation. It is the documented way out, so it has to actually persist.
   *
   * Only an explicit choice persists: a plain load passes persist=false, so a
   * merchant who has never opted in or out keeps an empty key and follows the
   * default. */
  function init() {
    var url = fromUrl();
    var v = url !== null ? url : stored();
    if (v === '0') apply(false, url !== null);
    else apply(true, url !== null);
    /* Re-assert after i18n.js's init(), which adopts whatever is on <html>
     * but would otherwise leave the toggle's label out of sync. persist=false
     * — priming paints a stored choice, it does not make one. */
    applyTheme(storedTheme(), false);
  }

  /**
   * First-paint bridge, mirroring design-vitrine.js: this file is loaded
   * synchronously in <head>, and dashboard.html calls prime() on the line
   * immediately after <body> so the skin is painted with the first frame
   * instead of being swapped in a beat later. Without it the dashboard flashes
   * a light field before init() runs at DOMContentLoaded, and a dark field is
   * the whole premise of the skin.
   *
   * Deliberately NOT the full apply(). The gradient def is only referenced once
   * a chart exists, and injecting an <svg> as body's first child at prime time
   * would shift anything selecting `body > :first-child`; init() adds it a
   * moment later, before any chart renders. Persistence is left to init() for
   * the same reason — priming paints a stored choice, it does not make one.
   *
   * The climate is primed here too, and OUTSIDE the `?skin=off` early return:
   * a merchant who opted out of the skin still keeps whichever surface they
   * chose. It is also the reason this runs at prime time at all — a stored
   * dark preference applied at DOMContentLoaded would flash the light field
   * first, which is exactly the flash this bridge exists to prevent.
   */
  function primeBody() {
    if (!document.body) return false;
    var theme = storedTheme();
    if (theme === 'dark') document.documentElement.setAttribute('data-theme', 'dark');
    var url = fromUrl();
    var v = url !== null ? url : stored();
    if (v === '0') return true;
    document.body.classList.add(CLASS);
    /* The mode has to land in the SAME synchronous pass as the class. Priming
     * the class alone paints one frame of a skin whose entire palette is still
     * empty — the stripped-card flash the bridge exists to prevent. */
    syncMode();
    return true;
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  window.KiwiDesignVexel = {
    prime: primeBody,
    enable: function () { apply(true); },
    disable: function () { apply(false); },
    toggle: function () { apply(!document.body.classList.contains(CLASS)); },
    isOn: function () { return document.body.classList.contains(CLASS); },
  };

  /* Dashboard surface climate. Separate from KiwiI18n.setTheme on purpose —
   * see the header. `get()` is the honest answer to "what did the merchant
   * choose", not "what is <html> showing right now": fusion-mode paints dark
   * over a light preference and that must not be read back as a choice. */
  window.KiwiDashTheme = {
    get: storedTheme,
    set: function (theme) { applyTheme(theme); },
    toggle: function () { applyTheme(storedTheme() === 'dark' ? 'light' : 'dark'); },
  };
})();
