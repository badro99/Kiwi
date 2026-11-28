#!/usr/bin/env node
/* Caisse boutique, peau 2027, tablette (assets/pos-boutique/line-gestures.js).
 * Owner, 28 nov. 2026, sur la ligne « Hoodie black » : glisser depuis la
 * droite duplique l'article sur une autre ligne ; toucher la ligne rouvre sa
 * fiche pour la modifier.
 *   A · glisser une ligne vers la gauche au-delà du seuil : une ligne de plus,
 *       même article, juste en dessous, une pièce ; la fiche ne s'ouvre pas ;
 *   B · un glissé court, ou un défilement vertical, ne duplique rien ;
 *   C · toucher la ligne ouvre la fiche réglée comme elle (taille, quantité),
 *       bouton « Mettre à jour » ; changer la taille et la quantité remplace
 *       la ligne sur place, sans en ajouter ;
 *   D · le bouton « Remise » et « + » d'une ligne gardent leur rôle.
 * Vraie démo, vrais gestes de souris : rien n'atteint un serveur.
 *   node tools/till-line-gestures-browser-test.mjs */
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { suite } from './browser-trace.mjs';
import { pinTradingHour } from './demo-clock.mjs';

const root = process.env.KIWI_ROOT || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const assert = (yes, msg, got) => { if (!yes) throw new Error(msg + (got !== undefined ? ' · reçu : ' + JSON.stringify(got) : '')); console.log('  ✓ ' + msg); };

/* Sans navigateur : un prix réparti sur le ticket ne s'étend pas aux pièces
   ajoutées dans la fiche (revue de sécurité, 28 nov. 2026). */
{
  const { lineGestures } = await import(new URL('../assets/pos-boutique/line-gestures.js', import.meta.url).href);
  const { ticketOwner } = await import(new URL('../assets/pos-boutique/ticket-owner.js', import.meta.url).href);
  const state = { ticket: { lines: [{ pid: 'p1', size: 'M', color: 'noir', qty: 2, remise: 0, agreed: 250, agreedFrom: 'ticket' }] } };
  const lg = lineGestures({ state, product: () => ({ name: 'Jean', colors: ['noir'] }), ticketOwner, stockAdd: () => true,
    availableStock: () => 10, firstFreeFor: () => 'M', oversellOk: () => true, colorLabel: (c) => c, openSheet() {}, toast() {}, tr: (x) => x, render() {} });
  const sh = lg.sheetFrom(0);
  lg.replace(0, { size: 'M', color: 'noir', qty: 3, remise: 0, agreed: sh.agreed });
  const L = state.ticket.lines;
  assert(L.length === 2 && L[0].qty === 2 && L[0].agreed === 250 && L[0].agreedFrom === 'ticket', 'spread price stays on the 2 pieces it was agreed for', L);
  assert(L[1].qty === 1 && !L[1].agreed && !L[1].agreedFrom && L[1].remise === 0, 'the third piece goes at its own price, on its own line', L[1]);
  const st2 = { ticket: { lines: [{ pid: 'p1', size: 'M', color: 'noir', qty: 2, remise: 0, agreed: 250, agreedFrom: 'ticket' }] } };
  const lg2 = lineGestures({ state: st2, product: () => ({ name: 'Jean', colors: ['noir'] }), ticketOwner, stockAdd: () => true,
    availableStock: () => 10, firstFreeFor: () => 'M', oversellOk: () => true, colorLabel: (c) => c, openSheet() {}, toast() {}, tr: (x) => x, render() {} });
  lg2.replace(0, { size: 'L', color: 'noir', qty: 1, remise: 0, agreed: 250 });
  assert(st2.ticket.lines.length === 1 && st2.ticket.lines[0].qty === 1 && st2.ticket.lines[0].agreedFrom === 'ticket', 'fewer pieces, or another size, keep the agreed price without a new line', st2.ticket.lines);
}

let puppeteer;
try { puppeteer = createRequire(path.join(root, 'app/package.json'))('puppeteer-core'); }
catch { console.log('○ skip: puppeteer-core unavailable'); process.exit(process.env.CI ? 1 : 0); }
const bin = process.env.KIWI_CHROMIUM_BIN || ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/chromium', '/usr/bin/google-chrome'].find(fs.existsSync);
if (!bin) { console.log('○ skip: Chromium unavailable'); process.exit(process.env.CI ? 1 : 0); }

const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.json': 'application/json', '.webp': 'image/webp', '.png': 'image/png' };
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
const S = suite('till-line-gestures', { browser });
const shots = process.env.KIWI_LG_SHOTS || '';

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
  await page.waitForSelector('#pos-boutique.is-on .bq-card', { visible: true, timeout: 20000 });
  await sleep(700);
  return page;
}
const rows = (page) => page.$$eval('#bq-tk-lines [data-bq-line]', (all) => all.map((r) => ({
  name: r.querySelector('.bq-line-name')?.textContent.trim(), size: r.querySelector('.sz')?.textContent.trim(),
  qty: +(r.querySelector('.bq-line-qty b')?.textContent || 0),
})));
const sheetOpen = (page) => page.evaluate(() => { const m = document.querySelector('#bq-sheetm'); return !!(m && m.offsetParent && m.getBoundingClientRect().height > 50); });
async function drag(page, i, dx, dy = 0) {
  const box = await (await page.$(`#bq-tk-lines [data-bq-line="${i}"] .bq-line-mid`)).boundingBox();
  const x = box.x + box.width / 2, y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  for (let k = 1; k <= 8; k++) { await page.mouse.move(x + (dx * k) / 8, y + (dy * k) / 8); await sleep(16); }
  await page.mouse.up();
  await sleep(450);
}
async function tapName(page, i) {
  const box = await (await page.$(`#bq-tk-lines [data-bq-line="${i}"] .bq-line-name`)).boundingBox();
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await sleep(450);
}
async function ensureLine(page) {
  if ((await rows(page)).length) return;
  const cards = await page.$$('.bq-card:not(.is-out)');
  const box = await cards[1].boundingBox();
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForSelector('#bq-sheet-add:not([disabled])', { visible: true, timeout: 6000 });
  await sleep(200);
  await page.click('#bq-sheet-add');
  await sleep(400);
}

await S.run('glisser duplique, toucher modifie', async (t) => {
  const page = await till(t);
  await ensureLine(page);
  const before = await rows(page);
  assert(before.length >= 1, 'the ticket has a line to work on', before);

  t.step('A · swipe the first line from the right');
  await drag(page, 0, -120);
  let now = await rows(page);
  assert(now.length === before.length + 1, 'A · a long swipe adds one line', now);
  assert(now[1].name === before[0].name && now[1].qty === 1, 'A · the copy is the same product, one piece, right below', now[1]);
  assert(now[0].qty === before[0].qty, 'A · the original line keeps its quantity', now[0]);
  assert(!(await sheetOpen(page)), 'A · the swipe does not open the product sheet');

  t.step('B · short swipe and vertical scroll');
  await drag(page, 0, -40);
  await drag(page, 0, 4, 90);
  assert((await rows(page)).length === now.length, 'B · a short swipe or a vertical drag duplicates nothing');
  assert(!(await sheetOpen(page)), 'B · nor opens the sheet');

  t.step('C · tap the copy to edit it');
  await tapName(page, 1);
  assert(await sheetOpen(page), 'C · tapping the line opens its product sheet');
  const sh = await page.evaluate(() => ({
    size: document.querySelector('#bq-size-seg [data-bq-size].on')?.dataset.bqSize,
    qty: document.querySelector('#bq-qty-val')?.textContent.trim(),
    btn: document.querySelector('#bq-sheet-add-t')?.textContent.trim(),
  }));
  assert(sh.size === now[1].size && sh.qty === '1' && sh.btn === 'Mettre à jour', 'C · the sheet is set like the line, with « Mettre à jour »', sh);
  if (shots) await page.screenshot({ path: path.join(shots, 'line-edit-sheet.png') });
  const own = await page.evaluate((cur) => document.querySelector(`#bq-size-seg [data-bq-size="${cur}"] small`)?.textContent.trim(), sh.size);
  assert(own !== 'épuisé', 'C · the line\'s own size counts its own piece as available', own);
  const pick = await page.evaluate((cur) => {
    const n = (x) => +((x.querySelector('small')?.textContent.match(/\d+/) || [0])[0]);
    const all = [...document.querySelectorAll('#bq-size-seg [data-bq-size]')].filter((x) => x.dataset.bqSize !== cur && n(x) > 0).sort((a, b) => n(b) - n(a));
    return all[0] ? { size: all[0].dataset.bqSize, n: n(all[0]) } : null;
  }, sh.size);
  assert(!!pick, 'C · another size has stock', pick);
  const other = pick.size, want = pick.n >= 2 ? 2 : 1;
  await page.click(`#bq-size-seg [data-bq-size="${other}"]`); await sleep(150);
  if (want === 2) { await page.click('#bq-qty-plus'); await sleep(150); }
  await page.click('#bq-sheet-add'); await sleep(500);
  const after = await rows(page);
  assert(after.length === now.length, 'C · « Mettre à jour » replaces the line, it adds none', after);
  assert(after[1].size === other && after[1].qty === want && after[1].name === now[1].name, 'C · the line now has the new size and quantity', after[1]);
  assert(after[0].size === now[0].size && after[0].qty === now[0].qty, 'C · the other line is untouched', after[0]);

  t.step('D · the line buttons keep their role');
  await page.click('#bq-tk-lines [data-bq-line="1"] [data-bq-plus]'); await sleep(400);
  const plus = await rows(page);
  /* Sans pièce libre, « + » demande un second appui (oversell.js) : il ne
     doit en aucun cas ouvrir la fiche ni ajouter une ligne. */
  assert(plus.length === after.length && plus[1].qty >= want && !(await sheetOpen(page)), 'D · « + » keeps its role: no sheet, no new line', plus[1]);
  if (shots) {
    const row = await page.$('#bq-tk-lines [data-bq-line="0"] .bq-line-mid');
    const b = await row.boundingBox();
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2); await page.mouse.down();
    for (let k = 1; k <= 8; k++) { await page.mouse.move(b.x + b.width / 2 - 11 * k, b.y + b.height / 2); await sleep(16); }
    await page.screenshot({ path: path.join(shots, 'line-swipe.png') });
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2); await page.mouse.up(); await sleep(400);
  }
});

await S.finish();
server.close();
