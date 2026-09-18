#!/usr/bin/env node
/* Real dashboard regression for a Maison merchant. It starts from the same
 * restaurant demo markup as production and proves the venue/date renderers
 * replace every visible restaurant claim with honest Maison empty states. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { createRequire } from 'node:module';

const ROOT = path.resolve(import.meta.dirname, '..');
const require = createRequire(import.meta.url);
let puppeteer;
try {
  puppeteer = require(require.resolve('puppeteer-core', {
    paths: [path.join(ROOT, 'app'), ROOT, ...(process.env.NODE_PATH || '').split(path.delimiter)],
  }));
} catch {
  console.log('○ skip: puppeteer-core unavailable (Maison dashboard assertions not run)');
  process.exit(process.env.CI ? 1 : 0);
}
const executablePath = process.env.KIWI_CHROMIUM_BIN || [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/chromium',
].find((p) => fs.existsSync(p));
if (!executablePath) {
  console.log('○ skip: Chromium unavailable (Maison dashboard assertions not run)');
  process.exit(process.env.CI ? 1 : 0);
}

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2' };
const server = http.createServer((req, res) => {
  const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  // A newly installed worker intentionally reloads a young production tab.
  // This test owns first paint, so keep the run on one document.
  if (pathname === '/kiwi-sw.js') { res.writeHead(404); res.end('disabled in browser regression'); return; }
  if (pathname.startsWith('/api/')) {
    res.writeHead(pathname === '/api/me' ? 200 : 404, { 'Content-Type': 'application/json' });
    res.end(pathname === '/api/me' ? '{"authenticated":false}' : '{"error":"not-found"}');
    return;
  }
  const rel = pathname === '/' ? 'dashboard.html' : pathname.replace(/^\/+/, '');
  const file = path.resolve(ROOT, rel);
  if (!file.startsWith(ROOT + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); res.end('not found'); return; }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
  fs.createReadStream(file).pipe(res);
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));

const browser = await puppeteer.launch({ executablePath, headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
let checks = 0;
const ok = (value, label) => { assert.ok(value, label); checks++; console.log('✓ ' + label); };
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 1000 });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.evaluateOnNewDocument(() => {
    const venue = {
      id: 'v-art-de-table-by-amira', name: 'art de table by amira', fullDisplay: 'art de table by amira',
      slug: 'art-de-table-by-amira', location: '', type: 'boutique', subtype: 'maison', custom: true,
      siblings: '', status: 'En service', ice: '·', txCount: 0, staffCount: 0, hours: '', methods: '', goal: 0,
    };
    localStorage.setItem('kiwiCustomVenues', JSON.stringify([venue]));
    localStorage.setItem('kiwiVenue', venue.id);
    localStorage.setItem('kiwiOnboarded', '1');
  });
  await page.goto(`http://localhost:${server.address().port}/dashboard.html`, { waitUntil: 'load', timeout: 30000 });
  await page.waitForFunction(() => window.KiwiVenue?.getCurrentVenueData?.()?.subtype === 'maison');
  await page.evaluate(() => window.__kiwiLock.hide());
  await page.waitForFunction(() => /maison/i.test(document.querySelector('[data-hai-input]')?.placeholder || ''));
  await page.waitForFunction(() => document.querySelector('[data-bench-card]')?.classList.contains('is-empty-state'));
  // Late language/account listeners must not repaint the original restaurant
  // markup after the first correct Maison frame.
  await new Promise((resolve) => setTimeout(resolve, 2200));

  const state = await page.evaluate(() => ({
    venue: window.KiwiVenue.getCurrentVenueData(),
    placeholder: document.querySelector('[data-hai-input]')?.placeholder || '',
    chips: [...document.querySelectorAll('.hai-chips .hai-chip')].map((el) => el.textContent.trim()),
    hero: document.querySelector('[data-hero-amount]')?.textContent.replace(/\s+/g, ' ').trim() || '',
    bench: document.querySelector('[data-bench-card]')?.textContent.replace(/\s+/g, ' ').trim() || '',
    nav: document.querySelector('[data-vertical-section]')?.textContent.replace(/\s+/g, ' ').trim() || '',
    vocab: window.KiwiVenue.getVocab?.('askPlaceholder') || '',
    benchEmpty: document.querySelector('[data-bench-card]')?.classList.contains('is-empty-state'),
  }));
  if (process.env.KIWI_TEST_DEBUG) console.log(JSON.stringify({ state, errors }, null, 2));
  ok(state.venue.slug === 'art-de-table-by-amira' && state.venue.subtype === 'maison', 'dashboard keeps the Maison store identity and subtype');
  ok(/maison/i.test(state.placeholder) && !/restaurant/i.test(state.placeholder), 'AI question bar uses Maison vocabulary');
  ok(state.chips.length === 3 && state.chips.some((text) => /article/i.test(text)) && state.chips.every((text) => !/plat|carte/i.test(text)), 'AI starter questions describe retail sales, never restaurant dishes');
  ok(/^0(?:[,.]00)?\s*MAD$/i.test(state.hero), 'new Maison store renders zero real revenue instead of Café Atlas demo revenue');
  ok(!/147|caf[ée]s|Café Atlas/i.test(state.bench), 'peer card contains no invented café cohort or Café Atlas data');
  ok(state.benchEmpty, 'real Maison benchmark renders an explicit empty state');
  ok(/Pièces|Rayons|Offres|Retours|vendues/i.test(state.nav) && !/Carte du restaurant|Cuisine/i.test(state.nav), 'sidebar exposes Maison operations');
  ok(errors.length === 0, 'Maison dashboard renders without uncaught browser errors: ' + errors.join(' | '));
  console.log(`\n✓ ${checks} rendered Maison dashboard checks passed.`);
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
