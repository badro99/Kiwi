#!/usr/bin/env node
/* La vitrine de l'app serveur (?demo=1) va jusqu'au paiement, et la feuille
 * d'options ne bouge pas sous le doigt.
 *
 *   node tools/serveur-demo-pay-sheets-browser-test.mjs
 *
 * Chasse du 26 nov. 2026, vrais clics sur téléphone 390 px :
 *  · aucune table de la vitrine ne pouvait être encaissée (« envoyez d'abord
 *    la commande en cuisine » sur les tables d'exemple, et « Lancer » ne
 *    marquait rien comme parti) : un prospect ne voyait ni espèces, ni carte,
 *    ni partage ;
 *  · « Montant reçu » était un type=number au pas de 1 : « 1e3 » valait
 *    1 000 MAD et 132,50 ne se tapait pas ;
 *  · la feuille de paiement d'une part s'intitulait « Table Part 1 · 4 » ;
 *  · chaque toucher sur une pastille d'option reconstruisait toute la feuille
 *    et un choix payant la décalait de 15 px ;
 *  · après un pointage de départ, le champ du code gardait l'ancien code.
 * La vitrine n'a pas de commerce : les chiffres tapés à l'écran du code sont
 * quelconques, aucun vrai code n'existe ici. */
import assert from 'node:assert/strict';
import { harness, chromium } from './serveur-live-harness.mjs';
import { suite } from './browser-trace.mjs';

if (!chromium()) { console.log('○ skip: Chromium/puppeteer-core unavailable, browser assertions not executed'); process.exit(process.env.CI ? 1 : 0); }
const h = await harness();   // sert les fichiers du site ; la vitrine n'appelle aucune route
const S = suite('serveur-demo-pay-sheets', { browser: h.browser });
let checks = 0;
const check = (yes, msg) => { assert.ok(yes, msg); checks++; console.log('  ✓ ' + msg); };
const toasts = (page) => page.evaluate(() => [...document.querySelectorAll('#toast-stack .toast')].map((x) => x.textContent).join(' | '));
const onTable = (page) => page.waitForFunction(() => document.getElementById('screen-table')?.classList.contains('is-active'), { timeout: 10000 });
const onFloor = (page) => page.waitForFunction(() => document.getElementById('screen-main')?.classList.contains('is-active'), { timeout: 15000 });
const status = (page, id) => page.evaluate((t) => tables[t].status, id);
const noErrors = (page) => check(page.errors.length === 0, 'aucune erreur de script' + (page.errors.length ? ' : ' + page.errors.join(' | ') : ''));

async function signIn(page) {
  await page.waitForSelector('.pin-key', { visible: true, timeout: 20000 });
  const key = await page.evaluateHandle(() => [...document.querySelectorAll('.pin-key')].find((k) => /^\d$/.test(k.textContent.trim()) && k.textContent.trim() !== '0'));
  for (let i = 0; i < 4; i++) { await key.asElement().click(); await h.sleep(120); }
  await page.waitForFunction(() => document.getElementById('screen-clockin')?.classList.contains('is-active'), { timeout: 10000 });
}
async function clockIn(page) {
  await h.sleep(300);
  await page.click('#attendance-code');
  await page.keyboard.type('246810', { delay: 30 });
  await page.waitForFunction(() => !document.getElementById('ci-button').disabled, { timeout: 5000 });
  await page.click('#ci-button');
  await onFloor(page);
  /* Le mot d'accueil couvre le plan quelques secondes : on attend que la première table soit touchable. */
  await page.waitForFunction(() => { const card = document.querySelector('.table-card[data-table]'); if (!card) return false;
    const r = card.getBoundingClientRect(); return card.contains(document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)); }, { timeout: 20000 });
}
async function openDemo(t, viewport = { width: 390, height: 844 }) {
  const ctx = await h.browser.createBrowserContext(); t.defer(() => ctx.close());
  const page = t.watch(await ctx.newPage());
  page.errors = [];
  page.on('pageerror', (e) => page.errors.push(e.message));
  await page.setViewport(viewport);
  await page.setBypassServiceWorker(true);
  await page.setRequestInterception(true);
  page.on('request', (r) => { const u = r.url(); (u.startsWith(h.base) && !u.startsWith(h.base + '/api/')) || u.startsWith('data:') ? r.continue() : r.abort(); });
  await page.evaluateOnNewDocument(() => { try { Object.defineProperty(navigator.serviceWorker, 'register', { value: () => new Promise(() => {}), configurable: true }); } catch (_) {} });
  await page.goto(h.base + '/kiwi-serveur.html?demo=1', { waitUntil: 'load' });
  await signIn(page);
  await clockIn(page);
  return page;
}
async function openPay(page, table) {
  await h.tap(page, `.table-card[data-table="${table}"]`);
  await onTable(page);
  await h.tap(page, '#td-footer [data-action="pay"]');
  await page.waitForSelector('#pay-choice-modal.is-open', { visible: true, timeout: 4000 }).catch(() => {});
}

try {
  await S.run('vitrine : espèces, carte et partage vont jusqu’au bout', async (t) => {
    const page = await openDemo(t);
    t.step('T2, addition demandée : espèces');
    await openPay(page, 'T2');
    check(await page.evaluate(() => document.getElementById('pay-choice-modal').classList.contains('is-open')), '« Encaisser » ouvre le choix du paiement sur une table d’exemple' + (await toasts(page) ? ' (' + await toasts(page) + ')' : ''));
    await h.tap(page, '#pay-choice-modal [data-pay="cash"]');
    await page.waitForSelector('#cash-modal.is-open #cash-received', { visible: true, timeout: 4000 });
    const total = await page.evaluate(() => getTableTotal('T2'));
    const type = async (text) => { await h.tap(page, '#cash-received'); await page.click('#cash-received', { clickCount: 3 }); await page.keyboard.press('Backspace'); await page.keyboard.type(text, { delay: 20 }); };
    await type('1e3');
    check(await page.evaluate(() => document.getElementById('cash-confirm').disabled), '« 1e3 » n’est pas un montant : « Confirmer » reste grisé');
    await type(String(total) + ',50');
    check(await page.evaluate(() => document.getElementById('cash-received').value).then((v) => v === total + ',50'), 'un montant avec virgule se tape (' + total + ',50)');
    check(/0,50/.test(await page.evaluate(() => document.getElementById('cash-rendu-val').textContent)), 'le rendu est de 0,50 MAD');
    await h.tap(page, '#cash-confirm');
    await page.waitForFunction(() => tables.T2.status === 'khawya', { timeout: 5000 }).catch(() => {});
    check(await status(page, 'T2') === 'khawya', 'payée en espèces, la table T2 est libre' + ' (' + await toasts(page) + ')');
    await h.tap(page, '#cash-modal [data-modal-action="close"]');

    t.step('T1, en cours : carte');
    await onFloor(page);
    await openPay(page, 'T1');
    await h.tap(page, '#pay-choice-modal [data-pay="card"]');
    await page.waitForFunction(() => /approuvée/i.test(document.getElementById('reader-status').textContent), { timeout: 8000 });
    await h.tap(page, '#card-foot.is-visible [data-modal-action="close"]');
    await page.waitForFunction(() => tables.T1.status === 'khawya', { timeout: 5000 }).catch(() => {});
    check(await status(page, 'T1') === 'khawya', 'payée par carte, la table T1 est libre');

    t.step('T4 : partage en deux parts');
    await onFloor(page);
    await openPay(page, 'T4');
    await h.tap(page, '#pay-choice-modal [data-pay="split"]');
    await h.tap(page, '#split-launch');
    const parts = await page.evaluate(() => document.querySelectorAll('[data-pay-part][data-pay-method="cash"]').length);
    for (let i = 0; i < parts; i++) {
      await h.tap(page, `[data-pay-part="${i}"][data-pay-method="cash"]`);
      await page.waitForSelector('#cash-modal.is-open #cash-confirm', { visible: true, timeout: 4000 });
      if (i === 0) {
        const title = await page.evaluate(() => document.querySelector('#cash-modal .modal-subtle').textContent.replace(/\s+/g, ' ').trim());
        check(title === 'Table T4 · part 1', 'la feuille d’une part s’intitule « Table T4 · part 1 » (lu : « ' + title + ' »)');
      }
      await h.tap(page, '#cash-confirm');
      await page.waitForSelector('#cash-step-success:not([hidden])', { visible: true, timeout: 4000 });
      await h.tap(page, '#cash-modal [data-modal-action="close"]');
    }
    await page.waitForFunction(() => tables.T4.status === 'khawya', { timeout: 5000 }).catch(() => {});
    check(await status(page, 'T4') === 'khawya', 'toutes les parts payées, la table T4 est libre');
    check(parts >= 2, parts + ' parts encaissées une à une');
    if (await page.evaluate(() => document.getElementById('split-modal').classList.contains('is-open'))) await h.tap(page, '#split-done-close');

    t.step('T3, libre : ouvrir, commander, lancer, encaisser');
    await onFloor(page);
    await h.tap(page, '.table-card[data-table="T3"]');
    await h.tap(page, '#nt-confirm');
    await onTable(page);
    await h.tap(page, '[data-action="take-order"]');
    await h.tap(page, '.menu-item[data-menu-id="m-023"]');
    await h.tap(page, '#menu-cart-bar.is-visible');
    await onTable(page);
    await h.tap(page, '[data-action="lancer"]');
    await onFloor(page);
    await openPay(page, 'T3');
    await h.tap(page, '#pay-choice-modal [data-pay="cash"]');
    await page.waitForSelector('#cash-modal.is-open #cash-confirm', { visible: true, timeout: 4000 });
    await h.tap(page, '#cash-confirm');
    await page.waitForFunction(() => tables.T3.status === 'khawya', { timeout: 5000 }).catch(() => {});
    check(await status(page, 'T3') === 'khawya', 'une commande lancée dans la vitrine s’encaisse (T3 libre)' + ' (' + await toasts(page) + ')');
    await h.tap(page, '#cash-modal [data-modal-action="close"]');
    await onFloor(page);
    await h.tap(page, '.table-card[data-table="T2"]');
    await page.waitForSelector('#new-table-modal.is-open', { visible: true, timeout: 4000 }).catch(() => {});
    await h.tap(page, '#nt-confirm');
    await onTable(page);
    check(await page.evaluate(() => (tableOrders.T2 || []).length) === 0, 'rouverte, la table T2 payée ne retrouve pas son ancienne commande');
    noErrors(page);
  });

  await S.run('feuille d’options : un toucher ne reconstruit rien et ne décale rien', async (t) => {
    const page = await openDemo(t, { width: 390, height: 520 });
    await page.evaluate(() => document.querySelector('.table-card[data-table="T3"]').scrollIntoView({ block: 'center' }));
    await h.tap(page, '.table-card[data-table="T3"]');
    await h.tap(page, '#nt-confirm');
    await onTable(page);
    await h.tap(page, '[data-action="take-order"]');
    const dish = await page.evaluate(() => {
      /* Un plat dont un choix est payant : c'est lui qui allongeait le sous-titre. */
      const it = menuItems.find((m) => (itemOptions[m.id] || []).some((g) => optionGroups[g].vals.some((v) => v.p > 0)));
      const g = itemOptions[it.id].find((id) => optionGroups[id].vals.some((v) => v.p > 0));
      return { id: it.id, group: g, val: optionGroups[g].vals.find((v) => v.p > 0).n, price: it.price, extra: optionGroups[g].vals.find((v) => v.p > 0).p };
    });
    await page.evaluate((id) => document.querySelector(`.menu-item[data-menu-id="${id}"]`).scrollIntoView({ block: 'center' }), dish.id);
    await h.tap(page, `.menu-item[data-menu-id="${dish.id}"]`);
    await page.waitForSelector('#opt-modal.is-open .opt-pill', { visible: true, timeout: 5000 });
    await h.sleep(500);   // la feuille finit de monter
    const pillSel = `.opt-pill[data-opt-group="${dish.group}"][data-opt-val="${dish.val}"]`;
    const measure = () => page.evaluate((sel) => {
      const body = document.getElementById('opt-modal-body'), pill = document.querySelector(sel);
      window.__pill = window.__pill || pill;
      const scroller = [body, body.parentElement].find((el) => el.scrollHeight > el.clientHeight) || body;
      return { same: window.__pill === pill && pill.isConnected, height: scroller.scrollHeight, top: Math.round(pill.getBoundingClientRect().top), on: pill.classList.contains('on'),
        sub: body.querySelector('.modal-subtle').textContent, confirm: body.querySelector('#opt-confirm').textContent };
    }, pillSel);
    await page.evaluate((sel) => document.querySelector(sel).scrollIntoView({ block: 'center' }), pillSel);
    const before = await measure();
    await page.click(pillSel);
    const picked = await measure();
    check(picked.on, 'le choix payant est pris');
    check(picked.same, 'la pastille touchée est restée la même (la feuille n’est pas reconstruite)');
    check(picked.height === before.height && picked.top === before.top, `rien ne bouge sous le doigt (hauteur ${before.height} → ${picked.height}, pastille ${before.top} → ${picked.top})`);
    check(picked.sub.includes(`+${dish.extra} MAD d'options`), 'le sous-titre annonce le supplément (' + picked.sub + ')');
    check(picked.confirm.replace(/\s/g, '').includes(String(dish.price + dish.extra)), 'le bouton « Ajouter » porte le nouveau total (' + picked.confirm.trim() + ')');
    await page.click(pillSel);
    const back = await measure();
    check(!back.on && back.height === before.height && back.top === before.top && back.sub === before.sub, 'le choix retiré, la feuille revient au même endroit');
    await page.click(pillSel);
    await page.evaluate(() => document.getElementById('opt-confirm').scrollIntoView({ block: 'center' }));
    await h.tap(page, '#opt-confirm');
    if (await page.evaluate(() => document.getElementById('opt-modal').classList.contains('is-open'))) {
      /* Un choix obligatoire manquait : on prend le premier de chaque groupe, puis on ajoute. */
      const groups = await page.evaluate(() => [...new Set([...document.querySelectorAll('.opt-group.missing .opt-pill')].map((p) => p.dataset.optGroup))]);
      for (const g of groups) await page.evaluate((id) => document.querySelector(`.opt-group.missing .opt-pill[data-opt-group="${id}"]`).scrollIntoView({ block: 'center' }), g).then(() => page.click(`.opt-group.missing .opt-pill[data-opt-group="${g}"]`));
      await page.evaluate(() => document.getElementById('opt-confirm').scrollIntoView({ block: 'center' }));
      await h.tap(page, '#opt-confirm');
    }
    check(await page.evaluate((id) => (tableOrders.T3 || []).some((l) => l.id === id && (l.opts || []).length > 0), dish.id), 'le plat s’ajoute avec ses options');
    noErrors(page);
  });

  await S.run('pointage : le champ du code repart vide', async (t) => {
    const page = await openDemo(t);
    await h.tap(page, '.bt-btn[data-tab="profil"]');
    await page.evaluate(() => document.getElementById('profil-clockout').scrollIntoView({ block: 'center' }));
    await h.tap(page, '#profil-clockout');
    await h.tap(page, '#kg-sc-clockout');
    await page.waitForFunction(() => document.getElementById('screen-pin')?.classList.contains('is-active'), { timeout: 10000 });
    await signIn(page);
    await h.sleep(400);
    check(await page.evaluate(() => document.getElementById('attendance-code').value) === '', 'après un départ, le champ du code de pointage est vide');
    await clockIn(page);
    check(await page.evaluate(() => document.getElementById('screen-main').classList.contains('is-active')), 'un nouveau code se tape et ouvre le service');
    noErrors(page);
  });
} finally {
  await h.close();
}
console.log(`\nserveur-demo-pay-sheets-browser-test: ${checks} checks passed`);
// Un scénario rouge (S.run) doit sortir en rouge : sinon le gate le compte vert.
process.exit(await S.finish({ exit: false }));
