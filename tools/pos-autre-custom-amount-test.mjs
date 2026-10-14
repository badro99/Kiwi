#!/usr/bin/env node
/* Audit design-2026-10 · the "other trade" till (assets/pos-autre.js) could not
 * sell anything on day one: an empty catalogue, and its only pill just toasted
 * "manage in dashboard".
 *
 * The real module, stylesheet and caisse-lang.js run in a real browser page
 * (puppeteer-core), with a stub for the dispatcher and the sale ledger. We ring
 * a free amount, take payment, and check the sale that reaches the ledger, then
 * switch language.
 *   node tools/pos-autre-custom-amount-test.mjs
 */
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const ROOT = process.env.KIWI_ROOT || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const require = createRequire(path.join(ROOT, 'app/package.json'));
const puppeteer = require('puppeteer-core');
const binary = process.env.KIWI_CHROMIUM_BIN || ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/chromium', '/usr/bin/google-chrome'].find(fs.existsSync);
if (!binary) throw new Error('Chromium required');

let n = 0;
const ok = (name, cond, detail) => { if (cond) { n++; console.log('  ✓ ' + name); } else { console.log('  ✗ ' + name + (detail ? ' · ' + detail : '')); process.exitCode = 1; } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({ executablePath: binary, headless: true, args: ['--no-sandbox'] });
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1024, height: 768 });
  await page.setContent('<!doctype html><html><head><meta charset="utf-8"><style>:root{--paper:#F7F5F0;--ink:#0A0F0D;--atlas:#0B6E4F;--riad:#053B2C;--surface:#fff;--n-200:#ddd;--n-500:#666;--paper-soft:#f3f1ec}</style></head><body><div id="root" style="height:700px"></div></body></html>');
  await page.addStyleTag({ content: read('assets/pos-autre.css') });
  await page.evaluate(() => {
    window.__sales = []; window.__toasts = []; window.__locked = 0;
    window.KiwiCaisseToast = (m) => window.__toasts.push(m);
    window.KiwiPosSale = {
      record: (v, s) => { window.__sales.push([v, s]); return s; }, nextSeq: () => 7, stamp: (r) => r, today: () => [],
      totals: () => ({ total: 0, cash: 0, card: 0, count: 0 }),
    };
    window.KiwiPosDispatch = { register: (d) => { window.__def = d; }, lock: () => { window.__locked++; } };
  });
  await page.addScriptTag({ content: read('assets/caisse-lang.js') });
  await page.addScriptTag({ content: read('assets/pos-autre.js') });
  await page.evaluate(() => window.__def.mount(document.getElementById('root')));

  const text = (sel) => page.$eval(sel, (e) => e.textContent.trim());
  const count = (sel) => page.$$eval(sel, (e) => e.length);

  /* ── day one: empty catalogue, yet something to sell ── */
  ok('empty catalogue still shows a "Montant libre" tile', (await count('[data-ot-custom]')) === 1 && /Montant libre/.test(await text('[data-ot-custom]')));
  ok('the dashboard pointer for the catalogue is kept', /tableau de bord/.test(await text('.ot-empty')) && /tableau de bord/.test(await text('.ot-dashboard-only')));
  ok('pay buttons are off while the ticket is empty', await page.$$eval('[data-ot-pay]', (b) => b.every((x) => x.disabled)));

  /* ── invalid amounts add nothing ── */
  await page.click('[data-ot-custom]');
  ok('the tile opens a dialog titled "Montant libre"', (await count('.ot-modal[role="dialog"]')) === 1 && /Montant libre/.test(await text('.ot-modal h2')));
  for (const bad of ['', '0', '0,00', 'abc', '-5', '1.234', '12,5,5']) {
    await page.$eval('[data-ot-amount]', (i) => { i.value = ''; });
    if (bad) await page.type('[data-ot-amount]', bad);
    await page.click('[data-ot-confirm]');
    const shown = await page.$eval('.ot-err', (e) => !e.hidden);
    const lines = await count('.ot-line');
    if (!(shown && lines === 0 && (await count('.ot-modal')) === 1)) { ok(`"${bad}" is refused with a message and adds nothing`, false, `shown=${shown} lines=${lines}`); break; }
  }
  ok('zero, text, negatives and 3 decimals are all refused with a message', true);

  /* ── a real amount lands on the ticket ── */
  await page.$eval('[data-ot-amount]', (i) => { i.value = ''; });
  await page.type('[data-ot-amount]', '12,5');
  await page.type('[data-ot-desc]', 'Réparation');
  await page.click('[data-ot-confirm]');
  await sleep(50);
  ok('the dialog closes', (await count('.ot-modal')) === 0);
  ok('the line is on the ticket under the typed description', (await count('.ot-line')) === 1 && /Réparation/.test(await text('.ot-line')));
  ok('the total follows (12,5 MAD)', /12[.,]5/.test(await text('.ot-total strong')));
  ok('payment is now available', await page.$$eval('[data-ot-pay]', (b) => b.every((x) => !x.disabled)));

  /* a second amount, no description → default name; Enter submits */
  await page.click('[data-ot-custom]');
  await page.type('[data-ot-amount]', '7.25');
  await page.keyboard.press('Enter');
  await sleep(50);
  ok('Enter confirms; no description falls back to "Article libre"', (await count('.ot-line')) === 2 && /Article libre/.test((await page.$$eval('.ot-line', (l) => l[1].textContent))));
  ok('the total adds up to the cent (19,75)', /19[.,]75/.test(await text('.ot-total strong')));

  /* Escape closes without adding */
  await page.click('[data-ot-custom]');
  await page.type('[data-ot-amount]', '99');
  await page.keyboard.press('Escape');
  ok('Escape closes the dialog without adding the amount', (await count('.ot-modal')) === 0 && (await count('.ot-line')) === 2);

  /* ── take payment ── */
  await page.click('[data-ot-pay="especes"]');
  await sleep(50);
  const sale = await page.evaluate(() => window.__sales[0]);
  ok('cash payment records ONE sale on the "autre" ledger', sale && sale[0] === 'autre' && (await page.evaluate(() => window.__sales.length)) === 1);
  ok('the sale carries the exact total, the method and both lines',
    sale[1].total === 19.75 && sale[1].method === 'especes' && sale[1].lines.length === 2
    && sale[1].lines[0].name === 'Réparation' && sale[1].lines[0].total === 12.5 && sale[1].lines[1].total === 7.25);
  ok('the ticket is cleared after payment', (await count('.ot-line')) === 0);

  /* ── language switch and copy ── */
  await sleep(400); // caisse-lang grafts its picker shortly after mount
  ok('the rail carries the FR / EN / AR switch', (await count('.ot-lang .kcl [data-kcl]')) === 3);
  await page.click('.ot-lang [data-kcl="en"]');
  await sleep(150);
  ok('EN: tile, nav and empty state are in English',
    /Custom amount/.test(await text('[data-ot-custom]')) && /Take payment/.test(await text('[data-ot-view="sale"]')) && /Add your items in the dashboard/.test(await text('.ot-empty')));
  await page.click('[data-ot-custom]');
  await sleep(150);
  ok('EN: the dialog is translated', /Custom amount/.test(await text('.ot-modal h2')) && /Amount \(MAD\)/.test(await text('.ot-modal label')) && /Add to the sale/.test(await text('[data-ot-confirm]')));
  await page.click('[data-ot-confirm]');
  await sleep(100);
  ok('EN: the validation message is translated', /Enter an amount above zero/.test(await text('.ot-err')));
  await page.click('[data-ot-cancel]');
  await page.click('.ot-lang [data-kcl="ar"]');
  await sleep(150);
  ok('AR: the page goes right-to-left with the tile in Arabic', (await page.evaluate(() => document.documentElement.dir)) === 'rtl' && /مبلغ حر/.test(await text('[data-ot-custom]')));
  await page.click('.ot-lang [data-kcl="fr"]');
  await sleep(100);
  ok('FR is restored', /Montant libre/.test(await text('[data-ot-custom]')));

  /* ── the merchant's catalogue, read from the dashboard inventory ── */
  const page2 = await browser.newPage();
  await page2.setContent('<!doctype html><html><head><meta charset="utf-8"></head><body><div id="root"></div></body></html>');
  await page2.evaluate(() => {
    window.__sales = []; window.__sold = []; window.__used = [];
    window.KiwiCaisseToast = () => {};
    window.KiwiPosSale = { record: (v, s) => { window.__sales.push([v, s]); return s; }, nextSeq: () => 3, stamp: (r) => r, today: () => [], totals: () => ({ total: 0, cash: 0, card: 0, count: 0 }) };
    window.KiwiPosDispatch = { register: (d) => { window.__def = d; }, lock: () => {} };
    window.KiwiPlatform = { pairedMerchant: () => 'test-autre-shop' };
    window.KiwiBoutiqueCatalog = {
      use: (k) => window.__used.push(k),
      listProducts: () => [{ id: 'pr1', name: 'Atelier poterie', priceMAD: 150 }, { id: 'pr2', name: 'Bon cadeau', priceMAD: 0 }, { id: 'pr3', name: '', priceMAD: 20 }],
      subscribe: () => () => {},
    };
    window.KiwiPosWorkspaces = { catalog: { sell: (id, qty, ref) => { window.__sold.push([id, qty, ref]); return qty; } } };
  });
  await page2.addScriptTag({ content: read('assets/pos-autre.js') });
  await page2.evaluate(() => window.__def.mount(document.getElementById('root')));
  const tiles = await page2.$$eval('[data-ot-item]', (b) => b.map((x) => x.textContent.trim()));
  ok('the till reads the catalogue of the paired store', (await page2.evaluate(() => window.__used)).includes('test-autre-shop'));
  ok('a priced item from the dashboard is a tile; an unnamed or unpriced one is not', tiles.length === 1 && /Atelier poterie/.test(tiles[0]) && /150/.test(tiles[0]));
  ok('the unpriced item is counted, not sold at a guessed price', /Articles sans prix, pas encore en vente/.test(await page2.$eval('.ot-unpriced', (e) => e.textContent)) && /1/.test(await page2.$eval('.ot-unpriced b', (e) => e.textContent)));
  await page2.click('[data-ot-item]');
  await page2.click('[data-ot-pay="carte"]');
  await sleep(50);
  const s2 = await page2.evaluate(() => window.__sales[0] && window.__sales[0][1]);
  ok('the sale keeps the product id on its line', s2 && s2.total === 150 && s2.lines[0].itemId === 'pr1');
  const sold = await page2.evaluate(() => window.__sold);
  ok('the stock is drawn for that product, with the ticket number', sold.length === 1 && sold[0][0] === 'pr1' && sold[0][1] === 1 && sold[0][2] === s2.ref);
  const CL = read('assets/caisse-lang.js');
  ok('the unpriced note reads EN and AR', /'Articles sans prix, pas encore en vente': \['Items without a price, not on sale yet', 'منتجات بلا سعر، ليست للبيع بعد'\]/.test(CL));
} finally {
  await browser.close();
}
console.log(`\n${n} checks`);
