/* Tickets · les commandes de la page se touchent du doigt sur un téléphone.
 *
 * r20 : pastilles de filtre à 32 px, boutons de classement à 28 px, boutons de
 * copie à 34 px. Chromium charge le vrai assets/tickets.css et mesure ce qui se
 * peint à 390 px (et en pointeur tactile) ; sur un bureau à pointeur fin, les
 * hauteurs compactes restent. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { suite } from './browser-trace.mjs';
const require = createRequire(new URL('../app/package.json', import.meta.url));
const puppeteer = require('puppeteer-core');
const bin = process.env.KIWI_CHROMIUM_BIN || ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/chromium', '/usr/bin/google-chrome'].find(fs.existsSync);
if (!bin) { console.error('Chromium unavailable'); process.exit(3); }
const css = fs.readFileSync('assets/tickets.css', 'utf8');
const html = `<!doctype html><html><head><style>:root{--n-300:#ccc;--n-600:#555;--n-700:#444;--paper:#f7f5f0;--paper-soft:#f1eee7;--ticket-line:#ddd;--riad:#053b2c}${css}</style></head><body>
<div class="filter-pills"><button class="filter-pill">Tous</button></div><button class="filter-reset">Réinitialiser</button>
<button class="classify-button">Classer</button><button class="copy-button">Copier</button>
<div class="classification-editor"><select><option>a</option></select><button class="classification-save">Enregistrer</button></div></body></html>`;
const browser = await puppeteer.launch({ executablePath: bin, headless: true, args: ['--no-sandbox'] });
const S = suite('tickets-touch-targets', { browser });
const sel = ['.filter-pill', '.filter-reset', '.classify-button', '.copy-button', '.classification-save', '.classification-editor select'];
async function heights(width) {
  const context = await browser.createBrowserContext();
  const page = await context.newPage(); await page.setViewport({ width, height: 800 }); await page.setContent(html);
  const out = await page.evaluate((sel) => sel.map((s) => [s, document.querySelector(s).getBoundingClientRect().height]), sel);
  await context.close(); return out;
}
await S.run('phone 390px: every ticket control is at least 44px', async () => {
  for (const [s, h] of await heights(390)) assert.ok(h >= 44, `${s} is ${h}px`);
});
await S.run('desktop 1280px: compact controls are unchanged (fine pointer)', async () => {
  const h = Object.fromEntries(await heights(1280));
  assert.ok(h['.filter-pill'] < 44 && h['.classify-button'] < 44, 'desktop keeps the compact filter and classify heights');
});
await browser.close();
await S.finish();
