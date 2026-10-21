#!/usr/bin/env node
/* close-open-tables-browser-test · a till close never wipes a table that still owes money.
 *
 *   node tools/close-open-tables-browser-test.mjs
 *
 * Production, 14 October: at a real restaurant, table 2 had four orders sent
 * to the kitchen (131 MAD), never cashed, and the register was closed that
 * evening. The close cleared the saved shift and the bill with it, the server
 * stopped returning those orders after six hours, and the next day table 2
 * looked seated and empty; the cashier reset it. 131 MAD of food left the
 * books with no payment and no void, and nobody was told.
 *
 * On the demo till, by real clicks: open a free table, send two dishes, open
 * « Fin de service », type the drawer and the card Z, press « Fermer la
 * caisse ». The close must stop, name the table and its amount, keep the
 * shift; then, with « Fermer quand même » ticked, go through. The service is
 * opened by doOpenService() (the opening screen is not under test). No code
 * is typed. */
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

const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.json': 'application/json', '.png': 'image/png', '.webp': 'image/webp' };
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
const S = suite('close-open-tables', { browser });

try {
  await S.run('a close with a table still owing money', async (t) => {
    const ctx = await browser.createBrowserContext(); t.defer(() => ctx.close());
    const page = t.watch(await ctx.newPage());
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.setViewport({ width: 1180, height: 820 });
    await page.setBypassServiceWorker(true);
    await page.setRequestInterception(true);
    page.on('request', (r) => {
      const u = r.url();
      if (u.startsWith(base + '/api/')) return r.respond({ status: 503, contentType: 'application/json', body: '{"error":"offline"}' });
      return u.startsWith(base) || u.startsWith('data:') ? r.continue() : r.abort();
    });
    await page.evaluateOnNewDocument(() => { try { Object.defineProperty(navigator.serviceWorker, 'register', { value: () => new Promise(() => {}), configurable: true }); } catch (_) {} });
    page.setDefaultNavigationTimeout(60000);
    await page.goto(base + '/kiwi-caisse.html', { waitUntil: 'load' });
    await page.waitForFunction(() => typeof doOpenService === 'function', { timeout: 30000 });
    /* « Fermer la caisse » asks for a till operator first. The approval pad
       is not under test here (till-pin-browser-test owns it): the stand-in
       approves as the till's own pad would, so no code is typed. */
    await page.evaluate(() => {
      window.__approvals = [];
      window.KiwiTillPin = { approve: (o) => { window.__approvals.push(o.label); o.onApprove({ id: 'close-test', name: 'Test', role: 'manager' }); } };
      doOpenService();
    });
    await page.waitForFunction(() => document.body.classList.contains('is-unlocked') && mode === 'vrap', { timeout: 20000 });
    await sleep(400);

    t.step('open a free table and send two dishes');
    await page.click('.mode-pill[data-mode="salle"]');
    await page.waitForFunction(() => mode === 'salle', { timeout: 5000 });
    await sleep(300);
    const table = await page.evaluate(() => [...document.querySelectorAll('.cplan-tbl')]
      .filter((c) => c.offsetParent && tables[c.dataset.table] && tables[c.dataset.table].status === 'khawya'
        && !(tableOrders[c.dataset.table] || []).length)
      .map((c) => c.dataset.table)[0] || null);
    check(!!table, `a free table on the demo floor (table ${table})`);
    await page.click(`.cplan-tbl[data-table="${table}"]`);
    await page.waitForSelector('#new-table-modal.is-open', { timeout: 10000 });
    await page.click('#new-table-modal.is-open button:not(#nt-cancel):not(#nt-confirm)');
    await page.click('#nt-confirm');
    await page.waitForFunction(() => mode === 'order', { timeout: 10000 });
    await sleep(300);
    const dishes = await page.evaluate(() => [...document.querySelectorAll('.menu-item')]
      .filter((c) => c.offsetParent && !c.classList.contains('is-86'))
      .map((c) => c.dataset.menuId)
      .filter((id) => { const it = standaloneMenuItem(id); return it && !it.formula && !itemOptGroups(it).length; })
      .slice(0, 2));
    check(dishes.length === 2, 'two plain dishes on the demo menu');
    for (const id of dishes) { await page.click(`.menu-item[data-menu-id="${id}"]`); await sleep(150); }
    await page.click('#validate-order');
    await sleep(800);
    const owed = await page.evaluate((id) => (tableOrders[id] || []).filter((l) => l.sent || l.committed)
      .reduce((s, l) => s + l.price * l.qty, 0), table);
    check(owed > 0, `the table now owes ${owed} MAD, sent to the kitchen`);

    t.step('Fin de service, drawer and card Z typed, Fermer la caisse');
    await page.evaluate(() => { const b = document.querySelector('.qa-btn[data-action="fin-service"]'); b && b.click(); });
    await page.waitForSelector('#cloture-modal.is-open', { timeout: 10000 });
    await sleep(500);
    const shownBox = await page.$eval('#clo-open-box', (b) => !b.hidden && b.offsetHeight > 0);
    check(shownBox, 'the close sheet shows « Additions encore ouvertes » before anything is typed');
    const listed = await page.$eval('#clo-open-lines', (n) => n.innerText.replace(/\s+/g, ' '));
    check(new RegExp('Table ' + table + '\\b').test(listed), `it names table ${table} (${listed})`);
    const expected = await page.evaluate(() => drawerExpected());
    const card = await page.evaluate(() => journalTotals().card || 0);
    await page.click('#clo-count', { clickCount: 3 });
    await page.type('#clo-count', String(expected));
    await page.click('#clo-card-z', { clickCount: 3 });
    await page.type('#clo-card-z', String(card));
    await page.click('#clo-close');
    await sleep(1200);
    const after = await page.evaluate(() => ({ closed: registerClosed, closing: registerClosing,
      open: document.getElementById('cloture-modal').classList.contains('is-open'),
      toast: [...document.querySelectorAll('#toast-stack .toast')].map((n) => n.innerText).join(' | ') }));
    check(!after.closed && !after.closing, 'the close stops: the register is not closed');
    check(after.open, 'the close sheet stays open');
    check(await page.evaluate(() => window.__approvals.includes('Fermeture de caisse')), 'the close went through the till approval');
    check(new RegExp('Table ' + table + ' encore ouverte').test(after.toast), `the toast says why (${(after.toast.match(/Table [^|]*encore ouverte[^|]*/) || [''])[0].slice(0, 80)})`);
    const kept = await page.evaluate((id) => (tableOrders[id] || []).filter((l) => l.sent).length, table);
    check(kept === 2, 'the table keeps its two sent dishes');

    t.step('tick « Fermer quand même », close again');
    await page.click('#clo-open-ack');
    await page.click('#clo-close');
    await page.waitForFunction(() => registerClosed === true, { timeout: 20000 });
    check(true, 'with « Fermer quand même » ticked, the close goes through');
    check(errors.length === 0, 'no page error' + (errors.length ? ' · ' + errors.slice(0, 2).join(' | ') : ''));
  });
} finally {
  await browser.close().catch(() => {});
  server.closeAllConnections();
  await new Promise((r) => server.close(r));
}
console.log(`✓ close-open-tables-browser-test · ${checks} checks`);
await S.finish();
