#!/usr/bin/env node
/* Les caisses sur un iPad en paysage (1024 × 768, tactile), la caisse la plus
 * courante au comptoir.
 *   node tools/ipad-touch-browser-test.mjs
 *
 * Mesuré le 2026-10-19 :
 *   · les − et + du ticket mesuraient 21 px dans treize métiers (une règle
 *     partagée de caisse-dna.css les porte à 32 px, 42 px au doigt) ;
 *   · le champ code-barres de l'épicerie laissait 16 px à la saisie, à côté
 *     de « Scanner » et « Chercher ».
 * Chaque métier est monté pour de vrai ; une ligne de ticket témoin est posée
 * dans son écran, sous ses propres feuilles de style, puis mesurée. */
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
const S = suite('ipad-touch', { browser });
const IPAD = { width: 1024, height: 768, isMobile: true, hasTouch: true, deviceScaleFactor: 1 };
const assert = (yes, msg) => { if (!yes) throw new Error(msg); console.log('  ✓ ' + msg); };

async function open(t, id) {
  const ctx = await browser.createBrowserContext();
  t.defer(() => ctx.close());
  const page = t.watch(await ctx.newPage());
  await page.setViewport(IPAD);
  await page.setBypassServiceWorker(true);
  await page.setRequestInterception(true);
  page.on('request', (r) => {
    const u = r.url();
    if (u.startsWith(base + '/api/')) return r.respond({ status: 503, contentType: 'application/json', body: '{"error":"offline"}' });
    return u.startsWith(base) || u.startsWith('data:') ? r.continue() : r.abort();
  });
  await page.evaluateOnNewDocument(() => { try { Object.defineProperty(navigator.serviceWorker, 'register', { value: () => new Promise(() => {}), configurable: true }); } catch (_) {} });
  t.step('open the demo ' + id + ' till');
  await page.goto(base + '/kiwi-caisse.html', { waitUntil: 'load' });
  await page.waitForFunction(() => window.KiwiPosDispatch, { timeout: 20000 });
  await page.evaluate((v) => window.KiwiPosDispatch.unlockById(v), id);
  await page.waitForFunction((v) => document.querySelector('#pos-' + v + '.kiwi-dna, .vx-screen.is-on.kiwi-dna'), { timeout: 20000 }, id);
  await sleep(500);
  return page;
}

const STEPPERS = { boulangerie: 'bl', boutique: 'bq', epicerie: 'ep', fastfood: 'ff', fleuriste: 'fl', foodtruck: 'ft', librairie: 'lb',
  maison: 'mz', pharmacie: 'ph', pressing: 'px', pizzeria: 'pz', spa: 'sp', hotel: 'ht' };
await S.run('les − et + du ticket se touchent au doigt dans chaque métier', async (t) => {
  const small = [];
  for (const [id, px] of Object.entries(STEPPERS)) {
    const page = await open(t, id);
    t.step('measure a ticket line in ' + id);
    const m = await page.evaluate((px) => {
      const host = document.querySelector('.vx-screen.is-on.kiwi-dna');
      const q = document.createElement('span'); q.className = px + '-line-qty';
      q.innerHTML = '<button>−</button><b>1</b><button>+</button>';
      host.appendChild(q);
      const b = q.querySelector('button'), r = b.getBoundingClientRect(), a = getComputedStyle(b, '::after');
      const pad = a.content !== 'none' && a.position === 'absolute' ? -parseFloat(a.top) || 0 : 0;
      q.remove();
      return { w: r.width, h: r.height, hit: Math.min(r.width, r.height) + 2 * pad };
    }, px);
    if (m.w < 32 || m.h < 32 || m.hit < 40) small.push(`${id} ${Math.round(m.w)}×${Math.round(m.h)} (hit ${Math.round(m.hit)})`);
  }
  assert(!small.length, `every métier draws its ticket − / + at 32 px, 42 px to a finger${small.length ? ': ' + small.join(' · ') : ''}`);
});

await S.run('le champ code-barres de l’épicerie se lit en tapant', async (t) => {
  const page = await open(t, 'epicerie');
  t.step('measure the barcode field');
  await page.waitForSelector('#ep-scan-input', { visible: true, timeout: 5000 });
  const w = await page.$eval('#ep-scan-input', (e) => e.getBoundingClientRect().width);
  assert(w >= 200, `the barcode input is ${Math.round(w)} px wide (a 13-digit EAN needs about 160)`);
  t.step('type a code by hand');
  await page.tap('#ep-scan-input');
  await page.keyboard.type('6111252421018');
  const fits = await page.$eval('#ep-scan-input', (e) => e.scrollWidth <= e.clientWidth + 1);
  assert(fits, 'a 13-digit code typed by hand is shown whole');
});

await S.finish();
server.close();
