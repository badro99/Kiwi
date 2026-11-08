#!/usr/bin/env node
/* Caisse boutique · un VRAI gros catalogue sur un téléphone (catalogue#A2).
 *
 * Les suites de propriétés du registre et de la fusion prouvent que les
 * chiffres sont justes ; elles ne disent pas si la caisse reste utilisable
 * quand le catalogue compte des milliers de déclinaisons. Ici, dans la vraie
 * caisse boutique (démo, Chromium, fenêtre de téléphone, rien ne part sur un
 * serveur), le catalogue est rempli par l'API réelle (addProduct, addVariant
 * dans un batch) : 400 articles × 10 tailles = 4 000 déclinaisons, puis :
 *   1 · l'écran Inventaire se peint dans un budget de temps, sans dépasser un
 *       budget de nœuds DOM, et sans défilement horizontal ;
 *   2 · la recherche d'un article répond dans un budget de temps ;
 *   3 · la fiche d'un article s'ouvre dans un budget de temps et reste à
 *       l'écran du téléphone.
 * Les budgets sont larges (une machine chargée ne doit pas rougir le gate) mais
 * finis : un rendu qui repasse sur toutes les déclinaisons à chaque frappe, ou
 * qui peint 4 000 lignes, les dépasse.
 */
import assert from 'node:assert/strict';
import { harness, demoPage, sleep } from './surface-matrix-lib.mjs';

const PRODUCTS = 400, SIZES = 10;
const BUDGET = { paintMs: 4000, nodes: 12000, searchMs: 3000, sheetMs: 2500 };
const h = await harness('boutique-large-catalog');
const check = (yes, msg) => { assert.ok(yes, msg); console.log('  ✓ ' + msg); };

await h.S.run('4 000 déclinaisons sur un téléphone', async (t) => {
  const { ctx, page } = await demoPage(h, 'fr', 'phone', { 'kiwiSkin2027:till': '0', 'kiwiSkin2027:dashboard': '0' });
  t.defer(() => ctx.close());
  t.watch(page);
  // coverage: surface=caisse-boutique locale=fr viewport=phone
  await page.goto(h.base + '/kiwi-caisse.html', { waitUntil: 'load', timeout: 60000 });
  await page.waitForFunction(() => window.KiwiPosDispatch && window.KiwiCaisseLang, { timeout: 30000 });
  await sleep(500);
  await page.evaluate(() => window.KiwiPosDispatch.unlockById('boutique'));
  await page.waitForSelector('#pos-boutique.is-on', { visible: true, timeout: 20000 });
  await sleep(1200);
  const coreUrl = await page.evaluate(() => performance.getEntriesByType('resource').map((e) => e.name).find((u) => /\/assets\/pos-boutique\.js\?/.test(u)));
  assert.ok(coreUrl, 'the till loaded its boutique module');

  t.step('fill the catalogue through the real API');
  const seeded = await page.evaluate((P, S) => {
    const cat = window.KiwiBoutiqueCatalog;
    const t0 = performance.now();
    cat.batch(() => {
      for (let i = 0; i < P; i++) {
        const p = cat.addProduct({ name: 'TEST KIWI Article ' + String(i).padStart(3, '0'), priceMAD: 100 + (i % 50), kind: 'taille' });
        for (let s = 0; s < S; s++) cat.addVariant({ productId: p.id, colorId: 'noir', colorLabel: 'Noir', size: String(34 + s), stock: 3 });
      }
    });
    return { variants: cat.stats().variants, ms: Math.round(performance.now() - t0) };
  }, PRODUCTS, SIZES);
  console.log(`  · seeded ${seeded.variants} variants in ${seeded.ms} ms`);
  check(seeded.variants >= PRODUCTS * SIZES, `le catalogue compte ${seeded.variants} déclinaisons`);

  t.step('paint the inventory');
  const paint = await page.evaluate(async (u) => {
    const m = await import(u);
    m.switchView('ventes');
    const t0 = performance.now();
    m.switchView('inventaire');
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const panel = document.querySelector('[data-bq-panel="inventaire"]');
    return { ms: Math.round(performance.now() - t0), nodes: panel.querySelectorAll('*').length, rows: panel.querySelectorAll('.bqi-row').length,
      overflow: document.documentElement.scrollWidth - innerWidth };
  }, coreUrl);
  console.log(`  · inventory paint ${paint.ms} ms, ${paint.nodes} nodes, ${paint.rows} rows`);
  check(paint.ms <= BUDGET.paintMs, `l'Inventaire se peint en ${paint.ms} ms (budget ${BUDGET.paintMs})`);
  check(paint.nodes <= BUDGET.nodes, `l'Inventaire pèse ${paint.nodes} nœuds (budget ${BUDGET.nodes})`);
  check(paint.overflow <= 1, 'pas de défilement horizontal sur le téléphone');

  t.step('search');
  const search = await page.evaluate(async () => {
    const input = document.querySelector('#bqi-scan');
    input.focus();
    const t0 = performance.now();
    input.value = 'Article 217';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    const shown = () => (document.querySelector('#bqi-sgst') || { textContent: '' }).textContent.includes('Article 217');
    while (!shown() && performance.now() - t0 < 6000) await new Promise((r) => setTimeout(r, 10));
    return { ms: Math.round(performance.now() - t0), found: shown() };
  });
  console.log(`  · search ${search.ms} ms`);
  check(search.found, 'la recherche trouve l’article parmi 4 000 déclinaisons');
  check(search.ms <= BUDGET.searchMs, `la recherche répond en ${search.ms} ms (budget ${BUDGET.searchMs})`);

  t.step('open one product sheet');
  const sheet = await page.evaluate(async () => {
    const row = document.querySelectorAll('[data-inv-open]')[200];
    const t0 = performance.now();
    row.click();
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const modal = document.querySelector('#bq-invmm');
    const box = modal.getBoundingClientRect();
    return { ms: Math.round(performance.now() - t0), nodes: modal.querySelectorAll('*').length, fits: box.width <= innerWidth + 1, sizes: modal.querySelectorAll('input').length };
  });
  console.log(`  · sheet ${sheet.ms} ms, ${sheet.nodes} nodes`);
  check(sheet.ms <= BUDGET.sheetMs, `la fiche s'ouvre en ${sheet.ms} ms (budget ${BUDGET.sheetMs})`);
  check(sheet.fits, 'la fiche tient dans la largeur du téléphone');
});

await h.close();
await h.S.finish();
