#!/usr/bin/env node
/* r21 sync#A2: the sales outbox on REAL IndexedDB in a real browser (assets/offline-db.js over Dexie), not a harness.
 *   - a row claimed for sending when the page is killed is still there after the reload, held by its lease, and
 *     is re-sent under the same id once the lease lapses (idempotent replay, nothing lost, nothing duplicated);
 *   - a transaction cut off before it commits (raw IDB abort on the same database, and a long write chain cut
 *     by a reload) leaves the committed rows exactly as they were: all or nothing.
 * It does not prove an OS-level kill or a full disk: Chromium's IndexedDB is the real engine, the interruption is
 * an abort or a page unload. */
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { suite } from './browser-trace.mjs';

const root = process.env.KIWI_ROOT || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let puppeteer;
try { puppeteer = createRequire(path.join(root, 'app/package.json'))('puppeteer-core'); }
catch { console.log('○ skip: puppeteer-core unavailable'); process.exit(process.env.CI ? 1 : 0); }
const bin = process.env.KIWI_CHROMIUM_BIN || ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/chromium', '/usr/bin/google-chrome'].find(fs.existsSync);
if (!bin) { console.log('○ skip: Chromium unavailable'); process.exit(process.env.CI ? 1 : 0); }

const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.json': 'application/json', '.png': 'image/png', '.webp': 'image/webp', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json' };
const server = http.createServer((rq, res) => {
  const pathname = decodeURIComponent(new URL(rq.url, 'http://local').pathname);
  const p = path.resolve(root, '.' + pathname);
  if (!p.startsWith(root + path.sep)) { res.writeHead(403); res.end(); return; }
  fs.readFile(p, (err, data) => { res.writeHead(err ? 404 : 200, { 'Content-Type': mime[path.extname(p)] || 'application/octet-stream' }); res.end(err ? '' : data); });
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await puppeteer.launch({ executablePath: bin, headless: true, args: ['--no-sandbox', '--lang=fr-FR', '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1'] });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));


const S = suite('offline-db-reload', { browser });
const TENANT = 'r21-sync-shop', CH = 'sale';
async function open(t) {
  const ctx = await browser.createBrowserContext();
  t.defer(() => ctx.close());
  const page = t.watch(await ctx.newPage());
  await page.setRequestInterception(true);
  page.on('request', (r) => {
    const u = r.url();
    if (u === base + '/__blank.html') return r.respond({ status: 200, contentType: 'text/html', body: '<!doctype html><meta charset="utf-8"><title>idb</title><script src="/assets/vendor/dexie.min.js"></script><script src="/assets/offline-db.js"></script>' });
    return u.startsWith(base) ? r.continue() : r.abort();
  });
  await page.goto(base + '/__blank.html', { waitUntil: 'load' });
  await page.waitForFunction(() => window.KiwiOffline && window.KiwiOffline.ready, { timeout: 10000 });
  assert(await page.evaluate(() => window.KiwiOffline.ready()), 'IndexedDB opened');
  return page;
}
async function reload(page) {
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => window.KiwiOffline && window.KiwiOffline.ready, { timeout: 10000 });
  await page.evaluate(() => window.KiwiOffline.ready());
}
const ids = (page) => page.evaluate((c, t) => window.KiwiOffline.list(c, t).then((rows) => rows.map((r) => r.id).sort()), CH, TENANT);
const assert = (yes, msg) => { if (!yes) throw new Error(msg); console.log('  ✓ ' + msg); };

await S.run('une vente réclamée pour envoi survit au rechargement et repart sous le même identifiant', async (t) => {
  const page = await open(t);
  t.step('enqueue two sales, claim one for sending, kill the page before the acknowledgement');
  await page.evaluate((c, t0) => Promise.all([window.KiwiOffline.enqueue(c, t0, { id: 'sale-a', cents: 1000 }), window.KiwiOffline.enqueue(c, t0, { id: 'sale-b', cents: 2000 })]), CH, TENANT);
  const claimed = await page.evaluate((c, t0) => window.KiwiOffline.claim(c, t0).then((r) => r && { id: r.id, lease: r.leaseToken }), CH, TENANT);
  assert(claimed && claimed.id === 'sale-a', 'the oldest sale is claimed for sending');
  await reload(page);
  assert((await ids(page)).join() === 'sale-a,sale-b', 'after the reload both sales are still queued (nothing lost)');
  const during = await page.evaluate((c, t0) => window.KiwiOffline.claim(c, t0).then((r) => r && r.id), CH, TENANT);
  assert(during === 'sale-b', 'the half-sent sale is held by its lease, the other one goes next');
  t.step('a forced reclaim (what a lapsed lease allows) takes the same sale again, under the same id');
  const again = await page.evaluate((c, t0) => window.KiwiOffline.claim(c, t0, { force: true }).then((r) => r && r.id), CH, TENANT);
  assert(again === 'sale-a', 'the interrupted sale is replayed under its own id');
  const lease = await page.evaluate((c, t0) => window.KiwiOffline.list(c, t0).then((rows) => rows.find((r) => r.id === 'sale-a').leaseToken), CH, TENANT);
  assert(await page.evaluate((l) => window.KiwiOffline.acknowledge('sale-a', l), lease), 'its acknowledgement removes it once');
  assert((await ids(page)).join() === 'sale-b', 'exactly the unsent sale remains');
});

await S.run('une transaction coupée avant son commit laisse les ventes validées intactes', async (t) => {
  const page = await open(t);
  await page.evaluate((c, t0) => Promise.all(['k1', 'k2', 'k3'].map((id) => window.KiwiOffline.enqueue(c, t0, { id, cents: 500 }))), CH, TENANT);
  t.step('delete a sale and add another in a raw transaction on the same database, then abort it');
  const aborted = await page.evaluate(() => new Promise((resolve) => {
    const open = indexedDB.open('kiwi-runtime-v1');
    open.onsuccess = () => {
      const db = open.result, tx = db.transaction('outbox', 'readwrite'), store = tx.objectStore('outbox');
      store.delete('k2'); store.add({ id: 'ghost', tenant: 'r21-sync-shop', channel: 'sale', state: 'pending', createdAt: 1, nextAt: 1, leaseUntil: 0, updatedAt: 1, payload: {} });
      tx.onabort = () => { db.close(); resolve(true); }; tx.oncomplete = () => { db.close(); resolve(false); };
      tx.abort();
    };
  }));
  assert(aborted, 'the raw transaction was aborted, not committed');
  await reload(page);
  assert((await ids(page)).join() === 'k1,k2,k3', 'after the reload the committed sales are exactly as before: none lost, no ghost row');
  t.step('a long write chain cut by a page reload commits all or nothing');
  const before = (await ids(page)).length;
  page.evaluate(() => {
    const open = indexedDB.open('kiwi-runtime-v1');
    open.onsuccess = () => {
      const db = open.result, tx = db.transaction('outbox', 'readwrite'), store = tx.objectStore('outbox');
      let i = 0;
      (function put() { if (i >= 20000) return; store.add({ id: 'bulk-' + i, tenant: 'r21-sync-shop', channel: 'sale', state: 'pending', createdAt: 5, nextAt: 5, leaseUntil: 0, updatedAt: 5, payload: { n: i } }); i++; const r = store.get('k1'); r.onsuccess = put; })();
    };
    setTimeout(() => location.reload(), 30);
  }).catch(() => {});
  await sleep(1500);
  await page.waitForFunction(() => window.KiwiOffline && window.KiwiOffline.ready, { timeout: 10000 });
  await page.evaluate(() => window.KiwiOffline.ready());
  const after = (await ids(page)).length;
  assert(after === before || after === before + 20000, 'the interrupted chain is atomic: ' + before + ' rows before, ' + after + ' after (all or nothing)');
  assert((await ids(page)).filter((id) => !id.startsWith('bulk-')).join() === 'k1,k2,k3', 'and the original sales are untouched either way');
});

await S.finish();
server.close();
