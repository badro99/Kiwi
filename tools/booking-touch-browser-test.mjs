/* Booking · les commandes de réservation se touchent du doigt (r21).
 * Le stepper de personnes était à 36 px, les légendes de dates et de champs
 * à 10 px. Chromium charge le vrai assets/booking.css et mesure ce qui se peint. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { suite } from './browser-trace.mjs';
const require = createRequire(new URL('../app/package.json', import.meta.url));
const puppeteer = require('puppeteer-core');
const bin = process.env.KIWI_CHROMIUM_BIN || ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/chromium', '/usr/bin/google-chrome'].find(fs.existsSync);
if (!bin) { console.error('Chromium unavailable'); process.exit(3); }
const css = fs.readFileSync('assets/booking.css', 'utf8');
const html = `<!doctype html><html><head><style>${css}</style></head><body><main class="bk-panel">
<div class="bk-party"><span>Personnes</span><button id="minus">-</button><strong>2</strong><button id="plus">+</button></div>
<div class="bk-date-row"><button class="bk-date"><span>lun</span><strong>9</strong><small>nov</small></button></div>
<form class="bk-form"><label class="bk-field"><span>Nom complet</span><input></label></form>
<header class="bk-head"><span>ÉTAPE</span></header><div class="bk-summary"><div class="bk-summary-head">Récap</div></div>
<div class="bk-room-thumbs"><button id="thumb"></button></div></main></body></html>`;
const browser = await puppeteer.launch({ executablePath: bin, headless: true, args: ['--no-sandbox'] });
const S = suite('booking-touch', { browser });
const context = await browser.createBrowserContext();
const page = await context.newPage(); await page.setViewport({ width: 390, height: 800 }); await page.setContent(html);
await S.run('phone 390px: steppers and thumbnails are at least 44px', async () => {
  const m = await page.evaluate(() => ['#minus', '#plus', '#thumb'].map((s) => { const r = document.querySelector(s).getBoundingClientRect(); return [s, r.width, r.height]; }));
  for (const [s, w, h] of m) assert.ok(w >= 44 && h >= 44, `${s} is ${w}x${h}`);
});
await S.run('captions are at least 12px', async () => {
  const sizes = await page.evaluate(() => ['.bk-date span', '.bk-date small', '.bk-field span', '.bk-head span', '.bk-summary-head'].map((s) => [s, parseFloat(getComputedStyle(document.querySelector(s)).fontSize)]));
  for (const [s, px] of sizes) assert.ok(px >= 12, `${s} is ${px}px`);
});
await context.close(); await browser.close();
await S.finish();
