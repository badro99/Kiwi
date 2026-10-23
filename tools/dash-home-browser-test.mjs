#!/usr/bin/env node
/* dash-home-browser-test · the dashboard's Home on the kit (stage 5 (1),
 * §18.1), behind kiwiSkin2027:dashboard, on the demo store in a real
 * Chromium. The kit draws the shipped figures (owner, 2026-10-15): every
 * check below holds the kit's figure to the shipped node dateRange.js filled.
 *
 *   node tools/dash-home-browser-test.mjs
 *
 * What it holds:
 *   · flag off: dash-home.js is never fetched, no #kit-home;
 *   · flag on: #kit-home is the first thing in the shipped Home, and the
 *     shipped range bar, tiles and feed are not drawn;
 *   · the key figure is the shipped hero amount; the goal line carries the
 *     shipped goal label; the comparison is the shipped "vs yesterday";
 *   · one kit tile per shipped tile, same label and same value; a delta's
 *     tone follows the figure's polarity (orders and basket up-good);
 *   · one order row per shipped feed row, with its amount;
 *   · Yesterday on the kit's presets moves the shipped range, and the key
 *     figure follows it;
 *   · a tile and an order row open the shipped ones (their click);
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
const norm = (s) => String(s || '').replace(/[\s  ]+/g, ' ').trim();

/* The demo store, as a first visit sees it: Explore the demo, then skip the
   greeting (Escape), which is what the shipped intro offers. */
async function openHome(flag) {
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
  // coverage: surface=dashboard locale=fr viewport=desktop
  await page.goto(base + '/dashboard.html', { waitUntil: 'load' });
  await sleep(1500);
  await page.evaluate(() => { const b = [...document.querySelectorAll('button,a')].find((x) => /Explorer la d/.test(x.textContent)); if (b) b.click(); });
  await sleep(1200);
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !!document.querySelector('[data-kpi-band] .kpi-m'), { timeout: 20000 });
  await sleep(800);
  return { ctx, page, errors, fetched };
}

console.log('dash-home-browser-test');
try {
  {
    const { ctx, page, errors, fetched } = await openHome(false);
    check(!fetched.some((p) => /dash-home\.js/.test(p)) && await page.evaluate(() => !document.getElementById('kit-home')), 'flag off: dash-home.js is never fetched, no #kit-home');
    check(errors.length === 0, 'flag off: no page error' + (errors.length ? ' · ' + errors.join(' | ') : ''));
    await ctx.close();
  }

  const { ctx, page, errors } = await openHome(true);
  const place = await page.evaluate(() => {
    const kh = document.getElementById('kit-home');
    const hidden = (sel) => { const el = document.querySelector(sel); return !el || getComputedStyle(el).display === 'none' || !el.offsetParent; };
    return { first: !!kh && kh.parentNode.matches('.dash-standard') && kh.parentNode.firstElementChild === kh, attr: document.documentElement.hasAttribute('data-k-home'),
      shipped: hidden('[data-kpi-band]') && hidden('.dash-date-range') && hidden('[data-feed]') };
  });
  check(place.first && place.attr, 'flag on: #kit-home is the first thing in the shipped Home');
  check(place.shipped, 'the shipped range bar, tiles and feed are not drawn');

  const read = () => page.evaluate(() => {
    const kh = document.getElementById('kit-home');
    const grid = kh.querySelector('k-kpi-grid');
    const list = kh.querySelector('k-list');
    return {
      kf: kh.querySelector('[data-key-figure] bdi').textContent,
      hero: document.querySelector('[data-hero-amount]').textContent.replace(/MAD|درهم/g, ''),
      goal: (kh.querySelector('.k-dh__goal') || {}).textContent || '',
      shippedGoal: (document.querySelector('[data-goal-label]') || {}).textContent || '',
      cmp: (kh.querySelector('.k-dh__cmp') || {}).textContent || '',
      tiles: [...grid.shadowRoot.querySelectorAll('[data-tile]')].map((t) => ({ key: t.getAttribute('data-tile'), label: t.querySelector('.lb').textContent, value: (t.querySelector('.vl .k-title') || {}).textContent || '', tone: (t.querySelector('.dl') || { getAttribute: () => '' }).getAttribute('data-tone') })),
      shippedTiles: [...document.querySelectorAll('[data-kpi-band] .kpi-m')].map((t) => ({ key: t.dataset.kpi, label: t.querySelector('.l span').textContent, value: (t.querySelector('[data-kpi-val]').cloneNode(true)) })).map((x) => { const u = x.value.querySelector('.u'); if (u) u.remove(); return { key: x.key, label: x.label, value: x.value.textContent }; }),
      rows: list.rows.map((r) => r.value),
      shippedRows: [...document.querySelectorAll('[data-feed] .feed-row')].map((r) => { const a = r.querySelector('.amt').cloneNode(true); const c = a.querySelector('.cur'); if (c) c.remove(); return a.textContent; }),
    };
  });

  /* The hero animates its count; read once it has settled. */
  await page.waitForFunction(() => {
    const kh = document.getElementById('kit-home'); const a = document.querySelector('[data-hero-amount]');
    return kh && a && kh.querySelector('[data-key-figure] bdi') && kh.querySelector('[data-key-figure] bdi').textContent.replace(/\s/g, '') === a.textContent.replace(/MAD|درهم/g, '').replace(/\s/g, '');
  }, { timeout: 10000 }).catch(() => {});
  let v = await read();
  check(norm(v.kf) === norm(v.hero), `the key figure is the shipped hero amount (${norm(v.kf)})`);
  check(v.shippedGoal && norm(v.goal).indexOf(norm(v.shippedGoal)) === 0, `the goal line carries the shipped goal label (${norm(v.goal)})`);
  check(/hier|yesterday|أمس/i.test(v.cmp), `the comparison is the shipped "vs yesterday" (${norm(v.cmp)})`);
  check(v.tiles.length === v.shippedTiles.length && v.tiles.every((t, i) => t.key === v.shippedTiles[i].key && norm(t.label) === norm(v.shippedTiles[i].label)),
    `one kit tile per shipped tile, same labels (${v.tiles.map((t) => t.key).join(', ')})`);
  check(v.tiles.every((t, i) => norm(t.value) === norm(v.shippedTiles[i].value)), `and the same values (${v.tiles.map((t) => norm(t.value)).join(' · ')})`);
  const model = await page.evaluate(() => window.KiwiDateRange.home().tiles.items);
  const toneOk = model.filter((m) => m.key === 'tx' || m.key === 'panier').every((m) => {
    const tile = v.tiles.find((t) => t.key === m.key);
    return tile && tile.tone === (m.delta > 0 ? 'good' : m.delta < 0 ? 'bad' : 'neutral');
  });
  check(toneOk, 'a delta\'s tone follows the polarity: orders and basket are up-good');
  check(v.rows.length === v.shippedRows.length && v.rows.every((r, i) => norm(r).indexOf(norm(v.shippedRows[i])) === 0), `one order row per shipped feed row, with its amount (${v.rows.length})`);

  /* Yesterday, on the kit's presets. */
  await page.evaluate(() => {
    const seg = document.querySelector('#kit-home k-segmented');
    const b = seg.shadowRoot.querySelector('[data-v="yesterday"]');
    b.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, composed: true }));
    b.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, composed: true }));
    b.click();
  });
  await sleep(1500);
  v = await read();
  const range = await page.evaluate(() => ({ r: window.KiwiDateRange.getDateRange(), seg: document.querySelector('#kit-home k-segmented').getAttribute('value') }));
  check(range.r === 'hier' && range.seg === 'yesterday', 'Yesterday on the kit\'s presets moves the shipped range');
  check(norm(v.kf) === norm(v.hero), `and the key figure follows it (${norm(v.kf)})`);

  /* A tile and an order row open the shipped ones. */
  await page.evaluate(() => {
    window.__opened = [];
    document.addEventListener('click', (e) => {
      const k = e.target.closest && e.target.closest('.kpi-m[data-kpi], .feed-row[data-order-key]');
      if (k) window.__opened.push(k.dataset.kpi || k.dataset.orderKey);
    }, true);
    const tap = (el) => { el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, composed: true })); el.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, composed: true })); el.click(); };
    tap(document.querySelector('#kit-home k-kpi-grid').shadowRoot.querySelector('[data-tile="tx"]'));
  });
  await sleep(300);
  await page.keyboard.press('Escape');
  await sleep(200);
  await page.evaluate(() => {
    const tap = (el) => { el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, composed: true })); el.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, composed: true })); el.click(); };
    const row = document.querySelector('#kit-home k-list').shadowRoot.querySelector('[data-row]');
    if (row) tap(row);
  });
  await sleep(300);
  const opened = await page.evaluate(() => window.__opened.slice());
  check(opened.includes('tx') && opened.some((x) => /^o\d+$/.test(x)), `a tile and an order row open the shipped ones (${opened.join(', ')})`);
  check(errors.length === 0, 'no page error' + (errors.length ? ' · ' + errors.join(' | ') : ''));
  await ctx.close();
} finally {
  await browser.close().catch(() => {});
  server.closeAllConnections();
  await new Promise((r) => server.close(r));
}
console.log(`✓ dash-home-browser-test · ${checks} checks`);
