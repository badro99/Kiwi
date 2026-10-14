#!/usr/bin/env node
/* Santé Kiwi · la tuile de la rangée « Pour vous », dans le vrai dashboard.html.
 *
 * La route est prouvée sur une vraie base par merchant-health-test.mjs ; ici
 * on prouve ce que le commerçant voit. /api/merchant-health est servi par le
 * vrai calcul (functions/api/_merchant-health.js) sur des faits de banc, et le
 * reste de la page est le tableau de bord tel qu'il est livré. Ce que la suite
 * tient :
 *   · la tuile prend la première place de la rangée « Pour vous », à côté de
 *     deux offres (une de moins), à leur hauteur exacte ;
 *   · elle dit le score, la phrase et la prochaine étape, en FR, EN et AR,
 *     en clair et en sombre, et l'arabe se lit de droite à gauche ;
 *   · « Tout voir » ouvre le tiroir, groupé par domaine, avec « non mesuré »
 *     dit comme tel ;
 *   · chaque « Ouvrir » affiché mène quelque part (vrai clic, pas d'événement
 *     synthétique) ;
 *   · route injoignable : la démo rend la place à une offre, aucun chiffre ;
 *   · la réponse d'un autre établissement n'est jamais affichée, et ne laisse
 *     pas la tuile en « chargement » pour toujours.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = process.env.KIWI_ROOT || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(path.join(root, 'app/package.json'));
const puppeteer = require('puppeteer-core');
const { computeHealth } = await import(pathToFileURL(path.join(root, 'functions/api/_merchant-health.js')).href);
const bin = process.env.KIWI_CHROMIUM_BIN || ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/chromium', '/usr/bin/google-chrome'].find(fs.existsSync);
assert.ok(bin, 'Chromium required');
const shots = process.env.KIWI_SHOTS || '';

const FACTS = {
  type: 'restaurant', features: {},
  saleCount: 120, saleDays: 22, openDays: 26, closedDays: 9,
  codeHolders: 3, teamSize: 5, clockedStaff: 2, shiftsPlanned: 4,
  linkedSales: 6, loyaltySet: true, rewardsGiven: 0,
  identity: { name: true, logo: false, legal: true }, hoursSet: true, printerSeen: false,
  accountantSet: false, iqUsed: true, chargesSet: false,
  menuItems: 40, menuWithPhoto: 12, menuWithRecipe: 9, floorTables: 14, tableSessions: 80,
  kitchenSent: 0, stockItems: 25, stockMoves: 30, stockCounts: 0, waiterOrders: 0,
  invoices: 2, promotions: 0, employeeDevices: 0, reservations: 0, kdsStations: 0, purchaseOrders: 0,
};
const BODY = computeHealth(FACTS);

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

async function open({ api = 'ok', lang = 'fr', theme = 'light', width = 1366, store = '' } = {}) {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  const problems = [];
  page.on('pageerror', (e) => problems.push(e.message));
  page.on('dialog', async (d) => { problems.push('dialog: ' + d.message()); await d.dismiss(); });
  await page.setViewport({ width, height: 900 });
  /* On a first visit the service worker claims the page, `controllerchange`
   * fires, and pwa-update.js reloads it once (silentReload). Traced with the
   * navigation's script initiator on 2026-10-12: that reload, not the language,
   * is the second load, and under load it landed mid-scenario. The worker is
   * pwa-shell-test's subject, not this suite's: it never registers here (its
   * script is fetched by the worker, out of reach of request interception, so
   * `register` itself is held). */
  await page.setBypassServiceWorker(true);
  await page.setRequestInterception(true);
  const asked = [];
  const loads = [];
  page.on('request', (r) => {
    const u = r.url();
    if (u.startsWith(base + '/api/merchant-health')) {
      const m = new URL(u).searchParams.get('merchant');
      asked.push(m);
      if (api === 'down') return r.respond({ status: 503, contentType: 'application/json', body: '{"error":"no-db"}' });
      const merchant = api === 'other' ? 'un-autre-commerce' : m;
      return r.respond({ status: 200, contentType: 'application/json', body: JSON.stringify({ merchant, at: Date.now(), ...BODY }) });
    }
    if (r.isNavigationRequest() && r.frame() === page.mainFrame()) {
      const st = ((r.initiator() || {}).stack || {}).callFrames || [];
      loads.push(st.slice(0, 4).map((c) => `${c.functionName || '?'}@${c.url.split('/').pop()}:${c.lineNumber}`).join(' < ') || 'goto');
    }
    if (u.startsWith(base) || u.startsWith('data:')) return r.continue();
    return r.abort();
  });
  await page.evaluateOnNewDocument(() => {
    try { if (navigator.serviceWorker) Object.defineProperty(navigator.serviceWorker, 'register', { value: () => new Promise(() => {}), configurable: true }); } catch (_) {}
  });
  await page.evaluateOnNewDocument((lang, theme, store) => {
    try {
      localStorage.setItem('kiwiLang', lang); localStorage.setItem('kiwiTheme', theme); localStorage.setItem('kiwiDashTheme', theme);
      /* once only: a reload must not undo what the scenario changes later */
      if (store && !sessionStorage.getItem('mhcStoreSet')) { sessionStorage.setItem('mhcStoreSet', '1'); localStorage.setItem('kiwiLiveMerchant', store); }
    } catch (_) {}
  }, lang, theme, store);
  let navs = 0;
  page.on('framenavigated', (f) => { if (f === page.mainFrame()) navs++; });
  await page.goto(base + '/dashboard.html', { waitUntil: 'load' });
  await page.bringToFront();
  /* Belt and braces: interact only once no navigation has happened for a
   * full second. */
  for (let seen = -1, i = 0; seen !== navs && i < 20; i++) { seen = navs; await sleep(1000); }
  if (navs !== 1) problems.push(`the dashboard loaded ${navs} times: ${loads.join(' then ')}`);
  await page.waitForFunction(() => document.readyState === 'complete', { timeout: 15000 });
  const explore = await page.waitForSelector('.kob-root [data-explore]', { visible: true, timeout: 15000 }).catch(() => null);
  if (explore) { await explore.click(); await sleep(900); }
  const skip = await page.waitForSelector('[data-kiwi-skip]', { visible: true, timeout: 15000 }).catch(() => null);
  if (skip) await skip.click();
  await sleep(1500);
  return { ctx, page, problems, asked };
}
const cardText = (page) => page.$eval('[data-merchant-health]', (e) => ({ hidden: e.hidden, text: e.innerText.replace(/\s+/g, ' ').trim(), dir: e.getAttribute('dir'), html: e.innerHTML }));
/* the « Pour vous » row: what sits in it, where, how tall */
const row = (page) => page.$$eval('[data-oppo-band] .oppo-grid > *', (els) => els.map((e) => {
  const r = e.getBoundingClientRect();
  return { health: e.hasAttribute('data-merchant-health'), id: e.getAttribute('data-oppo-id'), top: Math.round(r.top), h: Math.round(r.height), text: e.innerText.replace(/\s+/g, ' ') };
}));

try {
  /* 1 · French, light */
  {
    const { ctx, page, problems, asked } = await open();
    await page.waitForSelector('[data-merchant-health] .mhc-score[data-ready]', { visible: true, timeout: 15000 });
    const c = await cardText(page);
    check(asked.length >= 1 && asked.every((m) => m && /^[a-z0-9-]+$/.test(m)), `the card asks /api/merchant-health once per load for the current store (${asked[0]})`);
    const score = await page.$eval('[data-merchant-health] .mhc-score', (e) => ({ label: e.getAttribute('aria-label'), shown: (e.querySelector('svg text') || {}).textContent }));
    check(!c.hidden && score.shown === String(BODY.score) && score.label === `Santé Kiwi · ${BODY.score} sur 100`, `the score ${BODY.score} is drawn in the illustration and said out of 100 (${score.label})`);
    const artBox = await page.evaluate(() => {
      const box = (e) => { const r = e.getBoundingClientRect(), c = e.closest('.oppo-card').getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height), Math.round(c.right - r.right), Math.round(c.bottom - r.bottom)].join(','); };
      const mine = document.querySelector('[data-merchant-health] .oppo-art');
      const theirs = document.querySelector('[data-oppo-band] .oppo-card[data-oppo-id] .oppo-art');
      return { mine: mine && box(mine), theirs: theirs && box(theirs), paths: mine ? mine.querySelectorAll('path').length : -1 };
    });
    check(artBox.mine && artBox.mine === artBox.theirs && artBox.paths === 0, `the illustration sits where the neighbours keep theirs, at their size (${artBox.mine} vs ${artBox.theirs}), built from rects and circles`);
    check(c.text.includes(`${BODY.used} outils sur ${BODY.measured} pleinement utilisés`), 'the sentence counts the tools fully in use, from the server');
    const tiles = await row(page);
    check(tiles[0] && tiles[0].health, 'Santé Kiwi is the first tile of the « Pour vous » row');
    check(tiles.length === 3 && tiles.slice(1).every((t) => t.id), `two offers beside it, one fewer dealt (${tiles.slice(1).map((t) => t.id).join(', ')})`);
    check(tiles.every((t) => t.top === tiles[0].top && t.h === tiles[0].h), `one row, one height (${tiles.map((t) => t.h + ' px').join(', ')})`);
    const nextGo = await page.$$eval('[data-merchant-health] [data-mhc-go]', (b) => b.map((x) => x.getAttribute('data-mhc-go')));
    check(nextGo.join(',') === BODY.next[0] && /ensuite/i.test(c.text) && c.text.includes('9 plats sur 40 ont une recette'), `« Ensuite » is the server's first next step, with its fact (${nextGo.join(', ')})`);
    check(!/[—]/.test(c.text) && !/NaN|undefined|null/.test(c.text), 'no em dash, no NaN, no undefined in the card');
    const style = await page.$eval('[data-merchant-health]', (e) => {
      const cs = getComputedStyle(e); const t = e.querySelector('.oppo-t');
      const n = document.querySelector('[data-oppo-band] .oppo-card[data-oppo-id]');
      const ns = n && getComputedStyle(n), paint = (x) => [x.backgroundColor, x.backgroundImage, x.borderTopColor, x.borderRadius].join(' | ');
      return { mine: paint(cs), theirs: ns ? paint(ns) : '', italic: [...e.querySelectorAll('*')].some((x) => getComputedStyle(x).fontStyle === 'italic'), titleWeight: getComputedStyle(t).fontWeight };
    });
    check(!style.italic, 'nothing in the card is italic');
    check(style.theirs && style.mine === style.theirs, 'the tile wears exactly its neighbours\' skin (background, border, radius)');
    if (shots) await (await page.$('[data-merchant-health]')).screenshot({ path: path.join(shots, 'mhc-fr-light.png') });

    /* Tout voir → the drawer */
    await page.click('[data-merchant-health] [data-action="merchant-health-open"]');
    await page.waitForSelector('.kiwi-drawer .mhc-drawer', { visible: true, timeout: 5000 });
    /* the drawer slides in: measure and click it once it has settled */
    await page.waitForFunction(() => { const d = document.querySelector('.kiwi-drawer'); if (!d) return false; const r = d.getBoundingClientRect(); const ok = r.right <= innerWidth + 1 && r.left >= -1 && window.__mhcLast === r.left; window.__mhcLast = r.left; return ok; }, { polling: 150, timeout: 5000 });
    const drawer = await page.$eval('.kiwi-drawer', (d) => ({ title: d.querySelector('h3').textContent, text: d.innerText.replace(/\s+/g, ' '), groups: [...d.querySelectorAll('.mhc-group h4')].map((h) => h.textContent.trim()), states: [...d.querySelectorAll('.mhc-row')].map((r) => r.getAttribute('data-mhc-state')) }));
    check(drawer.title === 'Santé Kiwi' && drawer.groups.includes('Caisse') && drawer.groups.includes('Carte et catalogue'), `« Tout voir » opens the drawer, grouped by area (${drawer.groups.join(' · ')})`);
    /* measured from the last row of one group to the heading of the next, so a
     * stray padding inside a group counts as a hole too */
    const gaps = await page.$$eval('.kiwi-drawer .mhc-group', (g) => g.slice(1).map((x, i) => { const rows = g[i].querySelectorAll('li'); const last = rows[rows.length - 1] || g[i].querySelector('h4'); return Math.round(x.querySelector('h4').getBoundingClientRect().top - last.getBoundingClientRect().bottom); }));
    check(gaps.every((v) => v >= 0 && v <= 40), `the drawer's groups follow each other without holes (${gaps.join(', ')} px)`);
    check(/22 jours sur 26 jours d’ouverture/.test(drawer.text) && /9 plats sur 40 ont une recette/.test(drawer.text), 'the drawer says the facts: 22 of 26 open days, 9 of 40 dishes with a recipe');
    check(drawer.states.includes('unmeasured') && /Non mesuré/.test(drawer.text) && /sort du score/.test(drawer.text), 'the printer and kitchen lines say « Non mesuré » and that they leave the score');
    /* every destination the engine names is a real sidebar link or handler */
    const wanted = BODY.checks.filter((c) => c.nav && c.state !== 'done').map((c) => c.id);
    const offered = await page.$$eval('.kiwi-drawer .mhc-row [data-mhc-go]', (b) => b.map((x) => x.getAttribute('data-mhc-go')));
    const missing = wanted.filter((id) => !offered.includes(id));
    check(!missing.length, `every line not done offers its real destination (${wanted.length} of ${wanted.length}${missing.length ? ', missing: ' + missing.join(', ') : ''})`);
    check(/En option, si cela vous sert/.test(drawer.text) && /Hors score/.test(drawer.text), 'optional tools are listed apart and said to be out of the score');
    if (shots) await page.screenshot({ path: path.join(shots, 'mhc-drawer-fr.png') });
    /* a real click on a row's « Ouvrir » closes the drawer and navigates */
    const rowGo = await page.$('.kiwi-drawer .mhc-row [data-mhc-go="menu"]') || await page.$('.kiwi-drawer .mhc-row [data-mhc-go]');
    check(!!rowGo, 'a row that is not done carries a way to fix it');
    const goId = await rowGo.evaluate((b) => b.getAttribute('data-mhc-go'));
    const before = await page.evaluate(() => location.hash + '|' + (document.querySelector('.sidebar a.active, .sidebar a[aria-current="page"]')?.getAttribute('data-feature') || ''));
    await rowGo.evaluate((b) => b.scrollIntoView({ block: 'center' }));
    await sleep(200);
    await rowGo.click();
    await sleep(1200);
    const after = await page.evaluate(() => ({ drawer: !!document.querySelector('.kiwi-drawer-backdrop'), state: location.hash + '|' + (document.querySelector('.sidebar a.active, .sidebar a[aria-current="page"]')?.getAttribute('data-feature') || ''), page: document.querySelector('.kiwi-page, .genpage, [data-page-open], .pp-page')?.className || '' }));
    check(!after.drawer && (after.state !== before || after.page), `« Ouvrir » on « ${goId} » closes the drawer and opens its page (${before} → ${after.state} ${after.page.slice(0, 40)})`);
    check(!problems.length, 'no page error and no native dialog: ' + problems.join(' | '));
    await ctx.close();
  }

  /* 2 · English and Arabic, dark */
  for (const [lang, theme, needle] of [['en', 'dark', `${BODY.used} of ${BODY.measured} tools fully in use`], ['ar', 'dark', `${BODY.used} من أصل ${BODY.measured} أدوات مستعملة بالكامل`]]) {
    const { ctx, page, problems } = await open({ lang, theme });
    await page.waitForSelector('[data-merchant-health] .mhc-score[data-ready]', { visible: true, timeout: 15000 });
    const c = await cardText(page);
    check(c.text.includes(needle), `${lang} · the sentence reads in ${lang === 'ar' ? 'Arabic' : 'English'}`);
    check(c.dir === (lang === 'ar' ? 'rtl' : 'ltr'), `${lang} · the card runs ${c.dir}`);
    const flip = await page.$eval('[data-merchant-health] .mhc-tile-next svg', (svg) => getComputedStyle(svg).transform);
    check(lang === 'ar' ? /^matrix\(-1,/.test(flip) : !/^matrix\(-1,/.test(flip), `${lang} · the « Next » chevron points the reading way (${flip})`);
    const tiles = await row(page);
    check(tiles[0] && tiles[0].health && tiles.every((t) => t.top === tiles[0].top && t.h === tiles[0].h), `${lang} · the tile leads the row, at its neighbours' height`);
    check(!/[A-Za-zÀ-ÿ]{4,}/.test(c.text.replace(/Kiwi IQ|Kiwi|MAD/g, '')) || lang !== 'ar', `${lang} · no French or English words left in the Arabic card`);
    check(!/sur 100|jours d’ouverture/.test(c.text) || lang === 'fr', `${lang} · no French left in the card`);
    const lum = await page.$eval('[data-merchant-health]', (e) => {
      const rgb = (s) => (s.match(/\d+(\.\d+)?/g) || []).slice(0, 3).map(Number);
      let el = e, bg = 'rgba(0, 0, 0, 0)';
      while (el && /rgba\(0, 0, 0, 0\)|transparent/.test(getComputedStyle(el).backgroundColor)) el = el.parentElement;
      bg = el ? getComputedStyle(el).backgroundColor : 'rgb(0,0,0)';
      const [r, g, b] = rgb(bg); const fg = rgb(getComputedStyle(e.querySelector('.oppo-t')).color);
      const L = ([r, g, b]) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
      const a = L([r, g, b]), t = L(fg); return { dark: a < 0.2, bg, contrast: (Math.max(a, t) + 0.05) / (Math.min(a, t) + 0.05) };
    });
    check(lum.dark, `${lang} · the dashboard really paints dark behind the card (${lum.bg})`);
    check(lum.contrast >= 4.5, `${lang} · dark: the title reads against what is painted behind it (contrast ${lum.contrast.toFixed(1)}, ${lum.bg})`);
    if (shots) await (await page.$('[data-merchant-health]')).screenshot({ path: path.join(shots, `mhc-${lang}-${theme}.png`) });
    check(!problems.length, `${lang} · no page error`);
    await ctx.close();
  }

  /* 3 · down: one quiet retry, then the demo gives the slot back to an offer */
  {
    const { ctx, page, asked } = await open({ api: 'down' });
    await sleep(4000);
    const tiles = await row(page);
    check(asked.length === 2, `a failed request is retried once, quietly, before anything is said (${asked.length} requests)`);
    check(!tiles.some((t) => t.health) && tiles.length === 3 && tiles.every((t) => t.id), `route down on the demo: no tile, three offers fill the row (${tiles.map((t) => t.id).join(', ')})`);
    await ctx.close();
  }
  /* 3b · the store is not known yet when the script runs (a real session
   * learns its slug a moment later): wait for it, never call that unreachable */
  {
    const { ctx, page, asked } = await open({ store: 'pas-encore' });
    const before = await page.evaluate(() => ({ status: window.KiwiMerchantHealth.state.status, tile: !!document.querySelector('[data-merchant-health]') }));
    check(before.status === 'idle' && !before.tile && !asked.length, `no store yet: the tile waits, hidden, and asks nothing (${before.status})`);
    await page.evaluate(() => { localStorage.setItem('kiwiLiveMerchant', 'cafe-atlas'); });
    await page.waitForSelector('[data-merchant-health] .mhc-score[data-ready]', { visible: true, timeout: 20000 });
    check(asked.length === 1 && asked[0] === 'cafe-atlas', 'the store becomes known: the tile loads it by itself, once');
    await ctx.close();
  }
  /* 4 · another store's answer is never shown, and does not hang */
  {
    const { ctx, page, asked } = await open({ api: 'other' });
    await sleep(4000);   /* past the one quiet retry */
    const tiles = await row(page);
    check(asked.length >= 1 && !tiles.some((t) => t.health || t.text.includes(String(BODY.score) + ' ')), "an answer for another store is dropped, not shown under this one's name");
    check(!(await page.$('[data-merchant-health][aria-busy]')), 'and the tile is not left « loading » forever');
    await ctx.close();
  }
  /* 5 · phone width */
  {
    const { ctx, page } = await open({ width: 390 });
    await page.waitForSelector('[data-merchant-health] .mhc-score[data-ready]', { visible: true, timeout: 15000 });
    const fit = await page.$eval('[data-merchant-health]', (e) => {
      const r = e.getBoundingClientRect();
      const spill = [...e.querySelectorAll('*')].filter((x) => { const q = x.getBoundingClientRect(); return q.width && (q.right > r.right + 1 || q.left < r.left - 1); }).map((x) => x.className);
      return { w: r.width, left: r.left, right: r.right, vw: innerWidth, clip: getComputedStyle(e).overflowX, spill };
    });
    check(fit.left >= 0 && fit.right <= fit.vw && !fit.spill.length && fit.clip === 'hidden', `390 px: the card sits inside the screen, nothing spills out of it, the glow is clipped (${Math.round(fit.w)} px${fit.spill.length ? ' · ' + fit.spill.join(',') : ''})`);
    if (shots) await (await page.$('[data-merchant-health]')).screenshot({ path: path.join(shots, 'mhc-phone.png') });
    await ctx.close();
  }
} finally {
  await browser.close();
  server.close();
}
console.log(`\nmerchant-health-browser-test: ${checks} passed, 0 failed`);
