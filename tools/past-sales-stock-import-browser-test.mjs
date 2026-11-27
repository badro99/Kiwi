/* Jon's Burgers, 26 nov. 2026 · le vrai tableau de bord dans Chromium.
 *  1. Stock › Outils du stock › « Importer une liste d'articles » : une liste
 *     collée depuis Excel (virgules décimales) crée les articles avec leur coût,
 *     leur unité et leur quantité, sans doublon.
 *  2. Transactions › « Ventes antérieures » contre la vraie route
 *     /api/past-sales sur une D1 en mémoire : un jour à la carte, puis une
 *     période répartie, puis la limite à la veille du premier ticket de caisse.
 * Vrais clics.  node tools/past-sales-stock-import-browser-test.mjs */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { suite, ROOT } from './browser-trace.mjs';

const require = createRequire(new URL('../app/package.json', import.meta.url));
const puppeteer = require('puppeteer-core');
const bin = process.env.KIWI_CHROMIUM_BIN || ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/chromium', '/usr/bin/google-chrome'].find(fs.existsSync);
if (!bin) { console.error('Chromium unavailable'); process.exit(3); }
const imp = (f) => import(pathToFileURL(path.join(ROOT, f)).href);
const route = await imp('functions/api/past-sales.js');
const cashRoute = await imp('functions/api/past-cash.js');
const auth = await imp('functions/auth/_lib.js');
const { businessDate, addBusinessDays } = await imp('functions/api/_business-day.js');

const SECRET = 'past-sales-browser-secret-0123456789';
const M = 'jon-burger-test';
const db = new DatabaseSync(':memory:');
db.exec(fs.readFileSync(path.join(ROOT, 'schema.sql'), 'utf8'));
db.prepare("INSERT INTO accounts (id,email,business,salt,hash,created_ts,status) VALUES ('acc-jon','jon@example.test','Jon Burger Test','s','h',0,'active')").run();
db.prepare("INSERT INTO merchant_config (merchant,features,type,account_id,name,status,updated_ts) VALUES (?,'{}','restaurant','acc-jon','Jon Burger Test','active',0)").run(M);
const today = businessDate(Date.now());
const day = (n) => addBusinessDays(today, n);
db.prepare("INSERT INTO sales (id,merchant,amount,amount_cents,method,label,ts,written_by) VALUES ('till-1',?,40,4000,'cash','Table 1',?,'till:abc')").run(M, Date.parse(day(-1) + 'T13:00:00Z'));
const env = { AUTH_SECRET: SECRET, DB: {
  prepare(q) { const st = db.prepare(q); const b = (...p) => ({
    async first() { const r = st.get(...p); return r === undefined ? null : r; },
    async all() { return { results: st.all(...p) }; },
    async run() { const r = st.run(...p); return { meta: { changes: r.changes }, success: true }; },
  }); return Object.assign(b(), { bind: b }); },
  async batch(stmts) { db.exec('BEGIN'); try { const o = []; for (const s of stmts) o.push(await s.run()); db.exec('COMMIT'); return o; } catch (e) { db.exec('ROLLBACK'); throw e; } },
} };
const owner = `${auth.SESS_COOKIE}=${await auth.makeSession('acc-jon', SECRET)}`;
const live = () => db.prepare("SELECT id, amount_cents, method, lines FROM sales WHERE merchant = ? AND id LIKE 'hist:%' AND void_ts IS NULL ORDER BY id").all(M);

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2' };
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/kiwi-sw.js') { res.writeHead(404); res.end(); return; }
  if (url.pathname === '/api/past-sales' || url.pathname === '/api/past-cash') {
    const r = url.pathname === '/api/past-sales' ? route : cashRoute;
    const chunks = []; for await (const c of req) chunks.push(c);
    const init = { method: req.method, headers: { Cookie: owner, 'Content-Type': 'application/json' } };
    if (req.method === 'POST') init.body = Buffer.concat(chunks).toString('utf8');
    const out = await (req.method === 'POST' ? r.onRequestPost : r.onRequestGet)({ request: new Request('https://k' + req.url, init), env });
    res.writeHead(out.status, { 'content-type': 'application/json' }); res.end(await out.text()); return;
  }
  if (url.pathname.startsWith('/api/')) {
    res.writeHead(url.pathname === '/api/me' ? 200 : 404, { 'content-type': 'application/json' });
    res.end(url.pathname === '/api/me' ? '{"authenticated":false}' : '{}'); return;
  }
  const file = path.resolve(ROOT, url.pathname === '/' ? 'dashboard.html' : url.pathname.slice(1));
  if (!file.startsWith(ROOT + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
  fs.createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await puppeteer.launch({ executablePath: bin, headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const S = suite('past-sales-stock-import', { browser });

async function dashboard(t) {
  const page = t.watch(await browser.newPage());
  await page.setViewport({ width: 1366, height: 900 });
  await page.evaluateOnNewDocument(() => {
    const venue = { id: 'v-jon-burger-test', name: 'Jon Burger Test', fullDisplay: 'Jon Burger Test', slug: 'jon-burger-test', location: '', type: 'restaurant', custom: true,
      siblings: '', status: 'En service', ice: '·', txCount: 0, staffCount: 0, hours: '', methods: '', goal: 0 };
    localStorage.setItem('kiwiCustomVenues', JSON.stringify([venue]));
    localStorage.setItem('kiwiVenue', venue.id);
    localStorage.setItem('kiwiOnboarded', '1');
    localStorage.setItem('kiwiLang', 'fr');
  });
  // coverage: surface=dashboard locale=fr viewport=desktop
  await page.goto(base + '/dashboard.html', { waitUntil: 'load', timeout: 30000 });
  await page.waitForFunction(() => window.Kiwi && window.Kiwi.handlers && window.Kiwi.handlers['nav-stock'] && window.__kiwiLock);
  await page.evaluate(() => { try { window.__kiwiLock.reveal(); } catch (_) {} });
  await page.waitForFunction(() => !document.querySelector('.app.kw-app-hidden'));
  return page;
}
/* KIWI_SHOT_DIR=… : les deux écrans en image, pour une revue à l'œil. */
const shot = async (page, name) => { if (!process.env.KIWI_SHOT_DIR) return; await new Promise((r) => setTimeout(r, 700)); await page.screenshot({ path: path.join(process.env.KIWI_SHOT_DIR, name + '.png') }); };
const clickText = async (page, sel, re) => {
  const h = await page.waitForFunction((s, src) => [...document.querySelectorAll(s)].find((n) => new RegExp(src).test(n.textContent) && n.offsetParent), {}, sel, re.source);
  await h.asElement().click();
};

await S.run('stock: a list pasted from Excel becomes items with cost, unit and quantity', async (t) => {
  const page = await dashboard(t);
  await page.evaluate(() => window.Kiwi.handlers['nav-stock']());
  await page.waitForSelector('[data-action="stock-workspace-actions"]', { visible: true });
  await page.click('[data-action="stock-workspace-actions"]');
  await clickText(page, '[data-catalog-stock]', /Importer une liste/);
  await page.waitForSelector('[data-sti-paste]', { visible: true, timeout: 15000 });
  await page.type('[data-sti-paste]', 'Article;Unité;Catégorie;Coût;Stock\nTortilla JB;unité;Consommables;1,875;240\nSauce Biggy JB;g;Sauces;0,054;\n');
  await page.click('[data-sti-read]');
  await page.waitForFunction(() => /Importer 2 article/.test(document.querySelector('[data-sti-go]').textContent));
  await shot(page, 'stock-import');
  const preview = await page.$eval('[data-sti-body]', (n) => n.textContent);
  assert.match(preview, /2\s*nouveaux/);
  assert.match(preview, /1\s*catégorie\(s\) créée\(s\)/);
  assert.match(preview, /0,054 MAD/, 'a unit cost keeps its third decimal');
  await page.click('[data-sti-go]');
  await page.waitForFunction(() => (window.KiwiRestaurantStock.rows() || []).some((r) => r.name === 'Sauce Biggy JB'));
  const rows = await page.evaluate(() => window.KiwiRestaurantStock.rows().filter((r) => / JB$/.test(r.name)).map((r) => ({ name: r.name, unit: r.unit, cost: r.costPerUnit, stock: r.currentStock })));
  assert.deepEqual(rows, [
    { name: 'Tortilla JB', unit: 'unité', cost: 1.875, stock: 240 },
    { name: 'Sauce Biggy JB', unit: 'g', cost: 0.054, stock: 0 },
  ]);
  /* Same list again: updated, never duplicated. The first window fades out first. */
  await page.waitForFunction(() => !document.querySelector('[data-sti-body]'));
  await page.click('[data-action="stock-workspace-actions"]');
  await clickText(page, '[data-catalog-stock]', /Importer une liste/);
  await page.waitForSelector('[data-sti-paste]', { visible: true });
  await page.type('[data-sti-paste]', 'article;stock\nTortilla JB;200\n');
  await page.click('[data-sti-read]');
  await page.waitForFunction(() => /1\s*mis à jour/.test(document.querySelector('[data-sti-body]').textContent));
  await page.click('[data-sti-go]');
  await page.waitForFunction(() => window.KiwiRestaurantStock.rows().find((r) => r.name === 'Tortilla JB').currentStock === 200);
  assert.equal(await page.evaluate(() => window.KiwiRestaurantStock.rows().filter((r) => r.name === 'Tortilla JB').length), 1);
});

await S.run('past sales: one day from the menu, then a period, saved through the real route', async (t) => {
  const page = await dashboard(t);
  await page.evaluate((m, d) => {
    window.KiwiPastSalesTestToday = d;
    window.KiwiLive.merchant = () => m;
    window.KiwiMenuStore.items = () => [
      { id: 'it_2', name: 'Tacos Indien', price: 40, catId: 'cat_1' },
      { id: 'it_3', name: 'Double Cheese', price: 65, catId: 'cat_2' },
      { id: 'it_4', name: 'Ancien plat', price: 30, catId: 'cat_2', archived: true },
    ];
    window.KiwiMenuStore.categories = () => [{ id: 'cat_1', name: 'Blue Tacos' }, { id: 'cat_2', name: 'Burgers' }];
    /* The till-backed Commandes page, as a real owner session paints it. */
    window.KiwiEnv.isReal = () => true;
  }, M, today);
  await page.evaluate(() => window.Kiwi.handlers['nav-transactions-day'](null, window.KiwiPastSalesTestToday));
  await page.waitForSelector('[data-action="past-sales-open"]', { visible: true, timeout: 20000 });
  await page.click('[data-action="past-sales-open"]');
  /* It opens on « Importer un fichier » (27 nov.) : the menu grid is one tab over. */
  await page.waitForSelector('[data-khi-root] [data-khi-drop]', { visible: true, timeout: 15000 });
  await page.click('[data-kps-tab="day"]');
  await page.waitForSelector('[data-kps-qty="it_2"]', { visible: true, timeout: 15000 });
  assert.equal(await page.$('[data-kps-qty="it_4"]'), null, 'archived dishes are not offered');
  const max = await page.$eval('[data-kps-day]', (n) => n.max);
  assert.equal(max, day(-2), 'the last allowed day is the eve of the first till ticket');
  await page.$eval('[data-kps-day]', (n, d) => { n.value = d; n.dispatchEvent(new Event('change', { bubbles: true })); }, day(-5));
  await page.type('[data-kps-qty="it_2"]', '12');
  await page.type('[data-kps-qty="it_3"]', '7');
  await page.type('[data-kps-price="it_3"]', '60');
  await page.waitForFunction(() => /Enregistrer 1 jour/.test(document.querySelector('[data-kps-save]').textContent));
  assert.match(await page.$eval('[data-kps-save]', (n) => n.textContent.replace(/\s+/g, ' ')), /900/);
  await shot(page, 'past-sales');
  await page.click('[data-kps-save]');
  await page.waitForFunction((d) => [...document.querySelectorAll('[data-kps-edit]')].some((b) => b.dataset.kpsEdit === d), {}, day(-5));
  let rows = live();
  assert.equal(rows.length, 1);
  assert.equal(rows[0].amount_cents, 12 * 4000 + 7 * 6000);
  assert.deepEqual(JSON.parse(rows[0].lines).map((l) => [l.n, l.q, l.t]), [['Tacos Indien', 12, 480], ['Double Cheese', 7, 420]]);

  await page.click('[data-kps-tab="period"]');
  await page.waitForSelector('[data-kps-from]', { visible: true });
  await page.$eval('[data-kps-from]', (n, d) => { n.value = d; n.dispatchEvent(new Event('change', { bubbles: true })); }, day(-12));
  await page.$eval('[data-kps-to]', (n, d) => { n.value = d; n.dispatchEvent(new Event('change', { bubbles: true })); }, day(-10));
  await page.waitForFunction(() => /3 jours/.test(document.querySelector('[data-kps-body]').textContent));
  await page.$eval('[data-kps-qty="it_2"]', (n) => { n.value = ''; });
  await page.evaluate(() => { const n = document.querySelector('[data-kps-qty="it_2"]'); n.value = ''; n.dispatchEvent(new Event('input', { bubbles: true })); });
  await page.type('[data-kps-qty="it_2"]', '7');
  await page.evaluate(() => { for (const s of ['[data-kps-qty="it_3"]', '[data-kps-price="it_3"]']) { const n = document.querySelector(s); n.value = ''; n.dispatchEvent(new Event('input', { bubbles: true })); } });
  await page.waitForFunction(() => /Enregistrer 3 jour/.test(document.querySelector('[data-kps-save]').textContent));
  await page.click('[data-kps-save]');
  await page.waitForFunction((d) => [...document.querySelectorAll('[data-kps-edit]')].some((b) => b.dataset.kpsEdit === d), {}, day(-10));
  rows = live().filter((r) => [day(-12), day(-11), day(-10)].some((d) => r.id.includes(d)));
  assert.equal(rows.length, 3);
  assert.equal(rows.reduce((s, r) => s + JSON.parse(r.lines)[0].q, 0), 7, 'the period total, spread in whole numbers');
  assert.equal(rows.reduce((s, r) => s + r.amount_cents, 0), 7 * 4000);
});

await S.run('history import: an .xlsx of receipts and a CSV of shifts, detected, mapped and imported through both routes', async (t) => {
  require('../assets/pages-pro/catalog-bulk/xlsx.js');
  const dir = fs.mkdtempSync(path.join(process.env.TMPDIR || '/tmp', 'kiwi-hist-'));
  const serial = (d, h, m) => (Date.parse(d + 'T00:00:00Z') / 86400000) + 25569 + (h * 60 + m) / 1440;
  const xlsx = path.join(dir, 'recus.xlsx');
  fs.writeFileSync(xlsx, globalThis.KiwiXlsx.write([
    ['Date', 'Receipt number', 'Receipt type', 'Total collected', 'Payment type', 'Status'],
    [serial(day(-6), 12, 30), 'R-1', 'Sale', 95, 'Cash', 'Closed'],
    [serial(day(-6), 13, 10), 'R-2', 'Sale', 40.5, 'Card', 'Closed'],
    [serial(day(-6), 13, 40), 'R-3', 'Refund', -40.5, 'Card', 'Closed'],
    [serial(day(-5), 20, 0), 'R-4', 'Sale', 60, 'Cash', 'Closed'],
  ], { sheet: 'Receipts' }));
  const csv = path.join(dir, 'services.csv');
  const fr = (d) => d.split('-').reverse().join('/');
  fs.writeFileSync(csv, 'Service;Ouverture;Fermeture;Fond de caisse;Sorties;Attendu;Compté\n'
    + `7;${fr(day(-6))} 09:00;${fr(day(-6))} 23:30;500;120;1450;1440\n`);
  try {
    const page = await dashboard(t);
    await page.evaluate((m) => { window.KiwiLive.merchant = () => m; window.KiwiEnv.isReal = () => true; }, M);
    await page.evaluate((d) => window.Kiwi.handlers['nav-transactions-day'](null, d), today);
    await page.waitForSelector('[data-action="past-sales-open"]', { visible: true, timeout: 20000 });
    await page.click('[data-action="past-sales-open"]');
    await page.waitForSelector('[data-khi-file]', { timeout: 15000 });
    const input = await page.$('[data-khi-file]');
    await input.uploadFile(xlsx, csv);
    await page.waitForFunction(() => document.querySelectorAll('[data-khi-src]').length === 2, { timeout: 15000 });
    const kinds = await page.$$eval('[data-khi-kind]', (ns) => ns.map((n) => n.value));
    assert.deepEqual(kinds, ['tickets', 'shifts']);
    const summary = await page.$eval('.khi-sum', (n) => n.textContent.replace(/\s+/g, ' '));
    assert.match(summary, /3 ticket\(s\) · 195,5 MAD/);
    assert.match(summary, /1 service\(s\) · écart total -10 MAD/);
    assert.match(summary, /Sorties 120 MAD/);
    assert.match(summary, /1 remboursement\(s\) non importé\(s\)/);
    await shot(page, 'history-import');
    if (process.env.KIWI_SHOT_DIR) { await page.$eval('[data-khi-go]', (n) => n.scrollIntoView({ block: 'end' })); await shot(page, 'history-import-summary'); }
    await page.click('[data-khi-go]');
    await page.waitForFunction(() => !document.querySelector('[data-khi-src]') && /Services et mouvements déjà importés/.test(document.querySelector('[data-khi-root]').textContent), { timeout: 20000 });
    const tickets = db.prepare("SELECT ref, method, amount_cents FROM sales WHERE merchant = ? AND ref LIKE 'HIST-T-%' AND void_ts IS NULL ORDER BY ts").all(M);
    assert.deepEqual(tickets.map((r) => [r.ref, r.method, r.amount_cents]), [['HIST-T-R-1', 'cash', 9500], ['HIST-T-R-2', 'card', 4050], ['HIST-T-R-4', 'cash', 6000]]);
    const cash = db.prepare("SELECT event_type, expected_cents, counted_cents, gap_cents, movement_kind, movement_amount_cents FROM cash_session_events WHERE merchant = ? AND terminal_id = 'historique' ORDER BY occurred_ts, id").all(M);
    assert.deepEqual(cash.map((r) => r.event_type), ['open', 'movement', 'close']);
    assert.equal(cash[2].gap_cents, -1000);
    assert.equal(cash[1].movement_amount_cents, 12000);
    /* The day list under the importer now shows the receipt days, counted in receipts, without « Modifier ». */
    const hist = await page.$eval('.kps-hist', (n) => n.textContent);
    assert.match(hist, /2 ticket\(s\)/);
    assert.equal(await page.$(`[data-kps-edit="${day(-6)}"]`), null);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

await browser.close();
server.close();
await S.finish();
