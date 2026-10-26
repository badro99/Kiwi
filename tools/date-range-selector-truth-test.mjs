#!/usr/bin/env node
/* Tableau de bord · la rangée de dates dit la période vraiment appliquée.
 * Conduit dans un vrai navigateur sur le bloc de dates de dashboard.html tel
 * qu'il est livré, avec assets/dateRange.js et assets/liquid-lens.js.
 *
 * 2026-10-12. Trois mensonges de la même rangée :
 *  · un commerçant dont la période enregistrée était « Mois dernier » (l'ancien
 *    menu des périodes la proposait) voyait le titre « Mois dernier » et la
 *    lentille allumée sur « Aujourd'hui » : aucune pastille n'était la bonne,
 *    et la lentille restait sur la dernière qui l'avait été ;
 *  · après le message d'accueil, le titre restait « Aujourd'hui », en français
 *    sous l'arabe, jusqu'au premier rendu complet ;
 *  · le calendrier s'ouvrait sur un point « · » à la place de la période.
 */
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import {createRequire} from 'node:module';

const root = process.env.KIWI_ROOT || path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const require = createRequire(path.join(root, 'app/package.json'));
const puppeteer = require('puppeteer-core');
const bin = process.env.KIWI_CHROMIUM_BIN || ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/chromium', '/usr/bin/google-chrome'].find(fs.existsSync);
assert.ok(bin, 'Chromium required for the date row');

const source = read('dashboard.html').replace(/<link rel="stylesheet" href="assets\/dashboard-shell\.css\?v=\d+"\s*\/?>/, () => '<style>' + read('assets/dashboard-shell.css') + '</style>');
const styles = [...source.matchAll(/<style[^>]*>([\s\S]*?)<\/style>|<link[^>]*rel="stylesheet"[^>]*href="([^"]+)"[^>]*>/g)]
  .map((m) => m[1] || (m[2].startsWith('assets/') ? read(m[2].split('?')[0]) : '')).join('\n');
const start = source.indexOf('<!-- ═══ DATE RANGE SELECTOR ═══ -->');
assert.ok(start > 0, 'the date range block is still marked in dashboard.html');
const block = source.slice(start, source.indexOf('<!-- ═══════', start + 10));
assert.ok(/data-dr-label/.test(block) && /dr-pill-custom/.test(block), 'the block carries the title and the calendar pill');

const page = (lang) => `<!doctype html><html lang="${lang}" dir="${lang === 'ar' ? 'rtl' : 'ltr'}"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><style>${styles}</style>
<style>body{margin:0;padding:24px;background:#F7F5F0}</style></head><body>
<main class="main">${block}</main>
<script>
window.__boot = [];
window.KiwiDashboardBoot = { whenUnlocked(cb) { __boot.push(cb); } };
window.KiwiI18n = { getLang: () => document.documentElement.lang || 'fr' };
window.__unlock = () => { __boot.splice(0).forEach((cb) => { try { cb(); } catch (e) { console.log('render after unlock: ' + e.message); } }); };
</script>
<script src="/assets/interactive/helpers.js"></script><script src="/assets/interactive/handlers.js"></script><script src="/assets/interactive.js"></script>
<script src="/assets/sales-history.js"></script>
<script src="/assets/daterange/renderers.js"></script><script src="/assets/dateRange.js"></script>
<script src="/assets/liquid-lens.js"></script>
</body></html>`;

const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://local');
  if (u.pathname === '/dashboard') { res.setHeader('Content-Type', 'text/html'); res.end(page(u.searchParams.get('lang') || 'fr')); return; }
  const f = path.join(root, decodeURIComponent(u.pathname));
  if (!f.startsWith(root + path.sep) || !fs.existsSync(f)) { res.statusCode = 404; res.end(); return; }
  res.setHeader('Content-Type', f.endsWith('.css') ? 'text/css' : 'text/javascript');
  res.end(fs.readFileSync(f));
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await puppeteer.launch({executablePath: bin, headless: true, args: ['--no-sandbox']});
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
let checks = 0;
const check = (yes, msg) => { assert.ok(yes, msg); checks++; console.log('  ✓ ' + msg); };

async function open(lang, stored, viewport = {width: 1180, height: 760}) {
  const ctx = await browser.createBrowserContext();
  const p = await ctx.newPage();
  await p.setViewport(viewport);
  await p.emulateMediaFeatures([{name: 'prefers-reduced-motion', value: 'reduce'}]);
  await p.setRequestInterception(true);
  p.on('request', (r) => (r.url().startsWith(base) || r.url().startsWith('data:') ? r.continue() : r.abort()));
  await p.evaluateOnNewDocument((stored) => { try { localStorage.setItem('kiwiDateRange', stored); } catch (_) {} }, stored);
  await p.goto(`${base}/dashboard?lang=${lang}`);
  await pause(350);
  return {ctx, p};
}
const state = (p) => p.evaluate(() => {
  const lens = document.querySelector('.dr-pills .kw-lens');
  const on = [...document.querySelectorAll('.dr-pill.on')].map((e) => e.dataset.range);
  const box = (e) => { const r = e.getBoundingClientRect(); return {l: Math.round(r.left), w: Math.round(r.width)}; };
  const over = lens && on.length === 1 ? (() => { const a = box(lens), b = box(document.querySelector('.dr-pill.on')); return Math.abs(a.l - b.l) <= 2 && Math.abs(a.w - b.w) <= 2; })() : false;
  return {
    label: document.querySelector('[data-dr-label]').textContent,
    on, pressed: [...document.querySelectorAll('.dr-pill[aria-pressed="true"]')].map((e) => e.dataset.range),
    lensShown: !!lens && getComputedStyle(lens).opacity === '1', over, waiting: window.__boot.length,
  };
});

try {
  /* A · arabe, période enregistrée « Mois dernier », derrière l'écran de code */
  {
    const {ctx, p} = await open('ar', 'moisDernier');
    const s = await state(p);
    check(s.waiting === 1, 'A · the dashboard is still behind the code screen (first render not run)');
    check(s.label === 'الشهر الماضي', 'A · the title already names the stored period, in Arabic, before the first render');
    check(s.on.join() === 'personnalise' && s.pressed.join() === 'personnalise', 'A · a period without a pill of its own lights the calendar pill, and only it');
    check(s.lensShown && s.over, 'A · the lens sits on the calendar pill, not on « Today »');

    await p.evaluate(() => window.__unlock());
    await pause(300);
    const after = await state(p);
    check(after.label === 'الشهر الماضي' && after.on.join() === 'personnalise', 'A · the first full render paints the same title and pill');

    await p.click('.dr-pill-custom');
    await p.waitForSelector('.dr-popover.open, .dr-sheet.open', {timeout: 3000});
    const ro = await p.$eval('[data-drp-readout]', (e) => ({t: e.textContent, set: e.classList.contains('is-set')}));
    check(ro.t === 'الشهر الماضي' && !ro.set, 'A · the calendar opens on the period in effect (muted), not on a lone « · »');
    await ctx.close();
  }

  /* B · anglais, « 7 jours », puis la lentille quand rien n'est choisi */
  {
    const {ctx, p} = await open('en', 'septJours');
    const s = await state(p);
    check(s.label === 'Last 7 days' && s.on.join() === 'septJours' && s.over, 'B · a period with its own pill lights that pill, under its English title');

    await p.evaluate(() => document.querySelectorAll('.dr-pill').forEach((e) => e.classList.remove('on')));
    await pause(120);
    const none = await state(p);
    check(!none.lensShown, 'B · when no item in a row is selected, the lens steps aside instead of staying on the last one');

    await p.evaluate(() => document.querySelector('.dr-pill[data-range="hier"]').classList.add('on'));
    await pause(400);
    const back = await state(p);
    check(back.lensShown && back.over, 'B · the next selection brings it back, in place on the new item');
    await ctx.close();
  }

  /* C · français, aucune période enregistrée : rien ne change */
  {
    const {ctx, p} = await open('fr', '');
    const s = await state(p);
    check(s.label === "Aujourd'hui" && s.on.join() === 'aujourdhui' && s.over, 'C · with nothing stored, « Aujourd\'hui » is the title, the pill and the lens, as before');
    await ctx.close();
  }
} finally {
  await browser.close();
  server.close();
}
console.log(`\ndate-range-selector-truth: ${checks} passed, 0 failed`);
