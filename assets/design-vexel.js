/* ═══════════════════════════════════════════════════════════════════════════
 * KIWI · SKIN "VEXEL" — activation controller
 *
 * Pairs with design-vexel.css. See that file's header for what the skin is and
 * where its values come from.
 *
 * This controller does three things:
 *   1. Flips BOTH `html[data-theme="dark"]` and `body.design-vexel`. The skin
 *      is a delta on top of the existing dark theme, not a theme of its own —
 *      without the attribute, theme.css's 324 lines of per-component dark
 *      fixes never apply and the skin lands on a light dashboard.
 *   2. Injects the SVG gradient the chart area fill references. A CSS file
 *      cannot declare `<linearGradient>`, and `fill: url(#id)` silently
 *      renders nothing when the id is absent — so the def has to be real DOM.
 *   3. Remembers the choice in localStorage, like every other skin here.
 *
 * ON by default for every merchant, like design-2026. This was an explicit
 * product call during the v2 design migration: the skin IS the new dashboard,
 * so it ships to everyone rather than sitting behind `?skin=vexel`. It carries
 * `data-theme="dark"` with it, which means the dark surface is now the default
 * dashboard rather than the Kiwi Ultra hook it used to be — that consequence is
 * intended, not incidental. `?skin=off` (or `?skin=none`) still opts a session
 * out and persists the choice, and `KiwiDesignVexel.disable()` does the same.
 *
 * Absence of a stored preference means "take the default", so init() does NOT
 * write '1' on a plain load — only an explicit opt-in or opt-out persists.
 * Changing the default later therefore reaches merchants who never chose.
 * ─────────────────────────────────────────────────────────────────────────── */
(function () {
  'use strict';

  var KEY = 'kiwiDesignVexel';
  var CLASS = 'design-vexel';
  var GRAD_ID = 'kwVexelArea';

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
   * Dark mode is shared property. fusion-mode (venues.js) sets the same
   * `data-theme="dark"` for its own reasons, so this skin may only take the
   * attribute back off if it was the one that put it on.
   *
   * The ownership flag therefore has to be recorded CONDITIONALLY, at the
   * moment of turning on, based on what the attribute already was. An earlier
   * version stamped `vexelSetTheme = '1'` unconditionally on every enable —
   * which meant enabling the skin inside a fusion-mode session and then
   * disabling it stripped fusion-mode's own dark theme out from under it. The
   * comment claiming the code avoided that was simply wrong.
   */
  function apply(on, persist) {
    var html = document.documentElement;
    document.body.classList.toggle(CLASS, on);

    if (on) {
      var alreadyDark = html.getAttribute('data-theme') === 'dark';
      html.setAttribute('data-theme', 'dark');
      if (!alreadyDark) html.dataset.vexelSetTheme = '1';
      injectGradient();
    } else {
      if (html.dataset.vexelSetTheme === '1') {
        html.removeAttribute('data-theme');
        delete html.dataset.vexelSetTheme;
      }
      removeGradient();
    }

    if (persist !== false) {
      try { localStorage.setItem(KEY, on ? '1' : '0'); } catch (e) {}
    }
  }

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
   * Re-entrant by construction: init()'s own apply(true) finds data-theme
   * already "dark" and therefore does not re-stamp the ownership flag, so
   * enabling the skin inside a fusion-mode session still leaves fusion-mode
   * owning the attribute.
   */
  function primeBody() {
    if (!document.body) return false;
    var url = fromUrl();
    var v = url !== null ? url : stored();
    if (v === '0') return true;
    var html = document.documentElement;
    if (html.getAttribute('data-theme') !== 'dark') {
      html.setAttribute('data-theme', 'dark');
      html.dataset.vexelSetTheme = '1';
    }
    document.body.classList.add(CLASS);
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
})();
