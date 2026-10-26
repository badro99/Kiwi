#!/usr/bin/env node
import { forLocales } from './test-locales.mjs';
/* « Souvent avec… » dans l'app des serveurs, au vrai clic.
 *
 * Un serveur pointé d'un commerce de test (base SQLite en mémoire bâtie
 * depuis schema.sql) ouvre kiwi-serveur.html. /api/employee, /api/menu,
 * /api/pairs et /api/order/queue sont les VRAIS gestionnaires, appelés avec
 * un vrai cookie d'employé signé : c'est le chemin d'autorisation de la
 * production (activeServiceEmployee), pas un raccourci. Les tickets associent
 * le msemen au thé. Le serveur touche une table du plan, l'ouvre pour quatre
 * couverts, prend la commande ; sur la carte :
 *   · un msemen appelle le thé, avec la part réelle des tickets ;
 *   · « + » ajoute le thé par le chemin normal, la suggestion change ;
 *   · « × » l'écarte pour cette table ;
 *   · en anglais et en arabe, la même suggestion dans la langue de l'employé.
 * Aucun code saisi. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

import { employeeToken, EMPLOYEE_COOKIE } from '../functions/auth/_lib.js';
import * as employeeApi from '../functions/api/employee.js';
import * as menuApi from '../functions/api/menu.js';
import * as pairsApi from '../functions/api/pairs.js';
import * as queueApi from '../functions/api/order/queue.js';

const root = process.env.KIWI_ROOT || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let puppeteer;
try { puppeteer = createRequire(path.join(root, 'app/package.json'))('puppeteer-core'); }
catch { console.log('○ skip: puppeteer-core unavailable'); process.exit(process.env.CI ? 1 : 0); }
const bin = process.env.KIWI_CHROMIUM_BIN || ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/chromium', '/usr/bin/google-chrome'].find(fs.existsSync);
if (!bin) { console.log('○ skip: Chromium unavailable'); process.exit(process.env.CI ? 1 : 0); }

const MERCHANT = 'pairs-serveur-bistro';
const AUTH_SECRET = 'pairs-serveur-secret';
const sql = new DatabaseSync(':memory:');
sql.exec(fs.readFileSync(path.join(root, 'schema.sql'), 'utf8'));
const DB = {
  prepare(query) {
    let args = [];
    const st = {
      bind(...a) { args = a.map((v) => (v === undefined ? null : v)); return st; },
      first() { const r = sql.prepare(query).get(...args); return Promise.resolve(r === undefined ? null : r); },
      all() { return Promise.resolve({ results: sql.prepare(query).all(...args) }); },
      run() { const r = sql.prepare(query).run(...args); return Promise.resolve({ success: true, meta: { changes: r.changes } }); },
    };
    return st;
  },
  async batch(statements) { const out = []; for (const s of statements) out.push(await s.run()); return out; },
};
const env = { DB, AUTH_SECRET };
const now = Date.now();
sql.prepare("INSERT INTO merchant_config (merchant, features, name, type, updated_ts) VALUES (?, '{}', ?, 'restaurant', ?)")
  .run(MERCHANT, 'Pairs Serveur Bistro', now);
const MENU = {
  cats: [{ id: 'cat_b', name: 'Boissons' }, { id: 'cat_p', name: 'Petit déjeuner' }],
  items: [
    { id: 'it_the', name: 'Thé à la menthe', price: 12, catId: 'cat_b', avail: true },
    { id: 'it_cafe', name: 'Café noir', price: 12, catId: 'cat_b', avail: true },
    { id: 'it_msemen', name: 'Msemen miel', price: 14, catId: 'cat_p', avail: true },
  ],
};
sql.prepare('INSERT INTO menus (merchant, name, type, data, updated_ts) VALUES (?, ?, ?, ?, ?)')
  .run(MERCHANT, 'Pairs Serveur Bistro', 'restaurant', JSON.stringify(MENU), now);
const doc = (feature, data) => sql.prepare('INSERT OR REPLACE INTO store_docs (merchant, feature, data, rev, updated_ts) VALUES (?, ?, ?, 1, ?)')
  .run(MERCHANT, feature, JSON.stringify(data), now);
doc('team', { members: [{ id: 'w1', firstName: 'Salma', lastName: 'Test', function: 'serveur', department: 'salle' }] });
doc('floorplan', { zones: [{ id: 'z1', name: 'Salle' }], tables: ['T4', 'T5', 'T6'].map((num) => ({ id: num.toLowerCase(), num, zone: 'z1', seats: 4, status: 'free', server: 'w1', servers: ['w1'] })), staff: [] });
// La forme qu'écrit un vrai pointage (functions/api/employee.js).
doc('attendance', { entries: [{ id: 'att-1', staffId: 'w1', memberId: 'w1', name: 'Salma Test', role: 'serveur', inTs: now - 3600e3, outTs: 0 }] });
let seq = 0;
const L = (i, n) => ({ i, n, q: 1, t: 12 });
const sale = (lines) => { seq++; sql.prepare(`INSERT INTO sales (id, merchant, amount, amount_cents, method, label, ref, ts, lines) VALUES (?, ?, 26, 2600, 'cash', 'Vente', ?, ?, ?)`)
  .run(`ps-${seq}`, MERCHANT, `R${seq}`, now - seq * 3600e3, JSON.stringify(lines)); };
// msemen : 14 tickets, dont 12 avec le thé (86 %) ; café + thé 6 fois ; café + msemen 2 fois.
for (let k = 0; k < 12; k++) sale([L('it_msemen', 'Msemen miel'), L('it_the', 'Thé à la menthe')]);
for (let k = 0; k < 6; k++) sale([L('it_cafe', 'Café noir'), L('it_the', 'Thé à la menthe')]);
for (let k = 0; k < 2; k++) sale([L('it_cafe', 'Café noir'), L('it_msemen', 'Msemen miel')]);
const cookie = `${EMPLOYEE_COOKIE}=${await employeeToken(AUTH_SECRET, { merchant: MERCHANT, staffId: 'w1', authVersion: 0 })}`;

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
const HANDLERS = {
  'GET /api/employee': employeeApi.onRequestGet, 'GET /api/menu': menuApi.onRequestGet, 'GET /api/pairs': pairsApi.onRequestGet,
  'GET /api/order/queue': queueApi.onRequestGet, // les notes rouvertes de la salle
  'POST /api/order/queue': queueApi.onRequestPost, // ouvrir la table
};
let pairsStatus = [];
async function route(r) {
  const u = r.url();
  if (!u.startsWith(base + '/api/')) return u.startsWith(base) || u.startsWith('data:') ? r.continue() : r.abort();
  const url = new URL(u);
  const handler = HANDLERS[r.method() + ' ' + url.pathname];
  if (!handler) return r.respond({ status: 404, contentType: 'application/json', body: '{"error":"not-found"}' });
  const post = r.method() === 'POST';
  const request = new Request(url.toString().replace(base, 'https://kiwi-os.com'), {
    method: r.method(), body: post ? r.postData() : undefined,
    headers: Object.assign({ Cookie: cookie, Origin: 'https://kiwi-os.com' }, post ? { 'Content-Type': 'application/json' } : {}),
  });
  try {
    const res = await handler({ request, env, waitUntil() {} });
    if (url.pathname === '/api/pairs') pairsStatus.push(res.status);
    r.respond({ status: res.status, contentType: 'application/json', body: await res.text() });
  } catch (e) { r.respond({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: String(e && e.message) }) }); }
}

async function openApp(lang, table) {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.setViewport({ width: 390, height: 844 });
  await page.setBypassServiceWorker(true);
  await page.setRequestInterception(true);
  page.on('request', (r) => { route(r); });
  await page.evaluateOnNewDocument((m, l) => {
    localStorage.setItem('kiwiEmployeeMerchant', m);
    localStorage.setItem('kiwi-employee-language:' + m, l);
  }, MERCHANT, lang);
  // coverage: surface=employee locale=fr viewport=phone
  // coverage: surface=employee locale=en viewport=phone
  // coverage: surface=employee locale=ar viewport=phone
  await page.goto(base + '/kiwi-serveur.html', { waitUntil: 'load' });
  await page.waitForFunction(() => document.getElementById('screen-main')?.classList.contains('is-active'), { timeout: 20000 });
  await page.waitForFunction(() => window.KiwiPairs && Object.keys(KiwiPairs._state().pairs || {}).length > 0, { timeout: 15000 });
  // La salle : une table libre du plan, ouverte pour quatre couverts.
  await page.waitForSelector(`.table-card[data-table="${table}"]`, { visible: true, timeout: 15000 });
  await page.click(`.table-card[data-table="${table}"]`);
  await page.waitForSelector('#nt-confirm', { visible: true, timeout: 5000 });
  await sleep(400); // la feuille monte
  await page.click('#nt-confirm');
  await page.waitForFunction(() => { const b = document.querySelector('[data-action="take-order"]'); return b && b.offsetParent; }, { timeout: 15000 }).catch(() => {});
  if (await page.$('[data-action="take-order"]') && await page.evaluate(() => !!document.querySelector('[data-action="take-order"]').offsetParent)) {
    await page.click('[data-action="take-order"]');
  }
  await page.waitForSelector('.menu-item[data-menu-id="it_msemen"]', { visible: true, timeout: 15000 });
  return { ctx, page, errors };
}
const chip = (page) => page.evaluate(() => {
  const c = document.getElementById('menu-pair-chip');
  if (!c || c.hidden || !c.offsetParent) return null;
  return { txt: c.querySelector('.menu-pair-txt').textContent, why: c.querySelector('.menu-pair-why').textContent,
    add: c.querySelector('[data-pair-add]').dataset.pairAdd, addLabel: c.querySelector('[data-pair-add]').getAttribute('aria-label') };
});
const order = (page) => page.evaluate(() => (tableOrders.T4 || []).map((l) => l.id + '×' + l.qty).join(','));

try {
  console.log('■ A waiter on shift, French');
  {
    const { ctx, page, errors } = await openApp('fr', 'T4');
    check(true, 'the waiter app opens on its main screen from the real /api/employee session (clocked in)');
    check(pairsStatus.length > 0 && pairsStatus.every((s) => s === 200), 'the real /api/pairs answers 200 to a clocked-in waiter of this store');
    check(await chip(page) === null, 'an empty table shows no suggestion');
    await page.click('.menu-item[data-menu-id="it_msemen"]');
    await page.waitForFunction(() => !document.getElementById('menu-pair-chip').hidden, { timeout: 5000 });
    let c = await chip(page);
    check(c && c.add === 'it_the' && /Souvent avec Msemen miel · Thé à la menthe/.test(c.txt), `a msemen calls the tea (${c && c.txt})`);
    check(c && /^86 % des tickets avec Msemen miel · 28 derniers jours$/.test(c.why), `with the real share of tickets (${c && c.why})`);
    if (process.env.KIWI_PAIRS_SHOT) await page.screenshot({ path: process.env.KIWI_PAIRS_SHOT });
    await page.click('#menu-pair-chip [data-pair-add]');
    await page.waitForFunction(() => (tableOrders.T4 || []).some((l) => l.id === 'it_the'), { timeout: 5000 });
    check(await order(page) === 'it_msemen×1,it_the×1', `« + » adds the tea to the table by the normal path (${await order(page)})`);
    await sleep(150);
    c = await chip(page);
    check(c && c.add === 'it_cafe', `then the tea calls the coffee (${c && c.txt})`);
    await page.click('#menu-pair-chip [data-pair-dismiss]');
    await sleep(150);
    check(await chip(page) === null, '« × » sets it aside for this table, nothing else to suggest');
    check(await order(page) === 'it_msemen×1,it_the×1', 'dismissing adds nothing');
    check(errors.length === 0, 'no script error in the waiter app' + (errors.length ? ': ' + errors.join(' | ') : ''));
    await ctx.close();
  }
  for (const [lang, table, lead, why, add] of forLocales([
    ['en', 'T5', /Often with Msemen miel · Thé à la menthe/, /^86% of tickets with Msemen miel · last 28 days$/, /^Add /],
    ['ar', 'T6', /غالباً مع .+ · .+/, /^86% من التذاكر مع .+ · آخر 28 يوماً$/, /^أضف /],
  ])) {
    console.log(`■ The same suggestion in ${lang.toUpperCase()}`);
    const { ctx, page, errors } = await openApp(lang, table);
    await page.click('.menu-item[data-menu-id="it_msemen"]');
    await page.waitForFunction(() => !document.getElementById('menu-pair-chip').hidden, { timeout: 5000 });
    const c = await chip(page);
    check(c && lead.test(c.txt) && why.test(c.why) && add.test(c.addLabel), `in the employee's language (${c && c.txt} / ${c && c.why})`);
    check(errors.length === 0, 'no script error' + (errors.length ? ': ' + errors.join(' | ') : ''));
    await ctx.close();
  }
  console.log(`\npairs-serveur-browser-test: ${checks} checks passed`);
} finally {
  await browser.close();
  server.close();
}
