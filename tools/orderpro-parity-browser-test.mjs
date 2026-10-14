#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
 * orderpro-parity-browser-test · stage 3c: OrderPro.html gives a guest what
 * the QR page (kiwi-order.html) gave, before the QR URLs move to it.
 *
 * Real files, the real functions/api/menu.js and functions/api/order/session.js
 * on SQLite. Three stores:
 *   · without Order Pro: the menu opens to browse (no add, no cart, the note),
 *     a dish with complete nutrition shows its summary and its facts;
 *   · five published languages: the picker offers the five, a guest who chose
 *     Spanish on the QR page (kiwiOrderLang) reads the dish and the UI in
 *     Spanish, and Arabic turns the page right to left;
 *   · closed today (an exception in the published hours): the banner says so,
 *     and with a dish in the cart the send button stays disabled.
 * ═══════════════════════════════════════════════════════════════════════════ */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import zlib from 'node:zlib';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { suite } from './browser-trace.mjs';

import * as menuApi from '../functions/api/menu.js';
import * as sessionApi from '../functions/api/order/session.js';
import * as guestApi from '../functions/api/order/guest.js';
import * as basicPage from '../functions/order/basic.js';

const root = process.env.KIWI_ROOT || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let puppeteer;
try { puppeteer = createRequire(path.join(root, 'app/package.json'))('puppeteer-core'); }
catch { console.log('○ skip: puppeteer-core unavailable, browser assertions not executed'); process.exit(process.env.CI ? 1 : 0); }
const bin = process.env.KIWI_CHROMIUM_BIN || ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/chromium', '/usr/bin/google-chrome'].find(fs.existsSync);
if (!bin) { console.log('○ skip: Chromium unavailable, browser assertions not executed'); process.exit(process.env.CI ? 1 : 0); }

const sql = new DatabaseSync(':memory:');
for (const stmt of fs.readFileSync(path.join(root, 'schema.sql'), 'utf8').replace(/--[^\n]*/g, '').split(';').map((s) => s.trim()).filter(Boolean)) sql.exec(stmt);
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
const env = { DB, AUTH_SECRET: 'orderpro-parity-secret' };

/* The dashboard's fingerprint (assets/menu-i18n.js › hash): a translation is
   fresh only while it matches the merchant's own text. */
function menuHash(name, desc) {
  const str = String(name == null ? '' : name).trim() + '\u001f' + String(desc == null ? '' : desc).trim();
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}
const TAJINE = { name: 'Tajine kefta', desc: 'Boulettes, œuf, tomate' };
function menu(extra = {}) {
  return Object.assign({
    cats: [{ id: 'plats', name: 'Plats' }, { id: 'boissons', name: 'Boissons' }],
    items: [
      {
        id: 'tajine', catId: 'plats', price: 65, ...TAJINE,
        nutritionComplete: true,
        nutrition: { kcal: 620, protein: 38, carbs: 22, fat: 41, sugars: 6, salt: 2.1 },
        allergens: ['gluten', 'oeufs'],
        i18n: {
          es: { name: 'Tayín de kefta', desc: 'Albóndigas, huevo, tomate', h: menuHash(TAJINE.name, TAJINE.desc) },
          en: { name: 'Kefta tagine', desc: 'Meatballs, egg, tomato', h: menuHash(TAJINE.name, TAJINE.desc) },
        },
      },
      { id: 'the', catId: 'boissons', price: 15, name: 'Thé à la menthe', desc: '' },
    ],
  }, extra);
}
function store(slug, name, { orderpro, data }) {
  sql.prepare('INSERT INTO merchant_config (merchant, features, name, updated_ts) VALUES (?, ?, ?, ?)')
    .run(slug, JSON.stringify({ orderpro }), name, Date.now());
  sql.prepare('INSERT INTO menus (merchant, name, type, data, updated_ts) VALUES (?, ?, ?, ?, ?)')
    .run(slug, name, 'restaurant', JSON.stringify(data), Date.now());
  sql.prepare('INSERT INTO order_desk (merchant, seen_ts) VALUES (?, ?)').run(slug, Date.now());
}
/* Today on the store's wall clock (hours.js reads Casablanca when no zone). */
const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Casablanca', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const allWeek = Object.fromEntries(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].map((d) => [d, { open: true, periods: [{ from: '08:00', to: '23:00' }] }]));

store('parity-browse', 'Café Sans Commande', { orderpro: false, data: menu() });
store('parity-table', 'Table Simple', { orderpro: true, data: menu() });
sql.prepare('INSERT INTO merchant_config (merchant, features, name, updated_ts) VALUES (?, ?, ?, ?)').run('parity-shop', JSON.stringify({ orderpro: true }), 'Boutique Test', Date.now());
sql.prepare('INSERT INTO menus (merchant, name, type, data, updated_ts) VALUES (?, ?, ?, ?, ?)').run('parity-shop', 'Boutique Test', 'boutique', JSON.stringify({
  categories: [{ id: 'c1', name: 'Chemises' }],
  products: [{ id: 'p1', name: 'Chemise lin', categoryId: 'c1', priceMAD: 249 }, { id: 'p2', name: 'Pantalon toile', categoryId: 'c1', priceMAD: 320 }],
  variants: [{ id: 'v1', productId: 'p1', size: 'M', stock: 3, barcodes: ['6111000000017'] }, { id: 'v2', productId: 'p2', size: 'L', stock: 0, barcodes: [] }],
  colors: [],
}), Date.now());
store('parity-langs', 'Bistro Cinq Langues', { orderpro: true, data: menu({ langs: ['fr', 'ar', 'en', 'es', 'de'] }) });
store('parity-closed', 'Brasserie Fermée', {
  orderpro: true,
  data: menu({ hours: { v: 1, week: allWeek, exceptions: [{ from: today, to: today, kind: 'closed', label: 'Inventaire' }] } }),
});

/* ── Static server, /api routed to the real handlers ─────────────────────── */
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.json': 'application/json', '.png': 'image/png', '.webp': 'image/webp' };
const server = http.createServer((req, res) => {
  const p = path.resolve(root, '.' + decodeURIComponent(new URL(req.url, 'http://local').pathname));
  if (!p.startsWith(root + path.sep)) { res.writeHead(403); res.end(); return; }
  fs.readFile(p, (err, data) => { res.writeHead(err ? 404 : 200, { 'Content-Type': mime[path.extname(p)] || 'application/octet-stream', 'Cache-Control': 'no-cache' }); res.end(err ? '' : data); });
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await puppeteer.launch({ executablePath: bin, headless: true, args: ['--no-sandbox', '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1'] });
const S = suite('orderpro-parity', { browser });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let checks = 0;
const check = (yes, msg) => { assert.ok(yes, msg); checks++; console.log('  ✓ ' + msg); };

const ROUTES = { '/api/menu': menuApi, '/api/order/session': sessionApi, '/api/order/guest': guestApi };
async function route(r, seen) {
  const u = r.url();
  if (!u.startsWith(base)) return u.startsWith('data:') ? r.continue() : r.abort();
  const url = new URL(u);
  seen.push(url.pathname);
  if (url.pathname === '/kiwi-sw.js') return r.respond({ status: 404, contentType: 'text/javascript', body: '' });
  if (url.pathname === '/order/basic') {
    const res = await basicPage.onRequestGet({ request: new Request(url.toString(), { headers: { 'Accept-Language': 'fr' } }), env });
    return r.respond({ status: res.status, contentType: 'text/html', body: await res.text() });
  }
  if (!url.pathname.startsWith('/api/')) return r.continue();
  const mod = ROUTES[url.pathname];
  if (!mod) return r.respond({ status: 404, contentType: 'application/json', body: '{"error":"not-found"}' });
  const method = r.method();
  const body = method === 'POST' ? r.postData() : undefined;
  const handler = method === 'POST' ? mod.onRequestPost : mod.onRequestGet;
  try {
    const request = new Request(url.toString(), { method, headers: { 'Content-Type': 'application/json' }, body });
    const res = await handler({ request, env, waitUntil() {} });
    r.respond({ status: res.status, contentType: 'application/json', body: await res.text() });
  } catch (e) {
    r.respond({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: String(e && e.message) }) });
  }
}

async function open(tr, ctx, query, { storage = {}, width = 390, height = 844 } = {}) {
  const page = tr.watch(await ctx.newPage());
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const seen = [];
  await page.setViewport({ width, height, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  await page.setBypassServiceWorker(true);
  await page.setRequestInterception(true);
  page.on('request', (r) => { route(r, seen); });
  await page.evaluateOnNewDocument((kv) => {
    try { Object.keys(kv).forEach((k) => localStorage.setItem(k, kv[k])); } catch (_) {}
  }, storage);
  await page.goto(base + '/OrderPro.html?' + query, { waitUntil: 'load' });
  page.errors = errors;
  page.seen = seen;
  return page;
}
/* KIWI_SHOTS=<dir> keeps a phone screenshot of each state, for review. */
async function shot(page, name) {
  if (!process.env.KIWI_SHOTS) return;
  await sleep(4500);   // past the slide and the greeting flash
  fs.mkdirSync(process.env.KIWI_SHOTS, { recursive: true });
  await page.screenshot({ path: path.join(process.env.KIWI_SHOTS, 'orderpro-' + name + '.png') });
}
const visible = (page, sel) => page.evaluate((s) => {
  const el = document.querySelector(s);
  if (!el) return false;
  const r = el.getBoundingClientRect();
  return !el.hidden && getComputedStyle(el).display !== 'none' && r.width > 0 && r.height > 0;
}, sel);

try {
  await S.run('without Order Pro · a menu to browse, with its nutrition', async (tr) => {
    const ctx = await browser.createBrowserContext(); tr.defer(() => ctx.close());
    const page = await open(tr, ctx, 's=parity-browse&t=4');
    await page.waitForSelector('#screen-menu.is-active [data-card="tajine"]', { timeout: 15000 });
    check(true, 'the menu opens directly, even from a table link');
    check(await page.evaluate(() => document.body.classList.contains('ordering-off')), 'the page is in browse-only mode');
    check(await visible(page, '#oo-banner'), 'the note is shown');
    check(/Commandez au comptoir/.test(await page.$eval('#oo-banner', (e) => e.textContent)), 'it sends the guest to the counter');
    check(!(await visible(page, '.dish-add')) && !(await visible(page, '#cart-pill')) && !(await visible(page, '#service-bar')), 'no add button, no cart, no service bar');
    check(!(await visible(page, '#kh-closed')), 'no closed banner without published hours');
    const tile = await page.$eval('[data-card="tajine"]', (e) => e.textContent.replace(/\s+/g, ' ').trim());
    check(!/kcal/.test(tile) && await visible(page, '[data-card="tajine"] [data-info="tajine"]'), `the tile shows no figures, only an "i" (${tile})`);
    check(!(await page.$('[data-card="the"] [data-info]')), 'a dish without published facts has no "i"');
    await shot(page, 'browse');
    await sleep(700);
    await page.tap('[data-card="tajine"] .dish-name');
    await sleep(500);
    check(!(await page.$('#custom-sheet.is-open')), 'tapping the dish itself does not open its facts');
    await page.tap('[data-info="tajine"]');
    await page.waitForSelector('#custom-sheet.is-open', { timeout: 5000 });
    const facts = await page.$eval('#custom-nutrition', (e) => e.textContent.replace(/\s+/g, ' ').trim());
    check(/Valeurs nutritionnelles/.test(facts) && /Sel\s*2\.1 g/.test(facts) && /Gluten/.test(facts) && /Œufs/.test(facts), `the "i" opens its facts and allergens (${facts.slice(0, 160)})`);
    check(!(await visible(page, '#custom-add-btn')), 'the sheet has no add button');
    check(!page.seen.includes('/api/order/session'), 'no visit is opened');
    const lazy = ['/assets/hours.js', '/assets/menu-i18n.js', '/assets/order-ui-langs.js'];
    check(!lazy.some((p) => page.seen.includes(p)), 'a store without hours or extra languages loads none of their helpers');
    check(page.errors.length === 0, 'no page error' + (page.errors.length ? ': ' + page.errors.join(' | ') : ''));
  });

  await S.run('five languages · the picker, Spanish from the QR page, Arabic right to left', async (tr) => {
    const ctx = await browser.createBrowserContext(); tr.defer(() => ctx.close());
    const page = await open(tr, ctx, 's=parity-langs', { storage: { kiwiOrderLang: 'es' } });
    await page.waitForSelector('#screen-mode.is-active', { timeout: 15000 });
    const langs = await page.$$eval('#lang-picker .lang-btn', (b) => b.map((x) => x.dataset.lang));
    check(langs.length === 5 && ['fr', 'ar', 'en', 'es', 'de'].every((l) => langs.includes(l)), `the picker offers the five published languages (${langs.join(' ')})`);
    check(await page.evaluate(() => document.documentElement.lang === 'es'), 'the Spanish chosen on the QR page is kept');
    check(await page.$eval('#lang-picker .lang-btn[data-lang="es"]', (b) => b.getAttribute('aria-pressed') === 'true' && b.getAttribute('aria-label') === 'Español'), 'its key is pressed and named in full');
    check(!(await page.evaluate(() => document.body.classList.contains('ordering-off'))), 'ordering is on');
    await page.tap('.mode-card[data-mode="takeout"]');
    await page.waitForSelector('#screen-menu.is-active [data-card="tajine"]', { timeout: 8000 });
    await shot(page, 'spanish');
    const nameClear = await page.waitForFunction(() => {
      const n = document.querySelector('.menu-cafe .name').getBoundingClientRect();
      const p = document.getElementById('lang-picker').getBoundingClientRect();
      return n.width > 0 && n.left >= 0 && (n.right <= p.left || n.top >= p.bottom);
    }, { timeout: 4000 }).then(() => true, () => false);
    check(nameClear, 'five language keys leave the store\'s name uncovered');
    check(/Tayín de kefta/.test(await page.$eval('[data-card="tajine"] .dish-name', (e) => e.textContent)), 'the dish reads in Spanish');
    check((await page.$eval('.menu-tab[data-tab="all"]', (e) => e.textContent.trim())) === 'Todo', 'the UI reads in Spanish');
    check(await page.evaluate(() => t('gx_home') === I18N.en.gx_home && t('tab_all') === 'Todo'), 'a line Spanish lacks (the guest home) reads in English, not French');
    await page.tap('#lang-picker .lang-btn[data-lang="ar"]');
    check(await page.evaluate(() => document.documentElement.dir === 'rtl' && document.documentElement.lang === 'ar'), 'Arabic turns the page right to left');
    check(/Tajine kefta/.test(await page.$eval('[data-card="tajine"] .dish-name', (e) => e.textContent)), 'an untranslated language falls back to the merchant\'s own text');
    await page.tap('#lang-picker .lang-btn[data-lang="en"]');
    check(/Kefta tagine/.test(await page.$eval('[data-card="tajine"] .dish-name', (e) => e.textContent)) && await page.evaluate(() => document.documentElement.dir === 'ltr'), 'English: the translation, left to right');
    check(await page.evaluate(() => localStorage.getItem('orderProLang') === 'en'), 'the choice is saved');
    check(page.seen.includes('/assets/menu-i18n.js') && page.seen.includes('/assets/order-ui-langs.js') && !page.seen.includes('/assets/hours.js'), 'the language helpers load, the hours do not');
    check(page.errors.length === 0, 'no page error' + (page.errors.length ? ': ' + page.errors.join(' | ') : ''));
  });

  await S.run('closed today · the banner, and the send button stays off', async (tr) => {
    const ctx = await browser.createBrowserContext(); tr.defer(() => ctx.close());
    const page = await open(tr, ctx, 's=parity-closed', { storage: { orderProLang: 'fr' } });
    await page.waitForSelector('#screen-mode.is-active', { timeout: 15000 });
    await page.waitForSelector('#kh-closed', { timeout: 5000 });
    const text = await page.$eval('#kh-closed', (e) => e.textContent.replace(/\s+/g, ' ').trim());
    check(/Fermé en ce moment/.test(text) && text.length > 'Fermé en ce moment'.length + 3, `the banner says closed, and when (${text})`);
    const clear = await page.evaluate(() => {
      const b = document.getElementById('kh-closed').getBoundingClientRect();
      const p = document.getElementById('lang-picker').getBoundingClientRect();
      const t = document.querySelector('#kh-closed span:last-child').getBoundingClientRect();
      return b.width > 0 && (t.right <= p.left || t.left >= p.right || t.bottom <= p.top || t.top >= p.bottom);
    });
    check(clear, 'the language picker does not cover the banner text');
    await shot(page, 'closed');
    await page.tap('.mode-card[data-mode="takeout"]');
    await page.waitForSelector('#screen-menu.is-active [data-add="the"]', { timeout: 8000 });
    await sleep(700);   // the screen slides in; a tap during the slide lands beside the button
    await page.tap('[data-add="the"]');
    await page.waitForFunction(() => document.getElementById('cart-count').textContent === '1', { timeout: 3000 });
    const btn = await page.$eval('#send-btn', (b) => ({ disabled: b.disabled, title: b.getAttribute('title') || '' }));
    check(btn.disabled && /heures d'ouverture/.test(btn.title), 'a dish in the cart, and the send button stays disabled, saying why');
    check(page.seen.includes('/assets/hours.js') && !page.seen.includes('/assets/menu-i18n.js'), 'the hours helper loads, the language ones do not');
    check(page.errors.length === 0, 'no page error' + (page.errors.length ? ': ' + page.errors.join(' | ') : ''));
  });

  await S.run('the pitch demo · Café Atlas from the phone, nothing sent', async (tr) => {
    const ctx = await browser.createBrowserContext(); tr.defer(() => ctx.close());
    const page = await open(tr, ctx, 's=demo', { storage: { orderProLang: 'en' } });
    await page.waitForSelector('#screen-mode.is-active', { timeout: 15000 });
    check(page.seen.includes('/assets/orderpro-demo.js') && !page.seen.includes('/api/menu'), 'the demo menu comes from the phone, not /api/menu');
    check((await page.evaluate(() => document.title)) === 'Café Atlas', 'the store is Café Atlas');
    await page.tap('.mode-card[data-mode="takeout"]');
    await page.waitForSelector('#screen-menu.is-active [data-add="sparkling"]', { timeout: 8000 });
    check((await page.$$('#menu-list [data-card]')).length === 13, 'the thirteen dishes');
    check(/Oulmès sparkling water/.test(await page.$eval('[data-card="sparkling"] .dish-name', (e) => e.textContent)), 'in English');
    await sleep(700);
    await page.tap('[data-add="sparkling"]');
    await page.waitForFunction(() => document.getElementById('cart-count').textContent === '1', { timeout: 3000 });
    await page.tap('#cart-pill');
    await page.waitForSelector('#send-btn:not([disabled])', { timeout: 3000 });
    await sleep(500);
    await page.tap('#send-btn');
    await page.waitForSelector('#screen-cashier.is-active', { timeout: 8000 });
    const shown = await page.evaluate(() => ({ n: document.getElementById('ready-number').textContent, total: document.getElementById('cashier-total').textContent }));
    check(/42/.test(shown.n) && /8/.test(shown.total), `the order is numbered and priced from the menu (${shown.n}, ${shown.total})`);
    check(!page.seen.some((p) => p === '/api/order' || p === '/api/order/session'), 'no order and no visit reach a server');
    check(page.errors.length === 0, 'no page error' + (page.errors.length ? ': ' + page.errors.join(' | ') : ''));
  });
  /* §19: a guest on a cold load gets at most 60 KB gzip of script before the
     first screen. Measured on what the page actually fetched: the inline
     script plus every /assets/*.js it asked for, each gzipped. */
  const gz = (text) => zlib.gzipSync(text, { level: 9 }).length;
  const inline = gz([...fs.readFileSync(path.join(root, 'OrderPro.html'), 'utf8').matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]).join('\n'));
  const kb = (n) => (n / 1024).toFixed(1) + ' KB';
  function scripts(page) {
    const files = [...new Set(page.seen.filter((p) => /^\/assets\/[^/]+\.js$/.test(p)))];
    const sizes = Object.fromEntries(files.map((p) => [p.slice(8), gz(fs.readFileSync(path.join(root, p), 'utf8'))]));
    return { sizes, total: inline + Object.values(sizes).reduce((a, b) => a + b, 0) };
  }
  await S.run('the script budget · 60 KB gzip before the first screen (§19)', async (tr) => {
    const ctx = await browser.createBrowserContext(); tr.defer(() => ctx.close());
    const browse = await open(tr, ctx, 's=parity-browse&t=4');
    await browse.waitForSelector('#screen-menu.is-active [data-card="tajine"]', { timeout: 15000 });
    await sleep(1500);
    const b = scripts(browse);
    console.log(`    browse-only: inline ${kb(inline)} + ${Object.entries(b.sizes).map(([f, n]) => f + ' ' + kb(n)).join(' + ')} = ${kb(b.total)}`);
    check(b.total <= 60 * 1024, `a menu to browse loads ${kb(b.total)} of script in all`);
    check(browse.seen.includes('/assets/material-icons.ordering.js') && !browse.seen.includes('/assets/material-icons.js'), 'the icon subset, not the full set, when every glyph is in it');
    check(!browse.seen.includes('/assets/orderpro-guest.js'), 'no guest page module without Order Pro');

    const table = await open(tr, ctx, 's=parity-table&t=4');
    await table.waitForSelector('#screen-menu.is-active [data-card="tajine"]', { timeout: 15000 });
    const first = scripts(table);
    await sleep(1500);
    const all = scripts(table);
    const blocking = all.total - (all.sizes['orderpro-guest.js'] || 0);
    console.log(`    seated table: inline ${kb(inline)} + ${Object.entries(all.sizes).map(([f, n]) => f + ' ' + kb(n)).join(' + ')} = ${kb(all.total)}`);
    check(blocking <= 60 * 1024, `a seated table: ${kb(blocking)} before the guest page module, which loads after the first screen (${kb(all.total)} with it)`);
    check(all.sizes['orderpro-guest.js'] > 0 && !/<script src="assets\/orderpro-guest/.test(fs.readFileSync(path.join(root, 'OrderPro.html'), 'utf8')), 'the guest page module still arrives, from the lazy template');
    check(first.total <= all.total && table.errors.length === 0 && browse.errors.length === 0, 'no page error' + ([...table.errors, ...browse.errors].length ? ': ' + [...table.errors, ...browse.errors].join(' | ') : ''));
  });
  await S.run('a boutique · its own file, loaded for a boutique only', async (tr) => {
    const ctx = await browser.createBrowserContext(); tr.defer(() => ctx.close());
    const page = await open(tr, ctx, 's=parity-shop');
    await page.waitForSelector('#screen-boutique.is-active [data-bq="p1"]', { timeout: 15000 });
    check(page.seen.includes('/assets/orderpro-boutique.js') && !page.seen.includes('/assets/orderpro-guest.js'), 'the boutique file loads, the guest page module does not');
    check(/Chemise lin/.test(await page.$eval('#screen-boutique', (e) => e.textContent)) && /249/.test(await page.$eval('#screen-boutique', (e) => e.textContent)), 'the products and their prices');
    await page.type('#bq-search', 'pantalon');
    await page.waitForFunction(() => !document.querySelector('[data-bq="p1"]') && !!document.querySelector('[data-bq="p2"]'), { timeout: 3000 });
    check(true, 'the search filters the list');
    await sleep(500);
    await page.tap('[data-bq="p2"]');
    await page.waitForSelector('#bq-detail.is-open', { timeout: 3000 });
    check(/Pantalon toile/.test(await page.$eval('#bq-detail', (e) => e.textContent)), 'a product opens its sheet');
    await page.tap('[data-close-bq]');
    await page.waitForFunction(() => !document.querySelector('#bq-detail.is-open'), { timeout: 3000 });
    await page.tap('#bq-scan-open');
    await page.waitForSelector('#bq-scan.is-open', { timeout: 3000 });
    await page.type('#bq-manual', '6111000000017');
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => /Chemise lin/.test((document.querySelector('#bq-detail.is-open') || {}).textContent || ''), { timeout: 3000 });
    check(true, 'a barcode typed by hand finds its product');
    const table = await open(tr, ctx, 's=parity-table&t=4');
    await table.waitForSelector('#screen-menu.is-active', { timeout: 15000 });
    await sleep(1200);
    check(!table.seen.includes('/assets/orderpro-boutique.js'), 'a restaurant never loads it');
    check(!page.errors.length && !table.errors.length, 'no page error' + ([...page.errors, ...table.errors].length ? ': ' + [...page.errors, ...table.errors].join(' | ') : ''));
  });

  await S.run('the 2027 skin · globe, iPad cart pane, desktop column, the basic page (§13, §4.1)', async (tr) => {
    const ctx = await browser.createBrowserContext(); tr.defer(() => ctx.close());
    const off = await open(tr, ctx, 's=parity-table&t=4');
    await off.waitForSelector('#screen-menu.is-active [data-card="tajine"]', { timeout: 15000 });
    check(!off.seen.some((p) => /ordering\.css|tokens-2027\.css/.test(p)) && !(await off.$('.lang-globe'))
      && (await off.evaluate(() => document.documentElement.getAttribute('data-skin-2027'))) === null, 'flag off: no skin, no kit sheet, the shipped picker');

    const phone = await open(tr, ctx, 's=parity-table&t=4&skin=2027');
    await phone.waitForSelector('#screen-menu.is-active [data-card="tajine"]', { timeout: 15000 });
    check(phone.seen.includes('/assets/kit/tokens-2027.css') && phone.seen.includes('/assets/kit/ordering.css'), 'flag on: the kit’s tokens and the skin’s sheet load');
    check(await phone.evaluate(() => getComputedStyle(document.body).getPropertyValue('--forest').trim() === getComputedStyle(document.body).getPropertyValue('--k-accent').trim()), 'the page’s own colours are repainted with the 2027 tokens');
    check(await visible(phone, '.lang-globe') && !(await visible(phone, '.lang-btn[data-lang="en"]')), 'phone: a globe in the header, the languages folded under it');
    /* Spec §6.1: the page's own picker, painted and then folded into the
       globe, was 0.0047 of the first load's shift on the Android emulator. */
    const pickerShift = await phone.evaluate(() => new Promise((done) => {
      let sum = 0;
      const o = new PerformanceObserver((l) => {
        for (const e of l.getEntries()) {
          if ((e.sources || []).some((s) => { const n = s.node && (s.node.nodeType === 1 ? s.node : s.node.parentElement); return !!(n && n.closest('#lang-picker')); })) sum += e.value;
        }
      });
      o.observe({ type: 'layout-shift', buffered: true });
      setTimeout(() => { o.disconnect(); done(sum); }, 300);
    }));
    check(pickerShift === 0, `the globe takes the picker's place without moving it (layout shift ${pickerShift.toFixed(4)})`);
    await shot(phone, 'skin-phone');
    await phone.tap('.lang-globe');
    await phone.waitForSelector('.lang-picker.is-open .lang-btn[data-lang="en"]', { visible: true, timeout: 3000 });
    check((await phone.$eval('.lang-globe', (e) => e.getAttribute('aria-expanded'))) === 'true', 'the globe opens them, and says so');
    await phone.tap('.lang-btn[data-lang="en"]');
    await phone.waitForFunction(() => document.documentElement.lang === 'en' && !document.querySelector('.lang-picker.is-open'), { timeout: 3000 });
    check(true, 'a language picked closes it, and the page is in English');
    const js = scripts(phone);
    console.log(`    skin on: inline ${kb(inline)} + ${Object.entries(js.sizes).map(([f, n]) => f + ' ' + kb(n)).join(' + ')} = ${kb(js.total)}`);
    check(js.total - (js.sizes['orderpro-guest.js'] || 0) <= 60 * 1024, `the skin adds no script: ${kb(js.total - (js.sizes['orderpro-guest.js'] || 0))} before the guest page module`);

    const ipad = await open(tr, ctx, 's=parity-table&t=4&skin=2027', { width: 834, height: 1194 });
    await ipad.waitForSelector('#screen-menu.is-active [data-card="tajine"]', { timeout: 15000 });
    await sleep(800);
    const pane = await ipad.evaluate(() => {
      const r = document.querySelector('#cart-sheet .cart-sheet-panel').getBoundingClientRect();
      const m = document.getElementById('screen-menu').getBoundingClientRect();
      const cols = getComputedStyle(document.getElementById('menu-list')).gridTemplateColumns.split(' ').length;
      return { w: Math.round(r.width), x: Math.round(r.left), menuW: Math.round(m.width), cols, pill: getComputedStyle(document.getElementById('cart-pill')).display };
    });
    check(pane.w === 340 && pane.x === 834 - 340 && pane.menuW === 834 - 340 && pane.cols === 2 && pane.pill === 'none',
      `iPad: the menu in 2 columns, the cart a pane of 340 beside it (${JSON.stringify(pane)})`);
    await sleep(700);
    await ipad.tap('[data-card="the"] .dish-add, [data-add="the"]');
    await ipad.waitForFunction(() => /Thé/.test(document.getElementById('cart-items').textContent), { timeout: 3000 });
    check(true, 'a dish added shows in the pane at once');
    await shot(ipad, 'skin-ipad');

    const desk = await open(tr, ctx, 's=parity-table&t=4&skin=2027', { width: 1440, height: 900 });
    await desk.waitForSelector('#screen-menu.is-active [data-card="tajine"]', { timeout: 15000 });
    await sleep(800);
    const col = await desk.evaluate(() => {
      const a = document.getElementById('app').getBoundingClientRect();
      return { w: Math.round(a.width), x: Math.round(a.left), cols: getComputedStyle(document.getElementById('menu-list')).gridTemplateColumns.split(' ').length };
    });
    check(col.w === 1000 && col.x === 220 && col.cols === 3, `desktop: a centred column of 1000, the menu in 3 columns (${JSON.stringify(col)})`);
    await shot(desk, 'skin-desktop');

    const old = tr.watch(await ctx.newPage());
    await old.setRequestInterception(true);
    const oldSeen = [];
    old.on('request', (r) => { route(r, oldSeen); });
    await old.evaluateOnNewDocument(() => { CSS.supports = () => false; });
    await old.goto(base + '/OrderPro.html?s=parity-table&t=4&skin=2027', { waitUntil: 'load' });
    await old.waitForFunction(() => location.pathname === '/order/basic', { timeout: 8000 });
    const said = await old.evaluate(() => ({ text: document.body.textContent, scripts: document.scripts.length }));
    check(/Montrez ce menu au personnel pour commander/.test(said.text) && /Tajine kefta/.test(said.text) && /65/.test(said.text) && said.scripts === 0,
      'below the guest minimum: the basic page, the menu with its prices and ordering.basic, no script');
    check([off, phone, ipad, desk].every((p) => !p.errors.length), 'no page error' + ([off, phone, ipad, desk].flatMap((p) => p.errors).join(' | ') ? ': ' + [off, phone, ipad, desk].flatMap((p) => p.errors).join(' | ') : ''));
  });
} finally {
  await browser.close().catch(() => {});
  server.close();
}
console.log(`✓ orderpro-parity-browser-test · ${checks} checks`);
await S.finish();
