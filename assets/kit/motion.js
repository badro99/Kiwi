/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · assets/kit/motion.js: the 2027 motion rules, as code (spec §14).
 *
 *   window.KiwiMotion  (and module.exports, so the numbers are testable in Node)
 *
 * What lives here, and why it is one file:
 *   · DUR / CURVES      the duration tokens and the three curves of §14.1-14.2,
 *                       mirrored from tokens-2027.css (motion-lint cross-checks
 *                       the two; the CSS is the source for stylesheets, this is
 *                       the source for script).
 *   · Spring            the gesture spring of §14.3: semi-implicit Euler at a
 *                       fixed 1/120 s, stiffness 1400, damping 74.8, mass 1
 *                       (critically damped, no overshoot), rest at |x| < 0.5 pt
 *                       and |v| < 5 pt/s. It writes `transform` and nothing
 *                       else. A retarget keeps position AND velocity.
 *                       The lens is NOT on it (it has two named phases, §14.3).
 *   · animate / flip    duration-based motion on WAAPI: transform and opacity
 *                       only; a new target starts from the PRESENTED value;
 *                       reduced motion swaps travel for a --k-dur-2 crossfade
 *                       to the true final frame (§14.5); no `animate()` means
 *                       the element jumps to its final frame (§4.1).
 *   · grab              hands a mid-flight WAAPI animation to the spring with
 *                       the glide curve's own velocity at that progress.
 *   · lensPlan          the two lens phases as data (stretch 115 ms, then
 *                       settle 310 ms = 425 ms; reduced: one 160 ms crossfade).
 *                       The lens module itself is liquid-lens.js / lens.js.
 *   · THRESHOLDS        the gesture table of §14.7, with the predicates the
 *                       kit components call, so no component invents a number.
 *   · RECIPES / REDUCED §14.4 and §14.5 as data.
 *
 * Nothing here touches layout: no width, height, top, left, margin. The only
 * properties it ever writes are transform and opacity (§14.4); the lens's own
 * length is the lens module's named exception, not this file's.
 *
 * Zero dependencies, no paid service, no model call.
 * ─────────────────────────────────────────────────────────────────────────── */
(function (root, factory) {
  var api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.KiwiMotion = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function (root) {
  'use strict';

  /* ── §14.1 · duration tokens (no other values) ─────────────────────────── */
  var TOKENS = Object.freeze({
    '--k-dur-1': 90,            /* press-in */
    '--k-dur-2': 160,           /* fades, colour, reduced-motion crossfade */
    '--k-dur-3': 240,           /* FLIP moves, toast in, popover, sheet dismiss, scrub hold */
    '--k-lens-stretch': 115,    /* the hold before the lens settles (not a transition) */
    '--k-dur-4': 310,           /* lens settle, knob, badge pop, press release */
    '--k-dur-5': 350,           /* push and pop, sheet present, pane takeover */
    '--k-dur-6': 400,           /* number roll, PIN shake */
    '--k-dur-7': 600,           /* inserted-line highlight, PIN error hold */
    '--k-dur-8': 1100,          /* paid moment hold */
    '--k-dur-9': 1200,          /* skeleton and verifying pulse, spinner revolution */
    '--k-dur-toast': 4000,
    '--k-dur-toast-action': 8000
  });

  var DUR = Object.freeze({
    dur1: 90, dur2: 160, dur3: 240, dur4: 310, dur5: 350, dur6: 400, dur7: 600,
    dur8: 1100, dur9: 1200, lensStretch: 115, toast: 4000, toastAction: 8000
  });

  /* ── §14.2 · curves ────────────────────────────────────────────────────── */
  var CURVES = Object.freeze({
    spring: 'cubic-bezier(0.34, 1.45, 0.5, 1)',   /* selection and release only */
    glide: 'cubic-bezier(0.32, 0.72, 0, 1)',      /* duration-based movement */
    exit: 'cubic-bezier(0.4, 0, 1, 1)'            /* leaving */
  });
  var CURVE_POINTS = Object.freeze({
    spring: [0.34, 1.45, 0.5, 1],
    glide: [0.32, 0.72, 0, 1],
    exit: [0.4, 0, 1, 1]
  });

  /* A cubic-bezier as {y(x), dydx(x)}; Newton with a bisection fallback. */
  function cubicBezier(x1, y1, x2, y2) {
    function bx(t) { var u = 1 - t; return 3 * u * u * t * x1 + 3 * u * t * t * x2 + t * t * t; }
    function by(t) { var u = 1 - t; return 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t; }
    function dbx(t) { var u = 1 - t; return 3 * u * u * x1 + 6 * u * t * (x2 - x1) + 3 * t * t * (1 - x2); }
    function dby(t) { var u = 1 - t; return 3 * u * u * y1 + 6 * u * t * (y2 - y1) + 3 * t * t * (1 - y2); }
    function solve(x) {
      if (x <= 0) return 0;
      if (x >= 1) return 1;
      var t = x, i, d, e;
      for (i = 0; i < 8; i++) {
        e = bx(t) - x;
        if (Math.abs(e) < 1e-7) return t;
        d = dbx(t);
        if (Math.abs(d) < 1e-6) break;
        t -= e / d;
      }
      var lo = 0, hi = 1;
      t = x;
      for (i = 0; i < 40; i++) {
        e = bx(t) - x;
        if (Math.abs(e) < 1e-7) break;
        if (e > 0) hi = t; else lo = t;
        t = (lo + hi) / 2;
      }
      return t;
    }
    return {
      y: function (x) { return by(solve(x)); },
      dydx: function (x) {
        var t = solve(x), d = dbx(t);
        return Math.abs(d) < 1e-9 ? 0 : dby(t) / d;
      }
    };
  }
  var GLIDE = cubicBezier.apply(null, CURVE_POINTS.glide);

  /* The glide curve's velocity (pt/s) at `progress` (0..1 of the duration) for
   * a movement of `distance` pt over `durationMs`. What the spring is handed
   * when a gesture grabs a presenting sheet mid-flight (§14.3). */
  function glideVelocity(progress, distance, durationMs) {
    var p = progress < 0 ? 0 : progress > 1 ? 1 : progress;
    return GLIDE.dydx(p) * distance / (durationMs / 1000);
  }

  /* ── environment (replaceable by the tests) ────────────────────────────── */
  var env = {
    reduced: function () {
      try { return !!(root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches); }
      catch (e) { return false; }
    },
    raf: function (fn) {
      if (typeof root.requestAnimationFrame === 'function') return root.requestAnimationFrame(fn);
      return setTimeout(function () { fn(Date.now()); }, 16);
    },
    caf: function (id) {
      if (typeof root.cancelAnimationFrame === 'function') root.cancelAnimationFrame(id);
      else clearTimeout(id);
    }
  };
  function reduced() { return env.reduced(); }

  /* ── §14.3 · the gesture spring ────────────────────────────────────────── */
  var SPRING = Object.freeze({
    stiffness: 1400, damping: 74.8, mass: 1,
    step: 1 / 120,            /* fixed step, seconds */
    restX: 0.5,               /* pt */
    restV: 5,                 /* pt/s */
    maxCatchUp: 12            /* steps per frame; a longer pause drops the rest */
  });

  /* One integration step, in place on `s` = {x, v} (x = displacement from the
   * target). Semi-implicit Euler: velocity first, then position with the NEW
   * velocity. Returns true when the spring is at rest. */
  function springStep(s) {
    var a = (-SPRING.stiffness * s.x - SPRING.damping * s.v) / SPRING.mass;
    s.v += a * SPRING.step;
    s.x += s.v * SPRING.step;
    return Math.abs(s.x) < SPRING.restX && Math.abs(s.v) < SPRING.restV;
  }

  /* Settle time in ms of a release over `travel` pt with `speedToward` pt/s
   * aimed at the target. The numbers of the §14.3 table come from here. */
  function settleTime(travel, speedToward) {
    var s = { x: Math.abs(travel), v: -Math.abs(speedToward || 0) };
    var n = 0;
    while (n < 12000) { n++; if (springStep(s)) break; }
    return Math.round(n * SPRING.step * 10000) / 10;
  }

  /* A spring on one axis. `from` is the presented position, `to` the target;
   * onUpdate({position, velocity}) every frame, onRest() once at the end, the
   * final frame landing exactly on the target. */
  function createSpring(opts) {
    opts = opts || {};
    var position = typeof opts.from === 'number' ? opts.from : 0;
    var velocity = typeof opts.velocity === 'number' ? opts.velocity : 0;
    var target = typeof opts.to === 'number' ? opts.to : position;
    var onUpdate = opts.onUpdate || function () {};
    var onRest = opts.onRest || function () {};
    var respectReduced = opts.respectReduced !== false;
    var frame = 0, last = 0, acc = 0, running = false;

    function emit() { onUpdate({ position: position, velocity: velocity }); }

    function rest() {
      position = target; velocity = 0; running = false;
      if (frame) { env.caf(frame); frame = 0; }
      emit();
      onRest();
    }

    /* Advance by `seconds` of wall time in fixed steps. Returns true at rest. */
    function advance(seconds) {
      acc += seconds;
      var steps = 0, s = { x: position - target, v: velocity }, done = false;
      while (acc >= SPRING.step && steps < SPRING.maxCatchUp) {
        acc -= SPRING.step; steps++;
        if (springStep(s)) { done = true; break; }
      }
      if (steps === SPRING.maxCatchUp) acc = 0;        /* paused tab: drop the rest */
      position = target + s.x; velocity = s.v;
      if (done) { rest(); return true; }
      if (steps) emit();
      return false;
    }

    function tick(now) {
      frame = 0;
      if (!running) return;
      var dt = last ? (now - last) / 1000 : SPRING.step;
      last = now;
      if (!advance(dt)) frame = env.raf(tick);
    }

    function start() {
      if (running) return;
      running = true; last = 0; acc = 0;
      frame = env.raf(tick);
    }

    var api = {
      /* Retarget from wherever it is: position and velocity are kept. */
      to: function (next, o) {
        target = next;
        if (o && typeof o.velocity === 'number') velocity = o.velocity;
        if (respectReduced && reduced()) { rest(); return api; }   /* §14.5: the final frame, no travel */
        if (Math.abs(position - target) < SPRING.restX && Math.abs(velocity) < SPRING.restV) { rest(); return api; }
        start();
        return api;
      },
      /* Hand the spring a finger position (a drag): it stops, nothing animates. */
      hold: function (pos) {
        running = false;
        if (frame) { env.caf(frame); frame = 0; }
        position = pos; velocity = 0; emit();
        return api;
      },
      advance: advance,                      /* for tests and for a caller's own loop */
      get position() { return position; },
      get velocity() { return velocity; },
      get target() { return target; },
      get running() { return running; },
      stop: function () { running = false; if (frame) { env.caf(frame); frame = 0; } }
    };
    return api;
  }

  /* Bind a spring to an element's transform on one axis. Writes `transform`
   * and nothing else. `rtl` mirrors the x axis' sign for callers that think in
   * logical direction. */
  function bindSpring(el, o) {
    o = o || {};
    var axis = o.axis === 'x' ? 'x' : 'y';
    var sign = o.rtl && axis === 'x' ? -1 : 1;
    function write(p) {
      var v = (p * sign) + 'px';
      el.style.transform = axis === 'x' ? 'translate3d(' + v + ',0,0)' : 'translate3d(0,' + v + ',0)';
    }
    return createSpring({
      from: o.from, to: o.to, velocity: o.velocity, respectReduced: o.respectReduced,
      onUpdate: function (s) { write(s.position); if (o.onUpdate) o.onUpdate(s); },
      onRest: o.onRest
    });
  }

  /* ── presented value of an element (what is on screen now) ─────────────── */
  function presented(el) {
    var cs = root.getComputedStyle ? root.getComputedStyle(el) : null;
    var t = cs && cs.transform && cs.transform !== 'none' ? cs.transform : 'none';
    var x = 0, y = 0;
    if (t !== 'none') {
      var M = root.DOMMatrixReadOnly || root.WebKitCSSMatrix;
      try { var m = new M(t); x = m.m41; y = m.m42; } catch (e) { /* leave 0,0 */ }
    }
    var o = cs ? parseFloat(cs.opacity) : 1;
    return { transform: t, x: x, y: y, opacity: isNaN(o) ? 1 : o };
  }

  /* ── WAAPI movement: transform and opacity only ────────────────────────── */
  var live = typeof WeakMap === 'function' ? new WeakMap() : null;
  var warned = {};

  function durOf(d) {
    if (typeof d === 'number') return d;
    return DUR[d] != null ? DUR[d] : DUR.dur3;
  }

  function resolved() {
    return { finished: Promise.resolve(), cancel: function () {}, animation: null };
  }

  /* animate(el, {transform?, opacity?}, {dur, curve, enter, exit, key, from})
   *   dur    a token key ('dur5') or ms; default dur3
   *   curve  'glide' (default) | 'spring' | 'exit'
   *   enter  the element arrives (reduced motion fades it in)
   *   exit   the element leaves (reduced motion fades it out)
   *   key    one movement per element per key; a new call retargets the old
   *   from   {transform, opacity} to start from instead of the presented value
   * The element's inline style is set to the final value first, so a cancelled
   * or finished animation leaves it exactly there; the animation only paints
   * the way. */
  function animate(el, to, o) {
    o = o || {};
    var props = {};
    Object.keys(to || {}).forEach(function (k) {
      if (k === 'transform' || k === 'opacity') props[k] = to[k];
      else if (!warned[k]) { warned[k] = 1; if (root.console) console.warn('KiwiMotion.animate: "' + k + '" ignored (transform and opacity only, spec 14.4)'); }
    });
    var hasT = 'transform' in props, hasO = 'opacity' in props;
    if (!hasT && !hasO) return resolved();

    var key = o.key || 'move';
    var per = live && live.get(el);
    /* Read what is on screen BEFORE the old animation is cancelled: a cancel
     * drops the element back to its inline (final) value. */
    var from = o.from || presented(el);
    if (per && per[key]) { try { per[key].cancel(); } catch (e) { /* already gone */ } delete per[key]; }
    var fromT = o.from && o.from.transform != null ? o.from.transform : (from.transform || 'none');
    var fromO = o.from && o.from.opacity != null ? o.from.opacity : from.opacity;
    var isReduced = reduced();
    var curve = isReduced ? 'glide' : (CURVES[o.curve] ? o.curve : 'glide');
    var ms = durOf(o.dur);

    if (hasT) el.style.transform = props.transform;
    if (hasO) el.style.opacity = String(props.opacity);

    if (typeof el.animate !== 'function') return resolved();             /* §4.1: jump to the final frame */

    var frames;
    if (isReduced && hasT) {
      /* Travel becomes a --k-dur-2 crossfade to the true final frame. The
       * transform has already been set; only the opacity moves, and only for
       * an element that arrives or leaves. */
      ms = DUR.dur2;
      if (o.enter) frames = [{ opacity: 0 }, { opacity: hasO ? props.opacity : 1 }];
      else if (o.exit) { frames = [{ opacity: fromO }, { opacity: 0 }]; }
      else return resolved();
    } else {
      var a = {}, b = {};
      if (hasT) { a.transform = fromT; b.transform = props.transform; }
      if (hasO) { a.opacity = fromO; b.opacity = props.opacity; }
      frames = [a, b];
    }
    if (isReduced && !hasT && ms > DUR.dur2) ms = DUR.dur2;             /* a plain fade is a crossfade */

    var anim = el.animate(frames, { duration: ms, easing: CURVES[curve], fill: 'none' });
    if (live) { per = per || {}; per[key] = anim; live.set(el, per); }
    var finished = new Promise(function (res) {
      var done = function () { if (live) { var p = live.get(el); if (p && p[key] === anim) delete p[key]; } res(); };
      anim.onfinish = done; anim.oncancel = done;
    });
    return { animation: anim, finished: finished, cancel: function () { try { anim.cancel(); } catch (e) { /* ok */ } } };
  }

  /* Hand a mid-flight WAAPI animation (a presenting sheet) to the spring:
   * read where it is on screen and the glide curve's velocity there, cancel
   * it, and return {position, velocity} for createSpring({from, velocity}).
   * `distance` is the animation's whole travel in pt, signed along `axis`. */
  function grab(el, handle, o) {
    o = o || {};
    var axis = o.axis === 'x' ? 'x' : 'y';
    var p = presented(el);
    var anim = handle && handle.animation ? handle.animation : handle;
    var ms = o.durationMs || (anim && anim.effect && anim.effect.getComputedTiming ? anim.effect.getComputedTiming().duration : DUR.dur5);
    var progress = 0;
    if (anim && typeof anim.currentTime === 'number' && ms) progress = anim.currentTime / ms;
    var v = glideVelocity(progress, o.distance || 0, ms);
    if (handle && handle.cancel) handle.cancel(); else if (anim && anim.cancel) anim.cancel();
    return { position: axis === 'x' ? p.x : p.y, velocity: v, progress: progress };
  }

  /* FLIP (§14.4): `mutate()` changes the DOM, `els` slide from their old
   * rectangle to the new one on transform alone over --k-dur-3 glide. Under
   * reduced motion they simply land. Returns a promise for when all are done. */
  function flip(els, mutate, o) {
    o = o || {};
    var list = Array.prototype.slice.call(els || []);
    var first = list.map(function (el) { return el.getBoundingClientRect(); });
    mutate();
    var runs = [];
    list.forEach(function (el, i) {
      var last = el.getBoundingClientRect();
      var dx = first[i].left - last.left, dy = first[i].top - last.top;
      if (!dx && !dy) return;
      var h = animate(el, { transform: 'translate3d(0,0,0)' }, {
        key: 'flip', dur: o.dur || 'dur3', curve: 'glide',
        from: { transform: 'translate3d(' + dx + 'px,' + dy + 'px,0)' }
      });
      runs.push(h.finished);
    });
    return Promise.all(runs);
  }

  /* ── §14.3 · the lens, as data ─────────────────────────────────────────── */
  /* Spans are 1-D: {start, size} along the track's axis. A tap is 115 + 310 =
   * 425 ms from tap to rest; reduced motion is one crossfade. */
  function lensPlan(fromSpan, toSpan, o) {
    var isReduced = o && typeof o.reduced === 'boolean' ? o.reduced : reduced();
    if (fromSpan && toSpan && fromSpan.start === toSpan.start && fromSpan.size === toSpan.size) {
      return { phases: [], totalMs: 0, reduced: isReduced };
    }
    if (isReduced) {
      return { phases: [{ name: 'crossfade', at: 0, span: toSpan, dur: DUR.dur2, curve: 'glide' }], totalMs: DUR.dur2, reduced: true };
    }
    var a = fromSpan || toSpan;
    var s = Math.min(a.start, toSpan.start);
    var e = Math.max(a.start + a.size, toSpan.start + toSpan.size);
    return {
      phases: [
        { name: 'stretch', at: 0, span: { start: s, size: e - s }, dur: DUR.dur4, curve: 'spring' },
        { name: 'settle', at: DUR.lensStretch, span: { start: toSpan.start, size: toSpan.size }, dur: DUR.dur4, curve: 'spring' }
      ],
      totalMs: DUR.lensStretch + DUR.dur4,
      reduced: false
    };
  }

  /* ── §14.7 · gesture thresholds, one table ─────────────────────────────── */
  var THRESHOLDS = Object.freeze({
    tapSlopPt: 10,
    longPressMs: 500, longPressSlopPt: 10,
    scrubHoldMs: 240,
    rowFullSwipe: 0.6,                 /* of the row width */
    sheetDismissFraction: 0.35,        /* of the sheet height */
    sheetFlingPtPerS: 800,
    pullToRefreshPt: 64,
    toastDismissPt: 24, toastFlingPtPerS: 300
  });

  function dist(dx, dy) { return Math.sqrt(dx * dx + dy * dy); }

  var gesture = {
    /* Released within 10 pt of the press point and not cancelled by a scroll. */
    isTap: function (g) { return !g.cancelled && dist(g.dx || 0, g.dy || 0) <= THRESHOLDS.tapSlopPt; },
    /* 500 ms still, within 10 pt. */
    isLongPress: function (g) { return !g.cancelled && g.heldMs >= THRESHOLDS.longPressMs && dist(g.dx || 0, g.dy || 0) <= THRESHOLDS.longPressSlopPt; },
    /* Chart scrub: 240 ms still; movement before that pans. `moveBeforeHoldPt`
     * is the largest distance the finger travelled from the press point
     * during the hold; once the hold is reached the finger may move freely. */
    chartScrub: function (g) {
      if ((g.moveBeforeHoldPt || 0) > THRESHOLDS.tapSlopPt) return 'pan';
      return g.heldMs >= THRESHOLDS.scrubHoldMs ? 'scrub' : 'pending';
    },
    /* Row full swipe: 60 % of the row's width. */
    rowFullSwipe: function (dx, rowWidth) { return rowWidth > 0 && Math.abs(dx) / rowWidth >= THRESHOLDS.rowFullSwipe; },
    /* Sheet dismiss by drag: 35 % of its height, or a downward fling over 800 pt/s. */
    sheetDismisses: function (dy, height, velocity) {
      return (height > 0 && dy / height >= THRESHOLDS.sheetDismissFraction) || velocity > THRESHOLDS.sheetFlingPtPerS;
    },
    pullToRefresh: function (dy) { return dy >= THRESHOLDS.pullToRefreshPt; },
    /* Toast dismiss: 24 pt downward, or a downward fling over 300 pt/s. */
    toastDismisses: function (dy, velocity) { return dy >= THRESHOLDS.toastDismissPt || velocity > THRESHOLDS.toastFlingPtPerS; }
  };

  /* ── §14.4 · what moves, as data (duration token + curve per change) ───── */
  var RECIPES = Object.freeze({
    push: { dur: 'dur5', curve: 'glide', props: ['transform'] },
    pop: { dur: 'dur5', curve: 'glide', props: ['transform'] },
    tabSwitch: { dur: null, curve: null, props: [] },                       /* content swaps; only the lens moves */
    segmented: { dur: 'dur2', curve: 'glide', props: ['opacity'], lens: { stretchMs: 115, settle: 'dur4' } },
    sheetPresent: { dur: 'dur5', curve: 'glide', props: ['transform', 'opacity'] },
    sheetDismiss: { dur: 'dur3', curve: 'exit', props: ['transform', 'opacity'] },
    popover: { dur: 'dur3', curve: 'glide', props: ['transform', 'opacity'] },
    lineInsert: { dur: 'dur3', curve: 'glide', props: ['transform', 'opacity'], highlight: 'dur7' },
    lineRemove: { dur: 'dur2', curve: 'exit', props: ['opacity'], closeUp: 'dur3' },
    lineExpand: { dur: 'dur3', curve: 'glide', props: ['transform'] },
    kdsBump: { dur: 'dur5', curve: 'glide', props: ['transform'], closeUp: 'dur3' },
    numberRoll: { dur: 'dur6', curve: 'glide', props: ['transform', 'opacity'] },
    kpiSharedElement: { dur: 'dur5', curve: 'glide', props: ['transform'] },
    press: { dur: 'dur1', curve: null, props: ['transform'], release: { dur: 'dur4', curve: 'spring' } },
    skeleton: { dur: 'dur9', curve: null, props: ['opacity'], loop: true },
    lockEntrance: { dur: 'dur3', curve: 'glide', props: ['opacity', 'transform'] }
  });

  /* ── §14.5 · reduced motion, as data ───────────────────────────────────── */
  var REDUCED = Object.freeze({
    travel: { do: 'crossfade', dur: 'dur2' },          /* push, sheet, popover, FLIP, bump */
    spring: { do: 'glide' },
    lens: { do: 'crossfade', dur: 'dur2' },
    numberRoll: { do: 'instant' },
    kpiSharedElement: { do: 'crossfade', dur: 'dur2' },
    pinShake: { do: 'none' },
    pulse: { do: 'static' },                            /* PIN verifying, skeleton: "Checking" text */
    paidMoment: { do: 'static', hold: 'dur8' },
    lockEntrance: { do: 'crossfade', dur: 'dur2' },
    lockExit: { do: 'crossfade', dur: 'dur2' }
  });

  /* ── §14.4 · number roll: which way a digit enters ─────────────────────── */
  /* An increase enters from below, a decrease from above, the same in RTL. */
  function rollDirection(prev, next) {
    if (next > prev) return 'from-below';
    if (next < prev) return 'from-above';
    return 'none';
  }

  return {
    TOKENS: TOKENS, DUR: DUR, CURVES: CURVES, CURVE_POINTS: CURVE_POINTS,
    SPRING: SPRING, THRESHOLDS: THRESHOLDS, RECIPES: RECIPES, REDUCED: REDUCED,
    reduced: reduced,
    cubicBezier: cubicBezier, glideVelocity: glideVelocity,
    springStep: springStep, settleTime: settleTime, createSpring: createSpring, bindSpring: bindSpring,
    presented: presented, animate: animate, grab: grab, flip: flip,
    lensPlan: lensPlan, gesture: gesture, rollDirection: rollDirection,
    _env: env
  };
});
