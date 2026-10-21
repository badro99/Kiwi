#!/usr/bin/env node
/* « Souvent avec… » sur une vraie caisse appairée, au vrai clic.
 *
 * La caisse est posée « appairée » sur un commerce de test qui n'existe que
 * dans la base en mémoire de ce test. /api/menu et /api/pairs sont les VRAIS
 * gestionnaires (functions/api/menu.js, functions/api/pairs.js) sur une base
 * SQLite bâtie depuis schema.sql, avec des tickets qui associent le msemen au
 * thé. On ouvre le service par l'écran d'ouverture, puis tout passe par des
 * clics sur la carte et sur la suggestion :
 *   · un café appelle le thé, pas le jus épuisé ;
 *   · « × » l'écarte pour cette commande ;
 *   · une commande vidée repart de zéro ; un msemen appelle le thé, « + »
 *     l'ajoute par le chemin normal, et la suggestion passe au plat suivant ;
 *   · la caisse passée en anglais : la suggestion suit la langue de la
 *     caisse, pas seulement celle de la carte.
 * Aucun code saisi. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

import { tillToken, TILL_COOKIE } from '../functions/auth/_lib.js';
import * as menuApi from '../functions/api/menu.js';
import * as pairsApi from '../functions/api/pairs.js';

const root = process.env.KIWI_ROOT || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let puppeteer;
try { puppeteer = createRequire(path.join(root, 'app/package.json'))('puppeteer-core'); }
catch { console.log('○ skip: puppeteer-core unavailable'); process.exit(process.env.CI ? 1 : 0); }
const bin = process.env.KIWI_CHROMIUM_BIN || ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/chromium', '/usr/bin/google-chrome'].find(fs.existsSync);
if (!bin) { console.log('○ skip: Chromium unavailable'); process.exit(process.env.CI ? 1 : 0); }

const MERCHANT = 'pairs-browser-bistro';
const AUTH_SECRET = 'pairs-browser-secret';
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
  async batch(statements) { const out = []; for (const s of statements) out.push(await s.run()); return out; },
};
const env = { DB, AUTH_SECRET };
const now = Date.now();
sql.prepare('INSERT INTO merchant_config (merchant, features, name, updated_ts) VALUES (?, ?, ?, ?)')
  .run(MERCHANT, '{}', 'Pairs Browser Bistro', now);
const MENU = {
  cats: [{ id: 'cat_b', name: 'Boissons' }, { id: 'cat_p', name: 'Petit déjeuner' }],
  items: [
    { id: 'it_the', name: 'Thé à la menthe', price: 12, catId: 'cat_b', avail: true },
    { id: 'it_cafe', name: 'Café noir', price: 12, catId: 'cat_b', avail: true },
    { id: 'it_jus', name: 'Orange pressée', price: 18, catId: 'cat_b', avail: false },
    { id: 'it_msemen', name: 'Msemen miel', price: 14, catId: 'cat_p', avail: true },
  ],
};
sql.prepare('INSERT INTO menus (merchant, name, type, data, updated_ts) VALUES (?, ?, ?, ?, ?)')
  .run(MERCHANT, 'Pairs Browser Bistro', 'restaurant', JSON.stringify(MENU), now);
let seq = 0;
const L = (i, n) => ({ i, n, q: 1, t: 12 });
const sale = (lines) => { seq++; sql.prepare(`INSERT INTO sales (id, merchant, amount, amount_cents, method, label, ref, ts, lines) VALUES (?, ?, 26, 2600, 'cash', 'Vente', ?, ?, ?)`)
  .run(`pb-${seq}`, MERCHANT, `R${seq}`, now - seq * 3600e3, JSON.stringify(lines)); };
for (let k = 0; k < 12; k++) sale([L('it_msemen', 'Msemen miel'), L('it_the', 'Thé à la menthe')]);
for (let k = 0; k < 8; k++) sale([L('it_cafe', 'Café noir'), L('it_jus', 'Orange pressée')]);
for (let k = 0; k < 6; k++) sale([L('it_cafe', 'Café noir'), L('it_the', 'Thé à la menthe')]);
const cookie = `${TILL_COOKIE}=${await tillToken(AUTH_SECRET, MERCHANT)}`;

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
let pairsAsked = 0;
async function route(r) {
  const u = r.url();
  if (!u.startsWith(base + '/api/')) return u.startsWith(base) || u.startsWith('data:') ? r.continue() : r.abort();
  const url = new URL(u);
  const handler = url.pathname === '/api/menu' ? menuApi.onRequestGet : url.pathname === '/api/pairs' ? pairsApi.onRequestGet : null;
  if (!handler || r.method() !== 'GET') return r.respond({ status: 404, contentType: 'application/json', body: '{"error":"not-found"}' });
  if (url.pathname === '/api/pairs') pairsAsked++;
  const request = new Request(url.toString().replace(base, 'https://kiwi-os.com'), { headers: { Cookie: cookie } });
  try {
    const res = await handler({ request, env, waitUntil() {} });
    r.respond({ status: res.status, contentType: 'application/json', body: await res.text() });
  } catch (e) { r.respond({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: String(e && e.message) }) }); }
}

try {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.setViewport({ width: 1366, height: 900 });
  await page.setBypassServiceWorker(true);
  await page.setRequestInterception(true);
  page.on('request', (r) => { route(r); });
  await page.evaluateOnNewDocument((m) => {
    localStorage.setItem('kiwiPaired', '1');
    localStorage.setItem('kiwiLiveMerchant', m);
    localStorage.setItem('kiwiPairedVenue', JSON.stringify({ merchant: m, type: 'restaurant', name: 'Pairs Browser Bistro', location: 'Casablanca' }));
  }, MERCHANT);
  await page.goto(base + '/kiwi-caisse.html', { waitUntil: 'load' });

  console.log('■ Opening a real till');
  await page.waitForFunction(() => window.__kiwiCaisseBootedAsDemo === false, { timeout: 20000 });
  check(true, 'the till boots as a real, paired till (not the demo)');
  await page.waitForSelector('.ci-float-chip[data-float="300"]', { visible: true, timeout: 15000 });
  await sleep(600); // l'écran d'ouverture arrive en fondu
  await page.click('.ci-float-chip[data-float="300"]');
  await page.waitForFunction(() => !document.getElementById('clockin-btn').disabled, { timeout: 5000 });
  await page.click('#clockin-btn');
  await page.waitForFunction(() => document.body.classList.contains('is-unlocked'), { timeout: 20000 });
  await sleep(800);
  if (await page.evaluate(() => mode !== 'vrap')) {
    await page.click('.mode-pill[data-mode="vrap"]');
    await page.waitForFunction(() => mode === 'vrap', { timeout: 5000 });
  }
  check(true, 'the service opens by the opening screen (float chosen by tap), take-away mode');
  await page.waitForFunction(() => document.querySelector('.menu-item[data-menu-id="it_msemen"]'), { timeout: 15000 });
  await page.waitForFunction(() => window.KiwiPairs && Object.keys(KiwiPairs._state().pairs || {}).length > 0, { timeout: 15000 });
  check(pairsAsked > 0, 'the till fetched its pairs from /api/pairs');
  await sleep(300);

  const pairRow = () => page.evaluate(() => {
    const r = document.querySelector('#rp-items .rp-pair');
    if (!r || !r.offsetParent) return null;
    const add = r.querySelector('.rp-pair-add').getBoundingClientRect();
    const hit = document.elementFromPoint(add.x + add.width / 2, add.y + add.height / 2);
    return { text: r.textContent.replace(/\s+/g, ' ').trim(), add: r.querySelector('[data-pair-add]').dataset.pairAdd, reachable: !!(hit && hit.closest('.rp-pair-add')) };
  });
  const cartIds = () => page.evaluate(() => cart.map((l) => l.id));
  const tap = async (sel) => { await page.click(sel); await sleep(250); };

  console.log('\n■ A café calls for the thé, not the sold-out juice');
  await tap('.menu-item[data-menu-id="it_cafe"]');
  let row = await pairRow();
  check(row && row.add === 'it_the', `a suggestion appears under the order (« ${row && row.text} »)`);
  check(row && /Souvent avec Café noir · Thé à la menthe/.test(row.text) && /\+ 12/.test(row.text), 'it names both dishes and the price it would add');
  check(row && !/Orange/.test(row.text), 'the juice, sold out, is skipped even though it pairs more often');
  check(row && /% des tickets avec Café noir · 28 derniers jours/.test(row.text), 'it says where it comes from');
  check(row && row.reachable, 'its « + » is on top and reachable (not under the list fade)');

  await tap('#rp-items .rp-pair-x');
  check(await pairRow() === null, '« × » removes it');
  check(JSON.stringify(await cartIds()) === '["it_cafe"]', 'and adds nothing');
  await tap('.menu-item[data-menu-id="it_cafe"]');
  check(await pairRow() === null, 'a second café does not bring back what was dismissed in this order');

  console.log('\n■ A fresh order, a msemen, one tap');
  while ((await cartIds()).length) { await tap('#rp-items .rp-item--cart [data-cart-action="dec"]'); }
  check((await cartIds()).length === 0, 'the order is emptied with « − »');
  await tap('.menu-item[data-menu-id="it_msemen"]');
  row = await pairRow();
  check(row && row.add === 'it_the' && /Souvent avec Msemen miel · Thé à la menthe/.test(row.text), 'a msemen calls for the thé again (the new order starts afresh)');
  await tap('#rp-items .rp-pair-add');
  check(JSON.stringify(await cartIds()) === '["it_msemen","it_the"]', '« + » adds the thé to the order, through the normal path');
  row = await pairRow();
  check(row && row.add === 'it_cafe' && /Souvent avec Thé à la menthe · Café noir/.test(row.text),
    'the suggestion moves on from the last dish entered (thé → café, 6 of its 18 tickets), never back to the msemen');
  check(/26/.test(await page.$eval('#rp-total', (n) => n.textContent)), 'the total follows (14 + 12 = 26 MAD)');

  console.log('\n■ The till switched to English');
  {
    /* La caisse restaurant n'a pas de sélecteur à l'écran : sa langue est la
       préférence enregistrée (le sélecteur de la boutique, la langue de
       l'app native). On passe donc par KiwiCaisseLang.set, la fonction même
       qu'appelle un sélecteur ; la caisse se repeint par son abonnement. */
    await page.evaluate(() => KiwiCaisseLang.set('en'));
    await page.waitForFunction(() => window.KiwiCaisseLang && KiwiCaisseLang.get() === 'en', { timeout: 5000 });
    await sleep(300);
    row = await pairRow();
    /* Les noms sont ceux que la carte affiche dans cette langue (menuName) :
       « Café noir » devient « Black Coffee » sur la tuile comme ici. */
    const nameOf = (id) => page.evaluate((x) => menuName(menuItems.find((m) => m.id === x)), id);
    const cafe = await nameOf('it_cafe'), the = await nameOf('it_the');
    check(row && row.add === 'it_cafe' && row.text.startsWith(`Often with ${the} · ${cafe}`) && row.text.includes(`% of tickets with ${the} · last 28 days`),
      `the suggestion follows the till language, names as the menu shows them (« ${row && row.text} »)`);
    check(await page.$eval('#rp-items .rp-pair-add', (b) => b.getAttribute('aria-label')) === `Add ${cafe}`, 'its buttons are named in English too');
  }

  check(errors.length === 0, 'no page error' + (errors.length ? ': ' + errors.join(' | ') : ''));
  console.log(`\npairs-caisse-browser-test: ${checks} checks passed`);
  await ctx.close();
} finally {
  await browser.close();
  await new Promise((r) => server.close(r));
}
