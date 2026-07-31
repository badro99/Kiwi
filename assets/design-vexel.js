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
 * OFF by default, unlike design-2026. Two reasons: the product's dark mode is
 * a Kiwi Ultra hook rather than a free surface, and this has not been checked
 * against every drawer in pages-pro.js yet. Turn it on with
 * `KiwiDesignVexel.enable()`, or load any dashboard URL with `?skin=vexel`.
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

  function apply(on, persist) {
    document.body.classList.toggle(CLASS, on);
    /* Only touch data-theme when turning ON. Removing it on disable would
     * clobber fusion-mode, which sets the same attribute for its own reasons
     * (venues.js) and has nothing to do with this skin. */
    if (on) {
      document.documentElement.setAttribute('data-theme', 'dark');
      injectGradient();
    } else {
      if (document.documentElement.getAttribute('data-theme') === 'dark' &&
          document.documentElement.dataset.vexelSetTheme === '1') {
        document.documentElement.removeAttribute('data-theme');
      }
      removeGradient();
    }
    if (on) document.documentElement.dataset.vexelSetTheme = '1';
    else delete document.documentElement.dataset.vexelSetTheme;

    if (persist !== false) {
      try { localStorage.setItem(KEY, on ? '1' : '0'); } catch (e) {}
    }
  }

  function init() {
    var url = fromUrl();
    var v = url !== null ? url : stored();
    if (v === '1') apply(true, url !== null);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  window.KiwiDesignVexel = {
    enable: function () { apply(true); },
    disable: function () { apply(false); },
    toggle: function () { apply(!document.body.classList.contains(CLASS)); },
    isOn: function () { return document.body.classList.contains(CLASS); },
  };
})();
