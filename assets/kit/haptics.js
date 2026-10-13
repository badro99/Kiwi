/* KiwiHaptics · the one web caller of any haptic API (design 2027, §15).
 *
 *   KiwiHaptics.play(class, gestureId, step?, meta?)
 *
 * Eight classes, each a fixed feel (§15.1): Choose (a selection bracket),
 * Adjust (impact Light), Commit (impact Medium), Paid and Shift (notification
 * Success), Failed (notification Error), Caution (notification Warning) and
 * Grab (impact Soft in prepared mode, Light until then). Impact Heavy and the
 * continuous vibrate buzz are never used.
 *
 * What it enforces in code, so a caller cannot break the rules by forgetting:
 *   - one gesture, one haptic: a second play with the same gestureId is dropped.
 *     The one exception is the chart scrub (§15.4): Choose with a `step`
 *     dedupes on (gestureId, step) instead, one tick per step and one per
 *     40 ms, inside one bracket that end(gestureId) closes;
 *   - throttle (§15.5): Choose ticks 40 ms apart, every other class 60 ms;
 *   - what each class waits for (§15.3): Paid only on a local record, Commit on
 *     a local record or a server ack, Shift only on a response, and a response
 *     or a server ack only within 600 ms of the gesture (`meta.gestureAt`);
 *   - never buzz (§15.6): not while scrolling or dragging a sheet (suppress()),
 *     not on the kitchen surface, not with the setting off, not where there is
 *     no engine (iPad, desktop, web, guest pages).
 *
 * Under it, the native engine is the `kiwi-haptics` plugin (mode `stock`, which
 * feels exactly like @capacitor/haptics, or `prepared` with owner decision 9),
 * or @capacitor/haptics itself on a build that predates the plugin.
 *
 * `?hapticsTrace=1` records {t, class, call, gestureId, step, latencyMs,
 * trigger, route} per play in KiwiHaptics.trace; haptics-map-test reads it.
 * Settings are read from localStorage and default to on: kiwiHaptics = '0'
 * (Settings › Haptics) and kiwiHaptics:device = '0' (This device › Haptics).
 *
 * Zero dependencies. Safe to load anywhere: with no engine every call is a
 * no-op that returns {played:false}. */
(function (root) {
  'use strict';

  /* ---- the map: class → native call (§15.1) ---------------------------- */
  var MAP = {
    Choose:  { kind: 'selection',    style: 'bracket' },
    Adjust:  { kind: 'impact',       style: 'LIGHT' },
    Commit:  { kind: 'impact',       style: 'MEDIUM' },
    Paid:    { kind: 'notification', style: 'SUCCESS' },
    Shift:   { kind: 'notification', style: 'SUCCESS' },
    Failed:  { kind: 'notification', style: 'ERROR' },
    Caution: { kind: 'notification', style: 'WARNING' },
    Grab:    { kind: 'impact',       style: 'SOFT' }
  };
  var CLASSES = Object.keys(MAP);
  var TRIGGERS = ['pointerdown', 'tap', 'threshold', 'local-record', 'server-ack', 'response', 'step'];
  var CHOOSE_GAP_MS = 40;
  var OTHER_GAP_MS = 60;
  var VERDICT_WINDOW_MS = 600;
  var SCRUB_IDLE_MS = 2000;      // a scrub whose end() never came is closed, never left open
  var MAX_GESTURES = 512;
  var MAX_TRACE = 4000;
  var CALIBRATION_CALLS = 20;
  var CALIBRATION_KEEP = 5;
  var CALIBRATION_MAX_UNCERTAINTY_MS = 2;

  /* ---- environment, replaceable in tests ------------------------------- */
  var env = {
    window: root,
    now: function () {
      try { if (root.performance && typeof root.performance.now === 'function') return root.performance.now(); } catch (_) {}
      return Date.now();
    }
  };

  var state;
  function freshState() {
    return {
      mode: 'stock',
      surface: null,
      trace: false,
      broken: false,                 // the kiwi-haptics plugin answered "not implemented"
      gestures: {},                  // gestureId → { at, steps: {}, lastStepAt, scrub, closed }
      gestureOrder: [],
      lastChooseAt: -1e9,
      lastOtherAt: -1e9,
      suppressed: {},
      scrubTimers: {},
      offsetMs: null,                // native clock − web clock, from calibrate()
      uncertaintyMs: null,
      traceLog: []
    };
  }
  state = freshState();

  /* ---- reads that may throw (blocked storage, no Capacitor) ------------ */
  function storageGet(key) {
    try { return env.window.localStorage.getItem(key); } catch (_) { return null; }
  }
  function queryHas(name, value) {
    try {
      var search = (env.window.location && env.window.location.search) || '';
      var re = new RegExp('[?&]' + name + '=([^&#]*)');
      var m = re.exec(search);
      return !!m && (value === undefined || decodeURIComponent(m[1]) === value);
    } catch (_) { return false; }
  }
  function traceOn() { return state.trace || queryHas('hapticsTrace', '1'); }

  function capacitor() {
    var c = env.window.Capacitor;
    return c && typeof c.isNativePlatform === 'function' ? c : null;
  }
  function isNative() {
    var c = capacitor();
    try { return !!(c && c.isNativePlatform()); } catch (_) { return false; }
  }
  function platform() {
    var c = capacitor();
    try { return c && typeof c.getPlatform === 'function' ? c.getPlatform() : 'web'; } catch (_) { return 'web'; }
  }
  /* iPads have no Taptic Engine (§15.0): the generators do nothing there. */
  function isIPad() {
    try {
      var nav = env.window.navigator || {};
      if (/iPad/.test(nav.userAgent || '')) return true;
      return nav.platform === 'MacIntel' && nav.maxTouchPoints > 1;   // iPadOS in desktop mode
    } catch (_) { return false; }
  }
  function plugins() {
    var c = capacitor();
    return (c && c.Plugins) || {};
  }
  function kiwiPlugin() {
    if (state.broken) return null;
    try { var p = plugins().KiwiHaptics; return p && typeof p.play === 'function' ? p : null; } catch (_) { return null; }
  }
  function stockPlugin() {
    try { var p = plugins().Haptics; return p && typeof p.impact === 'function' ? p : null; } catch (_) { return null; }
  }

  /* Which engine would play a haptic here: 'kiwi-haptics', 'capacitor-haptics',
     or null (web, guest pages, desktop, iPad, and a phone with no plugin). */
  function engine() {
    if (!isNative()) return null;
    if (platform() === 'ios' && isIPad()) return null;
    if (kiwiPlugin()) return 'kiwi-haptics';
    if (stockPlugin()) return 'capacitor-haptics';
    return null;
  }

  function surface() {
    if (state.surface) return state.surface;
    try {
      var path = (env.window.location && env.window.location.pathname) || '';
      if (/kiwi-cuisine/.test(path)) return 'kitchen';
    } catch (_) {}
    return 'work';
  }

  function enabled() {
    return storageGet('kiwiHaptics') !== '0' && storageGet('kiwiHaptics:device') !== '0';
  }

  /* ---- native calls ---------------------------------------------------- */
  function swallow(p) {
    if (p && typeof p.then === 'function') {
      return p.then(function (v) { return v; }, function (err) {
        var msg = String(err && (err.message || err.code || err));
        if (/not implemented|unimplemented/i.test(msg)) state.broken = true;
        return undefined;
      });
    }
    return Promise.resolve(p);
  }

  /* One native call. Resolves with {t} (seconds on the native clock) when the
     kiwi-haptics plugin answers, with undefined otherwise. */
  function nativeCall(kind, style, eng) {
    try {
      if (eng === 'kiwi-haptics') {
        var kp = kiwiPlugin();
        if (!kp) return Promise.resolve(undefined);
        return swallow(kp.play({ kind: kind, style: style, mode: state.mode }));
      }
      var sp = stockPlugin();
      if (!sp) return Promise.resolve(undefined);
      if (kind === 'impact') return swallow(sp.impact({ style: style === 'SOFT' || style === 'RIGID' ? 'LIGHT' : style }));
      if (kind === 'notification') return swallow(sp.notification({ type: style }));
      if (style === 'start') return swallow(sp.selectionStart());
      if (style === 'changed') return swallow(sp.selectionChanged());
      return swallow(sp.selectionEnd());
    } catch (_) { return Promise.resolve(undefined); }
  }

  function impactStyleFor(cls) {
    if (cls === 'Grab') return state.mode === 'prepared' ? 'SOFT' : 'LIGHT';
    return MAP[cls].style;
  }

  /* ---- trace ----------------------------------------------------------- */
  function record(entry) {
    var log = state.traceLog;
    log.push(entry);
    if (log.length > MAX_TRACE) log.splice(0, log.length - MAX_TRACE);
    return entry;
  }
  function latencyOf(t, meta) {
    if (typeof t !== 'number' || state.offsetMs === null) return null;
    var ts = meta && typeof meta.eventTimeStamp === 'number' ? meta.eventTimeStamp : null;
    if (ts === null) return null;
    return t * 1000 - (ts + state.offsetMs);
  }

  /* ---- gesture bookkeeping --------------------------------------------- */
  function remember(gestureId, at) {
    var g = { at: at, steps: {}, lastStepAt: -1e9, scrub: false, closed: false };
    state.gestures[gestureId] = g;
    state.gestureOrder.push(gestureId);
    while (state.gestureOrder.length > MAX_GESTURES) delete state.gestures[state.gestureOrder.shift()];
    return g;
  }

  function reject(reason, cls, gestureId) {
    return { played: false, reason: reason, class: cls, gestureId: gestureId, done: Promise.resolve(null) };
  }

  /* ---- the rules of §15.3, by class ------------------------------------ */
  function triggerAllowed(cls, trigger) {
    if (cls === 'Paid') return trigger === 'local-record';
    if (cls === 'Commit') return trigger === 'local-record' || trigger === 'server-ack';
    if (cls === 'Shift') return trigger === 'response';
    return true;
  }

  function suppressedNow() {
    for (var k in state.suppressed) if (state.suppressed[k]) return k;
    return null;
  }

  /* ---- play ------------------------------------------------------------ */
  function play(cls, gestureId, step, meta) {
    if (step && typeof step === 'object' && meta === undefined) { meta = step; step = undefined; }
    meta = meta || {};
    if (!MAP[cls]) return reject('unknown-class', cls, gestureId);
    if (gestureId === undefined || gestureId === null || gestureId === '') return reject('no-gesture-id', cls, gestureId);
    gestureId = String(gestureId);
    var hasStep = step !== undefined && step !== null;
    if (hasStep && cls !== 'Choose') return reject('step-not-allowed', cls, gestureId);

    var trigger = meta.trigger || (hasStep ? 'step' : 'tap');
    if (!triggerAllowed(cls, trigger)) return reject('trigger', cls, gestureId);
    if (hasStep && trigger !== 'step') return reject('trigger', cls, gestureId);

    var now = env.now();
    if (trigger === 'response' || trigger === 'server-ack') {
      /* A verdict or an ack buzzes only inside 600 ms of the gesture; a slow
         network never buzzes under the next gesture. */
      if (typeof meta.gestureAt !== 'number') return reject('no-gesture-time', cls, gestureId);
      if (now - meta.gestureAt > VERDICT_WINDOW_MS) return reject('late', cls, gestureId);
    }

    if (surface() === 'kitchen') return reject('kitchen', cls, gestureId);
    if (!enabled()) return reject('setting-off', cls, gestureId);
    var held = suppressedNow();
    if (held) return reject('suppressed:' + held, cls, gestureId);

    /* Dedupe. */
    var g = state.gestures[gestureId];
    if (hasStep) {
      var key = String(step);
      if (g && !g.scrub) return reject('duplicate', cls, gestureId);       // the id was used by a one-off
      if (g && g.closed) return reject('duplicate', cls, gestureId);
      if (g && g.steps[key]) return reject('duplicate-step', cls, gestureId);
      if (g && now - g.lastStepAt < CHOOSE_GAP_MS) return reject('throttle', cls, gestureId);
    } else if (g) {
      return reject('duplicate', cls, gestureId);
    }
    if (cls === 'Choose') {
      if (now - state.lastChooseAt < CHOOSE_GAP_MS) return reject('throttle', cls, gestureId);
    } else if (now - state.lastOtherAt < OTHER_GAP_MS) {
      return reject('throttle', cls, gestureId);
    }

    var eng = engine();
    var tracing = traceOn();
    if (!eng && !tracing) return reject('no-engine', cls, gestureId);

    /* Accepted. */
    if (cls === 'Choose') state.lastChooseAt = now; else state.lastOtherAt = now;
    if (!g) g = remember(gestureId, now);
    var calls = [];
    var bracket;
    if (cls === 'Choose' && hasStep) {
      g.scrub = true;
      g.steps[String(step)] = true;
      g.lastStepAt = now;
      var opening = !g.opened;
      if (opening) { g.opened = true; calls.push(['selection', 'start']); }
      calls.push(['selection', 'changed']);
      bracket = opening ? 'open' : 'tick';
      armScrubTimer(gestureId, eng);
    } else if (cls === 'Choose') {
      calls.push(['selection', 'start'], ['selection', 'changed'], ['selection', 'end']);
      bracket = 'whole';
    } else {
      calls.push([MAP[cls].kind, MAP[cls].kind === 'impact' ? impactStyleFor(cls) : MAP[cls].style]);
    }

    var promises = [];
    if (eng) for (var i = 0; i < calls.length; i++) promises.push(nativeCall(calls[i][0], calls[i][1], eng));

    var entry = null;
    if (tracing) {
      entry = record({
        t: now, class: cls,
        call: calls.map(function (c) { return c[0] + ':' + c[1]; }).join('+'),
        gestureId: gestureId, step: hasStep ? step : null, bracket: bracket || null,
        latencyMs: null, trigger: trigger, route: meta.route || null,
        engine: eng, mode: state.mode, played: !!eng
      });
    }
    /* The last call of the play is the one the latency is read from. */
    var done = Promise.all(promises).then(function (results) {
      var last = results.length ? results[results.length - 1] : undefined;
      var t = last && typeof last.t === 'number' ? last.t : null;
      var latencyMs = latencyOf(t, meta);
      if (entry) { entry.nativeT = t; entry.latencyMs = latencyMs; }
      return { t: t, latencyMs: latencyMs };
    });
    return { played: !!eng, reason: eng ? undefined : 'no-engine', class: cls, gestureId: gestureId, step: hasStep ? step : null, calls: calls, done: done };
  }

  /* Close a scrub's bracket: selectionEnd, once. Safe to call twice. */
  function end(gestureId) {
    gestureId = String(gestureId);
    var g = state.gestures[gestureId];
    if (!g || !g.scrub || g.closed) return false;
    g.closed = true;
    if (state.scrubTimers[gestureId]) { clearTimeout(state.scrubTimers[gestureId]); delete state.scrubTimers[gestureId]; }
    var eng = engine();
    if (eng && g.opened) nativeCall('selection', 'end', eng);
    if (traceOn()) {
      record({
        t: env.now(), class: 'Choose', call: 'selection:end', gestureId: gestureId, step: null, bracket: 'close',
        latencyMs: null, trigger: 'step', route: null, engine: eng, mode: state.mode, played: !!eng
      });
    }
    return true;
  }
  function armScrubTimer(gestureId, eng) {
    try {
      if (state.scrubTimers[gestureId]) clearTimeout(state.scrubTimers[gestureId]);
      var timer = setTimeout(function () { end(gestureId); }, SCRUB_IDLE_MS);
      if (timer && typeof timer.unref === 'function') timer.unref();
      state.scrubTimers[gestureId] = timer;
    } catch (_) {}
  }

  /* Mark a period in which nothing may buzz (a scroll, a sheet drag). */
  function suppress(name, on) {
    if (on === false) delete state.suppressed[name]; else state.suppressed[name] = true;
  }

  /* Warm the engine before a gesture that fires on release (prepared mode
     only; in stock mode it is a no-op, exactly like the plugin's). */
  function prepare(cls) {
    if (state.mode !== 'prepared' || !MAP[cls]) return;
    var kp = engine() === 'kiwi-haptics' ? kiwiPlugin() : null;
    if (!kp || typeof kp.prepare !== 'function') return;
    try {
      swallow(kp.prepare({ kind: MAP[cls].kind, style: MAP[cls].kind === 'impact' ? impactStyleFor(cls) : MAP[cls].style, mode: 'prepared' }));
    } catch (_) {}
  }

  /* §15.5 clock alignment: 20 clock() calls; the offset is the median of
     t − (w0 + w1) / 2 over the 5 with the smallest round trip, and half of the
     smallest round trip is the uncertainty. Above 2 ms the run is discarded and
     redone (up to 3 times). Resolves {offsetMs, uncertaintyMs} or null. */
  function calibrate() {
    var kp = engine() === 'kiwi-haptics' ? kiwiPlugin() : null;
    if (!kp || typeof kp.clock !== 'function') return Promise.resolve(null);
    function once() {
      var samples = [];
      var chain = Promise.resolve();
      for (var i = 0; i < CALIBRATION_CALLS; i++) {
        chain = chain.then(function () {
          var w0 = env.now();
          return swallow(kp.clock()).then(function (r) {
            var w1 = env.now();
            if (r && typeof r.t === 'number') samples.push({ rtt: w1 - w0, off: r.t * 1000 - (w0 + w1) / 2 });
          });
        });
      }
      return chain.then(function () {
        if (samples.length < CALIBRATION_KEEP) return null;
        samples.sort(function (a, b) { return a.rtt - b.rtt; });
        var best = samples.slice(0, CALIBRATION_KEEP).map(function (s) { return s.off; }).sort(function (a, b) { return a - b; });
        return { offsetMs: best[Math.floor(best.length / 2)], uncertaintyMs: samples[0].rtt / 2 };
      });
    }
    function attempt(n) {
      return once().then(function (r) {
        if (r && r.uncertaintyMs <= CALIBRATION_MAX_UNCERTAINTY_MS) {
          state.offsetMs = r.offsetMs; state.uncertaintyMs = r.uncertaintyMs;
          return r;
        }
        return n > 1 ? attempt(n - 1) : null;
      });
    }
    return attempt(3);
  }

  /* The shipped `kiwi:native-haptic` event, until stage 7 retires it (§20.3):
     light → Adjust, success → Paid only when the dispatcher names a gestureId
     and says trigger 'local-record', danger → nothing. */
  var legacySeq = 0;
  function fromNativeEvent(detail) {
    detail = detail || {};
    var kind = detail.kind || 'light';
    if (kind === 'light') return play('Adjust', detail.gestureId || ('legacy:' + (++legacySeq)), { trigger: 'tap' });
    if (kind === 'success' && detail.gestureId && detail.trigger === 'local-record') {
      return play('Paid', detail.gestureId, { trigger: 'local-record' });
    }
    return reject('legacy-ignored', kind, detail.gestureId);
  }

  /* A fresh gesture id for a call site with no tap event of its own (a scan
     adding a line). One id, one haptic: never reuse it for a second play. */
  var gidSeq = 0;
  function gid(prefix) { return String(prefix || 'g') + ':' + (++gidSeq); }

  var api = {
    MAP: MAP,
    CLASSES: CLASSES,
    TRIGGERS: TRIGGERS,
    play: play,
    gid: gid,
    end: end,
    prepare: prepare,
    suppress: suppress,
    calibrate: calibrate,
    fromNativeEvent: fromNativeEvent,
    engine: engine,
    enabled: enabled,
    isIPad: isIPad,
    setMode: function (mode) { state.mode = mode === 'prepared' ? 'prepared' : 'stock'; },
    getMode: function () { return state.mode; },
    setSurface: function (name) { state.surface = name || null; },
    setTrace: function (on) { state.trace = !!on; },
    setEnabled: function (on, scope) {
      var key = scope === 'device' ? 'kiwiHaptics:device' : 'kiwiHaptics';
      try { if (on) env.window.localStorage.removeItem(key); else env.window.localStorage.setItem(key, '0'); } catch (_) {}
    },
    get trace() { return state.traceLog; },
    clock: function () { return { offsetMs: state.offsetMs, uncertaintyMs: state.uncertaintyMs }; },
    /* Tests only. */
    _reset: function () {
      for (var k in state.scrubTimers) { try { clearTimeout(state.scrubTimers[k]); } catch (_) {} }
      state = freshState();
    },
    _env: env
  };

  root.KiwiHaptics = api;
})(typeof window !== 'undefined' ? window : globalThis);
