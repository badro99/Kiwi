#!/usr/bin/env node
/* pin-focus-browser-test · §10.2 Rules: a key that cannot be used is
 * aria-disabled, never disabled (stage 3a; revision 18, M6).
 *
 * Tab to a key, type the code on the keyboard, and through the loading state,
 * a pause and the needs-connection state:
 *   · focus stays on that key (never falls to body);
 *   · each state is announced once (pin.checking in the progress region, the
 *     state's message in the message row);
 *   · a key press in it changes nothing: no digit, no write, no request.
 *
 *   node tools/pin-focus-browser-test.mjs */
import assert from 'node:assert/strict';
import { suite } from './browser-trace.mjs';
import { pinHost, mount, log, clearLog, sent, t, settle } from './pin-host.mjs';

console.log('pin-focus-browser-test');
const h = await pinHost('pin-focus');
const S = suite('pin-focus', { browser: h.browser });
let checks = 0;
const check = (yes, msg) => { assert.ok(yes, msg); checks++; console.log('  ✓ ' + msg); };

const focused = (page) => page.evaluate(() => {
  const a = document.activeElement;
  const k = a && a.shadowRoot && a.shadowRoot.activeElement;
  return { host: a && a.id, key: k && k.getAttribute('data-key'), disabled: k && k.getAttribute('aria-disabled'), real: k && k.disabled };
});
const filled = (page) => page.evaluate(() => document.getElementById('pad').filled);
async function tabToKey(page) {
  await page.evaluate(() => { document.activeElement && document.activeElement.blur && document.activeElement.blur(); });
  for (let i = 0; i < 20; i++) {
    await page.keyboard.press('Tab');
    const f = await focused(page);
    if (f.host === 'pad' && /^\d$/.test(f.key || '')) return f.key;
  }
  throw new Error('no key reached by Tab');
}
const msgs = async (page) => (await log(page)).filter((x) => x.r !== 'prog');

await S.run('loading: focus stays, pin.checking once, presses do nothing', async (tr) => {
  const page = tr.watch(await h.open());
  await mount(page, 'till', { replies: ['hold'] });
  const k = await tabToKey(page);
  check(!!k, `Tab reaches a key (${k})`);
  for (const d of '1234') await page.keyboard.press(d);
  await settle(page, 120);
  let f = await focused(page);
  check(f.host === 'pad' && f.key === k && f.disabled === 'true' && !f.real, 'loading: focus is still on the key, aria-disabled, never disabled');
  const checking = (await log(page)).filter((x) => x.r === 'prog' && x.text === 'Checking');
  check(checking.length === 1, 'pin.checking written once');
  await clearLog(page);
  for (const d of ['5', 'Enter', ' ', 'Backspace']) await page.keyboard.press(d);
  { const kh = await page.evaluateHandle((x) => document.getElementById('pad').shadowRoot.querySelector('[data-key="' + x + '"]'), k);
    const b = await kh.asElement().boundingBox(); await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2); }
  await settle(page, 120);
  check((await log(page)).length === 0 && (await sent(page)).length === 1, 'a press while loading writes nothing and sends nothing');
  await page.evaluate(() => window.__release({ status: 401, body: { error: 'bad-pin' } }));
  await settle(page, 900);
  f = await focused(page);
  check(f.key === k && f.disabled === 'false', 'after the refusal the same key holds focus, enabled again');
});

await S.run('a pause: focus stays, the pause is announced once, presses do nothing', async (tr) => {
  const page = tr.watch(await h.open());
  await mount(page, 'till', { replies: [{ status: 429, body: { retry_after: 600 } }] });
  const k = await tabToKey(page);
  for (const d of '1234') await page.keyboard.press(d);
  await settle(page, 300);
  const f = await focused(page);
  check(f.key === k && f.disabled === 'true', 'paused: focus on the key, aria-disabled');
  const m = await msgs(page);
  check(m.length === 1 && m[0].r === 'ass' && m[0].text === await t(page, 'pin.paused.store', { minutes: 10 }), 'the pause is written once, assertively');
  await clearLog(page);
  for (const d of '9876') await page.keyboard.press(d);
  await settle(page, 200);
  check((await log(page)).length === 0 && (await sent(page)).length === 1 && await filled(page) === 0, 'a key press in the pause changes nothing');
});

await S.run('needs a connection: focus stays, announced once, presses do nothing, keys back online', async (tr) => {
  const page = tr.watch(await h.open());
  await mount(page, 'approval', { offline: true, ctx: { act: { kind: 'cancel_order', key: 'act.cancel_order', args: { order: '#7' }, needsConnection: true } } });
  await settle(page, 120);
  let m = await msgs(page);
  check(m.length === 1 && m[0].r === 'ass' && /#7/.test(m[0].text), 'the needs-connection state is written once, assertively, before any code');
  const k = await tabToKey(page);
  let f = await focused(page);
  check(f.disabled === 'true' && !f.real, 'its keys are focusable and aria-disabled, never disabled');
  await clearLog(page);
  for (const d of '1234') await page.keyboard.press(d);
  await settle(page, 200);
  check((await log(page)).length === 0 && (await sent(page)).length === 0 && await filled(page) === 0, 'digits typed in it do nothing');
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await settle(page, 200);
  f = await focused(page);
  m = await msgs(page);
  check(f.key === k && f.disabled === 'false', 'online: the keys are enabled and focus has not moved');
  check(m.length === 1 && m[0].r === 'pol' && m[0].text === await t(page, 'pin.connection_back'), 'pin.connection_back written once, politely');
});

await h.close();
console.log(`✓ pin-focus-browser-test · ${checks} checks`);
await S.finish();
