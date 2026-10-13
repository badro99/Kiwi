#!/usr/bin/env node
/* « À suivre » et « Envoyer la suite » sur l'écran cuisine DISTANT.
 *
 * La caisse retenait des plats « à suivre » et les lançait ensuite d'un geste,
 * mais rien de tout ça ne quittait le comptoir : kiwi-cuisine.html voyait
 * l'entrée seule, puis un bon de plats anonyme. Ce banc fait parler la vraie
 * tablette au VRAI functions/api/order/queue.js, sur une base SQLite bâtie
 * depuis schema.sql :
 *
 *   1 · le relais (assets/kitchen-relay.js) porte course et following ;
 *   2 · le serveur garde l'annonce à côté du bon, marque les lignes de la
 *       suite, et éteint l'annonce quand la suite part ;
 *   3 · la tablette montre « À suivre · 2× … » sur le premier bon, puis
 *       « Suite » sur le second, et l'annonce s'efface sans rechargement ;
 *   4 · une base sans la table d'annonces sert toujours ses bons.
 *
 * Aucun code saisi. La tablette est posée « appairée » sur un commerce de test
 * qui n'existe que dans la base en mémoire de ce test. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

import { tillToken, TILL_COOKIE } from '../functions/auth/_lib.js';
import * as queue from '../functions/api/order/queue.js';

const root = process.env.KIWI_ROOT || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let puppeteer;
try { puppeteer = createRequire(path.join(root, 'app/package.json'))('puppeteer-core'); }
catch { console.log('○ skip: puppeteer-core unavailable'); process.exit(process.env.CI ? 1 : 0); }
const bin = process.env.KIWI_CHROMIUM_BIN || ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/chromium', '/usr/bin/google-chrome'].find(fs.existsSync);
if (!bin) { console.log('○ skip: Chromium unavailable'); process.exit(process.env.CI ? 1 : 0); }

const MERCHANT = 'course-follow-bistro';
const AUTH_SECRET = 'kds-course-follow-secret';
function makeDb(withFollowing) {
  const sql = new DatabaseSync(':memory:');
  for (const stmt of fs.readFileSync(path.join(root, 'schema.sql'), 'utf8').replace(/--[^\n]*/g, '').split(';').map((s) => s.trim()).filter(Boolean)) {
    if (!withFollowing && /order_following/.test(stmt)) continue;
    sql.exec(stmt);
  }
  sql.prepare('INSERT INTO merchant_config (merchant, features, name, updated_ts) VALUES (?, ?, ?, ?)')
    .run(MERCHANT, JSON.stringify({ orderpro: true }), 'Course Follow Bistro', Date.now());
  const DB = {
    /* Une base d'avant la table d'annonces : la créer au premier usage est
       justement ce qu'on veut empêcher ici, pour voir le repli. */
    noCreate: !withFollowing,
    prepare(query) {
      let args = [];
      const st = {
        bind(...a) { args = a.map((v) => (v === undefined ? null : v)); return st; },
        first() { const r = sql.prepare(query).get(...args); return r === undefined ? null : r; },
        all() { return { results: sql.prepare(query).all(...args) }; },
        run() {
          if (DB.noCreate && /CREATE TABLE IF NOT EXISTS order_following/.test(query)) throw new Error('no such table: order_following');
          const r = sql.prepare(query).run(...args); return { success: true, meta: { changes: r.changes } };
        },
      };
      return st;
    },
    async batch(statements) {
      sql.exec('BEGIN IMMEDIATE');
      try { const out = []; for (const s of statements) out.push(await s.run()); sql.exec('COMMIT'); return out; }
      catch (e) { try { sql.exec('ROLLBACK'); } catch (_) {} throw e; }
    },
  };
  return { sql, env: { DB, AUTH_SECRET } };
}
const cookie = `${TILL_COOKIE}=${await tillToken(AUTH_SECRET, MERCHANT)}`;

let checks = 0;
const check = (yes, msg) => { assert.ok(yes, msg); checks++; console.log('  ✓ ' + msg); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function call(env, method, body, query = '') {
  const url = 'https://kiwi.test/api/order/queue' + (query || '');
  const request = new Request(url, { method, headers: { 'Content-Type': 'application/json', Cookie: cookie }, body: body ? JSON.stringify(body) : undefined });
  const res = await (method === 'POST' ? queue.onRequestPost : queue.onRequestGet)({ request, env, waitUntil() {} });
  return { status: res.status, body: await res.json() };
}
const starterTicket = (id, following) => ({ merchant: MERCHANT, create: {
  id, mode: 'table', table: '7', server: 'Salma',
  lines: [{ name: 'Harira', qty: 2, unitPrice: 25, note: '', visuals: [], station: '' }],
  following,
} });
const suiteTicket = (id) => ({ merchant: MERCHANT, create: {
  id, mode: 'table', table: '7', server: 'Salma', course: 'suite',
  lines: [{ name: 'Tajine kefta', qty: 2, unitPrice: 85, note: '', visuals: [], station: '' }],
} });

console.log('■ 2 · the real queue keeps the announcement and the suite mark');
{
  const { sql, env } = makeDb(true);
  const a = await call(env, 'POST', starterTicket('ord-follow-0001', [{ name: 'Tajine kefta', qty: 2 }, { name: '', qty: 1 }]));
  check(a.status === 200 && a.body.ok, 'a starter ticket with a following list is accepted');
  const stored = sql.prepare('SELECT items, table_no, cleared_ts FROM order_following WHERE order_id = ?').get('ord-follow-0001');
  check(stored && JSON.parse(stored.items).length === 1 && stored.table_no === '7' && stored.cleared_ts == null,
    'the announcement is stored beside the ticket, nameless items dropped');
  const totalRow = sql.prepare('SELECT total, lines FROM orders WHERE id = ?').get('ord-follow-0001');
  check(totalRow.total === 50 && JSON.parse(totalRow.lines).length === 1, 'the held dishes are not lines and are not charged (total 50)');
  let g = await call(env, 'GET', null, `?merchant=${MERCHANT}&since=0`);
  let o1 = g.body.orders.find((o) => o.id === 'ord-follow-0001');
  check(o1 && Array.isArray(o1.following) && o1.following[0].name === 'Tajine kefta' && o1.following[0].qty === 2,
    'the queue read gives the kitchen « following: 2× Tajine kefta »');

  const b = await call(env, 'POST', suiteTicket('ord-follow-0002'));
  check(b.status === 200 && b.body.ok, 'the suite ticket is accepted');
  const lines2 = JSON.parse(sql.prepare('SELECT lines FROM orders WHERE id = ?').get('ord-follow-0002').lines);
  check(lines2.every((l) => l.course === 'suite'), 'its lines carry course: suite');
  check(sql.prepare('SELECT cleared_ts FROM order_following WHERE order_id = ?').get('ord-follow-0001').cleared_ts > 0,
    'sending the suite clears the announcement of the earlier ticket');
  g = await call(env, 'GET', null, `?merchant=${MERCHANT}&since=0`);
  o1 = g.body.orders.find((o) => o.id === 'ord-follow-0001');
  check(o1 && !o1.following, 'a fresh read no longer announces it');

  const forged = await call(env, 'POST', { merchant: MERCHANT, create: { ...starterTicket('ord-follow-0003').create, course: 'dessert' } });
  check(forged.body.ok && JSON.parse(sql.prepare('SELECT lines FROM orders WHERE id = ?').get('ord-follow-0003').lines).every((l) => !l.course),
    'an unknown course value is ignored');
  const away = await call(env, 'POST', { merchant: MERCHANT, create: { ...starterTicket('ord-follow-0004', [{ name: 'Tajine', qty: 1 }]).create, mode: 'takeout', table: '' } });
  check(away.body.ok && !sql.prepare('SELECT 1 FROM order_following WHERE order_id = ?').get('ord-follow-0004'),
    'a takeaway announces nothing (no table to follow)');
}

console.log('■ 4 · a database without the announcement table still serves tickets');
{
  const { sql, env } = makeDb(false);
  const a = await call(env, 'POST', starterTicket('ord-follow-0101', [{ name: 'Tajine kefta', qty: 2 }]));
  check(a.status === 200 && a.body.ok, 'the ticket is accepted even though the announcement cannot be stored');
  const b = await call(env, 'POST', suiteTicket('ord-follow-0102'));
  check(b.status === 200 && b.body.ok, 'and so is the suite');
  const g = await call(env, 'GET', null, `?merchant=${MERCHANT}&since=0`);
  check(g.status === 200 && g.body.orders.length === 2 && g.body.orders.every((o) => !o.following), 'the read serves both, without announcements');
  check(!sql.prepare("SELECT name FROM sqlite_master WHERE name = 'order_following'").get(), '(the table really was absent)');
}

console.log('■ 1 + 3 · kiwi-cuisine.html against the real queue');
const { sql, env } = makeDb(true);
const posts = [];
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.json': 'application/json', '.png': 'image/png', '.webp': 'image/webp' };
const server = http.createServer((req, res) => {
  const p = path.resolve(root, '.' + decodeURIComponent(new URL(req.url, 'http://local').pathname));
  if (!p.startsWith(root + path.sep)) { res.writeHead(403); res.end(); return; }
  fs.readFile(p, (err, data) => { res.writeHead(err ? 404 : 200, { 'Content-Type': mime[path.extname(p)] || 'application/octet-stream' }); res.end(err ? '' : data); });
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await puppeteer.launch({ executablePath: bin, headless: true, args: ['--no-sandbox'] });
async function route(r) {
  const u = r.url();
  if (!u.startsWith(base + '/api/')) return u.startsWith(base) || u.startsWith('data:') ? r.continue() : r.abort();
  const url = new URL(u);
  if (url.pathname !== '/api/order/queue') return r.respond({ status: 404, contentType: 'application/json', body: '{"error":"not-found"}' });
  const method = r.method();
  const body = method === 'POST' ? r.postData() : undefined;
  if (body) posts.push(JSON.parse(body));
  const request = new Request(url.toString(), { method, headers: { 'Content-Type': 'application/json', Cookie: cookie }, body });
  try {
    const res = await (method === 'POST' ? queue.onRequestPost : queue.onRequestGet)({ request, env, waitUntil() {} });
    r.respond({ status: res.status, contentType: 'application/json', body: await res.text() });
  } catch (e) {
    r.respond({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: String(e && e.message) }) });
  }
}

try {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.setViewport({ width: 1280, height: 860 });
  await page.setBypassServiceWorker(true);
  await page.setRequestInterception(true);
  page.on('request', (r) => { route(r); });
  await page.evaluateOnNewDocument((m) => {
    localStorage.setItem('kiwiLiveMerchant', m);
    localStorage.setItem('kiwiPaired', '1');
    if (!localStorage.getItem('kiwiCuisineLang')) localStorage.setItem('kiwiCuisineLang', 'fr');
  }, MERCHANT);
  await page.goto(base + '/kiwi-cuisine.html', { waitUntil: 'load' });
  await page.waitForFunction(() => window.KiwiKitchenRelay && typeof KiwiKitchenRelay.send === 'function', { timeout: 20000 });

  /* 1 · Le vrai module de relais, appelé comme la caisse l'appelle. */
  const sent = await page.evaluate(() => KiwiKitchenRelay.send({
    id: 'ord-follow-web-0001', mode: 'table', table: '4', server: 'Salma',
    lines: [{ name: 'Harira', qty: 2, unitPrice: 25, note: '', visuals: [], station: '' }],
    following: [{ name: 'Tajine kefta', qty: 2 }],
  }));
  check(sent && sent.ok, 'the relay module delivers the starter ticket');
  const p1 = posts.find((p) => p.create && p.create.id === 'ord-follow-web-0001');
  check(p1 && Array.isArray(p1.create.following) && p1.create.following[0].qty === 2 && !p1.create.course,
    'its body carries following and no course');

  const card1 = '[data-tk="ord-follow-web-0001"]';
  await page.waitForSelector(`#s-new ${card1}`, { timeout: 20000 });
  await page.waitForFunction((c) => /À suivre/.test((document.querySelector(c + ' .tk-following') || {}).textContent || ''), { timeout: 10000 }, `#s-new ${card1}`);
  const follow1 = await page.$eval(`#s-new ${card1} .tk-following`, (n) => n.textContent.replace(/\s+/g, ' ').trim());
  check(follow1 === 'À suivre2× Tajine kefta' || follow1 === 'À suivre 2× Tajine kefta', `the first card announces it (« ${follow1} »)`);
  check(await page.$(`#s-new ${card1} .chip.suite`) === null, 'and is not marked as a suite');
  check(await page.$$eval(`#s-new ${card1} .tk-items li`, (li) => li.length) === 1, 'the held dish is not a line to cook');

  const sent2 = await page.evaluate(() => KiwiKitchenRelay.send({
    id: 'ord-follow-web-0002', mode: 'table', table: '4', server: 'Salma', course: 'suite',
    lines: [{ name: 'Tajine kefta', qty: 2, unitPrice: 85, note: '', visuals: [], station: '' }],
  }));
  check(sent2 && sent2.ok, 'the relay module delivers the suite');
  check(posts.some((p) => p.create && p.create.id === 'ord-follow-web-0002' && p.create.course === 'suite'), 'its body carries course: suite');

  const card2 = '[data-tk="ord-follow-web-0002"]';
  await page.waitForSelector(`#s-new ${card2} .chip.suite`, { timeout: 20000 });
  check((await page.$eval(`#s-new ${card2} .chip.suite`, (n) => n.textContent.trim())) === 'Suite', 'the second card reads « Suite »');
  check(await page.$(`#s-new ${card1} .tk-following`) === null, 'the first card stops announcing it, without a reload');

  /* L'arabe et l'anglais ont leurs propres mots. */
  for (const [lang, suite] of [['en', 'Next course'], ['ar', 'الطبق التالي']]) {
    await page.evaluate((l) => { localStorage.setItem('kiwiCuisineLang', l); }, lang);
    await page.reload({ waitUntil: 'load' });
    await page.waitForSelector(`${card2} .chip.suite`, { timeout: 20000 });
    check((await page.$eval(`${card2} .chip.suite`, (n) => n.textContent.trim())) === suite, `${lang}: « ${suite} »`);
  }
  check(errors.length === 0, 'no page error' + (errors.length ? ': ' + errors[0] : ''));
  await ctx.close();
} finally {
  await browser.close();
  server.close();
}
console.log(`\nkds-course-following: ${checks} passed`);
