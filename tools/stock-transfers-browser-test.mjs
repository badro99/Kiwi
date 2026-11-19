/* Transferts entre boutiques · la vraie caisse dans Chromium, contre le vrai
 * serveur (functions/api/stock-transfers.js et catalog.js sur une D1 en mémoire).
 *
 * Casablanca : « Transferts » dans le pied du rail (pas sur la vente, pas dans
 * l'inventaire), « Transfert vers Rabat », deux pièces scannées, « Envoyer ».
 * Rabat : un point sur le bouton, rien d'autre ne s'ouvre ; « Reçu en partie »
 * (1 sur 2), puis « Il manque quelque chose » (1) : le stock du serveur suit à
 * chaque geste. Une boutique hors du catalogue partagé n'a pas de bouton.
 * Vrais clics, vrai pointeur.
 *   node tools/stock-transfers-browser-test.mjs */
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
const transfers = await imp('functions/api/stock-transfers.js');
const catalog = await imp('functions/api/catalog.js');
const { materialize } = await imp('functions/api/_rules-catalog.js');
const { tillToken } = await imp('functions/auth/_lib.js');

const AUTH_SECRET = 'stock-transfers-browser-0123456789';
const now = Date.now();
const db = new DatabaseSync(':memory:');
db.exec(fs.readFileSync(path.join(ROOT, 'schema.sql'), 'utf8'));
db.prepare(`INSERT INTO accounts (id,email,business,salt,hash,created_ts,status) VALUES ('acc-s','o@santos.test','Santos Store','s','h',?,'active')`).run(now);
const RABAT = 'santos-store', CASA = 'santos-store-casablanca', SOLO = 'santos-store-marrakech';
for (const [m, f, city] of [[RABAT, { sharedCatalog: true }, 'Rabat'], [CASA, { sharedCatalog: true }, 'Casablanca'], [SOLO, {}, 'Marrakech']]) {
  db.prepare(`INSERT INTO merchant_config (merchant,features,type,account_id,name,city,status,till_epoch,updated_ts) VALUES (?,?,'boutique','acc-s',?,?,'active',0,?)`)
    .run(m, JSON.stringify(f), m, city, now);
}
const T0 = now - 86400000;
const doc = (n) => materialize({
  v: 1, seq: 20, removed: {},
  categories: [{ id: 'cat_1', name: 'Jeans', metaAt: T0 }],
  products: [{ id: 'prod_2', name: 'Jean slim', categoryId: 'cat_1', priceMAD: 299, metaAt: T0 }],
  variants: [{ id: 'var_3', productId: 'prod_2', colorId: 'bleu', colorFamily: 'bleu', size: '38', base: n, baseAt: T0, metaAt: T0,
    barcodes: [{ code: '2010000023383', type: 'ean13', primary: true, at: T0 }] }],
  moves: [],
});
for (const [m, n] of [[RABAT, 7], [CASA, 5], [SOLO, 1]]) db.prepare('INSERT INTO catalogs (merchant,data,rev,updated_ts) VALUES (?,?,1,?)').run(m, JSON.stringify(doc(n)), now);
const stockOf = (m) => materialize(JSON.parse(db.prepare('SELECT data FROM catalogs WHERE merchant = ?').get(m).data)).variants[0].stock;

const env = { AUTH_SECRET, DB: {
  prepare(q) {
    const st = db.prepare(q);
    return { bind(...p) { return {
      async first() { const row = st.get(...p); return row === undefined ? null : row; },
      async all() { return { results: st.all(...p) }; },
      async run() { const r = st.run(...p); return { meta: { changes: r.changes }, success: true }; },
    }; } };
  },
  async batch(stmts) {
    db.exec('BEGIN');
    try { const out = []; for (const s of stmts) out.push(await s.run()); db.exec('COMMIT'); return out; }
    catch (error) { try { db.exec('ROLLBACK'); } catch (_) {} throw error; }
  },
} };
const cookies = {};
for (const m of [RABAT, CASA, SOLO]) cookies[m] = `kiwi_till=${await tillToken(AUTH_SECRET, m)}`;

const ROUTES = { '/api/stock-transfers': transfers, '/api/catalog': catalog };
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const route = ROUTES[url.pathname];
  if (route) {
    const chunks = []; for await (const c of req) chunks.push(c);
    const shop = String(req.headers['x-test-shop'] || '');
    const init = { method: req.method, headers: { Cookie: cookies[shop] || '', 'Content-Type': 'application/json', 'CF-Connecting-IP': '10.0.0.9' } };
    if (req.method === 'POST') init.body = Buffer.concat(chunks).toString('utf8');
    const fn = req.method === 'POST' ? route.onRequestPost : route.onRequestGet;
    const out = await fn({ request: new Request('https://k' + req.url, init), env, waitUntil() {} });
    res.writeHead(out.status, { 'content-type': 'application/json' }); res.end(await out.text()); return;
  }
  if (url.pathname.startsWith('/api/')) { res.writeHead(404, { 'content-type': 'application/json' }); res.end('{}'); return; }
  if (url.pathname === '/blank.html') {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(`<!doctype html><html lang="fr"><head><link rel="stylesheet" href="/assets/tokens.css"></head><body class="is-pos-boutique">
      <div id="root"><aside class="bq-rail"><div class="bq-rail-foot"><button class="bq-lock" id="bq-lock">Verrouiller</button></div></aside>
      <main><section data-bq-panel="vente"><h1>Vente</h1></section></main></div><div id="toasts"></div></body></html>`);
    return;
  }
  const file = path.join(ROOT, url.pathname.slice(1));
  if (!file.startsWith(ROOT) || !fs.existsSync(file)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': (/\.m?js$/.test(file) ? 'text/javascript' : /\.css$/.test(file) ? 'text/css' : 'text/plain') + '; charset=utf-8' });
  res.end(fs.readFileSync(file));
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;
const stamp = (fs.readFileSync(path.join(ROOT, 'assets/pos-boutique.js'), 'utf8').match(/transfers\.js\?v=(\d+)/) || [])[1];

const browser = await puppeteer.launch({ executablePath: bin, headless: true, args: ['--no-sandbox'] });
const S = suite('stock-transfers', { browser });

async function till(t, shop) {
  const context = await browser.createBrowserContext(); t.defer(() => context.close());
  const page = t.watch(await context.newPage());
  await page.setViewport({ width: 1180, height: 820 });
  await page.setExtraHTTPHeaders({ 'x-test-shop': shop });
  await page.goto(base + '/blank.html');
  await page.evaluate(() => {
    window.KiwiEnv = { isReal: () => true };
    window.__toasts = [];
  });
  for (const f of ['material-icons', 'color-palette', 'barcode', 'boutique-catalog-parts', 'boutique-catalog']) await page.addScriptTag({ url: `${base}/assets/${f}.js` });
  await page.evaluate(async (slug, src) => {
    const K = window.KiwiBoutiqueCatalog; K.use(slug); await K.sync();
    const { bqTransfers } = await import(src);
    const toast = (msg, ms, kind) => { window.__toasts.push({ msg, kind }); };
    window.__tr = bqTransfers(document.getElementById('root'), { slug, demo: false, toast, icons: () => window.lucide && window.lucide.createIcons(), by: () => 'Sara' });
  }, shop, `${base}/assets/pos-boutique/transfers.js?v=${stamp}`);
  return page;
}
const visible = (page, sel) => page.$eval(sel, (n) => !!(n.offsetWidth || n.offsetHeight) && !n.hidden).catch(() => false);

await S.run('Casablanca sends two pieces, Rabat receives part then reports one missing', async (t) => {
  const casa = await till(t, CASA);
  await casa.waitForSelector('#bq-transfers', { visible: true });
  assert.equal(await casa.$('.bq-tr-veil:not([hidden])'), null, 'nothing opens by itself');
  await casa.click('#bq-transfers');
  await casa.waitForSelector('[data-tr-to="santos-store"]', { visible: true });
  const label = await casa.$eval('[data-tr-to="santos-store"]', (n) => n.textContent.trim());
  assert.equal(label, 'Transfert vers Rabat');
  await casa.click('[data-tr-to="santos-store"]');
  await casa.waitForSelector('#bq-tr-scan');
  for (let i = 0; i < 2; i++) { await casa.type('#bq-tr-scan', '2010000023383'); await casa.keyboard.press('Enter'); }
  await casa.waitForFunction(() => /2 pièce/.test((document.querySelector('[data-tr-send]') || {}).textContent || ''));
  await casa.click('[data-tr-send]');
  await casa.waitForFunction(() => window.__toasts.some((x) => x.kind === 'success'));
  assert.equal(stockOf(CASA), 3, 'Casablanca: 5 → 3 on the server');
  assert.equal(stockOf(RABAT), 7, 'Rabat untouched until it confirms');
  await casa.waitForFunction(() => /Vers Rabat/.test(document.querySelector('.bq-tr-veil').textContent));

  const rabat = await till(t, RABAT);
  await rabat.waitForSelector('#bq-transfers', { visible: true });
  assert.ok(await visible(rabat, '#bq-transfers .bq-tr-dot'), 'a small dot says something is waiting');
  assert.equal(await rabat.$('.bq-tr-veil:not([hidden])'), null, 'no popup on the receiving till');
  await rabat.click('#bq-transfers');
  await rabat.waitForSelector('[data-tr-partial]', { visible: true });
  assert.match(await rabat.$eval('.bq-tr-card', (n) => n.textContent), /De Casablanca[\s\S]*Jean slim · 38 · bleu[\s\S]*2/);
  await rabat.click('[data-tr-partial]');
  await rabat.waitForSelector('[data-tr-inc="var_3"]');
  await rabat.click('[data-tr-inc="var_3"]');
  await rabat.click('[data-tr-confirm]');
  await rabat.waitForFunction(() => window.__toasts.some((x) => x.kind === 'success'));
  assert.equal(stockOf(RABAT), 8, 'Rabat: one piece in (7 → 8)');
  await rabat.waitForFunction(() => /1 en route/.test(document.querySelector('.bq-tr-veil').textContent));
  await rabat.click('[data-tr-missing]');
  await rabat.waitForSelector('[data-tr-inc="var_3"]');
  await rabat.click('[data-tr-inc="var_3"]');
  await rabat.click('[data-tr-confirm]');
  await rabat.waitForFunction(() => window.__toasts.filter((x) => x.kind === 'success').length === 2);
  assert.equal(stockOf(RABAT), 8, 'the missing piece never enters stock');
  await rabat.waitForFunction(() => /Rien à recevoir/.test(document.querySelector('.bq-tr-veil').textContent));
  await rabat.click('[data-tr-close]');
  assert.ok(!(await visible(rabat, '#bq-transfers .bq-tr-dot')), 'the dot goes away once nothing is waiting');
  const saved = JSON.parse(db.prepare(`SELECT data FROM store_docs WHERE merchant = ? AND feature = 'stock-transfers'`).get(CASA).data).list[0];
  assert.equal(saved.status, 'manque');
  assert.equal(saved.by, 'Sara');
});

await S.run('a shop outside the shared catalogue gets no button', async (t) => {
  const solo = await till(t, SOLO);
  await new Promise((r) => setTimeout(r, 800));
  assert.equal(await solo.$('#bq-transfers'), null);
});

await browser.close();
server.close();
await S.finish();
