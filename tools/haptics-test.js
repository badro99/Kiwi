#!/usr/bin/env node
/* KiwiHaptics (assets/haptics.js) · design 2027, §15.
 *
 *   node tools/haptics-test.js
 *
 * Runs the module in a bare vm context with a fake Capacitor, so it needs no
 * browser and no device. Asserts the class map of §15.1, one gesture one
 * haptic and the chart scrub's exception (§15.4), the throttles (§15.5), what
 * each class waits for and the 600 ms rule (§15.3), every "never buzz" of
 * §15.6, the trace record, and the clock alignment. */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const SRC = fs.readFileSync(path.join(ROOT, 'assets', 'kit', 'haptics.js'), 'utf8');

let failures = 0;
let passed = 0;
function ok(cond, msg) {
  if (cond) { passed++; console.log('  ✓ ' + msg); } else { failures++; console.log('  ✗ ' + msg); }
}
function eq(a, b, msg) { ok(JSON.stringify(a) === JSON.stringify(b), msg + (JSON.stringify(a) === JSON.stringify(b) ? '' : '  (got ' + JSON.stringify(a) + ', wanted ' + JSON.stringify(b) + ')')); }

/* ---- a fake device --------------------------------------------------------
 * `kind`: 'kiwi' (the kiwi-haptics plugin), 'stock' (@capacitor/haptics only),
 * 'none' (a browser). Every native call lands in `calls`. */
function makeWorld(opts) {
  opts = opts || {};
  const calls = [];
  const storage = Object.assign({}, opts.storage || {});
  let clock = opts.start === undefined ? 1000 : opts.start;
  let nativeNow = 5000;                     // the native clock, seconds
  const kiwi = {
    play(o) { calls.push(['kiwi.play', o.kind, o.style, o.mode]); nativeNow += 0.001; return Promise.resolve({ t: nativeNow }); },
    clock() { nativeNow += 0.0005; return Promise.resolve({ t: nativeNow }); },
    prepare(o) { calls.push(['kiwi.prepare', o.kind, o.style, o.mode]); return Promise.resolve(); }
  };
  const stock = {
    impact(o) { calls.push(['impact', o.style]); return Promise.resolve(); },
    notification(o) { calls.push(['notification', o.type]); return Promise.resolve(); },
    selectionStart() { calls.push(['selectionStart']); return Promise.resolve(); },
    selectionChanged() { calls.push(['selectionChanged']); return Promise.resolve(); },
    selectionEnd() { calls.push(['selectionEnd']); return Promise.resolve(); },
    vibrate() { calls.push(['VIBRATE']); return Promise.resolve(); }
  };
  const plugins = {};
  if (opts.kind === 'kiwi') { plugins.KiwiHaptics = kiwi; plugins.Haptics = stock; }
  if (opts.kind === 'stock') plugins.Haptics = stock;
  const win = {
    localStorage: {
      getItem: (k) => (Object.prototype.hasOwnProperty.call(storage, k) ? storage[k] : null),
      setItem: (k, v) => { storage[k] = String(v); },
      removeItem: (k) => { delete storage[k]; }
    },
    location: { search: opts.search || '', pathname: opts.pathname || '/kiwi-caisse.html' },
    navigator: { userAgent: opts.ua || 'iPhone', platform: opts.platform || 'iPhone', maxTouchPoints: opts.touch === undefined ? 5 : opts.touch },
    setTimeout, clearTimeout, Promise, Date, JSON, Object, Math, String, Number, Array, RegExp, decodeURIComponent
  };
  if (opts.kind !== 'none') {
    win.Capacitor = { isNativePlatform: () => true, getPlatform: () => opts.platformName || 'ios', Plugins: plugins };
  }
  win.window = win;
  vm.createContext(win);
  vm.runInContext(SRC, win, { filename: 'assets/kit/haptics.js' });
  const H = win.KiwiHaptics;
  H._env.now = () => clock;
  return { H, calls, storage, win, tick(ms) { clock += ms; }, set clock(v) { clock = v; }, get clock() { return clock; }, plugins, kiwi };
}

const flush = () => new Promise((r) => setImmediate(r));

async function main() {
  /* ── the map ────────────────────────────────────────────────────────── */
  console.log('\nThe class map (§15.1)');
  {
    const w = makeWorld({ kind: 'stock' });
    const H = w.H;
    eq(H.CLASSES, ['Choose', 'Adjust', 'Commit', 'Paid', 'Shift', 'Failed', 'Caution', 'Grab'], 'eight classes, in the spec\'s order');
    const feel = {};
    let n = 0;
    for (const [cls, trig] of [['Adjust', 'tap'], ['Commit', 'local-record'], ['Paid', 'local-record'], ['Failed', 'tap'], ['Caution', 'tap'], ['Grab', 'threshold']]) {
      w.calls.length = 0;
      w.tick(100);
      const r = H.play(cls, 'g' + (++n), { trigger: trig });
      feel[cls] = w.calls.map((c) => c.join(':')).join(',');
      ok(r.played, cls + ' plays on a native build with the stock plugin');
    }
    eq(feel.Adjust, 'impact:LIGHT', 'Adjust is impact Light');
    eq(feel.Commit, 'impact:MEDIUM', 'Commit is impact Medium');
    eq(feel.Paid, 'notification:SUCCESS', 'Paid is notification Success');
    eq(feel.Failed, 'notification:ERROR', 'Failed is notification Error');
    eq(feel.Caution, 'notification:WARNING', 'Caution is notification Warning');
    eq(feel.Grab, 'impact:LIGHT', 'Grab is impact Light until prepared mode brings Soft (decision 9 fallback)');
    w.calls.length = 0; w.tick(100);
    w.H.play('Shift', 'shift1', { trigger: 'response', gestureAt: w.clock - 100 });
    eq(w.calls.map((c) => c.join(':')).join(','), 'notification:SUCCESS', 'Shift is notification Success, the same feel as Paid');
    ok(!Object.values(H.MAP).some((m) => m.style === 'HEAVY'), 'impact Heavy is unused');
    ok(!w.calls.some((c) => c[0] === 'VIBRATE'), 'the vibrate buzz is never used');
  }

  console.log('\nChoose is always a bracket (§15.1)');
  {
    const w = makeWorld({ kind: 'stock' });
    w.H.play('Choose', 'c1');
    eq(w.calls.map((c) => c[0]), ['selectionStart', 'selectionChanged', 'selectionEnd'], 'a Choose is selectionStart, selectionChanged, selectionEnd, in that order');
    const k = makeWorld({ kind: 'kiwi' });
    k.H.play('Choose', 'c1');
    eq(k.calls.map((c) => c[1] + ':' + c[2]), ['selection:start', 'selection:changed', 'selection:end'], 'through kiwi-haptics, the same bracket');
  }

  console.log('\nThe kiwi-haptics plugin (§15.2): stock mode until decision 9 is switched on');
  {
    const w = makeWorld({ kind: 'kiwi' });
    eq(w.H.getMode(), 'stock', 'the default mode is stock');
    eq(w.H.engine(), 'kiwi-haptics', 'the plugin is preferred when it is registered');
    w.H.play('Grab', 'a', { trigger: 'threshold' });
    eq(w.calls[0], ['kiwi.play', 'impact', 'LIGHT', 'stock'], 'Grab asks for LIGHT in stock mode');
    w.tick(100);
    w.H.setMode('prepared');
    w.H.play('Grab', 'b', { trigger: 'threshold' });
    eq(w.calls[1], ['kiwi.play', 'impact', 'SOFT', 'prepared'], 'Grab asks for SOFT in prepared mode');
    w.H.prepare('Adjust');
    eq(w.calls[2], ['kiwi.prepare', 'impact', 'LIGHT', 'prepared'], 'prepare() warms the generator in prepared mode');
    const s = makeWorld({ kind: 'kiwi' });
    s.H.prepare('Adjust');
    eq(s.calls.length, 0, 'prepare() is a no-op in stock mode');
    const old = makeWorld({ kind: 'stock' });
    eq(old.H.engine(), 'capacitor-haptics', 'a build without the plugin falls back to @capacitor/haptics');
    old.H.setMode('prepared');
    old.H.play('Grab', 'x', { trigger: 'threshold' });
    eq(old.calls[0], ['impact', 'LIGHT'], 'the stock plugin never gets SOFT, which it would turn into Heavy');
  }

  /* ── one gesture, one haptic ────────────────────────────────────────── */
  console.log('\nOne gesture, one haptic (§15.4)');
  {
    const w = makeWorld({ kind: 'kiwi' });
    ok(w.H.play('Adjust', 'tap1').played, 'the first play of a gesture plays');
    w.tick(500);
    const again = w.H.play('Adjust', 'tap1');
    ok(!again.played && again.reason === 'duplicate', 'a second play with the same gestureId is dropped');
    w.tick(500);
    ok(!w.H.play('Commit', 'tap1').played, 'even as another class');
    w.tick(500);
    ok(!w.H.play('Adjust', '').played && w.H.play('Adjust', '').reason === 'no-gesture-id', 'a play with no gestureId is refused');
    ok(w.H.play('Adjust', 'tap2').played, 'a new gesture plays');
    ok(w.H.play('Nope', 'x').reason === 'unknown-class', 'an unknown class is refused');
  }

  console.log('\nThe chart scrub, the only continuous gesture (§15.4)');
  {
    const w = makeWorld({ kind: 'kiwi', start: 0 });
    const H = w.H;
    const r0 = H.play('Choose', 'scrub1', 3);
    ok(r0.played, 'the first bucket ticks');
    eq(w.calls.map((c) => c[2]), ['start', 'changed'], 'the first tick opens the bracket (selectionStart) then ticks');
    w.tick(10);
    ok(H.play('Choose', 'scrub1', 4).reason === 'throttle', 'a tick under 40 ms after the last is skipped');
    w.tick(40);
    ok(H.play('Choose', 'scrub1', 4).played, 'a bucket 40 ms later ticks');
    eq(w.calls.map((c) => c[2]), ['start', 'changed', 'changed'], 'later ticks are bare selectionChanged inside the open bracket');
    w.tick(80);
    ok(H.play('Choose', 'scrub1', 3).reason === 'duplicate-step', 'going back over a bucket already ticked does not tick again');
    w.tick(80);
    ok(H.play('Choose', 'scrub1', 5).played, 'a new bucket ticks');
    ok(H.end('scrub1') === true, 'end() closes the bracket');
    eq(w.calls.map((c) => c[2]).slice(-1), ['end'], 'with selectionEnd');
    ok(H.end('scrub1') === false, 'a second end() does nothing');
    w.tick(80);
    ok(H.play('Choose', 'scrub1', 9).reason === 'duplicate', 'a closed scrub takes no more ticks');
    w.tick(80);
    ok(H.play('Adjust', 'scrub2', 1).reason === 'step-not-allowed', 'a step is allowed only on Choose, the scrub');
    // 24 buckets swept in one second: at most 25 ticks a second.
    const sweep = makeWorld({ kind: 'kiwi', start: 0 });
    let played = 0;
    for (let i = 0; i < 24; i++) { sweep.tick(5); if (sweep.H.play('Choose', 'sweep', i).played) played++; }
    ok(played <= 4 && played >= 3, 'a sweep of 24 buckets in 120 ms plays only the ticks 40 ms apart (' + played + ')');
    sweep.H._reset();
  }

  /* ── throttle ───────────────────────────────────────────────────────── */
  console.log('\nThrottle (§15.5)');
  {
    const w = makeWorld({ kind: 'kiwi', start: 0 });
    ok(w.H.play('Adjust', 't1').played, 'first Adjust plays');
    w.tick(59);
    ok(w.H.play('Adjust', 't2').reason === 'throttle', 'another class inside 60 ms is dropped');
    w.tick(1);
    ok(w.H.play('Adjust', 't3').played, 'at 60 ms it plays');
    w.tick(30);
    ok(w.H.play('Choose', 'c1').played, 'a Choose has its own 40 ms gap and is not held by an Adjust');
    ok(!w.H.play('Choose', 'c2').played, 'two Choose inside 40 ms: the second is dropped');
  }

  /* ── what each class waits for ──────────────────────────────────────── */
  console.log('\nWhat each commit waits for (§15.3)');
  {
    const w = makeWorld({ kind: 'kiwi', start: 10000 });
    const H = w.H;
    const t0 = w.clock;
    const g = () => { w.tick(100); return w.clock; };
    ok(H.play('Paid', 'p1', { trigger: 'tap' }).reason === 'trigger', 'Paid on a tap is refused');
    ok(H.play('Paid', 'p2', { trigger: 'response', gestureAt: t0 }).reason === 'trigger', 'Paid on a server response is refused');
    ok(H.play('Paid', 'p3', { trigger: 'local-record' }).played, 'Paid on the local record plays');
    g();
    ok(H.play('Commit', 'm1', { trigger: 'tap' }).reason === 'trigger', 'Commit on a bare tap is refused');
    ok(H.play('Commit', 'm2', { trigger: 'local-record' }).played, 'Commit on the local record plays');
    g();
    ok(H.play('Commit', 'm3', { trigger: 'server-ack', gestureAt: w.clock - 500 }).played, 'Commit on a server ack inside 600 ms plays');
    g();
    ok(H.play('Commit', 'm4', { trigger: 'server-ack', gestureAt: w.clock - 601 }).reason === 'late', 'a server ack after 600 ms is dropped');
    ok(H.play('Commit', 'm5', { trigger: 'server-ack' }).reason === 'no-gesture-time', 'a server ack with no gesture time is dropped');
    g();
    ok(H.play('Shift', 's1', { trigger: 'local-record' }).reason === 'trigger', 'Shift only fires on a response');
    ok(H.play('Shift', 's2', { trigger: 'response', gestureAt: w.clock - 200 }).played, 'Shift on a response inside 600 ms plays');
    g();
    ok(H.play('Failed', 'f1', { trigger: 'response', gestureAt: w.clock - 599 }).played, 'Failed at 599 ms plays');
    g();
    ok(H.play('Failed', 'f2', { trigger: 'response', gestureAt: w.clock - 650 }).reason === 'late', 'Failed at 650 ms buzzes nothing: a slow network never buzzes under the next gesture');
    g();
    ok(H.play('Adjust', 'a1', 4, {}).reason === 'step-not-allowed', 'a step on Adjust is refused');
    ok(H.play('Choose', 'c9', 1, { trigger: 'tap' }).reason === 'trigger', 'a step must carry the step trigger');
  }

  /* ── never buzz ─────────────────────────────────────────────────────── */
  console.log('\nNever buzz (§15.6)');
  {
    const w = makeWorld({ kind: 'kiwi', start: 0 });
    const H = w.H;
    H.suppress('scroll', true);
    ok(H.play('Adjust', 'a').reason === 'suppressed:scroll', 'nothing buzzes inside a scroll');
    H.suppress('scroll', false);
    w.tick(100);
    H.suppress('sheet-drag', true);
    ok(H.play('Adjust', 'b').reason === 'suppressed:sheet-drag', 'nothing buzzes inside a sheet drag');
    H.suppress('sheet-drag', false);
    w.tick(100);
    ok(H.play('Adjust', 'c').played, 'it plays again once the drag ends');
    w.tick(100);
    H.setSurface('kitchen');
    ok(H.play('Adjust', 'd').reason === 'kitchen', 'nothing on the kitchen surface (the KDS and its pairing pad)');
    H.setSurface(null);
    const k = makeWorld({ kind: 'kiwi', pathname: '/kiwi-cuisine.html' });
    ok(k.H.play('Adjust', 'e').reason === 'kitchen', 'the kitchen page is recognised from its path');

    const off = makeWorld({ kind: 'kiwi', storage: { kiwiHaptics: '0' } });
    ok(off.H.play('Adjust', 'f').reason === 'setting-off', 'Settings › Haptics off: nothing');
    const dev = makeWorld({ kind: 'kiwi', storage: { 'kiwiHaptics:device': '0' } });
    ok(dev.H.play('Adjust', 'g').reason === 'setting-off', 'This device › Haptics off: nothing');
    const on = makeWorld({ kind: 'kiwi' });
    ok(on.H.enabled() && on.H.play('Adjust', 'h').played, 'the default is on');
    on.H.setEnabled(false);
    ok(!on.H.enabled(), 'setEnabled(false) turns it off');
    on.H.setEnabled(true);
    ok(on.H.enabled(), 'and back on');

    const web = makeWorld({ kind: 'none' });
    const wr = web.H.play('Adjust', 'i');
    ok(!wr.played && wr.reason === 'no-engine' && web.H.engine() === null, 'a browser has no engine: a no-op');
    const guest = makeWorld({ kind: 'none', pathname: '/kiwi-order.html' });
    ok(!guest.H.play('Paid', 'j', { trigger: 'local-record' }).played, 'a guest page never vibrates');
    const ipad = makeWorld({ kind: 'kiwi', ua: 'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)' });
    ok(ipad.H.engine() === null && !ipad.H.play('Adjust', 'k').played && ipad.calls.length === 0, 'an iPad has no Taptic Engine: nothing is called (§15.0)');
    const ipados = makeWorld({ kind: 'kiwi', ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', platform: 'MacIntel', touch: 5 });
    ok(ipados.H.engine() === null, 'an iPad that presents as a Mac is still an iPad');
    const android = makeWorld({ kind: 'kiwi', ua: 'Mozilla/5.0 (Linux; Android 14)', platform: 'Linux armv8l', platformName: 'android' });
    ok(android.H.engine() === 'kiwi-haptics', 'an Android phone plays through the plugin');
    const broken = makeWorld({ kind: 'kiwi' });
    broken.kiwi.play = () => Promise.reject(new Error('"KiwiHaptics" plugin is not implemented on ios'));
    broken.H.play('Adjust', 'l');
    await flush();
    eq(broken.H.engine(), 'capacitor-haptics', 'a plugin the host does not implement is dropped for the stock one');
    const throwing = makeWorld({ kind: 'stock' });
    throwing.plugins.Haptics.impact = () => { throw new Error('boom'); };
    let threw = false;
    try { throwing.H.play('Adjust', 'm'); } catch (_) { threw = true; }
    ok(!threw, 'a native call that throws never reaches the caller');
    const blocked = makeWorld({ kind: 'kiwi' });
    blocked.win.localStorage.getItem = () => { throw new Error('SecurityError'); };
    ok(blocked.H.play('Adjust', 'n').played, 'blocked storage means the default (on), not a crash');
  }

  /* ── the legacy event ───────────────────────────────────────────────── */
  console.log('\nThe shipped kiwi:native-haptic event, until stage 7 (§20.3)');
  {
    const w = makeWorld({ kind: 'kiwi', start: 0 });
    ok(w.H.fromNativeEvent({ kind: 'light' }).played, 'light is an Adjust');
    w.tick(100);
    ok(w.H.fromNativeEvent({}).played, 'an event with no kind is a light');
    w.tick(100);
    ok(w.H.fromNativeEvent({ kind: 'danger' }).reason === 'legacy-ignored', 'danger with no gesture time is nothing');
    ok(w.H.fromNativeEvent({ kind: 'danger', gestureAt: w.clock - 650 }).reason === 'late', 'danger answered after 600 ms buzzes nothing');
    ok(w.H.fromNativeEvent({ kind: 'danger', gestureAt: w.clock - 100 }).played, 'danger inside 600 ms is a Failed (until the PIN pad of stage 3 calls Failed itself)');
    w.tick(100);
    ok(w.H.fromNativeEvent({ kind: 'success' }).reason === 'legacy-ignored', 'success with no gesture is nothing');
    ok(w.H.fromNativeEvent({ kind: 'success', gestureId: 's', trigger: 'tap' }).reason === 'legacy-ignored', 'success on a tap is nothing');
    ok(w.H.fromNativeEvent({ kind: 'success', gestureId: 's', trigger: 'local-record' }).played, 'success is Paid only with a gestureId and the local-record trigger');
  }

  /* ── trace ──────────────────────────────────────────────────────────── */
  console.log('\nThe trace (§15.6, ?hapticsTrace=1)');
  {
    const w = makeWorld({ kind: 'kiwi', start: 0, search: '?hapticsTrace=1' });
    const H = w.H;
    H.play('Adjust', 'a', { trigger: 'tap', eventTimeStamp: 0 });
    w.tick(100);
    H.play('Commit', 'b', { trigger: 'server-ack', route: 'POST /api/order/queue', gestureAt: w.clock - 50 });
    w.tick(100);
    H.play('Choose', 'sc', 0);
    w.tick(60);
    H.play('Choose', 'sc', 1);
    H.end('sc');
    w.tick(100);
    H.play('Paid', 'bad', { trigger: 'tap' });
    const t = H.trace;
    eq(t.length, 5, 'one entry per accepted play, one for the scrub close, none for a refused play');
    const keys = ['t', 'class', 'call', 'gestureId', 'step', 'latencyMs', 'trigger', 'route'];
    ok(keys.every((k) => k in t[0]), 'an entry carries {t, class, call, gestureId, step, latencyMs, trigger, route}');
    eq([t[0].class, t[0].call, t[0].trigger], ['Adjust', 'impact:LIGHT', 'tap'], 'the first entry is an Adjust, impact LIGHT, on a tap');
    eq([t[1].trigger, t[1].route], ['server-ack', 'POST /api/order/queue'], 'a server-ack entry names its route');
    eq([t[2].step, t[2].trigger, t[2].call, t[2].bracket], [0, 'step', 'selection:start+selection:changed', 'open'], 'a scrub\'s first tick opens the bracket');
    eq([t[3].step, t[3].bracket], [1, 'tick'], 'its next tick is a tick');
    eq([t[4].call, t[4].bracket], ['selection:end', 'close'], 'and end() writes the close');
    const one = makeWorld({ kind: 'kiwi' });
    one.H.play('Choose', 'o');
    eq(one.H.trace.length, 0, 'without ?hapticsTrace=1 nothing is recorded');
    const web = makeWorld({ kind: 'none', search: '?hapticsTrace=1' });
    ok(web.H.play('Adjust', 'w').reason === 'no-engine' && web.H.trace.length === 1 && web.H.trace[0].played === false, 'in a browser with the trace on, the intent is recorded as not played (the map test runs there)');
  }

  console.log('\nClock alignment and latency (§15.5)');
  {
    const w = makeWorld({ kind: 'kiwi', start: 100, search: '?hapticsTrace=1' });
    const H = w.H;
    // The native clock reads (web clock + 3 s) in ms, with a half-millisecond round trip.
    let nativeOffsetMs = 3000;
    w.kiwi.clock = () => { const w0 = w.clock; w.tick(0.5); return Promise.resolve({ t: (w0 + 0.25 + nativeOffsetMs) / 1000 }); };
    const cal = await H.calibrate();
    ok(cal && Math.abs(cal.offsetMs - nativeOffsetMs) < 0.01, 'the offset is recovered from 20 clock() calls (' + (cal && cal.offsetMs) + ')');
    ok(cal && cal.uncertaintyMs <= 2, 'with an uncertainty under 2 ms');
    w.kiwi.play = (o) => { w.tick(8); return Promise.resolve({ t: (w.clock + nativeOffsetMs) / 1000 }); };
    const eventAt = w.clock;
    w.tick(4);
    const r = H.play('Adjust', 'lat', { trigger: 'tap', eventTimeStamp: eventAt });
    const done = await r.done;
    ok(done.latencyMs !== null && Math.abs(done.latencyMs - 12) < 0.05, 'latency = native t − (event.timeStamp + offset) = 12 ms (' + done.latencyMs + ')');
    eq(H.trace[0].latencyMs, done.latencyMs, 'the trace entry carries the latency');
    const noisy = makeWorld({ kind: 'kiwi', start: 0 });
    noisy.kiwi.clock = () => { const w0 = noisy.clock; noisy.tick(9); return Promise.resolve({ t: (w0 + 4.5) / 1000 }); };
    eq(await noisy.H.calibrate(), null, 'a round trip above 2 ms of uncertainty is discarded');
    const plain = makeWorld({ kind: 'stock' });
    eq(await plain.H.calibrate(), null, 'without the plugin there is nothing to align');
  }

  console.log('\nGesture ids');
  {
    const w = makeWorld({ kind: 'none' });
    ok(w.H.gid('scan') !== w.H.gid('scan'), 'gid() never repeats');
  }

  console.log('\n' + (failures ? 'haptics-test: ' + failures + ' FAILED, ' + passed + ' passed' : 'haptics-test: ' + passed + ' controls passed'));
  process.exit(failures ? 1 : 0);
}

main().catch((err) => { console.error('haptics-test crashed:', err); process.exit(1); });
