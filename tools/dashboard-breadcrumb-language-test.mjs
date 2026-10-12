#!/usr/bin/env node
/* Fil d'Ariane du tableau de bord · une seule peinture, dans la langue de l'écran.
 *
 * 2026-10-12. Stock, Équipe, Conformité, Marges, Menu, Paie, Réservations et le
 * retour à l'accueil écrivaient chacun leur propre « Accueil / … » en dur : sous
 * l'anglais on lisait « Accueil / Team ». Et setLang() réécrit le nœud
 * (dash.breadcrumb) AVANT d'émettre kiwi:langchange, si bien qu'une page
 * ouverte repassait à « Home / Dashboard ». Tous passent désormais par
 * Kiwi.breadcrumb() (interactive.js), et le retour à l'accueil rend le nœud
 * à i18n.js (KiwiI18n.apply).
 *
 * 1 · le peintre seul, avec les vrais i18n.js et interactive.js ;
 * 2 · le vrai dashboard.html en démo, chaque page ouverte d'un vrai clic sur
 *     la barre latérale, puis FR → EN → AR → accueil → FR ;
 * 3 · plus aucun « Accueil » littéral écrit dans le fil.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { createRequire } from 'node:module';

const root = process.env.KIWI_ROOT || path.resolve(new URL('..', import.meta.url).pathname);
const require = createRequire(path.join(root, 'app/package.json'));
const puppeteer = require('puppeteer-core');
const bin = process.env.KIWI_CHROMIUM_BIN || ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/chromium', '/usr/bin/google-chrome'].find(fs.existsSync);
assert.ok(bin, 'Chromium required for the dashboard breadcrumb test');

/* Same topbar markup as dashboard.html, so i18n.js captures and rewrites it. */
const harness = `<!doctype html><html lang="fr"><head><meta charset="utf-8"></head><body>
<aside class="sidebar"><nav><a data-nav="accueil">Accueil</a><a data-nav="stock">Stock</a></nav></aside>
<div class="container"><div class="topbar"><div class="topbar-inner">
<nav class="breadcrumb" aria-label="Fil d’Ariane" data-i18n="dash.breadcrumb">
  <span class="breadcrumb-home">Accueil</span>
  <span class="sep" aria-hidden="true">/</span>
  <b>Tableau de bord</b>
</nav></div></div></div>
<script src="/assets/i18n.js"></script><script src="/assets/interactive.js"></script></body></html>`;
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.json': 'application/json', '.png': 'image/png', '.webp': 'image/webp' };
const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://local');
  if (u.pathname === '/harness') { res.writeHead(200, { 'Content-Type': 'text/html' }); res.end(harness); return; }
  const p = path.resolve(root, '.' + decodeURIComponent(u.pathname));
  if (!p.startsWith(root + path.sep)) { res.writeHead(403); res.end(); return; }
  fs.readFile(p, (err, data) => { res.writeHead(err ? 404 : 200, { 'Content-Type': mime[path.extname(p)] || 'application/octet-stream' }); res.end(err ? '' : data); });
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await puppeteer.launch({ executablePath: bin, headless: true, args: ['--no-sandbox'] });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let checks = 0;
const check = (yes, msg) => { assert.ok(yes, msg); checks++; console.log('  ✓ ' + msg); };

const HOME = { fr: 'Accueil', en: 'Home', ar: 'الرئيسية' };
const DASH = { fr: 'Tableau de bord', en: 'Dashboard', ar: 'لوحة التحكم' };
const crumb = (p) => p.evaluate(() => {
  const bc = document.querySelector('.breadcrumb');
  return {
    home: bc.querySelector('.breadcrumb-home')?.textContent.trim() ?? null,
    homes: bc.querySelectorAll('.breadcrumb-home').length,
    title: bc.querySelector('b')?.textContent.trim() ?? null,
    page: [...document.body.classList].filter((c) => c.indexOf('page-') === 0).join(' '),
  };
});
const setLang = async (p, l) => { await p.evaluate((x) => KiwiI18n.setLang(x), l); await sleep(250); };
const reads = (c, lang, title) => c.home === HOME[lang] && c.title === title && c.homes === 1;

try {
  /* ── 1 · Le peintre ─────────────────────────────────────────────────── */
  {
    const p = await browser.newPage();
    const errors = [];
    p.on('pageerror', (e) => errors.push(String(e)));
    await p.evaluateOnNewDocument(() => { try { localStorage.clear(); localStorage.setItem('kiwiLang', 'fr'); } catch (_) {} });
    await p.goto(base + '/harness');
    await p.waitForFunction(() => window.Kiwi && typeof Kiwi.breadcrumb === 'function' && window.KiwiI18n);
    check(await p.evaluate(() => typeof KiwiI18n.apply === 'function'), 'i18n.js exposes KiwiI18n.apply(el), to hand a [data-i18n] node back to its own key');

    await p.evaluate(() => { Kiwi.pageShell('stock'); Kiwi.breadcrumb({ fr: 'Stock', en: 'Stock & procurement', ar: 'المخزون' }); });
    let c = await crumb(p);
    check(reads(c, 'fr', 'Stock'), 'a {fr, en, ar} title paints « Accueil / Stock » in the .breadcrumb-home span');
    await setLang(p, 'en');
    c = await crumb(p);
    check(reads(c, 'en', 'Stock & procurement'), 'switched to EN with the page open: « Home / Stock & procurement », not « Home / Dashboard »');
    await setLang(p, 'ar');
    c = await crumb(p);
    check(reads(c, 'ar', 'المخزون'), 'and to AR: « الرئيسية / المخزون »');

    await p.evaluate(() => { const T = { fr: 'Équipe', en: 'Team', ar: 'الفريق' }; Kiwi.pageShell('equipe'); Kiwi.breadcrumb(() => T[KiwiI18n.getLang()]); });
    await setLang(p, 'en');
    c = await crumb(p);
    check(reads(c, 'en', 'Team'), 'a function title is read again on a switch (« Home / Team »)');

    await p.evaluate(() => { Kiwi.pageShell('genpage'); Kiwi.breadcrumb('Rooms 104'); });
    await setLang(p, 'fr');
    c = await crumb(p);
    check(reads(c, 'fr', 'Rooms 104'), 'a plain string is kept as written, only the home word follows');

    await p.evaluate(() => { Kiwi.pageShell(); Kiwi.breadcrumb(); });
    c = await crumb(p);
    const orig = await p.evaluate(() => document.querySelector('.breadcrumb').innerHTML);
    check(reads(c, 'fr', DASH.fr) && /aria-hidden="true"/.test(orig), 'Kiwi.breadcrumb() gives the node back to dash.breadcrumb, the captured French markup included');
    await setLang(p, 'ar');
    await p.evaluate(() => { Kiwi.pageShell('stock'); Kiwi.breadcrumb('Stock'); Kiwi.pageShell(); Kiwi.breadcrumb(); });
    c = await crumb(p);
    check(reads(c, 'ar', DASH.ar), 'back to the dashboard under Arabic it reads « الرئيسية / لوحة التحكم », not French');

    await p.evaluate(() => { Kiwi.pageShell('genpage'); Kiwi.breadcrumb('Réservations'); document.body.classList.remove('page-genpage'); });
    await setLang(p, 'en');
    c = await crumb(p);
    check(reads(c, 'en', DASH.en) && c.page === '', 'a page closed without a reset does not come back over the dashboard on a switch');

    await p.evaluate(() => { Kiwi.pageShell('genpage'); Kiwi.breadcrumb('Bookings'); document.body.classList.remove('page-genpage'); Kiwi.setActivePage('accueil'); });
    c = await crumb(p);
    check(reads(c, 'en', DASH.en), 'setActivePage(« accueil ») after an appPage() page hands the crumb back (it has no showDashboard() of its own)');

    await p.evaluate(() => { Kiwi.pageShell('stock'); Kiwi.breadcrumb('Stock'); Kiwi.setActivePage('accueil'); });
    c = await crumb(p);
    check(reads(c, 'en', 'Stock'), 'while the page still owns <body>, setActivePage(« accueil ») leaves its crumb alone');
    check(errors.length === 0, 'no page error in the painter: ' + errors.join(' | '));
    await p.close();
  }

  /* ── 2 · Le vrai tableau de bord ────────────────────────────────────── */
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  await page.setViewport({ width: 1366, height: 900 });
  await page.setRequestInterception(true);
  page.on('request', (r) => (r.url().startsWith(base) || r.url().startsWith('data:') ? r.continue() : r.abort()));
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e).slice(0, 240)));
  await page.evaluateOnNewDocument(() => { try { localStorage.setItem('kiwiLang', 'fr'); } catch (_) {} });
  await page.goto(base + '/dashboard.html', { waitUntil: 'load' });
  const explore = await page.waitForSelector('.kob-root [data-explore]', { visible: true, timeout: 15000 }).catch(() => null);
  if (explore) { await explore.click(); await sleep(900); }
  await page.waitForSelector('[data-kiwi-skip]', { visible: true, timeout: 15000 });
  await page.click('[data-kiwi-skip]');
  await page.waitForFunction(() => window.Kiwi && typeof Kiwi.breadcrumb === 'function', { timeout: 15000 });
  await sleep(1200);
  const go = async (nav) => { await page.click(`.sidebar nav a[data-nav="${nav}"]`); await sleep(600); };

  let c = await crumb(page);
  check(reads(c, 'fr', DASH.fr) && c.page === '', 'the demo opens on « Accueil / Tableau de bord »');

  const PAGES = [
    ['stock', { fr: 'Stock & approvisionnement', en: 'Stock & procurement', ar: 'المخزون والتموين' }],
    ['equipe', { fr: 'Équipe', en: 'Team', ar: 'الفريق' }],
    ['payroll', { fr: 'Planning', en: 'Planning', ar: 'التخطيط' }],
    ['conformite', { fr: 'Conformité & registres', en: 'Compliance & records', ar: 'الامتثال والسجلات' }],
    ['finance', { fr: 'Analyse du menu', en: 'Menu analysis', ar: 'تحليل القائمة' }],
    ['menu', { fr: 'Menu & modificateurs', en: 'Menu & modifiers', ar: 'القائمة والإضافات' }],
    ['reservations', { fr: 'Réservations', en: 'Bookings', ar: 'الحجوزات' }],
  ];
  for (const [nav, T] of PAGES) {
    await go(nav);
    const fr = await crumb(page);
    await setLang(page, 'en');
    const en = await crumb(page);
    await setLang(page, 'ar');
    const ar = await crumb(page);
    check(reads(fr, 'fr', T.fr) && reads(en, 'en', T.en) && reads(ar, 'ar', T.ar) && en.page === fr.page && ar.page === fr.page,
      `${nav}: « Accueil / ${T.fr} » → « Home / ${T.en} » → « الرئيسية / ${T.ar} », the page still open`);
    await go('accueil');
    const home = await crumb(page);
    await setLang(page, 'fr');
    const back = await crumb(page);
    check(reads(home, 'ar', DASH.ar) && reads(back, 'fr', DASH.fr) && back.page === '',
      `${nav} → Accueil: « الرئيسية / لوحة التحكم », then « Accueil / Tableau de bord », nothing reopened on the switch`);
  }

  /* L'équipe se relit elle-même : la page n'écoutait pas le changement de langue. */
  await go('equipe');
  const teamFr = await page.evaluate(() => document.querySelector('[data-equipe-root]')?.innerText || '');
  await setLang(page, 'ar');
  const teamAr = await page.evaluate(() => document.querySelector('[data-equipe-root]')?.innerText || '');
  check(teamFr.length > 40 && teamAr !== teamFr && /[؀-ۿ]/.test(teamAr), 'the Équipe page itself re-renders in Arabic when the language changes');
  await setLang(page, 'fr');

  /* De Paie à Stock, puis une langue : Paie ne se rouvre pas par-dessus Stock. */
  await go('payroll');
  await go('stock');
  await setLang(page, 'en');
  c = await crumb(page);
  check(c.page === 'page-stock' && reads(c, 'en', 'Stock & procurement'), 'Planning → Stock → EN stays on « Home / Stock & procurement » (Planning does not reopen over it)');

  /* Changer d'établissement ramène au tableau de bord, dans la langue de l'écran. */
  await page.evaluate(() => KiwiVenue.setVenue('maisonMansour'));
  await sleep(600);
  c = await crumb(page);
  check(reads(c, 'en', DASH.en) && c.page === '', 'a venue switch from an open page lands on « Home / Dashboard », not the French reset');
  await page.evaluate(() => KiwiVenue.setVenue('cafeAtlas'));
  await sleep(400);
  await setLang(page, 'fr');
  check(errors.length === 0, 'no page error across the dashboard: ' + errors.join(' | '));
  await ctx.close();

  /* ── 3 · Plus aucun « Accueil » écrit en dur dans le fil ────────────── */
  const files = ['assets/team.js', 'assets/stock.js', 'assets/conformite.js', 'assets/finance.js', 'assets/venues.js',
    'assets/restaurant-menu-workspace.js', 'assets/hotel.js', 'assets/interactive.js', 'dashboard.html'];
  const offenders = files.filter((f) => {
    const src = fs.readFileSync(path.join(root, f), 'utf8');
    return /Accueil\s*<span class="sep">/.test(src) || /\.breadcrumb'\)\s*;\s*if\s*\(bc\)\s*bc\.innerHTML/.test(src) || /bc\.innerHTML\s*=/.test(src) || /\.breadcrumb b'\)/.test(src);
  });
  check(offenders.length === 0, 'no module writes the breadcrumb itself any more (no « Accueil <span class="sep"> », no bc.innerHTML): ' + offenders.join(', '));
  const dash = fs.readFileSync(path.join(root, 'dashboard.html'), 'utf8');
  const reset = dash.slice(dash.indexOf('function resetToDashboard('), dash.indexOf('function resetToDashboard(') + 900);
  check(/window\.Kiwi\?\.breadcrumb\?\.\(\)/.test(reset), 'dashboard.html resetToDashboard() hands the crumb back to dash.breadcrumb');
} finally {
  await browser.close();
  server.close();
}

console.log(`\ndashboard-breadcrumb-language: ${checks} passed, 0 failed`);
