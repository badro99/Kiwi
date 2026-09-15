#!/usr/bin/env node
// Real one-tap item cancellation flow against the actual queue API + SQLite.
// No merchant data or production writes.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { createRequire } from 'node:module';
import { DatabaseSync } from 'node:sqlite';
import { onRequestPost } from '../functions/api/order/queue.js';
import { tillToken, TILL_COOKIE } from '../functions/auth/_lib.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const require = createRequire(import.meta.url);
let puppeteer;
try { puppeteer = require(require.resolve('puppeteer-core', { paths: [path.join(ROOT, 'app'), ROOT, ...(process.env.NODE_PATH || '').split(path.delimiter)] })); }
catch { console.log('○ skip: puppeteer-core unavailable (browser assertions not run)'); process.exit(process.env.CI ? 1 : 0); }
const executablePath = process.env.KIWI_CHROMIUM_BIN || ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/chromium'].find(p => fs.existsSync(p));
if (!executablePath) { console.log('○ skip: Chromium unavailable'); process.exit(process.env.CI ? 1 : 0); }

const source = fs.readFileSync(path.join(ROOT, 'kiwi-caisse.html'), 'utf8');
const handlers = source.slice(source.indexOf('    async function postCaisseCancellation'), source.indexOf('    /* ---- table order management ---- */'));
const groups = source.slice(source.indexOf('    function formulaGroup('), source.indexOf('    function removeGroupedLine('));
const MERCHANT = 'test-item-cancel', SECRET = 'test-cancellation-browser-secret';
const raw = new DatabaseSync(':memory:');
raw.exec(fs.readFileSync(path.join(ROOT, 'schema.sql'), 'utf8'));
raw.prepare('INSERT INTO merchant_config (merchant, features, updated_ts) VALUES (?, ?, ?)').run(MERCHANT, JSON.stringify({ orderpro: true }), Date.now());
const DB = {
  prepare(sql) { let args = []; const q = { bind(...v) { args = v; return q; },
    first() { return raw.prepare(sql).get(...args) || null; }, all() { return { results: raw.prepare(sql).all(...args) }; },
    run() { return { meta: { changes: raw.prepare(sql).run(...args).changes } }; } }; return q; },
  async batch(statements) { raw.exec('BEGIN'); try { const results = statements.map(s => s.run()); raw.exec('COMMIT'); return results; } catch (e) { raw.exec('ROLLBACK'); throw e; } },
};
const cookie = `${TILL_COOKIE}=${await tillToken(SECRET, MERCHANT)}`;
let failNext = false, delayNext = 0, requests = 0;
const server = http.createServer(async (req, res) => {
  if (req.url === '/api/order/queue') {
    requests++;
    let body = ''; for await (const chunk of req) body += chunk;
    if (failNext) { failNext = false; res.writeHead(503, { 'Content-Type': 'application/json' }); res.end('{"error":"test-unavailable"}'); return; }
    const reply = await onRequestPost({ request: new Request('https://kiwi-os.com/api/order/queue', {
      method: 'POST', headers: { cookie, 'Content-Type': 'application/json' }, body }), env: { DB, AUTH_SECRET: SECRET } });
    const result = await reply.text();
    const delay = delayNext; delayNext = 0;
    if (delay) await new Promise(r => setTimeout(r, delay));
    res.writeHead(reply.status, { 'Content-Type': 'application/json' }); res.end(result); return;
  }
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(`<!doctype html><html><body>
    <button id="open">−</button><output id="bill"></output>
    <script>
      const $ = s => document.querySelector(s);
      let cart = [], tableOrders = {}, mode = 'salle', picked, pickedTable;
      const currentMerchantSlug = () => ${JSON.stringify(MERCHANT)};
      const storeIsReal = () => true;
      const canonicalOrdersForTable = () => [];
      const toast = msg => { window.lastToast = msg; };
      const renderMenu = () => {};
      const persistShift = () => localStorage.setItem('test-bill', JSON.stringify(tableOrders));
      const renderCart = () => $('#bill').textContent = JSON.stringify(cart);
      const renderRightPanel = id => $('#bill').textContent = JSON.stringify(tableOrders[id]);
      const renderOrderPanel = renderRightPanel;
      ${groups}
      ${handlers}
      window.seed = (lines, table) => { pickedTable = table; picked = lines[0]; cart = table ? [] : lines; tableOrders = table ? { [table]: lines } : {}; renderCart(); if (table) renderRightPanel(table); };
      window.bill = () => pickedTable ? tableOrders[pickedTable] : cart;
      $('#open').onclick = () => cancelCaisseLineImmediately(pickedTable, picked, pickedTable ? undefined : { orderId: picked.canonicalOrderId, cart: true });
    </script></body></html>`);
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const browser = await puppeteer.launch({ executablePath, headless: true, args: ['--no-sandbox'] });
let controls = 0;
const ok = (condition, label) => { assert.ok(condition, label); controls++; console.log('✓ ' + label); };
try {
  const page = await browser.newPage();
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  for (const [index, table] of ['1', null].entries()) {
    const orderId = 'ord-browser-' + index;
    const lines = [{ uid: 'uid-selected', id: 'shawarma', name: 'Shawarma', qty: 3, unitPrice: 25, stationAccepted: true },
      { uid: 'uid-other', id: 'shawarma', name: 'Shawarma sans sauce', qty: 1, unitPrice: 25 }];
    raw.prepare(`INSERT INTO orders (id, merchant, number, mode, table_no, total, lines, status, created_ts, updated_ts)
      VALUES (?, ?, ?, ?, ?, 100, ?, 'accepted', ?, ?)`).run(orderId, MERCHANT, index + 1, table ? 'table' : 'takeout', table, JSON.stringify(lines), Date.now(), Date.now());
    await page.evaluate((rows, id, table) => window.seed(rows.map(l => ({ ...l, canonicalOrderId: id, sent: true })), table), lines, orderId, table);
    failNext = true;
    await page.click('#open');
    await page.waitForFunction(() => window.lastToast?.includes('Article conservé'));
    ok((await page.evaluate(() => window.bill()))[0].qty === 3, `${table ? 'table' : 'takeaway'}: failed write preserves the item`);
    ok(!(await page.$('#manager-modal')), 'one-tap item cancellation opens no PIN dialog');

    delayNext = 400;
    const before = requests;
    await page.click('#open');
    await page.click('#open');
    // Simulate the canonical poll applying the same revision during the request.
    await page.evaluate(() => { window.bill()[0].qty = 2; });
    await page.waitForFunction(() => window.lastToast?.includes('annulé en cuisine'));
    const bill = await page.evaluate(() => window.bill());
    ok(bill[0].qty === 2 && bill[1].qty === 1, 'server quantities apply once; the other variant stays untouched');
    ok(requests === before + 1, 'double tap sends one cancellation');
    ok(raw.prepare('SELECT total FROM orders WHERE id=?').get(orderId).total === 75, 'real API persists the correct unpaid balance');
    const audit = raw.prepare('SELECT actor, reason FROM kitchen_voids WHERE order_id=?').get(orderId);
    ok(audit?.actor === 'Caisse' && audit?.reason === 'item_cancelled', 'audit records the paired caisse and item correction');
  }
  ok(errors.length === 0, 'no browser runtime errors: ' + errors.join(', '));

  // A successful write with a lost response reuses the same operation ID.
  delayNext = 13000;
  await page.click('#open');
  await page.waitForFunction(() => window.lastToast?.includes('délai dépassé'), { timeout: 20000 });
  ok((await page.evaluate(() => window.bill()))[0].qty === 2, 'lost response leaves the visible bill unchanged');
  await page.click('#open');
  await page.waitForFunction(() => window.lastToast?.includes('annulé en cuisine'));
  ok((await page.evaluate(() => window.bill()))[0].qty === 1
    && raw.prepare("SELECT total FROM orders WHERE id='ord-browser-1'").get().total === 50,
    'retry confirms the committed cancellation without subtracting twice');
  console.log(`\n✓ ${controls} rendered one-tap item-cancellation checks passed (table + takeaway).`);
} finally { await browser.close(); await new Promise(r => server.close(r)); raw.close(); }
