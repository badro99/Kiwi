#!/usr/bin/env node
/* kds-board-browser-test · the kitchen board on the kit's lanes (stage 3b,
 * §10.28, §13.6, §18.7), behind kiwiSkin2027:kds, in a real Chromium, with
 * real clicks inside the lanes, against the REAL functions/api/order/queue.js
 * on a SQLite base built from schema.sql.
 *
 *   node tools/kds-board-browser-test.mjs
 *
 * The tablet is set "paired" to a test store that exists only in this suite's
 * in-memory base. No code is typed, no real store is touched.
 *
 * What it holds:
 *   · flag off: no kit file is fetched and the shipped cards stay;
 *   · flag on: each column holds one <k-lane> and no shipped card; a ticket
 *     carries its number, its source ("Table 5", delivery, takeaway), its
 *     lines with their note, option and other-station dimming, and its tone
 *     (calm, warning at 8 min, late at 15 with the word);
 *   · Start, Mark ready, Back to the kitchen, Mark ready, Mark served: each
 *     tap moves the ticket at once and the base follows every gesture;
 *   · a ticket crossing 8 minutes turns warning in place: the same node,
 *     no rebuild under a finger;
 *   · a cancellation sent by the till shows its alert and its two actions;
 *     Stop cooking removes the line in the base and on the ticket;
 *   · the wall never scrolls: more tickets than fit end in the newer card,
 *     whose sheet holds the rest, and a Start there works;
 *   · Arabic: the page is RTL and the lanes speak Arabic;
 *   · the till's own board (kiwiSkin2027:till, demo till): three lanes at the
 *     till's 16 px root, the recipe button, Start, Mark ready into the ready
 *     history with recall and no served, and recall back;
 *   · no page error anywhere. */
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
const MERCHANT = 'kds-board-browser-bistro';
const AUTH_SECRET = 'kds-board-browser-secret';
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
const env = { DB, AUTH_SECRET };
sql.prepare('INSERT INTO merchant_config (merchant, features, name, updated_ts) VALUES (?, ?, ?, ?)')
  .run(MERCHANT, JSON.stringify({ orderpro: true }), 'Board Browser Bistro', Date.now());
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
const S = suite('kds-board', { browser });
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

/* The lanes are shadow roots: every query goes through the lane. */
const COL = { new: 's-new', cook: 's-cook', pass: 's-pass' };
async function inLane(page, col, id) {
  return page.evaluate((sid, id) => {
    const l = document.querySelector('#' + sid + ' k-lane');
    return !!(l && l.shadowRoot && l.shadowRoot.querySelector('[data-t="' + id + '"]'));
  }, COL[col], id);
}
async function waitIn(page, col, id, timeout = 8000) {
  await page.waitForFunction((sid, id) => {
    const l = document.querySelector('#' + sid + ' k-lane');
    return !!(l && l.shadowRoot && l.shadowRoot.querySelector('[data-t="' + id + '"]'));
  }, { timeout }, COL[col], id);
}
async function ticket(page, col, id) {
  return page.evaluate((sid, id) => {
    const l = document.querySelector('#' + sid + ' k-lane');
    const a = l && l.shadowRoot.querySelector('[data-t="' + id + '"]');
    if (!a) return null;
    return {
      cls: a.className,
      no: (a.querySelector('.no') || {}).textContent || '',
      src: Array.from(a.querySelectorAll('.src')).map((s) => s.textContent.trim()),
      text: a.textContent.replace(/\s+/g, ' ').trim(),
      off: Array.from(a.querySelectorAll('.it.off .n')).map((n) => n.textContent),
      actions: Array.from(a.querySelectorAll('[data-w]')).map((b) => b.getAttribute('data-w')),
    };
  }, COL[col], id);
}
async function tap(page, col, id, w) {
  const h = await page.evaluateHandle((sid, id, w) => {
    const l = document.querySelector('#' + sid + ' k-lane');
    return l && l.shadowRoot.querySelector('[data-t="' + id + '"] [data-w="' + w + '"]');
  }, COL[col], id, w);
  const el = h.asElement();
  assert.ok(el, `button ${w} on ${id} in ${col}`);
  await el.click();
}
async function until(fn, ms = 5000) {
  for (let i = 0; i < ms / 100; i++) { if (fn()) return true; await sleep(100); }
  return fn();
}

try {
  await S.run('flag off · the shipped cards, no kit file fetched', async (tr) => {
    clearOrders();
    addOrder({ id: 'ord-board-off', table: '3', ageMs: 2 * 60000, lines: [line('Harira')] });
    const ctx = await browser.createBrowserContext(); tr.defer(() => ctx.close());
    const page = await open(tr, ctx, { flag: false });
    await page.waitForSelector('#s-new [data-tk="ord-board-off"]', { timeout: 20000 });
    check(true, 'the shipped card arrives in Nouvelles');
    check(page.kitFetched.length === 0, `no kit file fetched with the flag off (${page.kitFetched.join(', ') || 'none'})`);
    check(await page.evaluate(() => !document.querySelector('k-lane') && !document.documentElement.hasAttribute('data-skin-2027')), 'no lane, no skin attribute');
    check(page.errors.length === 0, 'no page error' + (page.errors.length ? ': ' + page.errors.join(' | ') : ''));
  });

  await S.run('flag on · lanes, tones, and the four gestures against the real queue', async (tr) => {
    clearOrders();
    const A = 'ord-board-a', B = 'ord-board-b', C = 'ord-board-c', D = 'ord-board-d';
    addOrder({ id: A, table: '5', ageMs: 3 * 60000, lines: [line('Tajine kefta', { note: 'Sans piment', visuals: [{ name: 'sans oignon' }] }), line('Thé', { station: 'bar' })] });
    /* B, C and D are already started: Preparing, three columns at 1920. */
    addOrder({ id: B, mode: 'delivery', ageMs: 10 * 60000, lines: [line('Couscous', { stationAccepted: true })] });
    addOrder({ id: C, mode: 'takeout', ageMs: 16 * 60000, lines: [line('Pastilla', { stationAccepted: true })] });
    addOrder({ id: D, table: '9', ageMs: 7 * 60000 + 56000, lines: [line('Zaalouk', { stationAccepted: true })] });
    const ctx = await browser.createBrowserContext(); tr.defer(() => ctx.close());
    const page = await open(tr, ctx);

    tr.step('the lanes');
    await waitIn(page, 'new', A, 20000);
    check(await page.evaluate(() => ['s-new', 's-cook', 's-pass'].every((id) => document.querySelectorAll('#' + id + ' > k-lane').length === 1)), 'each column holds one <k-lane>');
    check(await page.evaluate(() => !document.querySelector('.stack .tk')), 'no shipped card is drawn');
    check(await page.evaluate(() => document.documentElement.getAttribute('data-k-surface') === 'kds'), 'the page is the kitchen surface (its own root, §13.6)');
    check(page.kitFetched.some((p) => p.endsWith('/kds-board.js')) && page.kitFetched.some((p) => p.endsWith('/kds.js')), 'the kit and the board adapter are fetched');

    tr.step('a ticket says what the shipped card said');
    let a = await ticket(page, 'new', A);
    check(a.src[0] === 'Table 5', `the source capsule names the table (${a.src[0]})`);
    check(/Tajine kefta/.test(a.text) && /Sans piment/.test(a.text) && /sans oignon/.test(a.text), 'the line, its note and its option are drawn');
    check(a.cls.includes('calm') && a.actions.includes('start'), 'a 3-minute ticket is calm and offers Start');
    const b = await ticket(page, 'cook', B);
    check(b.cls.includes('warning') && b.src[0] === 'Livraison', `10 minutes is warning, and delivery is named (${b.src[0]})`);
    const c = await ticket(page, 'cook', C);
    check(c.cls.includes('late') && /En retard/.test(c.text) && c.src[0] === 'À emporter', 'past 15 minutes the ticket is late, with the word');
    check(await page.evaluate(() => { const l = document.querySelector('#s-pass k-lane'); return l.shadowRoot.textContent.includes('Le passe est vide'); }), 'the empty Ready lane says the pass is clear');

    tr.step('crossing 8 minutes, in place');
    await page.evaluate((id) => { const l = document.querySelector('#s-cook k-lane'); l.shadowRoot.querySelector('[data-t="' + id + '"]').__probe = 1; }, D);
    check((await ticket(page, 'cook', D)).cls.includes('calm'), 'at 7 min 56 s the ticket is calm');
    await page.waitForFunction((id) => { const l = document.querySelector('#s-cook k-lane'); const a = l.shadowRoot.querySelector('[data-t="' + id + '"]'); return a && a.classList.contains('warning'); }, { timeout: 8000 }, D);
    check(await page.evaluate((id) => { const l = document.querySelector('#s-cook k-lane'); return l.shadowRoot.querySelector('[data-t="' + id + '"]').__probe === 1; }, D), 'it turns warning on the same node: no rebuild');

    tr.step('Start');
    await tap(page, 'new', A, 'start');
    await waitIn(page, 'cook', A, 3000);
    check(!(await inLane(page, 'new', A)), 'Start moves the ticket to Preparing at once');
    check(await until(() => JSON.parse(row(A).lines).every((l) => l.stationAccepted === true)), `the base has every line accepted (${JSON.stringify(posts.slice(-3))} ${answers.slice(-3).join(' | ')})`);
    a = await ticket(page, 'cook', A);
    check(a.actions.includes('ready'), 'Preparing offers Mark ready');

    tr.step('Mark ready');
    await tap(page, 'cook', A, 'ready');
    await waitIn(page, 'pass', A, 3000);
    check(await until(() => row(A).status === 'ready'), 'Mark ready: the base says ready');
    a = await ticket(page, 'pass', A);
    check(/Prêt à \d\d:\d\d/.test(a.text) && a.actions.includes('served') && a.actions.includes('recall'), 'the Ready card shows its time, Mark served and Back to the kitchen');

    tr.step('Back to the kitchen');
    await tap(page, 'pass', A, 'recall');
    await waitIn(page, 'cook', A, 3000);
    check(await until(() => row(A).status === 'accepted'), 'the base has the order back in preparation');
    check(posts.some((p) => p.id === A && p.status === 'recall'), 'the named recall gesture was sent');
    await sleep(5600);
    check(await inLane(page, 'cook', A) && !(await inLane(page, 'pass', A)), 'after the next poll it stays in Preparing');

    tr.step('Mark ready, then Mark served');
    await tap(page, 'cook', A, 'ready');
    await waitIn(page, 'pass', A, 3000);
    check(await until(() => row(A).status === 'ready'), 'ready again in the base');
    await tap(page, 'pass', A, 'served');
    await page.waitForFunction((id) => { const l = document.querySelector('#s-pass k-lane'); return !l.shadowRoot.querySelector('[data-t="' + id + '"]'); }, { timeout: 3000 }, A);
    check(await until(() => row(A).status === 'served'), 'Mark served: the ticket leaves and the base says served');
    check(page.errors.length === 0, 'no page error' + (page.errors.length ? ': ' + page.errors.join(' | ') : ''));
  });

  await S.run('flag on · a cancellation from the till', async (tr) => {
    clearOrders();
    const V = 'ord-board-void';
    addOrder({ id: V, table: '7', ageMs: 4 * 60000, lines: [
      { ...line('Brochettes'), qty: 2, voidAlert: { id: 'voi-test-1', qty: 1, reason: 'client_change', isWaste: 0, ts: Date.now() } },
      line('Salade'),
    ] });
    const ctx = await browser.createBrowserContext(); tr.defer(() => ctx.close());
    const page = await open(tr, ctx);
    await waitIn(page, 'new', V, 20000);
    const v = await ticket(page, 'new', V);
    check(/Annulé\s: 1× Brochettes \(Changement client\)/.test(v.text), `the alert names the line, the quantity and the reason (${v.text.slice(0, 160)})`);
    check(v.actions.includes('void-accept') && v.actions.includes('void-reject'), 'it offers Stop cooking and Already plated');
    await tap(page, 'new', V, 'void-accept');
    check(await until(() => { const l = JSON.parse(row(V).lines); return l.length === 2 && l[0].qty === 1 && !l[0].voidAlert; }), 'Stop cooking: the base drops one Brochettes and clears the alert');
    await page.waitForFunction((id) => { const l = document.querySelector('#s-new k-lane'); const a = l.shadowRoot.querySelector('[data-t="' + id + '"]'); return a && !a.querySelector('[data-w="void-accept"]'); }, { timeout: 5000 }, V);
    check(true, 'the alert leaves the ticket');
    check(page.errors.length === 0, 'no page error' + (page.errors.length ? ': ' + page.errors.join(' | ') : ''));
  });

  await S.run('flag on · the wall never scrolls: the newer card and its sheet', async (tr) => {
    clearOrders();
    for (let i = 0; i < 7; i++) addOrder({ id: 'ord-board-n' + i, table: String(10 + i), ageMs: (7 - i) * 60000, lines: [line('Harira'), line('Msemen')] });
    const ctx = await browser.createBrowserContext(); tr.defer(() => ctx.close());
    const page = await open(tr, ctx, { width: 1280, height: 800 });
    await waitIn(page, 'new', 'ord-board-n0', 20000);
    const st = await page.evaluate(() => {
      const l = document.querySelector('#s-new k-lane');
      const nw = l.shadowRoot.querySelector('[data-w="newer"]');
      const stack = document.getElementById('s-new');
      return { shown: Number(l.getAttribute('data-shown')), newer: nw ? nw.textContent.trim() : '', scroll: stack.scrollHeight <= stack.clientHeight + 1, fits: l.shadowRoot.querySelector('.cols').getBoundingClientRect().bottom <= l.getBoundingClientRect().bottom + 1 };
    });
    check(st.shown > 0 && st.shown < 7, `the lane shows ${st.shown} of 7`);
    check(new RegExp('\\+' + (7 - st.shown) + ' plus récentes').test(st.newer), `the newer card counts the rest (${st.newer})`);
    check(st.scroll && st.fits, 'nothing scrolls and nothing spills past the lane');
    const nw = await page.evaluateHandle(() => document.querySelector('#s-new k-lane').shadowRoot.querySelector('[data-w="newer"]'));
    await nw.asElement().click();
    await page.waitForFunction(() => { const s = document.querySelector('k-sheet'); const l = s && s.querySelector('k-lane'); return s && s.hasAttribute('open') && l && l.hasAttribute('data-shown'); }, { timeout: 5000 });
    await sleep(500);   /* the sheet's entrance (§14) */
    const inSheet = await page.evaluate(() => Array.from(document.querySelector('k-sheet k-lane').shadowRoot.querySelectorAll('[data-t]')).map((a) => a.getAttribute('data-t')));
    check(inSheet.length === 7 - st.shown && inSheet[0] === 'ord-board-n' + st.shown, `the sheet holds the rest, oldest first (${inSheet.join(', ')})`);
    const last = inSheet[inSheet.length - 1];
    const h = await page.evaluateHandle((id) => document.querySelector('k-sheet k-lane').shadowRoot.querySelector('[data-t="' + id + '"] [data-w="start"]'), last);
    await h.asElement().click();
    await waitIn(page, 'cook', last, 3000);
    check(await page.evaluate(() => !document.querySelector('k-sheet').hasAttribute('open')), 'a Start in the sheet moves the ticket and closes the sheet');
    check(page.errors.length === 0, 'no page error' + (page.errors.length ? ': ' + page.errors.join(' | ') : ''));
  });

  await S.run('flag on · Arabic', async (tr) => {
    clearOrders();
    addOrder({ id: 'ord-board-ar', table: '5', ageMs: 2 * 60000, lines: [line('Harira')] });
    const ctx = await browser.createBrowserContext(); tr.defer(() => ctx.close());
    const page = await open(tr, ctx, { lang: 'ar' });
    await waitIn(page, 'new', 'ord-board-ar', 20000);
    const t = await ticket(page, 'new', 'ord-board-ar');
    check(await page.evaluate(() => document.documentElement.dir === 'rtl'), 'the page is right to left');
    check(t.src[0] === 'طاولة 5' && /ابدأ/.test(t.text), `the lane speaks Arabic (${t.src[0]})`);
    check(page.errors.length === 0, 'no page error' + (page.errors.length ? ': ' + page.errors.join(' | ') : ''));
  });

  await S.run('till · its own board on the lanes (demo till, kiwiSkin2027:till)', async (tr) => {
    const ctx = await browser.createBrowserContext(); tr.defer(() => ctx.close());
    const page = tr.watch(await ctx.newPage());
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.setViewport({ width: 1366, height: 900 });
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
    await page.goto(base + '/kiwi-caisse.html', { waitUntil: 'load' });
    await page.waitForFunction(() => typeof doOpenService === 'function' && !!window.KiwiKdsBoard, { timeout: 30000 });
    await page.evaluate(() => doOpenService());
    await page.waitForFunction(() => document.body.classList.contains('is-unlocked'), { timeout: 20000 });
    await sleep(400);
    /* A local ticket (the demo till has no server queue), with a dish the
       demo's recipes know. */
    const num = await page.evaluate(() => {
      const t = { num: 901, type: 'dineIn', table: '6', status: 'new', sentAt: new Date(Date.now() - 2 * 60000),
        items: [{ q: 1, n: 'Couscous royal', note: 'sans raisins', stations: ['cuisine'] }, { q: 2, n: 'Thé', stations: ['bar'] }] };
      kdsOrders.push(t);
      return t.num;
    });
    await page.click('#open-kds');
    await page.waitForFunction((n) => { const l = document.querySelector('#kit-new k-lane'); return l && l.shadowRoot.querySelector('[data-t="' + n + '"]'); }, { timeout: 8000 }, String(num));
    check(await page.evaluate(() => !document.querySelector('#kit-new .kit-order') && !!document.querySelector('#kit-cook k-lane') && !!document.querySelector('#kit-history-inner k-lane')), 'the till board draws three lanes and no shipped card');
    check(await page.evaluate(() => !document.documentElement.hasAttribute('data-k-surface') && getComputedStyle(document.documentElement).fontSize === '16px'), 'it keeps the till root, 16 px (§6.2)');
    const t1 = await page.evaluate((n) => { const a = document.querySelector('#kit-new k-lane').shadowRoot.querySelector('[data-t="' + n + '"]'); return { text: a.textContent.replace(/\s+/g, ' '), recipe: !!a.querySelector('[data-w="recipe"]') }; }, String(num));
    check(/Table 6/.test(t1.text) && /sans raisins/.test(t1.text) && t1.recipe, 'the ticket names its table, its note, and links the recipe');

    const click = async (sel, n, w) => {
      const h = await page.evaluateHandle((sel, n, w) => document.querySelector(sel + ' k-lane').shadowRoot.querySelector('[data-t="' + n + '"] [data-w="' + w + '"]'), sel, String(n), w);
      assert.ok(h.asElement(), `${w} on ${n}`);
      await h.asElement().click();
    };
    await click('#kit-new', num, 'recipe');
    await page.waitForSelector('.kit-recipe-backdrop', { timeout: 3000 });
    check(true, 'the recipe button opens the recipe');
    await page.evaluate(() => document.querySelectorAll('.kit-recipe-backdrop').forEach((b) => b.remove()));

    await click('#kit-new', num, 'start');
    await page.waitForFunction((n) => { const l = document.querySelector('#kit-cook k-lane'); return l.shadowRoot.querySelector('[data-t="' + n + '"]'); }, { timeout: 3000 }, String(num));
    check(await page.evaluate((n) => kdsOrders.find((o) => o.num === n).items.every((i) => i.stationAccepted), num), 'Start: Preparing, every line accepted');
    await click('#kit-cook', num, 'ready');
    await page.waitForFunction((n) => kdsOrders.find((o) => o.num === n).status === 'ready', { timeout: 3000 }, num);
    const r = await page.evaluate((n) => { const a = document.querySelector('#kit-history-inner k-lane').shadowRoot.querySelector('[data-t="' + n + '"]'); return a ? Array.from(a.querySelectorAll('[data-w]')).map((b) => b.getAttribute('data-w')) : null; }, String(num));
    check(r && r.includes('recall') && !r.includes('served'), `Mark ready: the ticket is in the ready history, with recall and no served (${r})`);
    await page.click('#kit-history-toggle');
    await sleep(500);
    await click('#kit-history-inner', num, 'recall');
    await page.waitForFunction((n) => { const l = document.querySelector('#kit-cook k-lane'); return l.shadowRoot.querySelector('[data-t="' + n + '"]'); }, { timeout: 3000 }, String(num));
    check(await page.evaluate((n) => kdsOrders.find((o) => o.num === n).status === 'cooking', num), 'recall puts it back in preparation');
    check(errors.length === 0, 'no page error' + (errors.length ? ': ' + errors.join(' | ') : ''));
  });
} finally {
  await browser.close().catch(() => {});
  server.close();
}
console.log(`✓ kds-board-browser-test · ${checks} checks`);
await S.finish();
