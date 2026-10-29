#!/usr/bin/env node
/* Kiwi · boutique-operator-entry-browser-test · God Mode enters a boutique till
 * without the opening-float screen and without opening a shift.
 *
 * Owner, 29 October, on Santos Store: opening the till from the operator
 * console showed « Fond d'ouverture · Ouvrir la caisse ». The operator looks
 * at the till; he does not run a shift, and a float he typed would be written
 * into the merchant's books. The restaurant till already had its operator path
 * (caisse-support-entry-test); the boutique and Maison tills did not.
 *
 *   A · /api/me proves a named-operator session scoped to this store → no
 *       float screen, no shift stored.
 *   B · the same link with an /api/me that does NOT prove it → the float
 *       screen, as for any staff.
 *   C · a plain paired load in the same tab after A → the float screen again:
 *       the operator view does not outlive the operator entry.
 * Local server, no real store, no code typed.
 *   node tools/boutique-operator-entry-browser-test.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const root = process.env.KIWI_ROOT || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let puppeteer;
try { puppeteer = createRequire(path.join(root, 'app/package.json'))('puppeteer-core'); }
catch { console.log('○ skip: puppeteer-core unavailable'); process.exit(process.env.CI ? 1 : 0); }
const bin = process.env.KIWI_CHROMIUM_BIN || ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/chromium', '/usr/bin/google-chrome'].find(fs.existsSync);
if (!bin) { console.log('○ skip: Chromium unavailable'); process.exit(process.env.CI ? 1 : 0); }

const MERCHANT = 'operator-boutique-test';
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.json': 'application/json', '.png': 'image/png', '.webp': 'image/webp' };
const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://local');
  const p = path.resolve(root, '.' + decodeURIComponent(u.pathname));
  if (!p.startsWith(root + path.sep)) { res.writeHead(403); res.end(); return; }
  fs.readFile(p, (err, data) => { res.writeHead(err ? 404 : 200, { 'Content-Type': mime[path.extname(p)] || 'application/octet-stream' }); res.end(err ? '' : data); });
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await puppeteer.launch({ executablePath: bin, headless: true, args: ['--no-sandbox'] });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let n = 0, bad = 0;
const ok = (cond, msg, detail) => { if (cond) { n++; console.log('  ✓ ' + msg); } else { bad++; console.log('  ✗ ' + msg + (detail ? ' · ' + detail : '')); } };

const venue = { merchant: MERCHANT, type: 'boutique', name: 'Operator Boutique', location: 'Casablanca' };
async function tab(me) {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.setViewport({ width: 1366, height: 900 });
  await page.setBypassServiceWorker(true);
  await page.setRequestInterception(true);
  page.on('request', (r) => {
    const u = r.url();
    if (!u.startsWith(base)) return u.startsWith('data:') ? r.continue() : r.abort();
    const url = new URL(u);
    if (url.pathname === '/api/me') return r.respond({ status: 200, contentType: 'application/json', body: JSON.stringify(me) });
    if (url.pathname.startsWith('/api/')) return r.respond({ status: 404, contentType: 'application/json', body: '{"error":"not-found"}' });
    return r.continue();
  });
  return { ctx, page, errors };
}
/* The console's hand-off: a paired venue and the operator ticket, then the link it opens. */
async function enterAsOperator(page) {
  await page.goto(base + '/kiwi-caisse.html?__blank', { waitUntil: 'domcontentloaded' });
  await page.evaluate((v) => {
    localStorage.clear(); sessionStorage.clear();
    localStorage.setItem('kiwiPaired', '1');
    localStorage.setItem('kiwiLiveMerchant', v.merchant);
    localStorage.setItem('kiwiPairedVenue', JSON.stringify(v));
    localStorage.setItem('kiwiPairHandoff', JSON.stringify(Object.assign({ operator: true, ts: Date.now() }, v)));
  }, venue);
  await page.goto(base + '/kiwi-caisse.html?pair=1&op=1&direct=1&merchant=' + MERCHANT, { waitUntil: 'load' });
}
const state = (page) => page.evaluate(() => {
  const ci = document.getElementById('bq-clockin');
  return {
    on: !!document.querySelector('#pos-boutique.is-on'),
    clockin: !!(ci && ci.classList.contains('is-visible')),
    shift: localStorage.getItem('kiwi:bqShift'),
    flag: sessionStorage.getItem('kiwi:tillOperator:v1'),
  };
});
async function settle(page) {
  await page.waitForFunction(() => !!document.querySelector('#pos-boutique.is-on'), { timeout: 30000 }).catch(() => {});
  await sleep(2500);   // the float screen, when it comes, comes with the first show
}

try {
  console.log('■ A · God Mode, proven by /api/me');
  const A = await tab({ operator: true, scoped: true, slug: MERCHANT });
  await enterAsOperator(A.page);
  await settle(A.page);
  let s = await state(A.page);
  ok(s.on, 'the boutique till is on screen', JSON.stringify(s));
  ok(!s.clockin, 'no opening-float screen', JSON.stringify(s));
  ok(s.shift === null, 'no shift stored for the merchant', String(s.shift));
  ok(s.flag === MERCHANT, 'the operator view is scoped to this store', String(s.flag));

  console.log('■ C · a plain paired load in the same tab');
  await A.page.goto(base + '/kiwi-caisse.html', { waitUntil: 'load' });
  await settle(A.page);
  s = await state(A.page);
  ok(s.clockin, 'the float screen is back for a staff entry', JSON.stringify(s));
  ok(s.flag === null, 'the operator view was cleared', String(s.flag));
  ok(A.errors.length === 0, 'no page error', A.errors.slice(0, 3).join(' | '));
  await A.ctx.close();

  console.log('■ B · the same link, /api/me does not prove an operator');
  const B = await tab({ operator: false });
  await enterAsOperator(B.page);
  await settle(B.page);
  s = await state(B.page);
  ok(s.clockin, 'the float screen shows, as for any staff', JSON.stringify(s));
  ok(s.flag === null, 'no operator view without proof', String(s.flag));
  await B.ctx.close();
} finally {
  await browser.close().catch(() => {});
  server.close();
}
console.log(`\nboutique-operator-entry: ${n} passed, ${bad} failed`);
process.exit(bad ? 1 : 0);
