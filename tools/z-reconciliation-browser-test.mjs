#!/usr/bin/env node
/* Render the owner/God Mode mismatch state in a real browser, with synthetic
   merchant data only. No live authentication or financial writes. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { createRequire } from 'node:module';

const ROOT = path.resolve(import.meta.dirname, '..');
const require = createRequire(import.meta.url);
let puppeteer;
try { puppeteer = require(require.resolve('puppeteer-core', { paths: [path.join(ROOT, 'app'), ROOT] })); }
catch { console.log('○ skip: puppeteer-core unavailable'); process.exit(process.env.CI ? 1 : 0); }
const executablePath = process.env.KIWI_CHROMIUM_BIN || [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/chromium',
].find(fs.existsSync);
if (!executablePath) { console.log('○ skip: Chromium unavailable'); process.exit(process.env.CI ? 1 : 0); }
const asset = fs.readFileSync(path.join(ROOT, 'assets/z-reconciliation.js'));
const server = http.createServer((req, res) => {
  if (req.url.startsWith('/api/z-reconciliation')) {
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ ok: true, rows: [{ business_day: '2026-09-21', reported_cents: 150700,
      server_cents: 31400, missing_count: 9, status: 'mismatch' }],
      conflicts: [{ sale_id: 'synthetic-conflict' }] }));
  } else if (req.url.startsWith('/assets/')) {
    res.setHeader('Content-Type', 'text/javascript'); res.end(asset);
  } else {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.end(`<html><body><main id="kw-main"><h1>Tableau de bord · restaurant test</h1></main>
      <script>window.KiwiLive={merchant:()=>"restaurant-ui-fixture"}</script>
      <script src="/assets/z-reconciliation.js"></script></body></html>`);
  }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const browser = await puppeteer.launch({ executablePath, headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844 });
  await page.goto(`http://127.0.0.1:${server.address().port}/dashboard.html`);
  assert.equal(await page.$('#kiwi-z-reconciliation-alert'), null, 'financial alert is absent before unlock');
  await page.evaluate(() => window.dispatchEvent(new Event('kiwi:dashboard-unlocked')));
  await page.waitForSelector('#kiwi-z-reconciliation-alert');
  const alert = await page.$eval('#kiwi-z-reconciliation-alert', node => ({ text: node.textContent, role: node.getAttribute('role') }));
  assert.equal(alert.role, 'status');
  assert.match(alert.text, /1.?193,00 MAD/);
  assert.match(alert.text, /9 vente\(s\)/);
  assert.match(alert.text, /1 conflit\(s\)/);
  if (process.env.KIWI_TEST_SCREENSHOT) await page.screenshot({ path: process.env.KIWI_TEST_SCREENSHOT });
  console.log('✓ 390px owner/God Mode UI renders Z gap, waiting receipts and sale conflict');
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
