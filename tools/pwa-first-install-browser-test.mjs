#!/usr/bin/env node
/* Premier passage · la page ne se charge qu'une fois. Conduit dans un vrai
 * Chromium avec le vrai service worker (kiwi-sw.js) et le vrai
 * assets/pwa-update.js, sur le tableau de bord, la caisse et Serveur.
 *
 * 2026-10-12. Sur un profil neuf, le worker s'installe, fait clients.claim(),
 * `controllerchange` part, et pwa-update.js prenait ça pour une mise à jour :
 * silentReload() rechargeait la page dans les 45 s alors que rien n'avait
 * changé (il n'y avait pas d'ancien worker, le shell est déjà le plus récent).
 * Chaque nouveau commerçant payait un second chargement complet, à un moment
 * aléatoire. Tracé par l'initiateur de la navigation :
 * go@pwa-update.js < refresh < silentReload < show.
 *
 * Ce que la suite tient :
 *   · profil neuf, vrai worker : un seul chargement de la page principale,
 *     le worker contrôle bien la page à la fin, aucune pastille ;
 *   · vraie mise à jour (nouvelle génération du worker, page déjà
 *     contrôlée), page jeune et jamais touchée : rechargement silencieux,
 *     une fois, par pwa-update.js, et la nouvelle génération est en place ;
 *   · vraie mise à jour après un geste : la pastille « Nouvelle version
 *     prête » apparaît, aucun rechargement tout seul, et un vrai clic dessus
 *     recharge une fois.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { suite, expectScreenshot } from './browser-trace.mjs';

const root = process.env.KIWI_ROOT || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let puppeteer;
try { puppeteer = createRequire(path.join(root, 'app/package.json'))('puppeteer-core'); }
catch { console.log('○ skip: puppeteer-core unavailable — browser assertions not executed'); process.exit(process.env.CI ? 1 : 0); }
const bin = process.env.KIWI_CHROMIUM_BIN || ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/chromium', '/usr/bin/google-chrome'].find(fs.existsSync);
if (!bin) { console.log('○ skip: Chromium unavailable — browser assertions not executed'); process.exit(process.env.CI ? 1 : 0); }

/* The worker is served as shipped, except that a test can move it to a new
 * generation: same URL, different bytes, different CACHE name. That is
 * exactly what a deploy does to a returning browser. */
let gen = 0;
const swSource = fs.readFileSync(path.join(root, 'kiwi-sw.js'), 'utf8');
const CACHE = (swSource.match(/var CACHE = '([^']+)'/) || [])[1];
assert.ok(CACHE, 'kiwi-sw.js declares its CACHE generation');
const cacheFor = (g) => (g ? `${CACHE}-test${g}` : CACHE);

const mime = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.webp': 'image/webp' };
const server = http.createServer((req, res) => {
  const pathname = decodeURIComponent(new URL(req.url, 'http://local').pathname);
  if (pathname === '/kiwi-sw.js') {
    res.writeHead(200, { 'Content-Type': 'text/javascript', 'Cache-Control': 'no-cache' });
    res.end(swSource.replace(`var CACHE = '${CACHE}'`, `var CACHE = '${cacheFor(gen)}'`));
    return;
  }
  const p = path.resolve(root, '.' + pathname);
  if (!p.startsWith(root + path.sep)) { res.writeHead(403); res.end(); return; }
  fs.readFile(p, (err, data) => {
    res.writeHead(err ? 404 : 200, { 'Content-Type': mime[path.extname(p)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(err ? '' : data);
  });
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;
/* Fonts and any other outside host fail fast instead of hanging the load. */
const browser = await puppeteer.launch({ executablePath: bin, headless: true, args: ['--no-sandbox', '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1'] });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
/* Traces on failure, exit 3 when the machine is the problem, and the pill's
 * screenshot baseline: tools/browser-trace.mjs. */
const S = suite('pwa-first-install', { browser });
const check = (yes, msg) => { assert.ok(yes, msg); console.log('  ✓ ' + msg); };

/* One tab, with every main-frame load counted and the script that asked for
 * it remembered (the trace recorder does both). No request interception: the
 * worker must see the real requests. */
async function tab(tr, ctx, url) {
  const page = tr.watch(await ctx.newPage());
  await page.setViewport({ width: 1366, height: 900 });
  page.on('dialog', async (d) => { await d.dismiss(); });
  page.setDefaultNavigationTimeout(90000);
  tr.step(`open ${url.replace(base, '')}`);
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  return { page, get loads() { return tr.loads(page).map((l) => l.by); } };
}

const controlled = (page) => page.evaluate(() => !!(navigator.serviceWorker && navigator.serviceWorker.controller)).catch(() => false);

/* Wait until the page in front is controlled, then until no main-frame load
 * has started for `quiet` ms. A reload in flight makes evaluate throw; that
 * just means « not settled yet ». */
async function settle(t, { quiet = 4000, timeout = 60000 } = {}) {
  const until = Date.now() + timeout;
  while (Date.now() < until && !(await controlled(t.page))) await sleep(250);
  let seen = -1;
  while (Date.now() < until && seen !== t.loads.length) { seen = t.loads.length; await sleep(quiet); }
  await t.page.waitForFunction(() => document.readyState !== 'loading', { timeout: 15000 }).catch(() => {});
}

const pill = (page) => page.evaluate(() => !!document.getElementById('kiwi-update-ready')).catch(() => false);
const cacheNames = (page) => page.evaluate(() => caches.keys()).catch(() => []);

try {
  /* 1 · First visit, fresh profile, on each surface that loads pwa-update.js.
   *     One at a time: three cold installs side by side starve the server. */
  for (const surface of ['dashboard.html', 'kiwi-caisse.html', 'kiwi-serveur.html']) {
    await S.run(`first visit · ${surface}`, async (tr) => {
      gen = 0;
      const ctx = await browser.createBrowserContext();
      tr.defer(() => ctx.close());
      {
        const t = await tab(tr, ctx, `${base}/${surface}`);
        tr.step('wait for the worker to control the page, then for quiet');
        await settle(t);
        check(await controlled(t.page), `${surface}: the service worker installed and controls the page on the first visit`);
        check(t.loads.length === 1, `${surface}: one main-frame load on a first visit (${t.loads.join(' then ')})`);
        check(!(await pill(t.page)), `${surface}: no « Nouvelle version prête » after a first install`);
      }
    });
  }

  /* 2 · A real update on a young, untouched page applies itself silently. */
  await S.run('new generation · untouched page reloads itself once', async (tr) => {
    gen = 0;
    const ctx = await browser.createBrowserContext();
    tr.defer(() => ctx.close());
    {
      const t = await tab(tr, ctx, `${base}/dashboard.html`);
      await settle(t);
      check(t.loads.length === 1 && await controlled(t.page), 'dashboard: installed and controlled, one load');
      tr.step('deploy generation 1, reload');
      gen = 1;
      await t.page.reload({ waitUntil: 'domcontentloaded' });
      tr.step('wait for the silent reload');
      const until = Date.now() + 60000;
      while (Date.now() < until && t.loads.length < 3) await sleep(250);
      await settle(t);
      check(t.loads.length === 3, `a new worker generation on a controlled, untouched page reloads it once (${t.loads.join(' then ')})`);
      check(/@pwa-update\.js/.test(t.loads[2] || ''), `that reload comes from pwa-update.js (${t.loads[2]})`);
      const names = await cacheNames(t.page);
      check(names.includes(cacheFor(1)) && !names.includes(cacheFor(0)), `the new generation is in place (${names.join(', ')})`);
      check(!(await pill(t.page)), 'after the silent reload no pill is left on screen');
    }
  });

  /* 3 · A real update after the operator touched the page: the pill, never a
   *     reload on its own, and one reload on a real click. */
  await S.run('new generation · after a gesture the pill, then one reload on click', async (tr) => {
    gen = 0;
    const ctx = await browser.createBrowserContext();
    tr.defer(() => ctx.close());
    {
      const t = await tab(tr, ctx, `${base}/kiwi-caisse.html`);
      await settle(t);
      check(t.loads.length === 1 && await controlled(t.page), 'caisse: installed and controlled, one load');
      tr.step('a key press, then deploy generation 2');
      await t.page.keyboard.press('Shift');
      gen = 2;
      await t.page.evaluate(() => navigator.serviceWorker.getRegistration().then((r) => r && r.update()));
      tr.step('wait for the pill');
      await t.page.waitForSelector('#kiwi-update-ready', { timeout: 30000 });
      await sleep(3000);
      check(t.loads.length === 1, `a new generation after a gesture never reloads the page by itself (${t.loads.join(' then ')})`);
      const names = await cacheNames(t.page);
      check(names.includes(cacheFor(2)), `the new generation installed behind the page (${names.join(', ')})`);
      const visible = await t.page.$eval('#kiwi-update-ready', (b) => getComputedStyle(b).visibility === 'visible' && getComputedStyle(b).pointerEvents !== 'none');
      check(visible, 'the « Nouvelle version prête » pill is shown and clickable');
      /* The pill as it is drawn, against tools/__screenshots__/. Fonts come
       * from the machine here (Google Fonts are blocked), hence one baseline
       * per platform. */
      await t.page.$eval('#kiwi-update-ready', (b) => { b.style.transition = 'none'; });
      await expectScreenshot(tr, await t.page.$('#kiwi-update-ready'), 'update pill fr');
      check(true, 'the pill matches its screenshot baseline');
      tr.step('click the pill');
      await t.page.click('#kiwi-update-ready');
      const until = Date.now() + 15000;
      while (Date.now() < until && t.loads.length < 2) await sleep(250);
      await settle(t, { quiet: 3000 });
      check(t.loads.length === 2 && /@pwa-update\.js/.test(t.loads[1] || ''), `a real click on the pill reloads once (${t.loads.join(' then ')})`);
      check(!(await pill(t.page)), 'the reloaded page does not show the pill again');
    }
  });
} finally {
  server.close();
  await S.finish();
}
