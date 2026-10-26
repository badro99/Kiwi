#!/usr/bin/env node
// #98: a retained, hidden Commandes host must never steal navigation when a
// background sale/refund or day-report update arrives.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import pagesProSource from './pages-pro-test-source.cjs';
import dashboardDependencies from './dashboard-dependencies.cjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const require = createRequire(import.meta.url);
const puppeteer = require(require.resolve('puppeteer-core', { paths: [path.join(ROOT, 'app'), ROOT] }));
const executablePath = process.env.KIWI_CHROMIUM_BIN || [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/chromium',
].find(fs.existsSync);
assert.ok(executablePath, 'Chromium is required for the #98 browser regression');
const pagesProAsset = dashboardDependencies.eager(fs.readFileSync(path.join(ROOT, 'dashboard.html'), 'utf8')).match(/assets\/pages-pro\.js\?v=\d+/)?.[0];
assert.ok(pagesProAsset, 'dashboard.html must version pages-pro.js');
/* pages-pro.js tient en quatre fichiers depuis le 22 octobre 2026 (nav-transactions
 * vit dans pages-pro-office.js). Une référence d'avant le découpage n'a que
 * pages-pro.js : les trois autres y sont alors servis vides. */
const baselinePagesPro = process.env.KIWI_TEST_SOURCE_REF
  ? new Map(pagesProSource.FILES.map((rel) => {
    let body = '';
    try { body = execFileSync('git', ['show', `${process.env.KIWI_TEST_SOURCE_REF}:${rel}`], { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }); }
    catch (_) { if (rel === 'assets/pages-pro.js') throw _; }
    return ['/' + rel, body];
  })) : null;

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2' };
const server = http.createServer((req, res) => {
  const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  if (baselinePagesPro && baselinePagesPro.has(pathname)) {
    res.writeHead(200, { 'Content-Type': TYPES['.js'], 'Cache-Control': 'no-store' });
    res.end(baselinePagesPro.get(pathname));
    return;
  }
  if (pathname === '/kiwi-sw.js') { res.writeHead(404); res.end('fixture has no service worker'); return; }
  if (pathname.startsWith('/api/')) {
    res.writeHead(pathname === '/api/me' ? 200 : 404, { 'Content-Type': 'application/json' });
    res.end(pathname === '/api/me' ? '{"authenticated":false}' : '{"error":"not-found"}');
    return;
  }
  const file = path.resolve(ROOT, pathname === '/' ? 'dashboard.html' : pathname.replace(/^\/+/, ''));
  if (!file.startsWith(ROOT + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); res.end('not found'); return; }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
  fs.createReadStream(file).pipe(res);
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const browser = await puppeteer.launch({ executablePath, headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
let checks = 0;
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  await page.evaluateOnNewDocument(() => {
    const venue = { id: 'v-nav-stability', name: 'Restaurant fixture', slug: 'nav-stability', type: 'restaurant', custom: true, status: 'En service', txCount: 0, staffCount: 0 };
    localStorage.setItem('kiwiCustomVenues', JSON.stringify([venue]));
    localStorage.setItem('kiwiVenue', venue.id);
    localStorage.setItem('kiwiOnboarded', '1');
  });
  // coverage: surface=dashboard locale=fr viewport=desktop
  await page.goto(`http://127.0.0.1:${server.address().port}/dashboard.html`, { waitUntil: 'load', timeout: 30000 });
  await page.evaluate(async () => {
    for (const registration of await navigator.serviceWorker.getRegistrations()) await registration.unregister();
    for (const key of await caches.keys()) await caches.delete(key);
  });
  await page.reload({ waitUntil: 'load' });
  assert.equal(await page.evaluate((asset) => performance.getEntriesByType('resource').some((entry) => entry.name.includes(asset)), pagesProAsset), true, 'the freshly stamped pages-pro.js was loaded');
  await page.waitForFunction(() => window.KiwiVenue?.getCurrentVenueData?.()?.id === 'v-nav-stability');
  await page.waitForSelector('.kiwi-lock-skip', { visible: true });
  await page.click('.kiwi-lock-skip');
  await page.waitForFunction(() => !document.querySelector('.app')?.classList.contains('kw-app-hidden'));
  await page.waitForSelector('.sidebar nav a[data-nav="transactions"]');
  await page.waitForFunction(() => window.Kiwi?.handlers?.['nav-transactions']?.__kiwiStarter === true);
  await page.click('.sidebar nav a[data-nav="transactions"]');
  await page.waitForFunction(() => document.body.classList.contains('page-genpage') && window.Kiwi?.activePage === 'transactions' && !!document.querySelector('[data-real-tx]'), { timeout: 5000 }).catch(async (error) => {
    console.log('navigation debug:', await page.evaluate(() => ({ active: window.Kiwi?.activePage, body: document.body.className, real: !!document.querySelector('[data-real-tx]'), starter: !!document.querySelector('[data-starter-nav="transactions"]'), text: document.querySelector('.dash-genpage')?.textContent.slice(0, 400), venue: window.KiwiVenue?.getCurrentVenueData?.()?.id, custom: window.KiwiVenue?.isCustom?.() })));
    throw error;
  });
  checks++;
  await page.click('.sidebar nav a[data-nav="accueil"]');
  await page.waitForFunction(() => window.Kiwi?.activePage === 'accueil' && !document.body.classList.contains('page-genpage'));
  assert.ok(await page.$('[data-real-tx]'), 'hidden Commandes host is retained after returning home');
  checks++;
  await page.evaluate(() => window.KiwiSales.add('v-nav-stability', { amount: 1, method: 'cash', ts: Date.now(), label: 'Synthetic fixture order', saleId: 'fixture-one' }));
  assert.equal(await page.evaluate(() => window.Kiwi.activePage), 'accueil', 'sale update must not navigate away from Accueil');
  assert.equal(await page.evaluate(() => document.body.classList.contains('page-genpage')), false, 'sale update must not make Commandes visible');
  checks += 2;
  await page.evaluate(() => window.KiwiRefunds.add('v-nav-stability', { amount: 1, method: 'cash', ts: Date.now(), label: 'Synthetic fixture refund', saleId: 'fixture-refund' }));
  assert.equal(await page.evaluate(() => window.Kiwi.activePage), 'accueil', 'refund update must not navigate away from Accueil');
  checks++;
  await page.evaluate(() => window.dispatchEvent(new Event('kiwi-day-report-ready')));
  assert.equal(await page.evaluate(() => window.Kiwi.activePage), 'accueil', 'day-report update must not navigate away from Accueil');
  checks++;
  if (process.env.KIWI_TEST_SCREENSHOT) {
    await page.screenshot({ path: process.env.KIWI_TEST_SCREENSHOT.replace(/\.png$/, '-home.png'), fullPage: true });
  }
  await page.click('.sidebar nav a[data-nav="transactions"]');
  await page.waitForFunction(() => window.Kiwi?.activePage === 'transactions' && document.querySelector('[data-real-tx]')?.textContent.includes('Synthetic fixture order'));
  await page.waitForFunction(() => getComputedStyle(document.querySelector('.dash-genpage')).opacity === '1');
  await page.waitForFunction(() => getComputedStyle(document.querySelector('.app')).opacity === '1');
  assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector('.app')).opacity), '1', 'visible application, not only a hidden DOM match');
  checks++;
  if (process.env.KIWI_TEST_SCREENSHOT) {
    await page.screenshot({ path: process.env.KIWI_TEST_SCREENSHOT, fullPage: true });
  }
  console.log(`✓ ${checks} browser checks: actual navigation clicks, background sale/refund/report, live order still visible`);
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
