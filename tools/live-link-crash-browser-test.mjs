#!/usr/bin/env node
/* tools/live-link-crash-browser-test.mjs · a sale the till accepted survives a
 * killed tab.
 *
 * The outbox suites prove recovery with the page alive. A till on a tablet
 * is also killed: the OS reclaims the tab, the browser crashes, the cashier
 * swipes the app away. This suite crashes the real Chromium renderer (CDP
 * SIGKILL of its process, no unload, no beforeunload) at the two moments that matter, then
 * opens the till again in the same browser profile:
 *   K1  right after postSale() accepted an offline sale;
 *   K2  while the replay POST is in flight (the server took it, the answer is lost).
 * After the restart the network is back: every accepted sale reaches the
 * server, with its original id, and none is counted twice.
 *
 * Real assets/offline-db.js, live-link.js and Dexie; only fetch is a double. */
import fs from 'node:fs';
import http from 'node:http';
import { createRequire } from 'node:module';

const require = createRequire(new URL('../app/package.json', import.meta.url));
let puppeteer;
const cands = [process.env.KIWI_CHROMIUM_BIN, process.env.CHROME_BIN];
try {
  const os = require('node:os'), path = require('node:path');
  const cache = path.join(os.homedir(), '.cache', 'puppeteer', 'chrome');
  for (const v of fs.readdirSync(cache)) cands.push(path.join(cache, v, 'chrome-mac-arm64', 'Google Chrome for Testing.app', 'Contents', 'MacOS', 'Google Chrome for Testing'), path.join(cache, v, 'chrome-linux64', 'chrome'));
} catch (_) {}
cands.push('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome');
const bin = cands.find((p) => p && fs.existsSync(p));
try { puppeteer = require('puppeteer-core'); } catch (_) {}
if (!puppeteer || !bin) {
  console.log('○ live-link crash test skipped: Chromium or puppeteer-core unavailable');
  process.exit(process.env.CI ? 1 : 0);
}

const TENANT = 'crash-test-' + Date.now();
const PAGE = `<!doctype html><meta charset="utf-8"><title>crash</title>
<script>
  window.KiwiEnv = { isReal: function () { return true; } };
  localStorage.setItem('kiwiLive', '1');
  localStorage.setItem('kiwiPairedVenue', JSON.stringify({ merchant: ${JSON.stringify(TENANT)} }));
  window.__mode = new URLSearchParams(location.search).get('net') || 'fail';
  window.__posts = [];
  var realFetch = window.fetch.bind(window);
  window.fetch = function (url, opts) {
    if (url === '/api/sale') {
      var body = JSON.parse(opts.body);
      window.__posts.push(body);
      if (window.__mode === 'ok') return realFetch('/record', { method: 'POST', body: opts.body }).then(function () {
        return new Response(JSON.stringify({ ok: true, id: body.id }), { status: 201 });
      });
      if (window.__mode === 'hang') return realFetch('/record', { method: 'POST', body: opts.body }).then(function () { return new Promise(function () {}); });
      return Promise.reject(new Error('offline'));
    }
    return Promise.resolve(new Response(JSON.stringify({ sales: [], voided: [] }), { status: 200 }));
  };
</script>
<script src="/assets/vendor/dexie.min.js"></script>
<script src="/assets/offline-db.js"></script>
<script src="/assets/live-link.js"></script>`;

/* The server is the till's backend: it counts what actually arrived. */
const received = [];
const files = {
  '/assets/vendor/dexie.min.js': new URL('../assets/vendor/dexie.min.js', import.meta.url),
  '/assets/offline-db.js': new URL('../assets/offline-db.js', import.meta.url),
  '/assets/live-link.js': new URL('../assets/live-link.js', import.meta.url),
};
const server = http.createServer((req, res) => {
  const p = new URL(req.url, 'http://x').pathname;
  if (p === '/test') { res.setHeader('Content-Type', 'text/html'); res.end(PAGE); return; }
  if (p === '/record') { let b = ''; req.on('data', (c) => { b += c; }); req.on('end', () => { received.push(JSON.parse(b)); res.end('{}'); }); return; }
  const f = files[p];
  if (!f) { res.writeHead(404); res.end(); return; }
  res.setHeader('Content-Type', 'application/javascript');
  res.end(fs.readFileSync(f));
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const origin = `http://127.0.0.1:${server.address().port}`;

let checks = 0;
const ok = (v, label) => { if (!v) throw new Error(label); checks++; console.log('  ✓ ' + label); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function open(browser, net) {
  console.log("  … open " + net);
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.log('  page error:', e.message));
  await page.goto(`${origin}/test?net=${net}`);
  await page.waitForFunction(() => window.KiwiOffline && window.KiwiLive);
  await page.evaluate(() => KiwiOffline.ready());
  return page;
}
/* SIGKILL the renderer process, the way the OS reclaims a tab: no unload, no
 * flush. The browser process (and the profile's IndexedDB) stays up. */
async function crash(page) {
  const cdp = await page.browser().target().createCDPSession();
  const { processInfo } = await cdp.send('SystemInfo.getProcessInfo');
  const renderers = processInfo.filter((p) => p.type === 'renderer').map((p) => p.id);
  if (!renderers.length) throw new Error('no renderer process to kill');
  for (const pid of renderers) { try { process.kill(pid, 'SIGKILL'); } catch (_) {} }
  await sleep(500);
  await page.close().catch(() => {});
}
async function drained(page, ms = 20000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    const total = await page.evaluate((t) => KiwiOffline.stats('sale', t).then((s) => s.total), TENANT);
    if (total === 0) return true;
    await page.evaluate(() => { window.dispatchEvent(new Event('online')); return KiwiLive.flush(true); }).catch(() => {});
    await sleep(250);
  }
  return false;
}

let browser, failed = false;
try {
  browser = await puppeteer.launch({ executablePath: bin, headless: true, args: ['--no-sandbox'] });

  /* K1 · accepted offline, then the tab dies at once. */
  let page = await open(browser, 'fail');
  const accepted = await page.evaluate(() => {
    const r = KiwiLive.postSale({ amount: 87.5, method: 'cash', label: 'Crash K1', ref: 'K1-' + Date.now() });
    return { ok: !!(r && r.ok), id: r && r.id, durable: r && r.durable };
  });
  ok(accepted.ok && accepted.id, 'K1: the till accepted the sale offline (' + accepted.durable + ')');
  await crash(page);
  page = await open(browser, 'ok');
  ok(await drained(page), 'K1: after the crash and a reconnect the queue drains');
  const k1 = received.filter((b) => b.id === accepted.id);
  ok(k1.length >= 1, 'K1: the accepted sale reached the server after the tab was killed');
  ok(k1.every((b) => Math.round(Number(b.amount) * 100) === 8750 || b.amountCents === 8750), 'K1: with its amount to the centime');
  await page.close();

  /* K2 · the replay POST is in flight when the tab dies: the server has it,
   *      the till never heard back. The next replay must reuse the same id. */
  page = await open(browser, 'fail');
  const second = await page.evaluate(() => {
    const r = KiwiLive.postSale({ amount: 12.3, method: 'card', label: 'Crash K2', ref: 'K2-' + Date.now() });
    return { ok: !!(r && r.ok), id: r && r.id };
  });
  ok(second.ok, 'K2: second sale accepted offline');
  await page.waitForFunction((t) => KiwiOffline.stats('sale', t).then((s) => s.pending >= 1), {}, TENANT);
  await page.evaluate(() => { window.__mode = 'hang'; window.dispatchEvent(new Event('online')); return Promise.race([KiwiLive.flush(true), new Promise((r) => setTimeout(r, 1500))]); });
  const t0 = Date.now();
  while (!received.some((b) => b.id === second.id) && Date.now() - t0 < 10000) await sleep(100);
  ok(received.some((b) => b.id === second.id), 'K2: the server received the replay before the tab died');
  await crash(page);
  page = await open(browser, 'ok');
  ok(await drained(page), 'K2: after the restart the queue drains');
  const ids = new Set(received.filter((b) => b.id === second.id).map((b) => b.id));
  ok(ids.size === 1, 'K2: every arrival of that sale carries one id, so the server counts it once');
  await page.close();
} catch (e) {
  failed = true;
  console.error('✗ ' + (e && e.message || e));
} finally {
  if (browser) await browser.close().catch(() => {});
  await new Promise((r) => server.close(r));
}
if (failed) process.exit(1);
console.log(`live-link crash: ${checks} checks (tab killed after acceptance and during replay, sale arrives once with its id)`);
