#!/usr/bin/env node
/* Kiwi · motion-park-browser-test · under reduced motion, the kit parks at a
 * true frame (spec §14.5).
 *
 * The gallery with prefers-reduced-motion: reduce. Every moving part of the
 * kit either stops at the frame it would have come to rest on, or crossfades
 * there; nothing travels and nothing loops:
 *   · skeleton and the PIN pad's loading dots: no animation running;
 *   · spinner: the static progress glyph and its words, no arc;
 *   · the lens: an opacity fade, never a transform or a width transition, and
 *     it ends on the chosen option's box;
 *   · the sheet: no transform animation on open, at rest at translateY(0);
 *   · a figure that changes: the new digits, with no rolling glyphs.
 * The same controls without the preference are checked once, so the suite
 * would notice if the reduced branch were simply the only branch.
 *
 *   node tools/motion-park-browser-test.mjs */
import assert from 'node:assert/strict';
import { kitBrowser, settle, tapDeep } from './kit-browser.mjs';
import { suite } from './browser-trace.mjs';

console.log('motion-park-browser-test');
const kb = await kitBrowser('motion-park');
const s = suite('motion-park', { browser: kb.browser });
let checks = 0;
const check = (yes, msg) => { assert.ok(yes, msg); checks++; console.log('  ✓ ' + msg); };

const lensMove = async (page) => {
  await tapDeep(page, '#seg-range', '[data-v="d7"]');
  const mid = await page.evaluate(() => {
    const l = document.querySelector('#seg-range').shadowRoot.querySelector('.lens');
    return { tr: l.style.transition, anims: l.getAnimations().map((a) => a.transitionProperty || '') };
  });
  await settle(page, 700);
  const end = await page.evaluate(() => {
    const root = document.querySelector('#seg-range').shadowRoot;
    const l = root.querySelector('.lens'), b = root.querySelector('[data-v="d7"]');
    const lr = l.getBoundingClientRect(), br = b.getBoundingClientRect();
    return { op: getComputedStyle(l).opacity, dx: Math.abs(lr.left - br.left), dw: Math.abs(lr.width - br.width) };
  });
  return { mid, end };
};

await s.run('reduced motion parks every part', async (t) => {
  const page = t.watch(await kb.open('/kit.html', { reduced: true }));

  t.step('skeleton and spinner');
  const sk = await page.evaluate(() => {
    const k = document.querySelector('k-skeleton').shadowRoot.querySelector('.k-skel');
    const sp = document.querySelector('k-spinner').shadowRoot;
    return { anim: k ? getComputedStyle(k).animationName : 'missing', arc: !!sp.querySelector('.k-spin'), glyph: !!sp.querySelector('[data-i="progress_activity"]') };
  });
  check(sk.anim === 'none', `the skeleton does not pulse (${sk.anim})`);
  check(!sk.arc && sk.glyph, 'the spinner is the static progress glyph, no turning arc');

  t.step('the lens');
  const lm = await lensMove(page);
  check(/opacity/.test(lm.mid.tr) && !/transform|width/.test(lm.mid.tr), `the lens fades, it does not travel (${lm.mid.tr})`);
  check(lm.end.op === '1' && lm.end.dx < 1.5 && lm.end.dw < 1.5, `the lens parks on the chosen option (Δx ${lm.end.dx.toFixed(1)}, Δw ${lm.end.dw.toFixed(1)})`);

  t.step('the sheet');
  await page.evaluate(() => document.querySelector('[data-g="sheet"]').scrollIntoView({ block: 'center' }));
  await page.click('[data-g="sheet"]');
  const sheetMid = await page.evaluate(() => {
    const p = document.querySelector('#sheet').shadowRoot.querySelector('.panel');
    return p.getAnimations().map((a) => (a.effect && a.effect.getKeyframes ? a.effect.getKeyframes().some((k) => k.transform && k.transform !== 'none' && !/translateY\(0(px)?\)/.test(k.transform)) : false));
  });
  check(sheetMid.every((moves) => !moves), 'the sheet opens with no transform animation');
  await settle(page, 400);
  const sheetEnd = await page.evaluate(() => {
    const p = document.querySelector('#sheet').shadowRoot.querySelector('.panel');
    const r = p.getBoundingClientRect();
    return { op: getComputedStyle(p).opacity, bottom: Math.round(r.bottom), vh: innerHeight, top: Math.round(r.top) };
  });
  check(sheetEnd.op === '1' && sheetEnd.top < sheetEnd.vh, `the sheet rests in place, fully opaque (top ${sheetEnd.top} of ${sheetEnd.vh})`);
  await page.keyboard.press('Escape');
  await settle(page, 300);

  t.step('the PIN pad loading dots');
  for (const d of ['1', '2', '3', '4']) await tapDeep(page, '#pin', `[data-key="${d}"]`);
  const dots = await page.evaluate(() => {
    const d = document.querySelector('#pin').shadowRoot.querySelector('.dots');
    return { wait: d.classList.contains('wait'), anim: getComputedStyle(d).animationName };
  });
  check(dots.wait && dots.anim === 'none', `the loading dots stand still (${dots.anim})`);
  await settle(page, 1300);

  t.step('a figure that changes');
  const fig = await page.evaluate(async () => {
    const f = document.querySelector('#fig');
    f.figure = { value: 19300, precision: 2, kind: 'money' };
    await new Promise((r) => requestAnimationFrame(r));
    return { rolled: f.querySelectorAll('.k-fig__d').length, text: f.querySelector('.k-fig__sr').textContent };
  });
  check(fig.rolled === 0 && /19/.test(fig.text), `the new figure lands with no rolling digits (${fig.text})`);
  check(page.__errors.length === 0, `no page errors (${page.__errors.join(' | ') || 'none'})`);
});

await s.run('without the preference, the same parts do move', async (t) => {
  const page = t.watch(await kb.open('/kit.html'));
  const lm = await lensMove(page);
  check(/transform/.test(lm.mid.tr) && /width/.test(lm.mid.tr), `the lens travels on the spring (${lm.mid.tr.slice(0, 48)}…)`);
  check(lm.end.dx < 1.5 && lm.end.dw < 1.5, 'and comes to rest on the chosen option');
  const sk = await page.evaluate(() => getComputedStyle(document.querySelector('k-skeleton').shadowRoot.querySelector('.k-skel')).animationName);
  check(sk !== 'none', `the skeleton pulses (${sk})`);
  const fig = await page.evaluate(async () => {
    const f = document.querySelector('#fig');
    f.figure = { value: 19300, precision: 2, kind: 'money' };
    await new Promise((r) => requestAnimationFrame(r));
    return f.querySelectorAll('.k-fig__d').length;
  });
  check(fig > 0, `a changed figure rolls its digits (${fig})`);
});

await kb.close();
console.log(`✓ motion-park-browser-test · ${checks} contrôles`);
await s.finish();
