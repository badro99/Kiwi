#!/usr/bin/env node
/* dash-orders-browser-test · the dashboard's Orders page on the kit (stage 5
 * (2), §18.2), behind kiwiSkin2027:dashboard, on the demo store in a real
 * Chromium. The kit draws the shipped rows (owner, 2026-10-15): every check
 * below holds the kit to the shipped render pages-pro.js made.
 *
 *   node tools/dash-orders-browser-test.mjs
 *
 * What it holds:
 *   · flag off: dash-orders.js is never fetched, no #kit-orders, the shipped
 *     table is drawn;
 *   · flag on: #kit-orders follows the shipped host, whose hero, filters and
 *     table are not drawn;
 *   · the key figure is the shipped hero total; the summary carries the
 *     shipped order count;
 *   · one kit row per shipped table row, same amounts, same order, grouped
 *     under their hour, newest first;
 *   · Cash on the kit's filter moves the shipped filter, the rows follow and
 *     the key figure does not;
 *   · Refunds empty says orders.empty_refunds, and Clear filter goes back to
 *     All;
 *   · Yesterday on the kit's presets moves the shipped range;
 *   · an order row opens the shipped order sheet;
 *   · no page error. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { pinTradingHour } from './demo-clock.mjs';

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
   then the sidebar's Orders. */
async function openOrders(flag) {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  await pinTradingHour(page);   // « aujourd'hui » de la démo, à 15 h (tools/demo-clock.mjs)
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
  await page.waitForFunction(() => !!document.querySelector('.sidebar nav a[data-nav="transactions"]'), { timeout: 20000 });
  await page.evaluate(() => document.querySelector('.sidebar nav a[data-nav="transactions"]').click());
  await page.waitForFunction(() => !!document.querySelector('[data-tx-host] .p-hero'), { timeout: 20000 });
  await sleep(600);
  return { ctx, page, errors, fetched };
}

const tap = (page, js) => page.evaluate((src) => {
  const el = (0, eval)(src);
  el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, composed: true }));
  el.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, composed: true }));
  el.click();
}, js);
const seg = (which, v) => `document.querySelector('#kit-orders k-segmented[data-do="${which}"]').shadowRoot.querySelector('[data-v="${v}"]')`;

console.log('dash-orders-browser-test');
try {
  {
    const { ctx, page, errors, fetched } = await openOrders(false);
    const off = await page.evaluate(() => ({ kit: !!document.getElementById('kit-orders'), table: !!document.querySelector('[data-tx-host] .p-table') && !!document.querySelector('[data-tx-host] .p-table').offsetParent }));
    check(!fetched.some((p) => /dash-orders\.js/.test(p)) && !off.kit && off.table, 'flag off: dash-orders.js is never fetched, no #kit-orders, the shipped table is drawn');
    check(errors.length === 0, 'flag off: no page error' + (errors.length ? ' · ' + errors.join(' | ') : ''));
    await ctx.close();
  }

  const { ctx, page, errors } = await openOrders(true);
  const place = await page.evaluate(() => {
    const ko = document.getElementById('kit-orders');
    const host = document.querySelector('[data-tx-host]');
    const gone = (sel) => [...document.querySelectorAll(sel)].every((el) => !el.offsetParent);
    return { after: !!ko && ko.previousElementSibling === host, shipped: gone('[data-tx-host] .p-hero') && gone('[data-tx-host] .p-table') && gone('[data-tx-host] [data-action="tx-filter"]') };
  });
  check(place.after, 'flag on: #kit-orders follows the shipped host');
  check(place.shipped, 'the shipped hero, filters and table are not drawn');

  const read = () => page.evaluate(() => {
    const ko = document.getElementById('kit-orders');
    const big = document.querySelector('[data-tx-host] .p-hero .big').cloneNode(true);
    big.querySelectorAll('span').forEach((s) => s.remove());
    const lists = [...ko.querySelectorAll('.k-do__rows k-list')];
    return {
      kf: ko.querySelector('[data-key-figure] bdi').textContent,
      hero: big.textContent,
      sum: ko.querySelector('.k-do__sum').textContent,
      count: (document.querySelector('[data-tx-host] .p-hero .sub').textContent.match(/^\s*(\d+)/) || [])[1],
      heroLabel: document.querySelector('[data-tx-host] .p-hero .l').textContent,
      groups: lists.map((l) => ({ h: l.previousElementSibling.textContent, rows: l.rows.map((r) => ({ v: r.value, s: r.subtitle })) })),
      shipped: [...document.querySelectorAll('[data-tx-host] .p-table tbody tr')].map((tr) => ({ t: tr.children[0].textContent, amt: tr.children[3].textContent, cash: tr.dataset.paymentKind === 'cash' })),
      filter: ko.querySelector('k-segmented[data-do="filter"]').getAttribute('value'),
      range: ko.querySelector('k-segmented[data-do="range"]').getAttribute('value'),
      em: (ko.querySelector('.k-do__em:not([hidden])') || {}).textContent || '',
    };
  });

  let v = await read();
  const flat = (g) => g.flatMap((x) => x.rows);
  check(norm(v.kf) === norm(v.hero), `the key figure is the shipped hero total (${norm(v.kf)})`);
  check(v.count && norm(v.sum).indexOf(v.count + ' ') === 0, `the summary carries the shipped order count (${norm(v.sum)})`);
  const rows = flat(v.groups);
  check(rows.length > 0 && rows.length === v.shipped.length && rows.every((r, i) => norm(r.v) === norm(v.shipped[i].amt)), `one kit row per shipped table row, same amounts, same order (${rows.length})`);
  /* The service day can run past midnight, so "newest first" is the shipped
     order (checked above), and each hour is one group. */
  check(v.groups.every((g) => g.rows.every((r) => r.s.indexOf(' · ' + g.h.slice(0, 2) + ':') > 0)) && new Set(v.groups.map((g) => g.h)).size === v.groups.length,
    `grouped under their hour, newest first (${v.groups.map((g) => g.h).join(', ')})`);

  /* Cash, on the kit's filter. */
  const allKf = v.kf;
  await tap(page, seg('filter', 'cash'));
  await sleep(500);
  v = await read();
  const txFilter = await page.evaluate(() => (document.querySelector('[data-tx-host] [data-action="tx-filter"].ok') || {}).textContent);
  check(v.filter === 'cash' && /Esp/.test(txFilter) && v.shipped.length && v.shipped.every((r) => r.cash), `Cash on the kit's filter moves the shipped filter (${norm(txFilter)})`);
  check(flat(v.groups).length === v.shipped.length && norm(v.kf) === norm(allKf), 'the rows follow it and the key figure does not');

  /* Refunds: empty, then Clear filter. */
  await tap(page, seg('filter', 'refunds'));
  await sleep(500);
  v = await read();
  check(v.filter === 'refunds' && norm(v.em).indexOf('Aucun remboursement aujourd\'hui') === 0, `Refunds empty says orders.empty_refunds (${norm(v.em)})`);
  await tap(page, `document.querySelector('#kit-orders k-button[data-do="clear"]').shadowRoot.querySelector('button')`);
  await sleep(500);
  v = await read();
  check(v.filter === 'all' && flat(v.groups).length === v.shipped.length && v.shipped.length > 0, 'Clear filter goes back to All');

  /* Yesterday, on the kit's presets. */
  await tap(page, seg('range', 'yesterday'));
  await sleep(600);
  v = await read();
  check(v.range === 'yesterday' && /HIER/.test(v.heroLabel) && norm(v.kf) === norm(v.hero), `Yesterday on the kit's presets moves the shipped range (${norm(v.heroLabel)} · ${norm(v.kf)})`);

  /* An order row opens the shipped order sheet. */
  await tap(page, `document.querySelector('#kit-orders .k-do__rows k-list').shadowRoot.querySelector('[data-row]')`);
  await sleep(500);
  const sheet = await page.evaluate(() => !!document.querySelector('.kiwi-native-order-sheet'));
  check(sheet, 'an order row opens the shipped order sheet');
  check(errors.length === 0, 'no page error' + (errors.length ? ' · ' + errors.join(' | ') : ''));
  await ctx.close();
} finally {
  await browser.close().catch(() => {});
  server.closeAllConnections();
  await new Promise((r) => server.close(r));
}
console.log(`✓ dash-orders-browser-test · ${checks} checks`);
