#!/usr/bin/env node
/* Kiwi · haptics-map-browser-test · the kit plays §15's map, and nothing else.
 *
 * The gallery (kit.html) with ?hapticsTrace=1, so KiwiHaptics records every
 * play although Chromium has no engine. Each scenario drives a real control
 * with real pointer events and reads what the trace gained:
 *
 *   segmented, chips, list radio, pay method   Choose on a change, nothing on
 *                                              the option already chosen
 *   stepper, switch                            Adjust on the confirmed tap
 *   cash keypad                                Adjust on pointerdown
 *   PIN pad                                    Choose on pointerdown per digit,
 *                                              none on the final digit, then
 *                                              Failed on the response (600 ms)
 *   menu tile                                  Adjust when it adds, nothing
 *                                              when it opens the options
 *   confirm sheet                              Caution on its first frame
 *   pay.paid()                                 Paid, on the local record
 *   toast, kitchen lane                        nothing, ever (§15.6)
 *
 *   node tools/haptics-map-browser-test.mjs */
import assert from 'node:assert/strict';
import { kitBrowser, settle, tapDeep } from './kit-browser.mjs';
import { suite } from './browser-trace.mjs';

console.log('haptics-map-browser-test');
const kb = await kitBrowser('haptics-map');
const s = suite('haptics-map', { browser: kb.browser });
let checks = 0;
const check = (yes, msg) => { assert.ok(yes, msg); checks++; console.log('  ✓ ' + msg); };

await s.run('the map, control by control', async (t) => {
  // coverage: surface=shell-kit locale=en viewport=desktop
  const page = t.watch(await kb.open('/kit.html', { query: 'hapticsTrace=1', width: 1280, height: 900 }));
  const mark = () => page.evaluate(() => KiwiHaptics.trace.length);
  const since = (n) => page.evaluate((n) => KiwiHaptics.trace.slice(n).map((e) => ({ c: e.class, trig: e.trigger, b: e.bracket })), n);
  const gap = () => settle(page, 90);                         /* past the 60 ms throttle */
  async function scenario(label, act, expect) {
    t.step(label);
    const n = await mark();
    await act();
    await gap();
    const got = await since(n);
    const classes = got.map((e) => e.c);
    check(JSON.stringify(classes) === JSON.stringify(expect.map((e) => e.c || e)), `${label}: ${expect.length ? expect.map((e) => e.c || e).join(', ') : 'nothing'}${classes.length && JSON.stringify(classes) !== JSON.stringify(expect.map((e) => e.c || e)) ? ' (got ' + classes.join(', ') + ')' : ''}`);
    expect.forEach((e, i) => { if (e.trig) check(got[i] && got[i].trig === e.trig, `${label}: ${e.c} fires on ${e.trig}`); });
    return got;
  }

  await scenario('segmented, a new option', () => tapDeep(page, '#seg-range', '[data-v="yesterday"]'), ['Choose']);
  await scenario('segmented, the option already chosen', () => tapDeep(page, '#seg-range', '[aria-checked="true"]'), []);
  await scenario('stepper, plus', () => tapDeep(page, 'k-stepper', '[data-st-dir="1"]'), ['Adjust']);
  await scenario('switch', () => tapDeep(page, 'k-switch', 'input'), ['Adjust']);
  await scenario('chips, the chip already chosen', () => tapDeep(page, '#chips-single', '[aria-checked="true"]'), []);
  await scenario('chips, a new chip', () => tapDeep(page, '#chips-single', '[data-chip="card"]'), ['Choose']);
  await scenario('list, the radio row already chosen', () => tapDeep(page, '#list', '[data-id="r4"] [role="radio"]'), []);
  await scenario('cash keypad key', () => tapDeep(page, 'k-keypad', '[data-kp-key="7"]'), [{ c: 'Adjust', trig: 'pointerdown' }]);
  await scenario('menu tile that adds', () => tapDeep(page, '#menu', '.tile:not([data-opts]):not([aria-disabled])'), ['Adjust']);
  await scenario('menu tile with options', () => tapDeep(page, '#menu', '.tile[data-opts]'), []);
  await scenario('pay, a new method', () => tapDeep(page, '#pay', '[data-method="card"]'), ['Choose']);
  await scenario('pay, the method already chosen', () => tapDeep(page, '#pay', '[data-method="card"]'), []);
  await scenario('pay, the local record', () => page.evaluate(() => document.querySelector('#pay').paid()), [{ c: 'Paid', trig: 'local-record' }]);
  await scenario('toast', () => page.evaluate(() => KiwiToast.show({ message: 'Harira removed', action: { id: 'undo', label: 'Undo' } })), []);
  await scenario('kitchen lane action', () => tapDeep(page, '#lane-new', '[data-w="start"]'), []);

  t.step('PIN pad: three digits, then the final one');
  const n0 = await mark();
  for (const d of ['1', '2', '3']) { await tapDeep(page, '#pin', `[data-key="${d}"]`); await gap(); }
  const digits = (await since(n0)).map((e) => e.c + ':' + e.trig);
  check(JSON.stringify(digits) === JSON.stringify(['Choose:pointerdown', 'Choose:pointerdown', 'Choose:pointerdown']), 'PIN pad: Choose on pointerdown for each of the first three digits');
  const n1 = await mark();
  await tapDeep(page, '#pin', '[data-key="4"]');
  await settle(page, 60);
  check((await since(n1)).length === 0, 'PIN pad: nothing on the final digit');
  await settle(page, 500);                                    /* the gallery answers after 400 ms */
  const verdict = await since(n1);
  check(verdict.length === 1 && verdict[0].c === 'Failed' && verdict[0].trig === 'response', 'PIN pad: Failed on the response, inside 600 ms');

  await scenario('confirm sheet, opened by a tap', async () => { await page.evaluate(() => document.querySelector('[data-g="confirm"]').scrollIntoView({ block: 'center' })); await page.click('[data-g="confirm"]'); }, ['Caution']);
  await page.keyboard.press('Escape');
  await settle(page, 300);
  check(!(await page.evaluate(() => document.querySelector('#confirm').hasAttribute('open'))), 'Escape closes the confirm sheet');
  check(page.__errors.length === 0, `no page errors (${page.__errors.join(' | ') || 'none'})`);
});

await kb.close();
console.log(`✓ haptics-map-browser-test · ${checks} contrôles`);
await s.finish();
