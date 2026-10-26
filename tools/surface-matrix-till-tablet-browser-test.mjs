#!/usr/bin/env node
import { forLocales } from './test-locales.mjs';
// Matrice tablette des caisses et complément opérationnel FR sur chaque appareil
// vendu. Les visites requises ouvrent les métiers, leurs commandes ou tiroirs
// réels dans une session démo isolée. La matrice existante conserve ses contrôles
// de langue, débordement et accessibilité, sans nouveau seuil.
import assert from 'node:assert/strict';
import { harness, openTill, verify, demoPage } from './surface-matrix-lib.mjs';

const h = await harness('surface-matrix-till-tablet');
const tills = { open: (t, surface, locale, viewport) => openTill(h, t, surface, locale, viewport) };
// Ces deux destinations sont ouvertes par les actions métier, sans lien latéral.
const drawers = { async open(t, surface, locale, viewport) {
  const { ctx, page } = await demoPage(h, locale, viewport);
  t.defer(() => ctx.close()); t.watch(page);
  await page.goto(h.base + '/dashboard.html', { waitUntil: 'load' });
  await page.waitForFunction(() => window.Kiwi?.handlers);
  await page.keyboard.press('Escape');
  await page.evaluate(id => window.Kiwi.handlers['nav-' + id](), surface.slice(10));
  const region = '.kiwi-drawer';
  await page.waitForSelector(region, { visible: true });
  assert(await page.$eval(region, el => el.innerText.trim().length > 40), 'contenu métier rendu');
  return { page, region };
}};
try {
  // Complément obligatoire FR, sans nouveau seuil accessibilité.
  await h.S.run('caisse-2027 · fr · tablet · requis', async (t) => {
    const { ctx, page } = await demoPage(h, 'fr', 'tablet', { 'kiwiSkin2027:till': '1' });
    t.defer(() => ctx.close()); t.watch(page);
    // coverage: surface=caisse-2027 locale=fr viewport=tablet
    await page.goto(h.base + '/kiwi-caisse.html', { waitUntil: 'load' });
    await page.waitForFunction(() => typeof doOpenService === 'function');
    await page.evaluate(() => doOpenService());
    await page.waitForFunction(() => document.body.classList.contains('is-unlocked'));
    await page.waitForSelector('k-menu-grid');
    assert(await page.$('k-bill'), 'ticket 2027 monté');
  });
  await h.S.run('caisse-spa · fr · desktop · requis', async (t) => {
    // coverage: surface=caisse-spa locale=fr viewport=desktop
    const cell = await tills.open(t, 'caisse-spa', 'fr', 'desktop');
    await cell.page.waitForFunction(sel => { const r = document.querySelector(sel)?.getBoundingClientRect(); return r && r.width > 0 && r.height > 0; }, {}, cell.region);
    assert(await cell.page.$(cell.region + ' button'), 'commandes de caisse présentes');
  });
  await h.S.run('caisse-spa · fr · tablet · requis', async (t) => {
    // coverage: surface=caisse-spa locale=fr viewport=tablet
    const cell = await tills.open(t, 'caisse-spa', 'fr', 'tablet');
    await cell.page.waitForFunction(sel => { const r = document.querySelector(sel)?.getBoundingClientRect(); return r && r.width > 0 && r.height > 0; }, {}, cell.region);
    assert(await cell.page.$(cell.region + ' button'), 'commandes de caisse présentes');
  });
  await h.S.run('caisse-spa · fr · phone · requis', async (t) => {
    // coverage: surface=caisse-spa locale=fr viewport=phone
    const cell = await tills.open(t, 'caisse-spa', 'fr', 'phone');
    await cell.page.waitForFunction(sel => { const r = document.querySelector(sel)?.getBoundingClientRect(); return r && r.width > 0 && r.height > 0; }, {}, cell.region);
    assert(await cell.page.$(cell.region + ' button'), 'commandes de caisse présentes');
  });
  await h.S.run('caisse-fastfood · fr · desktop · requis', async (t) => {
    // coverage: surface=caisse-fastfood locale=fr viewport=desktop
    const cell = await tills.open(t, 'caisse-fastfood', 'fr', 'desktop');
    await cell.page.waitForFunction(sel => { const r = document.querySelector(sel)?.getBoundingClientRect(); return r && r.width > 0 && r.height > 0; }, {}, cell.region);
    assert(await cell.page.$(cell.region + ' button'), 'commandes de caisse présentes');
  });
  await h.S.run('caisse-fastfood · fr · tablet · requis', async (t) => {
    // coverage: surface=caisse-fastfood locale=fr viewport=tablet
    const cell = await tills.open(t, 'caisse-fastfood', 'fr', 'tablet');
    await cell.page.waitForFunction(sel => { const r = document.querySelector(sel)?.getBoundingClientRect(); return r && r.width > 0 && r.height > 0; }, {}, cell.region);
    assert(await cell.page.$(cell.region + ' button'), 'commandes de caisse présentes');
  });
  await h.S.run('caisse-fastfood · fr · phone · requis', async (t) => {
    // coverage: surface=caisse-fastfood locale=fr viewport=phone
    const cell = await tills.open(t, 'caisse-fastfood', 'fr', 'phone');
    await cell.page.waitForFunction(sel => { const r = document.querySelector(sel)?.getBoundingClientRect(); return r && r.width > 0 && r.height > 0; }, {}, cell.region);
    assert(await cell.page.$(cell.region + ' button'), 'commandes de caisse présentes');
  });
  await h.S.run('caisse-boulangerie · fr · desktop · requis', async (t) => {
    // coverage: surface=caisse-boulangerie locale=fr viewport=desktop
    const cell = await tills.open(t, 'caisse-boulangerie', 'fr', 'desktop');
    await cell.page.waitForFunction(sel => { const r = document.querySelector(sel)?.getBoundingClientRect(); return r && r.width > 0 && r.height > 0; }, {}, cell.region);
    assert(await cell.page.$(cell.region + ' button'), 'commandes de caisse présentes');
  });
  await h.S.run('caisse-boulangerie · fr · tablet · requis', async (t) => {
    // coverage: surface=caisse-boulangerie locale=fr viewport=tablet
    const cell = await tills.open(t, 'caisse-boulangerie', 'fr', 'tablet');
    await cell.page.waitForFunction(sel => { const r = document.querySelector(sel)?.getBoundingClientRect(); return r && r.width > 0 && r.height > 0; }, {}, cell.region);
    assert(await cell.page.$(cell.region + ' button'), 'commandes de caisse présentes');
  });
  await h.S.run('caisse-boulangerie · fr · phone · requis', async (t) => {
    // coverage: surface=caisse-boulangerie locale=fr viewport=phone
    const cell = await tills.open(t, 'caisse-boulangerie', 'fr', 'phone');
    await cell.page.waitForFunction(sel => { const r = document.querySelector(sel)?.getBoundingClientRect(); return r && r.width > 0 && r.height > 0; }, {}, cell.region);
    assert(await cell.page.$(cell.region + ' button'), 'commandes de caisse présentes');
  });
  await h.S.run('caisse-pizzeria · fr · desktop · requis', async (t) => {
    // coverage: surface=caisse-pizzeria locale=fr viewport=desktop
    const cell = await tills.open(t, 'caisse-pizzeria', 'fr', 'desktop');
    await cell.page.waitForFunction(sel => { const r = document.querySelector(sel)?.getBoundingClientRect(); return r && r.width > 0 && r.height > 0; }, {}, cell.region);
    assert(await cell.page.$(cell.region + ' button'), 'commandes de caisse présentes');
  });
  await h.S.run('caisse-pizzeria · fr · tablet · requis', async (t) => {
    // coverage: surface=caisse-pizzeria locale=fr viewport=tablet
    const cell = await tills.open(t, 'caisse-pizzeria', 'fr', 'tablet');
    await cell.page.waitForFunction(sel => { const r = document.querySelector(sel)?.getBoundingClientRect(); return r && r.width > 0 && r.height > 0; }, {}, cell.region);
    assert(await cell.page.$(cell.region + ' button'), 'commandes de caisse présentes');
  });
  await h.S.run('caisse-pizzeria · fr · phone · requis', async (t) => {
    // coverage: surface=caisse-pizzeria locale=fr viewport=phone
    const cell = await tills.open(t, 'caisse-pizzeria', 'fr', 'phone');
    await cell.page.waitForFunction(sel => { const r = document.querySelector(sel)?.getBoundingClientRect(); return r && r.width > 0 && r.height > 0; }, {}, cell.region);
    assert(await cell.page.$(cell.region + ' button'), 'commandes de caisse présentes');
  });
  await h.S.run('caisse-traiteur · fr · desktop · requis', async (t) => {
    // coverage: surface=caisse-traiteur locale=fr viewport=desktop
    const cell = await tills.open(t, 'caisse-traiteur', 'fr', 'desktop');
    await cell.page.waitForFunction(sel => { const r = document.querySelector(sel)?.getBoundingClientRect(); return r && r.width > 0 && r.height > 0; }, {}, cell.region);
    assert(await cell.page.$(cell.region + ' button'), 'commandes de caisse présentes');
  });
  await h.S.run('caisse-traiteur · fr · tablet · requis', async (t) => {
    // coverage: surface=caisse-traiteur locale=fr viewport=tablet
    const cell = await tills.open(t, 'caisse-traiteur', 'fr', 'tablet');
    await cell.page.waitForFunction(sel => { const r = document.querySelector(sel)?.getBoundingClientRect(); return r && r.width > 0 && r.height > 0; }, {}, cell.region);
    assert(await cell.page.$(cell.region + ' button'), 'commandes de caisse présentes');
  });
  await h.S.run('caisse-foodtruck · fr · desktop · requis', async (t) => {
    // coverage: surface=caisse-foodtruck locale=fr viewport=desktop
    const cell = await tills.open(t, 'caisse-foodtruck', 'fr', 'desktop');
    await cell.page.waitForFunction(sel => { const r = document.querySelector(sel)?.getBoundingClientRect(); return r && r.width > 0 && r.height > 0; }, {}, cell.region);
    assert(await cell.page.$(cell.region + ' button'), 'commandes de caisse présentes');
  });
  await h.S.run('caisse-foodtruck · fr · tablet · requis', async (t) => {
    // coverage: surface=caisse-foodtruck locale=fr viewport=tablet
    const cell = await tills.open(t, 'caisse-foodtruck', 'fr', 'tablet');
    await cell.page.waitForFunction(sel => { const r = document.querySelector(sel)?.getBoundingClientRect(); return r && r.width > 0 && r.height > 0; }, {}, cell.region);
    assert(await cell.page.$(cell.region + ' button'), 'commandes de caisse présentes');
  });
  await h.S.run('caisse-foodtruck · fr · phone · requis', async (t) => {
    // coverage: surface=caisse-foodtruck locale=fr viewport=phone
    const cell = await tills.open(t, 'caisse-foodtruck', 'fr', 'phone');
    await cell.page.waitForFunction(sel => { const r = document.querySelector(sel)?.getBoundingClientRect(); return r && r.width > 0 && r.height > 0; }, {}, cell.region);
    assert(await cell.page.$(cell.region + ' button'), 'commandes de caisse présentes');
  });
  await h.S.run('caisse-epicerie · fr · tablet · requis', async (t) => {
    // coverage: surface=caisse-epicerie locale=fr viewport=tablet
    const cell = await tills.open(t, 'caisse-epicerie', 'fr', 'tablet');
    await cell.page.waitForFunction(sel => { const r = document.querySelector(sel)?.getBoundingClientRect(); return r && r.width > 0 && r.height > 0; }, {}, cell.region);
    assert(await cell.page.$(cell.region + ' button'), 'commandes de caisse présentes');
  });
  await h.S.run('caisse-epicerie · fr · phone · requis', async (t) => {
    // coverage: surface=caisse-epicerie locale=fr viewport=phone
    const cell = await tills.open(t, 'caisse-epicerie', 'fr', 'phone');
    await cell.page.waitForFunction(sel => { const r = document.querySelector(sel)?.getBoundingClientRect(); return r && r.width > 0 && r.height > 0; }, {}, cell.region);
    assert(await cell.page.$(cell.region + ' button'), 'commandes de caisse présentes');
  });
  await h.S.run('caisse-pharmacie · fr · desktop · requis', async (t) => {
    // coverage: surface=caisse-pharmacie locale=fr viewport=desktop
    const cell = await tills.open(t, 'caisse-pharmacie', 'fr', 'desktop');
    await cell.page.waitForFunction(sel => { const r = document.querySelector(sel)?.getBoundingClientRect(); return r && r.width > 0 && r.height > 0; }, {}, cell.region);
    assert(await cell.page.$(cell.region + ' button'), 'commandes de caisse présentes');
  });
  await h.S.run('caisse-pharmacie · fr · tablet · requis', async (t) => {
    // coverage: surface=caisse-pharmacie locale=fr viewport=tablet
    const cell = await tills.open(t, 'caisse-pharmacie', 'fr', 'tablet');
    await cell.page.waitForFunction(sel => { const r = document.querySelector(sel)?.getBoundingClientRect(); return r && r.width > 0 && r.height > 0; }, {}, cell.region);
    assert(await cell.page.$(cell.region + ' button'), 'commandes de caisse présentes');
  });
  await h.S.run('caisse-librairie · fr · desktop · requis', async (t) => {
    // coverage: surface=caisse-librairie locale=fr viewport=desktop
    const cell = await tills.open(t, 'caisse-librairie', 'fr', 'desktop');
    await cell.page.waitForFunction(sel => { const r = document.querySelector(sel)?.getBoundingClientRect(); return r && r.width > 0 && r.height > 0; }, {}, cell.region);
    assert(await cell.page.$(cell.region + ' button'), 'commandes de caisse présentes');
  });
  await h.S.run('caisse-librairie · fr · tablet · requis', async (t) => {
    // coverage: surface=caisse-librairie locale=fr viewport=tablet
    const cell = await tills.open(t, 'caisse-librairie', 'fr', 'tablet');
    await cell.page.waitForFunction(sel => { const r = document.querySelector(sel)?.getBoundingClientRect(); return r && r.width > 0 && r.height > 0; }, {}, cell.region);
    assert(await cell.page.$(cell.region + ' button'), 'commandes de caisse présentes');
  });
  await h.S.run('caisse-fleuriste · fr · desktop · requis', async (t) => {
    // coverage: surface=caisse-fleuriste locale=fr viewport=desktop
    const cell = await tills.open(t, 'caisse-fleuriste', 'fr', 'desktop');
    await cell.page.waitForFunction(sel => { const r = document.querySelector(sel)?.getBoundingClientRect(); return r && r.width > 0 && r.height > 0; }, {}, cell.region);
    assert(await cell.page.$(cell.region + ' button'), 'commandes de caisse présentes');
  });
  await h.S.run('caisse-fleuriste · fr · tablet · requis', async (t) => {
    // coverage: surface=caisse-fleuriste locale=fr viewport=tablet
    const cell = await tills.open(t, 'caisse-fleuriste', 'fr', 'tablet');
    await cell.page.waitForFunction(sel => { const r = document.querySelector(sel)?.getBoundingClientRect(); return r && r.width > 0 && r.height > 0; }, {}, cell.region);
    assert(await cell.page.$(cell.region + ' button'), 'commandes de caisse présentes');
  });
  await h.S.run('caisse-coiffure · fr · desktop · requis', async (t) => {
    // coverage: surface=caisse-coiffure locale=fr viewport=desktop
    const cell = await tills.open(t, 'caisse-coiffure', 'fr', 'desktop');
    await cell.page.waitForFunction(sel => { const r = document.querySelector(sel)?.getBoundingClientRect(); return r && r.width > 0 && r.height > 0; }, {}, cell.region);
    assert(await cell.page.$(cell.region + ' button'), 'commandes de caisse présentes');
  });
  await h.S.run('caisse-coiffure · fr · tablet · requis', async (t) => {
    // coverage: surface=caisse-coiffure locale=fr viewport=tablet
    const cell = await tills.open(t, 'caisse-coiffure', 'fr', 'tablet');
    await cell.page.waitForFunction(sel => { const r = document.querySelector(sel)?.getBoundingClientRect(); return r && r.width > 0 && r.height > 0; }, {}, cell.region);
    assert(await cell.page.$(cell.region + ' button'), 'commandes de caisse présentes');
  });
  await h.S.run('caisse-coiffure · fr · phone · requis', async (t) => {
    // coverage: surface=caisse-coiffure locale=fr viewport=phone
    const cell = await tills.open(t, 'caisse-coiffure', 'fr', 'phone');
    await cell.page.waitForFunction(sel => { const r = document.querySelector(sel)?.getBoundingClientRect(); return r && r.width > 0 && r.height > 0; }, {}, cell.region);
    assert(await cell.page.$(cell.region + ' button'), 'commandes de caisse présentes');
  });
  await h.S.run('caisse-gym · fr · desktop · requis', async (t) => {
    // coverage: surface=caisse-gym locale=fr viewport=desktop
    const cell = await tills.open(t, 'caisse-gym', 'fr', 'desktop');
    await cell.page.waitForFunction(sel => { const r = document.querySelector(sel)?.getBoundingClientRect(); return r && r.width > 0 && r.height > 0; }, {}, cell.region);
    assert(await cell.page.$(cell.region + ' button'), 'commandes de caisse présentes');
  });
  await h.S.run('caisse-gym · fr · tablet · requis', async (t) => {
    // coverage: surface=caisse-gym locale=fr viewport=tablet
    const cell = await tills.open(t, 'caisse-gym', 'fr', 'tablet');
    await cell.page.waitForFunction(sel => { const r = document.querySelector(sel)?.getBoundingClientRect(); return r && r.width > 0 && r.height > 0; }, {}, cell.region);
    assert(await cell.page.$(cell.region + ' button'), 'commandes de caisse présentes');
  });
  await h.S.run('caisse-autre · fr · desktop · requis', async (t) => {
    // coverage: surface=caisse-autre locale=fr viewport=desktop
    const cell = await tills.open(t, 'caisse-autre', 'fr', 'desktop');
    await cell.page.waitForFunction(sel => { const r = document.querySelector(sel)?.getBoundingClientRect(); return r && r.width > 0 && r.height > 0; }, {}, cell.region);
    assert(await cell.page.$(cell.region + ' button'), 'commandes de caisse présentes');
  });
  await h.S.run('caisse-autre · fr · tablet · requis', async (t) => {
    // coverage: surface=caisse-autre locale=fr viewport=tablet
    const cell = await tills.open(t, 'caisse-autre', 'fr', 'tablet');
    await cell.page.waitForFunction(sel => { const r = document.querySelector(sel)?.getBoundingClientRect(); return r && r.width > 0 && r.height > 0; }, {}, cell.region);
    assert(await cell.page.$(cell.region + ' button'), 'commandes de caisse présentes');
  });
  await h.S.run('caisse-autre · fr · phone · requis', async (t) => {
    // coverage: surface=caisse-autre locale=fr viewport=phone
    const cell = await tills.open(t, 'caisse-autre', 'fr', 'phone');
    await cell.page.waitForFunction(sel => { const r = document.querySelector(sel)?.getBoundingClientRect(); return r && r.width > 0 && r.height > 0; }, {}, cell.region);
    assert(await cell.page.$(cell.region + ' button'), 'commandes de caisse présentes');
  });
  await h.S.run('caisse-maison · fr · desktop · requis', async (t) => {
    // coverage: surface=caisse-maison locale=fr viewport=desktop
    const cell = await tills.open(t, 'caisse-maison', 'fr', 'desktop');
    await cell.page.waitForFunction(sel => { const r = document.querySelector(sel)?.getBoundingClientRect(); return r && r.width > 0 && r.height > 0; }, {}, cell.region);
    assert(await cell.page.$(cell.region + ' button'), 'commandes de caisse présentes');
  });
  await h.S.run('caisse-maison · fr · tablet · requis', async (t) => {
    // coverage: surface=caisse-maison locale=fr viewport=tablet
    const cell = await tills.open(t, 'caisse-maison', 'fr', 'tablet');
    await cell.page.waitForFunction(sel => { const r = document.querySelector(sel)?.getBoundingClientRect(); return r && r.width > 0 && r.height > 0; }, {}, cell.region);
    assert(await cell.page.$(cell.region + ' button'), 'commandes de caisse présentes');
  });
  await h.S.run('caisse-maison · fr · phone · requis', async (t) => {
    // coverage: surface=caisse-maison locale=fr viewport=phone
    const cell = await tills.open(t, 'caisse-maison', 'fr', 'phone');
    await cell.page.waitForFunction(sel => { const r = document.querySelector(sel)?.getBoundingClientRect(); return r && r.width > 0 && r.height > 0; }, {}, cell.region);
    assert(await cell.page.$(cell.region + ' button'), 'commandes de caisse présentes');
  });
  await h.S.run('dashboard-kds · fr · desktop · requis', async (t) => {
    // coverage: surface=dashboard-kds locale=fr viewport=desktop
    const cell = await drawers.open(t, 'dashboard-kds', 'fr', 'desktop');
    assert(await cell.page.$(cell.region), 'destination ouverte');
  });
  await h.S.run('dashboard-kds · fr · tablet · requis', async (t) => {
    // coverage: surface=dashboard-kds locale=fr viewport=tablet
    const cell = await drawers.open(t, 'dashboard-kds', 'fr', 'tablet');
    assert(await cell.page.$(cell.region), 'destination ouverte');
  });
  await h.S.run('dashboard-kds · fr · phone · requis', async (t) => {
    // coverage: surface=dashboard-kds locale=fr viewport=phone
    const cell = await drawers.open(t, 'dashboard-kds', 'fr', 'phone');
    assert(await cell.page.$(cell.region), 'destination ouverte');
  });
  await h.S.run('dashboard-reglements · fr · desktop · requis', async (t) => {
    // coverage: surface=dashboard-reglements locale=fr viewport=desktop
    const cell = await drawers.open(t, 'dashboard-reglements', 'fr', 'desktop');
    assert(await cell.page.$(cell.region), 'destination ouverte');
  });
  await h.S.run('dashboard-reglements · fr · tablet · requis', async (t) => {
    // coverage: surface=dashboard-reglements locale=fr viewport=tablet
    const cell = await drawers.open(t, 'dashboard-reglements', 'fr', 'tablet');
    assert(await cell.page.$(cell.region), 'destination ouverte');
  });
  await h.S.run('dashboard-reglements · fr · phone · requis', async (t) => {
    // coverage: surface=dashboard-reglements locale=fr viewport=phone
    const cell = await drawers.open(t, 'dashboard-reglements', 'fr', 'phone');
    assert(await cell.page.$(cell.region), 'destination ouverte');
  });
  await h.S.run('team-entry · fr · tablet · requis', async (t) => {
    const { ctx, page } = await demoPage(h, 'fr', 'tablet', { 'kiwiSkin2027:till': '1' });
    t.defer(() => ctx.close()); t.watch(page);
    // coverage: surface=team-entry locale=fr viewport=tablet
    await page.goto(h.base + '/kiwi-serveur.html', { waitUntil: 'load' });
    await page.waitForFunction(() => document.documentElement.lang === 'fr' && document.body.innerText.trim().length > 40);
    assert(await page.$('input'), 'saisie de connexion disponible');
  });
  await h.S.run('kitchen-entry · fr · desktop · requis', async (t) => {
    const { ctx, page } = await demoPage(h, 'fr', 'desktop', { 'kiwiSkin2027:till': '1' });
    t.defer(() => ctx.close()); t.watch(page);
    // coverage: surface=kitchen-entry locale=fr viewport=desktop
    await page.goto(h.base + '/kiwi-cuisine.html', { waitUntil: 'load' });
    await page.waitForSelector('#lang', { visible: true });
    assert.equal(await page.$eval('#lang', el => el.textContent.trim()), 'FR');
  });

  for (const locale of forLocales(['fr', 'en', 'ar'])) {
    await h.S.run(`caisse-restaurant · ${locale} · tablet`, async (t) => {
      // coverage: surface=caisse-restaurant locale=fr viewport=tablet
      // coverage: surface=caisse-restaurant locale=en viewport=tablet
      // coverage: surface=caisse-restaurant locale=ar viewport=tablet
      const cell = await tills.open(t, 'caisse-restaurant', locale, 'tablet');
      await verify(h, t, cell, `matrix-caisse-restaurant-${locale}-tablet`, locale);
    });
    await h.S.run(`caisse-boutique · ${locale} · tablet`, async (t) => {
      // coverage: surface=caisse-boutique locale=fr viewport=tablet
      // coverage: surface=caisse-boutique locale=en viewport=tablet
      // coverage: surface=caisse-boutique locale=ar viewport=tablet
      const cell = await tills.open(t, 'caisse-boutique', locale, 'tablet');
      await verify(h, t, cell, `matrix-caisse-boutique-${locale}-tablet`, locale);
    });
    await h.S.run(`caisse-pressing · ${locale} · tablet`, async (t) => {
      // coverage: surface=caisse-pressing locale=fr viewport=tablet
      // coverage: surface=caisse-pressing locale=en viewport=tablet
      // coverage: surface=caisse-pressing locale=ar viewport=tablet
      const cell = await tills.open(t, 'caisse-pressing', locale, 'tablet');
      await verify(h, t, cell, `matrix-caisse-pressing-${locale}-tablet`, locale);
    });
    await h.S.run(`caisse-hotel · ${locale} · tablet`, async (t) => {
      // coverage: surface=caisse-hotel locale=fr viewport=tablet
      // coverage: surface=caisse-hotel locale=en viewport=tablet
      // coverage: surface=caisse-hotel locale=ar viewport=tablet
      const cell = await tills.open(t, 'caisse-hotel', locale, 'tablet');
      await verify(h, t, cell, `matrix-caisse-hotel-${locale}-tablet`, locale);
    });
    await h.S.run(`credit-book · ${locale} · tablet`, async (t) => {
      // coverage: surface=credit-book locale=fr viewport=tablet
      // coverage: surface=credit-book locale=en viewport=tablet
      // coverage: surface=credit-book locale=ar viewport=tablet
      const cell = await tills.open(t, 'credit-book', locale, 'tablet');
      await verify(h, t, cell, `matrix-credit-book-${locale}-tablet`, locale);
    });
  }
} finally {
  await h.close();
  await h.S.finish();
}
