#!/usr/bin/env node
/* Une requête sans réponse ne fige plus un bouton du service.
 *
 *   node tools/serveur-hung-request-browser-test.mjs
 *
 * Café réel, 21 nov. 2026 (wifi de terrasse). serveur-app.js a un appel à
 * délai réel (svFetchJson, 12 s) parce qu'un bouton grisé sans fin « se lit
 * comme une app plantée » ; ouvrir une table, déplacer, fusionner, accepter
 * une commande, « − » / « + » / la note d'un plat envoyé passaient encore par
 * un fetch nu. Un paquet perdu : « Installer » restait grisé jusqu'à ce que le
 * navigateur abandonne (des minutes), sans un mot. Ici le banc retient la
 * route (tools/serveur-live-harness.mjs › hold) : passé le délai, le bouton
 * revient avec un message, puis la même ouverture réussit (elle est
 * idempotente côté serveur). Vrais clics, restaurant inventé. */
import assert from 'node:assert/strict';
import { harness, chromium } from './serveur-live-harness.mjs';
import { suite } from './browser-trace.mjs';

if (!chromium()) { console.log('○ skip: Chromium/puppeteer-core unavailable, browser assertions not executed'); process.exit(process.env.CI ? 1 : 0); }
const h = await harness();
const S = suite('serveur-hung-request', { browser: h.browser });
let checks = 0;
const check = (yes, msg) => { assert.ok(yes, msg); checks++; console.log('  ✓ ' + msg); };

try {
  await S.run('ouvrir une table sur un réseau qui avale la réponse', async (t) => {
    const page = await h.openWaiter(t);
    await h.tap(page, '.table-card[data-table="4"]');
    await page.waitForSelector('#nt-confirm', { visible: true });
    await h.sleep(400);
    t.step('la réponse ne revient pas');
    h.hold('POST /api/order/queue');
    await h.tap(page, '#nt-confirm');
    await h.sleep(300);
    check(await page.evaluate(() => document.getElementById('nt-confirm').disabled), 'le bouton se verrouille le temps de l’aller-retour');
    await page.waitForFunction(() => !document.getElementById('nt-confirm').disabled, { timeout: 20000 }).catch(() => {});
    check(await page.evaluate(() => !document.getElementById('nt-confirm').disabled), 'passé le délai, le bouton revient (au lieu de rester grisé sans fin)');
    check(await page.evaluate(() => [...document.querySelectorAll('#toast-stack .toast')].some((x) => /ouverture non enregistrée/.test(x.textContent))), 'et le serveur lit « ouverture non enregistrée, réessayez »');
    h.release('POST /api/order/queue');
    await h.sleep(500);

    t.step('le réseau revient, il retape');
    await h.tap(page, '#nt-confirm');
    await page.waitForFunction(() => document.getElementById('screen-table')?.classList.contains('is-active'), { timeout: 10000 }).catch(() => {});
    check(await page.evaluate(() => document.getElementById('screen-table')?.classList.contains('is-active')), 'la table s’ouvre au second essai');
    check(h.db.openSessions().filter((x) => x.table_no === '4').length === 1, 'une seule visite ouverte au serveur, malgré la requête retenue');
    check(page.errors.length === 0, 'aucune erreur de script' + (page.errors.length ? ' : ' + page.errors.join(' | ') : ''));
  });
} finally {
  await h.close();
}
console.log(`\nserveur-hung-request-browser-test: ${checks} checks passed`);
