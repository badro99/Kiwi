#!/usr/bin/env node
/* dash-frame-browser-test · the dashboard frame on the kit (stage 5 (9),
 * §10.3, §10.18), behind kiwiSkin2027:dashboard, in a real Chromium.
 *
 *   node tools/dash-frame-browser-test.mjs
 *
 * What it holds, on the demo store Orders page and a drawer:
 *   · flag off: the shipped page head and drawer are untouched;
 *   · flag on: the page title is Heading in the kit face, its context line
 *     Footnote ink-2, and the key figure stays the largest text;
 *   · a drawer: the shipped solid sheet (the kit ground) in the kit face, title Heading, subtitle Footnote
 *     ink-2, a 44 round close button on surface-2;
 *   · no page error. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

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
const norm = (s) => String(s || '').replace(/[\s  ]+/g, ' ').trim();

async function openOrders(flag) {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.setViewport({ width: 1366, height: 1000 });
  await page.setBypassServiceWorker(true);
  await page.setRequestInterception(true);
  page.on('request', (r) => {
    const u = r.url();
    if (u.startsWith(base + '/api/')) return r.respond({ status: 503, contentType: 'application/json', body: '{"error":"offline"}' });
    return u.startsWith(base) || u.startsWith('data:') ? r.continue() : r.abort();
  });
  await page.evaluateOnNewDocument((on) => {
    if (on) localStorage.setItem('kiwiSkin2027:dashboard', '1');
    try { Object.defineProperty(navigator.serviceWorker, 'register', { value: () => new Promise(() => {}), configurable: true }); } catch (_) {}
  }, flag);
  // coverage: surface=dashboard locale=fr viewport=desktop
  await page.goto(base + '/dashboard.html', { waitUntil: 'load' });
  await sleep(1500);
  await page.evaluate(() => { const b = [...document.querySelectorAll('button,a')].find((x) => /Explorer la d/.test(x.textContent)); if (b) b.click(); });
  await sleep(1200);
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !!document.querySelector('.sidebar nav a[data-nav="transactions"]'), { timeout: 20000 });
  await page.evaluate(() => document.querySelector('.sidebar nav a[data-nav="transactions"]').click());
  await page.waitForFunction(() => !!document.querySelector('.dash-genpage .genpage-head h1'), { timeout: 20000 });
  await sleep(400);
  return { ctx, page, errors };
}

/* The page head, then a drawer, as the browser computes them. */
const measure = (page) => page.evaluate(async () => {
  const tok = (n) => { const p = document.createElement('i'); p.style.cssText = 'position:absolute;color:var(' + n + ')'; document.body.appendChild(p); const c = getComputedStyle(p).color; p.remove(); return c; };
  const size = (n) => { const p = document.createElement('i'); p.style.cssText = 'position:absolute;font-size:var(' + n + ')'; document.body.appendChild(p); const c = getComputedStyle(p).fontSize; p.remove(); return c; };
  const h1 = document.querySelector('.dash-genpage .genpage-head h1'), sub = document.querySelector('.dash-genpage .genpage-head p');
  const kf = document.querySelector('#kit-orders [data-key-figure] bdi');
  const d = window.Kiwi.drawer({ title: 'Frame', subtitle: 'Kiwi', body: '<p>body</p>', foot: '<button class="kb">ok</button>' });
  await new Promise((r) => setTimeout(r, 400));
  const dr = d.el.querySelector('.kiwi-drawer'), h3 = dr.querySelector('.kiwi-drawer-head h3'), p = dr.querySelector('.kiwi-drawer-head p'), x = dr.querySelector('.kiwi-drawer-close');
  const xr = x.getBoundingClientRect();
  const out = {
    h1: { size: getComputedStyle(h1).fontSize, family: getComputedStyle(h1).fontFamily, color: getComputedStyle(h1).color },
    sub: { size: getComputedStyle(sub).fontSize, color: getComputedStyle(sub).color },
    kf: kf ? getComputedStyle(kf).fontSize : null,
    drawer: { bg: getComputedStyle(dr).backgroundColor, family: getComputedStyle(dr).fontFamily },
    h3: { size: getComputedStyle(h3).fontSize, weight: getComputedStyle(h3).fontWeight },
    p: { size: getComputedStyle(p).fontSize, color: getComputedStyle(p).color },
    close: { w: Math.round(xr.width), h: Math.round(xr.height), radius: getComputedStyle(x).borderRadius, bg: getComputedStyle(x).backgroundColor },
    k: { heading: size('--k-fs-heading'), foot: size('--k-fs-footnote'), ink1: tok('--k-ink-1'), bg: tok('--k-bg'), ink2: tok('--k-ink-2'), s1: tok('--k-surface-1'), s2: tok('--k-surface-2') },
  };
  d.close();
  return out;
});

console.log('dash-frame-browser-test');
try {
  {
    const { ctx, page, errors } = await openOrders(false);
    const v = await measure(page);
    check(parseFloat(v.h1.size) >= 30 && v.close.w === 32, `flag off: the shipped head (${v.h1.size}) and close button (${v.close.w}) are untouched`);
    check(errors.length === 0, 'flag off: no page error' + (errors.length ? ' · ' + errors.join(' | ') : ''));
    await ctx.close();
  }
  const { ctx, page, errors } = await openOrders(true);
  const v = await measure(page);
  check(v.h1.size === v.k.heading && /Inter Tight/.test(v.h1.family) && v.h1.color === v.k.ink1, `a page's title is the kit's Heading (${v.h1.size})`);
  check(v.sub.size === v.k.foot && v.sub.color === v.k.ink2, `its context line is Footnote ink-2 (${v.sub.size})`);
  check(v.kf && parseFloat(v.kf) > parseFloat(v.h1.size), `the page's key figure stays its largest text (${v.kf} over ${v.h1.size})`);
  check(v.drawer.bg === v.k.bg && /Inter Tight/.test(v.drawer.family), `a drawer keeps the shipped solid sheet, the kit's ground, in the kit face (${v.drawer.bg})`);
  check(v.h3.size === v.k.heading && v.h3.weight === '600' && v.p.size === v.k.foot && v.p.color === v.k.ink2, `its title is Heading, its subtitle Footnote ink-2 (${v.h3.size}, ${v.p.size})`);
  check(v.close.w === 44 && v.close.h === 44 && v.close.radius === '50%' && v.close.bg === v.k.s2, `its close button is 44, round, on surface-2 (${v.close.w} × ${v.close.h})`);
  check(errors.length === 0, 'no page error' + (errors.length ? ' · ' + errors.join(' | ') : ''));
  await ctx.close();
} finally {
  await browser.close().catch(() => {});
  server.closeAllConnections();
  await new Promise((r) => server.close(r));
}
console.log(`✓ dash-frame-browser-test · ${checks} checks`);
