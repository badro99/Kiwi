#!/usr/bin/env node
/* kds-cards-browser-test · every bon keeps its button, on every screen size.
 *
 *   node tools/kds-cards-browser-test.mjs
 *
 * The shipped kitchen board (no kit flag), against the REAL
 * functions/api/order/queue.js on a SQLite base built from schema.sql, with
 * eight bons of every kind (table, takeaway, delivery, notes, options, two
 * already started). The tablet is set "paired" to a store that exists only in
 * this suite's base: no code is typed, no real store is touched.
 *
 * A bon has overflow: hidden. In a flex column it never shrinks (flex-shrink
 * 0), but « En préparation » and every column under 900 px are grids, and a
 * grid row could fall to its minimum in a short column. Until 21 October, on
 * an iPad in landscape the « Prête » button was a thin strip, in portrait a
 * « Je prends » was cut off, and on a phone every bon showed its first line
 * and no button at all.
 *
 * At 1920 × 1080, 1024 × 768, 768 × 1024 and 390 × 844, in every column
 * (through the tabs where there are tabs), this holds: each bon's action
 * button is at least 52 px tall and lies wholly inside its bon, and the page
 * raises no error.
 *
 * KIWI_ROOT=<dir> runs it against another checkout (to prove it fails before
 * the fix). */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { suite } from './browser-trace.mjs';

import { tillToken, TILL_COOKIE } from '../functions/auth/_lib.js';
import * as queue from '../functions/api/order/queue.js';

const root = process.env.KIWI_ROOT || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let puppeteer;
try { puppeteer = createRequire(path.join(root, 'app/package.json'))('puppeteer-core'); }
catch { console.log('○ skip: puppeteer-core unavailable — browser assertions not executed'); process.exit(process.env.CI ? 1 : 0); }
const bin = process.env.KIWI_CHROMIUM_BIN || ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/chromium', '/usr/bin/google-chrome'].find(fs.existsSync);
if (!bin) { console.log('○ skip: Chromium unavailable — browser assertions not executed'); process.exit(process.env.CI ? 1 : 0); }

/* ── The base and the real queue handler ─────────────────────────────────── */
const MERCHANT = 'kds-cards-browser-bistro';
const AUTH_SECRET = 'kds-cards-browser-secret';
const sql = new DatabaseSync(':memory:');
sql.exec(fs.readFileSync(path.join(root, 'schema.sql'), 'utf8'));
const DB = {
  prepare(query) {
    let args = [];
    const st = {
      bind(...a) { args = a.map((v) => (v === undefined ? null : v)); return st; },
      first() { const r = sql.prepare(query).get(...args); return r === undefined ? null : r; },
      all() { return { results: sql.prepare(query).all(...args) }; },
      run() { const r = sql.prepare(query).run(...args); return { success: true, meta: { changes: r.changes } }; },
    };
    return st;
  },
  async batch(statements) {
    sql.exec('BEGIN IMMEDIATE');
    try { const out = []; for (const s of statements) out.push(await s.run()); sql.exec('COMMIT'); return out; }
    catch (e) { try { sql.exec('ROLLBACK'); } catch (_) {} throw e; }
  },
};
const env = { DB, AUTH_SECRET };
sql.prepare('INSERT INTO merchant_config (merchant, features, name, updated_ts) VALUES (?, ?, ?, ?)')
  .run(MERCHANT, JSON.stringify({ orderpro: true }), 'Cards Browser Bistro', Date.now());
const cookie = `${TILL_COOKIE}=${await tillToken(AUTH_SECRET, MERCHANT)}`;

let seq = 100;
function addOrder({ id, mode = 'table', table = null, ageMs, lines, status = 'accepted' }) {
  const created = Date.now() - ageMs;
  sql.prepare(`INSERT INTO orders (id, merchant, number, mode, table_no, total, lines, status, created_ts, updated_ts, channel)
               VALUES (?, ?, ?, ?, ?, 100, ?, ?, ?, ?, 'caisse')`)
    .run(id, MERCHANT, ++seq, mode, table, JSON.stringify(lines), status, created, created);
  return seq;
}
const row = (id) => sql.prepare('SELECT status, lines FROM orders WHERE id = ?').get(id);
const clearOrders = () => sql.exec(`DELETE FROM orders WHERE merchant = '${MERCHANT}'`);
const line = (name, extra = {}) => ({ id: 'it-' + name.toLowerCase().replace(/\W+/g, '-'), name, qty: 1, unitPrice: 50, station: '', ...extra });
const posts = [];
const answers = [];

/* ── Static server, /api routed to the real handler ──────────────────────── */
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
const S = suite('kds-cards', { browser });
let checks = 0;
const check = (yes, msg) => { assert.ok(yes, msg); checks++; console.log('  ✓ ' + msg); };

async function route(r, kitFetched) {
  const u = r.url();
  if (!u.startsWith(base)) return u.startsWith('data:') ? r.continue() : r.abort();
  const url = new URL(u);
  if (/^\/assets\/kit\//.test(url.pathname)) kitFetched.push(url.pathname);
  if (url.pathname === '/kiwi-sw.js') return r.respond({ status: 404, contentType: 'text/javascript', body: '' });
  if (!url.pathname.startsWith('/api/')) return r.continue();
  if (url.pathname !== '/api/order/queue') return r.respond({ status: 404, contentType: 'application/json', body: '{"error":"not-found"}' });
  const method = r.method();
  const body = method === 'POST' ? r.postData() : undefined;
  if (body) { try { posts.push(JSON.parse(body)); } catch (_) {} }
  const request = new Request(url.toString(), { method, headers: { 'Content-Type': 'application/json', Cookie: cookie }, body });
  const handler = method === 'POST' ? queue.onRequestPost : queue.onRequestGet;
  try {
    const res = await handler({ request, env, waitUntil() {} });
    const text = await res.text();
    if (method === 'POST') answers.push(res.status + ' ' + text.slice(0, 160));
    r.respond({ status: res.status, contentType: 'application/json', body: text });
  } catch (e) {
    r.respond({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: String(e && e.message) }) });
  }
}

async function open(tr, ctx, { flag = true, lang = 'fr', width = 1920, height = 1080 } = {}) {
  const page = tr.watch(await ctx.newPage());
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const kitFetched = [];
  await page.setViewport({ width, height, deviceScaleFactor: 1 });
  await page.setBypassServiceWorker(true);
  await page.setRequestInterception(true);
  page.on('request', (r) => { route(r, kitFetched); });
  await page.evaluateOnNewDocument((m, flag, lang) => {
    localStorage.setItem('kiwiLiveMerchant', m);
    localStorage.setItem('kiwiPaired', '1');
    localStorage.setItem('kiwiCuisineLang', lang);
    if (flag) localStorage.setItem('kiwiSkin2027:kds', '1');
  }, MERCHANT, flag, lang);
  await page.goto(base + '/kiwi-cuisine.html', { waitUntil: 'load' });
  page.kitFetched = kitFetched;
  page.errors = errors;
  return page;
}


addOrder({ id: 'o1', table: '5', ageMs: 2 * 60000, lines: [line('Tajine kefta', { note: 'Sans piment', visuals: [{ name: 'sans oignon' }] }), line('Thé à la menthe', { station: 'bar' }), line('Salade marocaine')] });
addOrder({ id: 'o2', table: '12', ageMs: 4 * 60000, lines: [line('Pizza margherita', { qty: 2 }), line('Pâtes carbonara', { note: 'Allergie : œufs, vérifier' }), line('Tiramisu')] });
addOrder({ id: 'o3', mode: 'takeout', ageMs: 6 * 60000, lines: [line('Burger maison', { visuals: [{ name: 'bien cuit' }, { name: 'sans fromage' }] }), line('Frites')] });
addOrder({ id: 'o4', mode: 'delivery', ageMs: 9 * 60000, lines: [line('Couscous royal', { stationAccepted: true }), line('Pastilla au poulet', { stationAccepted: true })] });
addOrder({ id: 'o5', table: '3', ageMs: 12 * 60000, lines: [line('Harira', { stationAccepted: true, qty: 4 }), line('Brochettes mixtes', { stationAccepted: true, qty: 2 })] });
addOrder({ id: 'o6', table: '8', ageMs: 17 * 60000, lines: [line('Lasagnes', { stationAccepted: true }), line('Risotto aux champignons', { stationAccepted: true, note: 'Sans parmesan' })] });
addOrder({ id: 'o7', table: '1', ageMs: 1 * 60000, lines: [line('Café', { station: 'bar' }), line('Omelette berbère')] });
addOrder({ id: 'o8', mode: 'takeout', ageMs: 3 * 60000, lines: [line('Pizza quatre fromages'), line('Coca-Cola', { station: 'bar' })] });

const measure = (page) => page.evaluate(() => {
  const out = [];
  for (const col of document.querySelectorAll('.col')) {
    if (getComputedStyle(col).display === 'none') continue;
    for (const tk of col.querySelectorAll('.tk')) {
      const b = tk.querySelector('.tk-act');
      if (!b) continue;
      const c = tk.getBoundingClientRect(), r = b.getBoundingClientRect();
      out.push({ col: col.className.split(' ').pop(), h: Math.round(r.height), inside: r.top >= c.top - 1 && r.bottom <= c.bottom + 1 });
    }
  }
  return out;
});

try {
  for (const [w, h] of [[1920, 1080], [1024, 768], [768, 1024], [390, 844]]) {
    await S.run(`${w} × ${h}`, async (tr) => {
      const ctx = await browser.createBrowserContext(); tr.defer(() => ctx.close());
      const page = await open(tr, ctx, { flag: false, width: w, height: h });
      await page.waitForSelector('.tk .tk-act', { timeout: 20000 });
      await sleep(800);
      const tabs = await page.$$eval('#coltabs [data-col]', (b) => b.filter((x) => x.getClientRects().length && getComputedStyle(x).display !== 'none').map((x) => x.dataset.col));
      const seen = [];
      for (const col of tabs.length ? tabs : [null]) {
        if (col) { tr.step(`open the « ${col} » tab`); await page.click(`#coltabs [data-col="${col}"]`); await sleep(500); }
        seen.push(...await measure(page));
      }
      const bad = seen.filter((s) => s.h < 52 || !s.inside);
      check(seen.length >= 6, `${w} × ${h}: ${seen.length} bons with a button measured`);
      check(bad.length === 0, `${w} × ${h}: every button is ≥ 52 px and inside its bon` + (bad.length ? ' · ' + bad.map((b) => `${b.col} ${b.h}px${b.inside ? '' : ' cut'}`).join(', ') : ''));
      check(page.errors.length === 0, `${w} × ${h}: no page error` + (page.errors.length ? ' · ' + page.errors.slice(0, 3).join(' | ') : ''));
    });
  }
} finally {
  await browser.close().catch(() => {});
  server.closeAllConnections();
  await new Promise((r) => server.close(r));
}
console.log(`✓ kds-cards-browser-test · ${checks} checks`);
await S.finish();
