#!/usr/bin/env node
// Session et serveur synthétiques isolés, aucun service marchand appelé.
import assert from 'node:assert/strict';
import { randomInt } from 'node:crypto';
import { forLocales } from './test-locales.mjs';
import { harness, realPage, sleep } from './surface-matrix-lib.mjs';
const h = await harness('analysis-calculator');
const merchant = 'matrix-real';
async function click(page, selector) {
  await page.waitForSelector(selector, { visible: true, timeout: 15000 });
  await page.$eval(selector, el => el.scrollIntoView({ block: 'center', inline: 'center' }));
  // Attendre que la cible ne bouge plus (entrée animée des cartes, défilement
  // en cours) : un clic pendant le mouvement tombe à côté et rend le focus au corps.
  await page.waitForFunction(s => new Promise(done => {
    const el = document.querySelector(s); const a = el.getBoundingClientRect();
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const b = el.getBoundingClientRect(); done(Math.abs(a.x - b.x) < 0.5 && Math.abs(a.y - b.y) < 0.5);
    }));
  }), { timeout: 5000, polling: 50 }, selector);
  const point = await page.$eval(selector, el => {
    const r = el.getBoundingClientRect();
    const x = r.x + r.width / 2, y = r.y + r.height / 2;
    const hit = document.elementFromPoint(x, y);
    const ok = r.width > 0 && r.height > 0 && x >= 0 && x < innerWidth && y >= 0 && y < innerHeight && (hit === el || el.contains(hit));
    return ok ? { x, y } : null;
  });
  assert.ok(point, 'commande atteignable : ' + selector);
  // Clic réel au point vérifié : page.click refait son propre défilement.
  await page.mouse.click(point.x, point.y);
}
async function visibleText(page, selector, text) {
  await page.waitForFunction((s, txt) => [...document.querySelectorAll(s)].some((el) => {
    const r = el.getBoundingClientRect(), c = getComputedStyle(el);
    return el.textContent.includes(txt) && r.width > 0 && r.height > 0 &&
      c.visibility !== 'hidden' && Number(c.opacity) > 0;
  }), { timeout: 15000 }, selector, text);
  await page.$eval(selector, el => el.scrollIntoView({ block: 'center' }));
}
async function nav(page, selector) {
  await page.waitForSelector(selector, { timeout: 15000 });
  const id = selector.includes('clients-directory') ? 'act:clients-directory' : 'finance';
  const kitSelector = `#kit-side >>> [data-id="${id}"]`;
  const kit = await page.$(kitSelector);
  const box = kit && await kit.boundingBox();
  if (box && box.x >= 0 && box.x < (await page.viewport()).width) {
    await kit.click();
    return;
  }
  // Même entrée latérale que dashboardWalker sur téléphone ; les commandes
  // suivantes passent par des clics réels.
  await page.evaluate((sel) => document.querySelector(sel).click(), selector);
  await sleep(600);
}
// Code synthétique éphémère, saisi avec le clavier visuel, jamais affiché.
const OWNER = String(randomInt(1000, 10000));
async function unlock(page) {
  await page.waitForFunction(() => { const p = document.querySelector('[data-kiwi-lock] k-pin-pad'); return p && p.shadowRoot && p.shadowRoot.querySelector('[data-key="1"]'); }, { timeout: 30000 });
  for (const d of OWNER) {
    const key = await page.evaluateHandle((x) => document.querySelector('[data-kiwi-lock] k-pin-pad').shadowRoot.querySelector('[data-key="' + x + '"]'), d);
    const box = await key.asElement().boundingBox();
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await sleep(40);
  }
  await page.waitForFunction(() => { const l = document.querySelector('[data-kiwi-lock]'); return !l || l.classList.contains('is-unlocking') || getComputedStyle(l).display === 'none' || l.hidden; }, { timeout: 15000 });
  await sleep(2600); // accueil après déverrouillage
}

async function fill(page, field, value) {
  const selector = `[data-sfc-field="${field}"]`;
  await click(page, selector);
  // Effacement au clavier, caractère par caractère : Meta+A n'existe pas hors
  // Mac et le triple clic ne sélectionne rien sous émulation tactile.
  const length = await page.$eval(selector, el => String(el.value).length);
  await page.keyboard.press('End');
  for (let i = 0; i < length; i++) await page.keyboard.press('Backspace');
  assert.equal(await page.$eval(selector, el => el.value), '', 'champ vidé avant la saisie');
  await page.type(selector, value);
  assert.equal(await page.$eval(selector, el => document.activeElement === el), true, 'focus conservé');
}
async function open(page) {
  await page.goto(h.base + '/dashboard.html', { waitUntil: 'load', timeout: 60000 });
  await unlock(page);
  await page.waitForFunction(() => window.KiwiConfig?.features?.simple_food_cost === true && window.KiwiVenue?.getCurrentVenueData?.()?.slug === 'matrix-real');
  await nav(page, '[data-nav="finance"]');
  await click(page, '[data-fin-tab="cost"]');
  await click(page, '[data-sfc="open"][data-id="fc-test"]');
}
const errorState = { async open(page) {
  await visibleText(page, '[role="status"]', 'Enregistrement impossible. Votre saisie est gardée ici.');
} };
try {
  for (const locale of forLocales(['fr'])) for (const viewport of ['phone', 'tablet', 'desktop']) {
    await h.S.run(`calculateur · ${locale} · ${viewport}`, async t => {
      let attempts = 0, reads = 0;
      let sheet = { id: 'fc-test', name: 'TEST KIWI recette', kind: 'sheet', version: 1, data: {
        name: 'TEST KIWI recette', portions: 4, sellingPrice: 50, targetPct: 30,
        lines: [{ id: 'farine', name: 'Farine', type: 'food', packPrice: 40, packQty: 1, packUnit: 'kg', useQty: 250, useUnit: 'g', yieldPct: 100, priceDate: '2026-10-26' }]
      } };
      const routes = {
        'GET /api/me': { authenticated: true, onboarded: true, name: 'TEST KIWI', business: 'Matrix Kitchen', type: 'restaurant', stores: [{ merchant, name: 'Matrix Kitchen', type: 'restaurant' }] },
        'GET /api/config': { name: 'Matrix Kitchen', type: 'restaurant', plan: 'pro', planExplicit: true, features: { simple_food_cost: true }, pins: [{ name: 'TEST KIWI', role: 'owner' }] },
        'POST /api/pin/verify': req => ({ status: JSON.parse(req.postData()).pin === OWNER ? 200 : 401, body: { ok: true, staff: { id: 'st_owner', name: 'TEST KIWI', role: 'owner' }, merchant } }),
        'GET /api/foodcost': () => { reads++; return { body: { enabled: true, canEdit: true, sheets: [sheet] } }; },
        'POST /api/foodcost': req => {
          const body = JSON.parse(req.postData());
          assert.equal(body.action, 'save'); assert.equal(body.merchant, merchant);
          assert.equal(body.baseVersion, sheet.version);
          assert.equal(Number(body.sheet.lines[0].packPrice), attempts ? 40.32 : 40.16);
          if (++attempts === 2) return { status: 503, body: { error: 'synthetic-unavailable' } };
          sheet = { ...sheet, version: sheet.version + 1, data: body.sheet };
          return { body: { sheet } };
        },
      };
      const { ctx, page } = await realPage(h, locale, viewport, routes);
      t.defer(() => ctx.close()); t.watch(page);
      // coverage: surface=dashboard-analysis-calculator locale=fr viewport=phone
      // coverage: surface=dashboard-analysis-calculator locale=fr viewport=tablet
      // coverage: surface=dashboard-analysis-calculator locale=fr viewport=desktop
      await open(page);
      // Sur tablette, la page entière ne doit pas devenir plus large que l'écran.
      assert.equal(await page.evaluate(() => innerWidth === visualViewport.width && document.documentElement.scrollWidth <= innerWidth), true, 'la fiche ne déborde pas de l\'écran');
      const portion = () => page.$eval('[data-sfc-summary] > div:nth-child(4) b', el => el.textContent);
      assert.match(await portion(), /2,50 MAD/);
      t.step('modifier une ligne et enregistrer le coût à 2,51 MAD');
      await fill(page, 'packPrice', '40.16'); assert.match(await portion(), /2,51 MAD/);
      await click(page, '[data-sfc="save"]');
      await visibleText(page, '[role="status"]', 'Enregistrée · version 2');
      t.step('refus serveur unique, saisie conservée puis nouvel enregistrement');
      await fill(page, 'packPrice', '40.32'); assert.match(await portion(), /2,52 MAD/);
      await click(page, '[data-sfc="save"]');
      // coverage: surface=dashboard-analysis-calculator-error locale=fr viewport=phone
      // coverage: surface=dashboard-analysis-calculator-error locale=fr viewport=tablet
      // coverage: surface=dashboard-analysis-calculator-error locale=fr viewport=desktop
      await errorState.open(page);
      assert.equal(await page.$eval('[data-sfc-field="packPrice"]', el => el.value), '40.32');
      assert.match(await portion(), /2,52 MAD/);
      await click(page, '[data-sfc="save"]');
      await visibleText(page, '[role="status"]', 'Enregistrée · version 3');
      assert.equal(attempts, 3);
      t.step('recharger et retrouver la version enregistrée depuis le serveur');
      const beforeReload = reads;
      await open(page);
      assert.ok(reads > beforeReload, 'fiche relue depuis le serveur');
      assert.equal(await page.$eval('[data-sfc-field="packPrice"]', el => el.value), '40.32');
      assert.match(await portion(), /2,52 MAD/);
      assert.equal(attempts, 3);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    });
  }
} finally { await h.close(); await h.S.finish(); }
