#!/usr/bin/env node
/* Promotions boutique « le mardi, de 12:00 à 14:00 », dans le vrai tableau de
 * bord, au vrai clic.
 *
 *   · le composeur propose les jours (Lun … Dim) et les heures ;
 *   · une heure sans l'autre bloque le lancement, avec la raison ;
 *   · ce qui est enregistré est ce qui a été choisi ;
 *   · la liste dit le créneau, et une promotion hors de son créneau reste sous
 *     « En cours » avec « Hors créneau · Reprend … », sans remiser d'article.
 * Le composeur s'ouvre par son action (Kiwi.handlers['bpd-new']) ; tout le
 * reste passe par des clics et la saisie clavier. Aucun réseau marchand. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { createRequire } from 'node:module';

const ROOT = process.env.KIWI_ROOT || path.resolve(import.meta.dirname, '..');
let puppeteer;
try { puppeteer = createRequire(path.join(ROOT, 'app/package.json'))('puppeteer-core'); }
catch { console.log('○ skip: puppeteer-core unavailable'); process.exit(process.env.CI ? 1 : 0); }
const bin = process.env.KIWI_CHROMIUM_BIN || ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/chromium', '/usr/bin/google-chrome'].find(fs.existsSync);
if (!bin) { console.log('○ skip: Chromium unavailable'); process.exit(process.env.CI ? 1 : 0); }

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2' };
const server = http.createServer((req, res) => {
  const p = decodeURIComponent(new URL(req.url, 'http://local').pathname);
  if (p === '/kiwi-sw.js') { res.writeHead(404); return res.end(); }
  if (p.startsWith('/api/')) {
    res.writeHead(p === '/api/me' ? 200 : 404, { 'Content-Type': 'application/json' });
    return res.end(p === '/api/me' ? '{"authenticated":false}' : '{"error":"not-found"}');
  }
  const f = path.resolve(ROOT, p === '/' ? 'dashboard.html' : p.slice(1));
  if (!f.startsWith(ROOT + path.sep) || !fs.existsSync(f) || !fs.statSync(f).isFile()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
  fs.createReadStream(f).pipe(res);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const browser = await puppeteer.launch({ executablePath: bin, headless: true, args: ['--no-sandbox', '--lang=fr-FR'] });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let checks = 0;
const check = (yes, msg) => { assert.ok(yes, msg); checks++; console.log('  ✓ ' + msg); };

try {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.setViewport({ width: 1440, height: 1000 });
  await page.goto(`http://127.0.0.1:${server.address().port}/dashboard.html`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.Kiwi && Kiwi.handlers && Kiwi.handlers['bpd-new'] && window.KiwiPromos && window.KiwiBoutiqueCatalog, { timeout: 30000 });
  await sleep(1200);
  /* La configuration d'accueil couvre le tableau de bord d'un visiteur : on
     choisit « Explorer », comme le ferait quelqu'un qui découvre. */
  const explore = await page.$('.kob-root [data-explore]');
  if (explore) {
    await explore.click();
    await page.waitForFunction(() => !document.querySelector('.kob-root.kob-in'), { timeout: 8000 });
    await sleep(300);
  }
  /* L'écran d'accueil de la démo écoute le clavier (un code à saisir) : on le
     passe par son bouton « Passer », sans rien y taper. */
  const skip = await page.$('[data-kiwi-skip]');
  if (skip) { await skip.click(); await sleep(700); }

  /* Le composeur attache la boutique courante ; on y pose un article à 1 000
     MAD pour que l'aperçu ait quelque chose à remiser. */
  await page.evaluate(() => {
    Kiwi.handlers['bpd-new']();
    document.querySelector('[data-bpd-cancel]').click();
    KiwiPromos.reset();
    KiwiBoutiqueCatalog.addProduct({ name: 'Caftan essai', priceMAD: 1000, cost: 400 });
  });
  await sleep(400);
  const open = async () => {
    /* La fenêtre précédente se referme en glissant et reste dans le DOM un
       instant : un clic pourrait viser ses puces à elle. */
    await page.waitForFunction(() => !document.querySelector('[data-bpd-shell]'), { timeout: 5000 });
    await page.evaluate(() => Kiwi.handlers['bpd-new']());
    await page.waitForSelector('[data-prd]', { visible: true, timeout: 5000 });
    await sleep(450); // la fenêtre s'ouvre en glissant : on clique une fois posée
  };

  console.log('■ Les jours et les heures dans le composeur');
  await open();
  const chips = await page.$$eval('[data-prd]', (b) => b.map((x) => x.textContent.trim()));
  check(chips.join(' ') === 'Lun Mar Mer Jeu Ven Sam Dim', `seven day chips, Monday first (${chips.join(' ')})`);
  await page.click('[data-prd="2"]');
  await page.waitForSelector('[data-prd="2"][aria-pressed="true"]', { timeout: 3000 });
  await page.click('[data-prd="4"]');
  await page.waitForSelector('[data-prd="4"][aria-pressed="true"]', { timeout: 3000 });
  check(true, 'tapping Mar and Jeu presses them (aria-pressed)');
  await page.click('[data-prd="4"]');
  await page.waitForSelector('[data-prd="4"][aria-pressed="false"]', { timeout: 3000 });
  await page.click('[data-prd="4"]');
  await page.waitForSelector('[data-prd="4"][aria-pressed="true"]', { timeout: 3000 });
  check(true, 'a second tap releases a day, a third presses it again');

  /* Le champ heure suit la langue du navigateur : 24 h en français, 12 h
     (avec AM/PM) en anglais. On tape ce qu'une personne taperait. */
  const h12 = await page.evaluate(() => /h1[12]/.test(new Intl.DateTimeFormat(navigator.language, { hour: 'numeric' }).resolvedOptions().hourCycle || ''));
  await page.click('#bpd-start', { offset: { x: 16, y: 21 } });
  await page.keyboard.type(h12 ? '1200P' : '1200', { delay: 60 });
  await page.keyboard.press('Tab');
  await page.waitForFunction(() => /heure de début et l’heure de fin/.test(document.querySelector('.bpd-problem')?.textContent || ''), { timeout: 3000 });
  check(await page.$eval('#bpd-save', (b) => b.disabled), 'a start hour alone blocks the launch, and says why');
  await page.click('#bpd-end', { offset: { x: 16, y: 21 } });
  await page.keyboard.type(h12 ? '0200P' : '1400', { delay: 60 });
  await page.keyboard.press('Tab');
  await page.waitForFunction(() => !document.querySelector('#bpd-save').disabled, { timeout: 3000 });
  check(true, 'with both hours the promotion can be launched');

  await page.click('#bpd-save');
  await page.waitForFunction(() => KiwiPromos.list().length === 1, { timeout: 3000 });
  const saved = await page.evaluate(() => KiwiPromos.list()[0]);
  check(JSON.stringify(saved.days) === '[2,4]' && saved.start === '12:00' && saved.end === '14:00',
    `what was chosen is what is stored (${JSON.stringify(saved.days)} ${saved.start}–${saved.end})`);

  console.log('\n■ Ce que la liste en dit');
  const rowOf = (id) => page.waitForFunction((pid) => {
    const r = [...document.querySelectorAll('.bpd-row')].find((x) => x.querySelector(`[data-arg="${pid}"]`));
    return r ? r.textContent.replace(/\s+/g, ' ') : false;
  }, { timeout: 5000 }, id).then((h) => h.jsonValue());
  const rowText = await rowOf(saved.id);
  check(rowText.includes('Mar, Jeu · 12:00–14:00'), `the row shows the slot (« ${rowText.slice(0, 120)} »)`);
  const live = await page.evaluate(() => KiwiPromos.status(KiwiPromos.list()[0], Date.now()));
  check(rowText.includes(live === 'active' ? 'En cours' : 'Hors créneau'), `the state label matches the engine (${live})`);

  /* Un jour qui n'est PAS aujourd'hui : la promotion attend son créneau. */
  const other = await page.evaluate(() => (KiwiPromos.businessMoment(Date.now()).weekday + 3) % 7);
  await open();
  await page.click(`[data-prd="${other}"]`);
  await page.waitForSelector(`[data-prd="${other}"][aria-pressed="true"]`, { timeout: 3000 });
  await page.click('#bpd-name', { clickCount: 3 });
  await page.keyboard.type('Jour calme');
  await page.click('#bpd-save');
  await page.waitForFunction(() => KiwiPromos.list().length === 2, { timeout: 3000 });
  const calmId = await page.evaluate(() => KiwiPromos.list().find((p) => p.name === 'Jour calme').id);
  const calm = await rowOf(calmId);
  check(calm.includes('Hors créneau') && /Reprend (demain|lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)/.test(calm),
    `a promotion for another day sits under « En cours » as « Hors créneau · Reprend … » (« ${calm.slice(0, 110)} »)`);
  const price = await page.evaluate(() => {
    const it = Object.values(KiwiBoutiqueCatalog.compat().P).find((x) => x && x.name === 'Caftan essai');
    const deal = it && KiwiPromos.priceFor(it, {});
    return deal ? deal.promo.name : null;
  });
  check(price !== 'Jour calme', 'and it discounts nothing today');

  check(errors.length === 0, 'no page error' + (errors.length ? ': ' + errors.join(' | ') : ''));
  console.log(`\npromo-window-browser-test: ${checks} checks passed`);
} finally {
  await browser.close();
  await new Promise((r) => server.close(r));
}
