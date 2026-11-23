#!/usr/bin/env node
/* Caisse boutique · remise à la marocaine : % , prix convenu ou −MAD, à
 * l'article et au ticket (spec docs/superpowers/specs/2026-11-18-bargain-remise-design.md).
 * Vraie démo, vrais clics, tablette, peau 2027.
 *   node tools/boutique-bargain-browser-test.mjs */
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { suite } from './browser-trace.mjs';
import { pinTradingHour } from './demo-clock.mjs';

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
const S = suite('boutique-bargain', { browser });
const mad = (txt) => Number(String(txt || '').replace(/[^0-9,.-]/g, '').replace(',', '.'));
const assert = (yes, msg) => { if (!yes) throw new Error(msg); console.log('  ✓ ' + msg); };

async function till(t) {
  const ctx = await browser.createBrowserContext();
  t.defer(() => ctx.close());
  const page = t.watch(await ctx.newPage());
  await pinTradingHour(page);
  await page.setViewport({ width: 1024, height: 768 });
  await page.setBypassServiceWorker(true);
  await page.setRequestInterception(true);
  page.on('request', (r) => {
    const u = r.url();
    if (u.startsWith(base + '/api/')) return r.respond({ status: 503, contentType: 'application/json', body: '{"error":"offline"}' });
    return u.startsWith(base) || u.startsWith('data:') ? r.continue() : r.abort();
  });
  await page.evaluateOnNewDocument(() => {
    try { Object.defineProperty(navigator.serviceWorker, 'register', { value: () => new Promise(() => {}), configurable: true }); } catch (_) {}
    try { localStorage.setItem('kiwiSkin2027:till', '1'); } catch (_) {}
  });
  t.step('open the demo boutique till');
  // coverage: surface=caisse-boutique locale=fr viewport=tablet
  await page.goto(base + '/kiwi-caisse.html', { waitUntil: 'load' });
  await page.waitForFunction(() => window.KiwiPosDispatch && window.KiwiBoutiqueCatalog, { timeout: 20000 });
  await page.evaluate(() => window.KiwiPosDispatch.unlockById('boutique'));
  await page.waitForFunction(() => document.querySelector('.bq-card'), { timeout: 20000 });
  await sleep(700);
  return page;
}
async function click(page, sel) {
  await page.waitForSelector(sel, { visible: true, timeout: 5000 });
  const box = await (await page.$(sel)).boundingBox();
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
}
async function openCard(page, nth) {
  const cards = await page.$$('.bq-card');
  const box = await cards[nth % cards.length].boundingBox();
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForSelector('#bq-sheet-add', { visible: true, timeout: 5000 });
  await sleep(250);
  return mad(await page.$eval('#bq-sheet-total', (e) => e.textContent));
}
async function typeIn(page, sel, text) {
  await click(page, sel);
  await page.$eval(sel, (i) => { i.select(); });
  await page.keyboard.press('Backspace');
  await page.keyboard.type(text);
  await sleep(250);
}
const total = (page) => page.$eval('.bq-tk-total .val', (e) => e.textContent).then(mad).catch(() => 0);
async function approveIfAsked(page) {
  await sleep(300);
  const asked = await page.$eval('#bq-approve-veil', (x) => x.classList.contains('is-open') && !!x.querySelector('#bq-app-ok')).catch(() => false);
  if (asked) { await click(page, '#bq-app-ok'); await sleep(300); }
}

await S.run('prix convenu, plancher, −MAD et ticket entier', async (t) => {
  const page = await till(t);

  t.step('auto-update watcher');
  /* Ce harnais bloque l'enregistrement du worker, dont caisse-pwa.js attend la
     fin pour charger le module : on le pose à la main, sur la vraie page. */
  const auSrc = await page.evaluate(() => [...document.scripts].map((x) => x.src).find((u) => /caisse-pwa\.js/.test(u)));
  assert(!!auSrc, 'the caisse loads caisse-pwa.js, which loads till-auto-update.js');
  await page.addScriptTag({ url: base + '/assets/till-auto-update.js?v=1' });
  assert(await page.evaluate(() => typeof window.KiwiTillAutoUpdate.decide === 'function'), 'till-auto-update.js runs in the real caisse page');

  t.step('item sheet · Prix convenu');
  const t0 = await total(page); // la démo ouvre parfois sur un ticket déjà garni
  const base0 = await openCard(page, 0);
  await click(page, '#bq-bargain [data-bq-bmode="price"]');
  const agreed0 = Math.round(base0 * 0.9);
  await typeIn(page, '#bq-bargain [data-bq-bval]', String(agreed0));
  const pv = await page.$eval('#bq-bargain .bq-bargain-pv', (e) => e.textContent);
  assert(/→/.test(pv), `the sheet previews ${base0} → ${agreed0} (« ${pv} »)`);
  await click(page, '#bq-sheet-add');
  await approveIfAsked(page);
  await page.waitForFunction(() => !document.querySelector('#bq-sheet-veil').classList.contains('is-open'), { timeout: 5000 });
  const got0 = await total(page);
  assert(Math.abs(got0 - t0 - agreed0) < 0.005, `the ticket total grows by the agreed ${agreed0} MAD (read ${got0}, was ${t0})`);
  assert(await page.evaluate(() => window.KiwiPosDispatch.idle()) === false, 'with a piece on the ticket the till reports a sale in progress (no auto-reload)');
  assert(await page.evaluate(() => window.KiwiTillAutoUpdate.state().tillIdle) === false, 'the watcher reads that from the till');
  assert(await page.$$eval('.bq-line', (ls) => ls.some((l) => /Prix convenu/.test(l.textContent) && l.querySelector('.bq-line-price .was'))), 'the agreed line is tagged and strikes the shelf price');

  t.step('item sheet · below the floor');
  const base1 = await openCard(page, 1);
  await click(page, '#bq-bargain [data-bq-bmode="price"]');
  await typeIn(page, '#bq-bargain [data-bq-bval]', String(Math.floor(base1 * 0.5)));
  /* Sous le plancher, la vente reste possible : « Vendre quand même »,
     derrière l'accord gérante (owner, 23 Nov 2026). */
  assert(!(await page.$eval('#bq-sheet-add', (b) => b.disabled)), 'below the floor, the add button stays usable');
  const addT = await page.$eval('#bq-sheet-add-t', (e) => e.textContent);
  assert(/quand même/i.test(addT), `below the floor, the button reads « Vendre quand même » (« ${addT} »)`);
  const fl = await page.$eval('#bq-bargain .bq-bargain-pv', (e) => e.textContent);
  assert(/minimum/i.test(fl) && /→/.test(fl), `the till names the lowest price and previews the forced price (« ${fl} »)`);

  t.step('item sheet · −MAD');
  await click(page, '#bq-bargain [data-bq-bmode="amount"]');
  await typeIn(page, '#bq-bargain [data-bq-bval]', '10');
  assert(!(await page.$eval('#bq-sheet-add', (b) => b.disabled)), 'a 10 MAD cut is allowed');
  await click(page, '#bq-sheet-add');
  await approveIfAsked(page);
  await sleep(300);
  const want = Math.round((t0 + agreed0 + base1 - 10) * 100) / 100;
  assert(Math.abs(await total(page) - want) < 0.005, `the ticket total is ${want} MAD after −10 MAD on the second item`);

  t.step('ticket · Prix convenu for everything');
  const before = await total(page);
  const target = Math.round(before * 0.95);
  await click(page, '[data-bq-tk-act="remise"]');
  await page.waitForSelector('#bq-tkrem-bargain', { visible: true, timeout: 5000 });
  await click(page, '#bq-tkrem-bargain [data-bq-bmode="price"]');
  await typeIn(page, '#bq-tkrem-bargain [data-bq-bval]', String(target));
  await click(page, '#bq-tkrem-apply');
  await approveIfAsked(page);
  await sleep(400);
  assert(Math.abs(await total(page) - target) < 0.005, `the ticket total is exactly the agreed ${target} MAD (was ${before})`);

  t.step('item sheet · Vendre quand même');
  const t2 = await total(page);
  const base2 = await openCard(page, 1);
  const under = Math.floor(base2 * 0.5);
  await click(page, '#bq-bargain [data-bq-bmode="price"]');
  await typeIn(page, '#bq-bargain [data-bq-bval]', String(under));
  await click(page, '#bq-sheet-add');
  await approveIfAsked(page);
  await page.waitForFunction(() => !document.querySelector('#bq-sheet-veil').classList.contains('is-open'), { timeout: 5000 });
  assert(Math.abs(await total(page) - t2 - under) < 0.005, `the piece sells under the floor at ${under} MAD`);
});

await S.finish();
server.close();
