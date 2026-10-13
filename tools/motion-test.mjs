#!/usr/bin/env node
/* motion-test · assets/kit/motion.js against spec §14, with no browser.
 *
 *   · the duration tokens and the curves are the spec's, and nothing else;
 *   · the gesture spring (§14.3): stiffness 1400, damping 74.8, mass 1, a fixed
 *     1/120 s semi-implicit Euler step, rest at |x| < 0.5 pt and |v| < 5 pt/s,
 *     and the settle-time table of the spec reproduced from the same rules;
 *   · a retarget keeps position AND velocity; the driver writes transform only
 *     and lands exactly on its target; reduced motion lands without travel;
 *   · the glide curve's velocity for the hand-over from a WAAPI animation;
 *   · the lens plan (115 + 310 = 425 ms; one 160 ms crossfade when reduced);
 *   · the gesture thresholds of §14.7, at and either side of each boundary;
 *   · RECIPES / REDUCED name only real tokens and curves;
 *   · when assets/kit/tokens-2027.css exists, its --k-dur-* and curve tokens
 *     agree with the script's.
 *   node tools/motion-test.mjs
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const M = require(path.join(root, 'assets/kit/motion.js'));
const check = (yes, msg) => { assert.ok(yes, msg); console.log('  ✓ ' + msg); };
const near = (a, b, eps, msg) => check(Math.abs(a - b) <= eps, `${msg} (${a} vs ${b})`);
console.log('motion-test');

/* ── §14.1 · tokens ────────────────────────────────────────────────────── */
{
  const spec = { '--k-dur-1': 90, '--k-dur-2': 160, '--k-dur-3': 240, '--k-lens-stretch': 115, '--k-dur-4': 310, '--k-dur-5': 350,
    '--k-dur-6': 400, '--k-dur-7': 600, '--k-dur-8': 1100, '--k-dur-9': 1200, '--k-dur-toast': 4000, '--k-dur-toast-action': 8000 };
  assert.deepEqual({ ...M.TOKENS }, spec);
  check(Object.keys(M.TOKENS).length === 12, 'twelve duration tokens, exactly the spec table');
  const byName = (n) => n.replace('--k-dur-', 'dur').replace('--k-lens-stretch', 'lensStretch').replace('toast-action', 'toastAction').replace('--k-dur-toast', 'toast');
  const camel = { '--k-lens-stretch': 'lensStretch', '--k-dur-toast': 'toast', '--k-dur-toast-action': 'toastAction' };
  for (const [name, ms] of Object.entries(spec)) {
    const key = camel[name] || byName(name);
    assert.equal(M.DUR[key], ms, `${name} -> DUR.${key}`);
  }
  check(true, 'DUR mirrors TOKENS key for key');
  check(Object.isFrozen(M.TOKENS) && Object.isFrozen(M.DUR) && Object.isFrozen(M.CURVES), 'tokens and curves are frozen');
  assert.equal(M.CURVES.spring, 'cubic-bezier(0.34, 1.45, 0.5, 1)');
  assert.equal(M.CURVES.glide, 'cubic-bezier(0.32, 0.72, 0, 1)');
  assert.equal(M.CURVES.exit, 'cubic-bezier(0.4, 0, 1, 1)');
  check(Object.keys(M.CURVES).length === 3, 'three curves: spring, glide, exit');
  check(M.DUR.lensStretch + M.DUR.dur4 === 425, 'a lens tap is 115 + 310 = 425 ms');
}

/* ── §14.3 · the spring ────────────────────────────────────────────────── */
{
  const S = M.SPRING;
  check(S.stiffness === 1400 && S.damping === 74.8 && S.mass === 1, 'stiffness 1400, damping 74.8, mass 1');
  near(S.step, 1 / 120, 1e-12, 'fixed step 1/120 s');
  check(S.restX === 0.5 && S.restV === 5, 'rest at |x| < 0.5 pt and |v| < 5 pt/s');
  near(S.damping, 2 * Math.sqrt(S.stiffness * S.mass), 0.05, 'damping ratio 1.0 (74.8 is 2 sqrt(k m), rounded)');

  /* The table of the spec: travel x release speed -> settle time. */
  const table = [
    [200, [0, 800, 2000], 300, 308.4],
    [400, [0, 800, 2000], 333, 333.4],
    [880, [0, 800, 2000], 366, 367],
  ];
  for (const [travel, speeds, lo, hi] of table) {
    for (const v of speeds) {
      const t = M.settleTime(travel, v);
      check(t >= lo && t <= hi, `${travel} pt at ${v} pt/s settles in ${t} ms (spec ${lo} to ${hi})`);
    }
  }
  check(M.settleTime(400, 0) <= M.DUR.dur5, '400 pt settles within --k-dur-5 (350 ms)');
  check(M.settleTime(880, 0) > M.DUR.dur5 && M.settleTime(880, 0) - M.DUR.dur5 <= 17, 'the full-height case is 17 ms over, as the spec states');

  /* No overshoot for the speeds the spec lists: x keeps its sign. */
  for (const travel of [200, 400, 880]) for (const v of [0, 800, 2000]) {
    const s = { x: travel, v: -v };
    let crossed = false;
    for (let i = 0; i < 400; i++) { if (M.springStep(s)) break; if (s.x < -1e-9) crossed = true; }
    assert.ok(!crossed, `${travel} pt at ${v} pt/s overshoots`);
  }
  check(true, 'no overshoot for 200, 400 and 880 pt at 0, 800 and 2,000 pt/s');

  /* Semi-implicit Euler: velocity first, then position with the NEW velocity. */
  const s = { x: 100, v: 0 };
  M.springStep(s);
  near(s.v, (-1400 * 100) / 120, 1e-9, 'velocity updates first (a = -k x / m)');
  near(s.x, 100 + s.v / 120, 1e-9, 'position then uses the new velocity');
}

/* ── the driver ────────────────────────────────────────────────────────── */
{
  const env = M._env;
  const saved = { ...env };
  let queue = [], nextId = 1;
  env.raf = (fn) => { const id = nextId++; queue.push({ id, fn }); return id; };
  env.caf = (id) => { queue = queue.filter((q) => q.id !== id); };
  env.reduced = () => false;
  const frame = (t) => { const q = queue; queue = []; q.forEach((x) => x.fn(t)); };
  const run = (sp, ms, from = 0) => { let t = from; for (let i = 0; i < ms / 8 && queue.length; i++) { t += 8; frame(t); } return t; };

  const seen = [];
  let rested = 0;
  const sp = M.createSpring({ from: 400, to: 0, onUpdate: (s) => seen.push(s.position), onRest: () => rested++ });
  sp.to(0);
  check(sp.running, 'to() starts the driver');
  frame(1000);
  const t0 = run(sp, 1000, 1000);
  check(rested === 1 && !sp.running, 'the driver rests once');
  check(sp.position === 0 && sp.velocity === 0 && seen[seen.length - 1] === 0, 'the last frame lands exactly on the target');
  check(seen.every((p) => p >= 0 && p <= 400), 'it never leaves the span between start and target');
  check(seen.every((p, i) => i === 0 || p <= seen[i - 1] + 1e-9), 'it travels monotonically toward the target');

  /* A retarget keeps position and velocity. */
  const sp2 = M.createSpring({ from: 300, to: 0 });
  sp2.to(0);
  frame(2000);
  let tt = 2000;
  for (let i = 0; i < 6; i++) { tt += 8; frame(tt); }
  const p = sp2.position, v = sp2.velocity;
  check(p < 300 && p > 0 && v < 0, `mid-flight at ${p.toFixed(1)} pt, ${v.toFixed(0)} pt/s`);
  sp2.to(500);
  check(sp2.position === p && sp2.velocity === v, 'a retarget keeps the current position and velocity');
  tt += 8; frame(tt); tt += 8; frame(tt);
  check(sp2.position !== p && sp2.target === 500, 'and then moves toward the new target');
  sp2.stop();

  /* advance() in fixed steps agrees with settleTime(). */
  const sp3 = M.createSpring({ from: 400, to: 0 });
  let steps = 0;
  while (!sp3.advance(1 / 120)) { steps++; if (steps > 2000) break; }
  near((steps + 1) * (1000 / 120), M.settleTime(400, 0), 9, 'advance() in 1/120 s steps agrees with settleTime()');

  /* A paused tab drops the backlog instead of spiralling. */
  const sp4 = M.createSpring({ from: 400, to: 0 });
  sp4.advance(30);
  check(sp4.position > 0 && sp4.position < 400, 'a 30 s pause advances at most a few steps (it is not simulated)');
  const sp4b = M.createSpring({ from: 400, to: 0 });
  sp4b.advance(M.SPRING.maxCatchUp * M.SPRING.step);
  near(sp4.position, sp4b.position, 1e-9, 'exactly maxCatchUp steps, and the backlog is dropped');

  /* hold() follows a finger with no animation. */
  const sp5 = M.createSpring({ from: 0, to: 0 });
  sp5.hold(120);
  check(sp5.position === 120 && sp5.velocity === 0 && !sp5.running, 'hold() follows the finger and animates nothing');
  sp5.to(0, { velocity: 800 });
  check(sp5.running, 'a release from a held position starts the spring');
  sp5.stop();

  /* Writes transform and nothing else. */
  const style = {};
  const el = { style };
  const b = M.bindSpring(el, { from: 100, to: 100, axis: 'y' });
  b.hold(40);
  check(style.transform === 'translate3d(0,40px,0)' && Object.keys(style).length === 1, 'bindSpring writes transform only');
  const bx = M.bindSpring(el, { from: 0, to: 0, axis: 'x', rtl: true });
  bx.hold(30);
  check(style.transform === 'translate3d(-30px,0,0)', 'an RTL x axis mirrors the sign');

  /* Reduced motion: the final frame at once, no travel. */
  env.reduced = () => true;
  let rest2 = 0, last2 = null;
  const sp6 = M.createSpring({ from: 400, to: 0, onUpdate: (s) => { last2 = s.position; }, onRest: () => rest2++ });
  sp6.to(0);
  check(!sp6.running && last2 === 0 && rest2 === 1, 'reduced motion lands on the final frame with no travel');
  const sp7 = M.createSpring({ from: 400, to: 0, respectReduced: false });
  sp7.to(0);
  check(sp7.running, 'a caller that opts out of reduced motion (a finger drag) still runs');
  sp7.stop();

  Object.assign(env, saved);
}

/* ── hand-over from a WAAPI animation ──────────────────────────────────── */
{
  const e = M.cubicBezier(...M.CURVE_POINTS.glide);
  near(e.y(0), 0, 1e-6, 'glide starts at 0');
  near(e.y(1), 1, 1e-6, 'glide ends at 1');
  let mono = true;
  for (let i = 1; i <= 100; i++) if (e.y(i / 100) < e.y((i - 1) / 100)) mono = false;
  check(mono, 'glide is monotone (no overshoot)');
  const s = M.cubicBezier(...M.CURVE_POINTS.spring);
  check(Math.max(...Array.from({ length: 101 }, (_, i) => s.y(i / 100))) > 1.01, 'spring overshoots, as the curve is meant to');
  const h = 1e-4;
  for (const x of [0.1, 0.3, 0.6, 0.9]) {
    const fd = (e.y(x + h) - e.y(x - h)) / (2 * h);
    near(e.dydx(x), fd, 1e-3, `dy/dx at ${x} matches a finite difference`);
  }
  const v0 = M.glideVelocity(0, 400, 350);
  near(v0, e.dydx(0) * 400 / 0.35, 1e-6, 'velocity at progress 0 = slope x distance / duration');
  check(v0 > 1000, `a presenting sheet grabbed at once moves at ${Math.round(v0)} pt/s`);
  near(M.glideVelocity(1, 400, 350), 0, 1e-6, 'and is at rest at the end');
  check(M.glideVelocity(0.5, 400, 350) < M.glideVelocity(0.1, 400, 350), 'it slows down along the way');
  near(M.glideVelocity(-1, 400, 350), v0, 1e-9, 'progress is clamped to 0..1');
}

/* ── lens plan ─────────────────────────────────────────────────────────── */
{
  const a = { start: 4, size: 80 }, b = { start: 164, size: 90 };
  const p = M.lensPlan(a, b, { reduced: false });
  check(p.totalMs === 425 && p.phases.length === 2, 'two phases, 425 ms in all');
  assert.deepEqual(p.phases[0].span, { start: 4, size: 250 });
  check(p.phases[0].name === 'stretch' && p.phases[0].at === 0 && p.phases[0].dur === 310 && p.phases[0].curve === 'spring', 'stretch: the span of old and new, spring, 310 ms');
  assert.deepEqual(p.phases[1].span, b);
  check(p.phases[1].name === 'settle' && p.phases[1].at === 115 && p.phases[1].dur === 310 && p.phases[1].curve === 'spring', 'settle at 115 ms: the new option alone, spring, 310 ms');
  const back = M.lensPlan(b, a, { reduced: false });
  assert.deepEqual(back.phases[0].span, { start: 4, size: 250 });
  check(true, 'the stretch spans the same union going the other way');
  const r = M.lensPlan(a, b, { reduced: true });
  check(r.totalMs === 160 && r.phases.length === 1 && r.phases[0].name === 'crossfade' && r.phases[0].dur === 160, 'reduced motion: one --k-dur-2 crossfade, no stretch');
  check(M.lensPlan(a, a, { reduced: false }).phases.length === 0, 'no move, no phases');
}

/* ── §14.7 · gesture thresholds ────────────────────────────────────────── */
{
  const g = M.gesture, T = M.THRESHOLDS;
  check(T.tapSlopPt === 10 && T.longPressMs === 500 && T.scrubHoldMs === 240 && T.rowFullSwipe === 0.6
    && T.sheetDismissFraction === 0.35 && T.sheetFlingPtPerS === 800 && T.pullToRefreshPt === 64 && T.toastDismissPt === 24 && T.toastFlingPtPerS === 300, 'the §14.7 table, number for number');
  check(g.isTap({ dx: 6, dy: 8 }) && !g.isTap({ dx: 6, dy: 8.1 }), 'tap: within 10 pt of the press point');
  check(!g.isTap({ dx: 0, dy: 0, cancelled: true }), 'tap: not after a pointercancel');
  check(g.isLongPress({ heldMs: 500, dx: 0, dy: 0 }) && !g.isLongPress({ heldMs: 499, dx: 0, dy: 0 }) && !g.isLongPress({ heldMs: 600, dx: 11, dy: 0 }), 'long press: 500 ms still');
  check(g.chartScrub({ heldMs: 100, moveBeforeHoldPt: 0 }) === 'pending' && g.chartScrub({ heldMs: 240, moveBeforeHoldPt: 3 }) === 'scrub' && g.chartScrub({ heldMs: 200, moveBeforeHoldPt: 20 }) === 'pan' && g.chartScrub({ heldMs: 400, moveBeforeHoldPt: 20 }) === 'pan', 'chart scrub: 240 ms still, movement before that pans');
  check(g.rowFullSwipe(-60, 100) && !g.rowFullSwipe(59, 100) && !g.rowFullSwipe(10, 0), 'row full swipe: 60 % of the width, either way');
  check(g.sheetDismisses(35, 100, 0) && !g.sheetDismisses(34, 100, 0) && g.sheetDismisses(0, 100, 801) && !g.sheetDismisses(0, 100, 800), 'sheet dismiss: 35 % of its height, or a fling over 800 pt/s');
  check(g.pullToRefresh(64) && !g.pullToRefresh(63.9), 'pull to refresh: 64 pt');
  check(g.toastDismisses(24, 0) && !g.toastDismisses(23, 0) && g.toastDismisses(0, 301) && !g.toastDismisses(0, 300), 'toast dismiss: 24 pt down, or a fling over 300 pt/s');
}

/* ── §14.4 / §14.5 as data ─────────────────────────────────────────────── */
{
  const durs = new Set(Object.keys(M.DUR));
  for (const [name, r] of Object.entries(M.RECIPES)) {
    for (const k of ['dur', 'highlight', 'closeUp']) if (r[k]) assert.ok(durs.has(r[k]), `${name}.${k} = ${r[k]} is not a duration token`);
    if (r.curve) assert.ok(M.CURVES[r.curve], `${name}.curve = ${r.curve} is not one of the three curves`);
    if (r.release) assert.ok(durs.has(r.release.dur) && M.CURVES[r.release.curve], `${name}.release names a token`);
    for (const p of r.props) assert.ok(p === 'transform' || p === 'opacity', `${name} animates ${p}`);
  }
  check(true, 'every recipe names a real duration token and one of the three curves, and animates transform and opacity only');
  for (const [name, r] of Object.entries(M.REDUCED)) if (r.dur) assert.ok(durs.has(r.dur), `${name} reduced ${r.dur}`);
  check(M.REDUCED.travel.dur === 'dur2' && M.REDUCED.pinShake.do === 'none' && M.REDUCED.numberRoll.do === 'instant' && M.REDUCED.paidMoment.hold === 'dur8', 'the reduced-motion table: crossfade --k-dur-2, no shake, instant roll, paid hold --k-dur-8');
  check(M.RECIPES.press.dur === 'dur1' && M.RECIPES.press.release.dur === 'dur4' && M.RECIPES.press.release.curve === 'spring', 'press: --k-dur-1 in, spring --k-dur-4 out');
  check(M.RECIPES.sheetPresent.dur === 'dur5' && M.RECIPES.sheetDismiss.dur === 'dur3' && M.RECIPES.sheetDismiss.curve === 'exit', 'sheet: present --k-dur-5 glide, dismiss --k-dur-3 exit');
  check(M.rollDirection(10, 11) === 'from-below' && M.rollDirection(11, 10) === 'from-above' && M.rollDirection(5, 5) === 'none', 'number roll: an increase enters from below, a decrease from above');
}

/* ── the token file, when it exists ────────────────────────────────────── */
{
  const candidates = ['assets/kit/tokens-2027.css', 'assets/tokens-2027.css'].map((p) => path.join(root, p));
  const file = candidates.find((p) => fs.existsSync(p));
  if (!file) console.log('  ○ tokens-2027.css not present yet, token cross-check skipped');
  else {
    const css = fs.readFileSync(file, 'utf8');
    const val = (name) => {
      const m = css.match(new RegExp(name.replace(/[-]/g, '\\-') + '\\s*:\\s*([^;}]+)'));
      return m ? m[1].trim() : null;
    };
    let seen = 0;
    for (const [name, ms] of Object.entries(M.TOKENS)) {
      const v = val(name);
      if (v === null) continue;
      seen++;
      const n = v.endsWith('ms') ? parseFloat(v) : v.endsWith('s') ? parseFloat(v) * 1000 : NaN;
      assert.equal(n, ms, `${path.basename(file)} ${name}: ${v} but motion.js says ${ms} ms`);
    }
    for (const [name, curve] of [['--k-spring', M.CURVES.spring], ['--k-glide', M.CURVES.glide], ['--k-exit', M.CURVES.exit]]) {
      const v = val(name);
      if (v === null) continue;
      seen++;
      assert.equal(v.replace(/\s+/g, ''), curve.replace(/\s+/g, ''), `${name} in ${path.basename(file)} differs from motion.js`);
    }
    check(true, `${path.basename(file)} agrees with motion.js on the ${seen} motion tokens it declares`);
  }
}

/* ── export shape ──────────────────────────────────────────────────────── */
check(globalThis.KiwiMotion === M, 'window.KiwiMotion is the module');
for (const k of ['animate', 'flip', 'grab', 'createSpring', 'bindSpring', 'lensPlan', 'reduced', 'presented', 'settleTime', 'glideVelocity']) assert.equal(typeof M[k], 'function', k);
assert.equal(typeof M.gesture, 'object');
console.log('\n✓ motion-test');
