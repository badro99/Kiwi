#!/usr/bin/env node
/* dash-compliance-browser-test · Compliance on the kit (stage 5 (6), §12,
 * Money › Compliance), behind kiwiSkin2027:dashboard, on the demo store in a
 * real Chromium.
 *
 *   node tools/dash-compliance-browser-test.mjs
 *
 * What it holds:
 *   · flag off: dash-compliance.js is never fetched, no list, the shipped
 *     tabs are drawn;
 *   · flag on: a split view, the list of obligations at 360 beside the
 *     shipped screen; the shipped tabs are not drawn;
 *   · one row per shipped tab with its icon and a status read from the
 *     tab data; the open tab is the selected row;
 *   · a row opens its shipped screen beside the list;
 *   · a narrow window stacks the list above the screen;
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

/* The demo store, as a first visit sees it (Explore the demo, then Escape),
   then the sidebar's Compliance. */
async function openCompliance(flag, width) {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  const errors = [], fetched = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.setViewport({ width: width || 1366, height: 1000 });
  await page.setBypassServiceWorker(true);
  await page.setRequestInterception(true);
  page.on('request', (r) => {
    const u = r.url();
    if (u.startsWith(base)) fetched.push(new URL(u).pathname);
    if (u.startsWith(base + '/api/')) return r.respond({ status: 503, contentType: 'application/json', body: '{"error":"offline"}' });
    return u.startsWith(base) || u.startsWith('data:') ? r.continue() : r.abort();
  });
  await page.evaluateOnNewDocument((on) => {
    if (on) localStorage.setItem('kiwiSkin2027:dashboard', '1');
    try { Object.defineProperty(navigator.serviceWorker, 'register', { value: () => new Promise(() => {}), configurable: true }); } catch (_) {}
  }, flag);
  await page.goto(base + '/dashboard.html', { waitUntil: 'load' });
  await sleep(1500);
  await page.evaluate(() => { const b = [...document.querySelectorAll('button,a')].find((x) => /Explorer la d/.test(x.textContent)); if (b) b.click(); });
  await sleep(1200);
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !!window.KiwiConformite, { timeout: 20000 });
  await page.evaluate(() => document.querySelector('.sidebar nav a[data-nav="conformite"]').click());
  await page.waitForFunction(() => !!document.querySelector('[data-conformite-root] .cf-body'), { timeout: 20000 });
  await sleep(400);
  return { ctx, page, errors, fetched };
}

const tap = (page, js) => page.evaluate((src) => {
  const el = (0, eval)(src);
  el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, composed: true }));
  el.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, composed: true }));
  el.click();
}, js);

console.log('dash-compliance-browser-test');
try {
  {
    const { ctx, page, errors, fetched } = await openCompliance(false);
    const off = await page.evaluate(() => ({ kit: !!document.getElementById('kit-compliance'), tabs: !!document.querySelector('.cf-tabs').offsetParent }));
    check(!fetched.some((p) => /dash-compliance\.js/.test(p)) && !off.kit && off.tabs, 'flag off: dash-compliance.js is never fetched, no list, the shipped tabs are drawn');
    check(errors.length === 0, 'flag off: no page error' + (errors.length ? ' · ' + errors.join(' | ') : ''));
    await ctx.close();
  }

  const { ctx, page, errors } = await openCompliance(true);
  const read = () => page.evaluate(() => {
    const kc = document.getElementById('kit-compliance');
    const body = document.querySelector('.cf-page .cf-body');
    const a = kc.getBoundingClientRect(), b = body.getBoundingClientRect();
    return {
      split: kc.nextElementSibling === body && Math.round(a.width) === 360 && a.right <= b.left && Math.abs(a.top - b.top) < 4,
      tabsDrawn: !!document.querySelector('.cf-tabs').offsetParent,
      rows: kc.querySelector('k-list').rows.map((r) => ({ id: r.id, title: r.title, sub: r.subtitle, sel: !!r.selected, icon: r.icon })),
      shippedTabs: [...document.querySelectorAll('.cf-tab')].map((x) => ({ id: x.dataset.tab, label: x.textContent, on: x.classList.contains('on') })),
      bodyText: body.textContent,
    };
  });

  let v = await read();
  check(v.split && !v.tabsDrawn, 'flag on: a split view, the list at 360 beside the shipped screen; the shipped tabs are not drawn');
  check(v.rows.length === 4 && v.rows.every((r, i) => r.id === v.shippedTabs[i].id && r.title === v.shippedTabs[i].label && r.icon), `one row per shipped tab, with its icon (${v.rows.map((r) => r.title).join(' · ')})`);
  check(v.rows.every((r) => r.sub) && /^Z #\d+/.test(v.rows[0].sub), `each row carries a status from the tab's data (${v.rows.map((r) => r.sub).join(' | ')})`);
  check(v.rows.filter((r) => r.sel).length === 1 && v.rows.find((r) => r.sel).id === v.shippedTabs.find((x) => x.on).id, 'the open tab is the selected row');

  /* Another obligation: the shipped tab, beside the list. */
  await tap(page, `document.querySelector('#kit-compliance k-list').shadowRoot.querySelector('[data-id="doc"] [data-row]')`);
  await sleep(400);
  v = await read();
  check(v.shippedTabs.find((x) => x.on).id === 'doc' && v.rows.find((r) => r.sel).id === 'doc' && v.split && /\.cf-doc|Documents|document/i.test(v.bodyText),
    'a row opens its shipped screen beside the list, and becomes the selected row');

  /* A narrow window: one column. */
  await page.setViewport({ width: 700, height: 1000 });
  await sleep(300);
  const narrow = await page.evaluate(() => {
    const a = document.getElementById('kit-compliance').getBoundingClientRect(), b = document.querySelector('.cf-page .cf-body').getBoundingClientRect();
    return a.bottom <= b.top + 1;
  });
  check(narrow, 'a narrow window stacks the list above the screen');
  check(errors.length === 0, 'no page error' + (errors.length ? ' · ' + errors.join(' | ') : ''));
  await ctx.close();
} finally {
  await browser.close().catch(() => {});
  server.closeAllConnections();
  await new Promise((r) => server.close(r));
}
console.log(`✓ dash-compliance-browser-test · ${checks} checks`);
