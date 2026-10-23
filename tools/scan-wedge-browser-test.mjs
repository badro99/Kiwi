#!/usr/bin/env node
/* La douchette quand le champ de scan n'a pas le focus (assets/scan-wedge.js),
 * dans la vraie caisse, au vrai clavier.
 *
 *   · boutique : le focus est sur un bouton (« client ») ; un scan à vitesse
 *     de douchette pose l'article sur le ticket, et son Entrée n'actionne PAS
 *     le bouton ;
 *   · les mêmes touches tapées à vitesse humaine ne sont jamais prises pour un
 *     scan ;
 *   · le champ de scan qui a le focus reçoit son scan une seule fois (pas de
 *     doublon entre le champ et l'écoute globale) ;
 *   · épicerie : focus perdu, le scan arrive quand même.
 * Les caisses s'ouvrent par KiwiPosDispatch.unlockById : aucun code saisi. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const root = process.env.KIWI_ROOT || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let puppeteer;
try { puppeteer = createRequire(path.join(root, 'app/package.json'))('puppeteer-core'); }
catch { console.log('○ skip: puppeteer-core unavailable'); process.exit(process.env.CI ? 1 : 0); }
const bin = process.env.KIWI_CHROMIUM_BIN || ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/chromium', '/usr/bin/google-chrome'].find(fs.existsSync);
if (!bin) { console.log('○ skip: Chromium unavailable'); process.exit(process.env.CI ? 1 : 0); }

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

async function openTill(id, ready) {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  const problems = [];
  page.on('pageerror', (e) => problems.push(e.message));
  await page.setViewport({ width: 1366, height: 900 });
  await page.setBypassServiceWorker(true);
  await page.setRequestInterception(true);
  page.on('request', (r) => {
    const u = r.url();
    if (u.startsWith(base + '/api/')) return r.respond({ status: 503, contentType: 'application/json', body: '{"error":"offline"}' });
    return u.startsWith(base) || u.startsWith('data:') ? r.continue() : r.abort();
  });
  await page.evaluateOnNewDocument(() => { try { Object.defineProperty(navigator.serviceWorker, 'register', { value: () => new Promise(() => {}), configurable: true }); } catch (_) {} });
  // coverage: surface=caisse-entry locale=fr viewport=desktop
  await page.goto(base + '/kiwi-caisse.html', { waitUntil: 'load' });
  await page.waitForFunction(() => window.KiwiPosDispatch && window.KiwiScanWedge, { timeout: 20000 });
  await page.evaluate((id) => window.KiwiPosDispatch.unlockById(id), id);
  await page.waitForFunction((sel) => { const i = document.querySelector(sel); return i && i.offsetParent !== null; }, { timeout: 20000 }, ready);
  await sleep(500);
  return { ctx, page, problems };
}
/* Une douchette : de vraies frappes (isTrusted), horodatées à `gap` ms l'une
   de l'autre, comme le matériel les horodate. On ne compte pas sur le délai
   réel entre deux envois au navigateur : sur une machine chargée il dépasse
   50 ms et le test mesurerait la charge, pas la caisse. */
async function scan(page, code, gap) {
  const c = await page.createCDPSession();
  let t = Date.now() / 1000;
  const key = async (k, text, vk) => {
    await c.send('Input.dispatchKeyEvent', { type: 'keyDown', key: k, code: vk === 13 ? 'Enter' : 'Digit' + k, text, unmodifiedText: text, windowsVirtualKeyCode: vk, timestamp: t });
    await c.send('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code: vk === 13 ? 'Enter' : 'Digit' + k, windowsVirtualKeyCode: vk, timestamp: t + 0.002 });
    t += gap / 1000;
  };
  for (const ch of code) await key(ch, ch, ch.charCodeAt(0));
  await key('Enter', '\r', 13);
  await c.detach();
  await sleep(350);
}

{
  const { ctx, page, problems } = await openTill('boutique', '#bq-sell-ean');
  const eans = await page.evaluate(() => {
    const c = window.KiwiBoutiqueCatalog.compat();
    return Object.keys(c.BY_EAN).filter((e) => /^\d{8,13}$/.test(e) && c.P[c.BY_EAN[e]]).slice(0, 40).map((e) => ({ ean: e, name: c.P[c.BY_EAN[e]].name }));
  });
  const lines = () => page.$$eval('.bq-line .bq-line-name', (n) => n.map((x) => x.textContent.trim()));
  const modalOpen = () => page.evaluate(() => document.querySelectorAll('.modal-veil.is-open').length);
  const lastToast = () => page.evaluate(() => { const t = [...document.querySelectorAll('[class*=toast]')].map((x) => x.textContent.trim()).filter(Boolean); return t[t.length - 1] || ''; });
  check(eans.length > 0, `demo articles with a barcode (${eans.length})`);

  /* Le focus sur « client » ; on scanne à vitesse de douchette jusqu'à tomber
     sur une déclinaison en stock. Chaque essai doit atteindre la caisse (un
     « Bip » ou un « épuisé »), jamais rester dans le bouton. */
  let pick = null, reached = 0, tries = 0;
  for (const cand of eans) {
    await page.focus('#bq-tk-client');
    const before = (await lines()).length;
    await scan(page, cand.ean, 8);
    tries++;
    const toastText = await lastToast();
    if (/Bip|épuisé/.test(toastText)) reached++;
    if ((await modalOpen()) > 0) break;
    if ((await lines()).length === before + 1 || /Bip/.test(toastText)) { pick = cand; break; }
  }
  check(reached === tries, `every douchette-speed scan reached the till, none stayed in the focused button (${reached}/${tries})`);
  check(!!pick, `focus on « client », the scan lands on the ticket (${pick && pick.name})`);
  check((await modalOpen()) === 0, 'and its Enter did not press the focused button (no client picker opened)');

  await page.focus('#bq-tk-client');
  const n1 = (await lines()).length;
  await page.keyboard.type(pick.ean, { delay: 120 });
  await sleep(200);
  check((await lines()).length === n1, 'the same digits typed at human speed are never taken for a scan');
  await page.keyboard.press('Escape');
  await page.evaluate(() => document.querySelectorAll('.modal-veil.is-open').forEach((v) => v.classList.remove('is-open')));

  check(problems.length === 0, 'no page error' + (problems.length ? ': ' + problems[0] : ''));
  await ctx.close();
}
{
  const { ctx, page, problems } = await openTill('epicerie', '#ep-scan-input');
  /* Les minuteries de la caisse qui redonnent le focus au champ ont le
     temps de passer ; puis le focus va sur un bouton de navigation. */
  await sleep(800);
  await page.focus('.ep-nav-it');
  const focused = await page.evaluate(() => document.activeElement && document.activeElement.className);
  const before = await page.$$eval('.ep-line .ep-line-name', (n) => n.map((x) => x.textContent.trim()));
  await scan(page, '6111035000128', 8);
  const after = await page.$$eval('.ep-line .ep-line-name', (n) => n.map((x) => x.textContent.trim()));
  check(/ep-nav-it/.test(focused || ''), 'épicerie: the focus is on a navigation button, not the scan field');
  check(after.length === before.length + 1 && after.some((x) => /Sidi Ali/.test(x)), 'épicerie: the field lost focus, the scan still lands (Sidi Ali 1,5 L)');
  check(problems.length === 0, 'no page error' + (problems.length ? ': ' + problems[0] : ''));
  await ctx.close();
}

{
  /* Le module seul, au vrai clavier : qui reçoit quoi. */
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  await page.goto(base + '/assets/scan-wedge.js');
  await page.setContent(`<button id="b">bouton</button><input id="i"><button id="hidden" style="display:none"></button><script src="${base}/assets/scan-wedge.js"></script>`);
  await page.waitForFunction(() => window.KiwiScanWedge);
  await page.evaluate(() => {
    window.calls = []; window.clicks = 0; window.inputEnter = 0; window.off = false;
    document.getElementById('b').addEventListener('click', () => window.clicks++);
    document.getElementById('i').addEventListener('keydown', (e) => { if (e.key === 'Enter') window.inputEnter++; });
    window.KiwiScanWedge.attach({ id: 'off', active: () => window.off, onScan: (c) => window.calls.push('off:' + c) });
    window.KiwiScanWedge.attach({ id: 'spy', active: () => !window.off, onScan: (c) => window.calls.push(c) });
  });
  const state = () => page.evaluate(() => ({ calls: window.calls.slice(), clicks: window.clicks, inputEnter: window.inputEnter }));
  await page.focus('#b'); await scan(page, '6111035000128', 8);
  let st = await state();
  check(st.calls.join() === '6111035000128' && st.clicks === 0, 'a fast burst + Enter on a button: one scan delivered, the button not pressed');
  await page.focus('#b'); await page.keyboard.type('6111035000128', { delay: 90 }); await page.keyboard.press('Enter'); await sleep(200);
  st = await state();
  check(st.calls.length === 1 && st.clicks === 1, 'the same keys at human speed: no scan, and Enter presses the button as it always did');
  await page.focus('#i'); await scan(page, '5449000000996', 8);
  st = await state();
  check(st.calls.length === 1 && st.inputEnter === 1, 'a scan into a focused text field stays the field’s own (no double)');
  await page.focus('#b'); await scan(page, '12345', 5);
  st = await state();
  check(st.calls.length === 1, 'five characters are not a barcode');
  await page.evaluate(() => { window.off = true; });
  await page.focus('#b'); await scan(page, '6111252600014', 8);
  st = await state();
  check(st.calls[1] === 'off:6111252600014', 'only the till on screen receives the scan');
  await ctx.close();
}

await browser.close();
server.close();
console.log(`scan-wedge: ${checks} passed`);
