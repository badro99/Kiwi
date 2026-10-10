#!/usr/bin/env node
/* Screenshot every sidebar page of the dashboard demo, and measure how much of
 * each card's width its content actually uses.
 *
 *   node tools/ui-audit/shoot.mjs --venue cafeAtlas --theme light --width 1440 \
 *        --out /tmp/shots/cafe-light [--pages accueil,transactions] [--base http://localhost:4329]
 *
 * Writes <out>/<nav>.png (full page) and <out>/metrics.json. The service worker
 * is blocked so every run sees the files on disk, not a cached shell. */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const ROOT = path.resolve(import.meta.dirname, '..', '..');
const require = createRequire(import.meta.url);
const puppeteer = require(require.resolve('puppeteer-core', { paths: [path.join(ROOT, 'app'), ROOT] }));
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const BASE = arg('base', 'http://localhost:4329');
const VENUE = arg('venue', 'maisonMansour');
const THEME = arg('theme', 'light');
const WIDTH = +arg('width', 1440);
const HEIGHT = +arg('height', 900);
const OUT = path.resolve(arg('out', `/tmp/kiwi-shots/${VENUE}-${THEME}-${WIDTH}`));
const ONLY = (arg('pages', '') || '').split(',').filter(Boolean);
const URL_PATH = arg('path', '/dashboard.html');
fs.mkdirSync(OUT, { recursive: true });

const executablePath = process.env.KIWI_CHROMIUM_BIN || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath, headless: 'new', args: ['--no-sandbox', '--hide-scrollbars'] });
const page = await browser.newPage();
await page.setViewport({ width: WIDTH, height: HEIGHT, deviceScaleFactor: 1, isMobile: WIDTH < 600, hasTouch: WIDTH < 600 });
await page.setRequestInterception(true);
page.on('request', (r) => (/\/kiwi-sw\.js/.test(r.url()) ? r.respond({ status: 404, body: '' }) : r.continue()));
await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: THEME }]);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function enterDemo() {
  await page.goto(BASE + URL_PATH, { waitUntil: 'networkidle2', timeout: 60000 }).catch(() => {});
  await wait(1500);
  // A fresh profile meets onboarding first, then the account gate.
  for (let i = 0; i < 4; i++) {
    const hit = await page.evaluate(() => {
      const b = [...document.querySelectorAll('button, a')].find((x) => /Entrer dans la démo|Explorer la démo/.test(x.textContent) && x.getBoundingClientRect().width);
      if (b) { b.click(); return true; }
      return false;
    });
    if (!hit) break;
    await wait(2200);
  }
}
await enterDemo();
if (URL_PATH === '/dashboard.html') {
  const cur = await page.evaluate(() => window.KiwiVenue?.getVenue?.()?.id || window.KiwiVenue?.getVenue?.());
  if (cur !== VENUE) {
    // Re-entering the demo resets the venue, so reload plainly after the switch.
    // The multi-venue view is entered in place and does not survive a reload.
    if (VENUE === 'fusion') {
      await page.evaluate(() => { try { window.KiwiVenue.enterFusion(); } catch (e) {} });
      await wait(4000);
    } else {
      await page.evaluate((v) => { try { window.KiwiVenue.setVenue(v); } catch (e) {} }, VENUE);
      await wait(1200);
      await page.goto(BASE + URL_PATH, { waitUntil: 'networkidle2', timeout: 60000 }).catch(() => {});
      await wait(2000);
    }
  }
}
await page.evaluate((t) => {
  try { localStorage.setItem('kiwiTheme', t); } catch (e) {}
  document.documentElement.setAttribute('data-theme', t);
  document.body.setAttribute('data-vexel-mode', t);
}, THEME);
await wait(500);

/* Per page: for every card-like box at least 360px wide, the share of its inner
 * width covered by leaf content (union of x-intervals). A low share with the
 * content hugging the left edge is the "empty right side" pattern. */
const measure = () => {
  const out = [];
  const cards = [...document.querySelectorAll('.dash-genpage *, .kiwi-drawer *, main *')].filter((e) => {
    const r = e.getBoundingClientRect(); if (r.width < 360 || r.height < 40) return false;
    const cs = getComputedStyle(e);
    const painted = (cs.backgroundColor !== 'rgba(0, 0, 0, 0)' && cs.backgroundColor !== 'transparent') || parseFloat(cs.borderTopWidth) > 0 || cs.boxShadow !== 'none';
    return painted && cs.display !== 'inline';
  });
  for (const c of cards.slice(0, 120)) {
    const r = c.getBoundingClientRect();
    const cs = getComputedStyle(c);
    const L = r.left + parseFloat(cs.paddingLeft), R = r.right - parseFloat(cs.paddingRight);
    const iv = [];
    c.querySelectorAll('*').forEach((e) => {
      if (e.children.length && !e.matches('button,input,select,textarea,svg,img,canvas')) return;
      if (e.closest('svg') && !e.matches('svg')) return;
      const b = e.getBoundingClientRect(); if (b.width < 1 || b.height < 1) return;
      iv.push([Math.max(L, b.left), Math.min(R, b.right)]);
    });
    if (!iv.length) continue;
    iv.sort((a, b) => a[0] - b[0]);
    let covered = 0, s = iv[0][0], e = iv[0][1];
    for (const [a, b] of iv.slice(1)) { if (a > e) { covered += e - s; s = a; e = b; } else e = Math.max(e, b); }
    covered += e - s;
    const maxRight = Math.max(...iv.map((x) => x[1]));
    out.push({
      sel: c.tagName.toLowerCase() + (c.className && typeof c.className === 'string' ? '.' + c.className.trim().split(/\s+/).slice(0, 3).join('.') : ''),
      x: Math.round(r.left), y: Math.round(r.top + scrollY), w: Math.round(r.width),
      fill: +(covered / Math.max(1, R - L)).toFixed(2),
      emptyRight: Math.round(R - maxRight),
      text: (c.innerText || '').trim().replace(/\s+/g, ' ').slice(0, 60),
    });
  }
  return { viewport: innerWidth, cards: out.filter((x) => x.emptyRight > 120 || x.fill < 0.55) };
};

const navs = await page.evaluate(() => [...document.querySelectorAll('.sidebar [data-nav]')].map((a) => a.getAttribute('data-nav')).filter((v, i, a) => a.indexOf(v) === i));
const metrics = {};
for (const nav of navs.filter((n) => !ONLY.length || ONLY.includes(n))) {
  await page.evaluate(() => document.querySelectorAll('.kiwi-drawer-close, .kiwi-modal-close').forEach((b) => b.click()));
  await page.evaluate((n) => document.querySelector('.sidebar [data-nav="' + n + '"]')?.click(), nav);
  await wait(1800);
  await page.evaluate(() => window.scrollTo(0, 0));
  const locked = await page.evaluate(() => /Bienvenue/.test(document.body.innerText.slice(0, 300)));
  if (locked) { await enterDemo(); await page.evaluate((n) => document.querySelector('.sidebar [data-nav="' + n + '"]')?.click(), nav); await wait(1800); }
  metrics[nav] = await page.evaluate(measure);
  metrics[nav].title = await page.evaluate(() => ((document.querySelector('.kiwi-drawer h2') || document.querySelector('.dash-genpage h1') || document.querySelector('.dr-label'))?.textContent || '').trim().slice(0, 60));
  await page.screenshot({ path: path.join(OUT, nav + '.png'), fullPage: true, captureBeyondViewport: true });
  process.stdout.write('· ' + nav + '\n');
}
fs.writeFileSync(path.join(OUT, 'metrics.json'), JSON.stringify({ venue: VENUE, theme: THEME, width: WIDTH, pages: metrics }, null, 2));
await browser.close();
console.log('done →', OUT);
