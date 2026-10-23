#!/usr/bin/env node
/* banner-announce-test · what the till's sync rows say aloud, and how often
 * (stage 4, §10.12, §10.26, §16, §21.1 row 4), behind kiwiSkin2027:till, on
 * the demo till in a real Chromium. Live Link's queue status is stubbed to
 * walk the rows; a MutationObserver counts every write into the regions.
 *
 *   node tools/banner-announce-test.mjs
 *
 * What it holds:
 *   · both regions are in the DOM, empty, before any text: the banner's
 *     (danger: role="alert") and the polite one (role="status");
 *   · a banner that appears on its own (the autosave tick) is written once,
 *     and ten more ticks write nothing;
 *   · sync.saved_again is written once, politely, when the last of rows 1
 *     and 2 clears;
 *   · blocked 0 → 2 → 3 writes sync.blocked once (at 2), nothing at 3;
 *   · refused sales 0 → 1 → 2 write sync.not_synced once;
 *   · a row that clears and applies again is written again;
 *   · rows 5 to 9 never announce;
 *   · under the store lock neither region is written while the outbox
 *     changes (R7). */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

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

console.log('banner-announce-test');
try {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.setViewport({ width: 1366, height: 1024 });
  await page.setBypassServiceWorker(true);
  await page.setRequestInterception(true);
  page.on('request', (r) => {
    const u = r.url();
    if (u.startsWith(base + '/api/')) return r.respond({ status: 503, contentType: 'application/json', body: '{"error":"offline"}' });
    return u.startsWith(base) || u.startsWith('data:') ? r.continue() : r.abort();
  });
  await page.evaluateOnNewDocument(() => {
    localStorage.setItem('kiwiSkin2027:till', '1');
    try { Object.defineProperty(navigator.serviceWorker, 'register', { value: () => new Promise(() => {}), configurable: true }); } catch (_) {}
  });
  // coverage: surface=caisse-entry locale=fr viewport=desktop
  await page.goto(base + '/kiwi-caisse.html', { waitUntil: 'load' });
  await page.waitForFunction(() => typeof doOpenService === 'function' && document.documentElement.hasAttribute('data-k-till'), { timeout: 30000 });
  await page.evaluate(() => doOpenService());
  await page.waitForFunction(() => document.body.classList.contains('is-unlocked'), { timeout: 20000 });
  await sleep(300);

  /* The regions, before any text; then the stubs and the observers. */
  const regions = await page.evaluate(() => {
    const banner = document.querySelector('#kit-sync-banner');
    const slot = banner && banner.shadowRoot.querySelector('.slot');
    const say = document.querySelector('#kit-sync-say');
    return { slot: !!slot, slotRole: slot && slot.getAttribute('role'), slotEmpty: slot && !slot.textContent.trim(), say: !!say, sayRole: say && say.getAttribute('role'), sayEmpty: say && !say.textContent.trim() };
  });
  check(regions.slot && regions.slotRole === 'alert' && regions.slotEmpty, 'the banner\'s region (role="alert") is in the DOM, empty, before any text');
  check(regions.say && regions.sayRole === 'status' && regions.sayEmpty, 'the polite region (role="status") is in the DOM, empty, before any text');

  await page.evaluate(() => {
    const L = window.KiwiLive;
    journal.forEach((e) => { if (!e) return; delete e.saleSyncError; delete e.saleSyncPending; delete e.saleHeldLocal; e.serverSaleId = e.serverSaleId || ('srv-' + e.id); });
    window.__q = { pending: 0, sending: 0, blocked: 0, total: 0, storageError: false };
    window.__lock = false;
    L.isOn = () => true;
    L.merchant = () => 'test-kiwi-store';
    L.queueStatus = () => Object.assign({}, window.__q);
    window.KiwiTillTenant = Object.assign(window.KiwiTillTenant || {}, { mismatch: () => window.__lock });
    persistShift();
    window.__writes = { banner: [], say: [] };
    const slot = document.querySelector('#kit-sync-banner').shadowRoot.querySelector('.slot');
    const say = document.querySelector('#kit-sync-say');
    new MutationObserver(() => { const t = slot.textContent.trim(); if (t) window.__writes.banner.push(t); }).observe(slot, { childList: true, subtree: true, characterData: true });
    new MutationObserver(() => { const t = say.textContent.trim(); if (t) window.__writes.say.push(t); }).observe(say, { childList: true, subtree: true, characterData: true });
  });
  const tick = (n = 1) => page.evaluate((k) => { for (let i = 0; i < k; i++) persistShift(); }, n);
  const writes = () => page.evaluate(() => ({ banner: window.__writes.banner.slice(), say: window.__writes.say.slice() }));
  const reset = () => page.evaluate(() => { window.__writes.banner.length = 0; window.__writes.say.length = 0; });
  const text = (k, a) => page.evaluate((key, args) => KiwiKit.t(key, args).replace(/[⁦-⁩]/g, ''), k, a || {});

  /* Row 1, appearing on its own at an autosave tick. */
  await page.evaluate(() => { window.__q.storageError = true; });
  await tick(); await sleep(150);
  await tick(10); await sleep(300);
  let w = await writes();
  const storage = await text('sync.storage_error');
  check(w.banner.length === 1 && w.banner[0].indexOf(storage) >= 0, `the storage banner is written once, and ten more ticks write nothing (${w.banner.length})`);
  await reset();
  await page.evaluate(() => { window.__q.storageError = false; });
  await tick(); await sleep(300);
  w = await writes();
  const again = await text('sync.saved_again');
  check(w.say.length === 1 && w.say[0] === again, `sync.saved_again is written once, politely, when the last of rows 1 and 2 clears (${w.say.length})`);

  /* Row 3: blocked 0 → 2 → 3. */
  await reset();
  await page.evaluate(() => { window.__q.blocked = 2; });
  await tick(); await sleep(200);
  await page.evaluate(() => { window.__q.blocked = 3; });
  await tick(3); await sleep(300);
  w = await writes();
  check(w.say.length === 1 && w.say[0] === await text('sync.blocked', { n: 2 }), `blocked 0 → 2 → 3 writes sync.blocked once, at 2 (${w.say.length})`);
  await page.evaluate(() => { window.__q.blocked = 0; });
  await tick(); await sleep(200);

  /* Row 4: refused sales 0 → 1 → 2. */
  await reset();
  const refuse = (k) => page.evaluate((n) => {
    const sales = journal.filter((e) => e && e.kind !== 'refund' && !e.origin);
    sales.slice(-n).forEach((e) => { e.saleSyncError = 'sale-sync-unavailable'; e.saleSyncPending = true; e.merchant = 'test-kiwi-store'; });
  }, k);
  await refuse(1); await tick(); await sleep(200);
  await refuse(2); await tick(3); await sleep(300);
  w = await writes();
  check(w.say.length === 1 && w.say[0] === await text('sync.not_synced', { n: 1 }), `refused sales 0 → 1 → 2 write sync.not_synced once (${w.say.length})`);

  /* Cleared, then again: written again. */
  await page.evaluate(() => { journal.forEach((e) => { if (e) delete e.saleSyncError; }); });
  await tick(); await sleep(200);
  await reset();
  await refuse(1); await tick(); await sleep(300);
  w = await writes();
  check(w.say.length === 1, `a row that clears and applies again is written again (${w.say.length})`);
  await page.evaluate(() => { journal.forEach((e) => { if (e) { delete e.saleSyncError; delete e.saleSyncPending; } }); });
  await tick(); await sleep(200);

  /* Rows 5 to 9 never announce. */
  await reset();
  await page.evaluate(() => { window.__q.sending = 2; window.__q.total = 2; });
  await tick(); await sleep(200);
  await page.evaluate(() => { window.__q.sending = 0; window.__q.total = 0; });
  await tick(); await sleep(300);
  w = await writes();
  check(w.say.length === 0 && w.banner.length === 0, `rows 5 to 9 (sending, then all sent) never announce (${w.say.length + w.banner.length})`);

  /* Store lock: nothing written while the outbox changes. */
  await reset();
  await page.evaluate(() => { window.__lock = true; window.__q.storageError = true; window.__q.blocked = 4; });
  await tick(3); await sleep(300);
  w = await writes();
  check(w.say.length === 0 && w.banner.length === 0, 'under the store lock, neither region is written while the outbox changes (R7)');
  check(errors.length === 0, 'no page error' + (errors.length ? ' · ' + errors.join(' | ') : ''));
} finally {
  await browser.close().catch(() => {});
  server.closeAllConnections();
  await new Promise((r) => server.close(r));
}
console.log(`✓ banner-announce-test · ${checks} checks`);
