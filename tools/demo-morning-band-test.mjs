#!/usr/bin/env node
/* Démo · la bande d'indicateurs ne dit rien avant la première vente du jour.
 *
 * 2026-10-12. Entre la coupure de 05:00 et la première vente de la démo (vers
 * 07:00), le tableau de bord de démonstration affichait « Commandes 0 · Panier
 * moyen 0 MAD · Marge brute 71,4 % +1,8 % · Taux succès 99,34 % +0,2 % » : une
 * marge et un taux sur zéro commande, et des écarts contre un hier complet.
 * Un vrai commerçant voit « · » dans ce cas ; la démo aussi désormais.
 *
 * Ouvre le vrai dashboard.html en démo locale, l'horloge du navigateur posée à
 * 05:30 puis à 12:30.
 */
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { createRequire } from 'node:module';

const root = process.env.KIWI_ROOT || path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const require = createRequire(path.join(root, 'app/package.json'));
const puppeteer = require('puppeteer-core');
const bin = process.env.KIWI_CHROMIUM_BIN || ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/chromium', '/usr/bin/google-chrome'].find(fs.existsSync);
assert.ok(bin, 'Chromium required for the demo dashboard');

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

async function bandAt(hh, mm) {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  await page.setViewport({ width: 1366, height: 900 });
  await page.setRequestInterception(true);
  page.on('request', (r) => (r.url().startsWith(base) || r.url().startsWith('data:') ? r.continue() : r.abort()));
  await page.evaluateOnNewDocument((hh, mm) => {
    const RealDate = Date;
    const target = new RealDate(); target.setHours(hh, mm, 0, 0);
    const shift = target.getTime() - RealDate.now();
    class AtDate extends RealDate {
      constructor(...a) { if (a.length) super(...a); else super(RealDate.now() + shift); }
      static now() { return RealDate.now() + shift; }
    }
    window.Date = AtDate;
    try { localStorage.setItem('kiwiLang', 'fr'); } catch (_) {}
  }, hh, mm);
  // coverage: surface=dashboard locale=fr viewport=desktop
  await page.goto(base + '/dashboard.html', { waitUntil: 'load' });
  const explore = await page.waitForSelector('.kob-root [data-explore]', { visible: true, timeout: 15000 }).catch(() => null);
  if (explore) { await explore.click(); await sleep(900); }
  await page.waitForSelector('[data-kiwi-skip]', { visible: true, timeout: 15000 });
  await page.click('[data-kiwi-skip]');
  await page.waitForFunction(() => document.querySelectorAll('[data-kpi] [data-kpi-val]').length >= 4, { timeout: 15000 });
  await sleep(1200);
  const out = await page.evaluate(() => ({
    sim: window.KiwiDemoClock?.getSimState?.()?.cumTx,
    tiles: Object.fromEntries([...document.querySelectorAll('[data-kpi]')].map((t) => [t.dataset.kpi, t.innerText.replace(/\s+/g, ' ').trim()])),
  }));
  await ctx.close();
  return out;
}

try {
  const early = await bandAt(5, 30);
  check(early.sim === 0, '05:30 · the demo has made no sale yet today');
  check(/ 0$/.test(early.tiles.tx || ''), '05:30 · orders read 0');
  const quiet = ['panier', 'marge', 'success'].filter((k) => early.tiles[k] != null);
  check(quiet.length === 3, '05:30 · the band shows basket, margin and success');
  check(quiet.every((k) => / ·$/.test(early.tiles[k])), '05:30 · basket, margin and success read « · », not 0 MAD, 71,4 % or 99,34 %: ' + quiet.map((k) => early.tiles[k]).join(' | '));
  check(Object.values(early.tiles).every((t) => !/%/.test(t) && !/vs hier/i.test(t)), '05:30 · no tile compares an empty morning with a full yesterday');

  const noon = await bandAt(12, 30);
  check(noon.sim > 0 && !/ 0$/.test(noon.tiles.tx || ''), '12:30 · the demo has sales and counts them');
  check(/%/.test(noon.tiles.marge || '') && /%/.test(noon.tiles.success || ''), '12:30 · margin and success are shown once there are sales');
} finally {
  await browser.close();
  server.close();
}
console.log(`\ndemo-morning-band: ${checks} passed, 0 failed`);
