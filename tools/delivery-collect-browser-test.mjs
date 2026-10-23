#!/usr/bin/env node
/* Livraisons à encaisser : le livreur rapporte l'argent au comptoir.
 *   node tools/delivery-collect-browser-test.mjs
 *
 * Une vente partie en livraison est une créance (0 côté serveur, « Livraisons
 * · à recevoir » au Z). Quand l'argent revient, la caisse l'encaisse dans
 * Acomptes, et c'est ce jour-là qu'il entre dans « X MAD aujourd'hui ».
 *   · sur la démo, au toucher (iPad) : vente en livraison, en-tête inchangé,
 *     encaissement en deux fois, en-tête qui monte de ce qui est reçu ;
 *   · contre /api/receivables (intercepté) : ce que la caisse envoie, un
 *     paiement rejoué après une réponse perdue qui ne compte qu'une fois, le
 *     refus « exceeds-due » expliqué, et une route absente qui se tait. */
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
const S = suite('delivery-collect', { browser });
const IPAD = { width: 1024, height: 768, isMobile: true, hasTouch: true, deviceScaleFactor: 1 };
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
  // coverage: surface=caisse-entry locale=fr viewport=phone
  // coverage: surface=caisse-entry locale=fr viewport=tablet
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
const headMad = async (page) => {
  const t = await page.$eval('#bq-today', (e) => e.textContent.replace(/\s+/g, ' '));
  const m = /·\s*([\d\s ]+)\s*MAD/.exec(t.replace(/[  ]/g, ' '));
  return { text: t, mad: m ? +m[1].replace(/\s/g, '') : NaN };
};

await S.run('sur la démo, une livraison s’encaisse au retour du livreur', async (t) => {
  const page = await till(t, IPAD);
  const before = await headMad(page);
  t.step('pay the seeded ticket by delivery');
  await tap(page, '.bq-validate');
  await sleep(700);
  await tap(page, '[data-bq-m="livraison"]');
  await sleep(900);
  await page.keyboard.press('Escape');
  await page.evaluate(() => document.querySelectorAll('.modal-veil.is-open [data-bq-close]').forEach((b) => b.click()));
  await sleep(600);
  const sent = await headMad(page);
  assert(sent.mad === before.mad, `a delivery adds nothing to today’s takings (${before.mad} → ${sent.mad} MAD)`);
  t.step('open Acomptes');
  await page.evaluate(() => document.querySelector('[data-bq-view="acomptes"]').click());
  await page.waitForSelector('.kdc-card', { visible: true, timeout: 6000 });
  const due = await page.$eval('.kdc-card .kdc-due', (e) => e.textContent);
  assert(/Reste 5\s?900 MAD/.test(due.replace(/[  ]/g, ' ')), `the delivery waits with its full amount (« ${due} »)`);
  t.step('collect 2 000 MAD in cash');
  await tap(page, '[data-kdc-open="0"]');
  await page.waitForSelector('.kdc-form input', { visible: true });
  const pre = await page.$eval('.kdc-form input', (e) => e.value);
  assert(/^5\s?900$/.test(pre.replace(/[  ]/g, ' ')), `the amount starts at what is owed (${pre})`);
  await page.$eval('.kdc-form input', (e) => { e.value = ''; });
  await page.type('.kdc-form input', '2000');
  await tap(page, '.kdc-ok');
  await page.waitForFunction(() => /Reste 3/.test((document.querySelector('.kdc-card .kdc-due') || {}).textContent || ''), { timeout: 5000 });
  const part = await headMad(page);
  assert(part.mad === before.mad + 2000, `the cash received enters today’s takings (${part.mad} MAD)`);
  t.step('more than what is left is refused at the till');
  await tap(page, '[data-kdc-open="0"]');
  await page.waitForSelector('.kdc-form input', { visible: true });
  await page.$eval('.kdc-form input', (e) => { e.value = ''; });
  await page.type('.kdc-form input', '9000');
  await tap(page, '.kdc-ok');
  const err = await page.$eval('.kdc-err', (e) => (e.hidden ? '' : e.textContent));
  assert(/Il ne reste que 3\s?900 MAD/.test(err.replace(/[  ]/g, ' ')), `an overpayment says what is left (« ${err} »)`);
  t.step('collect the rest');
  await page.$eval('.kdc-form input', (e) => { e.value = ''; });
  await page.type('.kdc-form input', '3900');
  await tap(page, '.kdc-ok');
  await page.waitForFunction(() => !document.querySelector('.kdc-card'), { timeout: 5000 });
  const done = await headMad(page);
  assert(done.mad === before.mad + 5900, `settled: the whole ticket is in today’s takings, once (${done.mad} MAD)`);
});

await S.run('contre /api/receivables : un encaissement rejoué ne compte qu’une fois', async (t) => {
  const ctx = await browser.createBrowserContext();
  t.defer(() => ctx.close());
  const page = t.watch(await ctx.newPage());
  await page.setViewport(IPAD);
  const posts = [];
  let mode = 'list';
  let taken = '';
  await page.setRequestInterception(true);
  page.on('request', (r) => {
    const u = r.url();
    if (u.startsWith(base + '/api/receivables')) {
      if (mode === 'absent') return r.respond({ status: 404, contentType: 'application/json', body: '{"error":"not-found"}' });
      if (r.method() === 'GET') return r.respond({ status: 200, contentType: 'application/json', body: JSON.stringify({ open: [
        { saleId: 'srv-1', ref: '1042', label: 'Caftan Fassi', ts: Date.now() - 864e5, owedCents: 120000, dueCents: posts.some((p) => p.ok) ? 70000 : 120000, collections: [] },
      ] }) });
      const b = JSON.parse(r.postData() || '{}');
      posts.push(b);
      if (posts.length === 1) { b.ok = true; return r.abort('connectionreset'); }   /* written, answer lost */
      if (mode === 'taken' && !taken) { taken = b.id; return r.respond({ status: 409, contentType: 'application/json', body: '{"error":"id-taken"}' }); }   /* key already another sale's: nothing written */
      if (b.amountCents > 70000 && posts.filter((p) => p.ok).length && b.id !== posts[0].id) return r.respond({ status: 409, contentType: 'application/json', body: '{"error":"exceeds-due","dueCents":70000}' });
      return r.respond({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, already: b.id === posts[0].id,
        sale: { id: b.id, saleId: 'srv-1', method: 'cash', amountCents: b.amountCents, ts: Date.now() }, dueCents: 70000 }) });
    }
    return u.startsWith(base) ? r.continue() : r.abort();
  });
  await page.goto(base + '/assets/tokens.css');
  await page.setContent('<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="/assets/tokens.css"><link rel="stylesheet" href="/assets/retail-balances.css"><div id="h"></div><script charset="utf-8" src="/assets/delivery-collect.js"></script>');
  await page.waitForFunction(() => window.KiwiDeliveryCollect);
  await page.evaluate(() => {
    window.__got = [];
    window.__opts = { merchant: 'test-shop', staff: () => ({ id: 'st-7', name: 'Salma' }), toast: () => {},
      onCollected: (sale, d) => { if (!window.__got.some((g) => g.id === sale.id)) window.__got.push({ id: sale.id, cents: sale.amountCents, of: d.saleId }); } };
    return window.KiwiDeliveryCollect.render(document.getElementById('h'), window.__opts);
  });
  await page.waitForSelector('.kdc-card');
  t.step('collect 500 MAD; the answer is lost on the way back');
  await page.click('[data-kdc-open="0"]');
  await page.$eval('.kdc-form input', (e) => { e.value = '500'; e.dispatchEvent(new Event('input')); });
  await page.click('.kdc-ok');
  await page.waitForFunction(() => !document.querySelector('.kdc-err').hidden, { timeout: 4000 });
  const lost = await page.$eval('.kdc-err', (e) => e.textContent);
  assert(/Pas de réponse/.test(lost) && /qu’une fois/.test(lost), `a lost answer invites a retry that cannot count twice (« ${lost} »)`);
  t.step('retry the same payment');
  await page.click('.kdc-ok');
  await page.waitForFunction(() => window.__got.length === 1, { timeout: 4000 });
  assert(posts.length === 2 && posts[0].id === posts[1].id, 'the retry reuses the payment’s key, so the server counts it once');
  const b = posts[0];
  assert(b.method === 'cash' && b.saleId === 'srv-1' && b.amountCents === 50000 && b.merchant === 'test-shop', 'the till sends cash, the delivery, the amount in centimes');
  assert(b.collectedBy && b.collectedBy.name === 'Salma' && b.collectedBy.id === 'st-7' && Object.keys(b.collectedBy).length === 2, 'it names who collected, with nothing else');
  const got = await page.evaluate(() => window.__got);
  assert(got.length === 1 && got[0].cents === 50000, 'the till’s day book gets that payment once');
  t.step('a second payment above what is left');
  await page.waitForSelector('[data-kdc-open="0"]');
  await page.click('[data-kdc-open="0"]');
  await page.$eval('.kdc-form input', (e) => { e.value = '700,01'; e.dispatchEvent(new Event('input')); });
  await page.click('.kdc-ok');
  const err = await page.$eval('.kdc-err', (e) => e.textContent);
  assert(/Il ne reste que 700 MAD/.test(err.replace(/[  ]/g, ' ')), `the till stops it before the server (« ${err} »)`);
  t.step('the key already belongs to another sale: the retry draws a new one');
  mode = 'taken';
  await page.$eval('.kdc-form input', (e) => { e.value = '200'; e.dispatchEvent(new Event('input')); });
  await page.click('.kdc-ok');
  await page.waitForFunction(() => !document.querySelector('.kdc-err').hidden, { timeout: 4000 });
  const clash = await page.$eval('.kdc-err', (e) => e.textContent);
  assert(/réessayez/.test(clash) && !/Pas de réponse/.test(clash), `a taken key says to retry, not that the server is gone (« ${clash} »)`);
  const n = await page.evaluate(() => window.__got.length);
  await page.click('.kdc-ok');
  await page.waitForFunction((k) => window.__got.length === k + 1, { timeout: 4000 }, n);
  const last = posts[posts.length - 1];
  assert(taken && last.id !== taken && /^dlvc-/.test(last.id) && last.amountCents === 20000, 'the second try carries a fresh key, so it is not refused again');
  t.step('the route is absent (older server): the list stays quiet');
  mode = 'absent';
  await page.evaluate(() => window.KiwiDeliveryCollect.render(document.getElementById('h'), window.__opts));
  assert(await page.$eval('#h', (e) => e.children.length === 0), 'no delivery list without the server that can settle it');
});

await S.finish();
server.close();
