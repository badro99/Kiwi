#!/usr/bin/env node
/* Une commande en cours survit à ce qui arrive pendant un service : la page
 * rechargée, deux tables fusionnées, la carte modifiée sous une feuille
 * ouverte, la session qui expire, un « + » sur un plat déjà parti.
 *
 *   node tools/serveur-service-continuity-browser-test.mjs
 *
 * Chasse du 26 nov. 2026 (vrais clics, tools/serveur-live-harness.mjs) :
 *  · page rechargée en pleine saisie : les plats revenaient sur la table, sans
 *    « Lancer la commande » ; « Encaisser » refusait, la cuisine ne recevait rien ;
 *  · fusion : la table d'origine restait « En cours » sur tous les appareils (le
 *    téléphone demandait de fermer une visite que la fusion venait de fermer,
 *    409, et ne publiait jamais « libre ») ;
 *  · carte relue pendant qu'une feuille d'options est ouverte : les touchers
 *    ne faisaient plus rien, « Ajouter » était mort (TypeError) ;
 *  · session expirée : la feuille restait posée sur l'écran du code ;
 *  · « + » sur un plat accepté en cuisine alors que la table attend un
 *    « Lancer » : l'unité ajoutée partait deux fois.
 * Vraies routes, restaurant inventé, aucun code saisi. */
import assert from 'node:assert/strict';
import { harness, chromium, DEFAULT_PLAN } from './serveur-live-harness.mjs';
import { suite } from './browser-trace.mjs';

if (!chromium()) { console.log('○ skip: Chromium/puppeteer-core unavailable, browser assertions not executed'); process.exit(process.env.CI ? 1 : 0); }
/* Une table par scénario : aucun ne dépend de ce que le précédent a laissé. */
const plan = { ...DEFAULT_PLAN, tables: ['4', '5', '6', '7', '8', '9'].map((num, i) => ({ ...DEFAULT_PLAN.tables[0], id: 't' + num, num, x: 40 + (i % 3) * 120, y: 40 + Math.floor(i / 3) * 120 })) };
const h = await harness({ plan });
const S = suite('serveur-service-continuity', { browser: h.browser });
let checks = 0;
const check = (yes, msg) => { assert.ok(yes, msg); checks++; console.log('  ✓ ' + msg); };
const onTable = (page) => page.waitForFunction(() => document.getElementById('screen-table')?.classList.contains('is-active'), { timeout: 10000 });
const onFloor = (page) => page.waitForFunction(() => document.getElementById('screen-main')?.classList.contains('is-active'), { timeout: 10000 });
const toasts = (page) => page.evaluate(() => [...document.querySelectorAll('#toast-stack .toast')].map((x) => x.textContent).join(' | '));
const noErrors = (page) => check(page.errors.length === 0, 'aucune erreur de script' + (page.errors.length ? ' : ' + page.errors.join(' | ') : ''));
/* Ce que la cuisine a reçu pour une table, par plat. */
const kitchen = (table) => { const out = {}; h.db.tickets(table).forEach((t) => JSON.parse(t.lines).forEach((l) => { out[l.id] = (out[l.id] || 0) + Number(l.qty); })); return out; };
async function openTable(page, table) {
  await h.tap(page, `.table-card[data-table="${table}"]`);
  await h.tap(page, '#nt-confirm');
  await onTable(page);
}
async function order(page, dishes) {
  await h.tap(page, '[data-action="take-order"]');
  for (const dish of dishes) await h.tap(page, `.menu-item[data-menu-id="${dish}"]`);
  await h.tap(page, '#menu-cart-bar.is-visible');
  await onTable(page);
}
async function lancer(page, table, count) {
  await h.tap(page, '[data-action="lancer"]');
  await h.until(() => h.db.tickets(table).length === count, 'le bon de la table ' + table + ' arrive', 15000);
  await onFloor(page);
}

try {
  await S.run('page rechargée en pleine saisie : la commande se lance toujours', async (t) => {
    const page = await h.openWaiter(t, { firstTable: '5' });
    await openTable(page, '5');
    await order(page, ['it_omelette', 'it_omelette']);
    await page.waitForFunction(() => Object.keys(localStorage).some((k) => k.startsWith('kiwi:service-drafts-v1:')), { timeout: 5000 });
    t.step('la page est rechargée (iOS recycle l’app, le serveur tire pour rafraîchir)');
    await page.reload({ waitUntil: 'load' });
    await onFloor(page);
    await page.waitForSelector('.table-card[data-table="5"]', { visible: true, timeout: 20000 });
    await h.tap(page, '.table-card[data-table="5"]');
    await onTable(page);
    await page.waitForSelector('[data-action="lancer"]', { visible: true, timeout: 4000 }).catch(() => {});
    check(await page.evaluate(() => !!document.querySelector('[data-action="lancer"]')?.offsetParent), 'après le rechargement, « Lancer la commande » est toujours proposé');
    t.step('un plat ajouté après le rechargement ne prend pas l’identifiant d’une ligne revenue');
    await order(page, ['it_cafe']);
    const uids = await page.evaluate(() => (tableOrders['5'] || []).map((l) => l.uid));
    check(new Set(uids).size === uids.length, 'chaque ligne garde un identifiant à elle (' + uids.join(', ') + ')');
    await lancer(page, '5', 1);
    const got = kitchen('5');
    check(got.it_omelette === 2 && got.it_cafe === 1, 'la cuisine reçoit les 2 omelettes d’avant le rechargement et le café (' + JSON.stringify(got) + ')');
    noErrors(page);
  });

  await S.run('fusion : la table d’origine redevient libre, ici et sur l’autre appareil', async (t) => {
    const page = await h.openWaiter(t, { firstTable: '4' });
    await openTable(page, '4'); await order(page, ['it_the']); await lancer(page, '4', 1);
    await openTable(page, '6'); await order(page, ['it_msemen']); await lancer(page, '6', 1);
    t.step('fusionner la 4 dans la 6');
    await h.tap(page, '.table-card[data-table="4"]');
    await onTable(page);
    await h.tap(page, '[data-action="merge-table"]');
    await h.tap(page, '#merge-table-modal [data-mrg-target="6"]');
    const before = h.calls.length;
    await h.tap(page, '#mrg-confirm');
    await h.until(() => h.calls.slice(before).some((c) => c.path === '/api/service/events' && c.method === 'POST' && /"table":"4"/.test(c.sent || '')), 'l’état de la table 4 est publié', 10000).catch(() => {});
    await h.sleep(400);
    const after = h.calls.slice(before);
    check(!after.some((c) => c.status === 409), 'aucune requête refusée après la fusion' + after.filter((c) => c.status === 409).map((c) => ' · ' + c.body).join(''));
    check(after.some((c) => c.path === '/api/service/events' && c.status === 200 && /"table":"4"/.test(c.sent || '') && /"status":"khawya"/.test(c.sent || '')), 'la table 4 est publiée libre');
    check(h.db.openSessions().map((s) => s.table_no).filter((n) => n === '4' || n === '6').join() === '6', 'des deux visites, seule celle de la table 6 reste ouverte');
    await page.evaluate(() => pollServiceSync()); await h.sleep(600);
    await page.evaluate(() => pollServiceSync()); await h.sleep(600);
    check(await page.evaluate(() => tables['4'].status) === 'khawya', 'après relecture, la table 4 est libre sur ce téléphone');
    t.step('un second appareil ouvre le plan');
    const other = await h.openWaiter(t, { firstTable: '4' });
    await other.evaluate(() => pollServiceSync()); await h.sleep(800);
    check(await other.evaluate(() => tables['4'].status) === 'khawya', 'la table 4 est libre sur l’autre appareil');
    check(await other.evaluate(() => tables['6'].status) !== 'khawya', 'la table 6 reste occupée sur l’autre appareil');
    noErrors(page);
  });

  await S.run('la carte change sous une feuille ouverte : jamais de feuille morte', async (t) => {
    const page = await h.openWaiter(t, { firstTable: '7' });
    const menuRow = () => JSON.parse(h.sql.prepare('SELECT data FROM menus WHERE merchant = ?').get(h.merchant).data);
    const publish = async (menu) => {
      h.sql.prepare('UPDATE menus SET data = ?, updated_ts = ? WHERE merchant = ?').run(JSON.stringify(menu), Date.now(), h.merchant);
      await page.evaluate(() => svFetchCarteNow());
    };
    const original = menuRow();
    await openTable(page, '7');
    await h.tap(page, '[data-action="take-order"]');
    await h.tap(page, '.menu-item[data-menu-id="it_latte"]');
    await page.waitForSelector('#opt-modal.is-open .opt-pill[data-opt-val="Entier"]', { visible: true, timeout: 5000 });
    await h.tap(page, '.opt-pill[data-opt-val="Entier"]');
    t.step('le patron change le prix d’un AUTRE plat : la feuille reste et marche');
    const other = JSON.parse(JSON.stringify(original)); other.items.find((i) => i.id === 'it_cafe').price = 13;
    await publish(other);
    check(await page.evaluate(() => document.getElementById('opt-modal').classList.contains('is-open')), 'un changement ailleurs sur la carte laisse la feuille ouverte');
    await h.tap(page, '.opt-pill[data-opt-val="Avoine"]');
    check(await page.evaluate(() => document.querySelector('.opt-pill[data-opt-val="Avoine"]').classList.contains('on')), 'le choix « Avoine » est pris après la relecture de la carte');
    t.step('le patron retire le plat ouvert : la feuille se ferme et le dit');
    const gone = JSON.parse(JSON.stringify(other)); gone.items.find((i) => i.id === 'it_latte').avail = false;
    await publish(gone);
    check(await page.evaluate(() => !document.getElementById('opt-modal').classList.contains('is-open')), 'la feuille du plat retiré se ferme');
    check(/carte/i.test(await toasts(page)), 'un avis dit que la carte a changé (' + (await toasts(page)) + ')');
    check(await page.evaluate(() => optDraft === null), 'le brouillon d’options est abandonné');
    t.step('les options du plat changent sous la feuille');
    await publish(original);
    await h.tap(page, '.menu-item[data-menu-id="it_latte"]');
    await page.waitForSelector('#opt-modal.is-open .opt-pill[data-opt-val="Entier"]', { visible: true, timeout: 5000 });
    const renamed = JSON.parse(JSON.stringify(original)); renamed.opts[0].choices[1].name = 'Amande';
    await publish(renamed);
    check(await page.evaluate(() => !document.getElementById('opt-modal').classList.contains('is-open')), 'des options modifiées ferment la feuille au lieu de la laisser fausse');
    await h.tap(page, '.menu-item[data-menu-id="it_latte"]');
    await page.waitForSelector('#opt-modal.is-open .opt-pill[data-opt-val="Amande"]', { visible: true, timeout: 5000 });
    await h.tap(page, '.opt-pill[data-opt-val="Amande"]');
    await h.tap(page, '#opt-confirm');
    check(await page.evaluate(() => (tableOrders['7'] || []).some((l) => l.id === 'it_latte' && l.qty === 1)), 'rouvert sur la nouvelle carte, le latte s’ajoute');
    await publish(original);
    noErrors(page);

    t.step('la session expire, feuille ouverte');
    await h.tap(page, '.menu-item[data-menu-id="it_latte"]');
    await page.waitForSelector('#opt-modal.is-open', { visible: true, timeout: 5000 });
    await page.evaluate(() => endRevokedSession());   // ce que fait un 401 de la synchro
    const left = await page.evaluate(() => [...document.querySelectorAll('.modal-veil.is-open')].map((m) => m.id));
    check(left.length === 0, 'aucune feuille ne reste posée sur l’écran du code (' + left.join(', ') + ')');
    check(await page.evaluate(() => optDraft === null && fmlDraft === null && newTableId === null && voidLineTarget === null && trfFromId === null && mrgSourceId === null), 'aucun brouillon de feuille ne survit à la session');
    noErrors(page);
  });

  await S.run('« + » sur un plat déjà parti : chaque unité arrive une seule fois', async (t) => {
    const accept = (table) => h.db.tickets(table).forEach((row) => h.sql.prepare('UPDATE orders SET lines = ?, updated_ts = updated_ts + 1 WHERE id = ?')
      .run(JSON.stringify(JSON.parse(row.lines).map((l) => ({ ...l, stationAccepted: true }))), row.id));
    const page = await h.openWaiter(t, { firstTable: '8' });
    /* La ligne est retrouvée à chaque essai : la fiche vient d'être repeinte par la relecture. */
    const plusOn = async (dish) => { for (let i = 0; ; i++) { try {
      const uid = await page.evaluate((name) => [...document.querySelectorAll('#screen-table [data-order-uid]')].find((row) => row.textContent.includes(name) && row.querySelector('[data-qty="inc"]'))?.dataset.orderUid, dish);
      await page.click(`#screen-table [data-order-uid="${uid}"] [data-qty="inc"]`); return;
    } catch (e) { if (i >= 4) throw e; await h.sleep(250); } } };
    await openTable(page, '8'); await order(page, ['it_msemen', 'it_msemen']); await lancer(page, '8', 1);
    t.step('la cuisine accepte, le serveur ajoute un café puis fait « + » sur le msemen');
    accept('8');
    await page.evaluate(() => pollServiceSync()); await h.sleep(800);
    await h.tap(page, '.table-card[data-table="8"]'); await onTable(page);
    await order(page, ['it_cafe']);
    await plusOn('Msemen');
    await h.until(() => kitchen('8').it_msemen === 3, 'le msemen ajouté arrive en cuisine', 10000);
    await lancer(page, '8', 2);
    await h.sleep(300);
    let got = kitchen('8');
    check(got.it_msemen === 3, `le msemen ajouté par « + » n’est pas renvoyé par « Lancer » (${got.it_msemen} reçus, 3 attendus)`);
    check(got.it_cafe === 1, 'le café part avec « Lancer »');

    t.step('une ligne dont une unité attend encore : « + » reste sur le téléphone jusqu’au « Lancer »');
    await openTable(page, '9'); await order(page, ['it_msemen', 'it_msemen']);
    /* Les relectures attendent : c'est avant elles que la ligne locale, déjà partie, reprend un plat. */
    await h.sleep(300); ['GET /api/order/queue', 'GET /api/service/events', 'GET /api/employee'].forEach((key) => h.hold(key));
    await lancer(page, '9', 1);
    await h.tap(page, '.table-card[data-table="9"]'); await onTable(page);
    await order(page, ['it_msemen']);   // avant la relecture : la ligne locale passe à 3 dont 2 partis
    const held = await page.evaluate(() => (tableOrders['9'] || []).map((l) => l.qty + '/' + l.sentQty + (l.sourceLocal ? ' locale' : '')).join(', '));
    check(await page.evaluate(() => (tableOrders['9'] || []).some((l) => l.qty === 3 && l.sentQty === 2)), 'la ligne porte 3 msemen dont 2 déjà partis (' + held + ')');
    accept('9');
    ['GET /api/order/queue', 'GET /api/service/events', 'GET /api/employee'].forEach((key) => h.release(key));
    await page.evaluate(() => pollServiceSync()); await h.sleep(800);
    await plusOn('Msemen');
    await h.sleep(800);
    check(kitchen('9').it_msemen === 2, `« + » sur une ligne pas encore toute partie n’écrit rien en cuisine avant « Lancer » (${kitchen('9').it_msemen} en cuisine)`);
    await h.tap(page, '[data-action="lancer"]');
    await h.until(() => kitchen('9').it_msemen >= 4, 'les msemen partent', 10000);
    await h.sleep(600);
    got = kitchen('9');
    check(got.it_msemen === 4, `4 msemen demandés, 4 en cuisine (${got.it_msemen})`);
    noErrors(page);
  });
} finally {
  await h.close();
}
console.log(`\nserveur-service-continuity-browser-test: ${checks} checks passed`);
// Un scénario rouge (S.run) doit sortir en rouge : sinon le gate le compte vert.
process.exit(await S.finish({ exit: false }));
