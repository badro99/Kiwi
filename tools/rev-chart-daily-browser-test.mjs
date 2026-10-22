#!/usr/bin/env node
/* Garde : la courbe « Revenu & commandes » sur les périodes en jours
 * (2026-10-22).
 *
 * Avant : le survol d'une période de 30 jours interpolait heure par heure entre
 * deux jours (« MAR 6 · 14H », une valeur que personne n'a vendue), l'étiquette
 * était en capitales, l'axe tombait sur des jours au hasard, et la pastille de
 * variation restait affichée vide sans période précédente. Le chiffre du haut
 * perdait son espace de milliers (944489,70) sous l'interlettrage serré.
 *
 *  1 · le survol se cale sur des jours entiers : date complète en minuscules,
 *      montant au centime, le même que le chiffre du haut ;
 *  2 · l'axe des 30 jours porte une date par semaine (les lundis) ;
 *  3 · la moyenne des jours vendus et le meilleur jour sont marqués ;
 *  4 · l'espace de milliers du chiffre du haut a une largeur visible ;
 *  5 · une pastille de variation vide ne s'affiche pas ;
 *  6 · « Aujourd'hui » garde sa courbe horaire, sans ces marques ;
 *  7 · le tout en clair et en sombre.
 */
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { suite } from './browser-trace.mjs';
import { pinTradingHour } from './demo-clock.mjs';

const root = process.env.KIWI_ROOT || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const req = createRequire(path.join(root, 'app/package.json'));
let puppeteer;
try { puppeteer = req('puppeteer-core'); }
catch { console.log('○ skip: puppeteer-core unavailable'); process.exit(process.env.CI ? 1 : 0); }
const bin = process.env.KIWI_CHROMIUM_BIN || ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/chromium', '/usr/bin/google-chrome'].find(fs.existsSync);
if (!bin) { console.log('○ skip: Chromium unavailable'); process.exit(process.env.CI ? 1 : 0); }

const mime = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.json': 'application/json', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json' };
const server = http.createServer((rq, res) => {
  const pathname = decodeURIComponent(new URL(rq.url, 'http://local').pathname);
  const p = path.resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
  if (!p.startsWith(root + path.sep)) { res.writeHead(403); res.end(); return; }
  fs.readFile(p, (err, data) => { res.writeHead(err ? 404 : 200, { 'Content-Type': mime[path.extname(p)] || 'application/octet-stream' }); res.end(err ? '' : data); });
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await puppeteer.launch({ executablePath: bin, headless: true, args: ['--no-sandbox', '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1'] });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const S = suite('rev-chart-daily', { browser });
const check = (ok, msg) => { if (!ok) throw new Error(msg); console.log('  ✓ ' + msg); };

async function dashboard(t, { theme, range }) {
  const ctx = await browser.createBrowserContext();
  t.defer(() => ctx.close());
  const page = t.watch(await ctx.newPage());
  await page.setViewport({ width: 1440, height: 900 });
  await pinTradingHour(page, 15);
  await page.evaluateOnNewDocument((theme, range) => {
    try {
      localStorage.setItem('kiwiDashTheme', theme); localStorage.setItem('kiwiTheme', theme);
      localStorage.setItem('kiwiDateRange', range);
    } catch (_) {}
  }, theme, range);
  t.step(`open dashboard (${theme}, ${range})`);
  await page.goto(base + '/dashboard.html', { waitUntil: 'load' });
  // A fresh browser lands on the welcome card, then the demo's lock screen.
  for (const label of ['Explorer la démo', 'Entrer dans la démo']) {
    await page.waitForFunction((l) => [...document.querySelectorAll('button')].some((b) => b.textContent.includes(l) && b.offsetParent), { timeout: 15000 }, label);
    await page.evaluate((l) => [...document.querySelectorAll('button')].find((b) => b.textContent.includes(l) && b.offsetParent).click(), label);
    await sleep(800);
  }
  await page.waitForFunction(() => document.querySelector('[data-rev-svg] .rev-hit'), { timeout: 15000 });
  await sleep(2500);
  await page.evaluate(() => document.querySelector('[data-rev-svg]').scrollIntoView({ block: 'center' }));
  await sleep(300);
  return page;
}

/* Real pointer moves over the chart, at a fraction of its plot width. */
async function hoverAt(page, fx) {
  const box = await page.evaluate(() => {
    const r = document.querySelector('[data-rev-svg] .rev-hit').getBoundingClientRect();
    return { x: r.left, y: r.top, w: r.width, h: r.height };
  });
  await page.mouse.move(box.x + box.w * fx, box.y + box.h * 0.6, { steps: 4 });
  await sleep(220);
  return page.evaluate(() => {
    const svg = document.querySelector('[data-rev-svg]');
    const tip = svg.querySelector('.rev-tip');
    return {
      hover: svg.classList.contains('is-hover'),
      label: svg.querySelector('.rev-tip-label').textContent,
      value: svg.querySelector('.rev-tip-value').textContent,
      hero: document.querySelector('[data-rev-hero-val]').textContent,
      tipOpacity: +getComputedStyle(tip).opacity,
      tipFill: getComputedStyle(svg.querySelector('.rev-tip-rect')).fill,
    };
  });
}

const norm = (s) => s.replace(/[\s  ]+/g, ' ').replace(/ ?MAD$/, '').trim();

for (const theme of ['light', 'dark']) {
  await S.run(`30 days, ${theme}: the hover reads whole days`, async (t) => {
    const page = await dashboard(t, { theme, range: 'trenteJours' });
    const seen = new Set();
    for (const fx of [0.05, 0.31, 0.5, 0.74, 0.95]) {
      const r = await hoverAt(page, fx);
      check(r.hover, `hover is on at ${fx}`);
      check(/^[A-ZÉ][a-zéû]+ \d{1,2} [a-zéûô]+$/.test(r.label), `the tooltip names a whole day in sentence case: « ${r.label} »`);
      check(!/\dh/.test(r.label), 'no hour is invented between two days');
      check(/\d,\d\d ?MAD$/.test(r.value.replace(/[  ]/g, ' ')), `the amount is to the centime: « ${r.value} »`);
      check(norm(r.value) === norm(r.hero), `the hero follows the hovered day (${r.value} / ${r.hero})`);
      check(r.tipOpacity > 0.9 && r.tipFill !== 'none' && !/rgba\(0, 0, 0, 0\)/.test(r.tipFill), 'the tooltip card is painted');
      seen.add(r.label);
    }
    check(seen.size === 5, 'five positions read five different days');
    // Snap: two pointer positions inside one day's reach read the same day.
    const plot = await page.evaluate(() => document.querySelector('[data-rev-svg] .rev-hit').getBoundingClientRect().width);
    const step = 1 / 29, a = await hoverAt(page, step * 10 - step * 0.3), b = await hoverAt(page, step * 10 + step * 0.3);
    check(a.label === b.label && a.value === b.value, `the pointer snaps to the nearest day (plot ${Math.round(plot)} px)`);

    await page.mouse.move(5, 5);
    await sleep(300);
    const rest = await page.evaluate(() => {
      const svg = document.querySelector('[data-rev-svg]');
      const ticks = [...svg.querySelectorAll('text')].filter((x) => !x.closest('.rev-tip') && !x.closest('.rev-marks')).map((x) => x.textContent.trim()).filter(Boolean);
      const sep = document.querySelector('[data-rev-hero-val] .rev-hero-sep');
      return {
        hover: svg.classList.contains('is-hover'),
        ticks, weeks: svg.querySelectorAll('.rev-week').length,
        avg: svg.querySelector('.rev-avg-lbl')?.textContent || '',
        best: svg.querySelector('.rev-best-lbl')?.textContent || '',
        bestDot: !!svg.querySelector('.rev-best-dot'),
        sepW: sep ? sep.getBoundingClientRect().width : 0,
        hero: document.querySelector('[data-rev-hero-val]').textContent,
      };
    });
    check(!rest.hover, 'leaving the chart drops the hover');
    check(rest.ticks.length >= 3 && rest.ticks.length <= 5 && rest.ticks.every((x) => /^\d{1,2} [a-zéû.]+$/.test(x)), `the axis carries one date per week: ${rest.ticks.join(' / ')}`);
    check(rest.weeks === rest.ticks.length, 'each week date has its tick');
    check(/^Moyenne · [\d   ]+ MAD$/.test(rest.avg), `the average of the selling days is labelled: « ${rest.avg} »`);
    check(rest.bestDot && /\d/.test(rest.best), `the best day is marked: « ${rest.best} »`);
    check(rest.sepW >= 3, `the thousands gap in the hero is visible (${rest.sepW.toFixed(1)} px): « ${rest.hero} »`);

    const emptyHidden = await page.evaluate(() => {
      const d = document.querySelector('[data-rev-hero-delta]');
      const was = d.className;
      d.className = 'rev-hero-delta is-empty';
      const display = getComputedStyle(d).display;
      d.className = was;
      return display;
    });
    check(emptyHidden === 'none', `an empty delta chip is not drawn (display ${emptyHidden})`);
  });
}

await S.run('today keeps its hourly running total', async (t) => {
  const page = await dashboard(t, { theme: 'light', range: 'aujourdhui' });
  const r = await hoverAt(page, 0.2);
  const marks = await page.evaluate(() => document.querySelectorAll('[data-rev-svg] .rev-marks').length);
  check(r.hover && /^\d{2}h\d{2}$/.test(r.label), `the hourly tooltip reads a time: « ${r.label} »`);
  check(marks === 0, 'no daily marks on the hourly curve');
});

server.close();
await S.finish();
