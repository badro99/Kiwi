#!/usr/bin/env node
/* motion-browser-test · assets/kit/motion.js in a real Chromium (spec §14).
 *
 * What the Node suite cannot see:
 *   · animate() paints transform and opacity ONLY, on the glide curve, over the
 *     token's duration, and leaves nothing running afterwards (the element is
 *     parked: same transform now and 500 ms later);
 *   · a new target starts from the PRESENTED value, in the same frame;
 *   · under prefers-reduced-motion the travel is a --k-dur-2 crossfade to the
 *     true final frame (or a plain jump), never a movement; without
 *     Element.animate the element jumps to its final frame (§4.1);
 *   · the spring runs on requestAnimationFrame, writes transform only, rests on
 *     the target in about the spec's 333 ms, and parks;
 *   · grab() takes a presenting sheet's animation over with the glide curve's
 *     own velocity, and the spring finishes the job;
 *   · flip() slides rows on transform alone and ends at identity.
 *   node tools/motion-browser-test.mjs
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { suite } from './browser-trace.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const check = (yes, msg) => { assert.ok(yes, msg); console.log('  ✓ ' + msg); };
console.log('motion-browser-test');

let puppeteer;
try { puppeteer = createRequire(path.join(root, 'app/package.json'))('puppeteer-core'); }
catch { console.log('○ skip: puppeteer-core unavailable, browser assertions not executed'); process.exit(process.env.CI ? 1 : 0); }
const bin = process.env.KIWI_CHROMIUM_BIN || process.env.CHROME_BIN || ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Chromium.app/Contents/MacOS/Chromium', '/usr/bin/chromium', '/usr/bin/google-chrome'].find((p) => fs.existsSync(p));
if (!bin) { console.log('○ skip: Chromium unavailable, browser assertions not executed'); process.exit(process.env.CI ? 1 : 0); }

const browser = await puppeteer.launch({ executablePath: bin, headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const s = suite('motion', { browser });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const PAGE = `<!doctype html><html><head><meta charset="utf-8"><title>banc</title></head><body style="margin:0;background:#F7F5F0">
<div id="a" style="position:fixed;left:0;top:0;width:40px;height:40px;background:#0B6E4F"></div>
<ul id="list" style="position:fixed;left:100px;top:0;margin:0;padding:0;list-style:none">
<li style="height:30px;width:80px;background:#ccc">1</li><li style="height:30px;width:80px;background:#bbb">2</li><li style="height:30px;width:80px;background:#aaa">3</li></ul>
</body></html>`;

async function open(t, { reduced = false } = {}) {
  const page = t.watch(await browser.newPage());
  t.defer(() => page.close());
  await page.setViewport({ width: 800, height: 600 });
  if (reduced) await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
  await page.setContent(PAGE);
  await page.addScriptTag({ path: path.join(root, 'assets/kit/motion.js') });
  return page;
}
const ONLY_TO = (keys) => keys.every((k) => ['transform', 'opacity', 'offset', 'easing', 'composite', 'computedOffset'].includes(k));

await s.run('animate: transform and opacity only, glide, token duration, parked after', async (t) => {
  const page = await open(t);
  t.step('start a --k-dur-5 push');
  const info = await page.evaluate(() => {
    const el = document.getElementById('a');
    const h = KiwiMotion.animate(el, { transform: 'translate3d(0,200px,0)', opacity: 0.5 }, { dur: 'dur5' });
    const kf = h.animation.effect.getKeyframes();
    const timing = h.animation.effect.getTiming();
    return { keys: Object.keys(kf[0]).concat(Object.keys(kf[1])), duration: timing.duration, easing: timing.easing, n: el.getAnimations().length };
  });
  check(ONLY_TO(info.keys), `keyframes carry ${[...new Set(info.keys)].filter((k) => k !== 'offset' && k !== 'easing' && k !== 'composite' && k !== 'computedOffset').join(' and ')} only`);
  check(info.duration === 350, `duration is --k-dur-5 (${info.duration} ms)`);
  check(/0\.32,\s*0\.72,\s*0,\s*1/.test(info.easing), `easing is the glide curve (${info.easing})`);
  check(info.n === 1, 'one animation runs');
  await wait(350 + 500);
  const parked = await page.evaluate(async () => {
    const el = document.getElementById('a');
    const a = getComputedStyle(el).transform, o = getComputedStyle(el).opacity;
    await new Promise((r) => setTimeout(r, 120));
    return { a, b: getComputedStyle(el).transform, o, n: el.getAnimations().length };
  });
  check(parked.a === 'matrix(1, 0, 0, 1, 0, 200)' && parked.a === parked.b, 'parked on the final transform, still 500 ms later');
  check(parked.o === '0.5' && parked.n === 0, 'final opacity set and nothing left running');
});

await s.run('animate: a new target starts from the presented value', async (t) => {
  const page = await open(t);
  await page.evaluate(() => KiwiMotion.animate(document.getElementById('a'), { transform: 'translate3d(0,400px,0)' }, { dur: 'dur5' }));
  await wait(120);
  const r = await page.evaluate(() => {
    const el = document.getElementById('a');
    const before = KiwiMotion.presented(el).y;
    const h = KiwiMotion.animate(el, { transform: 'translate3d(0,0,0)' }, { dur: 'dur5' });
    const first = h.animation.effect.getKeyframes()[0].transform;
    return { before, first, n: el.getAnimations().length };
  });
  const y = parseFloat(/translate3d\(0(?:px)?,\s*([-\d.]+)px/.exec(r.first)?.[1] ?? /matrix\([^)]*,\s*([-\d.]+)\)$/.exec(r.first)?.[1]);
  check(r.before > 20 && r.before < 380, `grabbed mid-flight at ${r.before.toFixed(1)} px`);
  check(Math.abs(y - r.before) < 0.5, `the new animation starts at ${y.toFixed(1)} px, where the old one was (${r.before.toFixed(1)})`);
  check(r.n === 1, 'the old animation was cancelled (one animation, not two)');
});

await s.run('reduced motion: a crossfade to the final frame, never travel', async (t) => {
  const page = await open(t, { reduced: true });
  check(await page.evaluate(() => KiwiMotion.reduced()), 'prefers-reduced-motion: reduce is seen');
  const enter = await page.evaluate(() => {
    const el = document.getElementById('a');
    const h = KiwiMotion.animate(el, { transform: 'translate3d(100px,0,0)' }, { dur: 'dur5', enter: true, curve: 'spring' });
    const kf = h.animation.effect.getKeyframes();
    return { keys: [...new Set(kf.flatMap((k) => Object.keys(k)))], duration: h.animation.effect.getTiming().duration, easing: h.animation.effect.getTiming().easing, final: el.style.transform };
  });
  check(!enter.keys.includes('transform') && enter.keys.includes('opacity'), 'an arriving element fades; its keyframes hold no transform');
  check(enter.duration === 160, `over --k-dur-2 (${enter.duration} ms), not the 350 ms push`);
  check(/0\.32,\s*0\.72,\s*0,\s*1/.test(enter.easing), 'a spring curve becomes the glide curve (no overshoot)');
  check(enter.final === 'translate3d(100px, 0px, 0px)', 'the element is already at its true final frame');
  const move = await page.evaluate(() => {
    const el = document.getElementById('list');
    const h = KiwiMotion.animate(el, { transform: 'translate3d(0,50px,0)' }, { dur: 'dur3' });
    return { n: el.getAnimations().length, hasAnim: !!h.animation, final: el.style.transform };
  });
  check(move.n === 0 && !move.hasAnim && /50px/.test(move.final), 'an element that only moves just lands: no animation at all');
  const fade = await page.evaluate(() => {
    const h = KiwiMotion.animate(document.getElementById('a'), { opacity: 0 }, { dur: 'dur7' });
    return h.animation.effect.getTiming().duration;
  });
  check(fade === 160, 'a plain fade is capped at --k-dur-2');
  const spring = await page.evaluate(() => new Promise((res) => {
    const el = document.getElementById('a');
    let n = 0;
    const sp = KiwiMotion.bindSpring(el, { from: 400, to: 0, axis: 'y', onUpdate: () => { n++; }, onRest: () => res({ n, t: el.style.transform }) });
    sp.to(0);
  }));
  check(spring.n === 1 && spring.t === 'translate3d(0px, 0px, 0px)', 'the spring lands on its target in one frame');
});

await s.run('no Element.animate: the element jumps to its final frame', async (t) => {
  const page = await open(t);
  const r = await page.evaluate(() => {
    delete Element.prototype.animate;
    const el = document.getElementById('a');
    const h = KiwiMotion.animate(el, { transform: 'translate3d(0,90px,0)', opacity: 0.25 }, { dur: 'dur5' });
    return { t: el.style.transform, o: el.style.opacity, a: h.animation };
  });
  check(r.t === 'translate3d(0px, 90px, 0px)' && r.o === '0.25' && r.a === null, 'final transform and opacity set, nothing animated');
});

await s.run('animate: anything but transform and opacity is refused', async (t) => {
  const page = await open(t);
  const r = await page.evaluate(() => {
    const warns = [];
    const w = console.warn; console.warn = (m) => warns.push(m);
    const el = document.getElementById('a');
    const h0 = el.style.height, t0 = el.style.top;
    const h = KiwiMotion.animate(el, { transform: 'translate3d(0,10px,0)', height: '300px', top: '90px' }, { dur: 'dur3' });
    console.warn = w;
    return { keys: [...new Set(h.animation.effect.getKeyframes().flatMap((k) => Object.keys(k)))], height: el.style.height === h0, top: el.style.top === t0, warns };
  });
  check(!r.keys.includes('height') && !r.keys.includes('top') && r.height && r.top, 'height and top are never written');
  check(r.warns.length === 2, 'and each refusal is reported once');
});

await s.run('spring: rAF solver, transform only, rests near 333 ms, parks', async (t) => {
  const page = await open(t);
  const r = await page.evaluate(() => new Promise((res) => {
    const el = document.getElementById('a');
    const before = Array.from(el.style);
    const t0 = performance.now();
    let frames = 0, minPos = 1e9, maxPos = -1e9;
    const sp = KiwiMotion.bindSpring(el, {
      from: 400, to: 0, axis: 'y',
      onUpdate: (s) => { frames++; minPos = Math.min(minPos, s.position); maxPos = Math.max(maxPos, s.position); },
      onRest: () => res({ ms: performance.now() - t0, frames, minPos, maxPos, added: Array.from(el.style).filter((p) => !before.includes(p)), end: el.style.transform })
    });
    sp.to(0);
  }));
  check(r.ms >= 250 && r.ms <= 520, `400 pt settles in ${r.ms.toFixed(0)} ms (spec 333 ms, frame quantised)`);
  check(r.added.length === 1 && r.added[0] === 'transform', `it wrote transform only (${r.added.join(', ')})`);
  check(r.minPos >= 0 && r.maxPos <= 400 && r.end === 'translate3d(0px, 0px, 0px)', 'no overshoot, and the last frame is exactly the target');
  await wait(500);
  const p = await page.evaluate(async () => {
    const el = document.getElementById('a');
    const a = getComputedStyle(el).transform;
    await new Promise((x) => setTimeout(x, 100));
    return { same: a === getComputedStyle(el).transform, running: el.getAnimations().length };
  });
  check(p.same && p.running === 0, 'parked 500 ms after it ended');
});

await s.run('grab: the spring takes over a presenting sheet with the glide velocity', async (t) => {
  const page = await open(t);
  await page.evaluate(() => { window.__h = KiwiMotion.animate(document.getElementById('a'), { transform: 'translate3d(0,400px,0)' }, { dur: 'dur5' }); });
  await wait(100);
  const g = await page.evaluate(() => {
    const el = document.getElementById('a');
    const g = KiwiMotion.grab(el, window.__h, { axis: 'y', distance: 400, durationMs: 350 });
    return { g, n: el.getAnimations().length, expected: KiwiMotion.glideVelocity(g.progress, 400, 350) };
  });
  check(g.g.position > 10 && g.g.position < 390, `grabbed at ${g.g.position.toFixed(1)} pt`);
  check(g.g.progress > 0.15 && g.g.progress < 0.7, `at ${(g.g.progress * 100).toFixed(0)} % of the push`);
  check(g.g.velocity > 0 && Math.abs(g.g.velocity - g.expected) < 1e-6, `with the glide curve's own velocity, ${Math.round(g.g.velocity)} pt/s`);
  check(g.n === 0, 'the WAAPI animation is cancelled');
  const end = await page.evaluate((from) => new Promise((res) => {
    const el = document.getElementById('a');
    const sp = KiwiMotion.bindSpring(el, { from: from.position, velocity: from.velocity, to: 400, axis: 'y', onRest: () => res(el.style.transform) });
    sp.to(400, { velocity: from.velocity });
  }), g.g);
  check(end === 'translate3d(0px, 400px, 0px)', 'the spring finishes on the sheet\'s resting place');
});

await s.run('flip: rows slide on transform alone and end at identity', async (t) => {
  const page = await open(t);
  const r = await page.evaluate(async () => {
    const ul = document.getElementById('list');
    const rows = Array.from(ul.children);
    const p = KiwiMotion.flip(rows, () => ul.insertBefore(rows[2], rows[0]));
    const running = rows.map((r) => r.getAnimations().length);
    const kf = rows.map((r) => r.getAnimations()[0] ? Object.keys(r.getAnimations()[0].effect.getKeyframes()[0]).filter((k) => !['offset', 'easing', 'composite', 'computedOffset'].includes(k)) : []);
    const dur = rows[0].getAnimations()[0] && rows[0].getAnimations()[0].effect.getTiming().duration;
    await p;
    return { running, kf, dur, after: rows.map((r) => getComputedStyle(r).transform), order: Array.from(ul.children).map((r) => r.textContent) };
  });
  check(r.order.join() === '3,1,2', 'the DOM changed in one step');
  check(r.running.every((n) => n === 1), 'all three rows moved');
  check(r.kf.every((k) => k.length === 1 && k[0] === 'transform'), 'on transform alone');
  check(r.dur === 240, `over --k-dur-3 (${r.dur} ms)`);
  check(r.after.every((a) => a === 'none' || a === 'matrix(1, 0, 0, 1, 0, 0)'), 'and each ends at identity');
});

await s.finish();
