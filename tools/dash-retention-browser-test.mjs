#!/usr/bin/env node
/* dash-retention-browser-test · Retention on the kit (stage 5 (5), §12,
 * Customers › Retention), behind kiwiSkin2027:dashboard, on the demo store in
 * a real Chromium. The kit draws the shipped groups (owner, 2026-10-15): every
 * check below holds the kit to the page customer-retention.js rendered.
 *
 *   node tools/dash-retention-browser-test.mjs
 *
 * What it holds:
 *   · flag off: dash-retention.js is never fetched, no #kit-retention;
 *   · retention off: the kit draws nothing, the shipped invitation shows;
 *   · on: the kit heads the shipped root; its tabs are the shipped ones with
 *     their counts; one tile per shipped group and one row per shipped
 *     customer, same order;
 *   · another tab opens the shipped panel under the kit tabs, and Activity
 *     comes back;
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
   then Retention, as the Customers page opens it. */
async function openRetention(flag) {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  const errors = [], fetched = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.setViewport({ width: 1366, height: 1000 });
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
  await page.waitForFunction(() => !!window.Kiwi && !!window.Kiwi.handlers['customer-retention'], { timeout: 20000 });
  await page.evaluate(() => window.Kiwi.handlers['customer-retention']());
  await page.waitForFunction(() => !!document.querySelector('.dash-genpage [data-cr-root]'), { timeout: 20000 });
  await sleep(400);
  return { ctx, page, errors, fetched };
}

const tap = (page, js) => page.evaluate((src) => {
  const el = (0, eval)(src);
  el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, composed: true }));
  el.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, composed: true }));
  el.click();
}, js);

console.log('dash-retention-browser-test');
try {
  {
    const { ctx, page, errors, fetched } = await openRetention(false);
    const off = await page.evaluate(() => !document.getElementById('kit-retention'));
    check(!fetched.some((p) => /dash-retention\.js/.test(p)) && off, 'flag off: dash-retention.js is never fetched, no #kit-retention');
    check(errors.length === 0, 'flag off: no page error' + (errors.length ? ' · ' + errors.join(' | ') : ''));
    await ctx.close();
  }

  const { ctx, page, errors } = await openRetention(true);
  /* Off: the shipped invitation, as is. */
  const offState = await page.evaluate(() => ({ hidden: document.getElementById('kit-retention').hidden, enable: !!document.querySelector('[data-cr-enable]').offsetParent }));
  check(offState.hidden && offState.enable, 'retention off: the kit draws nothing, the shipped invitation shows');
  await page.evaluate(() => document.querySelector('[data-cr-enable]').click());
  await page.waitForFunction(() => !!document.querySelector('[data-cr-tab]'), { timeout: 10000 });
  await sleep(400);

  const read = () => page.evaluate(() => {
    const kr = document.getElementById('kit-retention');
    const vis = (el) => !!el && !!el.offsetParent;
    return {
      hidden: kr.hidden, before: kr.nextElementSibling === document.querySelector('.dash-genpage [data-cr-root]'),
      tabs: kr.querySelector('k-segmented').options.map((o) => o.label), tab: kr.querySelector('k-segmented').getAttribute('value'),
      shippedTabs: [...document.querySelectorAll('[data-cr-tab]')].map((b) => b.textContent),
      shippedTabOn: (document.querySelector('[data-cr-tab].on') || {}).dataset?.crTab,
      tabsDrawn: vis(document.querySelector('.cr-tabs')), panelDrawn: vis(document.querySelector('[data-cr-panel]')),
      tiles: [...kr.querySelector('k-kpi-grid').shadowRoot.querySelectorAll('[data-tile]')].map((t) => ({ label: t.querySelector('.lb').textContent, value: t.querySelector('.vl .k-title').textContent })),
      shippedTiles: [...document.querySelectorAll('[data-cr-kpi]')].map((k) => ({ label: k.querySelector('.l').textContent, value: k.querySelector('.v').textContent })),
      rows: kr.querySelector('k-list').rows.map((r) => ({ id: r.id, title: r.title, value: r.value })),
      shippedRows: [...document.querySelectorAll('[data-cr-client]')].map((tr) => ({ id: tr.dataset.crClient, name: tr.querySelector('.cr-nm').textContent, spend: tr.children[4].textContent })),
    };
  });

  let v = await read();
  check(!v.hidden && v.before && !v.tabsDrawn && !v.panelDrawn, 'on: #kit-retention heads the shipped root; the shipped tabs and Activity panel are not drawn');
  check(v.tabs.length === 4 && v.tabs.every((l, i) => l.replace(/\s/g, '') === v.shippedTabs[i].replace(/\s/g, '')) && v.tab === 'activity', `the tabs are the shipped ones, with their counts (${v.tabs.join(' · ')})`);
  check(v.tiles.length === v.shippedTiles.length && v.tiles.every((t, i) => norm(t.label) === norm(v.shippedTiles[i].label) && norm(t.value) === norm(v.shippedTiles[i].value)),
    `one tile per shipped group, same counts (${v.tiles.map((t) => norm(t.label) + ' ' + t.value).join(' · ')})`);
  check(v.rows.length > 0 && v.rows.length === v.shippedRows.length && v.rows.every((r, i) => r.id === v.shippedRows[i].id && norm(r.title) === norm(v.shippedRows[i].name) && norm(r.value) === norm(v.shippedRows[i].spend)),
    `one row per shipped customer, longest absence first (${v.rows.length})`);

  /* Another tab: the shipped panel, under the kit's tabs. */
  await tap(page, `document.querySelector('#kit-retention k-segmented').shadowRoot.querySelector('[data-v="suggest"]')`);
  await sleep(400);
  v = await read();
  const kitList = await page.evaluate(() => { const l = document.querySelector('#kit-retention k-list'); return !l.offsetParent; });
  check(v.tab === 'suggest' && v.shippedTabOn === 'suggest' && v.panelDrawn && kitList, 'Suggestions on the kit\'s tabs opens the shipped panel; the kit\'s rows step aside');
  await tap(page, `document.querySelector('#kit-retention k-segmented').shadowRoot.querySelector('[data-v="activity"]')`);
  await sleep(400);
  v = await read();
  check(v.tab === 'activity' && !v.panelDrawn && v.rows.length === v.shippedRows.length, 'Activity comes back to the kit\'s rows');
  check(errors.length === 0, 'no page error' + (errors.length ? ' · ' + errors.join(' | ') : ''));
  await ctx.close();
} finally {
  await browser.close().catch(() => {});
  server.closeAllConnections();
  await new Promise((r) => server.close(r));
}
console.log(`✓ dash-retention-browser-test · ${checks} checks`);
