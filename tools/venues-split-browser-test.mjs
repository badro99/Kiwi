#!/usr/bin/env node
/* Vrai tableau de bord, démo et opérateur synthétique. Aucun service distant. */
import assert from 'node:assert/strict';
import { LOCALES } from './test-locales.mjs';
import { harness, demoPage, realPage } from './surface-matrix-lib.mjs';
const h = await harness('venues-split');
try {
  for (const lang of LOCALES) for (const operator of [false, true]) await h.S.run(`${lang} · ${operator ? 'opérateur' : 'démo'}`, async t => {
    const slug = 'commerce-synthetique';
    const routes = {
      'GET /api/me': { authenticated: true, operator: true, slug, business: 'Commerce synthétique', type: 'boutique', onboarded: true },
      'GET /api/config': { type: 'boutique', plan: 'ultra', features: {}, pins: [] },
      'GET /api/admin/clients': { clients: [] },
      'GET /api/sales': { merchant: slug, sales: [], cursor: 0 },
      'GET /api/store': { data: {} },
      'GET /api/stores': { stores: [] },
    };
    const { page, ctx } = operator
      ? await realPage(h, lang, 'desktop', routes)
      : await demoPage(h, lang, 'desktop');
    t.defer(() => ctx.close()); t.watch(page);
    const errors = [];
    page.on('pageerror', e => { if (/venues(?:\/|\.js)|__kiwiVenueParts/.test(e.stack || e.message)) errors.push(e.message); });
    t.step('Charger le vrai tableau de bord avec un contexte neuf et sans service worker');
    await page.goto(h.base + '/dashboard.html' + (operator ? '?op=1&merchant=' + slug : ''), { waitUntil: 'load', timeout: 60000 });
    await page.waitForFunction(() => window.KiwiVenue && window.KiwiSales && window.KiwiRecipes);
    const resources = await page.evaluate(() => performance.getEntriesByType('resource').map(e => new URL(e.name).pathname));
    for (const file of ['/assets/venues/data.js', '/assets/venues/helpers.js', '/assets/venues.js']) assert.ok(resources.includes(file), file + ' réellement chargé');
    assert.deepEqual(errors, [], 'aucune erreur des parties ou du noyau');
    if (operator) {
      await page.waitForFunction(() => KiwiVenue.getVenue() === 'scoped' && KiwiVenue.slugOf() === 'commerce-synthetique');
      assert.equal(await page.evaluate(() => KiwiVenue.getVenueType()), 'boutique');
      assert.deepEqual(await page.evaluate(() => KiwiVenue.getMenuItems()), []);
      assert.deepEqual(await page.evaluate(() => KiwiSales.list('scoped')), []);
      await page.click('[data-action="venue-toggle"]');
      await page.waitForSelector('[data-venue-dropdown].open');
      const ids = await page.$$eval('[data-action="venue-pick"]', nodes => nodes.map(n => n.dataset.venue));
      assert.deepEqual(ids, ['scoped'], 'le sélecteur ne propose que le client consulté');
    } else {
      await page.evaluate(() => {
        const button = [...document.querySelectorAll('button,a')].find(e => /Explorer la d|Explore the d|استكشف/.test(e.textContent));
        button?.click();
      });
      await page.keyboard.press('Escape');
      await page.click('[data-action="venue-toggle"]');
      await page.waitForSelector('[data-venue-dropdown].open');
      await page.click('[data-action="venue-pick"][data-venue="maisonMansour"]');
      await page.waitForFunction(() => KiwiVenue.getVenue() === 'maisonMansour');
      assert.equal(await page.evaluate(() => KiwiVenue.getVenueType()), 'boutique');
      assert.ok(await page.evaluate(() => KiwiRecipes.listRecipes('cafeAtlas').length > 0));
    }
    assert.deepEqual(errors, []);
  });
} finally { await h.close(); await h.S.finish(); }
