#!/usr/bin/env node
/* pair-redeem-timeout-browser-test · §10.2, revision 19, M4; revision 20, M1
 * (stage 3a).
 *
 * On the pairing pad and the store lock, through the flow's own request
 * (KiwiPinFlow.send, real fetch, the answer held by the test):
 *   · a redeem whose answer is held past 8 s ends as pair.no_answer, the
 *     digits cleared and the keys enabled;
 *   · it is never sent again, and no other request follows it, not on an
 *     `online` event either;
 *   · the same code typed again and refused (422) says pair.maybe_used;
 *     another code refused says pair.invalid.
 *
 *   node tools/pair-redeem-timeout-browser-test.mjs */
import assert from 'node:assert/strict';
import { suite } from './browser-trace.mjs';
import { pinHost, mount, type, log, t, settle } from './pin-host.mjs';

console.log('pair-redeem-timeout-browser-test');
const h = await pinHost('pair-redeem-timeout');
const S = suite('pair-redeem-timeout', { browser: h.browser });
let checks = 0;
const check = (yes, msg) => { assert.ok(yes, msg); checks++; console.log('  ✓ ' + msg); };
const msgs = async (page) => (await log(page)).filter((x) => x.r !== 'prog');

for (const use of ['pair', 'store']) {
  await S.run(use + ': held past 8 s, never sent again', async (tr) => {
    const page = tr.watch(await h.open());
    const hits = [];
    await page.setRequestInterception(true);
    page.on('request', (r) => {
      const u = new URL(r.url());
      if (!u.pathname.startsWith('/api/')) return r.continue();
      hits.push({ path: u.pathname, body: r.postData(), at: Date.now() });
      if (hits.length === 1) return;                        /* the first redeem: never answered */
      return r.respond({ status: 422, contentType: 'application/json', body: '{"error":"invalid_or_expired"}' });
    });
    await mount(page, use, { hold: true });
    const t0 = Date.now();
    await type(page, '482913');
    await page.waitForFunction(() => window.__log.some((x) => x.r !== 'prog'), { timeout: 12000 });
    const took = Date.now() - t0;
    let m = await msgs(page);
    check(took >= 7800 && took < 9800, `the redeem is abandoned at 8 s (${took} ms)`);
    check(m.length === 1 && m[0].text === await t(page, 'pair.no_answer') && m[0].r === 'pol', 'pair.no_answer, politely');
    check(hits.length === 1 && hits[0].path === '/api/pair/redeem' && JSON.parse(hits[0].body).code === '482913', 'one redeem, with the code');
    await page.evaluate(() => window.dispatchEvent(new Event('online')));
    await settle(page, 3000);
    check(hits.length === 1, 'nothing is sent after it, not on `online` either');
    const pad = await page.evaluate(() => document.getElementById('pad').filled);
    check(pad === 0, 'the digits are cleared');
    await type(page, '482913');
    await settle(page, 900);
    m = await msgs(page);
    check(hits.length === 2 && m[m.length - 1].text === await t(page, 'pair.maybe_used'), 'the same code typed again and refused: pair.maybe_used');
    await settle(page, 300);
    await type(page, '111222');
    await settle(page, 900);
    m = await msgs(page);
    check(hits.length === 3 && m[m.length - 1].text === await t(page, 'pair.invalid'), 'another code refused: pair.invalid');
  });
}

await h.close();
console.log(`✓ pair-redeem-timeout-browser-test · ${checks} checks`);
await S.finish();
