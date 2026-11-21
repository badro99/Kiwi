#!/usr/bin/env node
/* La table a rouvert sous une nouvelle visite pendant que le téléphone
 * montrait encore l'ancienne note : le paiement est refusé, et la relance
 * part contre la nouvelle note, à son montant.
 *
 *   node tools/serveur-reopened-payment-browser-test.mjs
 *
 * Revue de sécurité (round 3) : un téléphone resté sur la feuille de partage
 * d'une visite que la caisse venait de solder envoyait sa part 2 ; le refus
 * (409 visit-already-settled, reopened) lui faisait oublier la visite mais pas
 * le partage, et sa relance contre la nouvelle tablée, même flux, soldait ses
 * 56,00 avec les 14,00 de la précédente. Ici, vraies routes et vrai téléphone
 * (tools/serveur-live-harness.mjs ; la relecture retenue par `hold` garde le
 * téléphone sur l'ancienne image) :
 *   · paiement simple par carte : refusé, rien d'écrit, le téléphone dit que la
 *     carte a pu être débitée ; relu, la relance va sur la nouvelle visite avec
 *     son montant ;
 *   · part d'un partage : refusée, le partage de l'ancienne note est jeté
 *     (feuille fermée, parts, identifiants) ; relu, un nouveau partage part du
 *     total de la nouvelle visite et l'encaissement va sur elle.
 * Restaurant inventé, aucun code saisi. */
import assert from 'node:assert/strict';
import { harness, chromium } from './serveur-live-harness.mjs';
import { suite } from './browser-trace.mjs';
import { onRequestPost as sale } from '../functions/api/sale.js';
import { onRequestPost as serviceEvents } from '../functions/api/service/events.js';

if (!chromium()) { console.log('○ skip: Chromium/puppeteer-core unavailable, browser assertions not executed'); process.exit(process.env.CI ? 1 : 0); }
const h = await harness();
const S = suite('serveur-reopened-payment', { browser: h.browser });
let checks = 0;
const check = (yes, msg) => { assert.ok(yes, msg); checks++; console.log('  ✓ ' + msg); };

const visitOf = (table) => (h.db.openSessions().find((s) => s.table_no === table) || {}).id;
const salesOn = (session) => h.db.sales().filter((s) => s.session_id === session);
const status = (session) => h.sql.prepare('SELECT status FROM table_sessions WHERE id = ?').get(session).status;
const lastSale = () => h.calls.filter((c) => c.who === 'serveur' && c.path === '/api/sale').at(-1) || {};
/* Attente sur l'état du téléphone ; à l'échec, ce qu'il voit de la table. */
async function phoneSees(page, table, fn, label, ...args) {
  try { await page.waitForFunction(fn, { timeout: 10000 }, ...args); } catch (e) {
    const seen = await page.evaluate((t) => ({ total: getTableTotal(t), session: serviceTableSessions.get(t) || null, status: tables[t] && tables[t].status, local: JSON.stringify(tableOrders[t] || null),
      canon: [...serviceCanonicalOrders.values()].filter((o) => String(o.table) === t).map((o) => [o.session, o.paid, o.total]) }), table);
    throw new Error('jamais : ' + label + ' ; le téléphone voit ' + JSON.stringify(seen));
  }
}
const toasts = (page) => page.evaluate(() => [...document.querySelectorAll('#toast-stack .toast')].map((x) => x.textContent).join(' | '));
const toastSays = (page, re) => page.evaluate((src) => [...document.querySelectorAll('#toast-stack .toast')].some((x) => new RegExp(src).test(x.textContent)), re.source);

/* La caisse encaisse ce qui reste de la visite et la clôt (vraie route /api/sale). */
async function tillPays(id, table, session, cents) {
  const request = new Request('https://kiwi-os.com/api/sale', {
    method: 'POST', headers: { Cookie: h.tillCookie, 'Content-Type': 'application/json', Origin: 'https://kiwi-os.com' },
    body: JSON.stringify({ id, merchant: h.merchant, table, session, amount: cents / 100, amountCents: cents, method: 'cash', ts: Date.now(), ref: 'T' + table, label: 'T' + table, lines: [{ name: 'Reste', qty: 1, total: cents / 100 }] }),
  });
  const res = await sale({ request, env: h.env, waitUntil() {} });
  assert.equal(res.status, 200, 'la caisse encaisse : ' + await res.text());
}
/* Une nouvelle tablée s'installe à la caisse : une visite ouverte, une commande, et la table
 * annoncée installée sur le plan partagé (vraie route /api/service/events, l'événement « table-seated » de la caisse). */
async function newParty(id, table, itemId, name, qty, unit) {
  const now = Date.now();
  h.sql.prepare("INSERT INTO table_sessions (id, merchant, mode, table_no, status, opened_ts, seen_ts) VALUES (?, ?, 'table', ?, 'open', ?, ?)").run(id, h.merchant, table, now, now);
  h.sql.prepare("INSERT INTO orders (id, merchant, number, mode, table_no, total, lines, status, created_ts, updated_ts, session_id) VALUES (?, ?, 900, 'table', ?, ?, ?, 'accepted', ?, ?, ?)")
    .run(id + '-o1', h.merchant, table, qty * unit, JSON.stringify([{ id: itemId, name, qty, unitPrice: unit }]), now, now, id);
  const request = new Request('https://kiwi-os.com/api/service/events', {
    method: 'POST', headers: { Cookie: h.tillCookie, 'Content-Type': 'application/json', Origin: 'https://kiwi-os.com' },
    body: JSON.stringify({ merchant: h.merchant, event: { type: 'table-seated', table, covers: 2 } }),
  });
  const res = await serviceEvents({ request, env: h.env, waitUntil() {} });
  assert.equal(res.status, 200, 'la caisse annonce la table occupée : ' + await res.text());
}
async function sends(page, table, itemId, times) {
  await h.tap(page, `.table-card[data-table="${table}"]`);
  await h.tap(page, '#nt-confirm');
  await h.tap(page, '[data-action="take-order"]');
  for (let i = 0; i < times; i++) await h.tap(page, `.menu-item[data-menu-id="${itemId}"]`);
  await h.tap(page, '#menu-cart-bar.is-visible');
  await h.tap(page, '[data-action="lancer"]');
  await h.until(() => h.db.tickets(table).length === 1 && visitOf(table), `la commande de la table ${table} part en cuisine`, 10000);
  const visit = visitOf(table);
  await page.evaluate(() => pollServiceSync());
  /* « Lancer » confirmé et relu : plus rien d'unsent ni de sale côté téléphone (sinon « envoyez d'abord
     la commande »), et la visite connue (sinon « paiement impossible », sans visite à régler). */
  await phoneSees(page, table, (t, c, v) => Math.round(getTableTotal(t) * 100) === c && !dirtyOrders.has(t)
    && serviceTableSessions.get(t) === v
    && (tableOrders[t] || []).every((l) => Math.max(0, Number(l.qty) || 0) <= Math.max(0, Number(l.sentQty) || 0)),
  `la table ${table} relue`, table, times * 1400, visit);
  return visit;
}

/* Le chemin du serveur vers la feuille de partage : la table, « Encaisser », « Partager ». */
async function openSplit(page, table) {
  if (await page.evaluate(() => document.getElementById('screen-table')?.classList.contains('is-active'))) {
    await h.tap(page, '#td-back');
  }
  await h.tap(page, `.table-card[data-table="${table}"]`);
  await h.tap(page, '[data-action="pay"]');
  await h.tap(page, '[data-pay="split"]');
}
/* Une part en espèces, par gestes : le bouton « Cash » de la part, puis « Confirmer » (montant prérempli). */
async function payPartCash(page, idx) {
  await h.tap(page, `.split-part-btn[data-pay-part="${idx}"][data-pay-method="cash"]`);
  await page.waitForSelector('#cash-modal.is-open', { visible: true, timeout: 5000 });
  await h.tap(page, '#cash-confirm');
}

try {
  await S.run('paiement simple par carte, table rouverte entre-temps', async (t) => {
    const page = await h.openWaiter(t);
    const visitA = await sends(page, '4', 'it_msemen', 1);

    t.step('la caisse solde la table et une nouvelle tablée s’installe ; le téléphone n’a pas relu');
    h.hold('GET /api/order/queue');
    await tillPays('till-a-4', '4', visitA, 1400);
    check(status(visitA) === 'closed', 'la visite A est soldée à la caisse');
    await newParty('tsx-reopen-b-table4', '4', 'it_omelette', 'Omelette', 2, 25);

    t.step('le serveur encaisse par carte la note qu’il voit encore');
    const first = await page.evaluate(() => markTablePaid('4', 'card'));
    const refused = lastSale();
    check(first === false && refused.status === 409 && /"reopened":true/.test(refused.body || '') && /"amountCents":1400/.test(refused.sent || '') && new RegExp(`"session":"${visitA}"`).test(refused.sent || ''),
      `refusé : 14,00 contre la visite A, 409 reopened (${refused.status} ${first} ${await toasts(page)})`);
    check(salesOn(visitA).length === 1 && salesOn('tsx-reopen-b-table4').length === 0, 'rien n’est écrit : A garde la seule vente de la caisse, B n’a rien');
    check(await toastSays(page, /carte a pu être débitée : ne la repassez pas, vérifiez le ticket/), 'le téléphone dit que la carte a pu être débitée et de vérifier le ticket');
    check(await page.evaluate(() => !serviceTableSessions.has('4')), 'il oublie la visite A');

    t.step('la relecture arrive ; il relance');
    h.release('GET /api/order/queue');
    await page.evaluate(() => pollServiceSync());
    await phoneSees(page, '4', () => serviceTableSessions.get('4') === 'tsx-reopen-b-table4' && Math.round(getTableTotal('4') * 100) === 5000, 'la visite B à 50,00');
    const second = await page.evaluate(() => markTablePaid('4', 'card'));
    const landed = lastSale();
    check(second === true && landed.status === 200 && /"amountCents":5000/.test(landed.sent || '') && /"session":"tsx-reopen-b-table4"/.test(landed.sent || ''),
      `la relance va sur la visite B, à son montant : 50,00 (${landed.status})`);
    const onB = salesOn('tsx-reopen-b-table4');
    check(onB.length === 1 && onB[0].amount_cents === 5000 && onB[0].method === 'card' && status('tsx-reopen-b-table4') === 'closed', 'une vente de 50,00 sur B, B soldée');
    check(salesOn(visitA).length === 1 && salesOn(visitA)[0].amount_cents === 1400, 'A reste à sa seule vente de 14,00');
    check(page.errors.length === 0, 'aucune erreur de script' + (page.errors.length ? ' : ' + page.errors.join(' | ') : ''));
  });

  await S.run('part d’un partage, table rouverte entre-temps (vrais gestes)', async (t) => {
    const page = await h.openWaiter(t);
    const visitA = await sends(page, '5', 'it_msemen', 2);

    t.step('le serveur partage en deux et encaisse la part 1 en espèces');
    await openSplit(page, '5');
    await h.tap(page, '.split-chip[data-parts="2"]');
    await h.tap(page, '#split-launch');
    await payPartCash(page, 0);
    await page.waitForSelector('#cash-step-success:not([hidden])', { visible: true, timeout: 10000 });
    check(salesOn(visitA).length === 1 && salesOn(visitA)[0].amount_cents === 1400, 'part 1 encaissée : 14,00 sur la visite A');
    const flowId = await page.evaluate(() => splitState.flow.id);
    await h.tap(page, '#cash-step-success [data-modal-action="close"]');
    await page.waitForSelector('#split-modal.is-open', { visible: true, timeout: 5000 });

    t.step('la caisse prend les 14,00 restants et clôt A ; une tablée de 56,00 s’installe ; le téléphone reste sur sa feuille');
    h.hold('GET /api/order/queue');
    await tillPays('till-a-5', '5', visitA, 1400);
    check(status(visitA) === 'closed', 'la visite A est soldée à la caisse');
    await newParty('tsx-reopen-b-table5', '5', 'it_msemen', 'Msemen miel', 4, 14);

    t.step('le serveur encaisse la part 2 de l’ancienne feuille');
    await payPartCash(page, 1);
    await page.waitForFunction(() => [...document.querySelectorAll('#toast-stack .toast')].some((x) => /la note a changé/.test(x.textContent)), { timeout: 15000 });
    const refused = lastSale();
    check(refused.status === 409 && /"reopened":true/.test(refused.body || '') && /"amountCents":1400/.test(refused.sent || ''), `refusée : la part de 14,00 contre A, 409 reopened (${refused.status})`);
    check(salesOn('tsx-reopen-b-table5').length === 0 && salesOn(visitA).length === 2, 'rien n’est écrit : B n’a rien, A garde la part 1 et la caisse');
    check(await page.evaluate(() => document.getElementById('cash-step-success').hidden === true), 'les espèces ne s’affichent pas comme confirmées');
    const dropped = await page.evaluate((flow) => ({
      splits: tableSplits.has('5'), flow: splitState.flow,
      ids: [0, 1].some((i) => employeePaymentRefs.has('5:split:' + i)),
      saved: Object.entries(JSON.parse(localStorage.getItem(EMP_PAY_REFS_KEY) || '{}')).some(([k, v]) => k.startsWith('split:') && v && v.id === flow),
    }), flowId);
    check(!dropped.splits && !dropped.flow, 'le partage de l’ancienne note est jeté');
    check(!dropped.ids && !dropped.saved, 'ses identifiants de parts et sa copie enregistrée aussi');
    check(await toastSays(page, /la note a changé, vérifiez le total puis réessayez/), 'le téléphone dit que la note a changé');

    t.step('le serveur ferme la feuille des espèces (tap hors de la feuille)');
    const sheet = await page.$eval('#cash-modal .modal', (el) => { const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top }; });
    await page.mouse.click(sheet.x, Math.max(5, sheet.y - 30));
    await page.waitForFunction(() => !document.getElementById('cash-modal').classList.contains('is-open'), { timeout: 5000 });
    await h.sleep(300);
    check(await page.evaluate(() => !document.getElementById('split-modal').classList.contains('is-open')), 'l’ancienne feuille de partage ne se rouvre pas derrière');

    t.step('la relecture arrive ; un nouveau partage part de la nouvelle note');
    h.release('GET /api/order/queue');
    await h.sleep(600);
    await page.evaluate(() => pollServiceSync());
    await phoneSees(page, '5', () => Math.round(getTableTotal('5') * 100) === 5600 && serviceTableSessions.get('5') === 'tsx-reopen-b-table5', 'la visite B à 56,00');
    await openSplit(page, '5');
    const fresh = await page.evaluate(() => ({ flow: splitState.flow, total: splitState.totalCents, setup: !document.getElementById('split-setup').hidden, shown: document.getElementById('split-total-display').textContent }));
    check(!fresh.flow && fresh.setup && fresh.total === 5600, `le partage repart de zéro sur 56,00, pas sur l’ancienne feuille (${fresh.total}, affiché ${fresh.shown})`);
    await h.tap(page, '.split-chip[data-parts="2"]');
    await h.tap(page, '#split-launch');
    for (const idx of [0, 1]) {
      await payPartCash(page, idx);
      await page.waitForSelector('#cash-step-success:not([hidden])', { visible: true, timeout: 10000 });
      await h.tap(page, '#cash-step-success [data-modal-action="close"]');
      await page.waitForFunction(() => !document.getElementById('cash-modal').classList.contains('is-open'), { timeout: 5000 });
    }
    const onB = salesOn('tsx-reopen-b-table5');
    await h.until(() => status('tsx-reopen-b-table5') === 'closed', 'B soldée', 10000).catch(() => {});
    check(onB.length === 2 && onB.reduce((sum, x) => sum + x.amount_cents, 0) === 5600 && status('tsx-reopen-b-table5') === 'closed', `deux parts sur B, 56,00 au centime, B soldée (${onB.map((x) => x.amount_cents).join(' + ')})`);
    check(h.sql.prepare('SELECT COUNT(*) AS n FROM sales WHERE split_flow_id = ? AND session_id = ?').get(flowId, 'tsx-reopen-b-table5').n === 0, 'aucune part de l’ancien partage sur B');
    check(page.errors.length === 0, 'aucune erreur de script' + (page.errors.length ? ' : ' + page.errors.join(' | ') : ''));
  });
} finally {
  await h.close();
}
console.log(`\nserveur-reopened-payment-browser-test: ${checks} checks passed`);
// Un scénario rouge (S.run) doit sortir en rouge : sinon le gate le compte vert.
process.exit(await S.finish({ exit: false }));
