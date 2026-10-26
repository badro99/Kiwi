#!/usr/bin/env node
import { forLocales } from './test-locales.mjs';
/* Team app (kiwi-serveur.html) : « Consulter sans pointer » est en lecture seule.
 *
 * Le commentaire du CSS promettait une vue verrouillée, mais le mode n'était
 * appliqué que par `display:none` sur la barre d'onglets : les panneaux
 * restaient montés et vivants. Un employé non pointé pouvait encore atteindre
 * Encaisser, ajouter un plat, annuler, transférer, fusionner, envoyer.
 *
 * Trois verrous, tous vérifiés ici dans la vraie page (Chromium) :
 *   1 · `inert` sur tout ce qui n'est pas le profil (onglets, barre panier,
 *       modales de commande et de paiement), sauf planning et historique.
 *   2 · un garde-clic en phase de capture : même un clic programmatique sur un
 *       bouton d'action n'atteint aucun gestionnaire.
 *   3 · un garde au pied de chaque fonction qui écrit : ouverture de table,
 *       onglet, paiement, envoi en cuisine, état de table.
 * Et le refus est dit dans la langue de l'employé (FR / EN / AR). Aucune requête
 * d'écriture (/api/sale, /api/order/queue, /api/service/events) ne part.
 * Quitter la consultation (Pointer mon arrivée) rend tout, sans changement pour
 * un employé pointé.
 */
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { createRequire } from 'node:module';
import { readNativeRuntime } from './native-runtime-source.mjs';

const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const require = createRequire(path.join(root, 'app/package.json'));
const puppeteer = require('puppeteer-core');
const bin = process.env.KIWI_CHROMIUM_BIN
  || ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/chromium', '/usr/bin/google-chrome'].find(fs.existsSync);
assert.ok(bin, 'Chromium required');

const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.json': 'application/json' };
const server = http.createServer((req, res) => {
  const p = path.resolve(root, '.' + decodeURIComponent(new URL(req.url, 'http://local').pathname));
  if (!p.startsWith(root + path.sep)) { res.writeHead(403); res.end(); return; }
  fs.readFile(p, (err, data) => {
    res.writeHead(err ? 404 : 200, { 'Content-Type': mime[path.extname(p)] || 'application/octet-stream' });
    res.end(err ? '' : data);
  });
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await puppeteer.launch({ executablePath: bin, headless: true, args: ['--no-sandbox'] });
let checks = 0;
const check = (value, label) => { assert.ok(value, label); checks++; console.log('  ✓ ' + label); };

const MESSAGES = {
  fr: 'Pointez votre arrivée pour prendre une commande ou un paiement',
  en: 'Clock in to take an order or a payment',
  ar: 'سجّل حضورك لأخذ طلب أو تسجيل دفعة',
};

async function open(lang) {
  const context = await browser.createBrowserContext();
  const page = await context.newPage();
  await page.setViewport({ width: 402, height: 874, isMobile: true, hasTouch: true });
  const writes = [];
  await page.setRequestInterception(true);
  page.on('request', (r) => {
    const u = r.url();
    if (r.method() !== 'GET' && /\/api\/(sale|order\/queue|service\/events)/.test(u)) writes.push(r.method() + ' ' + u);
    if (r.method() === 'POST' && new URL(u).pathname === '/api/sale') r.respond({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, id: 'paiement-local' }) });
    else if (u.startsWith(base)) r.continue(); else r.abort();
  });
  await page.evaluateOnNewDocument((l) => {
    try { localStorage.setItem('kiwi-employee-language:demo', l); } catch (_) {}
  }, lang);
  // coverage: surface=team-entry locale=fr viewport=phone
  // coverage: surface=team-entry locale=en viewport=phone
  // coverage: surface=team-entry locale=ar viewport=phone
  await page.goto(base + '/kiwi-serveur.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => typeof enterBrowseMode === 'function' && !!document.querySelector('#ci-browse-link'), { timeout: 10000 });
  return { page, context, writes };
}

const toastText = (page) => page.evaluate(() => Array.from(document.querySelectorAll('#toast-stack > *')).map((n) => n.textContent.trim()));

try {
  // coverage: surface=team-entry locale=fr viewport=phone
  const { page, context, writes } = await open('fr');
  await page.evaluate(() => {
    /* Une table occupée et une commande, pour que les gardes aient de quoi
       agir : sans le verrou, openTableDetail ouvrirait bien le détail. */
    tables['9'] = { status: 'ka-yaklo', covers: 2, elapsed: 5 };
    tableOrders['9'] = [{ uid: 'u1', id: 'i1', name: 'Tajine', price: 80, qty: 1, sentQty: 0 }];
    enterBrowseMode();
  });

  const state = await page.evaluate(() => ({
    browse: document.body.classList.contains('is-browse-mode'),
    inertTabs: Array.from(document.querySelectorAll('#screen-main .tab')).filter((t) => t.inert).map((t) => t.dataset.tab).sort(),
    profilInert: document.querySelector('.tab-profil').inert,
    profilVisible: !document.querySelector('.tab-profil').hidden,
    cartBarInert: document.getElementById('menu-cart-bar').inert,
    orderModalsInert: ['new-table-modal', 'transfer-table-modal', 'merge-table-modal', 'void-reason-modal', 'pay-choice-modal', 'card-modal', 'cash-modal', 'split-modal', 'opt-modal', 'formula-modal', 'service-client-modal']
      .every((id) => document.getElementById(id).inert),
    scheduleModalsLive: !document.getElementById('month-schedule-modal').inert && !document.getElementById('hours-history-modal').inert,
  }));
  check(state.browse, 'la consultation est active');
  check(state.inertTabs.join() === 'menu,notifications,tables', 'tables, menu et notifications sont inertes');
  check(!state.profilInert && state.profilVisible, 'le profil reste vivant et visible');
  check(state.cartBarInert, 'la barre panier est inerte');
  check(state.orderModalsInert, 'les modales de commande, paiement, transfert et fusion sont inertes');
  check(state.scheduleModalsLive, 'planning du mois et historique des heures restent utilisables');

  /* setTab */
  await page.evaluate(() => { setTab('tables'); });
  check(await page.evaluate(() => currentTab === 'profil' && document.querySelector('.tab-tables').hidden), 'setTab("tables") est refusé, le profil reste affiché');
  check((await toastText(page)).includes(MESSAGES.fr), 'le refus dit « Pointez votre arrivée… » en français');

  /* Ouvrir une table */
  await page.evaluate(() => { openTableDetail('9'); });
  check(await page.evaluate(() => !document.getElementById('screen-table').classList.contains('is-active')), 'openTableDetail est refusé');
  await page.evaluate(() => { openNewTableModal('9'); openPayChoice('9'); openCashModal('9'); openCardModal('9'); });
  check(await page.evaluate(() => !document.querySelector('.modal-veil.is-open, .modal-veil.on, .modal-veil.is-active')), 'aucune modale de commande ou de paiement ne s\'ouvre');

  /* Fonctions qui écrivent */
  const money = await page.evaluate(async () => ({
    paid: await markTablePaid('9', 'cash'),
    batch: await svSendOrder('9'),
    publish: await publishServiceTableState('9', 'khlass', 2, true),
    status: tables['9'].status,
  }));
  check(money.paid === false && money.status === 'ka-yaklo', 'markTablePaid refuse et la table ne change pas d\'état');
  check(money.batch && money.batch.ok === false && money.batch.error === 'browse-mode', 'svSendOrder (envoi en cuisine) refuse');
  check(money.publish && money.publish.ok === false, 'publishServiceTableState (fermeture de table) refuse');

  /* Garde-clic : un clic programmatique sur chaque action atteint-il un gestionnaire ? */
  const clickResult = await page.evaluate(() => {
    const seen = [];
    const footer = document.getElementById('td-footer');
    ['pay', 'take-order', 'lancer', 'cancel-table', 'transfer-table', 'merge-table', 'ask-bill'].forEach((a) => {
      const b = document.createElement('button');
      b.dataset.action = a;
      footer.appendChild(b);
    });
    /* Un écouteur posé APRÈS le garde, sur le pied de table : s'il reçoit un
       clic, le garde de capture a échoué. */
    footer.addEventListener('click', (e) => { const b = e.target.closest('[data-action]'); if (b) seen.push(b.dataset.action); });
    footer.querySelectorAll('[data-action]').forEach((b) => b.click());
    const mg = document.getElementById('menu-grid');
    const stepBtn = document.createElement('button'); stepBtn.className = 'step-btn'; stepBtn.dataset.step = 'inc';
    mg.addEventListener('click', (e) => { if (e.target.closest('.step-btn')) seen.push('menu-step'); });
    mg.appendChild(stepBtn); stepBtn.click();
    const bar = document.getElementById('menu-cart-bar'); bar.addEventListener('click', () => seen.push('cart-bar')); bar.click();
    return seen;
  });
  check(clickResult.length === 0, 'aucun clic sur Encaisser, Ajouter, Envoyer, Annuler, Transférer, Fusionner, Addition, + ou panier n\'atteint un gestionnaire (reçu : ' + JSON.stringify(clickResult) + ')');
  check(writes.length === 0, 'aucune requête d\'écriture vers /api/sale, /api/order/queue ou /api/service/events n\'est partie');
  await context.close();

  /* Traductions */
  for (const lang of forLocales(['en', 'ar'])) {
    // coverage: surface=team-entry locale=en viewport=phone
    // coverage: surface=team-entry locale=ar viewport=phone
    const t = await open(lang);
    await t.page.evaluate(() => { enterBrowseMode(); openTableDetail('9'); });
    const toasts = await toastText(t.page);
    check(toasts.includes(MESSAGES[lang]), 'le refus est traduit (' + lang + ') : ' + MESSAGES[lang]);
    await t.context.close();
  }

  /* Sortie : un employé qui pointe retrouve tout */
  // coverage: surface=team-entry locale=fr viewport=phone
  const out = await open('fr');
  await out.page.evaluate(() => {
    tables['9'] = { status: 'ka-yaklo', covers: 2, elapsed: 5 };
    enterBrowseMode();
    exitBrowseMode();
  });
  const back = await out.page.evaluate(() => ({
    browse: document.body.classList.contains('is-browse-mode'),
    anyInert: Array.from(document.querySelectorAll('#screen-main .tab, #menu-cart-bar, .modal-veil')).some((n) => n.inert),
  }));
  check(!back.browse && !back.anyInert, 'exitBrowseMode rend onglets, panier et modales');
  await out.page.evaluate(() => { setTab('tables'); });
  check(await out.page.evaluate(() => currentTab === 'tables'), 'hors consultation, setTab("tables") fonctionne comme avant');
  /* Règlement réel dans le navigateur, API locale synthétique. */
  await out.page.evaluate(() => {
    showScreen('screen-main');
    tableOrders['9'] = [{ uid: 'paiement-test', id: 'i1', name: 'Tajine', price: 80, qty: 1, sentQty: 1 }];
    liveEmployeeState = { merchant: 'serveur-test-local' };
    serviceTableSessions.set('9', 'visite-test-locale');
    dirtyOrders.delete('9');
    openPayChoice('9');
  });
  await out.page.locator('#pay-choice-modal [data-pay="cash"]').click();
  await out.page.waitForSelector('#cash-modal.is-open #cash-received', { visible: true, timeout: 10000 });
  await out.page.locator('#cash-received').fill('100');
  await out.page.locator('#cash-confirm').click();
  await out.page.waitForFunction(() => tables['9'].status === 'khawya', { timeout: 10000 });
  check(await out.page.evaluate(() => tables['9'].status === 'khawya'), 'le paiement espèces solde la table après la sortie de consultation');
  check(out.writes.filter(url => url.includes('/api/sale')).length === 1, 'un seul paiement confirmé est envoyé à l’API synthétique');
  const rapport = await out.page.evaluate(() => kgSnapshot());
  check(rapport.revenue === 80 && rapport.paid === 1, 'le rapport de service compte exactement 80 MAD et une table payée');
  /* Quitter l'écran principal quitte aussi la consultation (session expirée). */
  await out.page.evaluate(() => { enterBrowseMode(); showScreen('screen-pin'); });
  check(await out.page.evaluate(() => !document.body.classList.contains('is-browse-mode') && !document.querySelector('#screen-main .tab').inert),
    'showScreen vers un autre écran lève le verrou (pas de verrou résiduel au prochain employé)');
  await out.context.close();

  /* Hôte natif : pas de capsule d'onglets en consultation. */
  const native = readNativeRuntime(root);
  check(/teamReady = function \(\)[^;]*!document\.body\.classList\.contains\('is-browse-mode'\)/.test(native),
    'native-runtime.js ne pousse aucun onglet d\'équipe en consultation (cohérent avec le verrou)');

  console.log(`team-browse-readonly-browser-test: ${checks} checks passed`);
} finally {
  await browser.close();
  await new Promise((r) => server.close(r));
}
