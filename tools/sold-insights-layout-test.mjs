#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(path.join(ROOT, 'app', 'package.json'));
const puppeteer = require('puppeteer-core');
const chrome = ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Chromium.app/Contents/MacOS/Chromium', '/usr/bin/google-chrome', '/usr/bin/chromium']
  .find((candidate) => fs.existsSync(candidate));
if (!chrome) throw new Error('Chromium/Chrome executable not found');

const html = `<!doctype html><html><head><meta charset="utf-8"><style>
  :root{--sans:Arial,sans-serif;--num:Arial,sans-serif;--ink:#111;--surface:#fff;--paper:#faf8f4;--paper-soft:#f5f3ef;--n-100:#eee;--n-200:#dedbd5;--n-500:#777;--atlas:#087a5b}
  *{box-sizing:border-box}body{margin:0;background:var(--paper)}#panel{min-height:100vh}
</style></head><body><section id="panel"></section><script>
  window.KiwiBoutiqueCatalog={listCategories:()=>[],listProducts:()=>[],listVariants:()=>[]};
  window.KiwiPlatform={pairedMerchant:()=>''};
</script><script src="/assets/sold-insights.js"></script><script>
  KiwiSoldInsights.renderTill(document.getElementById('panel'));
</script></body></html>`;
const server = http.createServer((req, res) => {
  if (req.url === '/assets/sold-insights.js') {
    res.writeHead(200, { 'Content-Type': 'text/javascript' });
    res.end(fs.readFileSync(path.join(ROOT, 'assets/sold-insights.js')));
    return;
  }
  res.writeHead(200, { 'Content-Type': 'text/html' }); res.end(html);
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const port = server.address().port;
const browser = await puppeteer.launch({ executablePath: chrome, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
  await page.goto(`http://127.0.0.1:${port}`, { waitUntil: 'load' });
  const desktop = await page.evaluate(() => {
    const strip = document.querySelector('.kx-kpi-strip');
    const icon = document.querySelector('.kx-empty .ico');
    const svg = icon.querySelector('svg');
    return {
      stripDisplay: getComputedStyle(strip).display,
      stripColumns: getComputedStyle(strip).gridTemplateColumns.split(' ').length,
      icon: [Math.round(icon.getBoundingClientRect().width), Math.round(icon.getBoundingClientRect().height)],
      svg: [Math.round(svg.getBoundingClientRect().width), Math.round(svg.getBoundingClientRect().height)],
      pageWidth: document.documentElement.scrollWidth,
    };
  });
  assert.equal(desktop.stripDisplay, 'grid');
  assert.equal(desktop.stripColumns, 4);
  assert.deepEqual(desktop.icon, [46, 46]);
  assert.deepEqual(desktop.svg, [22, 22]);
  assert.equal(desktop.pageWidth, 1440);
  await page.click('[data-ksold-custom]');
  const exactPicker = await page.evaluate(() => ({
    visible: !!document.querySelector('.ksold-picker'),
    mode: document.querySelector('[data-ksold-mode="day"]')?.classList.contains('on'),
    dates: document.querySelectorAll('.ksold-picker input[type="date"]').length,
  }));
  assert.deepEqual(exactPicker, { visible:true, mode:true, dates:1 });
  await page.click('[data-ksold-mode="range"]');
  const rangePicker = await page.evaluate(() => ({
    mode: document.querySelector('[data-ksold-mode="range"]')?.classList.contains('on'),
    dates: document.querySelectorAll('.ksold-picker input[type="date"]').length,
  }));
  assert.deepEqual(rangePicker, { mode:true, dates:2 });
  await page.$eval('[data-ksold-from]', (el) => { el.value = '2026-09-10'; });
  await page.$eval('[data-ksold-to]', (el) => { el.value = '2026-09-11'; });
  await page.click('[data-ksold-apply]');
  assert.match(await page.$eval('[data-ksold-custom]', (el) => el.textContent), /10.*11/);
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 });
  const mobile = await page.evaluate(() => ({
    columns: getComputedStyle(document.querySelector('.kx-kpi-strip')).gridTemplateColumns.split(' ').length,
    width: document.documentElement.scrollWidth,
  }));
  assert.equal(mobile.columns, 1);
  assert.equal(mobile.width, 390);
  console.log('sold-insights-layout-test: KPI cards and 22px empty-state icon render on desktop and phone');
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
