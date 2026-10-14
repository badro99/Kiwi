#!/usr/bin/env node
/* pay-height-test · the payment's height forms (stage 4, §18.3 "Height forms",
 * §21.1 row 4), behind kiwiSkin2027:till, on the demo till in a real Chromium.
 *
 *   node tools/pay-height-test.mjs
 *
 * Cash chosen, at each height:
 *   · 1376 × 1032 regular: one stack in the bill pane;
 *   · 1194 × 834, 1180 × 820, 1133 × 744 compact: the summary over the menu
 *     pane, the keys in the bill pane's width;
 *   · 1280 × 560 compact-short: the same on 56-tall keys;
 *   · the keypad and the primary are inside the viewport, the window has not
 *     scrolled, and the keys column does not scroll;
 *   · 1280 × 500: no form fits, so the page (min-height 514) scrolls as a
 *     whole and the keys column still does not; scrolled down, the keypad and
 *     the primary are whole on screen. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { suite } from './browser-trace.mjs';

const root = process.env.KIWI_ROOT || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let puppeteer;
try { puppeteer = createRequire(path.join(root, 'app/package.json'))('puppeteer-core'); }
catch { console.log('○ skip: puppeteer-core unavailable — browser assertions not executed'); process.exit(process.env.CI ? 1 : 0); }
const bin = process.env.KIWI_CHROMIUM_BIN || ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/chromium', '/usr/bin/google-chrome'].find(fs.existsSync);
if (!bin) { console.log('○ skip: Chromium unavailable — browser assertions not executed'); process.exit(process.env.CI ? 1 : 0); }

const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.json': 'application/json', '.png': 'image/png', '.webp': 'image/webp' };
const server = http.createServer((req, res) => {
  const p = path.resolve(root, '.' + decodeURIComponent(new URL(req.url, 'http://local').pathname));
  if (!p.startsWith(root + path.sep)) { res.writeHead(403); res.end(); return; }
  fs.readFile(p, (err, data) => { res.writeHead(err ? 404 : 200, { 'Content-Type': mime[path.extname(p)] || 'application/octet-stream', 'Cache-Control': 'no-cache' }); res.end(err ? '' : data); });
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await puppeteer.launch({ executablePath: bin, headless: true, args: ['--no-sandbox', '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1'] });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const S = suite('pay-height', { browser });
let checks = 0;
const check = (yes, msg) => { assert.ok(yes, msg); checks++; console.log('  ✓ ' + msg); };

const SIZES = [
  [1376, 1032, 'regular'],
  [1194, 834, 'compact'],
  [1180, 820, 'compact'],
  [1133, 744, 'compact'],
  [1280, 560, 'compact-short'],
  [1280, 500, 'compact-short'],
];

try {
  for (const [w, h, form] of SIZES) {
    await S.run(`${w} × ${h} · ${form}`, async (tr) => {
      const ctx = await browser.createBrowserContext(); tr.defer(() => ctx.close());
      const page = tr.watch(await ctx.newPage());
      const errors = [];
      page.on('pageerror', (e) => errors.push(e.message));
      await page.setViewport({ width: w, height: h });
      await page.setBypassServiceWorker(true);
      await page.setRequestInterception(true);
      page.on('request', (r) => {
        const u = r.url();
        if (u.startsWith(base + '/api/')) return r.respond({ status: 503, contentType: 'application/json', body: '{"error":"offline"}' });
        return u.startsWith(base) || u.startsWith('data:') ? r.continue() : r.abort();
      });
      await page.evaluateOnNewDocument(() => {
        localStorage.setItem('kiwiSkin2027:till', '1');
        try { Object.defineProperty(navigator.serviceWorker, 'register', { value: () => new Promise(() => {}), configurable: true }); } catch (_) {}
      });
      await page.goto(base + '/kiwi-caisse.html', { waitUntil: 'load' });
      await page.waitForFunction(() => typeof doOpenService === 'function' && !!window.KiwiTillFrame, { timeout: 30000 });
      await page.evaluate(() => doOpenService());
      await page.waitForFunction(() => document.body.classList.contains('is-unlocked'), { timeout: 20000 });
      await page.evaluate(() => { document.querySelector('.mode-pill[data-mode="vrap"]').click(); });
      await sleep(200);
      await page.evaluate(() => { const b = document.querySelector('#vrap-new-order'); if (b) b.click(); });
      await page.waitForFunction(() => menuItems.length > 0 && document.querySelector('k-menu-grid'), { timeout: 20000 });
      await page.evaluate(() => { addToCart(menuItems.find((m) => !m.formula && !itemOptGroups(m).length).id); });
      await sleep(200);
      await page.evaluate(() => document.querySelector('k-bill').shadowRoot.querySelector('[data-w="pay"]').click());
      await sleep(500);
      await page.evaluate(() => document.querySelector('k-pay').shadowRoot.querySelector('[data-method="cash"]').click());
      await sleep(400);

      const m = await page.evaluate(() => {
        const pay = document.querySelector('k-pay'), R = pay.shadowRoot;
        const kp = R.querySelector('.k-kp'), pri = R.querySelector('.pri .k-btn, .pri button'), keys = R.querySelector('.keys') || pay;
        const r = (el) => { const b = el.getBoundingClientRect(); return { top: b.top, bottom: b.bottom, height: b.height }; };
        const key = R.querySelector('.k-kp__k');
        return {
          layout: pay.getAttribute('layout') || 'regular', scrollY: window.scrollY, vh: window.innerHeight,
          pageScrolls: document.scrollingElement.scrollHeight > window.innerHeight + 1,
          minH: getComputedStyle(document.documentElement).minHeight,
          kp: kp && r(kp), pri: pri && r(pri), keyH: key ? key.getBoundingClientRect().height : 0,
          keysScroll: keys.scrollHeight > keys.clientHeight + 1, hostScroll: pay.scrollHeight > pay.clientHeight + 1,
        };
      });
      check(m.layout === form, `${w} × ${h}: the ${form} form (${m.layout})`);
      check(m.kp && m.pri, `${w} × ${h}: the keypad and the primary are drawn`);
      check(m.keyH === (form === 'compact-short' ? 56 : 72), `${w} × ${h}: keys ${m.keyH} tall`);
      check(!m.keysScroll && !m.hostScroll, `${w} × ${h}: the keys column does not scroll`);
      if (h >= 514) {
        check(m.scrollY === 0, `${w} × ${h}: the window has not scrolled`);
        check(m.kp.top >= 0 && m.kp.bottom <= m.vh && m.pri.top >= 0 && m.pri.bottom <= m.vh,
          `${w} × ${h}: keypad (${Math.round(m.kp.top)}–${Math.round(m.kp.bottom)}) and primary (${Math.round(m.pri.top)}–${Math.round(m.pri.bottom)}) inside ${m.vh}`);
      } else {
        check(m.minH === '514px' && m.pageScrolls, `${w} × ${h}: the page keeps min-height 514 and scrolls as a whole`);
        await page.evaluate(() => window.scrollTo(0, document.scrollingElement.scrollHeight));
        await sleep(150);
        const after = await page.evaluate(() => {
          const R = document.querySelector('k-pay').shadowRoot;
          const kp = R.querySelector('.k-kp').getBoundingClientRect(), pri = R.querySelector('.pri .k-btn, .pri button').getBoundingClientRect();
          return { kpTop: kp.top, priBottom: pri.bottom, vh: window.innerHeight };
        });
        check(after.kpTop >= 0 && after.priBottom <= after.vh, `${w} × ${h}: scrolled, the keypad and the primary are whole on screen`);
      }
      check(errors.length === 0, `${w} × ${h}: no page error` + (errors.length ? ' · ' + errors.join(' | ') : ''));
    });
  }
} finally {
  await browser.close().catch(() => {});
  server.closeAllConnections();
  await new Promise((r) => server.close(r));
}
console.log(`✓ pay-height-test · ${checks} checks`);
await S.finish();
