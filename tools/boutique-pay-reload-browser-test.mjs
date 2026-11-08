#!/usr/bin/env node
/* r21 till#A2 (copie de boutique-pay-dismiss-browser-test) : rechargement de la page à la frontière du paiement.
 * Ce que le test prouve : page tuée pendant l'écriture d'un paiement, aucune trace d'encaissement ne reste ;
 * page rechargée après l'écriture, la trace d'encaissement survit et le même panier redemande confirmation.
 * Ce qu'il ne prouve pas : un terminal de carte physique ni un reçu imprimé (pas de matériel en bac à sable).
 * Caisse boutique · « Encaisser » répond toujours, quelle que soit la façon
 * dont la fenêtre d'encaissement s'est fermée.
 *   node tools/boutique-pay-dismiss-browser-test.mjs
 *
 * Relevé chez Santos Store le 7 novembre 2026 : quatre fois dans la journée,
 * après avoir mis des articles au ticket, « Encaisser » ne faisait plus rien ;
 * il fallait recharger la caisse et refaire le ticket. Cause : la caisse
 * (caisse-app.js) ferme toute fenêtre ouverte quand on touche à côté ou qu'on
 * appuie sur Échap. Pour la fenêtre d'encaissement de la boutique elle ne
 * trouvait pas de bouton de fermeture connu et retirait seulement la classe
 * is-open : la boutique n'apprenait jamais que le paiement était abandonné,
 * state.checkoutBusy restait vrai et checkout() rendait la main en silence à
 * chaque appui suivant.
 *
 * Vraie démo, vrais clics de souris et vraie touche Échap, sur une tablette. */
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

const S = suite('boutique-pay-reload', { browser });
const TABLET = { width: 1024, height: 768 };

async function till(t) {
  const ctx = await browser.createBrowserContext();
  t.defer(() => ctx.close());
  const page = t.watch(await ctx.newPage());
  await pinTradingHour(page);
  await page.setViewport(TABLET);
  await page.setBypassServiceWorker(true);
  await page.setRequestInterception(true);
  page.on('request', (r) => {
    const u = r.url();
    if (u.startsWith(base + '/api/')) return r.respond({ status: 503, contentType: 'application/json', body: '{"error":"offline"}' });
    return u.startsWith(base) || u.startsWith('data:') ? r.continue() : r.abort();
  });
  await page.evaluateOnNewDocument(() => { try { Object.defineProperty(navigator.serviceWorker, 'register', { value: () => new Promise(() => {}), configurable: true }); } catch (_) {} });
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
const payOpen = (page) => page.$eval('#bq-pay-veil', (v) => v.classList.contains('is-open'));
/* Un article de plus au ticket, par la fiche, comme la vendeuse. */
async function addArticle(page, nth = 0) {
  const cards = await page.$$('.bq-card');
  const box = await cards[nth % cards.length].boundingBox();
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForSelector('#bq-sheet-add', { visible: true, timeout: 5000 });
  await sleep(250);
  await click(page, '#bq-sheet-add');
  await sleep(400);
  if (await page.$eval('#bq-sheet-veil', (v) => v.classList.contains('is-open'))) {
    await page.mouse.click(6, 6);
    await sleep(300);
  }
  await page.waitForFunction(() => { const b = document.querySelector('#bq-validate'); return b && !b.disabled; }, { timeout: 5000 });
}
async function encaisser(page) {
  await click(page, '#bq-validate');
  await sleep(400);
  return payOpen(page);
}
const assert = (yes, msg) => { if (!yes) throw new Error(msg); console.log('  ✓ ' + msg); };


const CHARGE = 'kiwi:lastCharge:boutique';
async function reload(page) {
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => window.KiwiPosDispatch && window.KiwiBoutiqueCatalog, { timeout: 20000 });
  await page.evaluate(() => window.KiwiPosDispatch.unlockById('boutique'));
  await page.waitForFunction(() => document.querySelector('.bq-card'), { timeout: 20000 });
  await sleep(700);
}
async function payCash(page) {
  await page.evaluate(() => { const b = [...document.querySelectorAll('#bq-paym button')].find((x) => /^Espèces/.test(x.innerText.trim())); b.setAttribute('data-t-cash', '1'); });
  await click(page, '[data-t-cash]');
  await click(page, '#bq-cash-ok');
}

await S.run('une page rechargée pendant l’écriture du paiement ne laisse aucune trace d’encaissement', async (t) => {
  const page = await till(t);
  await addArticle(page);
  assert(await encaisser(page), 'Encaisser opens the payment window');
  t.step('hold the commit at its loyalty check, then kill the page');
  await page.evaluate(() => { window.KiwiLoyaltyReserve.create = () => ({ confirm: () => new Promise(() => {}) }); });
  await payCash(page);
  await sleep(300);
  assert(await page.evaluate((k) => localStorage.getItem(k) === null, CHARGE), 'nothing was recorded while the payment is still being written');
  await reload(page);
  assert(await page.evaluate((k) => localStorage.getItem(k) === null, CHARGE), 'after the reload no charge record exists');
  t.step('the same ticket is paid once after the reload, without the duplicate warning');
  await addArticle(page);
  assert(await encaisser(page), 'Encaisser opens the payment window after the reload');
  await payCash(page);
  await sleep(1200);
  assert(await page.evaluate((k) => !!localStorage.getItem(k), CHARGE), 'the retried payment is recorded');
  assert(!(await page.evaluate(() => /Même panier/.test(document.body.innerText))), 'and no duplicate warning was shown for the killed attempt');
});

await S.run('une page rechargée juste après le paiement garde la trace et protège contre un second encaissement', async (t) => {
  const page = await till(t);
  await addArticle(page);
  assert(await encaisser(page), 'Encaisser opens the payment window');
  await payCash(page);
  await sleep(1200);
  const record = await page.evaluate((k) => localStorage.getItem(k), CHARGE);
  assert(!!record, 'the charge is recorded once the payment is written');
  t.step('kill the page right after, add the same article again, Encaisser');
  await reload(page);
  assert((await page.evaluate((k) => localStorage.getItem(k), CHARGE)) === record, 'the charge record survives the reload unchanged');
  await addArticle(page);
  await click(page, '#bq-validate');
  await sleep(500);
  assert(await page.evaluate(() => /Même panier encaissé/.test(document.body.innerText)), 'the same basket asks for confirmation instead of charging a second time');
});

await S.finish();
server.close();
