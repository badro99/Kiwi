#!/usr/bin/env node
/* tools/table-visit-reuse-test.mjs — une nouvelle tablée ne doit jamais
 * hériter de la visite réglée de la précédente.
 *
 * Pasta Corner, table 6, bon #86 : le bon est parti en cuisine, puis la table
 * a disparu de la caisse et le bon n'apparaissait plus nulle part comme dû.
 * La fermeture de la tablée précédente n'avait pas encore atteint le serveur ;
 * le premier bon de la tablée suivante rejoignait donc CETTE visite, et le
 * règlement rejoué de l'ancienne tablée le soldait puis vidait la table.
 *
 * Banc : les VRAIES fonctions (functions/api/order/queue.js) sur SQLite avec un
 * vrai cookie de caisse, le VRAI assets/kitchen-relay.js, et les fonctions
 * livrées de kiwi-caisse.html dans une VM. Données synthétiques uniquement.
 *
 *   node tools/table-visit-reuse-test.mjs
 */
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { tillToken, TILL_COOKIE } from '../functions/auth/_lib.js';
import * as queue from '../functions/api/order/queue.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = fs.readFileSync(path.join(ROOT, 'kiwi-caisse.html'), 'utf8');
const relaySource = fs.readFileSync(path.join(ROOT, 'assets/kitchen-relay.js'), 'utf8');
function fn(name, indent = 4) {
  const start = source.search(new RegExp(`^ {${indent}}(?:async )?function ${name}\\(`, 'm'));
  assert.ok(start >= 0, `function ${name} exists`);
  const rest = source.slice(start);
  const end = rest.search(new RegExp(`^ {${indent}}}`, 'm'));
  return rest.slice(0, end + indent + 1);
}
const bridgeStart = source.indexOf('    window.KiwiCaisseKitchen = {');
assert.ok(bridgeStart > 0, 'KiwiCaisseKitchen bridge exists');
const bridgeSource = source.slice(bridgeStart, source.indexOf('\n    };', bridgeStart) + 7);
const noop = () => {};
const MERCHANT = 'visit-reuse-fixture', SECRET = 'synthetic-visit-reuse-only';

let failures = 0, passes = 0;
function check(label, condition, detail) {
  if (condition) { passes++; console.log(`  ✓ ${label}`); return; }
  failures++; console.log(`  ✗ ${label}${detail ? '\n      ' + JSON.stringify(detail) : ''}`);
}

async function setup() {
  const db = new DatabaseSync(':memory:');
  db.exec(fs.readFileSync(path.join(ROOT, 'schema.sql'), 'utf8'));
  const now = Date.now();
  db.prepare('INSERT INTO store_docs (merchant, feature, data, rev, updated_ts) VALUES (?, ?, ?, 1, ?)')
    .run(MERCHANT, 'floorplan', JSON.stringify({ tables: ['5', '6', '7'].map(num => ({ id: 'T' + num, num })) }), now);
  db.prepare('INSERT INTO merchant_config (merchant, features, updated_ts) VALUES (?, ?, ?)').run(MERCHANT, '{"orderpro":true}', now);
  const DB = {
    prepare(sql) { let args = []; return {
      bind(...v) { args = v.map(x => x === undefined ? null : x); return this; },
      first() { return db.prepare(sql).get(...args) || null; },
      all() { return { results: db.prepare(sql).all(...args) }; },
      run() { return { success: true, meta: { changes: db.prepare(sql).run(...args).changes } }; } }; },
    async batch(st) { db.exec('BEGIN IMMEDIATE'); try { const r = []; for (const s of st) r.push(await s.run()); db.exec('COMMIT'); return r; } catch (e) { db.exec('ROLLBACK'); throw e; } },
  };
  const env = { DB, AUTH_SECRET: SECRET };
  const cookie = `${TILL_COOKIE}=${await tillToken(SECRET, MERCHANT)}`;
  const api = (url, init = {}) => {
    const request = new Request('https://k.invalid' + url, { ...init, headers: { ...(init.headers || {}), Cookie: cookie } });
    return (init.method === 'POST' ? queue.onRequestPost : queue.onRequestGet)({ env, request, waitUntil: noop });
  };
  const post = async body => (await api('/api/order/queue', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })).json();
  const get = async () => (await api(`/api/order/queue?merchant=${MERCHANT}&since=0`)).json();

  const store = new Map([['kiwiLiveMerchant', MERCHANT], ['kiwiPaired', '1']]);
  const events = [];
  const node = () => ({ style: {}, dataset: {}, classList: { add: noop, remove: noop, contains: () => false, toggle: noop }, querySelector: () => null, setAttribute: noop });
  const c = {
    console, Date, Map, Set, Promise, Object, Number, String, Array, JSON, Math, Uint8Array, crypto, setInterval, clearInterval,
    IS_DEMO: false, tables: {}, tableOrders: {}, orders: {}, servers: {},
    phoneSeats: new Map(), phoneMovedVisits: new Map(), phonePending: new Map(), tableClosedAt: {}, tableSplits: new Map(), journal: [],
    opTickets: new Map(), opUnmatchedTables: new Set(), kdsOrders: [], kdsOrderSeq: 85, recoveredPaidVisits: new Set(),
    expiredOrders: [], dismissedExpiredIds: new Set(), vrapEditingNum: null, mode: 'salle', selectedId: null, cart: [], vrapView: 'board',
    document: { body: node(), dispatchEvent: e => events.push(e), getElementById: node, querySelector: () => null },
    CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init.detail; } },
    localStorage: { getItem: k => store.has(k) ? store.get(k) : null, setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) },
    fetch: (url, init) => api(url, init),
    navigator: {}, $: node, $$: () => [], lucide: { createIcons: noop }, kdsEl: node(),
    toast: noop, currentMerchantSlug: () => MERCHANT,
    refreshTableNode: noop, renderRightPanel: noop, renderOrderPanel: noop, renderVrapBoard: noop, renderRealGrid: noop,
    renderSalle: noop, persistShift: noop, publishServiceFloor: noop, updateKdsCount: noop, printKitchenTickets: noop,
    closeRightPanel: () => { c.selectedId = null; }, renderMenu: noop,
    backToSalle: keep => { c.mode = 'salle'; c.selectedId = keep || null; },
    storeIsReal: () => true, menuLineFind: () => null, optVisuals: () => [], kitchenNote: l => (l.note || ''),
    kdsStations: () => [], kdsStationFor: () => 'kitchen', kdsStationForName: () => 'kitchen', reconcileReceiptOrderNumber: noop,
    serverNameFor: () => '', kdsPaint: noop, retireRejectedKitchenTicket: noop, rememberArchivedTakeaway: noop,
    archivedTakeawaySet: () => new Set(), newLineUid: () => 'uid-' + Math.random().toString(36).slice(2),
    lineLabel: l => l.name, discountAmountFor: () => 0, tooLongForKitchen: noop,
  };
  c.window = c; c.addEventListener = noop; c.setTimeout = setTimeout;
  c.KiwiOrderInbox = { orders: () => ({}) };
  vm.createContext(c);
  vm.runInContext(relaySource, c);
  const names = ['tableKey', 'caisseTableId', 'phoneSessionOf', 'locallySettledVisit', 'settledVisitsFor', 'billBelongsToOtherVisit',
    'locallySettledOrder', 'paidReceiptForCurrentTable', 'tableSaleLabel', 'releasePhoneTable', 'resetTableTimer',
    'startTableTimer', 'tableSentCount', 'attachOrderProTable', 'opRepairFormulaParents', 'opIngest',
    'canRecoverCaisseTable', 'sameMap', 'staleQueuedServerTicket', 'ticketNo', 'orderServerInitials',
    'kitchenItemsFromLines', 'relayLinesFromCaisse', 'relayToKitchen', 'sendTableToKitchen'];
  vm.runInContext(names.map(n => fn(n)).join('\n') + '\n' + bridgeSource, c);

  /* Same mapping as assets/orderpro-inbox.js pull() + bridge(). */
  const inbox = { orders: {} };
  const poll = async snapshot => {
    const j = snapshot || await get();
    (j.orders || []).forEach(o => { inbox.orders[o.id] = o; });
    c.KiwiCaisseKitchen.ingest(j.orders || [], Object.values(inbox.orders), j.sessions || [], j.closedSessions || [], j.expired || []);
  };
  /* The inbox's close request, replayed as orderpro-inbox.js sends it. */
  const replayReleases = async () => {
    for (const e of events.splice(0)) {
      if (e.type === 'kiwi-table-released' && e.detail.session) {
        await post({ merchant: MERCHANT, closeSession: e.detail.session, closedBy: e.detail.why || 'settle' });
      }
    }
  };
  const partyA = async ({ closeReachesServer }) => {
    c.tables['6'] = { status: 'ka-yaklo', covers: 2 };
    c.tableOrders['6'] = [{ id: 'coke', name: 'Coca-Cola', qty: 1, price: 15 }];
    await c.sendTableToKitchen('6').canonicalNumberPromise;
    await poll();
    const visit = c.phoneSessionOf('6');
    assert.ok(visit, 'party A has a server visit');
    // markPaid(): durable local receipt, table freed, close request sent.
    c.journal.push({ id: 'sale-a', table: '6', session: visit, ref: 'Table 6 #1', amount: 15, visitClosed: true });
    c.tables['6'] = { status: 'khawya', covers: 0 };
    delete c.tableOrders['6'];
    c.releasePhoneTable('6', 'settle', true);
    if (closeReachesServer) await replayReleases(); else events.length = 0;
    return visit;
  };
  const partyB = () => {
    c.mode = 'order'; c.selectedId = '6';
    c.tables['6'] = { status: 'ka-yaklo', covers: 2 };
    c.tableOrders['6'] = [
      { id: 'pap', name: 'Pappardelle aux champignons', qty: 1, price: 79 },
      { id: 'agn', name: 'Agnollotti del Pin', qty: 1, price: 89 },
      { id: 'coke', name: 'Coca-Cola', qty: 2, price: 15 },
    ];
    c.backToSalle('6');            // validateOrder() leaves the order screen first
    return c.sendTableToKitchen('6');
  };
  const bill = () => ({ status: c.tables['6']?.status, lines: (c.tableOrders['6'] || []).length });
  const orderB = id => db.prepare('SELECT number, session_id, paid_ts IS NOT NULL AS paid FROM orders WHERE id = ?').get(id);
  return { c, db, poll, get, replayReleases, partyA, partyB, bill, orderB };
}

console.log('■ table 6 · the previous visit never reached the server (Pasta Corner #86)');
{
  const h = await setup();
  const visitA = await h.partyA({ closeReachesServer: false });
  h.c.tableClosedAt['6'] = Date.now() - 5 * 60000;
  const b = h.partyB(); await b.canonicalNumberPromise;
  const created = h.orderB(b.opId);
  check('the new party gets its own visit, not the unsettled previous one',
    created && created.session_id && created.session_id !== visitA, { created, visitA });
  await h.poll(); await h.replayReleases(); await h.poll(); await h.poll();
  check('the bill survives the previous party\'s replayed settlement', h.bill().lines === 3 && h.bill().status === 'ka-yaklo', h.bill());
  check('the new ticket stays payable (not settled with the previous party\'s money)', h.orderB(b.opId)?.paid === 0, h.orderB(b.opId));
  const oldOrders = h.db.prepare("SELECT COUNT(*) AS n FROM orders WHERE session_id = ? AND paid_ts IS NULL").get(visitA).n;
  check('the previous party\'s own ticket is left for its own sale to settle', oldOrders === 1, { oldOrders });
}

console.log('■ table 6 · new party sent within a minute of the previous one leaving');
{
  const h = await setup();
  await h.partyA({ closeReachesServer: true });
  h.c.tableClosedAt['6'] = Date.now() - 20000;     // left 20 s ago, inside the one-minute window
  await new Promise(r => setTimeout(r, 5));
  const b = h.partyB(); await b.canonicalNumberPromise;
  await h.poll(); const first = h.bill(); await h.poll();
  check('the previous visit\'s closure does not clear the new bill', first.lines === 3 && h.bill().lines === 3, { first, second: h.bill() });
}

console.log('■ table 6 · a poll read before "Envoyer en cuisine" lands after it');
{
  const h = await setup();
  await h.partyA({ closeReachesServer: true });
  h.c.tableClosedAt['6'] = Date.now() - 5 * 60000;
  const stale = await h.get();
  const b = h.partyB();
  await h.poll(stale); const crossed = h.bill();
  await b.canonicalNumberPromise; await h.poll();
  check('the in-flight poll does not clear the bill being sent', crossed.lines === 3 && h.bill().lines === 3, { crossed, after: h.bill() });
}

console.log('■ controls');
{
  const h = await setup();
  await h.partyA({ closeReachesServer: true });
  h.c.tableClosedAt['6'] = Date.now() - 5 * 60000;
  const b = h.partyB(); await b.canonicalNumberPromise;
  await h.poll(); await h.poll();
  check('an ordinary second party keeps its bill and payable ticket', h.bill().lines === 3 && h.orderB(b.opId)?.paid === 0, h.bill());
  // The new party's own visit, closed as settled, still frees the table.
  const visitB = h.c.phoneSessionOf('6');
  h.c.journal.push({ id: 'sale-b', table: '6', session: visitB, ref: 'Table 6 #2', amount: 198, visitClosed: true });
  h.c.releasePhoneTable('6', 'settle', true); await h.replayReleases();
  h.c.tables['6'] = { status: 'ka-yaklo', covers: 2, timerSession: visitB };
  h.c.tableClosedAt['6'] = Date.now() - 5 * 60000;
  await h.poll();
  check('closing the bill\'s own visit still clears the table', h.bill().status === 'khawya' && h.bill().lines === 0, h.bill());
  check('and settles the ticket of that visit', h.orderB(b.opId)?.paid === 1, h.orderB(b.opId));
}

console.log(`\n${failures ? '✗' : '✓'} table visit reuse · ${passes} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);
