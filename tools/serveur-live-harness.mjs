/* Banc d'essai de l'app serveur (kiwi-serveur.html) contre les VRAIES routes.
 *
 * Pas un test : la boîte à outils des suites tools/serveur-*-browser-test.mjs.
 * Une base SQLite en mémoire bâtie depuis schema.sql (server-money-fixture),
 * un restaurant inventé, un serveur pointé, un cookie d'employé signé, et les
 * gestionnaires de production branchés derrière la page par interception
 * (comme tools/shared-table-two-devices-browser-test.mjs). Aucun commerce réel,
 * aucun code saisi, aucun mock de route.
 *
 *   const h = await harness({ menu, plan });
 *   const page = await h.openWaiter(t);           // suite(...).run(name, t => …)
 *   … h.close();
 */
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

import { fixture } from './server-money-fixture.mjs';
import { tillToken, TILL_COOKIE, employeeToken, employeeCookie } from '../functions/auth/_lib.js';
import * as employeeApi from '../functions/api/employee.js';
import * as menuApi from '../functions/api/menu.js';
import * as pairsApi from '../functions/api/pairs.js';
import * as queueApi from '../functions/api/order/queue.js';
import * as eventsApi from '../functions/api/service/events.js';
import * as saleApi from '../functions/api/sale.js';
import * as storeApi from '../functions/api/store.js';

export const root = process.env.KIWI_ROOT || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/* null quand le navigateur manque : la suite dit « ○ skip » et sort. */
export function chromium() {
  let puppeteer;
  try { puppeteer = createRequire(path.join(root, 'app/package.json'))('puppeteer-core'); } catch { return null; }
  const bin = process.env.KIWI_CHROMIUM_BIN || ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/chromium', '/usr/bin/google-chrome'].find(fs.existsSync);
  return bin ? { puppeteer, bin } : null;
}

export const DEFAULT_MENU = {
  cats: [{ id: 'cat_b', name: 'Boissons' }, { id: 'cat_p', name: 'Petit déjeuner' }],
  opts: [{ id: 'og_lait', name: 'Lait', kind: 'one', required: true,
    choices: [{ id: 'oc_entier', name: 'Entier', price: 0 }, { id: 'oc_avoine', name: 'Avoine', price: 3 }] }],
  items: [
    { id: 'it_the', name: 'Thé à la menthe', price: 12, catId: 'cat_b', avail: true },
    { id: 'it_cafe', name: 'Café noir', price: 12, catId: 'cat_b', avail: true },
    { id: 'it_latte', name: 'Latte', price: 20, catId: 'cat_b', avail: true, opts: ['og_lait'] },
    { id: 'it_msemen', name: 'Msemen miel', price: 14, catId: 'cat_p', avail: true },
    { id: 'it_omelette', name: 'Omelette', price: 25, catId: 'cat_p', avail: true },
  ],
};
export const DEFAULT_PLAN = {
  zones: [{ id: 'z1', name: 'Salle' }],
  tables: ['4', '5', '6'].map((num, i) => ({ id: 't' + num, num, zone: 'z1', seats: 4, shape: 'round', x: 40 + i * 120, y: 40, w: 90, h: 90, status: 'free', server: 'w1', servers: ['w1'] })),
  staff: [],
};

export async function harness({ menu = DEFAULT_MENU, plan = DEFAULT_PLAN, browser } = {}) {
  const f = await fixture(root);
  const { sql, env, merchant } = f;
  /* Comme D1 : les lectures répondent par une promesse. */
  const prepare = f.DB.prepare.bind(f.DB);
  f.DB.prepare = (query) => {
    const statement = prepare(query);
    for (const method of ['first', 'all']) { const run = statement[method].bind(statement); statement[method] = async (...args) => run(...args); }
    return statement;
  };
  const now = Date.now();
  sql.prepare("UPDATE merchant_config SET type='restaurant', features=? WHERE merchant=?").run('{"orderpro":true}', merchant);
  sql.prepare('INSERT INTO order_desk(merchant, seen_ts) VALUES(?, ?)').run(merchant, now);
  sql.prepare('INSERT INTO menus (merchant, name, type, data, updated_ts) VALUES (?, ?, ?, ?, ?)')
    .run(merchant, 'Bistro du banc', 'restaurant', JSON.stringify(menu), now);
  const doc = (feature, data) => sql.prepare('INSERT OR REPLACE INTO store_docs (merchant, feature, data, rev, updated_ts) VALUES (?, ?, ?, 1, ?)')
    .run(merchant, feature, JSON.stringify(data), now);
  doc('team', { members: [{ id: 'w1', firstName: 'Salma', lastName: 'Test', function: 'serveur', department: 'salle' }] });
  doc('floorplan', plan);
  doc('attendance', { entries: [{ id: 'att-1', staffId: 'w1', memberId: 'w1', name: 'Salma Test', role: 'serveur', inTs: now - 3600e3, outTs: 0 }] });
  const waiterCookie = employeeCookie(await employeeToken(env.AUTH_SECRET, { merchant, staffId: 'w1', authVersion: 0 })).split(';')[0];
  const tillCookie = `${TILL_COOKIE}=${await tillToken(env.AUTH_SECRET, merchant)}`;

  const mime = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.json': 'application/json', '.png': 'image/png', '.webp': 'image/webp' };
  const server = http.createServer((req, res) => {
    const p = path.resolve(root, '.' + decodeURIComponent(new URL(req.url, 'http://local').pathname));
    if (!p.startsWith(root + path.sep)) { res.writeHead(403); res.end(); return; }
    fs.readFile(p, (err, data) => { res.writeHead(err ? 404 : 200, { 'Content-Type': mime[path.extname(p)] || 'application/octet-stream', 'Cache-Control': 'no-store' }); res.end(err ? '' : data); });
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;

  const HANDLERS = {
    'GET /api/employee': employeeApi.onRequestGet, 'GET /api/menu': menuApi.onRequestGet, 'GET /api/pairs': pairsApi.onRequestGet,
    'GET /api/order/queue': queueApi.onRequestGet, 'POST /api/order/queue': queueApi.onRequestPost,
    'GET /api/service/events': eventsApi.onRequestGet, 'POST /api/service/events': eventsApi.onRequestPost,
    'POST /api/sale': saleApi.onRequestPost,
    'GET /api/store': storeApi.onRequestGet, 'POST /api/store': storeApi.onRequestPost,
  };
  const calls = [];
  /* `hold` : une route qu'on retient (réseau lent) jusqu'à release(). */
  const holds = new Map();
  function wire(page, who, cookie) {
    page.on('request', (r) => {
      const u = r.url();
      if (!u.startsWith(base + '/api/')) return void (u.startsWith(base) || u.startsWith('data:') ? r.continue() : r.abort());
      const url = new URL(u);
      const key = r.method() + ' ' + url.pathname;
      const handler = HANDLERS[key];
      if (!handler) return void r.respond({ status: 404, contentType: 'application/json', body: '{"error":"not-found"}' });
      const post = r.method() === 'POST';
      const run = () => {
        const request = new Request(url.toString().replace(base, 'https://kiwi-os.com'), {
          method: r.method(), body: post ? r.postData() : undefined,
          headers: Object.assign({ Cookie: cookie, Origin: 'https://kiwi-os.com' }, post ? { 'Content-Type': 'application/json' } : {}),
        });
        const pending = [];
        Promise.resolve(handler({ request, env, waitUntil: (p) => pending.push(p) })).then(async (res) => {
          const body = await res.text();
          await Promise.allSettled(pending);
          calls.push({ who, method: r.method(), path: url.pathname, status: res.status, body: post ? body.slice(0, 200) : undefined, sent: post ? r.postData() : undefined });
          r.respond({ status: res.status, contentType: 'application/json', body }).catch(() => {});
        }).catch((e) => r.respond({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: String(e && e.message) }) }).catch(() => {}));
      };
      const hold = holds.get(key);
      if (hold) hold.push(run); else run();
    });
  }
  const hold = (key) => { if (!holds.has(key)) holds.set(key, []); };
  const release = (key) => { const q = holds.get(key) || []; holds.delete(key); q.forEach((fn) => fn()); };

  let ownBrowser = false;
  if (!browser) {
    const c = chromium();
    browser = await c.puppeteer.launch({ executablePath: c.bin, headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
    ownBrowser = true;
  }

  async function openWaiter(t, { lang = 'fr', viewport = { width: 390, height: 844 }, firstTable = '4' } = {}) {
    const ctx = await browser.createBrowserContext(); t.defer(() => ctx.close());
    const page = t.watch(await ctx.newPage());
    page.errors = [];
    page.on('pageerror', (e) => page.errors.push('serveur: ' + e.message));
    page.on('dialog', (d) => d.accept().catch(() => {}));
    await page.setViewport(viewport);
    await page.setBypassServiceWorker(true);
    await page.setRequestInterception(true);
    wire(page, 'serveur', waiterCookie);
    await page.evaluateOnNewDocument((m, l) => {
      localStorage.setItem('kiwiEmployeeMerchant', m);
      localStorage.setItem('kiwi-employee-language:' + m, l);
      try { Object.defineProperty(navigator.serviceWorker, 'register', { value: () => new Promise(() => {}), configurable: true }); } catch (_) {}
    }, merchant, lang);
    await page.goto(base + '/kiwi-serveur.html', { waitUntil: 'load' });
    await page.waitForFunction(() => document.getElementById('screen-main')?.classList.contains('is-active'), { timeout: 30000 });
    if (firstTable) await page.waitForSelector(`.table-card[data-table="${firstTable}"]`, { visible: true, timeout: 20000 });
    return page;
  }

  async function openTill(t) {
    const ctx = await browser.createBrowserContext(); t.defer(() => ctx.close());
    const page = t.watch(await ctx.newPage());
    page.errors = [];
    page.on('pageerror', (e) => page.errors.push('caisse: ' + e.message));
    await page.setViewport({ width: 1366, height: 900 });
    await page.setBypassServiceWorker(true);
    await page.setRequestInterception(true);
    wire(page, 'caisse', tillCookie);
    await page.evaluateOnNewDocument((m, p) => {
      localStorage.setItem('kiwiPaired', '1');
      localStorage.setItem('kiwiLiveMerchant', m);
      localStorage.setItem('kiwiCaisseLang', 'fr');
      localStorage.setItem('kiwiPairedVenue', JSON.stringify({ merchant: m, type: 'restaurant', name: 'Bistro du banc', location: 'Casablanca' }));
      localStorage.setItem('kiwiPlanDeSalle:slug:' + m, JSON.stringify(p));
      try { Object.defineProperty(navigator.serviceWorker, 'register', { value: () => new Promise(() => {}), configurable: true }); } catch (_) {}
    }, merchant, plan);
    await page.goto(base + '/kiwi-caisse.html', { waitUntil: 'load' });
    await page.waitForFunction(() => window.__kiwiCaisseBootedAsDemo === false, { timeout: 30000 });
    await page.waitForFunction(() => document.body.classList.contains('is-unlocked')
      || !!document.querySelector('.ci-float-chip[data-float="300"]')?.offsetParent, { timeout: 20000 });
    if (!await page.evaluate(() => document.body.classList.contains('is-unlocked'))) {
      await new Promise((r) => setTimeout(r, 600));
      await page.click('.ci-float-chip[data-float="300"]');
      await page.waitForFunction(() => !document.getElementById('clockin-btn').disabled, { timeout: 8000 });
      await page.click('#clockin-btn');
      await page.waitForFunction(() => document.body.classList.contains('is-unlocked'), { timeout: 30000 });
    }
    return page;
  }

  const db = {
    tickets: (table) => sql.prepare("SELECT id, session_id, status, total, paid_ts, lines, table_no FROM orders WHERE merchant=? AND (? IS NULL OR table_no=?) AND status<>'rejected' ORDER BY rowid").all(merchant, table ?? null, table ?? null),
    sales: () => sql.prepare('SELECT id, amount_cents, method, session_id, void_ts FROM sales WHERE merchant=? AND void_ts IS NULL ORDER BY rowid').all(merchant),
    openSessions: () => sql.prepare("SELECT id, table_no FROM table_sessions WHERE merchant=? AND status='open'").all(merchant),
  };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const until = async (fn, label, ms = 20000) => {
    const end = Date.now() + ms;
    for (;;) { const v = await fn(); if (v) return v; if (Date.now() > end) throw new Error('jamais : ' + label); await sleep(200); }
  };
  async function close() {
    if (ownBrowser) await browser.close().catch(() => {});
    server.close();
    f.close();
  }
  return { f, sql, env, merchant, base, browser, calls, hold, release, openWaiter, openTill, db, sleep, until, close, waiterCookie, tillCookie };
}
