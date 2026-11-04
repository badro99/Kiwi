#!/usr/bin/env node
/* Carnet de crédit, deux onglets de la même caisse, une coupure au milieu.
 *
 *   node tools/credit-book-two-tabs-browser-test.mjs
 *
 * credit-book-properties-test fait converger des documents modélisés. Ici la
 * vraie caisse épicerie appairée (kiwi-caisse.html + pos-epicerie.js +
 * cloud-doc.js) tourne dans DEUX onglets du même navigateur, contre les
 * vraies routes /api/store et /api/sale sur une base SQLite bâtie depuis
 * schema.sql. Une cliente doit 50,00 MAD.
 *
 *   · onglet A, hors ligne (navigateur coupé) : note 20,00 d'achat à crédit,
 *     puis solde toute l'ardoise (70,00) ;
 *   · onglet B, en ligne : règle les 50,00 qu'il voit ;
 *   · A revient en ligne : son envoi se fait refuser (révision périmée), fusionne
 *     et repropose.
 *
 * Exigé : le serveur garde chaque ligne une seule fois (4 lignes), le solde est
 * la somme exacte des lignes (-50,00, une avance), le serveur lève l'alerte
 * « Soldé deux fois hors ligne · 50,00 MAD », et la fiche de la cliente
 * l'affiche sur les deux onglets. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

import { fixture } from './server-money-fixture.mjs';
import { suite } from './browser-trace.mjs';
import { tillToken, TILL_COOKIE } from '../functions/auth/_lib.js';
import * as catalogApi from '../functions/api/catalog.js';
import * as pairsApi from '../functions/api/pairs.js';
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
sql.prepare("UPDATE merchant_config SET type='epicerie' WHERE merchant=?").run(merchant);
const ago = (d) => new Date(now - d * 864e5).toISOString();
const CLIENT = 'cli-test-kiwi';
const seed = { verticals: { epicerie: { schema: 1, device: 'seed', updatedAt: now - 1000, data: { v: 2, carnet: [
  { id: CLIENT, name: 'TEST KIWI Cliente', phone: '0600000000', note: '', hist: [{ id: 'seed-debt', type: 'debt', amt: 50, label: 'Achat à crédit', at: ago(3) }] },
], day: {} } } }, commands: [], seq: 0 };
const reseed = () => {
  sql.exec("DELETE FROM store_docs; DELETE FROM sales;");
  storeCalls.length = 0;
  sql.prepare('INSERT INTO store_docs (merchant, feature, data, rev, updated_ts) VALUES (?, ?, ?, 1, ?)').run(merchant, 'verticalops', JSON.stringify(seed), Date.now());
};
const storeCalls = [];   // [{ who, method, status }] pour /api/store
reseed();
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
const S = suite('credit-book-two-tabs', { browser });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let checks = 0;
const check = (yes, msg) => { assert.ok(yes, msg); checks++; console.log('  ✓ ' + msg); };

const HANDLERS = {
  'GET /api/catalog': catalogApi.onRequestGet, 'GET /api/pairs': pairsApi.onRequestGet,
  'POST /api/sale': saleApi.onRequestPost,
  'GET /api/store': storeApi.onRequestGet, 'POST /api/store': storeApi.onRequestPost,
};
function wire(page, who) {
  page.cut = false;   // « hors ligne » : le navigateur coupé, les requêtes n'atteignent pas le serveur
  page.on('request', (r) => {
    const u = r.url();
    if (!u.startsWith(base + '/api/')) return void (u.startsWith(base) || u.startsWith('data:') ? r.continue() : r.abort());
    if (page.cut) return void r.abort('internetdisconnected');
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
      if (url.pathname === '/api/store') storeCalls.push({ who, method: r.method(), status: res.status });
      r.respond({ status: res.status, contentType: 'application/json', body }).catch(() => {});
    }).catch((e) => r.respond({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: String(e && e.message) }) }).catch(() => {}));
  });
}

const book = () => {
  const rows = sql.prepare("SELECT feature, data FROM store_docs WHERE merchant=? AND feature IN ('creditbook','verticalops')").all(merchant);
  const row = rows.find((r) => r.feature === 'creditbook');
  if (row) return JSON.parse(row.data).carnet;
  const legacy = rows.find((r) => r.feature === 'verticalops');
  return JSON.parse(legacy.data).verticals.epicerie.data.carnet;
};
const cents = (h) => Math.round(Number(h.amt) * 100);
const balanceCents = (c) => c.hist.reduce((n, h) => n + (h.type === 'debt' ? 1 : -1) * cents(h), 0);
const mad = (c) => (c / 100).toFixed(2).replace('.', ',');
const until = async (fn, label, ms = 25000) => { const end = Date.now() + ms; for (;;) { const v = await fn(); if (v) return v; if (Date.now() > end) throw new Error('jamais : ' + label + ' ; livre ' + JSON.stringify((book()[0] || {}).hist?.map((h) => h.id + ':' + h.type + ':' + h.amt)) + ' ; appels ' + JSON.stringify(storeCalls.slice(-8))); await sleep(250); } };

async function openTab(t, context, who) {
  const page = t.watch(await context.newPage());
  page.errors = [];
  page.on('pageerror', (e) => page.errors.push(who + ': ' + e.message));
  await page.setViewport({ width: 1180, height: 860 });
  await page.setBypassServiceWorker(true);
  await page.setRequestInterception(true);
  wire(page, who);
  await page.evaluateOnNewDocument((m) => {
    if (!localStorage.getItem('kiwiPaired')) {
      localStorage.setItem('kiwiPaired', '1');
      localStorage.setItem('kiwiLiveMerchant', m);
      localStorage.setItem('kiwiCaisseLang', 'fr');
      localStorage.setItem('kiwiPairedVenue', JSON.stringify({ merchant: m, type: 'epicerie', name: 'Épicerie deux onglets', location: 'Casablanca' }));
    }
    try { Object.defineProperty(navigator.serviceWorker, 'register', { value: () => new Promise(() => {}), configurable: true }); } catch (_) {}
  }, merchant);
  // coverage: surface=credit-book locale=fr viewport=desktop
  await page.goto(base + '/kiwi-caisse.html', { waitUntil: 'load' });
  await page.waitForFunction(() => window.__kiwiCaisseBootedAsDemo === false, { timeout: 30000 });
  await page.waitForFunction(() => document.querySelector('[data-ep-view="carnet"]'), { timeout: 30000 });
  await sleep(800);
  return page;
}
const openLedger = async (page) => {
  await page.bringToFront();
  await page.evaluate(() => { const l = [...document.querySelectorAll('[data-ep-view="carnet"]')].find((b) => b.offsetParent) || document.querySelector('[data-ep-view="carnet"]'); l.click(); });
  await page.waitForSelector(`[data-ep-ard="${CLIENT}"]`, { visible: true, timeout: 20000 });
  /* La liste se redessine quand l'autre onglet écrit le stockage commun : on retente le clic jusqu'à ce que la fiche s'ouvre. */
  for (let attempt = 0; ; attempt++) {
    try { await page.click(`[data-ep-ard="${CLIENT}"]`); await page.waitForSelector('#ep-ardm .ep-dt-bal', { visible: true, timeout: 3000 }); break; }
    catch (e) { if (attempt >= 5) throw e; await sleep(500); }
  }
};
const balanceText = async (page) => { await page.bringToFront(); return page.$eval('#ep-ardm .ep-dt-bal .amt', (e) => e.textContent.replace(/\s+/g, ' ').trim()); };
const closeSheet = async (page) => { await page.bringToFront(); await page.evaluate(() => { const x = [...document.querySelectorAll('[data-ep-close]')].filter((b) => b.offsetWidth).pop(); if (x) x.click(); }); await sleep(400); };
async function settleFull(page) {
  await page.bringToFront();
  await page.click('#ep-ard-settle');
  await page.waitForSelector('[data-ep-settle="full"]', { visible: true, timeout: 10000 });
  await page.click('[data-ep-settle="full"]');
  await page.waitForSelector('#ep-settle-in', { visible: true, timeout: 10000 });
  await page.waitForFunction(() => !document.getElementById('ep-settle-ok').disabled, { timeout: 10000 });
  await page.click('#ep-settle-ok');
  await sleep(600);
}

try {
  await S.run('deux caisses : A hors ligne ajoute et solde, B en ligne solde, A revient : tout est gardé une fois, l\'alerte se voit des deux côtés', async (t) => {
    /* Deux caisses (deux profils, donc deux stockages locaux) : un même profil partage son stockage entre onglets, voir le second cas. */
    const ctxA = await browser.createBrowserContext(); t.defer(() => ctxA.close());
    const ctxB = await browser.createBrowserContext(); t.defer(() => ctxB.close());
    reseed();
    const A = await openTab(t, ctxA, 'A');
    await A.bringToFront();
    const B = await openTab(t, ctxB, 'B');
    await B.bringToFront();
    await openLedger(A); await openLedger(B);
    const [ta, tb] = [await balanceText(A), await balanceText(B)];
    check(/\b50\b/.test(ta) && /\b50\b/.test(tb), `les deux onglets voient 50 MAD dus (${ta} | ${tb})`);
    await closeSheet(A); await closeSheet(B);

    t.step('A coupé : une dette de 20,00 puis le solde, hors ligne');
    A.cut = true;
    await A.setOfflineMode(true);
    await A.bringToFront();
    await A.waitForFunction(() => navigator.onLine === false, { timeout: 5000 });
    await openLedger(A);
    await A.click('#ep-ard-add');
    await A.waitForSelector('#ep-qd-in', { visible: true, timeout: 10000 });
    await A.click('#ep-qd-in', { clickCount: 3 }); await A.keyboard.type('20');
    await A.click('#ep-qd-ok'); await sleep(500);
    check(/\b70(?:[,.]00)?\b/.test(await balanceText(A)), 'A hors ligne affiche 70,00 dus');
    await settleFull(A);
    check(book()[0].hist.length === 1, 'le serveur ne sait encore rien des lignes de A (coupé)');

    t.step('B en ligne règle les 50,00 qu\'il voit');
    await openLedger(B);
    await settleFull(B);
    await until(() => book()[0].hist.length === 2, 'le règlement de B arrive au serveur');
    check(balanceCents(book()[0]) === 0, 'le serveur tient 0,00 après B');

    t.step('A revient en ligne : conflit, fusion, nouvel envoi');
    A.cut = false;
    await A.setOfflineMode(false);
    await until(() => book()[0].hist.length === 4, 'les deux lignes de A arrivent au serveur après la fusion');
    await until(() => (book()[0].creditAlerts || []).length === 1, "le serveur lève l'alerte de double règlement");
    check(storeCalls.some((c) => c.who === 'A' && c.method === 'POST' && c.status === 409), 'le premier envoi de A a bien été refusé (409, révision périmée)');

    t.step('relire le serveur');
    const c = book()[0], ids = c.hist.map((h) => h.id);
    check(c.hist.length === 4 && new Set(ids).size === 4, 'quatre lignes, chacune une seule fois : ' + c.hist.map((h) => h.type + ' ' + h.amt).join(' · '));
    check(balanceCents(c) === -5000, `le solde est la somme exacte des lignes : ${mad(balanceCents(c))} (une avance)`);
    check(c.hist.filter((h) => h.type === 'pay').map(cents).sort().join() === '5000,7000' && c.hist.filter((h) => h.type === 'debt').map(cents).sort().join() === '2000,5000', 'les montants sont ceux saisis, au centime');
    const alert = c.creditAlerts[0];
    check(alert.kind === 'offline-double-settlement' && alert.advanceCents === 5000, `alerte serveur : soldé deux fois, ${mad(alert.advanceCents)} en avance`);

    t.step('l\'alerte se voit sur les deux onglets');
    await closeSheet(A);
    await openLedger(A);
    /* B relit comme le fait son bouton « Rafraîchir » : tous les documents cloud d'un coup. */
    await closeSheet(B);
    await B.bringToFront();
    await B.evaluate(() => window.KiwiCloudDoc.pullAll());
    await sleep(600);
    await openLedger(B);
    for (const [who, page] of [['A', A], ['B', B]]) {
      await page.waitForFunction(() => /Soldé deux fois hors ligne/.test(document.querySelector('#ep-ardm [role="alert"]')?.textContent || ''), { timeout: 15000 });
      const text = (await page.$eval('#ep-ardm [role="alert"]', (e) => e.textContent.replace(/\s+/g, ' '))).trim();
      check(/\b50(?:[,.]00)?\b/.test(text), `onglet ${who} : l'alerte dit « ${text.slice(0, 60)} »`);
      check(/\b50(?:[,.]00)?\b/.test(await balanceText(page)) && /avance|Avance/.test(await balanceText(page)), `onglet ${who} : le solde affiché est l'avance de 50,00 (${await balanceText(page)})`);
      const shown = await page.evaluate(() => [...document.querySelectorAll('#ep-ardm .ep-htl > *')].length);
      check(shown >= 4, `onglet ${who} : l'historique montre les quatre lignes (${shown})`);
    }
    const errors = [...A.errors, ...B.errors];
    check(errors.length === 0, 'aucune erreur de script' + (errors.length ? ' : ' + errors.join(' | ') : ''));
  });

  await S.run('deux onglets du même navigateur : A hors ligne note une dette, B la voit tout de suite, rien n\'est écrit deux fois au retour', async (t) => {
    const context = await browser.createBrowserContext(); t.defer(() => context.close());
    reseed();
    const A = await openTab(t, context, 'A');
    await A.bringToFront();
    const B = await openTab(t, context, 'B');
    await B.bringToFront();

    t.step('A coupé note 20,00 à crédit');
    await A.bringToFront();
    await openLedger(A); await closeSheet(A);   // le module de la fiche se charge en ligne
    A.cut = true;
    await A.setOfflineMode(true);
    await A.waitForFunction(() => navigator.onLine === false, { timeout: 5000 });
    await openLedger(A);
    await A.click('#ep-ard-add');
    await A.waitForSelector('#ep-qd-in', { visible: true, timeout: 10000 });
    await A.click('#ep-qd-in', { clickCount: 3 }); await A.keyboard.type('20');
    await A.click('#ep-qd-ok'); await sleep(500);
    check(book()[0].hist.length === 1, 'le serveur ne sait encore rien de la ligne de A');

    t.step('B, même navigateur, voit les 70,00 sans réseau partagé');
    await B.bringToFront();
    await openLedger(B);
    await B.waitForFunction(() => /\b70\b/.test(document.querySelector('#ep-ardm .ep-dt-bal .amt')?.textContent || ''), { timeout: 10000 });
    check(true, 'B affiche 70 MAD dus : le stockage du poste est partagé entre ses onglets');

    t.step('B (en ligne) règle les 70,00, A revient en ligne');
    await settleFull(B);
    await until(() => book()[0].hist.length === 3, 'les lignes arrivent au serveur');
    A.cut = false;
    await A.bringToFront();
    await A.setOfflineMode(false);
    await sleep(4000);
    const c = book()[0], ids = c.hist.map((h) => h.id);
    check(c.hist.length === 3 && new Set(ids).size === 3, 'trois lignes, chacune une seule fois, malgré les deux envois : ' + c.hist.map((h) => h.type + ' ' + h.amt).join(' · '));
    check(balanceCents(c) === 0, `le solde est la somme exacte des lignes : ${mad(balanceCents(c))}`);
    check(!(c.creditAlerts || []).length, 'aucune fausse alerte : un seul règlement a eu lieu');
    check(sql.prepare("SELECT COUNT(*) n FROM sales WHERE merchant=? AND void_ts IS NULL").get(merchant).n === 1, 'un seul règlement dans le journal des ventes');
    const errors = [...A.errors, ...B.errors];
    check(errors.length === 0, 'aucune erreur de script' + (errors.length ? ' : ' + errors.join(' | ') : ''));
  });
} finally {
  console.log(`\ncredit-book-two-tabs-browser-test: ${checks} checks passed`);
  server.close();
  await S.finish();
}
