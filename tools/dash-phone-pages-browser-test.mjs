#!/usr/bin/env node
/* dash-phone-pages-browser-test · no dashboard page spills off a phone.
 *
 *   node tools/dash-phone-pages-browser-test.mjs
 *
 * Most of the phone tickets on the board (#107, #108, #115, #116, #117, #143,
 * #144) were one page at a time going wider than the screen: a desktop table,
 * a date row, a sheet. Each was fixed where it was reported, and nothing
 * stopped the next page from doing the same. This suite opens every sidebar
 * destination of the demo store at 390 × 844, mobile, then clicks every
 * sub-tab it can see on that page, and fails when a visible element reaches
 * past either edge of the screen without sitting inside a container the
 * finger can scroll sideways.
 *
 * Three passes, one per file so each stays under check.js's 300 s: the
 * default skin in French (this file), in Arabic (right to left spills off
 * the other edge, dash-phone-pages-ar-browser-test.mjs), and the 2027 kit in
 * Arabic (dash-phone-pages-kit-browser-test.mjs); KIWI_PHONE_PASS picks
 * one. A planted 600 px element checks the detector itself on each pass, so
 * a green run cannot come from a measure that sees nothing. */
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

let checks = 0;
const check = (yes, msg) => { assert.ok(yes, msg); checks++; console.log('  ✓ ' + msg); };

async function open(tr, ctx, { flag, lang }) {
  const page = tr.watch(await ctx.newPage());
  page.errors = [];
  page.on('pageerror', (e) => page.errors.push(e.message));
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await page.setBypassServiceWorker(true);
  await page.setRequestInterception(true);
  page.on('request', (r) => {
    const u = r.url();
    if (u.startsWith(base + '/api/')) return r.respond({ status: 503, contentType: 'application/json', body: '{"error":"offline"}' });
    return u.startsWith(base) || u.startsWith('data:') ? r.continue() : r.abort();
  });
  await page.evaluateOnNewDocument((on, l) => {
    try {
      if (on) localStorage.setItem('kiwiSkin2027:dashboard', '1');
      localStorage.setItem('kiwiSkipOnboard', '1');
      localStorage.setItem('kiwiLang', l);
    } catch (_) {}
    try { Object.defineProperty(navigator.serviceWorker, 'register', { value: () => new Promise(() => {}), configurable: true }); } catch (_) {}
  }, flag, lang);
  page.setDefaultNavigationTimeout(60000);
  await page.goto(base + '/dashboard.html', { waitUntil: 'load' });
  await sleep(1500);
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !!document.querySelector('[data-kpi-band] .kpi-m'), { timeout: 30000 });
  await sleep(800);
  return page;
}

/* Every visible element whose box crosses the left or right edge of the
   screen, unless an ancestor on screen scrolls sideways (a tab strip, a
   wide table in its own scroller): the finger reaches that one. */
const spills = (page) => page.evaluate(() => {
  const W = innerWidth, out = [];
  const shown = (el) => { const s = getComputedStyle(el); return s.display !== 'none' && s.visibility !== 'hidden' && +s.opacity > 0.05; };
  const reachable = (el) => {
    for (let p = el.parentElement; p; p = p.parentElement) {
      const s = getComputedStyle(p);
      if (/(auto|scroll)/.test(s.overflowX) && p.scrollWidth > p.clientWidth + 1) {
        const r = p.getBoundingClientRect();
        if (r.right <= W + 1 && r.left >= -1) return true;
      }
    }
    return false;
  };
  for (const el of document.querySelectorAll('body *')) {
    if (!el.getClientRects().length || !shown(el)) continue;
    const b = el.getBoundingClientRect();
    if (b.width < 4 || b.height < 4) continue;
    const crosses = (b.right > W + 2 && b.left < W) || (b.left < -2 && b.right > 0);
    if (crosses && !reachable(el)) {
      const cls = typeof el.className === 'string' ? el.className.trim().split(/\s+/).slice(0, 2).join('.') : '';
      out.push(`${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}${cls ? '.' + cls : ''} [${Math.round(b.left)}…${Math.round(b.right)}] "${(el.textContent || '').trim().slice(0, 30)}"`);
    }
  }
  return { docW: document.documentElement.scrollWidth, W, out };
});

const PASSES = [
  { id: 'fr', suite: 'dash-phone-pages', name: 'default skin · French', flag: false, lang: 'fr' },
  { id: 'ar', suite: 'dash-phone-pages-ar', name: 'default skin · Arabic', flag: false, lang: 'ar' },
  { id: 'kit', suite: 'dash-phone-pages-kit', name: 'kit 2027 · Arabic', flag: true, lang: 'ar' },
];
const PASS = PASSES.find((p) => p.id === (process.env.KIWI_PHONE_PASS || 'fr')) || PASSES[0];
const S = suite(PASS.suite, { browser });

try {
  for (const pass of [PASS]) {
    await S.run(pass.name, async (tr) => {
      const ctx = await browser.createBrowserContext(); tr.defer(() => ctx.close());
      const page = await open(tr, ctx, pass);

      tr.step('the detector sees a planted 600 px element');
      await page.evaluate(() => { const d = document.createElement('div'); d.id = 'phone-probe'; d.style.cssText = 'width:600px;height:20px'; (document.querySelector('#kw-main') || document.body).appendChild(d); });
      const probe = await spills(page);
      check(probe.out.some((x) => x.includes('#phone-probe')), `${pass.name}: the measure catches a planted 600 px element`);
      await page.evaluate(() => document.getElementById('phone-probe').remove());

      const navs = await page.evaluate(() => [...new Set([...document.querySelectorAll('.sidebar [data-nav]')].map((a) => a.getAttribute('data-nav')))]);
      check(navs.length >= 8, `${pass.name}: ${navs.length} sidebar destinations to open`);
      const bad = [];
      let views = 0;
      for (const n of navs) {
        tr.step('open ' + n);
        await page.evaluate((n) => { const a = document.querySelector('.sidebar [data-nav="' + n + '"]'); a && a.click(); }, n);
        await sleep(900);
        const look = async (label) => {
          views++;
          const m = await spills(page);
          if (m.out.length || m.docW > m.W) bad.push(`${label}: page ${m.docW} wide · ${m.out.slice(0, 3).join(' · ')}`);
        };
        await look(n);
        const tabs = await page.evaluate(() => [...document.querySelectorAll('[role="tab"], [data-tab], [data-lens-item], .seg button, .tabs button, [data-view]')]
          .filter((b) => { const r = b.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(b).visibility !== 'hidden' && r.top < innerHeight * 3; })
          .slice(0, 14).map((b, i) => { b.setAttribute('data-phone-sweep', String(i)); return { i, t: (b.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 24) }; }));
        for (const t of tabs) {
          await page.evaluate((i) => { const b = document.querySelector('[data-phone-sweep="' + i + '"]'); b && b.click(); }, t.i);
          await sleep(450);
          await look(`${n} › ${t.t}`);
        }
        await page.keyboard.press('Escape');
        await sleep(300);
      }
      check(bad.length === 0, `${pass.name}: none of ${views} pages and sub-tabs reaches past the screen` + (bad.length ? '\n      ' + bad.join('\n      ') : ''));
      check(page.errors.length === 0, `${pass.name}: no page error` + (page.errors.length ? ' · ' + page.errors.slice(0, 3).join(' | ') : ''));
    });
  }
} finally {
  await browser.close().catch(() => {});
  server.closeAllConnections();
  await new Promise((r) => server.close(r));
}
console.log(`✓ ${PASS.suite}-browser-test · ${checks} checks`);
await S.finish();
