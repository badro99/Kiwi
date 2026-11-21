#!/usr/bin/env node
/* Fusionner deux tables qui attendent chacune un « Lancer » sans réponse :
 * refusé tant que les deux lots ne sont pas confirmés.
 *
 *   node tools/serveur-merge-pending-browser-test.mjs
 *
 * Café réel, 21 nov. 2026 (wifi de terrasse). Un lot sans réponse garde sa
 * référence pour être rejoué sans doublon. Fusionner deux tables qui en ont
 * chacune un n'en laissait survivre qu'un : celui de la table fusionnée
 * était oublié et ses plats repartaient plus tard sous une nouvelle
 * référence, en double si le premier envoi était arrivé. La fusion attend
 * maintenant la confirmation ; une fois les lots partis, elle passe. Vraies
 * routes (tools/serveur-live-harness.mjs › drop), vrais clics, restaurant
 * inventé. */
import assert from 'node:assert/strict';
import { harness, chromium } from './serveur-live-harness.mjs';
import { suite } from './browser-trace.mjs';

if (!chromium()) { console.log('○ skip: Chromium/puppeteer-core unavailable, browser assertions not executed'); process.exit(process.env.CI ? 1 : 0); }
const h = await harness();
const S = suite('serveur-merge-pending', { browser: h.browser });
let checks = 0;
const check = (yes, msg) => { assert.ok(yes, msg); checks++; console.log('  ✓ ' + msg); };
const pendingTables = (page) => page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('kiwi:service-pending-v1:')).map((k) => k.split(':').pop()).sort());
const merges = () => h.calls.filter((c) => c.method === 'POST' && /"mergeTables"/.test(c.sent || '')).length;
const onTable = (page) => page.waitForFunction(() => document.getElementById('screen-table')?.classList.contains('is-active'), { timeout: 10000 });

async function lostLancer(page, table, dish) {
  await h.tap(page, `.table-card[data-table="${table}"]`);
  await h.tap(page, '#nt-confirm');
  await onTable(page);
  await h.tap(page, '[data-action="take-order"]');
  await h.tap(page, `.menu-item[data-menu-id="${dish}"]`);
  await h.tap(page, '#menu-cart-bar.is-visible');
  await onTable(page);
  await h.tap(page, '[data-action="lancer"]');
  await page.waitForFunction((t) => Object.keys(localStorage).some((k) => k.startsWith('kiwi:service-pending-v1:') && k.endsWith(':' + t)), { timeout: 10000 }, table);
  if (await page.evaluate(() => document.getElementById('screen-table')?.classList.contains('is-active'))) await h.tap(page, '#td-back');
  await page.waitForFunction(() => document.getElementById('screen-main')?.classList.contains('is-active'), { timeout: 5000 });
}

try {
  await S.run('fusion refusée tant que deux « Lancer » attendent', async (t) => {
    const page = await h.openWaiter(t);
    t.step('deux tables, deux « Lancer » perdus');
    const heal = h.drop((key, body) => key === 'POST /api/order/queue' && body.includes('"create":true'));
    await lostLancer(page, '4', 'it_msemen');
    await lostLancer(page, '5', 'it_the');
    check(JSON.stringify(await pendingTables(page)) === '["4","5"]', 'les deux lots attendent');

    t.step('fusionner la 4 dans la 5');
    await h.tap(page, '.table-card[data-table="4"]');
    await onTable(page);
    await h.tap(page, '[data-action="merge-table"]');
    await h.tap(page, '#merge-table-modal [data-mrg-target="5"]');
    await h.tap(page, '#mrg-confirm');
    await page.waitForFunction(() => [...document.querySelectorAll('#toast-stack .toast')].some((x) => /attendez la confirmation du Lancer/.test(x.textContent)), { timeout: 5000 }).catch(() => {});
    check(await page.evaluate(() => [...document.querySelectorAll('#toast-stack .toast')].some((x) => /Fusion impossible · attendez la confirmation du Lancer/.test(x.textContent))), 'le serveur lit « Fusion impossible · attendez la confirmation du Lancer »');
    check(merges() === 0, 'aucune fusion envoyée au serveur');
    check(JSON.stringify(await pendingTables(page)) === '["4","5"]', 'les deux lots attendent toujours, chacun sous sa table');
    check(await page.evaluate(() => !document.getElementById('mrg-confirm').disabled), 'le bouton reste utilisable');

    t.step('le réseau revient, les lots partent, la fusion passe');
    heal(); // ici seulement : la synchro qui réussit vide maintenant les lots, ils ne doivent pas partir avant le refus
    /* Aucun appel à la main : pas d'événement 'online' (le wifi n'est jamais tombé), c'est la synchro
       réussie qui vide les lots, ou le vidage reporté à la fin de la fenêtre de 4 s. */
    await page.evaluate(() => { document.getElementById('merge-table-modal').classList.remove('is-open'); });
    await h.until(() => h.db.tickets().length === 2, 'les deux bons arrivent', 15000);
    await page.waitForFunction(() => !Object.keys(localStorage).some((k) => k.startsWith('kiwi:service-pending-v1:')), { timeout: 10000 });
    await page.evaluate(() => pollServiceSync());
    await h.tap(page, '[data-action="merge-table"]');
    await h.tap(page, '#merge-table-modal [data-mrg-target="5"]');
    await h.tap(page, '#mrg-confirm');
    await h.until(() => merges() === 1, 'la fusion part', 10000).catch(() => {});
    check(merges() === 1, 'les lots confirmés, la fusion est envoyée');
    check(page.errors.length === 0, 'aucune erreur de script' + (page.errors.length ? ' : ' + page.errors.join(' | ') : ''));
  });
} finally {
  await h.close();
}
console.log(`\nserveur-merge-pending-browser-test: ${checks} checks passed`);
// Un scénario rouge (S.run) doit sortir en rouge : sinon le gate le compte vert.
process.exit(await S.finish({ exit: false }));
