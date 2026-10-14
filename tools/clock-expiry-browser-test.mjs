#!/usr/bin/env node
/* clock-expiry-browser-test · §10.2, revision 18, M7 (stage 3a).
 *
 * With the network cut after a clock-in code is typed, the pad stays silent
 * while it retries, and at 5 minutes after the code was typed it writes
 * clock.code_expired once, politely, clears the digits, enables the keys and
 * sends nothing more. The clock runs 100 times faster (5 min = 3 s); the rule
 * is the flow's, not the speed's.
 *
 *   node tools/clock-expiry-browser-test.mjs */
import assert from 'node:assert/strict';
import { suite } from './browser-trace.mjs';
import { pinHost, mount, type, log, sent, t, settle } from './pin-host.mjs';

console.log('clock-expiry-browser-test');
const h = await pinHost('clock-expiry');
const S = suite('clock-expiry', { browser: h.browser });
let checks = 0;
const check = (yes, msg) => { assert.ok(yes, msg); checks++; console.log('  ✓ ' + msg); };
const msgs = async (page) => (await log(page)).filter((x) => x.r !== 'prog');

for (const action of ['clock-in', 'clock-out']) {
  await S.run(action + ': silent retries, then clock.code_expired once at 5 minutes', async (tr) => {
    const page = tr.watch(await h.open());
    await mount(page, 'clock', { scale: 100, replies: Array(80).fill('network'), ctx: { clockAction: action } });
    check(await page.evaluate(() => document.getElementById('pad').getAttribute('length')) === '6', 'an attendance code has six digits');
    await type(page, '482913');
    await settle(page, 2400);                                /* 4 minutes */
    let m = await msgs(page);
    const n = (await sent(page)).length;
    check(n >= 20 && n <= 26, `it retried every 10 s (${n} requests in 4 minutes)`);
    check(m.length === 1 && m[0].text === await t(page, 'pin.offline') && m[0].r === 'ass', 'one pin.offline, then silence while it retries');
    await settle(page, 900);                                 /* past 5 minutes */
    m = await msgs(page);
    check(m.length === 2 && m[1].text === await t(page, 'clock.code_expired') && m[1].r === 'pol', 'clock.code_expired written once, politely');
    const pad = await page.evaluate(() => { const p = document.getElementById('pad'); return { filled: p.filled, keys: [...p.shadowRoot.querySelectorAll('[data-key]')].filter((k) => /\d/.test(k.dataset.key)).every((k) => k.getAttribute('aria-disabled') === 'false') }; });
    check(pad.filled === 0 && pad.keys, 'the digits are cleared and the keys enabled for the next code');
    const after = (await sent(page)).length;
    await settle(page, 1200);
    check((await sent(page)).length === after && (await msgs(page)).length === 2, 'nothing is sent or written after the expiry');
  });
}

await h.close();
console.log(`✓ clock-expiry-browser-test · ${checks} checks`);
await S.finish();
