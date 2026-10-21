#!/usr/bin/env node
/* dash-figures-agreement-test · one day, one set of figures across the
 * dashboard pages on the kit (design 2027 §17, stage 5), behind
 * kiwiSkin2027:dashboard, on the demo store in a real Chromium.
 *
 *   node tools/dash-figures-agreement-test.mjs
 *
 * The kit draws the shipped figures (owner, 2026-10-15: shipped numbers first,
 * the ledger later per §21.2), so this holds what the pages draw to the one
 * ledger the demo runs (KiwiDemoClock, today): the revenue on Home, Orders,
 * Report and Kiwi AI; the order count on Home, Orders, Report and Kiwi AI;
 * the average basket on Home, Orders and Report, each at the precision its
 * page draws. KiwiLedger itself is held by ledger-agreement-test. */
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

/* A figure as drawn: grouping spaces out, the decimal comma a point. */
const num = (s) => parseFloat(String(s).replace(/[\s  ⁨⁩]/g, '').replace(',', '.').replace(/[^\d.\-−]/g, '').replace('−', '-'));

const ctx = await browser.createBrowserContext();
const page = await ctx.newPage();
await pinTradingHour(page);   // « aujourd'hui » de la démo, à 15 h (tools/demo-clock.mjs)
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
await page.evaluateOnNewDocument(() => {
  localStorage.setItem('kiwiSkin2027:dashboard', '1');
  try { Object.defineProperty(navigator.serviceWorker, 'register', { value: () => new Promise(() => {}), configurable: true }); } catch (_) {}
});
await page.goto(base + '/dashboard.html', { waitUntil: 'load' });
await sleep(1500);
await page.evaluate(() => { const b = [...document.querySelectorAll('button,a')].find((x) => /Explorer la d/.test(x.textContent)); if (b) b.click(); });
await sleep(1200);
await page.keyboard.press('Escape');
await page.waitForFunction(() => !!document.querySelector('#kit-home [data-key-figure]') && window.KiwiDateRange.home().range === 'aujourdhui', { timeout: 20000 });
await sleep(800);

console.log('dash-figures-agreement-test');
try {
  /* Each page, as the kit drew it, on the demo store's today. */
  const home = await page.evaluate(() => {
    const kh = document.getElementById('kit-home');
    const tile = (k) => { const t = kh.querySelector('k-kpi-grid').shadowRoot.querySelector('[data-tile="' + k + '"] .vl .k-title'); return t ? t.textContent : null; };
    return { amount: kh.querySelector('[data-key-figure] bdi').textContent, tx: tile('tx'), basket: tile('panier') };
  });
  await page.evaluate(() => document.querySelector('.sidebar nav a[data-nav="transactions"]').click());
  await page.waitForFunction(() => !!document.querySelector('#kit-orders [data-key-figure]'), { timeout: 10000 });
  const orders = await page.evaluate(() => {
    const ko = document.getElementById('kit-orders');
    return { amount: ko.querySelector('[data-key-figure] bdi').textContent, summary: ko.querySelector('.k-do__sum').textContent,
      rows: [...ko.querySelectorAll('.k-do__rows k-list')].reduce((n, l) => n + l.rows.length, 0), model: window.KiwiOrdersPage.model().count };
  });
  await page.evaluate(() => document.querySelector('.sidebar nav a[data-nav="rapport"]').click());
  await page.waitForFunction(() => !!document.querySelector('[data-kdr-day-selector] button'), { timeout: 10000 });
  await page.evaluate(() => { const b = [...document.querySelectorAll('[data-kdr-day-selector] button')].find((x) => /Aujourd/.test(x.textContent)); if (b) b.click(); });
  await page.waitForFunction(() => /Aujourd/.test((document.querySelector('#kit-report .k-dr__day') || {}).textContent || ''), { timeout: 10000 });
  const report = await page.evaluate(() => {
    const kr = document.getElementById('kit-report');
    const tiles = [...kr.querySelector('k-kpi-grid').shadowRoot.querySelectorAll('[data-tile]')];
    const tile = (k) => (tiles.find((t) => t.getAttribute('data-tile') === k).querySelector('.vl .k-title') || {}).textContent;
    return { amount: kr.querySelector('[data-key-figure] bdi').textContent, tx: tile('txns'), basket: tile('basket') };
  });
  const ledger = await page.evaluate(() => {
    const rows = window.KiwiDemoClock.getDaySales(window.KiwiDayReport.today());
    return { n: rows.length, total: rows.reduce((s, r) => s + Math.round(r.amount * 100), 0) / 100 };
  });
  console.log(`  · ledger today: ${ledger.n} orders, ${ledger.total} MAD`);
  /* Just after the cutoff the demo day may hold no sale yet: the pages then
     agree on nothing to say, and there is no average to compare. */
  if (!ledger.n) {
    console.log('○ skip: the demo day has no sale yet (just after its cutoff); nothing to compare');
    await ctx.close();
    process.exitCode = 0;
  } else {
  await page.evaluate(() => window.KiwiAgent.open());
  await page.waitForFunction(() => !!document.querySelector('#kit-ai [data-today]'), { timeout: 10000 });
  const ai = await page.evaluate(() => document.querySelector('#kit-ai [data-today] p.k-body').textContent);
  /* Revenue: Home and Report draw two decimals, Orders and Kiwi AI whole dirhams. */
  check(Math.abs(num(home.amount) - ledger.total) < 0.005, `Home's key figure is the day's revenue (${home.amount})`);
  check(Math.abs(num(report.amount) - ledger.total) < 0.005, `Report's net is the same (${report.amount})`);
  check(num(orders.amount) === Math.round(ledger.total), `Orders' key figure is the same, whole (${orders.amount})`);
  const aiText = ai.replace(/[⁨⁩]/g, '');
  const aiAmount = (aiText.match(/^([\d\s]+?)\sMAD/) || [])[1];
  check(aiAmount && num(aiAmount) === Math.round(ledger.total), `Kiwi AI's Today card says the same (${aiAmount} MAD)`);
  /* Orders. */
  check(num(home.tx) === ledger.n, `Home's orders tile counts the day's orders (${home.tx})`);
  check(num(report.tx) === ledger.n, `Report's transactions agree (${report.tx})`);
  const sumText = orders.summary.replace(/[⁨⁩]/g, '');
  check(orders.model === ledger.n && orders.rows === Math.min(ledger.n, 80) && num((sumText.match(/^(\d+)/) || [])[1]) === ledger.n,
    `Orders' summary agrees, and its rows are the newest of them (${sumText})`);
  check(new RegExp('sur ' + ledger.n + ' commandes').test(aiText), 'Kiwi AI\'s Today card agrees');
  /* The average basket, each at its own precision. */
  const basket = ledger.total / ledger.n;
  check(num(home.basket) === Math.round(basket), `Home's basket is the day's average, whole (${home.basket})`);
  check(Math.abs(num(report.basket) - Math.round(basket * 100) / 100) < 0.011, `Report's basket is the same to the centime (${report.basket})`);
  check(num((sumText.match(/panier moyen ([\d\s]+)/) || [])[1]) === Math.round(basket), `Orders' basket agrees (${sumText})`);
  check(errors.length === 0, 'no page error' + (errors.length ? ' · ' + errors.join(' | ') : ''));
  await ctx.close();
  }
} finally {
  await browser.close().catch(() => {});
  server.closeAllConnections();
  await new Promise((r) => server.close(r));
}
console.log(`✓ dash-figures-agreement-test · ${checks} checks`);
