#!/usr/bin/env node
/* Menu · quand le serveur remplace la carte sous une fiche article ouverte
 * (409 foreign-document, règle d'octobre : on reprend la carte du serveur),
 * le clavier et le lecteur d'écran ne restent pas dans une fiche morte
 * (menu#A2). La règle de remplacement elle-même n'est pas touchée : la carte du
 * serveur est bien celle qui reste.
 *
 * Vraie session de démonstration marchand (routes simulées, aucun vrai
 * marchand), vrai tableau de bord, vraie fiche article :
 *  1 · la fiche s'ouvre au clavier (Entrée sur la ligne), le focus y entre ;
 *  2 · une écriture de fond reçoit 409 foreign-document avec la carte d'un autre
 *      établissement : la carte du serveur est adoptée (règle intacte) ;
 *  3 · la fiche de l'article disparu se ferme, un message dit pourquoi, et le
 *      focus est sur un contrôle de la page (pas sur <body>) ;
 *  4 · depuis ce point, on rouvre au clavier une fiche sur la nouvelle carte :
 *      la page reste utilisable. */
import assert from 'node:assert/strict';
import { harness, realPage, sleep } from './surface-matrix-lib.mjs';

const h = await harness('menu-foreign-document-focus');
const merchant = 'matrix-real';
/* Code de propriétaire synthétique de la suite, jamais affiché. */
const OWNER = String(1000 + Math.floor(Math.random() * 9000));
const check = (yes, msg) => { assert.ok(yes, msg); console.log('  ✓ ' + msg); };
const MINE = { cats: [{ id: 'c1', name: 'Plats', sub: [] }], items: [{ id: 'i1', catId: 'c1', name: 'TEST KIWI Tajine', price: 80 }, { id: 'i2', catId: 'c1', name: 'TEST KIWI Harira', price: 30 }], stations: [], opts: [], kitchenId: '', langs: ['fr'] };
const FOREIGN = { cats: [{ id: 'x1', name: 'Autre', sub: [] }], items: [{ id: 'x2', catId: 'x1', name: 'TEST KIWI Autre plat', price: 10 }], stations: [], opts: [], kitchenId: '', langs: ['fr'] };
let mode = 'ok';

await h.S.run('fiche article ouverte · 409 foreign-document', async (t) => {
  const routes = {
    'GET /api/me': { authenticated: true, onboarded: true, name: 'TEST KIWI', business: 'Matrix Resto', type: 'restaurant', stores: [{ merchant, name: 'Matrix Resto', type: 'restaurant' }] },
    'GET /api/config': { name: 'Matrix Resto', type: 'restaurant', plan: 'pro', planExplicit: true, features: {}, pins: [{ name: 'TEST KIWI', role: 'owner' }] },
    'POST /api/pin/verify': (req) => ({ status: JSON.parse(req.postData()).pin === OWNER ? 200 : 401, body: { ok: true, staff: { id: 'st_owner', name: 'TEST KIWI', role: 'owner' }, merchant } }),
    'GET /api/menu': { merchant, updatedTs: 5, menu: MINE },
    'POST /api/menu': () => (mode === 'foreign' ? { status: 409, body: { error: 'foreign-document', updatedTs: 9, data: FOREIGN } } : { body: { ok: true, updatedTs: 6 } }),
    'GET /api/store': { body: { rev: 0, data: null } },
    'POST /api/store': { body: { ok: true, rev: 1 } },
    'POST /api/config': { ok: true, pins: [] },
  };
  const { ctx, page } = await realPage(h, 'fr', 'desktop', routes);
  t.defer(() => ctx.close()); t.watch(page);
  // coverage: surface=dashboard-menu locale=fr viewport=desktop
  await page.goto(h.base + '/dashboard.html', { waitUntil: 'load', timeout: 60000 });
  await page.waitForSelector('[data-kiwi-lock] [data-kiwi-pin-input]', { timeout: 30000 });
  await sleep(600);
  await page.focus('[data-kiwi-lock] [data-kiwi-pin-input]');
  for (const d of OWNER) { await page.keyboard.press(d); await sleep(60); }
  await page.waitForFunction(() => !!window.KiwiMenuStore, { timeout: 30000 });
  await sleep(3000);
  await page.click('.sidebar [data-nav="menu"]');
  await page.waitForSelector('[data-rmw-row="i1"] .rmw-row-main', { visible: true, timeout: 30000 });
  await sleep(500);

  t.step('open the item sheet with the keyboard');
  await page.focus('[data-rmw-row="i1"] .rmw-row-main');
  await page.keyboard.press('Enter');
  await page.waitForSelector('.rmw-it [data-name]', { visible: true, timeout: 10000 });
  await sleep(300);
  check(await page.evaluate(() => !!document.activeElement.closest('.kiwi-modal')), 'la fiche s’ouvre au clavier et le focus y entre');
  await page.focus('.rmw-it [data-name]');
  await page.keyboard.type(' X');

  t.step('the server replaces the carte under the open sheet');
  mode = 'foreign';
  await page.evaluate(() => KiwiMenuStore.updateItem('i2', { price: 31 }));
  await page.waitForFunction(() => KiwiMenuStore.items().every((i) => i.id === 'x2'), { timeout: 10000 });
  check(true, 'la carte du serveur est adoptée (règle de remplacement intacte)');
  await sleep(500);
  check(await page.$('.rmw-it') === null, 'la fiche de l’article disparu est fermée, pas laissée ouverte sur du vide');
  check(await page.evaluate(() => /plus sur la carte/.test([...document.querySelectorAll('[class*=toast]')].map((e) => e.textContent).join(' '))), 'un message dit que l’article n’est plus sur la carte');
  const focus = await page.evaluate(() => { const a = document.activeElement; return a && a !== document.body ? a.tagName + (a.hasAttribute('data-rmw-search') ? '#search' : '') : 'body'; });
  check(focus !== 'body', 'le focus est sur un contrôle de la page (' + focus + '), pas sur <body>');

  t.step('the page stays usable from there');
  await page.waitForSelector('[data-rmw-row="x2"] .rmw-row-main', { visible: true, timeout: 10000 });
  await page.focus('[data-rmw-row="x2"] .rmw-row-main');
  await page.keyboard.press('Enter');
  await page.waitForSelector('.rmw-it [data-name]', { visible: true, timeout: 10000 });
  check(await page.$eval('.rmw-it [data-name]', (e) => e.value) === 'TEST KIWI Autre plat', 'on rouvre au clavier une fiche de la nouvelle carte');
});

await h.close();
await h.S.finish();
