/* ═══════════════════════════════════════════════════════════════════════════
 * KIWI · LIQUID GLASS loader
 *
 * Injects the shared SVG displacement filter (#kiwi-lg) once per document and
 * flips <html data-kiwi-glass="on"> so assets/liquid-glass.css can upgrade every
 * `.kiwi-glass` panel from plain frosted glass to real refraction.
 *
 * Public API (window.KiwiGlass):
 *   .enable()            — turn refraction on (default on load)
 *   .disable()           — revert every panel to plain frosted glass (reversible)
 *   .toggle()            — flip
 *   .tune({scale, freq}) — live-tune displacement strength / ripple scale
 *
 * SAFETY: if the browser can't do url() backdrop filters, we stay on the plain
 * frosted-glass base rule — nothing breaks, panels still look intentional.
 * ─────────────────────────────────────────────────────────────────────────── */
(function () {
  'use strict';
  if (window.KiwiGlass) return;

  var SVG_NS = 'http://www.w3.org/2000/svg';
  var DEFAULT = { scale: 55, freqX: 0.006, freqY: 0.011, octaves: 2, seed: 12, blur: 1.4 };
  var state = Object.assign({}, DEFAULT);

  function supported() {
    return (CSS && CSS.supports &&
      (CSS.supports('backdrop-filter', 'url(#k)') ||
       CSS.supports('-webkit-backdrop-filter', 'url(#k)')));
  }

  function buildFilter() {
    // Remove any prior instance so tune() can rebuild cleanly.
    var old = document.getElementById('kiwi-lg-svg');
    if (old) old.parentNode.removeChild(old);

    var svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('id', 'kiwi-lg-svg');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('width', '0');
    svg.setAttribute('height', '0');
    svg.style.cssText = 'position:absolute;width:0;height:0;pointer-events:none;overflow:hidden';

    var filter = document.createElementNS(SVG_NS, 'filter');
    filter.setAttribute('id', 'kiwi-lg');
    // Expand the region so the displacement can pull in content from just
    // outside the panel — that overspill is what reads as an edge lens.
    filter.setAttribute('x', '-35%'); filter.setAttribute('y', '-35%');
    filter.setAttribute('width', '170%'); filter.setAttribute('height', '170%');
    filter.setAttribute('color-interpolation-filters', 'sRGB');

    var turb = document.createElementNS(SVG_NS, 'feTurbulence');
    turb.setAttribute('type', 'fractalNoise');
    turb.setAttribute('baseFrequency', state.freqX + ' ' + state.freqY);
    turb.setAttribute('numOctaves', String(state.octaves));
    turb.setAttribute('seed', String(state.seed));
    turb.setAttribute('result', 'noise');

    var gb = document.createElementNS(SVG_NS, 'feGaussianBlur');
    gb.setAttribute('in', 'noise');
    gb.setAttribute('stdDeviation', String(state.blur));
    gb.setAttribute('result', 'noiseBlur');

    var disp = document.createElementNS(SVG_NS, 'feDisplacementMap');
    disp.setAttribute('in', 'SourceGraphic');
    disp.setAttribute('in2', 'noiseBlur');
    disp.setAttribute('scale', String(state.scale));
    disp.setAttribute('xChannelSelector', 'R');
    disp.setAttribute('yChannelSelector', 'G');

    filter.appendChild(turb); filter.appendChild(gb); filter.appendChild(disp);
    svg.appendChild(filter);
    (document.body || document.documentElement).appendChild(svg);
  }

  function enable() {
    if (!supported()) { document.documentElement.setAttribute('data-kiwi-glass', 'off'); return false; }
    buildFilter();
    document.documentElement.setAttribute('data-kiwi-glass', 'on');
    return true;
  }
  function disable() { document.documentElement.setAttribute('data-kiwi-glass', 'off'); }
  function toggle() {
    return document.documentElement.getAttribute('data-kiwi-glass') === 'on' ? (disable(), false) : enable();
  }
  function tune(opts) {
    Object.assign(state, opts || {});
    if (document.documentElement.getAttribute('data-kiwi-glass') === 'on') buildFilter();
    return Object.assign({}, state);
  }

  window.KiwiGlass = { enable: enable, disable: disable, toggle: toggle, tune: tune, supported: supported, state: function(){ return Object.assign({}, state); } };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', enable, { once: true });
  } else { enable(); }
})();
