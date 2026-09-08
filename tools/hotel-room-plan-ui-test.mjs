#!/usr/bin/env node
/* Real Chromium smoke for the custom-hotel room plan.  The fixture is local,
 * tenant-isolated, and seeds only an in-memory browser localStorage document. */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(path.join(ROOT, 'app', 'package.json'));
const puppeteer = require('puppeteer-core');
function findChrome() {
  if (process.env.CHROME_BIN) return process.env.CHROME_BIN;
  const candidates = [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser',
  ];
  for (const candidate of candidates) if (fs.existsSync(candidate)) return candidate;
  for (const name of ['google-chrome', 'chromium', 'chromium-browser']) {
    try { return execFileSync('which', [name], { encoding: 'utf8' }).trim(); } catch (_) {}
  }
  throw new Error('Chromium/Chrome executable not found; set CHROME_BIN');
}
const chrome = findChrome();
const screenshotDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kiwi-hotel-room-plan-'));
const roomRows = Array.from({ length: 20 }, (_, i) => {
  const n = i + 1;
  const floor = n <= 10 ? 'floor-one' : 'floor-two';
  return { id: `room:${n}`, n, typeId: 'type:room', typeName: 'Chambre', floorId: floor,
    floor: n <= 10 ? '1er étage' : '2e étage', rate: 850, status: n % 5 === 0 ? 'sale' : 'libre',
    hk: 'clean', guest: null, meta: 'Libre · propre', updatedAt: 1000 + n,
    view: n % 2 ? 'Mer' : 'Jardin', characteristics: [] };
});
const fixtureDoc = {
  v: 4, rooms: roomRows,
  roomTypes: [{ id: 'type:room', name: 'Chambre', rate: 850, maxGuests: 2, beds: '1 grand lit', public: true, updatedAt: 1000 }],
  floors: [{ id: 'floor-one', name: '1er étage', order: 0, updatedAt: 1000 }, { id: 'floor-two', name: '2e étage', order: 1, updatedAt: 1001 }],
  views: ['Mer', 'Jardin'], customCharacteristics: [], folios: [], roomAudits: [], updatedAt: 1001,
};

const bootstrap = `<script>
  const fixture = ${JSON.stringify(fixtureDoc)};
  localStorage.setItem('kiwi:hotel-rooms:v2:fixture-hotel', JSON.stringify(fixture));
  window.KiwiEnv = { isReal: () => false };
  window.KiwiVenue = {
    isCustom: () => true, getVenue: () => 'fixture-hotel', getVenueType: () => 'hotel',
    getCurrentVenueData: () => ({ slug: 'fixture-hotel', name: 'Fixture Hotel', profileInfo: { rooms: 20 } }),
    subscribe: () => () => {},
  };
  window.KiwiStore = { slugFor: () => 'fixture-hotel' };
  window.KiwiCloudDoc = {
    currentSlug: () => 'fixture-hotel', slugFor: () => 'fixture-hotel',
    attach: (options) => ({
      bind: async () => false, pull: async () => false, push: () => false,
      save: async (data) => ({ ok: true, status: 200, rev: 3, data }),
      pushNow: async () => ({ ok: true, status: 200, rev: 2, data: fixture }),
      options,
    }),
  };
  window.KiwiReservations = { get: () => ({ bookings: [] }) };
  window.Kiwi = {
    handlers: {},
    toast: () => {},
  };
</script>`;

const html = `<!doctype html><html><head><meta charset="utf-8">
  <link rel="stylesheet" href="/assets/tokens.css"><link rel="stylesheet" href="/assets/platform-ops.css">
  <link rel="stylesheet" href="/assets/theme.css"><link rel="stylesheet" href="/assets/polish.css">
  <link rel="stylesheet" href="/assets/simple.css"><link rel="stylesheet" href="/assets/ux.css">
  <link rel="stylesheet" href="/assets/pages-pro.css"><link rel="stylesheet" href="/assets/polish-dashboard.css">
  <link rel="stylesheet" href="/assets/hotel.css"><link rel="stylesheet" href="/assets/genpage.css">
</head><body><button data-action="nav-chambres" type="button">Open room plan</button><main class="container"></main>${bootstrap}<script src="/assets/interactive.js"></script><script src="/assets/hotel.js"></script></body></html>`;
const server = http.createServer((req, res) => {
  if (req.url === '/' || req.url === '/index.html') { res.writeHead(200, { 'content-type': 'text/html' }); res.end(html); return; }
  if (req.url === '/favicon.ico') { res.writeHead(204); res.end(); return; }
  if (req.url === '/api/hotel/rooms-bulk' && req.method === 'POST') {
    let body = ''; req.on('data', (chunk) => { body += chunk; }); req.on('end', () => {
      let payload = {}; try { payload = JSON.parse(body); } catch (_) {}
      const data = JSON.parse(JSON.stringify(fixtureDoc));
      const changes = payload.changes || {};
      data.rooms = data.rooms.map((room) => payload.targets?.some((target) => target.id === room.id)
        ? { ...room, ...(changes.view != null ? { view: changes.view } : {}) }
        : room);
      res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ ok: true, rev: 2, data }));
    }); return;
  }
  const rel = req.url.replace(/^\//, '').split('?')[0];
  if (rel === 'assets/hotel.js' || rel === 'assets/interactive.js' || rel.endsWith('.css')) {
    res.writeHead(200, { 'content-type': rel.endsWith('.css') ? 'text/css' : 'text/javascript' }); res.end(fs.readFileSync(path.join(ROOT, rel))); return;
  }
  res.writeHead(404); res.end('not found');
});

const checks = [];
const check = (condition, message) => { assert.ok(condition, message); checks.push(message); console.log(`✓ ${message}`); };
const waitForModalAnimation = (page) => page.waitForFunction(() => {
  const backdrop = document.querySelector('.kiwi-backdrop.in');
  if (!backdrop) return false;
  const animations = backdrop.getAnimations({ subtree: true });
  return getComputedStyle(backdrop).opacity === '1' && animations.every((animation) => animation.playState === 'finished');
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const port = server.address().port;
const browser = await puppeteer.launch({ headless: true, executablePath: chrome, args: ['--no-sandbox'] });
try {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (error) => { const message = String(error); errors.push(message); console.error(`PAGEERROR: ${message}`); });
  page.on('console', (message) => { if (message.type() === 'error') console.error(`BROWSER-CONSOLE: ${message.text()}`); });
  await page.setViewport({ width: 1440, height: 1000, deviceScaleFactor: 1 });
  await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'networkidle0' });
  await page.click('[data-action="nav-chambres"]');
  await page.waitForSelector('.hx-room-workspace');
  check(await page.$$eval('[data-hx-room-card]', (x) => x.length) === 20, 'desktop renders all 20 fixture rooms');
  check(await page.$$eval('[data-hx-floor-section]', (x) => x.length) === 2, 'desktop renders both floor sections');

  await page.click('[data-action="hx-room-filters-open"]');
  await page.waitForSelector('.hx-hotel-modal [data-hx-filter-floor]');
  await page.click('[data-hx-filter-floor="floor-one"]');
  await page.click('[data-hx-filter-floor="floor-two"]');
  await page.click('[data-hx-filter-view="Mer"]');
  await page.click('[data-action="hx-filter-modal-apply"]');
  await page.waitForFunction(() => !document.querySelector('.kiwi-backdrop'));
  await page.waitForSelector('.hx-room-workspace');
  check(await page.$$eval('[data-hx-room-card]', (x) => x.length) === 10, 'combined floors 1+2 and sea-view filter shows matching rooms');

  await page.click('[data-action="hx-room-filter-reset"]');
  const resetRoomCount = await page.$$eval('[data-hx-room-card]', (x) => x.length);
  check(resetRoomCount === 20, `filter reset restores all 20 visible rooms (actual ${resetRoomCount})`);
  await page.click('[data-action="hx-room-select-toggle"]');
  const selectionModeCount = await page.$$eval('.hx-room.selection-mode', (x) => x.length);
  check(selectionModeCount === 20, `selection mode marks every room card (actual ${selectionModeCount})`);
  check(await page.$$eval('.hx-room.selection-mode .hx-room-edit', (x) => x.length) === 0, 'selection mode hides edit pencils');
  check(await page.$$eval('.hx-room-select-cb', (x) => x.every((label) => label.getBoundingClientRect().width >= 44 && label.getBoundingClientRect().height >= 44)), 'selection checkboxes have 44px touch targets');
  await page.focus('[data-hx-room-card]');
  await page.keyboard.press('Space');
  check(await page.$$eval('.hx-room.selected', (x) => x.length) === 1, 'Space on a real room card toggles exactly one selection');
  await page.click('[data-action="hx-room-select-none"]');
  await page.click('.hx-room-select-cb');
  check(await page.$$eval('.hx-room.selected', (x) => x.length) === 1, 'one checkbox-label click selects exactly one room');
  await page.click('.hx-room-select-cb');
  check(await page.$$eval('.hx-room.selected', (x) => x.length) === 0, 'second checkbox-label click deselects without double toggling');
  await page.click('[data-action="hx-room-select-filtered"]');
  check(await page.$$eval('.hx-room.selected', (x) => x.length) === 20, 'bulk selection selects all 20 visible rooms');
  check(await page.$eval('.hx-room-bulk-bar', (bar) => bar.compareDocumentPosition(document.querySelector('[data-hx-floor-section]')) & Node.DOCUMENT_POSITION_FOLLOWING), 'bulk bar appears before floor sections');
  check(await page.$eval('.hx-room-bulk-bar', (bar) => getComputedStyle(bar).position === 'sticky' && getComputedStyle(bar).top !== 'auto'), 'bulk bar is sticky at the top');
  await page.screenshot({ path: path.join(screenshotDir, 'desktop-selected-bulk.png'), fullPage: true });

  await page.setViewport({ width: 900, height: 1100, deviceScaleFactor: 1 });
  await page.click('[data-action="hx-room-bulk-edit-open"]');
  await page.waitForSelector('.kiwi-backdrop.in .kiwi-modal [data-hx-bulk-view]');
  await page.select('[data-hx-bulk-view]', 'Jardin');
  await page.click('[data-action="hx-bulk-review"]');
  await page.waitForSelector('.kiwi-backdrop.in .hx-hotel-modal [data-action="hx-bulk-confirm"]');
  await waitForModalAnimation(page);
  check(await page.$eval('.kiwi-backdrop.in .hx-hotel-modal h3', (h) => /20/.test(h.textContent)), 'bulk review shows all 20 selected rooms');
  check(await page.$eval('.kiwi-backdrop.in .hx-hotel-modal', (modal) => getComputedStyle(modal).position === 'relative' && modal.getBoundingClientRect().width > 0), 'bulk review uses the shipped interactive modal layout');
  check(await page.$eval('.kiwi-backdrop.in .kiwi-modal', (modal) => { const r = modal.getBoundingClientRect(); return r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight; }), 'bulk review modal stays within the viewport');
  await page.screenshot({ path: path.join(screenshotDir, 'tablet-bulk-review.png'), fullPage: false });
  await page.click('[data-action="hx-bulk-confirm"]');
  await page.waitForFunction(() => !document.querySelector('[data-action="hx-bulk-confirm"]'));
  await page.waitForFunction(() => !document.querySelector('.kiwi-backdrop'));
  check(await page.$$eval('.hx-room.selected', (x) => x.length) === 0, 'successful bulk POST clears selection after canonical response');

  await page.setViewport({ width: 1440, height: 1000, deviceScaleFactor: 1 });
  await page.click('[data-action="hx-floors"]');
  await page.waitForSelector('.kiwi-modal.hx-floors-modal');
  await waitForModalAnimation(page);
  check(await page.$eval('.hx-floors-modal', (modal) => getComputedStyle(modal).position === 'relative' && modal.getBoundingClientRect().width > 0), 'floor manager uses the shipped interactive modal layout');
  await page.screenshot({ path: path.join(screenshotDir, 'desktop-floor-manager.png'), fullPage: false });
  await page.click('[data-action="hx-floor-new"]');
  await page.waitForSelector('.kiwi-backdrop.in [data-hx-floor-name]');
  await waitForModalAnimation(page);
  check(await page.$eval('.kiwi-backdrop.in .hx-hotel-modal', (modal) => getComputedStyle(modal).position === 'relative' && modal.getBoundingClientRect().width > 0), 'create-empty-section opens the real editor modal immediately');
  check(await page.$eval('.kiwi-backdrop.in .kiwi-modal', (modal) => { const r = modal.getBoundingClientRect(); return r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight; }), 'section editor modal stays within the viewport');
  await page.screenshot({ path: path.join(screenshotDir, 'desktop-floor-editor.png'), fullPage: false });
  await page.type('[data-hx-floor-name]', '3e étage');
  await page.click('[data-action="hx-floor-save"]');
  await page.waitForFunction(() => !document.querySelector('[data-hx-floor-name]'));
  await page.waitForFunction(() => [...document.querySelectorAll('.hx-floors-modal .hx-floor-manager-copy b')].some((node) => node.textContent === '3e étage'));
  check(await page.$eval('.hx-floors-modal', (modal) => modal.textContent.includes('3e étage')), 'floor editor saves a new section and refreshes the manager list');
  await page.screenshot({ path: path.join(screenshotDir, 'desktop-floor-manager-saved.png'), fullPage: false });
  await page.click('.hx-floors-modal .kiwi-modal-close');
  await page.waitForFunction(() => !document.querySelector('.kiwi-backdrop'));
  const toastClose = await page.$('.kiwi-toast .tx');
  if (toastClose) await toastClose.click();
  check(await page.$('.hx-floor-section') !== null, 'rack viewport screenshots are captured after all modals close');

  await page.screenshot({ path: path.join(screenshotDir, 'desktop.png'), fullPage: true });
  for (const [name, viewport, dir] of [
    ['tablet', { width: 900, height: 1100, deviceScaleFactor: 1 }, 'ltr'],
    ['mobile', { width: 390, height: 844, deviceScaleFactor: 1 }, 'ltr'],
    ['mobile-rtl', { width: 390, height: 844, deviceScaleFactor: 1 }, 'rtl'],
  ]) {
    await page.setViewport(viewport); await page.evaluate((value) => document.documentElement.dir = value, dir);
    await page.screenshot({ path: path.join(screenshotDir, `${name}.png`), fullPage: true });
    check(await page.$('.hx-room-workspace') !== null, `${name} layout renders`);
    check(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `${name} layout stays within viewport width`);
  }
  check(errors.length === 0, 'Chromium page reported no runtime errors');
  console.log(`Screenshots: ${screenshotDir}`);
} finally {
  await browser.close(); server.close();
}
