#!/usr/bin/env node
// #90: the stock movement KPI strip must not be compressed to a sliver by the
// results panel's fixed minimum height on a short/tablet caisse viewport.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';

const ROOT = path.resolve(import.meta.dirname, '..');
const require = createRequire(import.meta.url);
const puppeteer = require(require.resolve('puppeteer-core', { paths: [path.join(ROOT, 'app'), ROOT] }));
const executablePath = process.env.KIWI_CHROMIUM_BIN || [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/chromium',
].find(fs.existsSync);
assert.ok(executablePath, 'Chromium is required for the #90 layout regression');
const stamps = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools/asset-stamps.json'), 'utf8'));
const cssAsset = `/assets/pos-maison.css?v=${stamps['assets/pos-maison.css'].v}`;

const fixture = spawn(process.execPath, [path.join(ROOT, 'tools/retail-ui-fixture.mjs')], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
let browser;
try {
  const base = await new Promise((resolve, reject) => {
    let output = '', errors = '';
    const timeout = setTimeout(() => reject(new Error('retail fixture did not start: ' + errors)), 15000);
    fixture.stdout.on('data', (chunk) => {
      output += chunk;
      const match = output.match(/KIWI_RETAIL_UI_QA_READY (\{[^\n]+\})/);
      if (match) { clearTimeout(timeout); resolve(JSON.parse(match[1]).base); }
    });
    fixture.stderr.on('data', (chunk) => { errors += chunk; });
    fixture.once('exit', (code) => { clearTimeout(timeout); reject(new Error(`retail fixture exited ${code}: ${errors}`)); });
  });
  browser = await puppeteer.launch({ executablePath, headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  let checks = 0;
  for (const [width, height] of [[1024, 768], [768, 600], [1280, 900]]) {
    const page = await browser.newPage();
    await page.setViewport({ width, height });
    await page.setRequestInterception(true);
    page.on('request', (request) => {
      if (request.url().startsWith(base + '/') || request.url().startsWith('data:')) request.continue().catch(() => {});
      else request.abort().catch(() => {});
    });
    await page.goto(base + '/maison.html', { waitUntil: 'load' });
    await page.evaluate(async () => {
      await Promise.all((await navigator.serviceWorker.getRegistrations()).map((registration) => registration.unregister()));
      await Promise.all((await caches.keys()).map((key) => caches.delete(key)));
    });
    await page.reload({ waitUntil: 'load' });
    assert.ok(await page.evaluate((asset) => performance.getEntriesByType('resource').some((entry) => entry.name.includes(asset)), cssAsset),
      `the stamped Maison stylesheet must load after cache clearing at ${width}x${height}`);
    checks++;
    await page.click('[data-mz-view="mouvements"]');
    await page.waitForSelector('.mzm-kpis .mzm-kpi');
    const metrics = await page.evaluate(() => {
      const strip = document.querySelector('.mzm-kpis');
      const rect = strip.getBoundingClientRect();
      const cards = [...strip.querySelectorAll('.mzm-kpi')].map((card) => ({
        top: card.getBoundingClientRect().top, bottom: card.getBoundingClientRect().bottom,
        label: card.querySelector('span')?.innerText, value: card.querySelector('b')?.innerText,
      }));
      return { height: rect.height, scrollHeight: strip.scrollHeight, top: rect.top, bottom: rect.bottom,
        cards, resultsTop: document.querySelector('.mzm-results').getBoundingClientRect().top };
    });
    assert.ok(metrics.height >= metrics.scrollHeight - 1,
      `${width}x${height}: movement KPI strip clipped to ${metrics.height}px while content needs ${metrics.scrollHeight}px`);
    checks++;
    assert.equal(metrics.cards.length, 4, 'all four stock movement indicators render');
    assert.ok(metrics.cards.every((card) => card.top >= metrics.top - 1 && card.bottom <= metrics.bottom + 1 && card.label && card.value),
      `${width}x${height}: each movement KPI label and value must stay inside the visible strip`);
    assert.ok(metrics.resultsTop >= metrics.bottom, `${width}x${height}: results must not cover the KPI strip`);
    checks += 3;
    if (process.env.KIWI_TEST_ARTIFACT_DIR) {
      fs.mkdirSync(process.env.KIWI_TEST_ARTIFACT_DIR, { recursive: true });
      await page.screenshot({ path: path.join(process.env.KIWI_TEST_ARTIFACT_DIR, `movement-${width}x${height}.png`) });
    }
    await page.close();
  }
  console.log(`✓ ${checks} browser checks: Maison movement KPIs remain readable at desktop and tablet heights`);
} finally {
  if (browser) await browser.close();
  fixture.kill('SIGTERM');
}
