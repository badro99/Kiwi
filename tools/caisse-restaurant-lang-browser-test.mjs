#!/usr/bin/env node
/* La langue de la caisse restaurant, choisie au comptoir, au vrai clic.
 *   node tools/caisse-restaurant-lang-browser-test.mjs
 *
 * La boutique avait son sélecteur FR / EN / ع dans le rail ; la caisse
 * restaurant, aucun. Elle suivait la préférence enregistrée, mais une
 * caissière sur le web n'avait aucun moyen de la changer. Le rail porte
 * maintenant un <div data-kcl-host> où assets/caisse-lang.js greffe la même
 * pastille.
 *
 * La caisse est posée « appairée » sur un commerce de test qui n'existe que
 * dans la base en mémoire de ce test ; /api/menu est le VRAI gestionnaire
 * (functions/api/menu.js) sur une base SQLite bâtie depuis schema.sql. On
 * ouvre le service par l'écran d'ouverture (fond choisi au toucher), puis :
 *   · le sélecteur est dans le rail, visible, et rien ne le recouvre ;
 *   · EN au clic : le rail, la vente, l'en-tête daté, les infobulles et la
 *     carte passent en anglais, et le choix est enregistré ;
 *   · ع au clic : la page passe de droite à gauche, les montants restent
 *     lisibles (îlot latin), et le choix survit à un rechargement ;
 *   · FR au clic : tout revient en français ;
 *   · sur tablette (grille du pied de rail), il tient toute la largeur.
 * Aucun code saisi. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

import { tillToken, TILL_COOKIE } from '../functions/auth/_lib.js';
import * as menuApi from '../functions/api/menu.js';
import { suite } from './browser-trace.mjs';

const root = process.env.KIWI_ROOT || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let puppeteer;
try { puppeteer = createRequire(path.join(root, 'app/package.json'))('puppeteer-core'); }
catch { console.log('○ skip: puppeteer-core unavailable'); process.exit(process.env.CI ? 1 : 0); }
const bin = process.env.KIWI_CHROMIUM_BIN || ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/chromium', '/usr/bin/google-chrome'].find(fs.existsSync);
if (!bin) { console.log('○ skip: Chromium unavailable'); process.exit(process.env.CI ? 1 : 0); }

const MERCHANT = 'lang-browser-bistro';
const AUTH_SECRET = 'lang-browser-secret';
const sql = new DatabaseSync(':memory:');
sql.exec(fs.readFileSync(path.join(root, 'schema.sql'), 'utf8'));
const DB = {
  prepare(query) {
    let args = [];
    const st = {
      bind(...a) { args = a.map((v) => (v === undefined ? null : v)); return st; },
      first() { const r = sql.prepare(query).get(...args); return r === undefined ? null : r; },
      all() { return { results: sql.prepare(query).all(...args) }; },
      run() { const r = sql.prepare(query).run(...args); return { success: true, meta: { changes: r.changes } }; },
    };
    return st;
  },
  async batch(statements) { const out = []; for (const s of statements) out.push(await s.run()); return out; },
};
const env = { DB, AUTH_SECRET };
const now = Date.now();
sql.prepare('INSERT INTO merchant_config (merchant, features, name, updated_ts) VALUES (?, ?, ?, ?)')
  .run(MERCHANT, '{}', 'Lang Browser Bistro', now);
const MENU = {
  cats: [{ id: 'cat_b', name: 'Boissons' }, { id: 'cat_p', name: 'Petit déjeuner' }],
  items: [
    { id: 'it_the', name: 'Thé à la menthe', price: 12, catId: 'cat_b', avail: true },
    { id: 'it_cafe', name: 'Café noir', price: 12, catId: 'cat_b', avail: true },
    { id: 'it_msemen', name: 'Msemen miel', price: 1450, catId: 'cat_p', avail: true },
  ],
};
sql.prepare('INSERT INTO menus (merchant, name, type, data, updated_ts) VALUES (?, ?, ?, ?, ?)')
  .run(MERCHANT, 'Lang Browser Bistro', 'restaurant', JSON.stringify(MENU), now);
const cookie = `${TILL_COOKIE}=${await tillToken(AUTH_SECRET, MERCHANT)}`;

const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.json': 'application/json', '.png': 'image/png', '.webp': 'image/webp' };
const server = http.createServer((req, res) => {
  const p = path.resolve(root, '.' + decodeURIComponent(new URL(req.url, 'http://local').pathname));
  if (!p.startsWith(root + path.sep)) { res.writeHead(403); res.end(); return; }
  fs.readFile(p, (err, data) => { res.writeHead(err ? 404 : 200, { 'Content-Type': mime[path.extname(p)] || 'application/octet-stream' }); res.end(err ? '' : data); });
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await puppeteer.launch({ executablePath: bin, headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const S = suite('caisse-restaurant-lang', { browser });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let checks = 0;
const check = (yes, msg) => { assert.ok(yes, msg); checks++; console.log('  ✓ ' + msg); };

async function route(r) {
  const u = r.url();
  if (!u.startsWith(base + '/api/')) return u.startsWith(base) || u.startsWith('data:') ? r.continue() : r.abort();
  const url = new URL(u);
  if (url.pathname !== '/api/menu' || r.method() !== 'GET') return r.respond({ status: 404, contentType: 'application/json', body: '{"error":"not-found"}' });
  const request = new Request(url.toString().replace(base, 'https://kiwi-os.com'), { headers: { Cookie: cookie } });
  try {
    const res = await menuApi.onRequestGet({ request, env, waitUntil() {} });
    r.respond({ status: res.status, contentType: 'application/json', body: await res.text() });
  } catch (e) { r.respond({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: String(e && e.message) }) }); }
}

/* L'écran d'ouverture, au toucher : un fond, puis « Ouvrir la caisse ». */
async function openService(page) {
  await page.waitForFunction(() => window.__kiwiCaisseBootedAsDemo === false, { timeout: 20000 });
  /* Un rechargement en plein service retrouve la caisse ouverte : pas
     d'écran d'ouverture à passer cette fois. */
  await page.waitForFunction(() => document.body.classList.contains('is-unlocked')
    || !!document.querySelector('.ci-float-chip[data-float="300"]')?.offsetParent, { timeout: 15000 });
  if (!await page.evaluate(() => document.body.classList.contains('is-unlocked'))) {
    await sleep(600); // l'écran d'ouverture arrive en fondu
    await page.click('.ci-float-chip[data-float="300"]');
    await page.waitForFunction(() => !document.getElementById('clockin-btn').disabled, { timeout: 5000 });
    await page.click('#clockin-btn');
    await page.waitForFunction(() => document.body.classList.contains('is-unlocked'), { timeout: 20000 });
  }
  await sleep(600);
  if (await page.evaluate(() => mode !== 'vrap')) {
    await page.click('.mode-pill[data-mode="vrap"]');
    await page.waitForFunction(() => mode === 'vrap', { timeout: 5000 });
  }
  await page.waitForSelector('.menu-item[data-menu-id="it_msemen"]', { visible: true, timeout: 15000 });
}

/* Ce que la caissière lit, relevé en un passage. */
const read = (page) => page.evaluate(() => {
  const txt = (sel) => { const n = document.querySelector(sel); return n ? n.textContent.replace(/\s+/g, ' ').trim() : null; };
  return {
    lang: document.documentElement.getAttribute('lang'),
    dir: document.documentElement.getAttribute('dir'),
    rtl: document.body.classList.contains('kiwi-rtl'),
    saved: localStorage.getItem('kiwiCaisseLang'),
    pressed: [...document.querySelectorAll('.sidebar .rail-lang [data-kcl]')].filter((b) => b.getAttribute('aria-pressed') === 'true').map((b) => b.dataset.kcl),
    cancel: txt('.act-pill[data-action="cancel-sale"] span'),
    takeaway: txt('.mode-pill[data-mode="vrap"] span'),
    delta: txt('#stat-txns-delta'),
    date: txt('#clock-date'),
    cashTitle: document.getElementById('pay-charge')?.getAttribute('title'),
    tile: txt('.menu-item[data-menu-id="it_cafe"]'),
    cafeName: menuName(menuItems.find((m) => m.id === 'it_cafe')),
    cartPrice: document.querySelector('#rp-items .rp-item--cart .rp-item-price')?.textContent || '',
  };
});

/* Un clic au point, comme un doigt : le bouton doit être celui qui est touché. */
async function tapLang(page, id) {
  const pt = await page.evaluate((x) => {
    const b = document.querySelector(`.sidebar .rail-lang [data-kcl="${x}"]`);
    b.scrollIntoView({ block: 'nearest' });
    const r = b.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  }, id);
  await page.mouse.click(pt.x, pt.y);
  await page.waitForFunction((x) => window.KiwiCaisseLang.get() === x, { timeout: 5000 }, id);
  await sleep(1200); // le balayage passe, et l'horloge repeint sa date à la seconde
}

try {
  await S.run('restaurant till · the language picker in the rail, by real taps', async (tr) => {
    const ctx = await browser.createBrowserContext();
    tr.defer(() => ctx.close());
    const page = tr.watch(await ctx.newPage());
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.setViewport({ width: 1366, height: 900 });
    await page.setBypassServiceWorker(true);
    await page.setRequestInterception(true);
    page.on('request', (r) => { route(r); });
    await page.evaluateOnNewDocument((m) => {
      localStorage.setItem('kiwiPaired', '1');
      localStorage.setItem('kiwiLiveMerchant', m);
      localStorage.setItem('kiwiPairedVenue', JSON.stringify({ merchant: m, type: 'restaurant', name: 'Lang Browser Bistro', location: 'Casablanca' }));
      if (!sessionStorage.getItem('langTestBooted')) { localStorage.removeItem('kiwiCaisseLang'); sessionStorage.setItem('langTestBooted', '1'); }
    }, MERCHANT);

    tr.step('open a paired restaurant till');
    // coverage: surface=caisse-entry locale=fr viewport=desktop
    await page.goto(base + '/kiwi-caisse.html', { waitUntil: 'load' });
    await openService(page);
    check(true, 'a real paired restaurant till opens by the opening screen (float chosen by tap)');
    await page.click('.menu-item[data-menu-id="it_msemen"]');
    await page.waitForFunction(() => document.querySelectorAll('#rp-items .rp-item--cart').length === 1, { timeout: 5000 });

    tr.step('the picker is in the rail');
    await page.waitForSelector('.sidebar .quick-actions .rail-lang .kcl', { visible: true, timeout: 5000 });
    const picker = await page.evaluate(() => {
      const box = document.querySelector('.sidebar .rail-lang .kcl');
      /* Le pied du rail défile sous la ligne de flottaison sur un écran de
         900 px : la caissière fait défiler le rail, le test aussi. */
      box.scrollIntoView({ block: 'nearest' });
      const rail = document.querySelector('.sidebar').getBoundingClientRect();
      const r = box.getBoundingClientRect();
      const btns = [...box.querySelectorAll('[data-kcl]')];
      return {
        count: document.querySelectorAll('.kcl').length,
        ids: btns.map((b) => b.dataset.kcl),
        inside: r.left >= rail.left - 1 && r.right <= rail.right + 1,
        reachable: btns.every((b) => { const q = b.getBoundingClientRect(); const hit = document.elementFromPoint(q.x + q.width / 2, q.y + q.height / 2); return hit === b; }),
      };
    });
    check(picker.count === 1, 'exactly one picker on the page');
    check(picker.ids.join() === 'fr,en,ar', 'it offers FR, EN and ع');
    check(picker.inside && picker.reachable, 'it sits inside the rail and nothing covers its buttons');
    let s = await read(page);
    check(s.lang === 'fr' && s.dir === 'ltr' && s.pressed.join() === 'fr', 'the till starts in French, FR pressed');
    check(s.cancel === 'Annuler une vente' && s.delta === 'Aucun encaissement', 'the rail reads in French');
    const frTile = s.tile;

    tr.step('tap EN');
    await tapLang(page, 'en');
    s = await read(page);
    check(s.lang === 'en' && s.dir === 'ltr' && !s.rtl && s.pressed.join() === 'en', 'EN tapped: lang=en, left to right, EN pressed');
    check(s.saved === 'en', 'the choice is saved as the till preference (kiwiCaisseLang)');
    check(s.cancel === 'Cancel a sale' && s.takeaway === 'Takeaway', `the rail and the mode pills are in English (« ${s.cancel} », « ${s.takeaway} »)`);
    check(s.delta === 'No payments yet', 'the shift stats are in English');
    check(/^(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\b/.test(s.date), `the header date is in English (« ${s.date} »)`);
    check(s.cashTitle === 'Take cash · F2', 'a tooltip carrying a shortcut is translated too');
    check(s.tile.includes(s.cafeName) && (s.cafeName !== 'Café noir' ? s.tile !== frTile : true), `menu tiles use the names the menu gives in English (« ${s.cafeName} »)`);

    tr.step('tap ع');
    await tapLang(page, 'ar');
    s = await read(page);
    check(s.lang === 'ar' && s.dir === 'rtl' && s.rtl && s.pressed.join() === 'ar', 'ع tapped: lang=ar, right to left');
    check(s.cancel === 'إلغاء بيع' && s.delta === 'لا مدفوعات بعد', 'the rail reads in Arabic');
    check(/[؀-ۿ]/.test(s.date) && !/[A-Za-zÀ-ÿ]{3,}/.test(s.date), `the header date is in Arabic (« ${s.date} »)`);
    check(/⁦[^⁩]*1[\s  .]?450[^⁩]*⁩/.test(s.cartPrice), 'an amount on the bill is held as a Latin island, so it reads « 1 450 MAD », not « MAD 1 450 »');
    const sides = await page.evaluate(() => ({ rail: document.querySelector('.sidebar').getBoundingClientRect().left, main: document.querySelector('.main').getBoundingClientRect().left }));
    check(sides.rail > sides.main, 'the rail moves to the right side, the way Arabic reads');

    tr.step('reload: the choice holds');
    await page.reload({ waitUntil: 'load' });
    await openService(page);
    await page.waitForSelector('.sidebar .rail-lang .kcl', { visible: true, timeout: 5000 });
    await sleep(800);
    s = await read(page);
    check(s.lang === 'ar' && s.dir === 'rtl' && s.pressed.join() === 'ar' && s.cancel === 'إلغاء بيع', 'after a reload the till comes back in Arabic, ع pressed');

    tr.step('tap FR');
    await tapLang(page, 'fr');
    s = await read(page);
    check(s.lang === 'fr' && s.dir === 'ltr' && !s.rtl && s.pressed.join() === 'fr' && s.saved === 'fr', 'FR tapped: back to French, left to right');
    check(s.cancel === 'Annuler une vente' && s.delta === 'Aucun encaissement' && s.cashTitle === 'Encaisser en espèces · F2', 'every string returns to its French original');
    check(/^(lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)\b/.test(s.date), `the header date is in French again (« ${s.date} »)`);

    tr.step('tablet: the rail foot is a grid');
    /* La grille du pied de rail ne s'applique qu'aux écrans tactiles
       (hover: none, pointer: coarse) : une tablette, donc, pas une fenêtre étroite. */
    await page.setViewport({ width: 1024, height: 768, hasTouch: true });
    await sleep(500);
    await page.evaluate(() => document.querySelector('.sidebar .rail-lang .kcl').scrollIntoView({ block: 'nearest' }));
    const grid = await page.evaluate(() => {
      const foot = document.querySelector('.sidebar .quick-actions').getBoundingClientRect();
      const r = document.querySelector('.sidebar .rail-lang .kcl').getBoundingClientRect();
      const b = document.querySelector('.sidebar .rail-lang [data-kcl="en"]').getBoundingClientRect();
      return { foot: foot.width, pick: r.width, tapH: b.height, display: getComputedStyle(document.querySelector('.sidebar .quick-actions')).display };
    });
    check(grid.display === 'grid' && Math.abs(grid.foot - grid.pick) <= 2, `on a tablet it spans the whole rail foot (${Math.round(grid.pick)} of ${Math.round(grid.foot)} px)`);
    check(grid.tapH >= 36, `and its buttons are finger-sized like the rest of the rail foot (${Math.round(grid.tapH)} px tall)`);

    check(errors.length === 0, 'no page error' + (errors.length ? ': ' + errors.join(' | ') : ''));
    console.log(`\ncaisse-restaurant-lang-browser-test: ${checks} checks passed`);
  });
} finally {
  server.close();
  await S.finish();
}
