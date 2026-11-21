#!/usr/bin/env node
/* Empty visits on the till · in a real Chromium, demo data only.
 *   node tools/empty-visit-till-browser-test.mjs
 *
 * The order queue now closes a table visit that has had no order and no sign
 * of life for 30 minutes (closed_by « empty », tools/empty-visit-release-test.mjs).
 * The till clears a table when its visit closes. Held here: an « empty »
 * closure never wipes lines the till still holds on that table (typed, not yet
 * sent); a table with nothing on it is freed; a paid closure clears as before.
 * No /api behind the static server: nothing reaches a merchant.
 */
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
catch { console.log('○ skip: puppeteer-core unavailable, browser assertions not executed'); process.exit(process.env.CI ? 1 : 0); }
const bin = process.env.KIWI_CHROMIUM_BIN || ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/chromium', '/usr/bin/google-chrome'].find(fs.existsSync);
if (!bin) { console.log('○ skip: Chromium unavailable, browser assertions not executed'); process.exit(process.env.CI ? 1 : 0); }

const mime = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.json': 'application/json', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
const server = http.createServer((req, res) => {
  const pathname = decodeURIComponent(new URL(req.url, 'http://local').pathname);
  if (pathname.startsWith('/api/') || pathname === '/kiwi-sw.js') { res.writeHead(404); res.end(); return; }
  const p = path.resolve(root, '.' + pathname);
  if (!p.startsWith(root + path.sep)) { res.writeHead(403); res.end(); return; }
  fs.readFile(p, (err, data) => {
    res.writeHead(err ? 404 : 200, { 'Content-Type': mime[path.extname(p)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(err ? '' : data);
  });
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await puppeteer.launch({ executablePath: bin, headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage', '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1'] });
const S = suite('empty-visit-till', { browser });
const check = (yes, msg, detail) => { assert.ok(yes, msg + (detail ? ' · ' + detail : '')); console.log('  ✓ ' + msg); };

async function open(tr, url) {
  const ctx = await browser.createBrowserContext();
  tr.defer(() => ctx.close());
  const page = tr.watch(await ctx.newPage());
  await page.setViewport({ width: 1366, height: 900 });
  page.on('dialog', (d) => d.dismiss().catch(() => {}));
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e && e.message || e)));
  tr.step('open ' + url);
  // coverage: surface=caisse-entry locale=fr viewport=desktop
  // coverage: surface=team-entry locale=fr viewport=desktop
  await page.goto(base + url, { waitUntil: 'load', timeout: 60000 });
  return { page, errors };
}


try {
  await S.run('till · a visit closed as empty never wipes lines the till still holds', async (tr) => {
    const { page, errors } = await open(tr, '/kiwi-caisse.html?demo=restaurant');
    await page.waitForSelector('.ci-float-chip', { visible: true, timeout: 30000 });
    for (let i = 0; i < 20; i++) {
      await page.click('.ci-float-chip').catch(() => {});
      const armed = await page.waitForFunction(() => { const b = document.getElementById('clockin-btn'); return !!b && !b.disabled; }, { timeout: 1000 }).then(() => true, () => false);
      if (armed) break;
    }
    for (let i = 0; i < 20; i++) {
      await page.click('#clockin-btn').catch(() => {});
      const gone = await page.waitForFunction(() => { const b = document.getElementById('clockin-btn'); return !b || !b.offsetParent; }, { timeout: 1000 }).then(() => true, () => false);
      if (gone) break;
    }
    await page.waitForFunction(() => window.KiwiCaisseKitchen && typeof window.KiwiCaisseKitchen.ingest === 'function'
      && typeof caisseTableId === 'function' && Object.keys(tables).length > 2, { timeout: 20000 });
    const r = await page.evaluate(() => {
      const ids = Object.keys(tables).filter((id) => !(tableOrders[id] || []).length && !(orders[id] || []).length);
      const named = ids.map((id) => ({ id, name: [tables[id].num, tables[id].label, id.replace(/^T/i, '')].map(String).find((n) => n && caisseTableId(n) === id) })).filter((t) => t.name);
      const [held, bare, paid] = named;
      const item = menuItems.find((m) => m.price > 0 && !m.formula);
      const occupy = (t) => { tableSettlement().project(tables[t.id], { status: 'ka-yaklo' }); tableSettlement().project(tables[t.id], { covers: 2 }); };
      [held, bare, paid].forEach(occupy);
      currentOrder().replaceTable(held.id, [{ uid: 'held-1', id: item.id, name: item.name, price: item.price, qty: 1, note: '' }]);
      currentOrder().replaceTable(paid.id, [{ uid: 'paid-1', id: item.id, name: item.name, price: item.price, qty: 1, note: '' }]);
      window.KiwiCaisseKitchen.ingest([], [], [], [
        { id: 'ses-held', mode: 'table', table: held.name, closed_by: 'empty' },
        { id: 'ses-bare', mode: 'table', table: bare.name, closed_by: 'empty' },
        { id: 'ses-paid', mode: 'table', table: paid.name, closed_by: 'service-payment' },
      ], []);
      const view = (t) => ({ status: tables[t.id].status, lines: (tableOrders[t.id] || []).length });
      return { held: view(held), bare: view(bare), paid: view(paid) };
    });
    check(r.held.lines === 1 && r.held.status !== 'khawya', 'a table with lines on the till keeps them and stays occupied', JSON.stringify(r));
    check(r.bare.status === 'khawya', 'an empty table closed as empty is freed on the till', JSON.stringify(r));
    check(r.paid.status === 'khawya' && r.paid.lines === 0, 'a paid closure still clears the table as before', JSON.stringify(r));
    check(errors.length === 0, 'no script error on the till', errors.join(' | '));
  });
} finally {
  await browser.close().catch(() => {});
  server.close();
}
process.exit(S.failed ? 1 : 0);
