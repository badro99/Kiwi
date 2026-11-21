#!/usr/bin/env node
// A photo of a carton label becomes a stock reception with the size grid
// already filled. On 21 Nov 2026 a real label (ART NO. 1986-10, KHAKI, 36 to 41,
// 12 pairs) only produced an error, and at best one line « 12 × carton ».
// The model route is stubbed with the structured reading the server returns;
// no model is reached. The demo boutique is synthetic: no merchant data.
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { harness, demoPage, sleep } from './surface-matrix-lib.mjs';
const h = await harness('agent-size-run');
const temp = await mkdtemp(path.join(os.tmpdir(), 'kiwi-agent-size-run-'));
const png = path.join(temp, 'carton.png');
await writeFile(png, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aT1sAAAAASUVORK5CYII=', 'base64'));
const RUN = [['36', 1], ['37', 2], ['38', 3], ['39', 3], ['40', 2], ['41', 1]];
const READING = {
  docType: 'boutique_product', categoryLabel: 'Étiquette de carton', confidence: 0.93, reviewNeeded: false,
  title: 'Carton 1986-10 KHAKI', summary: 'Étiquette de carton : 12 paires, pointures 36 à 41.',
  entities: { supplier: '', date: '', invoiceNumber: '', totalMad: 0, items: [], reference: '1986-10', color: 'KHAKI', packQty: 12,
    sizeRun: RUN.map(([size, qty]) => ({ size, qty })) },
  suggestedActions: [{ id: 'st-rec', type: 'stock-receive', label: 'Enregistrer la réception en stock', primary: true }],
};
const venue = { id: 'matrix-carton', name: 'Matrix Chaussures', fullDisplay: 'Matrix Chaussures', slug: 'matrix-carton',
  type: 'boutique', custom: true, location: '', siblings: '', status: '', txCount: 0, staffCount: 0, hours: '', methods: '', goal: 0 };
async function click(page, selector) {
  const el = await page.waitForSelector(selector, { visible: true, timeout: 20000 });
  await el.scrollIntoView(); await el.click();
}
const stock = (page) => page.evaluate(() => {
  const cat = window.KiwiBoutiqueCatalog;
  const p = cat.listProducts().find((x) => /1986-10/.test(x.name));
  return p ? { name: p.name, price: p.priceMAD, kind: p.kind, sizes: Object.fromEntries(cat.listVariants(p.id).map((v) => [v.size, v.stock])) } : null;
});
try {
  await h.S.run('a carton label fills the size grid of a stock reception · fr · phone', async (t) => {
    // coverage: surface=dashboard locale=fr viewport=phone
    const { ctx, page } = await demoPage(h, 'fr', 'phone', {
      kiwiCustomVenues: JSON.stringify([venue]), kiwiVenue: venue.id, kiwiOnboarded: '1',
    }, { 'POST /api/ai/vision-inspect': () => ({ status: 200, body: { ok: true, data: READING } }) });
    t.defer(() => ctx.close()); t.watch(page);
    t.step('open the demo boutique dashboard and its assistant');
    await page.goto(h.base + '/dashboard.html', { waitUntil: 'load', timeout: 60000 });
    await sleep(1500);
    const explore = await page.evaluateHandle(() => [...document.querySelectorAll('button,a')]
      .find((el) => /Explorer la d|Explore the d|استكشف/.test(el.textContent)) || null);
    if (explore.asElement()) await explore.asElement().click();
    await explore.dispose(); await page.keyboard.press('Escape');
    assert.equal(await page.evaluate(() => window.KiwiVenue.getVenueType()), 'boutique', 'the synthetic venue is a boutique');
    assert.equal(await stock(page), null, 'the reference is not in the catalogue yet');
    await page.waitForSelector('.kw-tab[data-kw-tab="ai"]');
    await click(page, '.kw-tab[data-kw-tab="ai"]');
    await page.waitForSelector('.fa-drawer .kv-attach', { visible: true });

    t.step('send the photo of the label: the card lists the six sizes');
    const choosing = page.waitForFileChooser();
    await click(page, '.fa-drawer .kv-attach');
    await (await choosing).accept([png]);
    await page.waitForSelector('.fa-drawer .kv-attach-preview', { visible: true });
    await click(page, '.fa-drawer [data-fa-send]');
    await page.waitForSelector('.fa-drawer [data-ksr-open]', { visible: true, timeout: 15000 });
    const card = await page.$$eval('.fa-drawer [data-ksr-size]', (rows) => rows.map((r) => [r.getAttribute('data-ksr-size'), r.querySelector('.qty').textContent]));
    assert.deepEqual(card, RUN.map(([size, qty]) => [size, '×' + qty]), 'the card shows each size with its quantity');
    const cardText = await page.$eval('.fa-drawer .kv-size-run', (el) => el.textContent);
    assert.match(cardText, /12 pièces/, 'the card totals the carton: ' + cardText);
    assert.match(cardText, /1986-10/, 'the card names the reference');
    assert.equal(await page.$('.fa-drawer [data-kv-action]'), null, 'no generic action that cannot fill a grid');

    t.step('tap the action: the reception opens with the grid prefilled');
    await click(page, '.fa-drawer [data-ksr-open]');
    await page.waitForSelector('[data-ksr-confirm]', { visible: true, timeout: 8000 });
    const form = await page.evaluate(() => ({
      name: document.querySelector('[data-ksr-name]').value, price: document.querySelector('[data-ksr-price]').value,
      color: document.querySelector('[data-ksr-color]').value, cartons: document.querySelector('[data-ksr-cartons]').value,
      grid: [...document.querySelectorAll('[data-ksr-qty]')].map((i) => [i.getAttribute('data-ksr-qty'), i.value]),
      sum: document.querySelector('[data-ksr-sum]').textContent,
      lang: document.documentElement.lang,
    }));
    assert.deepEqual(form.grid, RUN.map(([size, qty]) => [size, String(qty)]), 'six sizes, quantities from the label');
    assert.equal(form.name, '1986-10 Khaki', 'the name is proposed from the reference and the colour');
    assert.equal(form.color, 'Khaki'); assert.equal(form.cartons, '1');
    assert.equal(form.price, '', 'the box prints no price: none is invented');
    assert.match(form.sum, /Total reçu : 12 pièces/, 'French total: ' + form.sum);

    t.step('confirming without a price is refused and writes nothing');
    await click(page, '[data-ksr-confirm]');
    await page.waitForFunction(() => /prix de vente/.test(document.querySelector('[data-ksr-msg]')?.textContent || ''), { timeout: 5000 });
    assert.equal(await stock(page), null, 'nothing was written without a price');

    t.step('one photo, several cartons: the counter multiplies the grid');
    assert.equal(await page.$eval('[data-ksr-step="-1"]', (b) => b.disabled), true, 'fewer than one carton is not offered');
    await click(page, '[data-ksr-step="1"]'); await click(page, '[data-ksr-step="1"]');
    await page.waitForFunction(() => /36 pièces \(3 cartons\)/.test(document.querySelector('[data-ksr-sum]')?.textContent || ''), { timeout: 5000 });
    assert.equal(await page.$eval('[data-ksr-row="38"] [data-ksr-then]', (el) => el.textContent), '0 → 9', 'each size is multiplied: 3 × 3 pairs of 38');
    await click(page, '[data-ksr-step="-1"]');
    await page.waitForFunction(() => /24 pièces \(2 cartons\)/.test(document.querySelector('[data-ksr-sum]')?.textContent || ''), { timeout: 5000 });

    if (process.env.KIWI_SHOT) await page.screenshot({ path: process.env.KIWI_SHOT });

    t.step('two cartons at 450 MAD: the catalogue receives 24 pairs');
    await page.type('[data-ksr-price]', '450');
    await click(page, '[data-ksr-confirm]');
    await page.waitForFunction(() => !document.querySelector('[data-ksr-confirm]'), { timeout: 8000 });
    assert.deepEqual(await stock(page), { name: '1986-10 Khaki', price: 450, kind: 'pointure',
      sizes: { 36: 2, 37: 4, 38: 6, 39: 6, 40: 4, 41: 2 } }, 'the size grid is in stock');
    await page.waitForSelector('.kiwi-toast', { timeout: 5000 });
    assert.match(await page.$eval('.kiwi-toast', (el) => el.textContent), /24 pièces reçues/, 'the toast confirms what was received');
  });
} finally { await rm(temp, { recursive: true, force: true }); await h.close(); await h.S.finish(); }
