#!/usr/bin/env node
/* Render the real dashboard client directory with a synthetic Amira merchant
 * book. This exercises the visible customer fiche without creating production
 * records in Amira's account. Both themes are opened independently so the
 * history remains legible after a full page render, click and modal open. */
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
const server = http.createServer((req, res) => {
  const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
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
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
console.log(`\n✓ ${checks} client-history browser checks passed`);
