#!/usr/bin/env node
/* « Installer l'app » vit dans le profil, plus au-dessus des gestes du service.
 *
 *   node tools/serveur-install-button-browser-test.mjs
 *
 * Café réel, 21 nov. 2026. Dans un onglet de navigateur (l'app pas encore
 * installée, le cas de la plupart des téléphones de salle), assets/
 * employee-pwa.js posait un bouton fixe en bas à droite, au-dessus de tout
 * (z-index 9998), sans fermeture. Il couvrait « Annuler toute la table », la
 * flèche de « Voir la commande », les boutons d'une feuille ouverte et, sur
 * un 360 × 640, un avis et la dernière carte de table : le toucher du serveur
 * ouvrait la consigne d'installation. Il est maintenant un bouton du profil,
 * au-dessus de « Pointer le départ ». Vrais clics (souris CDP), vraies routes
 * (tools/serveur-live-harness.mjs), restaurant inventé. */
import assert from 'node:assert/strict';
import { harness, chromium } from './serveur-live-harness.mjs';
import { suite } from './browser-trace.mjs';

if (!chromium()) { console.log('○ skip: Chromium/puppeteer-core unavailable, browser assertions not executed'); process.exit(process.env.CI ? 1 : 0); }
const h = await harness();
const S = suite('serveur-install-button', { browser: h.browser });
let checks = 0;
const check = (yes, msg) => { assert.ok(yes, msg); checks++; console.log('  ✓ ' + msg); };
const shown = (page) => page.evaluate(() => { const b = document.getElementById('kiwi-employee-install'); if (!b) return false; const r = b.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < innerHeight; });
/* Ce qui est sous un point : le bouton ne doit jamais être ce que le doigt touche. */
const hitIsInstall = (page, x, y) => page.evaluate((px, py) => !!document.elementFromPoint(px, py)?.closest('#kiwi-employee-install'), x, y);

try {
  for (const [viewport, table] of [[{ width: 360, height: 640 }, '4'], [{ width: 390, height: 844 }, '5']]) {
    await S.run(`le bouton d’installation reste dans le profil (${viewport.width} × ${viewport.height})`, async (t) => {
      // coverage: surface=employee locale=fr viewport=phone
      const page = await h.openWaiter(t, { viewport });
      await page.waitForSelector('#kiwi-employee-install', { timeout: 10000 });
      check(!await shown(page), 'plan de salle : pas de bouton flottant');
      const card = await page.evaluate(() => { const c = [...document.querySelectorAll('.table-card')].pop(); const r = c.getBoundingClientRect(); return { x: r.right - 12, y: Math.min(r.bottom - 12, innerHeight - 90) }; });
      check(!await hitIsInstall(page, card.x, card.y), 'le coin de la dernière carte de table est à la carte');

      t.step(`la fiche de la table ${table}, puis la carte`);
      await h.tap(page, `.table-card[data-table="${table}"]`);
      await h.tap(page, '#nt-confirm');
      await page.waitForFunction(() => document.getElementById('screen-table')?.classList.contains('is-active'), { timeout: 10000 });
      check(!await shown(page), 'fiche de table : rien sur « Annuler toute la table »');
      await h.tap(page, '[data-action="take-order"]');
      await h.tap(page, '.menu-item[data-menu-id="it_msemen"]');
      await h.still(page, '#menu-cart-bar.is-visible');
      const bar = await (await page.$('#menu-cart-bar')).boundingBox();
      check(!await hitIsInstall(page, bar.x + bar.width - 24, bar.y + bar.height / 2), 'carte : le bord droit de « Voir la commande » est à la barre');
      await page.mouse.click(bar.x + bar.width - 24, bar.y + bar.height / 2);
      await page.waitForFunction(() => document.getElementById('screen-table')?.classList.contains('is-active'), { timeout: 3000 }).catch(() => {});
      check(await page.evaluate(() => document.getElementById('screen-table')?.classList.contains('is-active')), 'le bord droit de « Voir la commande » ouvre la table');

      t.step('le profil');
      await h.tap(page, '#td-back');
      await page.waitForFunction(() => document.getElementById('screen-main')?.classList.contains('is-active'), { timeout: 5000 });
      await h.tap(page, '.bt-btn[data-tab="profil"]');
      await page.evaluate(() => document.getElementById('kiwi-employee-install').scrollIntoView({ block: 'center' }));
      await h.still(page, '#kiwi-employee-install');
      const inProfile = await page.evaluate(() => { const b = document.getElementById('kiwi-employee-install'); const tabs = document.querySelector('.bottom-tabs')?.getBoundingClientRect(); const r = b.getBoundingClientRect();
        return { inside: !!b.closest('.tab-profil'), fixed: getComputedStyle(b).position === 'fixed', beforeClockout: b.nextElementSibling?.id === 'profil-clockout', clear: !tabs || r.bottom <= tabs.top || r.top >= tabs.bottom }; });
      check(inProfile.inside && !inProfile.fixed && inProfile.beforeClockout, `profil : un bouton du profil, au-dessus de « Pointer le départ » (${JSON.stringify(inProfile)})`);
      check(await shown(page) && inProfile.clear, 'il se voit sans couvrir la barre d’onglets');
      check(page.errors.length === 0, 'aucune erreur de script' + (page.errors.length ? ' : ' + page.errors.join(' | ') : ''));
    });
  }
} finally {
  await h.close();
}
console.log(`\nserveur-install-button-browser-test: ${checks} checks passed`);
