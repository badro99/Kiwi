/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · assets/kit/lens.js · THE lens (spec §14.3, §14.4, §20.5).
 *
 *   window.KiwiLens = { rescan, refresh, attach, move, scanner }
 *
 * One selection style and one module for every track: segmented controls,
 * the tab capsule, the rail, the sidebar, chips and rows that use the lens
 * paint, and the shipped light-DOM tracks that assets/liquid-lens.js still
 * describes (it is now an adapter that registers its groups here).
 *
 * The movement, exactly as shipped and now on tokens:
 *   1 · stretch  at t = 0 the lens's target is the span of the old and the
 *                new option; it moves there on --k-spring over --k-dur-4;
 *   2 · settle   at t = --k-lens-stretch (115 ms) the target is the new option
 *                alone, and the lens retargets from where it is, again on
 *                --k-spring over --k-dur-4. 115 + 310 = 425 ms from tap to rest.
 * Position moves by transform; only the lens's LENGTH animates (width in a
 * horizontal track, height in a vertical one), the named exception of §14.4.
 * The cross length is set at once. The shipped `top .15s ease` and
 * `height .15s ease` are gone. Reduced motion: no stretch, the lens fades to
 * the new option over --k-dur-2.
 *
 * A page that has not loaded tokens-2027.css (the three shipped shells that
 * load liquid-lens.js) gets the token VALUES from KiwiMotion, written on the
 * lens element itself, so the CSS below always names tokens.
 *
 * One global, extended, never replaced (§20.5): whichever file loads first,
 * there is one window.KiwiLens. kit-lint fails any other assignment to it.
 * ═══════════════════════════════════════════════════════════════════════════ */
(function (root) {
  'use strict';
  var doc = root.document;
  if (!doc) return;

  var tracks = [];
  var scanners = [];

  var TOKEN_NAMES = { '--k-dur-2': 'dur2', '--k-dur-4': 'dur4', '--k-lens-stretch': 'lensStretch' };
  var CURVE_NAMES = { '--k-spring': 'spring', '--k-glide': 'glide' };

  function cssVar(el, name) {
    try { return root.getComputedStyle(el).getPropertyValue(name).trim(); } catch (_) { return ''; }
  }
  function ms(v) {
    var n = parseFloat(v);
    if (!isFinite(n)) return 0;
    return /ms$/.test(v) ? n : (/s$/.test(v) ? n * 1000 : n);
  }
  /* Tokens missing on a legacy page: copy their values from KiwiMotion onto
     the lens, so `var(--k-spring)` resolves the same everywhere. */
  function ensureTokens(lens) {
    if (cssVar(lens, '--k-dur-4')) return;
    var M = root.KiwiMotion;
    if (!M) return;
    Object.keys(TOKEN_NAMES).forEach(function (k) { lens.style.setProperty(k, M.DUR[TOKEN_NAMES[k]] + 'ms'); });
    Object.keys(CURVE_NAMES).forEach(function (k) { lens.style.setProperty(k, M.CURVES[CURVE_NAMES[k]]); });
  }
  function reduced() {
    try { return root.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (_) { return false; }
  }
  var LENS_X = 'transform var(--k-dur-4) var(--k-spring), width var(--k-dur-4) var(--k-spring)';
  var LENS_Y = 'transform var(--k-dur-4) var(--k-spring), height var(--k-dur-4) var(--k-spring)';
  var LENS_FADE = 'opacity var(--k-dur-2) var(--k-glide)';

  function find(track) {
    for (var i = 0; i < tracks.length; i++) if (tracks[i].el === track) return tracks[i];
    return null;
  }
  function items(rec) {
    var o = rec.opts;
    if (typeof o.items === 'function') return o.items();
    return Array.prototype.slice.call(rec.el.querySelectorAll(o.item || '[data-lens-item]'));
  }
  function activeIndex(rec) {
    var list = items(rec), o = rec.opts;
    if (typeof o.index === 'function') return o.index(list);
    for (var i = 0; i < list.length; i++) if (o.active ? o.active(list[i]) : list[i].classList.contains('on')) return i;
    return -1;
  }
  /* The item's box in the track's own coordinates: offsetLeft/Top are immune
     to page scroll and to the track's own horizontal scroll, RTL included. */
  function boxOf(rec, el) {
    var parent = el.offsetParent;
    var x = el.offsetLeft, y = el.offsetTop;
    if (parent && parent !== rec.el && rec.el.contains(parent)) { x += parent.offsetLeft; y += parent.offsetTop; }
    var o = rec.opts;
    var ix = o.insetX != null ? o.insetX : (o.inset || 0);
    var iy = o.insetY != null ? o.insetY : (o.inset || 0);
    return { x: x + ix, y: y + iy, w: el.offsetWidth - 2 * ix, h: el.offsetHeight - 2 * iy };
  }
  function paint(rec, b, withTransition) {
    var lens = rec.lens, vert = rec.opts.axis === 'y';
    lens.style.transition = withTransition ? (vert ? LENS_Y : LENS_X) : 'none';
    lens.style.transform = 'translate(' + b.x + 'px,' + b.y + 'px)';
    if (vert) { lens.style.height = b.h + 'px'; lens.style.width = b.w + 'px'; }
    else { lens.style.width = b.w + 'px'; lens.style.height = b.h + 'px'; }
    if (!withTransition) void lens.offsetWidth;
  }

  /* attach(track, opts) · opts: { lens, item, items(), active(el), index(list),
     axis 'x'|'y', inset, className }. A kit component passes the lens element
     that lives in its own root; a light-DOM track gets one created for it. */
  function attach(track, opts) {
    if (!track) return null;
    var rec = find(track);
    if (rec) return rec;
    opts = opts || {};
    var lens = opts.lens;
    if (!lens) {
      lens = doc.createElement('span');
      lens.className = opts.className || 'kw-lens';
      lens.setAttribute('aria-hidden', 'true');
      track.insertBefore(lens, track.firstChild);
    }
    lens.style.position = 'absolute';
    lens.style.left = '0';
    lens.style.top = '0';
    lens.style.pointerEvents = 'none';
    ensureTokens(lens);
    rec = { el: track, lens: lens, opts: opts, at: null, idx: -1, timer: 0 };
    tracks.push(rec);
    if (!opts.manual) {
      try {
        new MutationObserver(function () { place(rec, false); })
          .observe(track, { attributes: true, subtree: true, attributeFilter: ['class', 'aria-selected', 'aria-checked', 'aria-current'] });
      } catch (_) {}
    }
    if (root.ResizeObserver) {
      try { new ResizeObserver(function () { place(rec, true); }).observe(track); } catch (_) {}
    }
    var raf = root.requestAnimationFrame || function (f) { return setTimeout(f, 16); };
    raf(function () { place(rec, true); });
    return rec;
  }

  function place(rec, instant) {
    if (!rec.el.isConnected || rec.el.offsetWidth === 0) return;
    move(rec.el, activeIndex(rec), { phase: instant ? 'instant' : undefined });
  }

  /* move(track, index, {phase}) · phase: undefined (stretch then settle),
     'stretch', 'settle' or 'instant'. index -1 hides the lens: nothing in the
     row is the selection, and the next one lands in place. */
  function move(track, index, o) {
    var rec = find(track);
    if (!rec) return;
    o = o || {};
    clearTimeout(rec.timer);
    var L = rec.lens;
    var list = items(rec);
    var el = list[index];
    if (!el) {
      L.style.opacity = '0';
      rec.at = null; rec.idx = -1;
      return;
    }
    var b = boxOf(rec, el);
    var phase = o.phase;
    if (phase === 'instant' || rec.at === null) {
      L.style.opacity = '1';
      paint(rec, b, false);
      rec.at = b; rec.idx = index;
      return;
    }
    if (rec.idx === index && rec.at.x === b.x && rec.at.y === b.y && rec.at.w === b.w && rec.at.h === b.h) return;
    if (reduced()) {
      L.style.transition = LENS_FADE;
      L.style.opacity = '0';
      rec.timer = setTimeout(function () {
        paint(rec, b, false);
        L.style.transition = LENS_FADE;
        L.style.opacity = '1';
      }, ms(cssVar(L, '--k-dur-2')) / 2 || 80);
      rec.at = b; rec.idx = index;
      return;
    }
    L.style.opacity = '1';
    var from = rec.at;
    rec.at = b; rec.idx = index;
    if (phase === 'settle') { paint(rec, b, true); return; }
    var vert = rec.opts.axis === 'y';
    var span = vert
      ? { x: b.x, w: b.w, y: Math.min(from.y, b.y), h: Math.max(from.y + from.h, b.y + b.h) - Math.min(from.y, b.y) }
      : { y: b.y, h: b.h, x: Math.min(from.x, b.x), w: Math.max(from.x + from.w, b.x + b.w) - Math.min(from.x, b.x) };
    paint(rec, span, true);                                     /* 1 · stretch */
    if (phase === 'stretch') return;
    var stretch = ms(cssVar(L, '--k-lens-stretch')) || 115;
    rec.timer = setTimeout(function () { paint(rec, b, true); }, stretch);   /* 2 · settle */
  }

  function refresh() { tracks.forEach(function (r) { if (r.el.isConnected) place(r, true); }); }
  function rescan(scope) { scanners.forEach(function (fn) { try { fn(scope || doc); } catch (_) {} }); }
  /* A light-DOM scanner (the adapter's GROUPS): run now, and on rescan(). */
  function scanner(fn) { scanners.push(fn); try { fn(doc); } catch (_) {} }

  root.addEventListener('resize', refresh);
  root.addEventListener('kiwi:langchange', function () {
    var raf = root.requestAnimationFrame || function (f) { return setTimeout(f, 16); };
    raf(refresh);
  });

  Object.assign(root.KiwiLens || (root.KiwiLens = {}), {
    rescan: rescan, refresh: refresh, attach: attach, move: move, scanner: scanner, _tracks: tracks
  });
})(typeof window !== 'undefined' ? window : globalThis);
