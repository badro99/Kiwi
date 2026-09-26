#!/usr/bin/env node
/* Render the shipped reprint UI at till width without touching a merchant. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
const ROOT = path.resolve(import.meta.dirname, '..');
const require = createRequire(import.meta.url);
let puppeteer;
try { puppeteer = require(require.resolve('puppeteer-core', { paths: [path.join(ROOT, 'app'), ROOT] })); }
catch { console.log('○ skip: puppeteer-core unavailable'); process.exit(process.env.CI ? 1 : 0); }
const executablePath = process.env.KIWI_CHROMIUM_BIN
  || ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/chromium'].find(fs.existsSync);
if (!executablePath) { console.log('○ skip: Chromium unavailable'); process.exit(process.env.CI ? 1 : 0); }
const server = http.createServer((req, res) => {
  if (req.url.startsWith('/assets/pos-reprint.js')) {
    res.setHeader('Content-Type', 'text/javascript');
    res.end(process.env.REOPEN_BASELINE === '1'
      ? execFileSync('git', ['show', 'HEAD:assets/pos-reprint.js'], { cwd: ROOT })
      : fs.readFileSync(path.join(ROOT, 'assets/pos-reprint.js')));
  } else if (req.url.startsWith('/api/feed')) {
    res.setHeader('Content-Type', 'application/json'); res.end('{"sales":[]}');
  } else {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.end(`<!doctype html><html lang="fr"><meta name="viewport" content="width=device-width,initial-scale=1">
      <style>body{font:16px system-ui;margin:12px;background:#f5f6f4}.modal-veil{display:none}.modal-veil.is-open{display:block}.modal{background:#fff;border-radius:16px;padding:8px;max-width:440px;margin:auto}.ma-btn{padding:10px;border-radius:8px;border:1px solid #bbb;background:#fff}</style>
      <div id="toast-stack"></div><script>
      window.KiwiPosSale={isReal:()=>true};
      window.KiwiPlatform={pairedMerchant:()=>"synthetic-restaurant"};
      window.KiwiRestaurantReopen={originalTable:()=>"1",freeTables:()=>["3"],apply:()=>true};
      </script><script src="/assets/pos-reprint.js"></script><script>
      KiwiPosReprint.provide('restaurant',()=>[{saleId:'synthetic-sale-id',ts:Date.now(),total:5,ref:'Table 1 #77',
        label:'Table 1 · part 2',method:'cash',lines:[{name:'Article libre',qty:1,total:5}],
        reopenSnapshot:{table:'1',covers:2,orderNo:'77',lines:[{name:'Article libre',qty:1,total:10}]}}]);
      KiwiPosReprint.open('restaurant',{noFetch:true});
      </script></html>`);
  }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const browser = await puppeteer.launch({ executablePath, headless: true, args: ['--no-sandbox'] });
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844 });
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  await page.click('[data-kx-rp="0"]');
  assert.equal(await page.$eval('[data-kx-rp-reopen]', button => button.textContent), 'Annuler et rouvrir la note');
  assert.equal(await page.$eval('[data-kx-rp-cancel]', button => button.textContent), 'Annuler la vente');
  await page.click('[data-kx-rp-reopen]');
  assert.equal(await page.$eval('[data-kx-rp-table]', select => select.value), '3');
  assert.match(await page.$eval('[data-kx-rp-table]', select => select.textContent), /occupée \/ reprise existante/);
  assert.match(await page.$eval('[data-kx-rp-occupied]', node => node.textContent), /table occupée/);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= 390), true);
  if (process.env.KIWI_TEST_SCREENSHOT) await page.screenshot({ path: process.env.KIWI_TEST_SCREENSHOT, fullPage: true });
  await page.close();
  console.log('restaurant reopen browser: 6 rendered assertions passed');
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
