#!/usr/bin/env node
/* Kiwi · caisse-operator-reload-browser-test · the operator till follows the
 * store in the address, also after a reload.
 *
 * 19 nov. 2026 : depuis la console, l'opérateur ouvre la caisse de Browse
 * (kiwi-caisse?pair=1&op=1&merchant=browse) et voit « Santos Store · Saisissez
 * votre code », avec la liste des employés de Santos. L'ouverture opérateur
 * passe par un relais à usage unique (kiwiPairHandoff) : un lien recopié, un
 * onglet rechargé n'en ont plus, et la caisse démarrait le magasin appairé à
 * ce navigateur. L'opérateur pouvait saisir dans le mauvais commerce.
 *   E · reload of a proven operator tab → still the operator view of that store
 *       (proven again by /api/me, never by the address alone);
 *   F · op=1 for another store than the paired one, no hand-off → neither till
 *       opens; a notice names the store and sends back to the console; the
 *       pairing of this browser is untouched.
 *   node tools/caisse-operator-reload-browser-test.mjs
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

const MERCHANT = 'operator-restaurant-test';
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

const venue = { merchant: MERCHANT, type: 'restaurant', name: 'Operator Restaurant', location: 'Tanger' };
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
  const ci = document.getElementById('clockin-screen');
  const shown = (el) => !!(el && el.classList.contains('is-visible') && getComputedStyle(el).display !== 'none');
  return {
    on: document.body.classList.contains('is-unlocked'),
    clockin: shown(ci),
    shift: Object.keys(localStorage).filter((k) => /shift/i.test(k) && localStorage.getItem(k)).join(','),
    flag: sessionStorage.getItem('kiwi:tillOperator:v1'),
  };
});
async function settle(page) {
  await page.waitForFunction(() => document.body.classList.contains('is-unlocked')
    || !!document.querySelector('#clockin-screen.is-visible')
    || getComputedStyle(document.getElementById('pin-screen') || document.body).display !== 'none', { timeout: 30000 }).catch(() => {});
  await sleep(2500);   // the float screen, when it comes, comes after the dots animate
}

try {
  console.log('■ E · reload of a proven operator tab');
  const E = await tab({ operator: true, scoped: true, slug: MERCHANT });
  await enterAsOperator(E.page);
  await settle(E.page);
  let s = await state(E.page);
  ok(s.on && s.flag === MERCHANT, 'the operator view is open', JSON.stringify(s));
  await E.page.reload({ waitUntil: 'load' });
  await settle(E.page);
  s = await state(E.page);
  ok(s.on, 'after a reload, the till is still on screen', JSON.stringify(s));
  ok(s.flag === MERCHANT, 'still the operator view of this store', String(s.flag));
  ok(s.shift === '', 'no service stored for the merchant', String(s.shift));
  ok(E.errors.length === 0, 'no page error', E.errors.slice(0, 3).join(' | '));
  await E.ctx.close();

  console.log('■ F · op=1 for another store, no hand-off');
  const F = await tab({ operator: true, scoped: true, slug: MERCHANT });
  const other = { merchant: 'other-store-test', type: 'boutique', name: 'Other Store', location: 'Tanger' };
  await F.page.goto(base + '/kiwi-caisse.html?__blank', { waitUntil: 'domcontentloaded' });
  await F.page.evaluate((v) => {
    localStorage.clear(); sessionStorage.clear();
    localStorage.setItem('kiwiPaired', '1');
    localStorage.setItem('kiwiLiveMerchant', v.merchant);
    localStorage.setItem('kiwiPairedVenue', JSON.stringify(v));
  }, other);
  await F.page.goto(base + '/kiwi-caisse.html?pair=1&op=1&merchant=' + MERCHANT, { waitUntil: 'load' });
  await sleep(3000);
  const f = await F.page.evaluate(() => {
    const n = document.getElementById('op-link-stale');
    const pin = document.getElementById('pin-screen');
    return { on: document.body.classList.contains('is-unlocked'), notice: n && getComputedStyle(n).display !== 'none' ? n.innerText : '',
      href: n && n.querySelector('a') ? n.querySelector('a').getAttribute('href') : '',
      pin: !!(pin && getComputedStyle(pin).display !== 'none' && pin.getBoundingClientRect().height > 0),
      paired: localStorage.getItem('kiwiLiveMerchant') };
  });
  ok(!f.on, 'no till opens', JSON.stringify(f));
  ok(!f.pin, 'not even the code screen of the paired store', JSON.stringify(f));
  ok(f.notice.includes(MERCHANT), 'a notice names the store of the link', f.notice);
  ok(/kiwi-admin/.test(f.href), 'and leads back to the console', f.href);
  ok(f.paired === 'other-store-test', 'this browser stays paired to its own store', String(f.paired));
  ok(F.errors.length === 0, 'no page error', F.errors.slice(0, 3).join(' | '));
  await F.ctx.close();
} finally {
  await browser.close().catch(() => {});
  server.close();
}
console.log(`\ncaisse-operator-reload: ${n} passed, ${bad} failed`);
process.exit(bad ? 1 : 0);
