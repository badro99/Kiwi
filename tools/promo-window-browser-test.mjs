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

  /* Sur téléphone, le composeur tenait plus large que sa fenêtre (91vw dans
     un corps plus étroit) et « Lancer la promotion » n'apparaissait qu'après
     1 400 px de défilement. */
  console.log('\n■ Sur téléphone');
  await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
  await sleep(400);
  await open();
  const phone = await page.evaluate(async () => {
    const shell = document.querySelector('[data-bpd-shell]');
    const wide = [...shell.querySelectorAll('*')].filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.right > innerWidth + 1; }).map((e) => String(e.className || e.tagName).slice(0, 30));
    const body = document.querySelector('.kiwi-modal-body');
    body.scrollTop = 700;
    await new Promise((r) => setTimeout(r, 200));
    const save = document.querySelector('#bpd-save').getBoundingClientRect();
    const hit = document.elementFromPoint(save.left + save.width / 2, save.top + save.height / 2);
    return { wide: wide.slice(0, 5), saveInView: save.top >= 0 && save.bottom <= innerHeight, onTop: !!(hit && hit.closest('#bpd-save')) };
  });
  check(phone.wide.length === 0, 'nothing in the composer runs past the phone screen' + (phone.wide.length ? ' (' + phone.wide.join(', ') + ')' : ''));
  check(phone.saveInView && phone.onTop, '« Lancer la promotion » stays on screen and clickable while the form scrolls');

  /* L'unité de la valeur (% ou MAD) se pose dans le champ, du côté où le texte
     finit. Mesurée, pas lue dans la feuille de style : en français à droite,
     en arabe à gauche, et le texte saisi ne passe jamais dessous. */
  const valueBox = () => page.evaluate(() => {
    const input = document.querySelector('[data-bpd-shell] .bpd-value-box input');
    const unit = document.querySelector('[data-bpd-shell] .bpd-value-box .bpd-unit');
    if (!input || !unit) return null;
    const i = input.getBoundingClientRect(), u = unit.getBoundingClientRect(), cs = getComputedStyle(input);
    return { dir: cs.direction, iL: i.left, iR: i.right, uL: u.left, uR: u.right,
      padL: parseFloat(cs.paddingLeft), padR: parseFloat(cs.paddingRight) };
  });
  const fr = await valueBox();
  check(fr && fr.dir === 'ltr' && fr.uL > (fr.iL + fr.iR) / 2 && fr.uR <= fr.iR && fr.uL >= fr.iR - fr.padR,
    `in French the unit sits inside the input on its right, clear of the text (${JSON.stringify(fr)})`);
  await page.click('[data-bpd-cancel]');

  console.log('\n■ En arabe, sur téléphone (375 px)');
  await page.setViewport({ width: 375, height: 812, isMobile: true, hasTouch: true });
  await page.evaluate(() => KiwiI18n.setLang('ar'));
  await sleep(500);
  await open();
  const ar = await valueBox();
  check(ar && ar.dir === 'rtl' && ar.uR < (ar.iL + ar.iR) / 2 && ar.uL >= ar.iL && ar.uR <= ar.iL + ar.padL,
    `in Arabic the unit sits inside the input on its left, clear of the text (${JSON.stringify(ar)})`);
  const arWide = await page.evaluate(() => {
    const shell = document.querySelector('[data-bpd-shell]');
    return [...shell.querySelectorAll('*')].filter((e) => {
      if (e.closest('.bpd-seg')) return false; // la rangée d'onglets défile d'elle-même
      const r = e.getBoundingClientRect();
      return r.width > 0 && (r.right > innerWidth + 1 || r.left < -1);
    }).map((e) => String(e.className || e.tagName).slice(0, 30));
  });
  check(arWide.length === 0, 'nothing in the Arabic composer runs past a 375 px screen' + (arWide.length ? ' (' + arWide.slice(0, 5).join(', ') + ')' : ''));
  await page.click('[data-bpd-cancel]');
  await page.evaluate(() => KiwiI18n.setLang('fr'));

  check(errors.length === 0, 'no page error' + (errors.length ? ': ' + errors.join(' | ') : ''));
  console.log(`\npromo-window-browser-test: ${checks} checks passed`);
} finally {
  await browser.close();
  await new Promise((r) => server.close(r));
}
