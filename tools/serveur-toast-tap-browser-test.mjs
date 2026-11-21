#!/usr/bin/env node
/* Un avis se lit, il ne prend pas le toucher.
 *
 *   node tools/serveur-toast-tap-browser-test.mjs
 *
 * Café réel, 21 nov. 2026. L'app serveur affiche ses avis (« Latte ajouté ·
 * Avoine », « Table 4 · commande envoyée », 2 à 6 s) juste au-dessus des
 * onglets, exactement où vivent « Voir la commande », « Lancer » et
 * « Encaisser ». En `pointer-events: all`, l'avis avalait le toucher : au
 * banc, l'élément sous le centre de « Voir la commande » était l'avis, et le
 * serveur restait sur la carte. Vrai clic (souris CDP), vraies routes
 * (tools/serveur-live-harness.mjs), restaurant inventé. */
import assert from 'node:assert/strict';
import { harness, chromium } from './serveur-live-harness.mjs';
import { suite } from './browser-trace.mjs';

if (!chromium()) { console.log('○ skip: Chromium/puppeteer-core unavailable, browser assertions not executed'); process.exit(process.env.CI ? 1 : 0); }
const h = await harness();
const S = suite('serveur-toast-tap', { browser: h.browser });
let checks = 0;
const check = (yes, msg) => { assert.ok(yes, msg); checks++; console.log('  ✓ ' + msg); };

try {
  await S.run('un avis ne prend pas le toucher de « Voir la commande »', async (t) => {
    const page = await h.openWaiter(t, { firstTable: '5' });
    await page.click('.table-card[data-table="5"]');
    await page.waitForSelector('#nt-confirm', { visible: true });
    await h.sleep(400);
    await page.click('#nt-confirm');
    await page.waitForFunction(() => { const b = document.querySelector('[data-action="take-order"]'); return b && b.offsetParent; }, { timeout: 15000 });
    await h.sleep(500);   // la feuille de table glisse (300 ms) : un clic plus tôt ferait défiler .app
    await page.click('[data-action="take-order"]');
    await page.waitForSelector('.menu-item[data-menu-id="it_latte"]', { visible: true, timeout: 15000 });
    t.step('un latte avec options : l’avis « Latte ajouté » s’affiche');
    await page.click('.menu-item[data-menu-id="it_latte"]');
    await page.waitForSelector('#opt-modal.is-open .opt-pill[data-opt-val="Avoine"]', { visible: true, timeout: 5000 });
    await h.sleep(350);
    await page.click('.opt-pill[data-opt-val="Avoine"]');
    await page.click('#opt-confirm');
    await page.waitForSelector('#menu-cart-bar.is-visible', { visible: true, timeout: 5000 });
    await h.sleep(350);
    const covered = await page.evaluate(() => {
      const r = document.querySelector('#menu-cart-bar').getBoundingClientRect();
      return [...document.querySelectorAll('#toast-stack .toast')].some((toast) => {
        const q = toast.getBoundingClientRect();
        return q.bottom > r.top && q.top < r.bottom && q.right > r.left && q.left < r.right;
      });
    });
    check(covered, 'l’avis « Latte ajouté » recouvre « Voir la commande » (téléphone 390 × 844)');
    await page.click('#menu-cart-bar');
    await page.waitForFunction(() => document.getElementById('screen-table')?.classList.contains('is-active'), { timeout: 3000 }).catch(() => {});
    check(await page.evaluate(() => document.getElementById('screen-table')?.classList.contains('is-active')), '« Voir la commande », touchée à travers l’avis, ouvre la table');
    check(await page.evaluate(() => {
      const el = document.createElement('div'); el.className = 'toast'; document.getElementById('toast-stack').appendChild(el);
      const v = getComputedStyle(el).pointerEvents; el.remove(); return v === 'none';
    }), 'un avis ne capte aucun toucher');
    check(page.errors.length === 0, 'aucune erreur de script' + (page.errors.length ? ' : ' + page.errors.join(' | ') : ''));
  });
} finally {
  await h.close();
}
console.log(`\nserveur-toast-tap-browser-test: ${checks} checks passed`);
