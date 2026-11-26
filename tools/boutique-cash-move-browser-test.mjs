#!/usr/bin/env node
/* boutique-cash-move-browser-test · « Mouvement de caisse » on the boutique till, by real clicks.
 *
 *   node tools/boutique-cash-move-browser-test.mjs
 *
 * 26 Nov 2026: the boutique till (Santos, Amira Boutique, Elham Brand) had no
 * way to record cash paid out of the drawer. An expense paid in cash closed as
 * a shortage, and the Z carried only the no-sale drawer openings. The Maison
 * sheet (pos-maison/cash-moves.js) is now wired into pos-boutique.js.
 *
 * On a paired (real) boutique till, APIs offline: open the shift, record a
 * 150 MAD cash-out through the sheet, reload (the movement must survive), then
 * close counting float − 150. The closing sheet must show the cash-out line and
 * expect exactly float − 150, so the close leaves no gap for the next opening.
 * The manager-code pad itself is replaced by an approving stub: who may approve
 * is held by maison-cash-moves-test (approval, refusal, missing gate, demo). */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { suite } from './browser-trace.mjs';

const root = process.env.KIWI_ROOT || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let puppeteer;
try { puppeteer = createRequire(path.join(root, 'app/package.json'))('puppeteer-core'); }
catch { console.log('○ skip: puppeteer-core unavailable — browser assertions not executed'); process.exit(process.env.CI ? 1 : 0); }
const bin = process.env.KIWI_CHROMIUM_BIN || ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/chromium', '/usr/bin/google-chrome'].find(fs.existsSync);
if (!bin) { console.log('○ skip: Chromium unavailable — browser assertions not executed'); process.exit(process.env.CI ? 1 : 0); }

const mime = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.json': 'application/json', '.png': 'image/png', '.webp': 'image/webp' };
const server = http.createServer((req, res) => {
  const p = path.resolve(root, '.' + decodeURIComponent(new URL(req.url, 'http://local').pathname));
  if (!p.startsWith(root + path.sep)) { res.writeHead(403); res.end(); return; }
  fs.readFile(p, (err, data) => { res.writeHead(err ? 404 : 200, { 'Content-Type': mime[path.extname(p)] || 'application/octet-stream', 'Cache-Control': 'no-cache' }); res.end(err ? '' : data); });
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await puppeteer.launch({ executablePath: bin, headless: true, args: ['--no-sandbox'] });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let checks = 0;
const check = (yes, msg) => { assert.ok(yes, msg); checks++; console.log('  ✓ ' + msg); };
const S = suite('boutique-cash-move', { browser });
const shop = { merchant: 'cashmove-boutique', type: 'boutique', name: 'Cashmove Boutique', location: 'Tanger' };
/* The button is clickable once nothing covers it (the opening screen fades out). */
const clickable = (page, sel) => page.waitForFunction((q) => { const b = document.querySelector(q); if (!b) return false; b.scrollIntoView({ block: 'center' }); const r = b.getBoundingClientRect();
  const at = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); return !!at && b.contains(at); }, { timeout: 15000, polling: 200 }, sel);
const shift = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('kiwi:bqShift') || 'null'));

try {
  await S.run('a cash-out is recorded, survives a reload and is expected at closing', async (t) => {
    const ctx = await browser.createBrowserContext(); t.defer(() => ctx.close());
    const page = t.watch(await ctx.newPage());
    await page.setViewport({ width: 1180, height: 820 });
    await page.setBypassServiceWorker(true);
    await page.setRequestInterception(true);
    page.on('request', (r) => {
      const u = r.url();
      if (!u.startsWith(base)) return u.startsWith('data:') ? r.continue() : r.abort();
      if (new URL(u).pathname.startsWith('/api/')) return r.respond({ status: 503, contentType: 'application/json', body: '{"error":"offline"}' });
      return r.continue();
    });
    await page.evaluateOnNewDocument(() => { try { Object.defineProperty(navigator.serviceWorker, 'register', { value: () => new Promise(() => {}), configurable: true }); } catch (_) {} });
    const unlock = async () => {
      await page.waitForFunction(() => window.KiwiPosDispatch, { timeout: 30000 });
      await page.evaluate(() => window.KiwiPosDispatch.unlockById('boutique'));
      await page.waitForSelector('#bq-cash-move', { timeout: 20000 });
      await sleep(800);
    };

    t.step('a paired boutique till, shift opened');
    await page.goto(base + '/kiwi-caisse.html?__blank', { waitUntil: 'domcontentloaded' });
    await page.evaluate((v) => { localStorage.clear(); localStorage.setItem('kiwiPaired', '1'); localStorage.setItem('kiwiLiveMerchant', v.merchant);
      localStorage.setItem('kiwiPairedVenue', JSON.stringify(v)); }, shop);
    await page.goto(base + '/kiwi-caisse.html', { waitUntil: 'load' });
    await page.waitForFunction(() => window.KiwiPosDispatch, { timeout: 30000 });
    await page.evaluate(() => window.KiwiPosDispatch.unlockById('boutique'));
    await page.waitForSelector('#bqci-chips .ci-float-chip[data-float="500"]', { visible: true, timeout: 15000 });
    await page.click('#bqci-chips .ci-float-chip[data-float="500"]');
    await page.waitForFunction(() => !document.getElementById('bqci-btn').disabled, { timeout: 5000 });
    await page.click('#bqci-btn');
    await page.waitForSelector('#bq-cash-move', { visible: true, timeout: 15000 });
    const float = (await shift(page)).float;
    check(float > 0, `the shift is open with a float of ${float} MAD`);

    t.step('record a 150 MAD cash-out');
    await page.evaluate(() => { window.__approved = []; window.requireManager = (label, go) => { window.__approved.push(label); go({ id: 'mgr-1', name: 'Responsable' }); }; });
    await clickable(page, '#bq-cash-move');
    await page.click('#bq-cash-move');
    await page.waitForSelector('#mz-cash-move-sheet.is-open #mzcm-amount', { visible: true, timeout: 10000 });
    const sheet = await page.$eval('#mz-cash-move-sheet', (e) => e.innerText.replace(/\s+/g, ' '));
    check(/Mouvement de caisse/.test(sheet) && /Sortie/.test(sheet) && /Entrée/.test(sheet), 'the « Mouvement de caisse » sheet opens with Sortie and Entrée');
    await page.type('#mzcm-amount', '150');
    await page.click('#mz-cash-move-sheet [data-till-cat="supplier"]');
    await page.type('#mzcm-detail', 'Fournisseur cintres');
    await page.click('#mz-cash-move-sheet [data-mzcm-confirm]');
    await page.waitForFunction(() => !document.querySelector('#mz-cash-move-sheet.is-open'), { timeout: 10000 });
    let s = await shift(page);
    check(s.moves && s.moves.length === 1 && s.moves[0].type === 'out' && s.moves[0].amount === 150 && s.moves[0].by === 'Responsable',
      `the cash-out is kept on the shift, with who approved it (${JSON.stringify(s.moves)})`);
    check((await page.evaluate(() => window.__approved.length)) === 1, 'a real store asks for the manager code once');

    t.step('reload the till');
    await page.reload({ waitUntil: 'load' });
    await unlock();
    s = await shift(page);
    check(s.moves && s.moves.length === 1 && s.moves[0].amount === 150, 'the movement survives a reload of the till');

    t.step('close counting float − 150');
    await clickable(page, '#bq-close-day');
    await page.click('#bq-close-day');
    await page.waitForSelector('#bq-cloture.is-open #bqclo-count', { timeout: 15000 });
    const clo = await page.$eval('#bq-cloture', (e) => e.innerText.replace(/\s+/g, ' '));
    check(/Sorties de caisse − 150 MAD/.test(clo) && new RegExp('Attendu en caisse ' + (float - 150) + ' MAD').test(clo), `the closing sheet shows the cash-out and expects float − 150 (« ${clo.slice(clo.indexOf('Fond'), clo.indexOf('Espèces comptées'))}»)`);
    const expected = Math.round((float - 150) * 100) / 100;
    await page.$eval('#bqclo-count', (e, v) => { e.value = String(v); e.dispatchEvent(new Event('input', { bubbles: true })); }, expected);
    await page.click('#bqclo-close');
    await page.waitForSelector('#bq-zsheet.is-open', { timeout: 15000 });
    const gaps = await page.evaluate((m) => (window.KiwiCloseFollowUp ? window.KiwiCloseFollowUp.pending(m) : []), shop.merchant);
    check(gaps.length === 0, `counting float − 150 closes without a gap (${JSON.stringify(gaps.map((g) => g.gapCents))})`);
  });
} finally { await S.finish(); await browser.close(); server.close(); }
console.log(`✓ boutique-cash-move-browser · ${checks} checks`);
