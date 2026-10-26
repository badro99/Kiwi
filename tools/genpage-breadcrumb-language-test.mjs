#!/usr/bin/env node
import { forLocales } from './test-locales.mjs';
import coreTestSource from './core-test-source.cjs';
/* Fil d'Ariane des pages Kiwi.appPage() · écrit dans la langue de l'écran.
 *
 * 2026-10-12. appPage() écrivait un « Accueil » en dur : toute page ouverte
 * par lui (hôtel, réservations, métiers, réglages…) lisait « Accueil / … »
 * sous l'anglais et sous l'arabe. Et un changement de langue page ouverte
 * remettait tout le fil à celui du tableau de bord (setLang réécrit
 * dash.breadcrumb) : « Home / Dashboard » au-dessus d'une page Chambres.
 * Conduit par un vrai navigateur, avec les vrais i18n.js et interactive.js.
 */
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import {createRequire} from 'node:module';

const root = process.env.KIWI_ROOT || path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const require = createRequire(path.join(root, 'app/package.json'));
const puppeteer = require('puppeteer-core');
const bin = process.env.KIWI_CHROMIUM_BIN || ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/chromium', '/usr/bin/google-chrome'].find(fs.existsSync);
assert.ok(bin, 'Chromium required for the breadcrumb language test');

/* Same topbar markup as dashboard.html, so i18n.js captures and rewrites it. */
const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body>
<div class="app"><aside class="sidebar"><nav><a data-nav="accueil">Accueil</a><a data-nav="hotel-rooms">Chambres</a></nav></aside>
<div class="container"><div class="topbar"><div class="topbar-inner">
<nav class="breadcrumb" aria-label="Fil d’Ariane" data-i18n="dash.breadcrumb"><span class="breadcrumb-home">Accueil</span> <span class="sep" aria-hidden="true">/</span> <b>Tableau de bord</b></nav>
</div></div></div></div>
<script src="/assets/i18n.js"></script><script src="/assets/interactive/helpers.js"></script><script src="/assets/interactive/handlers.js"></script><script src="/assets/interactive.js"></script></body></html>`;
const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://local');
  if (u.pathname === '/') { res.setHeader('Content-Type', 'text/html'); res.end(html); return; }
  const f = path.join(root, decodeURIComponent(u.pathname));
  if (!f.startsWith(root + path.sep) || !fs.existsSync(f)) { res.statusCode = 404; res.end(); return; }
  res.setHeader('Content-Type', f.endsWith('.js') ? 'text/javascript' : 'text/css');
  res.end(fs.readFileSync(f));
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}/`;
const browser = await puppeteer.launch({executablePath: bin, headless: true, args: ['--no-sandbox']});
let checks = 0;
const check = (yes, msg) => { assert.ok(yes, msg); checks++; console.log('  ✓ ' + msg); };

async function fresh(lang) {
  const p = await browser.newPage();
  const errors = [];
  p.on('pageerror', (e) => errors.push(String(e)));
  await p.evaluateOnNewDocument((l) => { try { localStorage.clear(); if (l) localStorage.setItem('kiwiLang', l); } catch (_) {} }, lang || '');
  await p.goto(base);
  await p.waitForFunction(() => window.Kiwi && typeof Kiwi.appPage === 'function' && window.KiwiI18n);
  return {p, errors};
}
const crumb = (p) => p.evaluate(() => {
  const bc = document.querySelector('.breadcrumb');
  return {
    home: bc.querySelector('.breadcrumb-home')?.textContent || null,
    title: bc.querySelector('b')?.textContent || null,
    text: bc.textContent.replace(/\s+/g, ' ').trim(),
  };
});
const open = (p, title) => p.evaluate((t) => { Kiwi.appPage('hotel-rooms', {title: t, body: '<p>corps</p>'}); }, title);
const setLang = (p, l) => p.evaluate((x) => KiwiI18n.setLang(x), l);

try {
  /* 1 · Ouvert dans chaque langue : le mot d'accueil est celui de la langue. */
  for (const [lang, home] of forLocales([['fr', 'Accueil'], ['en', 'Home'], ['ar', 'الرئيسية']])) {
    const {p, errors} = await fresh(lang);
    await open(p, 'Chambres');
    const c = await crumb(p);
    check(c.home === home && c.title === 'Chambres' && c.text === `${home} / Chambres`, `opened under ${lang.toUpperCase()}, a page's breadcrumb reads « ${home} / Chambres »`);
    check(errors.length === 0, `no page error under ${lang.toUpperCase()}`);
    await p.close();
  }

  /* 2 · Langue changée page ouverte : le mot d'accueil suit, le titre reste celui de la page. */
  {
    const {p, errors} = await fresh('fr');
    await open(p, 'Chambres');
    await setLang(p, 'en');
    let c = await crumb(p);
    check(c.home === 'Home' && c.title === 'Chambres', 'switched to EN with the page open: « Home / Chambres », not « Home / Dashboard »');
    await setLang(p, 'ar');
    c = await crumb(p);
    check(c.home === 'الرئيسية' && c.title === 'Chambres', 'switched to AR with the page open: « الرئيسية / Chambres »');
    await setLang(p, 'fr');
    c = await crumb(p);
    check(c.home === 'Accueil' && c.title === 'Chambres', 'and back to FR: « Accueil / Chambres »');
    check(await p.$$eval('.breadcrumb .breadcrumb-home', (els) => els.length) === 1, 'one home label, in the same .breadcrumb-home span as dash.breadcrumb');
    check(errors.length === 0, 'no page error while switching language');
    await p.close();
  }

  /* 3 · Un module qui se redessine sur kiwi:langchange garde son titre traduit. */
  {
    const {p} = await fresh('fr');
    await p.evaluate(() => {
      const titles = {fr: 'Chambres', en: 'Rooms', ar: 'الغرف'};
      window.addEventListener('kiwi:langchange', (e) => { Kiwi.appPage('hotel-rooms', {title: titles[e.detail.lang], body: ''}); });
      Kiwi.appPage('hotel-rooms', {title: titles.fr, body: ''});
    });
    await setLang(p, 'ar');
    const c = await crumb(p);
    check(c.home === 'الرئيسية' && c.title === 'الغرف', 'a page that re-renders on langchange keeps its own translated title (« الرئيسية / الغرف »)');
    await p.close();
  }

  /* 4 · Revenu à l'accueil, le fil redevient celui de i18n.js (dash.breadcrumb). */
  {
    const {p} = await fresh('fr');
    await open(p, 'Chambres');
    await p.evaluate(() => Kiwi.pageShell());
    await setLang(p, 'en');
    const c = await crumb(p);
    check(c.home === 'Home' && c.title === 'Dashboard', 'once the page is closed, a language switch leaves the dashboard\'s own « Home / Dashboard » alone');
    await p.close();
  }

  /* 5 · Plus aucun « Accueil » littéral dans appPage. */
  const src = coreTestSource.readFileSync(path.join(root, 'assets/interactive.js'), 'utf8');
  const start = src.indexOf('  function appPage(');
  const fn = src.slice(start, src.indexOf('\n  }\n', start));
  check(start > 0 && !/Accueil/.test(fn), 'appPage() writes no literal « Accueil »');
} finally {
  await browser.close();
  server.close();
}

console.log(`\ngenpage-breadcrumb-language: ${checks} passed, 0 failed`);
