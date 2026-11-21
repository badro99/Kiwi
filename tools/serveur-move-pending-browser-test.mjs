#!/usr/bin/env node
/* Déplacer une table emporte le « Lancer » resté sans réponse.
 *
 *   node tools/serveur-move-pending-browser-test.mjs
 *
 * Café réel, 21 nov. 2026 (wifi de terrasse). Le serveur tape « Lancer » sur
 * la table 4, le paquet se perd : le lot attend, sous le numéro 4, de repartir
 * avec la même référence. Les clients changent de table, il déplace la 4 vers
 * la 5 et relance. Le lot restait sous le numéro 4 : la 5 envoyait les mêmes
 * plats sous une autre référence, puis au retour du réseau le lot de la 4
 * repartait vers une table vide. Deux bons en cuisine pour un seul msemen.
 * Ici le lot suit la table : un seul bon, sur la 5. Vraies routes
 * (tools/serveur-live-harness.mjs › drop), vrais clics, restaurant inventé. */
import assert from 'node:assert/strict';
import { harness, chromium } from './serveur-live-harness.mjs';
import { suite } from './browser-trace.mjs';

if (!chromium()) { console.log('○ skip: Chromium/puppeteer-core unavailable, browser assertions not executed'); process.exit(process.env.CI ? 1 : 0); }
const h = await harness();
const S = suite('serveur-move-pending', { browser: h.browser });
let checks = 0;
const check = (yes, msg) => { assert.ok(yes, msg); checks++; console.log('  ✓ ' + msg); };
const pendingTables = (page) => page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('kiwi:service-pending-v1:')).map((k) => k.split(':').pop()));
const tap = (page, sel) => h.tap(page, sel);
const onTable = (page) => page.waitForFunction(() => document.getElementById('screen-table')?.classList.contains('is-active'), { timeout: 10000 });

try {
  await S.run('le lot sans réponse suit la table déplacée', async (t) => {
    const page = await h.openWaiter(t);
    await tap(page, '.table-card[data-table="4"]');
    await page.waitForSelector('#nt-confirm', { visible: true });
    await tap(page, '#nt-confirm');
    await onTable(page);
    await tap(page, '[data-action="take-order"]');
    await page.waitForSelector('.menu-item[data-menu-id="it_msemen"]', { visible: true, timeout: 15000 });
    await tap(page, '.menu-item[data-menu-id="it_msemen"]');
    await page.waitForSelector('#menu-cart-bar.is-visible', { visible: true });
    await tap(page, '#menu-cart-bar');
    await onTable(page);

    t.step('« Lancer » sur la 4, le paquet se perd');
    const heal = h.drop((key, body) => key === 'POST /api/order/queue' && body.includes('"create":true'));
    await tap(page, '[data-action="lancer"]');
    await page.waitForFunction(() => Object.keys(localStorage).some((k) => k.startsWith('kiwi:service-pending-v1:') && k.endsWith(':4')), { timeout: 10000 }).catch(() => {});
    await h.sleep(800);
    check(JSON.stringify(await pendingTables(page)) === '["4"]', 'le lot attend sous la table 4');
    check(h.db.tickets().length === 0, 'rien n’est arrivé en cuisine');

    t.step('déplacer la 4 vers la 5, puis relancer');
    await tap(page, '[data-action="transfer-table"]');
    await page.waitForSelector('#transfer-table-modal.is-open [data-trf-to="5"]', { visible: true });
    await tap(page, '[data-trf-to="5"]');
    await tap(page, '#trf-confirm');
    await page.waitForFunction(() => !document.getElementById('transfer-table-modal').classList.contains('is-open'), { timeout: 10000 });
    await h.sleep(600);
    const followed = JSON.stringify(await pendingTables(page));
    heal(); // après le déplacement : la synchro réussie vide les lots, celui-ci ne doit partir que sous la 5
    if (!await page.evaluate(() => document.getElementById('screen-table')?.classList.contains('is-active'))) {
      await tap(page, '.table-card[data-table="5"]');
      await onTable(page);
    }
    await tap(page, '[data-action="lancer"]');
    await h.until(() => h.db.tickets().length > 0, 'un bon en cuisine', 10000).catch(() => {});

    t.step('le réseau revient : les lots en attente repartent');
    // Sans geste ni appel à la main : la synchro réussie vide le lot.
    await page.waitForFunction(() => !Object.keys(localStorage).some((k) => k.startsWith('kiwi:service-pending-v1:')), { timeout: 20000 }).catch(() => {});
    await h.sleep(1500);
    const tickets = h.db.tickets();
    check(tickets.length === 1 && tickets[0].table_no === '5', `un seul bon en cuisine, sur la table 5 (${JSON.stringify(tickets.map((x) => x.table_no))})`);
    check(followed === '["5"]', `le lot avait suivi la table au déplacement (${followed})`);
    check((await pendingTables(page)).length === 0, 'plus aucun lot en attente');
    check(page.errors.length === 0, 'aucune erreur de script' + (page.errors.length ? ' : ' + page.errors.join(' | ') : ''));
  });
} finally {
  await h.close();
}
console.log(`\nserveur-move-pending-browser-test: ${checks} checks passed`);
// Un scénario rouge (S.run) doit sortir en rouge : sinon le gate le compte vert.
process.exit(await S.finish({ exit: false }));
