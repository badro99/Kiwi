#!/usr/bin/env node
/* Render the real dashboard client directory with a synthetic Amira merchant
 * book. This exercises the visible customer fiche without creating production
 * records in Amira's account. Both themes are opened independently so the
 * history remains legible after a full page render, click and modal open. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';

const ROOT = path.resolve(import.meta.dirname, '..');
const require = createRequire(import.meta.url);
let puppeteer;
try {
  puppeteer = require(require.resolve('puppeteer-core', {
    paths: [path.join(ROOT, 'app'), ROOT, ...(process.env.NODE_PATH || '').split(path.delimiter)],
  }));
} catch {
  console.log('○ skip: puppeteer-core unavailable (client-history browser assertions not run)');
  process.exit(process.env.CI ? 1 : 0);
}
const executablePath = process.env.KIWI_CHROMIUM_BIN || [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/chromium',
].find((file) => fs.existsSync(file));
if (!executablePath) {
  console.log('○ skip: Chromium unavailable (client-history browser assertions not run)');
  process.exit(process.env.CI ? 1 : 0);
}

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2' };
// Isolated native-CSS fixture: the shipped click router, directory renderer,
// shared modal factory and client store run unchanged. No auth gates, fake
// production responses, handler calls or synthetic interaction events.
const nativeMerchant = 'synthetic-client-header';
const nativeBookKey = 'kiwi:clients:v1:' + nativeMerchant;
const nativeClients = [
  { id: 'native-short', name: 'Zakariae' },
  { id: 'native-long', name: 'عميل طويل الاسم Zakariae $& <opaque> ' + 'LongMerchantName'.repeat(3) },
].map((client, index) => ({ ...client, phone: '061111111' + index,
  email: 'fixture' + index + '@example.invalid', visits: 1, spend: 730, points: 73,
  consent: true, consentEmail: true, firstSeen: 1788256800000, lastSeen: 1788256800000,
  updated: 1788256800000, history: [{ ref: '2042', ts: 1788256800000,
    amount: 730, method: 'carte', items: [{ name: 'Assiette Atlas', qty: 2, total: 730 }] }] }));
const nativeFixture = `<!doctype html><html class="kiwi-native kiwi-native-ios"><head>
  <meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Synthetic native customer header regression</title>
  <link rel="stylesheet" href="/assets/tokens.css"><link rel="stylesheet" href="/assets/theme.css">
  <link rel="stylesheet" href="/assets/design-vexel.css"><link rel="stylesheet" href="/app/src/native-runtime.css">
  <script src="/assets/i18n.js" defer></script><script src="/assets/interactive.js" defer></script>
  <script src="/assets/venue-store.js" defer></script><script src="/assets/clients-store.js" defer></script>
  <script src="/assets/clients-directory.js" defer></script>
</head><body class="design-vexel kiwi-native-owner"><button type="button" data-action="clients-directory">Customers fixture</button><main class="container"></main></body></html>`;
const server = http.createServer((req, res) => {
  const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  if (pathname === '/native-client-fixture.html') {
    res.writeHead(200, { 'Content-Type': TYPES['.html'] }); res.end(nativeFixture); return;
  }
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
const nativeShots = fs.mkdtempSync(path.join(os.tmpdir(), 'kiwi-native-client-header-'));
let checks = 0;
const ok = (value, label) => { assert.ok(value, label); checks++; console.log('✓ ' + label); };
try {
  for (const theme of ['light', 'dark']) {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 1000 });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.evaluateOnNewDocument((selectedTheme) => {
      const venue = { id: 'v-art-de-table-by-amira', name: 'art de table by amira', fullDisplay: 'art de table by amira', slug: 'art-de-table-by-amira', type: 'boutique', subtype: 'maison', custom: true, status: 'En service' };
      const client = { id: 'client-amira-proof', name: 'Cliente Preuve', phone: '0611111111', email: 'preuve@example.com', city: 'Tanger', visits: 1, spend: 730, points: 73, consent: true, consentEmail: true, firstSeen: Date.now() - 86400000, lastSeen: Date.now(), updated: Date.now(), history: [{ ref: '2042', ts: Date.now() - 3600000, amount: 730, method: 'carte', items: [{ name: 'Assiette Atlas', qty: 2, total: 730 }] }] };
      localStorage.setItem('kiwiCustomVenues', JSON.stringify([venue]));
      localStorage.setItem('kiwiVenue', venue.id);
      localStorage.setItem('kiwiLiveMerchant', venue.slug);
      localStorage.setItem('kiwiLive', '1');
      localStorage.setItem('kiwiOnboarded', '1');
      localStorage.setItem('kiwi:clients:v1:' + venue.slug, JSON.stringify({ list: [client], seq: 1 }));
      localStorage.setItem('kiwiTheme', selectedTheme);
    }, theme);
    await page.goto(`http://127.0.0.1:${server.address().port}/dashboard.html`, { waitUntil: 'load', timeout: 30000 });
    await page.waitForFunction(() => window.Kiwi?.handlers?.['clients-directory'] && window.KiwiClients?.count?.() === 1);
    await page.evaluate(() => { if (window.__kiwiLock?.hide) window.__kiwiLock.hide(); window.Kiwi.handlers['clients-directory'](); });
    await page.waitForSelector('[data-cd-id="client-amira-proof"]');
    await page.click('[data-cd-id="client-amira-proof"]');
    await page.waitForSelector('.cd-history-row');
    const visible = await page.evaluate(() => ({
      text: document.querySelector('.cd-history-list')?.innerText || '',
      title: document.querySelector('.cd-history-title')?.textContent || '',
      bg: getComputedStyle(document.querySelector('.cd-history-list')).backgroundColor,
      theme: document.documentElement.getAttribute('data-theme') || 'light',
    }));
    ok(visible.title === 'Historique des achats', `${theme}: purchase history has a clear Kiwi section title`);
    ok(visible.text.includes('Carte') && visible.text.includes('2× Assiette Atlas'), `${theme}: payment method and purchased items are visible`);
    ok(visible.text.includes('Ticket 2042') && visible.text.includes('730 MAD'), `${theme}: ticket reference and amount are visible`);
    ok(theme === 'light' || visible.bg !== 'rgb(255, 255, 255)', `${theme}: history surface follows the selected theme`);
    ok(errors.length === 0, `${theme}: no page error while opening the customer fiche`);
    await page.close();
  }
  assert.equal(checks, 10, 'all ten original desktop assertions remain mandatory');
  // Preserve the ten desktop assertions above; add all six Pro locale/theme
  // contexts without replacing the real directory/detail renderer with markup.
  for (const lang of ['fr', 'en', 'ar']) for (const theme of ['light', 'dark']) {
    const context = await browser.createBrowserContext();
    const page = await context.newPage();
    const label = `native Pro ${lang}/${theme}`;
    const errors = [], writes = [], external = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.setRequestInterception(true);
    const base = `http://127.0.0.1:${server.address().port}`;
    page.on('request', request => {
      if (!['GET', 'HEAD'].includes(request.method())) { writes.push(request.method()); void request.abort(); }
      else if (!request.url().startsWith(base + '/') && !request.url().startsWith('data:')) { external.push('blocked'); void request.abort(); }
      else void request.continue();
    });
    await page.setViewport({ width: 402, height: 874, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
    await page.evaluateOnNewDocument(({ lang, theme, merchant, bookKey, clients }) => {
      // Bootstrap only; every subsequent open/close is actual pointer input.
      localStorage.setItem('kiwiLang', lang); localStorage.setItem('kiwiTheme', theme);
      localStorage.setItem('kiwiLiveMerchant', merchant);
      localStorage.setItem(bookKey, JSON.stringify({ list: clients, seq: 1 }));
      window.KiwiEnv = { isReal: () => false, demosAllowed: true };
      document.addEventListener('DOMContentLoaded', () => {
        document.documentElement.lang = lang;
        document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
        document.documentElement.dataset.theme = theme;
        document.documentElement.style.setProperty('--kiwi-host-safe-top', '62px');
        document.documentElement.style.setProperty('--kiwi-host-safe-bottom', '34px');
      }, { once: true });
    }, { lang, theme, merchant: nativeMerchant, bookKey: nativeBookKey, clients: nativeClients });
    await page.goto(base + '/native-client-fixture.html', { waitUntil: 'load', timeout: 30000 });
    await page.waitForFunction(() => window.Kiwi?.handlers?.['clients-directory'] && window.KiwiClients?.count?.() === 2);
    const initialBook = await page.evaluate(key => localStorage.getItem(key), nativeBookKey);
    await page.click('[data-action="clients-directory"]');
    for (const client of nativeClients) {
      await page.waitForSelector(`[data-cd-id="${client.id}"]`, { visible: true });
      await page.click(`[data-cd-id="${client.id}"] .cd-nm`);
      await page.waitForSelector('.kiwi-native-client-sheet.in .kiwi-modal-close', { visible: true });
      // Wait for the original finite sheet transition, not a shortened animation.
      await page.waitForFunction(() => !document.querySelector('.kiwi-native-client-sheet .kiwi-modal')
        .getAnimations().some(animation => animation.playState === 'running'));
      const geometry = await page.evaluate(() => {
        const modal = document.querySelector('.kiwi-native-client-sheet .kiwi-modal');
        const close = modal.querySelector(':scope > .kiwi-modal-close');
        const header = modal.querySelector(':scope > .kiwi-modal-head');
        const c = close.getBoundingClientRect(), m = modal.getBoundingClientRect();
        const glyphs = [...header.querySelectorAll('.tag,h3,p')].flatMap(node => {
          const range = document.createRange(); range.selectNodeContents(node);
          return [...range.getClientRects()].map(rect => rect.toJSON());
        });
        const hit = document.elementFromPoint(c.x + c.width / 2, c.y + c.height / 2);
        const rtl = getComputedStyle(modal).direction === 'rtl';
        return { title: header.querySelector('h3').textContent, rtl,
          lang: document.documentElement.lang, theme: document.documentElement.dataset.theme,
          close: c.toJSON(), modal: m.toJSON(), glyphs,
          closeHit: hit === close || close.contains(hit),
          endInset: rtl ? c.left - m.left : m.right - c.right,
          headerPaddingEnd: parseFloat(getComputedStyle(header).paddingInlineEnd),
          horizontalOverflow: modal.scrollWidth > modal.clientWidth + 1,
          viewport: { width: innerWidth, height: innerHeight } };
      });
      const caseLabel = `${label}/${client.id}`;
      ok(geometry.lang === lang && geometry.theme === theme && geometry.rtl === (lang === 'ar'), caseLabel + ': actual locale/theme/direction');
      ok(geometry.title === client.name, caseLabel + ': opaque merchant name preserved exactly');
      ok(geometry.close.width >= 44 && geometry.close.height >= 44 && geometry.closeHit,
        caseLabel + ': close is a fully hittable 44px target ' + JSON.stringify(geometry.close));
      ok(geometry.close.left >= 0 && geometry.close.right <= geometry.viewport.width && geometry.close.top >= 62
        && geometry.close.bottom <= geometry.viewport.height - 34, caseLabel + ': close stays inside native safe bounds');
      ok(Math.abs(geometry.endInset - 18) <= 1 && geometry.headerPaddingEnd >= 80, caseLabel + ': shared logical-end footprint reserved');
      ok(geometry.glyphs.length > 0 && geometry.glyphs.every(rect => rect.width > 0 && rect.left >= geometry.modal.left
        && rect.right <= geometry.modal.right && rect.top >= 62 && rect.bottom <= geometry.viewport.height - 34
        && !(rect.left < geometry.close.right && rect.right > geometry.close.left
          && rect.top < geometry.close.bottom && rect.bottom > geometry.close.top)),
        caseLabel + ': every badge/title glyph range fits without close overlap ' + JSON.stringify(geometry));
      ok(!geometry.horizontalOverflow, caseLabel + ': modal has no horizontal overflow');
      await page.screenshot({ path: path.join(nativeShots, `${lang}-${theme}-${client.id}.png`), captureBeyondViewport: false });
      await page.click('.kiwi-native-client-sheet .kiwi-modal-close');
      await page.waitForFunction(() => !document.querySelector('.kiwi-native-client-sheet'));
      ok(await page.evaluate(key => localStorage.getItem(key), nativeBookKey) === initialBook,
        caseLabel + ': real close preserves exact synthetic book bytes');
    }
    ok(errors.length === 0, label + ': no renderer exception ' + errors.join(' | '));
    ok(writes.length === 0, label + ': no attempted network mutation');
    console.log(`${label}: ${external.length} external requests blocked; browser CSS/layout proof, not native touch acceptance`);
    await context.close();
  }
  assert.equal(checks, 118, 'all desktop and twelve native customer header scenes remain mandatory');
  console.log('Native client header browser originals: ' + nativeShots);
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
console.log(`\n✓ ${checks} client-history browser checks passed`);
