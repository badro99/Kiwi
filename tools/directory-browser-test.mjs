#!/usr/bin/env node
/* Annuaire Kiwi · le hub, une fiche et les deux formulaires dans Chromium,
 * sur ordinateur et sur téléphone, en français (KIWI_LOCALES ajoute en/ar).
 *
 * Les pages viennent des vraies Pages Functions servies par
 * tools/directory-fixture.mjs, sur une base en mémoire semée de fiches de
 * test. On vérifie ce qu'un visiteur vit : pas de défilement horizontal, le
 * client Kiwi en tête avec son badge, la recherche et les filtres sans
 * JavaScript propre, l'inscription jusqu'au merci (et la fiche en attente,
 * invisible), le signalement depuis une fiche.
 *
 *   node tools/directory-browser-test.mjs */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { suite } from './browser-trace.mjs';
import { startDirectoryServer } from './directory-fixture.mjs';
import { LOCALES } from './test-locales.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const req = createRequire(path.join(root, 'app/package.json'));
let puppeteer;
try { puppeteer = req('puppeteer-core'); }
catch { console.log('○ skip: puppeteer-core unavailable, browser assertions not executed'); process.exit(process.env.CI ? 1 : 0); }
const bin = process.env.KIWI_CHROMIUM_BIN || ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/chromium', '/usr/bin/google-chrome'].find(fs.existsSync);
if (!bin) { console.log('○ skip: Chromium unavailable, browser assertions not executed'); process.exit(process.env.CI ? 1 : 0); }

const srv = await startDirectoryServer();
const browser = await puppeteer.launch({ executablePath: bin, headless: true, args: ['--no-sandbox', '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1'] });
const S = suite('directory', { browser });
const BASE = { fr: '/fr/annuaire/', en: '/en/directory/', ar: '/ar/annuaire/' };
const ADD = { fr: 'ajouter', en: 'add', ar: 'ajouter' };
const VIEWS = { desktop: { width: 1440, height: 900 }, phone: { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 } };
const assert = (c, m) => { if (!c) throw new Error(m); };

async function open(t, url, view) {
  const ctx = await browser.createBrowserContext();
  t.defer(() => ctx.close());
  const page = t.watch(await ctx.newPage());
  await page.setViewport(VIEWS[view]);
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('response', (r) => { if (r.status() >= 400 && !/favicon/.test(r.url()) && !r.url().includes('/annuaire/nexiste-pas')) errors.push(r.status() + ' ' + r.url()); });
  t.step('open ' + url + ' · ' + view);
  await page.goto(srv.base + url, { waitUntil: 'networkidle0' });
  return { page, errors };
}
const overflow = (page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

for (const lang of LOCALES) {
  for (const view of ['desktop', 'phone']) {
    await S.run(`hub · ${lang} · ${view}`, async (t) => {
      const { page, errors } = await open(t, BASE[lang], view);
      assert(await overflow(page) <= 0, 'the hub scrolls sideways');
      const cards = await page.$$eval('.dir-card', (els) => els.map((e) => ({ client: e.classList.contains('dir-card--client'), title: e.querySelector('.card-title').textContent })));
      assert(cards.length === 5, 'five fixture listings, got ' + cards.length);
      assert(cards[0].client && !cards.slice(1).some((c) => c.client), 'the Kiwi client comes first, alone');
      assert(await page.$eval('.dir-card--client .dir-badge', (e) => e.getBoundingClientRect().width > 0), 'the client badge is visible');
      assert(await page.$eval('html', (e) => e.dir) === (lang === 'ar' ? 'rtl' : 'ltr'), 'direction');
      const add = await page.$eval('.library-hero a[href$="/' + ADD[lang] + '/"]', (e) => e.getBoundingClientRect().height);
      assert(add >= 44, 'the add button is a real touch target');
      assert(!errors.length, 'console or network errors: ' + errors.join(' | '));
    });
  }
}

await S.run('search and filters work without page script · fr', async (t) => {
  const { page } = await open(t, '/fr/annuaire/', 'desktop');
  await page.type('#dir-q', 'riad');
  await Promise.all([page.waitForNavigation(), page.click('.dir-search button[type="submit"]')]);
  const titles = await page.$$eval('.dir-card .card-title', (els) => els.map((e) => e.textContent));
  assert(titles.length === 1 && titles[0] === 'Riad Yasmine', 'search finds the riad only: ' + titles.join(', '));
  assert(await page.$eval('meta[name="robots"]', (e) => e.content).then((c) => c.includes('noindex')), 'a search result page is noindex');
  await page.goto(srv.base + '/fr/annuaire/', { waitUntil: 'networkidle0' });
  await page.select('#dir-city', 'casablanca');
  await Promise.all([page.waitForNavigation(), page.click('.dir-search button[type="submit"]')]);
  assert(new URL(page.url()).pathname === '/fr/annuaire/casablanca/', 'a city filter lands on the city page: ' + page.url());
  assert((await page.$$('.dir-card')).length === 2, 'two listings in Casablanca');
});

for (const view of ['desktop', 'phone']) {
  await S.run(`client listing · fr · ${view}`, async (t) => {
    const { page, errors } = await open(t, '/fr/annuaire/cafe-atlas-casablanca/', view);
    assert(await overflow(page) <= 0, 'the listing scrolls sideways');
    assert(await page.$eval('h1', (e) => e.textContent) === 'Café Atlas', 'title');
    assert((await page.$$('.dir-hours tr')).length === 7, 'seven days of hours');
    const hrefs = await page.$$eval('.dir-hero-actions a', (els) => els.map((a) => a.getAttribute('href')));
    assert(hrefs.includes('/order?s=fixture-cafe-atlas') && hrefs.includes('/booking?merchant=fixture-cafe-atlas'), 'menu and booking links: ' + hrefs.join(' '));
    const ld = await page.$$eval('script[type="application/ld+json"]', (els) => els.map((e) => JSON.parse(e.textContent)));
    assert(ld.some((x) => x['@type'] === 'CafeOrCoffeeShop' && x.openingHoursSpecification.length === 7), 'LocalBusiness JSON-LD with hours');
    const text = await page.$eval('body', (e) => e.innerText);
    assert(!/prive@example\.com|Contact Privé/.test(text), 'private contact shown');
    assert(!errors.length, 'console or network errors: ' + errors.join(' | '));
  });
}

await S.run('a business lists itself, then waits for review · fr · phone', async (t) => {
  const { page } = await open(t, '/fr/annuaire/ajouter/', 'phone');
  assert(await overflow(page) <= 0, 'the form scrolls sideways');
  await page.type('#f-name', 'Librairie des Remparts');
  await page.select('#f-trade', 'librairie');
  await page.select('#f-city', 'tetouan');
  await page.type('#f-address', '4 rue de la Médina');
  await page.type('#f-description', 'Livres scolaires, papeterie et romans en arabe, français et espagnol.');
  await page.type('#f-phone', '0539000404');
  await page.type('#f-email', 'libraire@example.com');
  t.step('wait the minimum fill time');
  await new Promise((r) => setTimeout(r, 4300));
  await Promise.all([page.waitForNavigation(), page.click('.dir-form button[type="submit"]')]);
  assert(new URL(page.url()).search === '?merci=1', 'thank-you page: ' + page.url());
  assert(await page.$eval('.dir-ok', (e) => e.textContent.includes('Merci')), 'thank-you message');
  const row = srv.sql.prepare("SELECT status, contact_email FROM directory_listings WHERE name = 'Librairie des Remparts'").get();
  assert(row && row.status === 'pending' && row.contact_email === 'libraire@example.com', 'stored pending');
  const hub = await page.goto(srv.base + '/fr/annuaire/', { waitUntil: 'networkidle0' });
  assert(hub.ok() && !(await page.$eval('body', (e) => e.innerText)).includes('Librairie des Remparts'), 'pending is not public');
});

await S.run('a too-fast robot is turned back with its values kept · fr · desktop', async (t) => {
  const { page } = await open(t, '/fr/annuaire/ajouter/', 'desktop');
  await page.type('#f-name', 'Spam Shop');
  await page.select('#f-trade', 'boutique');
  await page.select('#f-city', 'agadir');
  await page.type('#f-email', 'spam@example.com');
  await Promise.all([page.waitForNavigation(), page.click('.dir-form button[type="submit"]')]);
  assert(await page.$eval('.dir-error', (e) => e.getAttribute('role') === 'alert'), 'an error is announced');
  assert(await page.$eval('#f-name', (e) => e.value) === 'Spam Shop', 'values kept');
  assert(!srv.sql.prepare("SELECT 1 FROM directory_listings WHERE name = 'Spam Shop'").get(), 'nothing stored');
});

await S.run('report a listing from its page · fr · phone', async (t) => {
  const { page } = await open(t, '/fr/annuaire/pressing-lumiere-rabat/', 'phone');
  await Promise.all([page.waitForNavigation(), page.click('.dir-report')]);
  assert(new URL(page.url()).pathname === '/fr/annuaire/pressing-lumiere-rabat/signaler/', 'report page');
  await page.click('input[name="kind"][value="removal"]');
  await page.type('#f-message', 'Le pressing a fermé en octobre.');
  await new Promise((r) => setTimeout(r, 4300));
  await Promise.all([page.waitForNavigation(), page.click('.dir-form button[type="submit"]')]);
  assert(await page.$eval('.dir-ok', (e) => e.textContent.length > 10), 'thank-you');
  const r = srv.sql.prepare("SELECT kind, status FROM directory_requests ORDER BY created_ts DESC").get();
  assert(r && r.kind === 'removal' && r.status === 'open', 'request filed');
});

await srv.close();
await S.finish();
