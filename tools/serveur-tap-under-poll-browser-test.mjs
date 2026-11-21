#!/usr/bin/env node
/* Un toucher du serveur compte, même quand la synchro tombe dessous.
 *
 *   node tools/serveur-tap-under-poll-browser-test.mjs
 *
 * Café réel, 21 nov. 2026 : « l'app serveur est buggée de partout ». Une des
 * causes, mesurée ici au vrai doigt (souris CDP, pas d'événement fabriqué) :
 *   · la synchro de service (toutes les 6 s) redessinait le plan de salle et
 *     la carte d'un bloc, deux fois par tour, sans regarder si un doigt était
 *     posé. La carte touchée était remplacée entre l'appui et le relâché, le
 *     clic tombait sur la grille et rien n'était ajouté (6 touchers sur 6 au
 *     banc, quand le tour tombait pendant l'appui) ;
 *   · la carte relue (toutes les 10-15 s) se repeignait de même, même
 *     inchangée.
 * Banc : tools/serveur-live-harness.mjs (vraies routes, base en mémoire,
 * restaurant inventé). */
import assert from 'node:assert/strict';
import { harness, chromium } from './serveur-live-harness.mjs';
import { suite } from './browser-trace.mjs';
import * as eventsApi from '../functions/api/service/events.js';

if (!chromium()) { console.log('○ skip: Chromium/puppeteer-core unavailable, browser assertions not executed'); process.exit(process.env.CI ? 1 : 0); }
const h = await harness();
const S = suite('serveur-tap-under-poll', { browser: h.browser });
let checks = 0;
const check = (yes, msg) => { assert.ok(yes, msg); checks++; console.log('  ✓ ' + msg); };

/* Un tour de synchro complet (événements puis file des commandes) pendant
   que le doigt est posé. */
async function pollWhileDown(page, extra) {
  const before = h.calls.filter((c) => c.who === 'serveur' && c.path === '/api/order/queue' && c.method === 'GET').length;
  await page.evaluate((x) => { if (x === 'carte') svFetchCarteNow(); pollServiceSync(); }, extra || '');
  await h.until(() => h.calls.filter((c) => c.who === 'serveur' && c.path === '/api/order/queue' && c.method === 'GET').length > before, 'le tour de synchro répond', 10000);
  await h.sleep(250);
}
async function tapDuringPoll(page, selector, extra) {
  const el = await page.waitForSelector(selector, { visible: true });
  const box = await el.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + Math.min(20, box.height / 2));
  await page.mouse.down();
  await pollWhileDown(page, extra);
  await page.mouse.up();
  await h.sleep(250);
}
const qty = (page, id) => page.evaluate((i) => (tableOrders['4'] || []).filter((l) => l.id === i).reduce((s, l) => s + l.qty, 0), id);

try {
  await S.run('carte et plan : le toucher compte pendant la synchro', async (t) => {
    const page = await h.openWaiter(t);
    t.step('le serveur touche la table 4 pendant un tour de synchro');
    await tapDuringPoll(page, '.table-card[data-table="4"]');
    check(await page.evaluate(() => document.getElementById('new-table-modal')?.classList.contains('is-open')
      || document.querySelector('#nt-confirm')?.offsetParent != null), 'la table touchée pendant la synchro s’ouvre');
    await h.tap(page, '#nt-confirm');
    await h.tap(page, '[data-action="take-order"]');
    await page.waitForSelector('.menu-item[data-menu-id="it_msemen"]', { visible: true, timeout: 15000 });

    t.step('trois msemen, chacun touché pendant un tour de synchro');
    for (let i = 1; i <= 3; i++) {
      await tapDuringPoll(page, '.menu-item[data-menu-id="it_msemen"] .menu-item-name');
      check(await qty(page, 'it_msemen') === i, `toucher ${i} pendant la synchro : ${i} msemen sur la table`);
    }
    t.step('un thé touché pendant que la carte se relit');
    await tapDuringPoll(page, '.menu-item[data-menu-id="it_the"] .menu-item-name', 'carte');
    check(await qty(page, 'it_the') === 1, 'le thé touché pendant la relecture de la carte est pris');
    t.step('la carte se repeint une fois la main levée');
    await page.waitForFunction(() => document.querySelector('.menu-item[data-menu-id="it_msemen"] .step-num')?.textContent === '3', { timeout: 5000 });
    check(true, 'la carte affiche ensuite les 3 msemen');
    check(page.errors.length === 0, 'aucune erreur de script' + (page.errors.length ? ' : ' + page.errors.join(' | ') : ''));
  });

  /* Un champ retient le seul dessin qui le remplacerait. La note d'un plat
     tenait le plan, la carte et les avis tant qu'elle avait le focus : le
     serveur qui tapait « sans sucre » revenait sur un plan figé. */
  await S.run('une note ouverte ne fige pas le plan', async (t) => {
    const page = await h.openWaiter(t);
    await h.tap(page, '.table-card[data-table="6"]');
    await h.tap(page, '#nt-confirm');
    await h.tap(page, '[data-action="take-order"]');
    await h.tap(page, '.menu-item[data-menu-id="it_msemen"]');
    await h.tap(page, '#menu-cart-bar.is-visible');
    await h.tap(page, '.td-item-note');
    await page.keyboard.type('sans sucre');
    t.step('la caisse installe la table 5 pendant que la note est ouverte');
    const res = await eventsApi.onRequestPost({ env: h.env, waitUntil() {}, request: new Request('https://kiwi-os.com/api/service/events', {
      method: 'POST', headers: { Cookie: h.tillCookie, 'Content-Type': 'application/json', Origin: 'https://kiwi-os.com' },
      body: JSON.stringify({ merchant: h.merchant, snapshot: { tables: [{ table: '5', status: 'ka-yaklo', covers: 3 }] } }) }) });
    check(res.status === 200, 'la caisse publie la table 5');
    await page.evaluate(() => pollServiceSync());
    await page.waitForFunction(() => document.querySelector('.table-card[data-table="5"]')?.dataset.status === 'ka-yaklo', { timeout: 6000 }).catch(() => {});
    check(await page.evaluate(() => document.querySelector('.table-card[data-table="5"]')?.dataset.status) === 'ka-yaklo', 'le plan derrière la fiche se repeint : la table 5 est occupée');
    check(await page.evaluate(() => document.activeElement?.classList.contains('td-item-note') && document.activeElement.value === 'sans sucre'), 'la note garde le focus et ce qui est tapé');
    check(page.errors.length === 0, 'aucune erreur de script' + (page.errors.length ? ' : ' + page.errors.join(' | ') : ''));
  });
} finally {
  await h.close();
}
console.log(`\nserveur-tap-under-poll-browser-test: ${checks} checks passed`);
// Un scénario rouge (S.run) doit sortir en rouge : sinon le gate le compte vert.
process.exit(await S.finish({ exit: false }));
