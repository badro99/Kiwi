#!/usr/bin/env node
/* « Installer l'app » ne couvre plus les gestes du service.
 *
 *   node tools/serveur-install-button-browser-test.mjs
 *
 * Café réel, 21 nov. 2026. Dans un onglet de navigateur (l'app pas encore
 * installée, le cas de la plupart des téléphones de salle), assets/
 * employee-pwa.js pose un bouton fixe en bas à droite, au-dessus de tout
 * (z-index 9998), sans fermeture. Sur la fiche d'une table il couvrait
 * « Annuler toute la table », sur la carte la flèche de « Voir la commande »,
 * et au-dessus d'une feuille ouverte ses boutons : le toucher du serveur
 * ouvrait la consigne d'installation. Il ne se montre plus que sur le plan
 * de salle et le profil. Vrais clics (souris CDP), vraies routes
 * (tools/serveur-live-harness.mjs), restaurant inventé. */
import assert from 'node:assert/strict';
import { harness, chromium } from './serveur-live-harness.mjs';
import { suite } from './browser-trace.mjs';

if (!chromium()) { console.log('○ skip: Chromium/puppeteer-core unavailable, browser assertions not executed'); process.exit(process.env.CI ? 1 : 0); }
const h = await harness();
const S = suite('serveur-install-button', { browser: h.browser });
let checks = 0;
const check = (yes, msg) => { assert.ok(yes, msg); checks++; console.log('  ✓ ' + msg); };
const shown = (page) => page.evaluate(() => { const b = document.getElementById('kiwi-employee-install'); return !!b && getComputedStyle(b).display !== 'none' && b.getBoundingClientRect().width > 0; });

try {
  await S.run('le bouton d’installation reste hors des gestes du service', async (t) => {
    const page = await h.openWaiter(t);
    await page.waitForSelector('#kiwi-employee-install', { timeout: 10000 });
    await h.sleep(200);
    check(await shown(page), 'plan de salle, onglet du navigateur : « Installer l’app » est proposé');

    t.step('la fiche de la table 4');
    await page.click('.table-card[data-table="4"]');
    await page.waitForSelector('#nt-confirm', { visible: true });
    await h.sleep(400);
    check(!await shown(page), 'feuille « nouvelle table » ouverte : le bouton se retire');
    await page.click('#nt-confirm');
    await page.waitForFunction(() => document.getElementById('screen-table')?.classList.contains('is-active'), { timeout: 10000 });
    await h.sleep(500);
    check(!await shown(page), 'fiche de table : le bouton ne couvre pas « Annuler toute la table »');

    t.step('la carte, un plat, « Voir la commande »');
    await page.click('[data-action="take-order"]');
    await page.waitForSelector('.menu-item[data-menu-id="it_msemen"]', { visible: true, timeout: 15000 });
    await h.sleep(300);
    await page.click('.menu-item[data-menu-id="it_msemen"]');
    await page.waitForSelector('#menu-cart-bar.is-visible', { visible: true });
    await h.sleep(300);
    check(!await shown(page), 'carte : le bouton ne couvre pas « Voir la commande »');
    /* Le bord droit de la barre, là où le bouton se posait. */
    const bar = await (await page.$('#menu-cart-bar')).boundingBox();
    await page.mouse.click(bar.x + bar.width - 24, bar.y + bar.height / 2);
    await page.waitForFunction(() => document.getElementById('screen-table')?.classList.contains('is-active'), { timeout: 3000 }).catch(() => {});
    check(await page.evaluate(() => document.getElementById('screen-table')?.classList.contains('is-active')), 'le bord droit de « Voir la commande » ouvre la table');

    t.step('retour au plan, puis le profil');
    await page.click('#td-back');
    await page.waitForFunction(() => document.getElementById('screen-main')?.classList.contains('is-active'), { timeout: 5000 });
    await h.sleep(300);
    check(await shown(page), 'de retour sur le plan : le bouton revient');
    await page.click('.bt-btn[data-tab="profil"]');
    await h.sleep(300);
    check(await shown(page), 'profil : le bouton est proposé');
    check(page.errors.length === 0, 'aucune erreur de script' + (page.errors.length ? ' : ' + page.errors.join(' | ') : ''));
  });
} finally {
  await h.close();
}
console.log(`\nserveur-install-button-browser-test: ${checks} checks passed`);
