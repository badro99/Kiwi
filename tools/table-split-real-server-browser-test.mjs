#!/usr/bin/env node
/* Une addition divisée, de la caisse au serveur, par de vrais clics.
 *
 *   node tools/table-split-real-server-browser-test.mjs
 *
 * table-settlement-properties-test et caisse-money-properties-test prouvent la
 * conservation du partage sur des fonctions extraites. Ici la vraie caisse
 * restaurant appairée (kiwi-caisse.html, jeton de caisse signé, ordre de
 * chargement réel) parle aux gestionnaires de production (/api/sale,
 * /api/order/queue, /api/service/events…) sur une base SQLite bâtie depuis
 * schema.sql : on ouvre la table, on prend trois plats (14 + 12 + 12 = 38,00),
 * on divise en trois parts par les clics du split, on règle chaque part en
 * espèces, puis on relit le serveur.
 *
 * Exigé : trois lignes de vente dont la somme fait exactement l'addition, au
 * centime entier (3 800 = 1 267 + 1 267 + 1 266), chaque identifiant écrit une
 * seule fois ; une part réglée, la caisse rechargée et le split repris ne
 * réécrit pas la part déjà encaissée ; la visite se ferme à la dernière part.
 * Aucun code saisi. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

import { fixture } from './server-money-fixture.mjs';
import { suite } from './browser-trace.mjs';
import { tillToken, TILL_COOKIE } from '../functions/auth/_lib.js';
import * as menuApi from '../functions/api/menu.js';
import * as pairsApi from '../functions/api/pairs.js';
import * as queueApi from '../functions/api/order/queue.js';
import * as eventsApi from '../functions/api/service/events.js';
import * as saleApi from '../functions/api/sale.js';
import * as storeApi from '../functions/api/store.js';

const root = process.env.KIWI_ROOT || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let puppeteer;
try { puppeteer = createRequire(path.join(root, 'app/package.json'))('puppeteer-core'); }
catch { console.log('○ skip: puppeteer-core unavailable, browser assertions not executed'); process.exit(process.env.CI ? 1 : 0); }
const bin = process.env.KIWI_CHROMIUM_BIN || ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/chromium', '/usr/bin/google-chrome'].find(fs.existsSync);
if (!bin) { console.log('○ skip: Chromium unavailable, browser assertions not executed'); process.exit(process.env.CI ? 1 : 0); }

const f = await fixture(root);
const { sql, env, merchant } = f;
const prepare = f.DB.prepare.bind(f.DB);
f.DB.prepare = (query) => {
  const statement = prepare(query);
  for (const method of ['first', 'all']) { const run = statement[method].bind(statement); statement[method] = async (...args) => run(...args); }
  return statement;
};
const now = Date.now();
sql.prepare("UPDATE merchant_config SET type='restaurant', features=? WHERE merchant=?").run('{"orderpro":true}', merchant);
sql.prepare('INSERT INTO order_desk(merchant, seen_ts) VALUES(?, ?)').run(merchant, now);
const MENU = {
  cats: [{ id: 'cat_b', name: 'Boissons' }, { id: 'cat_p', name: 'Petit déjeuner' }],
  items: [
    { id: 'it_the', name: 'Thé à la menthe', price: 12, catId: 'cat_b', avail: true },
    { id: 'it_cafe', name: 'Café noir', price: 12, catId: 'cat_b', avail: true },
    { id: 'it_msemen', name: 'Msemen miel', price: 14, catId: 'cat_p', avail: true },
  ],
};
sql.prepare('INSERT INTO menus (merchant, name, type, data, updated_ts) VALUES (?, ?, ?, ?, ?)')
  .run(merchant, 'Bistro split', 'restaurant', JSON.stringify(MENU), now);
const PLAN = { zones: [{ id: 'z1', name: 'Salle' }], tables: [{ id: 't4', num: '4', zone: 'z1', seats: 4, shape: 'round', x: 40, y: 40, w: 90, h: 90, status: 'free', server: 'w1', servers: ['w1'] }], staff: [] };
for (const [feature, data] of [
  ['team', { members: [{ id: 'w1', firstName: 'Salma', lastName: 'Test', function: 'serveur', department: 'salle' }] }],
  ['floorplan', PLAN],
  ['attendance', { entries: [{ id: 'att-1', staffId: 'w1', memberId: 'w1', name: 'Salma Test', role: 'serveur', inTs: now - 3600e3, outTs: 0 }] }],
]) sql.prepare('INSERT OR REPLACE INTO store_docs (merchant, feature, data, rev, updated_ts) VALUES (?, ?, ?, 1, ?)').run(merchant, feature, JSON.stringify(data), now);
const tillCookie = `${TILL_COOKIE}=${await tillToken(env.AUTH_SECRET, merchant)}`;

const mime = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.json': 'application/json', '.png': 'image/png', '.webp': 'image/webp' };
const server = http.createServer((req, res) => {
  const p = path.resolve(root, '.' + decodeURIComponent(new URL(req.url, 'http://local').pathname));
  if (!p.startsWith(root + path.sep)) { res.writeHead(403); res.end(); return; }
  fs.readFile(p, (err, data) => { res.writeHead(err ? 404 : 200, { 'Content-Type': mime[path.extname(p)] || 'application/octet-stream', 'Cache-Control': 'no-store' }); res.end(err ? '' : data); });
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await puppeteer.launch({ executablePath: bin, headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const S = suite('table-split-real-server', { browser });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let checks = 0;
const check = (yes, msg) => { assert.ok(yes, msg); checks++; console.log('  ✓ ' + msg); };

const HANDLERS = {
  'GET /api/menu': menuApi.onRequestGet, 'GET /api/pairs': pairsApi.onRequestGet,
  'GET /api/order/queue': queueApi.onRequestGet, 'POST /api/order/queue': queueApi.onRequestPost,
  'GET /api/service/events': eventsApi.onRequestGet, 'POST /api/service/events': eventsApi.onRequestPost,
  'POST /api/sale': saleApi.onRequestPost,
  'GET /api/store': storeApi.onRequestGet, 'POST /api/store': storeApi.onRequestPost,
};
const salePosts = [];   // chaque POST /api/sale que la caisse a réellement envoyé : { id, status }
function wire(page) {
  page.on('request', (r) => {
    const u = r.url();
    if (!u.startsWith(base + '/api/')) return void (u.startsWith(base) || u.startsWith('data:') ? r.continue() : r.abort());
    const url = new URL(u);
    const handler = HANDLERS[r.method() + ' ' + url.pathname];
    if (!handler) return void r.respond({ status: 404, contentType: 'application/json', body: '{"error":"not-found"}' });
    const post = r.method() === 'POST';
    const request = new Request(url.toString().replace(base, 'https://kiwi-os.com'), {
      method: r.method(), body: post ? r.postData() : undefined,
      headers: Object.assign({ Cookie: tillCookie, Origin: 'https://kiwi-os.com' }, post ? { 'Content-Type': 'application/json' } : {}),
    });
    const pending = [];
    Promise.resolve(handler({ request, env, waitUntil: (p) => pending.push(p) })).then(async (res) => {
      const body = await res.text();
      await Promise.allSettled(pending);
      if (post && url.pathname === '/api/sale') { let id = ''; try { id = JSON.parse(r.postData()).id; } catch (_) {} salePosts.push({ id, status: res.status }); }
      r.respond({ status: res.status, contentType: 'application/json', body }).catch(() => {});
    }).catch((e) => r.respond({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: String(e && e.message) }) }).catch(() => {}));
  });
}

const T = '4';
const truth = {
  sales: () => sql.prepare('SELECT id, amount_cents, method, session_id FROM sales WHERE merchant=? AND void_ts IS NULL ORDER BY rowid').all(merchant),
  tickets: () => sql.prepare("SELECT total, paid_ts FROM orders WHERE merchant=? AND table_no=? AND status<>'rejected'").all(merchant, T),
  billCents: () => truth.tickets().reduce((s, o) => s + Math.round(Number(o.total) * 100), 0),
  openSessions: () => sql.prepare("SELECT id FROM table_sessions WHERE merchant=? AND status='open'").all(merchant),
};
const until = async (fn, label, ms = 20000) => { const end = Date.now() + ms; for (;;) { const v = await fn(); if (v) return v; if (Date.now() > end) throw new Error('jamais : ' + label); await sleep(250); } };
const mad = (cents) => (cents / 100).toFixed(2).replace('.', ',');

async function openTill(t, context) {
  const page = t.watch(await context.newPage());
  page.errors = [];
  page.on('pageerror', (e) => page.errors.push(e.message));
  await page.setViewport({ width: 1366, height: 900 });
  await page.setBypassServiceWorker(true);
  await page.setRequestInterception(true);
  wire(page);
  await page.evaluateOnNewDocument((m, plan) => {
    localStorage.setItem('kiwiPaired', '1');
    localStorage.setItem('kiwiLiveMerchant', m);
    localStorage.setItem('kiwiCaisseLang', 'fr');
    localStorage.setItem('kiwiPairedVenue', JSON.stringify({ merchant: m, type: 'restaurant', name: 'Bistro split', location: 'Casablanca' }));
    localStorage.setItem('kiwiPlanDeSalle:slug:' + m, JSON.stringify(plan));
    try { Object.defineProperty(navigator.serviceWorker, 'register', { value: () => new Promise(() => {}), configurable: true }); } catch (_) {}
  }, merchant, PLAN);
  // coverage: surface=caisse-restaurant locale=fr viewport=desktop
  await page.goto(base + '/kiwi-caisse.html', { waitUntil: 'load' });
  await page.waitForFunction(() => window.__kiwiCaisseBootedAsDemo === false, { timeout: 30000 });
  await page.waitForFunction(() => document.body.classList.contains('is-unlocked')
    || !!document.querySelector('.ci-float-chip[data-float="300"]')?.offsetParent, { timeout: 20000 });
  if (!await page.evaluate(() => document.body.classList.contains('is-unlocked'))) {
    await sleep(600);
    await page.click('.ci-float-chip[data-float="300"]');
    await page.waitForFunction(() => !document.getElementById('clockin-btn').disabled, { timeout: 8000 });
    await page.click('#clockin-btn');
    await page.waitForFunction(() => document.body.classList.contains('is-unlocked'), { timeout: 30000 });
  }
  await page.waitForFunction((id) => typeof tables !== 'undefined' && !!tables[id], { timeout: 20000 }, T);
  await sleep(600);
  if (await page.evaluate(() => mode !== 'salle')) {
    await page.click('.mode-pill[data-mode="salle"]');
    await page.waitForFunction(() => mode === 'salle', { timeout: 8000 });
  }
  return page;
}

/* Ouvre le split de la table et laisse trois parts égales, au vrai clic. */
async function openSplitFlow(page) {
  await page.evaluate((id) => openTable(id), T);
  await page.waitForSelector('#pay-split', { visible: true, timeout: 10000 });
  await page.click('#pay-split');
  await page.waitForSelector('#split-modal.is-open', { timeout: 10000 });
}
const payPart = async (page, idx) => {
  await page.waitForSelector(`[data-pay-part="${idx}"][data-pay-method="cash"]`, { visible: true, timeout: 10000 });
  await page.click(`[data-pay-part="${idx}"][data-pay-method="cash"]`);
  await page.waitForFunction(() => !document.getElementById('cash-confirm').disabled, { timeout: 10000 });
  await page.click('#cash-confirm');
};

try {
  await S.run('split en trois parts : la somme des ventes est l\'addition au centime, chaque part une fois', async (t) => {
    const context = await browser.createBrowserContext(); t.defer(() => context.close());
    let page = await openTill(t, context);

    t.step('ouvrir la table 4 et prendre trois plats');
    await page.click(`.cplan-tbl[data-table="${T}"]`);
    await page.waitForSelector('#new-table-modal.is-open', { timeout: 10000 });
    await page.click('#nt-covers-chips button');
    await page.click('#nt-confirm');
    await page.waitForFunction(() => mode === 'order', { timeout: 10000 });
    for (const id of ['it_msemen', 'it_the', 'it_cafe']) {
      await page.waitForSelector(`.menu-item[data-menu-id="${id}"]`, { visible: true, timeout: 10000 });
      await page.click(`.menu-item[data-menu-id="${id}"]`);
      await sleep(150);
    }
    await page.click('#validate-order');
    await page.waitForFunction(() => mode === 'salle', { timeout: 10000 });
    await until(() => truth.tickets().length >= 1 && truth.billCents() === 3800, 'le serveur tient 38,00');
    check(truth.billCents() === 3800, `le serveur tient l'addition : ${mad(truth.billCents())}`);
    check(truth.openSessions().length === 1, 'une seule visite ouverte');
    const visit = truth.openSessions()[0].id;

    t.step('diviser en trois parts égales');
    await openSplitFlow(page);
    await page.click('#split-parts-chips [data-parts="3"]');
    await page.click('#split-launch');
    await page.waitForSelector('#split-flow:not([hidden])', { timeout: 10000 });
    const parts = await page.evaluate(() => splitState.flow.parts.map((p) => Math.round(p.amount * 100)));
    check(parts.length === 3 && parts.reduce((a, b) => a + b, 0) === 3800, `la caisse propose trois parts qui font 38,00 : ${parts.map(mad).join(' + ')}`);

    t.step('régler la première part, recharger la caisse');
    await payPart(page, 0);
    await until(() => truth.sales().length === 1, 'la première part arrive au serveur');
    check(truth.sales()[0].amount_cents === parts[0], `la première vente fait ${mad(parts[0])}`);
    await page.close();
    page = await openTill(t, context);

    t.step('reprendre le split et régler les deux autres parts');
    await page.evaluate((id) => openTable(id), T);
    await page.waitForSelector('[data-action="resume-split"]', { visible: true, timeout: 15000 });
    await page.click('[data-action="resume-split"]');
    await page.waitForSelector('#split-flow:not([hidden])', { timeout: 10000 });
    const resumed = await page.evaluate(() => splitState.flow.parts.map((p) => ({ paid: !!p.paid, cents: Math.round(p.amount * 100) })));
    check(resumed.length === 3 && resumed[0].paid && !resumed[1].paid && !resumed[2].paid, 'la part déjà réglée reste réglée après le rechargement');
    check(truth.sales().length === 1, 'la reprise ne réécrit pas la part déjà encaissée');
    await payPart(page, 1);
    await until(() => truth.sales().length === 2, 'la deuxième part arrive au serveur');
    await payPart(page, 2);
    await until(() => truth.sales().length === 3, 'la troisième part arrive au serveur');

    t.step('relire le serveur');
    const sales = truth.sales();
    const sum = sales.reduce((s, x) => s + x.amount_cents, 0);
    check(sum === 3800, `les trois ventes font l'addition au centime : ${sales.map((x) => mad(x.amount_cents)).join(' + ')} = ${mad(sum)}`);
    check(sales.every((x) => Number.isInteger(x.amount_cents)), 'chaque montant est un entier de centimes');
    check(new Set(sales.map((x) => x.id)).size === 3, 'trois identifiants de vente distincts');
    for (const s of sales) check(salePosts.filter((p) => p.id === s.id && p.status === 200).length === 1, `la vente ${s.id.slice(-6)} a été envoyée avec succès une seule fois`);
    check(sales.every((x) => x.method === 'cash'), 'toutes en espèces');
    check(sales.every((x) => !x.session_id || x.session_id === visit), 'sur la visite de la table, sans en inventer une autre');
    await until(() => truth.openSessions().length === 0, 'la visite se ferme à la dernière part');
    check(truth.tickets().every((o) => !!o.paid_ts), 'tous les tickets sont soldés');
    check(await page.evaluate((id) => tables[id].status === 'khawya' || tables[id].status === 'khlass', T), 'la caisse libère la table');
    check(page.errors.length === 0, 'aucune erreur de script' + (page.errors.length ? ' : ' + page.errors.join(' | ') : ''));
  });
} finally {
  console.log(`\ntable-split-real-server-browser-test: ${checks} checks passed`);
  server.close();
  await S.finish();
}
