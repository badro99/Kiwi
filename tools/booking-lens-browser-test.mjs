#!/usr/bin/env node
/* La page publique de réservation (booking.html), dans un vrai navigateur.
 *
 * Une note à l'aveugle (23 octobre) relevait deux écarts : les boutons de
 * langue faisaient 36 × 30 px, sous la cible tactile de 44 px, et la sélection
 * de la langue et de la date n'avait pas la lentille liquide de la marque.
 * On vérifie ici, en FR, EN et AR sur téléphone :
 *   · chaque bouton de langue fait au moins 44 × 44 px ;
 *   · la lentille est posée sur la langue choisie et sur la date choisie ;
 *   · choisir une autre date garde la MÊME rangée (pas de repeinte immédiate),
 *     la lentille s'étire vers la nouvelle date puis s'y pose, et les créneaux
 *     affichés sont ceux de cette date ;
 *   · deux clics rapides : la réponse lente de la première date ne repeint
 *     jamais par-dessus la seconde ;
 *   · la rangée défilée jusqu'au bout garde sa position après le chargement.
 * L'API est simulée : la page lit /api/booking, rien d'autre. */
import { suite } from './browser-trace.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const root = process.env.KIWI_ROOT || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let puppeteer;
try { puppeteer = createRequire(path.join(root, 'app/package.json'))('puppeteer-core'); }
catch { console.log('○ skip: puppeteer-core unavailable — browser assertions not executed'); process.exit(process.env.CI ? 1 : 0); }
const bin = process.env.KIWI_CHROMIUM_BIN || ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/chromium', '/usr/bin/google-chrome'].find(fs.existsSync);
if (!bin) { console.log('○ skip: Chromium unavailable — browser assertions not executed'); process.exit(process.env.CI ? 1 : 0); }

/* Créneaux propres à chaque date : 10:00 UTC + (jour du mois) minutes, pour
   reconnaître sans ambiguïté la date que la liste affiche. */
const slotFor = (date) => Date.parse(date + 'T10:00:00Z') + Number(date.slice(8)) * 60000;
const slow = new Set();
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.json': 'application/json' };
const server = http.createServer((rq, rs) => {
  const u = new URL(rq.url, 'http://local');
  if (u.pathname === '/api/booking') {
    const date = u.searchParams.get('date') || '';
    const body = { name: 'Hammam Test', tz: 'Africa/Casablanca', hoursSet: true, services: [{ id: 's1', name: 'Hammam', duration: 60, price: 200 }] };
    if (date) body.slots = [{ startAt: slotFor(date) }];
    const send = () => { rs.writeHead(200, { 'Content-Type': 'application/json' }); rs.end(JSON.stringify(body)); };
    setTimeout(send, slow.has(date) ? 1400 : 60);
    return;
  }
  if (u.pathname.startsWith('/api/')) { rs.writeHead(404, { 'Content-Type': 'application/json' }); rs.end('{"error":"none"}'); return; }
  const p = path.resolve(root, '.' + decodeURIComponent(u.pathname));
  if (!p.startsWith(root + path.sep)) { rs.writeHead(403); rs.end(); return; }
  fs.readFile(p, (err, data) => { rs.writeHead(err ? 404 : 200, { 'Content-Type': mime[path.extname(p)] || 'application/octet-stream' }); rs.end(err ? '' : data); });
});
await new Promise((resolve) => {
  server.once('error', () => { console.error('Browser test server unavailable in this environment'); process.exit(3); });
  server.listen(0, '127.0.0.1', resolve);
});
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await puppeteer.launch({ executablePath: bin, headless: true, args: ['--no-sandbox', '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1'] });
const tests = suite('booking-lens', { browser });

/* Le rectangle de la lentille et celui de l'élément choisi, dans le repère de la rangée. */
const lensFit = (page, row, item) => page.$eval(row, (r, item) => {
  const lens = r.querySelector(':scope > .kw-lens'), on = r.querySelector(item);
  if (!lens || !on) return { lens: !!lens, on: !!on };
  const m = /translateX\((-?[\d.]+)px\)/.exec(lens.style.transform || '');
  return { lens: true, on: true, opacity: getComputedStyle(lens).opacity, x: m ? +m[1] : null, w: parseFloat(lens.style.width), l: on.offsetLeft, ow: on.offsetWidth };
}, item);

async function open(t, lang) {
  const ctx = await browser.createBrowserContext();
  t.defer(() => ctx.close());
  const page = t.watch(await ctx.newPage());
  await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
  await page.setBypassServiceWorker(true);
  await page.evaluateOnNewDocument((lang) => { localStorage.setItem('kiwiBookingLang', lang); }, lang);
  // coverage: surface=booking locale=fr viewport=phone
  await page.goto(base + '/booking.html?merchant=hammam-test', { waitUntil: 'load' });
  await page.waitForSelector('.bk-choice');
  return page;
}

for (const lang of ['fr', 'en', 'ar']) {
  await tests.run(`${lang}-phone-language-and-dates`, async t => {
    // coverage: surface=booking locale=fr viewport=phone
    // coverage: surface=booking locale=en viewport=phone
    // coverage: surface=booking locale=ar viewport=phone
    const page = await open(t, lang);
    t.step('language buttons are touch targets and carry the lens');
    const sizes = await page.$$eval('.bk-lang button', bs => bs.map(b => { const r = b.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; }));
    assert.equal(sizes.length, 3);
    for (const [w, h] of sizes) assert.ok(w >= 44 && h >= 44, `language button ${w}×${h} is below 44×44`);
    assert.equal(await page.$eval('html', h => h.dir), lang === 'ar' ? 'rtl' : 'ltr');
    await page.waitForFunction(() => { const l = document.querySelector('.bk-lang > .kw-lens'); return l && getComputedStyle(l).opacity === '1'; });
    const lf = await lensFit(page, '.bk-lang', 'button.on');
    assert.ok(Math.abs(lf.x - lf.l) < 1 && Math.abs(lf.w - lf.ow) < 1, 'the language lens sits on the chosen language ' + JSON.stringify(lf));

    t.step('choose the service, then the date row shows the lens on tomorrow');
    await page.click('.bk-choice');
    await page.waitForSelector('.bk-date-row .bk-date.on');
    await page.waitForSelector('.bk-slot');
    await page.waitForFunction(() => { const l = document.querySelector('.bk-date-row > .kw-lens'); return l && getComputedStyle(l).opacity === '1'; });
    let df = await lensFit(page, '.bk-date-row', '.bk-date.on');
    assert.ok(Math.abs(df.x - df.l) < 1 && Math.abs(df.w - df.ow) < 1, 'the date lens sits on the chosen date ' + JSON.stringify(df));

    t.step('another date: same row, the lens stretches then settles, slots follow');
    const dates = await page.$$eval('.bk-date', bs => bs.map(b => b.dataset.date));
    const target = dates[4];
    await page.$eval('.bk-date-row', r => { window.__row = r; });
    await page.click(`.bk-date[data-date="${target}"]`);
    await new Promise(r => setTimeout(r, 60));
    const mid = await page.evaluate(() => {
      const r = document.querySelector('.bk-date-row'), lens = r.querySelector(':scope > .kw-lens');
      return { same: r === window.__row, w: parseFloat(lens.style.width), one: r.querySelector('.bk-date').offsetWidth, stale: !!document.querySelector('[data-stale]') };
    });
    assert.ok(mid.same, 'the date row is not repainted while the lens moves');
    assert.ok(mid.w > mid.one * 2, 'the lens first stretches across the old and new date ' + JSON.stringify(mid));
    assert.ok(mid.stale, 'the previous slots fade while the new ones load');
    await page.waitForFunction((ts) => document.querySelector(`.bk-slot[data-slot="${ts}"]`), {}, slotFor(target));
    df = await lensFit(page, '.bk-date-row', '.bk-date.on');
    assert.equal(await page.$eval('.bk-date.on', b => b.dataset.date), target);
    assert.ok(Math.abs(df.x - df.l) < 1 && Math.abs(df.w - df.ow) < 1, 'the lens settles on the new date ' + JSON.stringify(df));

    t.step('two quick clicks: a late answer never repaints the earlier date');
    slow.add(dates[2]);
    await page.click(`.bk-date[data-date="${dates[2]}"]`);
    await new Promise(r => setTimeout(r, 80));
    await page.click(`.bk-date[data-date="${dates[6]}"]`);
    await new Promise(r => setTimeout(r, 2000));
    slow.delete(dates[2]);
    assert.equal(await page.$eval('.bk-date.on', b => b.dataset.date), dates[6]);
    assert.ok(await page.$(`.bk-slot[data-slot="${slotFor(dates[6])}"]`), 'the slots shown are those of the last date clicked');
    assert.ok(!(await page.$(`.bk-slot[data-slot="${slotFor(dates[2])}"]`)), 'the slow answer for the earlier date was dropped');

    t.step('a row scrolled to its end keeps its place after the load');
    await page.$eval('.bk-date-row', r => { r.scrollLeft = r.scrollWidth; });
    const last = dates[dates.length - 1];
    await page.click(`.bk-date[data-date="${last}"]`);
    await page.waitForFunction((ts) => document.querySelector(`.bk-slot[data-slot="${ts}"]`), {}, slotFor(last));
    const sl = await page.$eval('.bk-date-row', r => Math.abs(r.scrollLeft));
    assert.ok(sl > 100, 'the date row kept its scroll position (' + sl + ')');
  });
}

server.closeAllConnections();
await new Promise(resolve => server.close(resolve));
await tests.finish();
