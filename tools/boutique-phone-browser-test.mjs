#!/usr/bin/env node
/* La caisse boutique démo sur un téléphone (390 × 844), au vrai toucher.
 *   node tools/boutique-phone-browser-test.mjs
 *
 * Mesuré le 2026-10-19 :
 *   · la fiche d'un article mettait le prix à côté du nom, qui se brisait mot
 *     par mot (« Caftan / Fassi », « Caftans · / brodé main / · / 2000… »),
 *     et « Ajouter au ticket · 2 400 MAD » se cassait en trois morceaux ;
 *   · l'Inventaire serrait le nom dans une colonne étroite, à côté du stock,
 *     du prix et du bouton d'étiquettes ;
 *   · Vendus affichait 0 ticket à côté de « 6 ventes » : la démo ne tient pas
 *     de journal, et la règle mobile `.vx-view [class*="-grid"]` (!important)
 *     écrasait la mise en page en deux colonnes de 175 px ;
 *   · sur la caisse de bureau, un long nom touchait son prix barré (le nom,
 *     un <span> en ligne, ne tronquait jamais).
 * Le service worker est tenu à l'écart et /api/ répond 503 (hors ligne). La
 * démo ne demande aucun code. */
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { suite } from './browser-trace.mjs';

const root = process.env.KIWI_ROOT || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let puppeteer;
try { puppeteer = createRequire(path.join(root, 'app/package.json'))('puppeteer-core'); }
catch { console.log('○ skip: puppeteer-core unavailable'); process.exit(process.env.CI ? 1 : 0); }
const bin = process.env.KIWI_CHROMIUM_BIN || ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/chromium', '/usr/bin/google-chrome'].find(fs.existsSync);
if (!bin) { console.log('○ skip: Chromium unavailable'); process.exit(process.env.CI ? 1 : 0); }

const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.json': 'application/json', '.png': 'image/png', '.webp': 'image/webp', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json' };
const server = http.createServer((rq, res) => {
  const pathname = decodeURIComponent(new URL(rq.url, 'http://local').pathname);
  const p = path.resolve(root, '.' + pathname);
  if (!p.startsWith(root + path.sep)) { res.writeHead(403); res.end(); return; }
  fs.readFile(p, (err, data) => { res.writeHead(err ? 404 : 200, { 'Content-Type': mime[path.extname(p)] || 'application/octet-stream' }); res.end(err ? '' : data); });
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await puppeteer.launch({ executablePath: bin, headless: true, args: ['--no-sandbox', '--lang=fr-FR', '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1'] });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const S = suite('boutique-phone', { browser });
const PHONE = { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 };

async function till(t, viewport = PHONE) {
  const ctx = await browser.createBrowserContext();
  t.defer(() => ctx.close());
  const page = t.watch(await ctx.newPage());
  await page.setViewport(viewport);
  await page.setBypassServiceWorker(true);
  await page.setRequestInterception(true);
  page.on('request', (r) => {
    const u = r.url();
    if (u.startsWith(base + '/api/')) return r.respond({ status: 503, contentType: 'application/json', body: '{"error":"offline"}' });
    return u.startsWith(base) || u.startsWith('data:') ? r.continue() : r.abort();
  });
  await page.evaluateOnNewDocument(() => { try { Object.defineProperty(navigator.serviceWorker, 'register', { value: () => new Promise(() => {}), configurable: true }); } catch (_) {} });
  t.step('open the demo boutique till');
  await page.goto(base + '/kiwi-caisse.html', { waitUntil: 'load' });
  await page.waitForFunction(() => window.KiwiPosDispatch && window.KiwiBoutiqueCatalog, { timeout: 20000 });
  await page.evaluate(() => window.KiwiPosDispatch.unlockById('boutique'));
  await page.waitForFunction(() => document.querySelector('.bq-card'), { timeout: 20000 });
  await sleep(700);
  return page;
}
/* Un toucher au centre de l'élément, comme un doigt. */
async function tap(page, sel) {
  await page.waitForSelector(sel, { visible: true, timeout: 5000 });
  const box = await (await page.$(sel)).boundingBox();
  await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
}
async function tapText(page, scope, re) {
  const ok = await page.evaluate((scopeSel, src) => {
    const rx = new RegExp(src);
    const e = [...document.querySelectorAll(scopeSel)].find((x) => x.offsetWidth && x.getBoundingClientRect().left < innerWidth && rx.test(x.innerText.replace(/\s+/g, ' ').trim()));
    document.querySelectorAll('[data-t-tap]').forEach((x) => x.removeAttribute('data-t-tap'));
    if (e) e.setAttribute('data-t-tap', '1');
    return !!e;
  }, scope, re.source);
  if (!ok) throw new Error('nothing to tap matching ' + re);
  await tap(page, '[data-t-tap]');
}
async function goTo(page, label) {
  await tap(page, '.vx-burger');
  await sleep(700);
  await tapText(page, '.bq-rail button, .bq-rail a', new RegExp('^' + label));
  await sleep(1000);
}
const assert = (yes, msg) => { if (!yes) throw new Error(msg); console.log('  ✓ ' + msg); };

await S.run('la fiche d’un article tient sur un téléphone', async (t) => {
  const page = await till(t);
  t.step('tap the first product');
  await tap(page, '.bq-card');
  await page.waitForSelector('#bq-sheet-add', { visible: true, timeout: 5000 });
  await sleep(500);
  const m = await page.evaluate(() => {
    const h3 = document.querySelector('.bq-sheet-title h3').getBoundingClientRect();
    const title = document.querySelector('.bq-sheet-title').getBoundingClientRect();
    const price = document.querySelector('.bq-sheet-price').getBoundingClientRect();
    const nb = document.querySelector('#bq-sheet-add .nb').getBoundingClientRect();
    const lh = parseFloat(getComputedStyle(document.querySelector('#bq-sheet-add')).lineHeight) || 20;
    return { h3: h3.height, lh: parseFloat(getComputedStyle(document.querySelector('.bq-sheet-title h3')).lineHeight) || 24, titleBottom: title.bottom, priceTop: price.top, nbH: nb.height, btnLh: lh };
  });
  assert(m.h3 <= m.lh * 1.6, `the product name is not broken word by word (${Math.round(m.h3)}px tall)`);
  assert(m.priceTop >= m.titleBottom - 1, 'the price sits under the name instead of crushing it');
  assert(m.nbH <= m.btnLh * 1.4, `« 2 400 MAD » on the add button stays on one line (${Math.round(m.nbH)}px)`);
});

await S.run('l’inventaire laisse la largeur au nom', async (t) => {
  const page = await till(t);
  await goTo(page, 'Inventaire');
  await page.waitForSelector('.bqi-row', { visible: true, timeout: 5000 });
  const r = await page.evaluate(() => {
    const row = document.querySelector('.bqi-row').getBoundingClientRect();
    const name = document.querySelector('.bqi-row .bqi-info').getBoundingClientRect();
    return { row: row.width, name: name.width, doc: document.documentElement.scrollWidth };
  });
  assert(r.name >= r.row * 0.6, `the name column takes most of the row (${Math.round(r.name)} of ${Math.round(r.row)}px)`);
  assert(r.doc <= 390, 'nothing scrolls sideways');
});

await S.run('Vendus compte les ventes que la caisse vient de faire', async (t) => {
  const page = await till(t);
  t.step('add a product, then pay cash');
  await tap(page, '.bq-card');
  await page.waitForSelector('#bq-sheet-add', { visible: true, timeout: 5000 });
  await sleep(400);
  await tap(page, '#bq-sheet-add');
  await sleep(700);
  await tap(page, '.vx-peek');
  await sleep(800);
  await tap(page, '.bq-validate');
  await sleep(800);
  await tapText(page, 'button', /^Espèces/);
  await page.waitForSelector('#bq-cash-ok', { visible: true, timeout: 5000 });
  await sleep(500);
  await tap(page, '#bq-cash-ok');
  await page.waitForFunction(() => /\b6 ventes\b/.test((document.querySelector('.bq-head-sub') || {}).textContent || ''), { timeout: 8000 });
  const head = await page.$eval('.bq-head-sub', (e) => e.textContent.replace(/\s+/g, ' '));
  await sleep(600);
  t.step('open Vendus');
  await goTo(page, 'Vendus');
  await page.waitForSelector('.ksold-grid', { visible: true, timeout: 8000 });
  const v = await page.evaluate(() => {
    const kpis = [...document.querySelectorAll('[data-bq-panel="vendus"] .kx-kpi')].map((k) => k.innerText.replace(/\s+/g, ' '));
    const grid = getComputedStyle(document.querySelector('.ksold-grid')).gridTemplateColumns.split(' ').length;
    const named = [...document.querySelectorAll('[data-bq-panel="vendus"] .ksold-row')].some((r) => /^Article\b/.test(r.innerText.trim()));
    return { kpis, grid, named };
  });
  const tickets = v.kpis.find((k) => /TICKETS ANALYSÉS/i.test(k)) || '';
  assert(/\b6\b/.test(tickets), `Vendus analyses the 6 tickets the header counts (« ${tickets} » · « ${head.trim()} »)`);
  assert(!v.named, 'every sold line carries its product name');
  assert(v.grid === 1, 'products and baskets stack in one column on a phone');
});

await S.run('sur la caisse de bureau, un long nom ne touche pas son prix barré', async (t) => {
  const page = await till(t, { width: 1440, height: 1000 });
  t.step('start a −30 % promotion on the whole shop');
  await page.evaluate(() => window.KiwiPromos.save({ name: 'Essai', kind: 'percent', value: 30, scope: { type: 'tout' } }));
  await sleep(800);
  const pid = await page.evaluate(() => {
    const P = window.KiwiBoutiqueCatalog.compat().P;
    return Object.keys(P).find((k) => P[k].name === 'Caftan Signature Mansour');
  });
  await page.click(`[data-bq-item="${pid}"]`);
  await page.waitForSelector('#bq-sheet-add', { visible: true, timeout: 5000 });
  await sleep(400);
  await page.click('#bq-sheet-add');
  await sleep(700);
  const g = await page.evaluate(() => {
    const line = [...document.querySelectorAll('.bq-line')].find((l) => l.querySelector('.bq-line-price .was') && l.querySelector('.bq-line-name').textContent.trim() === 'Caftan Signature Mansour');
    const n = line.querySelector('.bq-line-name').getBoundingClientRect();
    const w = line.querySelector('.bq-line-price .was').getBoundingClientRect();
    return { gap: w.left - n.right };
  });
  assert(g.gap >= 6, `the name stops before the struck price (${Math.round(g.gap)}px apart)`);
});

await S.finish();
server.close();
