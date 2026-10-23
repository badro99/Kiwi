#!/usr/bin/env node
/* till-autre-frame-test · the "other trade" till on the shared frame (stage 4
 * (15), §18.3 "Business-type tills": the same frame, the trade-specific part
 * in the menu pane), behind kiwiSkin2027:till, in kiwi-caisse.html through
 * KiwiPosDispatch.unlockById('autre'), in a real Chromium.
 *
 *   node tools/till-autre-frame-test.mjs
 *
 * What it holds:
 *   · flag off: the shipped .ot-app, no kit element in the trade's root;
 *   · flag on: the trade's root holds <k-rail>, <k-menu-grid> and <k-bill>
 *     (the same KiwiTillFrame), the shipped .ot-app is not drawn;
 *   · the free-amount tile opens the shipped dialog; a catalogue tile adds a
 *     line; the bill is plain (no sent groups, no split or discount);
 *   · Take payment opens <k-pay> with no tip row; card confirms through the
 *     shipped KiwiPosSale.record with method carte and the cart's total, and
 *     the bill empties;
 *   · the rail's Day shows the shipped day view in the menu pane; the
 *     cashier button locks as the shipped Verrouiller does;
 *   · the restaurant's sync glue does not repaint the trade's rail;
 *   · no page error. */
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

async function openAutre(flag) {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
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
  await page.evaluateOnNewDocument((on) => {
    if (on) localStorage.setItem('kiwiSkin2027:till', '1');
    localStorage.setItem('kiwi:posAutre:catalog:demo-autre', JSON.stringify([{ id: 'a1', name: 'TEST KIWI · Article', price: 20 }]));
    try { Object.defineProperty(navigator.serviceWorker, 'register', { value: () => new Promise(() => {}), configurable: true }); } catch (_) {}
  }, flag);
  // coverage: surface=caisse-entry locale=fr viewport=desktop
  await page.goto(base + '/kiwi-caisse.html', { waitUntil: 'load' });
  await page.waitForFunction(() => !!window.KiwiPosDispatch, { timeout: 30000 });
  if (flag) await page.waitForFunction(() => document.documentElement.hasAttribute('data-k-till'), { timeout: 30000 });
  await page.evaluate(() => window.KiwiPosDispatch.unlockById('autre'));
  await page.waitForFunction(() => !!document.querySelector('.ot-app, .ot-k'), { timeout: 20000 });
  await sleep(500);
  return { ctx, page, errors };
}

console.log('till-autre-frame-test');
try {
  {
    const { ctx, page, errors } = await openAutre(false);
    const off = await page.evaluate(() => ({ app: !!document.querySelector('.ot-app'), kit: !!document.querySelector('.ot-app k-rail, .ot-app k-bill, .ot-k') }));
    check(off.app && !off.kit, 'flag off: the shipped .ot-app, no kit element');
    check(errors.length === 0, 'flag off: no page error' + (errors.length ? ' · ' + errors.join(' | ') : ''));
    await ctx.close();
  }

  const { ctx, page, errors } = await openAutre(true);
  const on = await page.evaluate(() => {
    const k = document.querySelector('.ot-k');
    return { k: !!k, app: !!document.querySelector('.ot-app'), rail: !!(k && k.querySelector('.ot-k-rail > k-rail')), grid: !!(k && k.querySelector('.ot-k-menu > k-menu-grid')), bill: !!(k && k.querySelector('.ot-k-bill > k-bill')),
      visible: !!(k && k.offsetParent !== null) };
  });
  check(on.k && on.visible && !on.app, 'flag on: the trade\'s root draws the kit frame, not the shipped .ot-app');
  check(on.rail && on.grid && on.bill, 'the same KiwiTillFrame: <k-rail>, <k-menu-grid>, <k-bill>');

  const grid = () => '.ot-k k-menu-grid';
  const tiles = await page.evaluate((g) => [...document.querySelector(g).shadowRoot.querySelectorAll('[data-item]')].map((b) => b.getAttribute('data-item')), grid());
  check(tiles[0] === '__libre' && tiles.includes('a1'), `the free-amount tile first, then the catalogue (${tiles.join(', ')})`);
  const tap = (id) => page.evaluate((g, i) => {
    const b = document.querySelector(g).shadowRoot.querySelector(`[data-item="${CSS.escape(i)}"]`);
    b.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, composed: true }));
    b.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, composed: true }));
    b.click();
  }, grid(), id);

  await tap('__libre');
  await sleep(200);
  check(await page.evaluate(() => !!document.querySelector('.ot-k ~ .ot-modal, .ot-modal[role="dialog"]')), 'the free-amount tile opens the shipped dialog');
  await page.type('[data-ot-amount]', '12,5');
  await page.click('[data-ot-confirm]');
  await sleep(200);
  await tap('a1');
  await sleep(200);
  const bill = await page.evaluate(() => {
    const b = document.querySelector('.ot-k k-bill');
    const R = b.shadowRoot;
    return { lines: R.querySelectorAll('[data-line]').length, total: b.bill.total, groups: R.querySelectorAll('.gh').length,
      split: !!R.querySelector('[data-w="split"]'), discount: !!R.querySelector('[data-w="discount"]'), pay: !!R.querySelector('[data-w="pay"]') };
  });
  check(bill.lines === 2 && Math.abs(bill.total - 32.5) < 0.005, `two lines on the bill, total 32.50 (${bill.lines}, ${bill.total})`);
  check(bill.groups === 0 && !bill.split && !bill.discount && bill.pay, 'the bill is plain: no sent groups, no split, no discount; Take payment');

  await page.evaluate(() => {
    window.__rec = [];
    const S = window.KiwiPosSale; const rec = S.record.bind(S);
    S.record = (v, s) => { window.__rec.push([v, s]); return rec(v, s); };
  });
  const press = (host, w) => page.evaluate((h, x) => {
    const el = document.querySelector(h).shadowRoot.querySelector(x);
    el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, composed: true }));
    el.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, composed: true }));
    el.click();
  }, host, w);
  await press('.ot-k k-bill', '[data-w="pay"]');
  await sleep(300);
  const pay = await page.evaluate(() => { const p = document.querySelector('.ot-k k-pay'); return { shown: !!p && !p.hidden, tip: !!p.shadowRoot.querySelector('[data-tip]') }; });
  check(pay.shown && !pay.tip, 'Take payment opens <k-pay> with no tip row');
  await press('.ot-k k-pay', '[data-method="card"]');
  await sleep(150);
  await press('.ot-k k-pay', '[data-w="confirm"]');
  await sleep(300);
  const rec = await page.evaluate(() => window.__rec.slice());
  check(rec.length === 1 && rec[0][0] === 'autre' && rec[0][1].method === 'carte' && Math.abs(rec[0][1].total - 32.5) < 0.005,
    `card confirms through the shipped KiwiPosSale.record (${JSON.stringify(rec[0] && { trade: rec[0][0], method: rec[0][1].method, total: rec[0][1].total })})`);
  await sleep(1400);
  check(await page.evaluate(() => document.querySelector('.ot-k k-bill').bill.lines.length === 0 && document.querySelector('.ot-k k-pay').hidden), 'the bill empties and the payment pane closes');

  /* The restaurant's sync glue must not repaint the trade's rail. */
  await page.evaluate(() => { window.dispatchEvent(new CustomEvent('kiwi:sale-queue')); window.dispatchEvent(new Event('online')); });
  await sleep(300);
  const items = await page.evaluate(() => document.querySelector('.ot-k k-rail').items.map((i) => i.id).join(','));
  check(items === 'sale,work,day', `the restaurant's sync glue leaves the trade's rail alone (${items})`);

  await page.evaluate(() => document.querySelector('.ot-k k-rail').shadowRoot.querySelector('[data-id="day"]').click());
  await sleep(300);
  const day = await page.evaluate(() => ({ day: !document.querySelector('.ot-k-day').hidden && !!document.querySelector('.ot-k-day .ot-day'), menu: document.querySelector('.ot-k-menu').hidden }));
  check(day.day && day.menu, 'the rail\'s Day shows the shipped day view in the menu pane');
  await page.evaluate(() => { window.__locked = 0; window.KiwiPosDispatch.lock = () => { window.__locked++; }; document.querySelector('.ot-k k-rail').shadowRoot.querySelector('[data-r="cashier"]').click(); });
  await sleep(150);
  check(await page.evaluate(() => window.__locked === 1), 'the cashier button locks, as the shipped Verrouiller does');
  check(errors.length === 0, 'no page error' + (errors.length ? ' · ' + errors.join(' | ') : ''));
  await ctx.close();
} finally {
  await browser.close().catch(() => {});
  server.closeAllConnections();
  await new Promise((r) => server.close(r));
}
console.log(`✓ till-autre-frame-test · ${checks} checks`);
