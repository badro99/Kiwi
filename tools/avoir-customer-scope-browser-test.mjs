#!/usr/bin/env node
// #95: no walk-in or unrelated customer may see another customer's credit.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';

const ROOT = path.resolve(import.meta.dirname, '..');
const require = createRequire(import.meta.url);
const puppeteer = require(require.resolve('puppeteer-core', {
  paths: [path.join(ROOT, 'app'), ROOT, ...(process.env.NODE_PATH || '').split(path.delimiter).filter(Boolean)],
}));
const executablePath = process.env.KIWI_CHROMIUM_BIN || [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/chromium',
].find(fs.existsSync);
assert.ok(executablePath, 'Chromium is required for #95 retail UI regression');
const stamps = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools/asset-stamps.json'), 'utf8'));
const baseline = process.env.KIWI_TEST_SOURCE_REF;
const baselineScripts = baseline ? Object.fromEntries(['maison', 'boutique'].map((vertical) => {
  const file = `assets/pos-${vertical}.js`;
  return [`/${file}`, execFileSync('git', ['show', `${baseline}:${file}`], { cwd: ROOT, encoding: 'utf8' })];
})) : null;
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2' };
const caisseInlineCss = [...fs.readFileSync(path.join(ROOT, 'kiwi-caisse.html'), 'utf8').matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)]
  .map((match) => match[1]).join('\n');
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const vertical = url.searchParams.get('vertical') === 'boutique' ? 'boutique' : 'maison';
  const pathname = decodeURIComponent(url.pathname);
  if (pathname === '/') {
    res.writeHead(200, { 'Content-Type': TYPES['.html'], 'Cache-Control': 'no-store' });
    res.end(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
      <link rel="stylesheet" href="/assets/tokens.css"><link rel="stylesheet" href="/caisse-inline.css"><link rel="stylesheet" href="/assets/caisse-dna.css">
      <link rel="stylesheet" href="/assets/pos-${vertical}.css">
      <style>html,body{margin:0;width:100%;height:100%;overflow:hidden;background:var(--paper,#f7f5f0)}button,input{font:inherit}.vx-screen{display:flex}</style>
      <script>window.KiwiEnv={isReal:()=>false,demosAllowed:true};window.KiwiPosDispatch={register:s=>window.__spec=s,lock:()=>{}};</script>
      <script src="/assets/caisse-dna.js"></script><script src="/assets/barcode.js"></script><script src="/assets/color-palette.js"></script>
      <script src="/assets/inventory-ledger.js"></script><script src="/assets/maison-stock-movements.js"></script><script src="/assets/procurement.js"></script>
      <script src="/assets/venue-store.js"></script><script src="/assets/clients-store.js"></script><script src="/assets/clients-book.js"></script>
      <script src="/assets/boutique-catalog.js"></script><script src="/assets/sold-insights.js"></script><script src="/assets/pos-${vertical}.js?v=${stamps[`assets/pos-${vertical}.js`].v}"></script>
      </head><body class="is-pos-${vertical}"><div id="toast-stack"></div><div class="vx-screen is-on" id="pos-${vertical}"></div>
      <script>window.__spec.mount(document.getElementById('pos-${vertical}'));window.KiwiCaisseDna.enhance(document.getElementById('pos-${vertical}'),'${vertical}');</script></body></html>`);
    return;
  }
  if (pathname === '/caisse-inline.css') {
    res.writeHead(200, { 'Content-Type': TYPES['.css'], 'Cache-Control': 'no-store' });
    res.end(caisseInlineCss);
    return;
  }
  if (baselineScripts && Object.hasOwn(baselineScripts, pathname)) {
    res.writeHead(200, { 'Content-Type': TYPES['.js'], 'Cache-Control': 'no-store' });
    res.end(baselineScripts[pathname]);
    return;
  }
  if (pathname.startsWith('/api/')) { res.writeHead(404); res.end('{}'); return; }
  const file = path.resolve(ROOT, pathname.replace(/^\/+/, ''));
  if (!file.startsWith(ROOT + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); res.end('not found'); return; }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
  fs.createReadStream(file).pipe(res);
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const browser = await puppeteer.launch({ executablePath, headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
let checks = 0;
try {
  for (const vertical of ['maison', 'boutique']) {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.setViewport({ width: 1280, height: 900 });
    const prefix = vertical === 'maison' ? 'mz' : 'bq';
    const holderName = vertical === 'maison' ? 'Mme Ghita Benjelloun' : 'Salma Bennis';
    await page.goto(`http://127.0.0.1:${server.address().port}/?vertical=${vertical}`, { waitUntil: 'load' });
    await page.evaluate(async () => {
      await Promise.all((await navigator.serviceWorker.getRegistrations()).map((registration) => registration.unregister()));
      await Promise.all((await caches.keys()).map((key) => caches.delete(key)));
    });
    await page.reload({ waitUntil: 'load' });
    const stampedAsset = `/assets/pos-${vertical}.js?v=${stamps[`assets/pos-${vertical}.js`].v}`;
    assert.ok(await page.evaluate((asset) => performance.getEntriesByType('resource').some((entry) => entry.name.includes(asset)), stampedAsset),
      `${vertical}: final stamped POS asset must load after clearing caches`);
    checks++;
    await page.waitForSelector(`[data-${prefix}-item]:not(.is-out)`, { visible: true });
    await page.click(`[data-${prefix}-item]:not(.is-out)`);
    await page.waitForSelector(`#${prefix}-sheet-add:not([disabled])`, { visible: true });
    await page.click(`#${prefix}-sheet-add`);
    await page.waitForSelector(`#${prefix}-validate:not([disabled])`, { visible: true });
    await page.click(`#${prefix}-validate`);
    await page.waitForSelector(`#${prefix}-paym [data-${prefix}-m="avoir"]`, { visible: true });
    if (process.env.KIWI_TEST_DEBUG) console.log(vertical, await page.$eval(`#${prefix}-paym .modal-amount`, (el) => el.innerText));
    const noCustomerText = await page.$eval(`#${prefix}-paym [data-${prefix}-m="avoir"]`, (el) => el.innerText);
    assert.ok(!noCustomerText.includes('AV-2031') && !noCustomerText.includes(holderName), `${vertical}: walk-in payment choices leaked someone else's credit: ${noCustomerText}`);
    checks++;
    if (process.env.KIWI_TEST_ARTIFACT_DIR) {
      fs.mkdirSync(process.env.KIWI_TEST_ARTIFACT_DIR, { recursive: true });
      await page.waitForFunction((p) => getComputedStyle(document.querySelector(`#${p}-paym`)).animationName === 'none'
        || document.querySelector(`#${p}-paym`).getAnimations().every((animation) => animation.playState === 'finished'), {}, prefix);
      await page.screenshot({ path: path.join(process.env.KIWI_TEST_ARTIFACT_DIR, `${vertical}-walk-in.png`) });
    }
    await page.click(`#${prefix}-paym [data-${prefix}-m="avoir"]`);
    const unclaimedText = await page.$eval(`#${prefix}-paym`, (el) => el.innerText);
    assert.ok(!unclaimedText.includes('AV-2031') && !unclaimedText.includes(holderName), `${vertical}: walk-in credit picker listed another customer's credit`);
    checks++;
    assert.ok(await page.$(`#${prefix}-av-code`), `${vertical}: walk-in can still scan or type an exact credit code`);
    checks++;
    await page.click(`#${prefix}-av-back`);
    await page.click(`#${prefix}-paym [data-${prefix}-close]`);
    await page.click(`#${prefix}-tk-client`);
    await page.waitForSelector(`[data-${prefix}-cl="c3"]`, { visible: true });
    await page.click(`[data-${prefix}-cl="c3"]`);
    await page.click(`#${prefix}-validate`);
    await page.waitForSelector(`#${prefix}-paym [data-${prefix}-m="avoir"]`, { visible: true });
    const otherCustomerText = await page.$eval(`#${prefix}-paym [data-${prefix}-m="avoir"]`, (el) => el.innerText);
    assert.ok(!otherCustomerText.includes('AV-2031') && !otherCustomerText.includes(holderName), `${vertical}: unrelated customer saw another customer's credit: ${otherCustomerText}`);
    checks++;
    await page.click(`#${prefix}-paym [data-${prefix}-close]`);
    await page.click(`#${prefix}-tk-client`);
    await page.waitForSelector(`[data-${prefix}-cl="c2"]`, { visible: true });
    await page.click(`[data-${prefix}-cl="c2"]`);
    await page.click(`#${prefix}-validate`);
    await page.waitForSelector(`#${prefix}-paym [data-${prefix}-m="avoir"]`, { visible: true });
    const holderText = await page.$eval(`#${prefix}-paym [data-${prefix}-m="avoir"]`, (el) => el.innerText);
    assert.match(holderText, /AV-2031/, `${vertical}: the actual holder must see their own credit`);
    assert.ok(holderText.includes(holderName), `${vertical}: the credit must name the actual holder`);
    checks++;
    if (process.env.KIWI_TEST_ARTIFACT_DIR) {
      await page.waitForFunction((p) => document.querySelector(`#${p}-paym`).getAnimations().every((animation) => animation.playState === 'finished'), {}, prefix);
      await page.screenshot({ path: path.join(process.env.KIWI_TEST_ARTIFACT_DIR, `${vertical}-holder.png`) });
    }
    await page.click(`#${prefix}-paym [data-${prefix}-close]`);
    await page.click(`#${prefix}-tk-client`);
    await page.waitForSelector(`#${prefix}-cl-guest`, { visible: true });
    await page.click(`#${prefix}-cl-guest`);
    await page.click(`#${prefix}-validate`);
    await page.click(`#${prefix}-paym [data-${prefix}-m="avoir"]`);
    await page.waitForSelector(`#${prefix}-av-code`, { visible: true });
    await page.type(`#${prefix}-av-code`, 'AV-2031');
    await page.click(`#${prefix}-av-code-form button[type="submit"]`);
    await page.waitForFunction((p) => document.querySelector(`#${p}-paym .${p}-pay-applied`)?.textContent.includes('AV-2031'), { timeout: 5000 }, prefix);
    checks++;
    assert.deepEqual(errors, [], `${vertical}: no uncaught browser errors`);
    checks++;
    await page.close();
  }
  console.log(`✓ ${checks} browser checks: Maison and boutique hide unrelated credits but keep exact-code redemption`);
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
