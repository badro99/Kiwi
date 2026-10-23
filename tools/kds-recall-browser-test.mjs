#!/usr/bin/env node
/* « Rappeler en cuisine », au vrai clic, sur les deux écrans qui bumpent.
 *
 *   1 · kiwi-cuisine.html (la tablette du passe) parle au VRAI
 *       functions/api/order/queue.js, sur une base SQLite bâtie depuis
 *       schema.sql : Je prends → Prête → Rappeler, et la base suit chaque geste.
 *       Un « Prête » qui n'est jamais parti (réseau tombé) se rappelle sans
 *       requête : il est simplement oublié.
 *   2 · kiwi-caisse.html (l'écran cuisine de la caisse de démo) : Accepter →
 *       Prête → Historique → Rappeler, puis ce que le sondage doit croire ou
 *       non (un rappel venu d'ailleurs, un sondage parti avant le rappel).
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

/* ── La base et le vrai gestionnaire de file ─────────────────────────────── */
const MERCHANT = 'recall-browser-bistro';
const AUTH_SECRET = 'kds-recall-browser-secret';
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
  .run(MERCHANT, JSON.stringify({ orderpro: true }), 'Recall Browser Bistro', Date.now());
const cookie = `${TILL_COOKIE}=${await tillToken(AUTH_SECRET, MERCHANT)}`;
const ORDER = 'ord-recall-browser-0001';
const created = Date.now() - 4 * 60000;
sql.prepare(`INSERT INTO orders (id, merchant, number, mode, table_no, total, lines, status, created_ts, updated_ts, channel)
             VALUES (?, ?, 12, 'table', '5', 120, ?, 'accepted', ?, ?, 'caisse')`)
  .run(ORDER, MERCHANT, JSON.stringify([{ id: 'it-tajine', name: 'Tajine kefta', qty: 1, unitPrice: 120, station: '' }]), created, created);
const dbRow = () => sql.prepare('SELECT status, lines FROM orders WHERE id = ?').get(ORDER);
const posts = [];

/* ── Le serveur statique, et /api routé vers le vrai handler ─────────────── */
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.json': 'application/json', '.png': 'image/png', '.webp': 'image/webp' };
const server = http.createServer((req, res) => {
  const p = path.resolve(root, '.' + decodeURIComponent(new URL(req.url, 'http://local').pathname));
  if (!p.startsWith(root + path.sep)) { res.writeHead(403); res.end(); return; }
  fs.readFile(p, (err, data) => { res.writeHead(err ? 404 : 200, { 'Content-Type': mime[path.extname(p)] || 'application/octet-stream' }); res.end(err ? '' : data); });
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await puppeteer.launch({ executablePath: bin, headless: true, args: ['--no-sandbox'] });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let checks = 0;
const check = (yes, msg) => { assert.ok(yes, msg); checks++; console.log('  ✓ ' + msg); };

let offline = false;
async function route(r) {
  const u = r.url();
  if (!u.startsWith(base + '/api/')) return u.startsWith(base) || u.startsWith('data:') ? r.continue() : r.abort();
  const url = new URL(u);
  if (url.pathname !== '/api/order/queue') return r.respond({ status: 404, contentType: 'application/json', body: '{"error":"not-found"}' });
  if (offline) return r.respond({ status: 503, contentType: 'application/json', body: '{"error":"offline"}' });
  const method = r.method();
  const body = method === 'POST' ? r.postData() : undefined;
  if (body) posts.push(JSON.parse(body));
  const request = new Request(url.toString(), { method, headers: { 'Content-Type': 'application/json', Cookie: cookie }, body });
  const handler = method === 'POST' ? queue.onRequestPost : queue.onRequestGet;
  try {
    const res = await handler({ request, env, waitUntil() {} });
    r.respond({ status: res.status, contentType: 'application/json', body: await res.text() });
  } catch (e) {
    r.respond({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: String(e && e.message) }) });
  }
}

try {
  console.log('■ 1 · kiwi-cuisine.html against the real queue');
  {
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
      localStorage.setItem('kiwiCuisineLang', 'fr');
    }, MERCHANT);
    // coverage: surface=kitchen locale=fr viewport=desktop
    await page.goto(base + '/kiwi-cuisine.html', { waitUntil: 'load' });
    const card = `[data-tk="${ORDER}"]`;
    await page.waitForSelector(`#s-new ${card}`, { timeout: 20000 });
    check(true, 'the accepted ticket arrives in « Nouvelles » from the real queue');

    await page.click(`#s-new ${card} [data-take]`);
    await page.waitForSelector(`#s-cook ${card}`, { timeout: 5000 });
    await page.click(`#s-cook ${card} [data-ready]`);
    await page.waitForSelector(`#s-pass ${card}`, { timeout: 5000 });
    await page.waitForFunction(() => true);
    for (let i = 0; i < 40 && dbRow().status !== 'ready'; i++) await sleep(100);
    check(dbRow().status === 'ready', 'Prête: the card goes to the pass and the database says ready');
    check(await page.$eval(`#s-pass ${card} [data-recall]`, (b) => b.textContent.trim() === 'Rappeler en cuisine'),
      'the pass card offers « Rappeler en cuisine »');

    await page.click(`#s-pass ${card} [data-recall]`);
    await page.waitForSelector(`#s-cook ${card}`, { timeout: 5000 });
    check(true, 'one tap brings the ticket back to « En préparation »');
    for (let i = 0; i < 40 && dbRow().status !== 'accepted'; i++) await sleep(100);
    const after = dbRow();
    check(after.status === 'accepted', 'the database has the order back in preparation');
    check(JSON.parse(after.lines).every((l) => l.recalledAt > 0 && l.stationReady === false), 'its lines carry the recall mark');
    check(posts.some((p) => p.id === ORDER && p.status === 'recall'), 'the tablet sent the named recall gesture');
    const audit = sql.prepare("SELECT COUNT(*) n FROM operational_events WHERE merchant = ? AND event = 'order-recalled'").get(MERCHANT);
    check(audit.n === 1, 'the recall is in the operational journal');

    /* Le prochain sondage ne doit pas le renvoyer au passe. */
    await sleep(6500);
    check(await page.$(`#s-cook ${card}`) !== null && await page.$(`#s-pass ${card}`) === null,
      'after the next poll the ticket is still in preparation');

    /* Un « Prête » tapé hors ligne puis rappelé : il n'est jamais parti, il
       n'y a rien à dire au serveur, il suffit de l'oublier. */
    offline = true;
    const before = posts.length;
    await page.click(`#s-cook ${card} [data-ready]`);
    await page.waitForSelector(`#s-pass ${card}`, { timeout: 5000 });
    await sleep(600);
    await page.click(`#s-pass ${card} [data-recall]`);
    await page.waitForSelector(`#s-cook ${card}`, { timeout: 5000 });
    const queued = await page.evaluate(() => Object.keys(JSON.parse(localStorage.getItem(Object.keys(localStorage).find((k) => /bump/i.test(k)) || '{}') || '{}')));
    check(queued.length === 0, `the unsent « Prête » is dropped from the retry queue (${queued.join(',') || 'empty'})`);
    offline = false;
    await sleep(6500);
    check(dbRow().status === 'accepted' && !posts.slice(before).some((p) => p.status === 'recall'),
      'back online: no recall was needed, the order simply stayed in preparation');
    check(await page.$(`#s-cook ${card}`) !== null, 'and the card stays in preparation');

    /* Le vrai « Prête » ensuite, et la remise. */
    await page.click(`#s-cook ${card} [data-ready]`);
    for (let i = 0; i < 40 && dbRow().status !== 'ready'; i++) await sleep(100);
    check(dbRow().status === 'ready', 'the real « Prête » after the recall reaches the database');
    check(errors.length === 0, 'no page error on the kitchen tablet' + (errors.length ? ': ' + errors.join(' | ') : ''));
    await ctx.close();
  }

  console.log('\n■ 2 · the caisse kitchen screen (demo)');
  {
    const ctx = await browser.createBrowserContext();
    const page = await ctx.newPage();
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
    await page.evaluateOnNewDocument(() => { try { Object.defineProperty(navigator.serviceWorker, 'register', { value: () => new Promise(() => {}), configurable: true }); } catch (_) {} });
    // coverage: surface=caisse-entry locale=fr viewport=desktop
    await page.goto(base + '/kiwi-caisse.html', { waitUntil: 'load' });
    await page.waitForFunction(() => typeof doOpenService === 'function', { timeout: 30000 });
    await page.evaluate(() => doOpenService());
    await page.waitForFunction(() => document.body.classList.contains('is-unlocked') && mode === 'vrap', { timeout: 20000 });
    await sleep(400);

    /* Un bon local (la démo n'a pas de file serveur) : celui qu'une vraie
       commande de salle dépose sur l'écran cuisine. */
    const num = await page.evaluate(() => {
      const t = { num: 900, type: 'dineIn', table: '5', status: 'new', sentAt: new Date(),
        items: [{ q: 1, n: 'Tajine kefta', stations: ['cuisine'] }, { q: 1, n: 'Thé', stations: ['bar'] }] };
      kdsOrders.push(t);
      return t.num;
    });
    await page.click('#open-kds');
    await page.waitForSelector(`#kit-new [data-kit-accept="${num}"]`, { timeout: 8000 });
    await page.click(`#kit-new [data-kit-accept="${num}"]`);
    await page.waitForSelector(`#kit-cook [data-kit-ready="${num}"]`, { timeout: 5000 });
    await page.click(`#kit-cook [data-kit-ready="${num}"]`);
    await page.waitForFunction((n) => kdsOrders.find((o) => o.num === n).status === 'ready', { timeout: 5000 }, num);
    check(true, 'Accepter → Prête: the ticket leaves the board');
    await page.click('#kit-history-toggle');
    await page.waitForSelector(`.kit-hrow[data-kit-eye="${num}"]`, { visible: true, timeout: 5000 });
    await sleep(500); // le volet Historique glisse : on clique une fois posé
    await page.click(`.kit-hrow[data-kit-eye="${num}"]`);
    await page.waitForSelector('.kit-zoom-backdrop.in', { timeout: 5000 });
    await page.waitForSelector(`.kit-zoom [data-kit-recall="${num}"]`, { visible: true, timeout: 5000 });
    check(await page.$eval(`.kit-zoom [data-kit-recall="${num}"]`, (b) => b.textContent.trim() === 'Rappeler en cuisine'),
      'History → the ticket offers « Rappeler en cuisine »');
    await page.click(`.kit-zoom [data-kit-recall="${num}"]`);
    await page.waitForSelector(`#kit-cook .kit-order[data-kit-num="${num}"]`, { timeout: 5000 });
    const local = await page.evaluate((n) => { const o = kdsOrders.find((x) => x.num === n); return { status: o.status, readyAt: o.readyAt, ready: o.items.map((i) => i.stationReady) }; }, num);
    check(local.status === 'cooking' && !local.readyAt && local.ready.every((r) => r === false),
      'one tap puts it back in preparation, with no « ready » time left on it');
    check(/rappelée en cuisine/.test(await page.$eval('#toast-stack', (n) => n.textContent)), 'the till says so');

    /* Le poste Bar rappelle sa seule part : la cuisine reste faite. */
    await page.waitForFunction(() => !document.querySelector('.kit-zoom-backdrop'), { timeout: 3000 });
    await page.click(`#kit-cook [data-kit-ready="${num}"]`);
    await page.waitForFunction((n) => kdsOrders.find((o) => o.num === n).status === 'ready', { timeout: 5000 }, num);
    await page.click('#kit-bar [data-kit-st="bar"]');
    await sleep(200);
    await page.evaluate((n) => kdsOpenZoom(kdsOrders.find((o) => o.num === n)), num);
    await page.waitForSelector(`.kit-zoom [data-kit-recall="${num}"]`, { visible: true, timeout: 5000 });
    await page.click(`.kit-zoom [data-kit-recall="${num}"]`);
    await page.waitForFunction(() => !document.querySelector('.kit-zoom-backdrop'), { timeout: 3000 });
    const scoped = await page.evaluate((n) => kdsOrders.find((o) => o.num === n).items.map((i) => ({ st: i.stations[0], ready: i.stationReady })), num);
    check(scoped.find((i) => i.st === 'bar').ready === false && scoped.find((i) => i.st === 'cuisine').ready === true,
      'a Bar recall reopens the tea only; the kitchen part stays done');
    await page.click('#kit-bar [data-kit-st="all"]');

    /* Ce que le sondage doit croire. Un bon venu de la file serveur. */
    console.log('\n■ 3 · what the caisse poll must and must not believe');
    const T0 = Date.now();
    const remote = (status, ts, lines) => ({ id: 'ord-recall-poll-0001', number: 31, mode: 'takeout', channel: 'kiwi', paid: true,
      status, created_ts: T0 - 60000, updated_ts: ts, total: 40,
      lines: lines || [{ id: 'it-msemen', name: 'Msemen', qty: 2, unitPrice: 20, station: '' }] });
    const state = () => page.evaluate(() => { const o = kdsOrders.find((x) => x.opId === 'ord-recall-poll-0001'); return o ? o.status : null; });
    await page.evaluate((o) => opIngest(o), remote('accepted', T0));
    check(await state() !== null, 'a remote accepted ticket lands on the till');
    await page.evaluate((o) => opIngest(o), remote('ready', T0 + 1, [{ id: 'it-msemen', name: 'Msemen', qty: 2, unitPrice: 20, station: '', stationReady: true }]));
    check(await state() === 'ready', 'the kitchen tablet marks it ready: the till follows');
    await page.evaluate((o) => opIngest(o), remote('accepted', T0 + 2, [{ id: 'it-msemen', name: 'Msemen', qty: 2, unitPrice: 20, station: '', stationReady: false, stationAccepted: true, recalledAt: T0 + 2 }]));
    check(await state() === 'cooking', 'the tablet recalls it: the till takes it back to preparation');
    check((await page.$eval('#toast-stack', (n) => n.textContent)).includes('OPD-31 rappelée en cuisine'), 'and announces the recall, by the number the customer knows');
    await page.evaluate((o) => opIngest(o), remote('ready', T0 + 1, [{ id: 'it-msemen', name: 'Msemen', qty: 2, unitPrice: 20, station: '', stationReady: true }]));
    check(await state() === 'cooking', 'a stale poll that left before the recall cannot mark it ready again');
    await page.evaluate((o) => opIngest(o), remote('ready', T0 + 3, [{ id: 'it-msemen', name: 'Msemen', qty: 2, unitPrice: 20, station: '', stationReady: true, recalledAt: T0 + 2 }]));
    check(await state() === 'ready', 'the real « Prête » after the recall is believed');

    /* Un rappel que le serveur ne confirme pas (ici : file injoignable) est
       défait : l'écran ne doit pas dire « en préparation » à tort. */
    const opNum = await page.evaluate(() => kdsOrders.find((x) => x.opId === 'ord-recall-poll-0001').num);
    await page.evaluate((n) => kdsOpenZoom(kdsOrders.find((o) => o.num === n)), opNum);
    await page.waitForSelector(`.kit-zoom [data-kit-recall="${opNum}"]`, { visible: true, timeout: 5000 });
    await page.click(`.kit-zoom [data-kit-recall="${opNum}"]`);
    await page.waitForFunction(() => kdsOrders.find((x) => x.opId === 'ord-recall-poll-0001').status === 'ready', { timeout: 8000 });
    check(true, 'an unconfirmed recall is undone: the ticket is ready again on screen');

    check(errors.length === 0, 'no page error on the till' + (errors.length ? ': ' + errors.join(' | ') : ''));
    await ctx.close();
  }
  console.log(`\nkds-recall-browser-test: ${checks} checks passed`);
} finally {
  await browser.close();
  await new Promise((r) => server.close(r));
}
