#!/usr/bin/env node
// Working-source regressions: real queue handler + scoped production caisse VM.
// All assertions require healthy outcomes. No network or disk database.
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { employeeToken, EMPLOYEE_COOKIE } from '../functions/auth/_lib.js';
import * as queue from '../functions/api/order/queue.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const readSource = p => fs.readFileSync(path.join(ROOT, p), 'utf8');
const source = readSource('kiwi-caisse.html');
const inbox = readSource('assets/orderpro-inbox.js');
function fn(name, src = source, indent = 4) {
  const start = src.search(new RegExp(`^ {${indent}}(?:async )?function ${name}\\(`, 'm'));
  assert.ok(start >= 0, `function ${name} exists`);
  const rest = src.slice(start);
  const end = rest.search(new RegExp(`^ {${indent}}}`, 'm'));
  assert.ok(end > 0, `end ${name}`);
  return rest.slice(0, end + indent + 1);
}
const bridgeStart = source.indexOf('    window.KiwiCaisseKitchen = {');
const bridgeEnd = source.indexOf('\n    };', bridgeStart) + 7;
assert.ok(bridgeStart > 0 && bridgeEnd > bridgeStart);
const bridgeSource = source.slice(bridgeStart, bridgeEnd);
const noop = () => {};
function context() {
  const nodes = new Map();
  const events = [], messages = [];
  const node = key => {
    if (!nodes.has(key)) nodes.set(key, {
      style: {}, dataset: {}, classList: { add: noop, remove: noop, contains: () => false, toggle: noop },
      querySelector: () => null, setAttribute: noop, textContent: '', innerHTML: '',
    });
    return nodes.get(key);
  };
  const c = {
    console, Date, Map, Set, Promise, Object, Number, String, Array, JSON, crypto,
    IS_DEMO: false, tables: {}, tableOrders: {}, orders: {}, servers: {}, menu: [], menuItems: [],
    phoneSeats: new Map(), phoneMovedVisits: new Map(), phonePending: new Map(), tableClosedAt: {}, tableSplits: new Map(),
    opTickets: new Map(), opUnmatchedTables: new Set(), kdsOrders: [], kdsOrderSeq: 0,
    expiredOrders: [], dismissedExpiredIds: new Set(), vrapEditingNum: null, vrapDiscount: null,
    vrapSplit: null, splitState: {}, renderSplitSetup: noop, renderSplitFlow: noop,
    mode: 'salle', selectedId: null, cart: [], cashAmountOverride: null, vrapView: 'board',
    ctrfFromId: '1', ctrfSelectedToId: '2', cmrgSourceId: '1', cmrgSelectedTargetId: '2',
    document: { body: node('body'), dispatchEvent: e => events.push(e), getElementById: node },
    CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init.detail; } },
    navigator: {}, $: node, $$: () => [], lucide: { createIcons: noop }, kdsEl: node('kds'),
    toast: m => messages.push(m), currentMerchantSlug: () => 'field-fixture',
    refreshTableNode: noop, openTable: id => { c.selectedId = id; },
    renderRightPanel: noop, renderOrderPanel: noop, renderVrapBoard: noop, renderRealGrid: noop,
    renderSalle: noop, persistShift: noop, publishServiceFloor: noop, updateKdsCount: noop, printKitchenTickets: noop,
    closeRightPanel: noop, renderMenu: noop, renderCart: noop, backToSalle: noop,
    storeIsReal: () => true, menuLineFind: () => null, newLineUid: () => `uid-${++c.uid}`,
    uid: 0, lineLabel: l => l.name, discountAmountFor: () => 0, vrapDiscountAmount: () => 0,
    kdsStations: () => [], kdsStationForName: () => 'kitchen', kdsNowHM: () => '12:00',
    kdsStationBar: () => '', kdsGroup: () => [], kdsEmpty: () => '',
    kdsOrderCard: () => '', kdsHistoryRow: () => '', opPush: () => Promise.resolve(null),
    clearCart: () => { c.cart = []; }, setVrapView: v => { c.vrapView = v; },
    setMode: m => { c.mode = m; }, requireTillOperator: () => { throw Error('unexpected auth UI'); },
    fetch: () => { throw Error('unexpected network'); }, nodes, events, messages,
  };
  c.window = c;
  c.KiwiOrderInbox = { orders: () => c.remoteOrders || {} };
  vm.createContext(c);
  const names = ['tableKey', 'caisseTableId', 'phoneSessionOf', 'releasePhoneTable',
    'caisseTableKitchenLocked', 'caisseMobilityIntent', 'applyCaisseMovedVisit',
    'confirmCaisseTransfer', 'confirmCaisseMerge', 'generateOrder', 'resetTableTimer', 'startTableTimer',
    'currentTotal', 'tableSentCount', 'cancelOpenTable', 'attachOrderProTable', 'opRepairFormulaParents',
    'opIngest', 'canRecoverCaisseTable', 'retireRejectedKitchenTicket', 'sameMap', 'serverNameFor',
    'staleQueuedServerTicket', 'kdsPaint', 'openVrapOrder', 'vrapFinancialItems',
    'savedTakeawaySplitFor', 'splitPaidCount', 'splitRemainingTotal', 'loadSplitFlow', 'openSplitModal',
    'vrapHandoverTimestamp', 'vrapHandoverTime', 'ticketNo', 'orderServerInitials'];
  vm.runInContext(names.map(n => fn(n)).join('\n') + '\n' + bridgeSource, c);
  const moneySource = source.match(/^    const money = .*;$/m);
  const splitResume = source.match(/^    const _origOpenSplit = openSplitModal;\n    openSplitModal = function\(tableId\) \{[^]*?^    };/m);
  assert.ok(moneySource && splitResume, 'production money helper and saved-split reopening wrapper exist');
  vm.runInContext(moneySource[0] + '\n' + splitResume[0], c);
  return c;
}
const row = (id = 'ord-field-one', extra = {}) => ({
  id, number: 17, mode: 'table', table: '1', session: 'ses-field-source',
  channel: 'kiwi', status: 'pending', paid: false, total: 40,
  lines: [{ id: 'tea', name: 'Tea', qty: 2, unitPrice: 20 }],
  created_ts: Date.now() - 120000, updated_ts: Date.now(), ...extra,
});
const localLine = (extra = {}) => ({ name: 'Tea', qty: 2, price: 20, sent: true,
  orderProPending: true, orderProLine: 'ord-field-one:0', orderSession: 'ses-field-source', ...extra });
const occupied = () => ({ status: 'ka-yaklo', covers: 2, elapsed: 2 });
let checks = 0;
const evidence = (title, data) => { checks++; console.log(`PASS ${checks}: ${title}${data ? '\n  ' + JSON.stringify(data) : ''}`); };

// Real production queue handler with in-memory SQLite and atomic D1 batch.
const db = new DatabaseSync(':memory:');
db.exec(readSource('schema.sql'));
const DB = {
  prepare(sql) {
    let args = [];
    return {
      bind(...values) { args = values.map(v => v === undefined ? null : v); return this; },
      first() { return db.prepare(sql).get(...args) || null; },
      all() { return { results: db.prepare(sql).all(...args) }; },
      run() { return { success: true, meta: { changes: db.prepare(sql).run(...args).changes } }; },
    };
  },
  async batch(statements) {
    db.exec('BEGIN IMMEDIATE');
    try { const result = []; for (const s of statements) result.push(await s.run()); db.exec('COMMIT'); return result; }
    catch (error) { db.exec('ROLLBACK'); throw error; }
  },
};
const now = Date.now(), merchant = 'field-fixture', staffId = 'field-employee';
const env = { DB, AUTH_SECRET: 'synthetic-field-test-only' };
const doc = (feature, data) => db.prepare('INSERT INTO store_docs (merchant, feature, data, rev, updated_ts) VALUES (?, ?, ?, 1, ?)')
  .run(merchant, feature, JSON.stringify(data), now);
doc('employee-access', { members: [{ id: staffId, firstName: 'Field', lastName: 'Fixture', function: 'Serveur', department: 'Salle', venueSlug: merchant }] });
doc('attendance', { entries: [{ id: 'attendance-fixture', memberId: staffId, staffId, inTs: now - 3600000, outTs: null, pauseTs: null }] });
doc('floorplan', { tables: ['1', '2'].map(num => ({ id: `T${num}`, num, servers: [staffId] })) });
db.prepare('INSERT INTO merchant_config (merchant, features, updated_ts) VALUES (?, ?, ?)').run(merchant, '{"orderpro":true}', now);
db.prepare("INSERT INTO table_sessions (id, merchant, table_no, mode, status, opened_ts, seen_ts) VALUES ('ses-field-source', ?, '1', 'table', 'open', ?, ?)").run(merchant, now - 120000, now - 120000);
db.prepare("INSERT INTO orders (id, merchant, number, mode, table_no, total, lines, status, session_id, created_ts, updated_ts) VALUES ('ord-field-one', ?, 17, 'table', '1', 40, ?, 'pending', 'ses-field-source', ?, ?)").run(merchant, JSON.stringify(row().lines), now - 120000, now - 120000);
const token = await employeeToken(env.AUTH_SECRET, { memberId: staffId, staffId, merchant, inTs: now - 3600000 });
const cookie = `${EMPLOYEE_COOKIE}=${token}`;
const c = context();
c.tables = { '1': occupied(), '2': { status: 'khawya', covers: 0 } };
c.tableOrders['1'] = [localLine()];
c.phoneSeats.set('1', { session: 'ses-field-source', since: now - 120000, revision: now - 120000 });
c.phonePending.set('1', 1);
c.tableClosedAt['2'] = now - 60000;
c.remoteOrders = { 'ord-field-one': row() };
c.selectedId = '1';
assert.equal(c.currentTotal(), 40);
let transferResponse;
c.fetch = async (_url, init) => {
  const response = await queue.onRequestPost({ env, request: new Request('https://fixture.invalid/api/order/queue', {
    ...init, headers: { 'Content-Type': 'application/json', Cookie: cookie },
  }) });
  transferResponse = await response.clone().json();
  return response;
};
await c.confirmCaisseTransfer();
assert.equal(transferResponse.ordersMoved, 1);
assert.equal(c.tableOrders['2'][0].price * c.tableOrders['2'][0].qty, 40);
assert.equal(c.orders['2'], undefined);
assert.equal(c.currentTotal(), 40);
assert.equal(c.cancelOpenTable('2', { name: 'Fixture', actorProof: 'synthetic-unused' }), false);
assert.equal(c.phoneSessionOf('2'), 'ses-field-source');
assert.equal(c.phoneSessionOf('1'), '');
assert.equal(c.phonePending.get('2'), 1);
assert.equal(c.remoteOrders['ord-field-one'].table, '2');
assert.equal(c.remoteOrders['ord-field-one'].status, 'pending');
assert.equal(c.tableOrders['2'][0].orderProPending, true);
assert.equal(c.tables['2'].timerSession, 'ses-field-source');
evidence('actual transfer preserves 40 MAD, visit, pending state and timer; nonempty bill cannot be silently cancelled');
c.orders['2'] = [];
assert.equal(c.currentTotal(), 40);
evidence('existing empty-cache corruption yields to surviving bill lines');

// Exercise the actual shipped snapshot and restore functions in fresh globals.
function snapshotContext(ctx) {
  Object.assign(ctx, {
    registerClosing: false, shiftOpenedAt: new Date(now - 3600000), shiftOpenedBy: 'Fixture',
    shiftMerchant: merchant, KC_STORE: 'kiwi-caisse-shift:field-fixture',
    SERVICE_BILL_SYNC_VERSION: 4, ORDER_BRIDGE_SYNC_VERSION: 2,
    openingFloat: 0, journal: [], cashMovements: [], shift: {}, currentCashier: null,
    posteOpenedAt: null, posteOpeningFloat: 0, handovers: [], vrapSplit: null,
  });
}
snapshotContext(c);
let savedShift;
c.localStorage = { setItem: (_key, value) => { savedShift = JSON.parse(value); } };
vm.runInContext(fn('persistShift'), c);
c.persistShift();
assert.ok(savedShift && savedShift.tables['2']);
assert.equal(Object.hasOwn(savedShift, 'tableClosedAt'), false);
assert.equal(Object.hasOwn(savedShift, 'phoneMovedVisits'), false);
const reloaded = context(); snapshotContext(reloaded);
reloaded.tables = { '1': occupied(), '2': occupied() };
vm.runInContext(fn('restoreShift'), reloaded);
reloaded.restoreShift(savedShift);
reloaded.selectedId = '2';
reloaded.KiwiCaisseKitchen.ingest([row('ord-field-one', { table: '2' })], [row('ord-field-one', { table: '2' })],
  [{ id: 'ses-field-source', mode: 'table', table: '2', opened_ts: now - 120000, seen_ts: transferResponse.revision }], [], []);
assert.equal(reloaded.currentTotal(), 40);
assert.equal(reloaded.phoneSessionOf('2'), 'ses-field-source');
assert.equal(reloaded.events.length, 0);
evidence('actual persist/restore reload recovers moved 40 MAD visit; close tombstones are not persisted');

// The moved visit keeps its original opening time, which precedes a prior
// destination close. Only the acknowledged moved visit may supersede it.
c.KiwiCaisseKitchen.ingest([row('ord-field-one', { table: '2' })], [row('ord-field-one', { table: '2' })],
  [{ id: 'ses-field-source', mode: 'table', table: '2', opened_ts: now - 120000 }], [], []);
assert.equal(c.phoneSessionOf('2'), 'ses-field-source');
assert.equal(c.events.length, 0);
assert.equal(c.currentTotal(), 40);
assert.equal(c.tableClosedAt['2'], now - 60000);
c.tableClosedAt['2'] = now + 1000;
c.KiwiCaisseKitchen.ingest([], [], [{ id: 'ses-field-source', mode: 'table', table: '2', opened_ts: now - 120000 }], [], []);
assert.equal(c.phoneSessionOf('2'), '');
assert.ok(c.events.some(e => e.detail.why === 'prune-stale'));
evidence('acknowledged move supersedes only its captured close marker; a subsequent local close still wins');

const missing = context();
missing.tables['1'] = occupied(); missing.selectedId = '1';
const canonical = row('ord-caisse-recovery', { channel: 'caisse', status: 'accepted' });
missing.KiwiCaisseKitchen.ingest([canonical], [canonical], [{ id: canonical.session, mode: 'table', table: '1', opened_ts: now - 120000 }], [], []);
assert.equal(missing.kdsOrders.length, 1);
assert.equal(missing.currentTotal(), 40);
missing.KiwiCaisseKitchen.ingest([canonical], [canonical], [{ id: canonical.session, mode: 'table', table: '1', opened_ts: now - 120000 }], [], []);
assert.equal(missing.currentTotal(), 40);
assert.equal(missing.tableOrders['1'].length, 1);
evidence('missing caisse bill recovers validated canonical 40 MAD exactly once', {
  canonical: canonical.total, kdsTickets: missing.kdsOrders.length, payable: missing.currentTotal(),
});
assert.equal(missing.tableOrders['1'][0].caisseRecovered, true);
// Genuine new cashier lines must never erase a recovered canonical order.
missing.tableOrders['1'].push(localLine({ orderProLine: undefined, orderProPending: false, id: 'tea' }));
missing.opIngest(canonical);
assert.equal(missing.currentTotal(), 80);
const legacy = context(); legacy.tables['1'] = occupied(); legacy.selectedId = '1';
legacy.phoneSeats.set('1', { session: canonical.session, since: now - 120000 });
legacy.tableOrders['1'] = [
  localLine({ id: 'tea', orderProLine: undefined, orderProPending: false }),
  localLine({ id: 'tea', orderProLine: canonical.id + ':0', orderProPending: false }),
];
legacy.opIngest(canonical);
assert.equal(legacy.currentTotal(), 40);
assert.equal(legacy.tableOrders['1'].length, 1);
legacy.opIngest(canonical);
assert.equal(legacy.currentTotal(), 40);
for (const variation of [{ paid: true }, { session: 'ses-another' }, { total: 999 }, { lines: [{ name: 'Tea', qty: 2 }] }]) {
  const refused = context(); refused.tables['1'] = occupied(); refused.selectedId = '1';
  refused.phoneSeats.set('1', { session: canonical.session, since: now - 120000 });
  refused.opIngest({ ...canonical, ...variation });
  assert.equal(refused.currentTotal(), 0);
  assert.equal((refused.tableOrders['1'] || []).length, 0);
}
evidence('legacy cashier echo removes duplicate charge; recovered rows survive; paid/stale/invalid bills are not imported');

const lost = context();
const takeaway = row('ord-field-takeaway', { mode: 'takeout', table: '', session: '', status: 'accepted', created_ts: now - 31 * 60000 });
lost.remoteOrders = { [takeaway.id]: takeaway };
lost.opIngest(takeaway);
assert.equal(lost.kdsOrders.length, 1);
const known = lost.opTickets.get(takeaway.id);
lost.kdsPaint();
assert.equal(lost.kdsOrders.length, 1);
assert.equal(lost.opTickets.get(takeaway.id), known);
// Seed the legacy dangling-index shape to prove recovery as well as prevention.
lost.kdsOrders.length = 0;
lost.opIngest({ ...takeaway, status: 'ready' });
assert.equal(lost.kdsOrders.length, 1);
assert.equal(lost.KiwiCaisseKitchen.checkoutOrder(takeaway.id), true);
assert.equal(lost.vrapEditingNum, known.num);
assert.equal(lost.cart.length, 1);
assert.equal(lost.cart[0].price * lost.cart[0].qty, 40);
evidence('31-minute accepted takeaway survives; dangling index heals; checkout opens 40 MAD', {
  cards: lost.kdsOrders.length, mapEntries: lost.opTickets.size, knownStatus: known.status,
  checkoutReturned: true, editing: lost.vrapEditingNum, cartLength: lost.cart.length,
});
const savedSplit = {
  orderNum: known.num, sourceLabel: `À emporter #${known.num}`, mode: 'egal', total: 40, paidCount: 1,
  parts: [
    { label: 'Part 1', amount: 20, paid: true, payMethod: 'cash', saleId: 'sale-already-paid', lines: [] },
    { label: 'Part 2', amount: 20, paid: false, lines: [] },
  ],
};
lost.vrapSplit = savedSplit;
const savedBefore = JSON.stringify(savedSplit);
assert.equal(lost.savedTakeawaySplitFor({ num: known.num + 1 }), null);
assert.equal(lost.KiwiCaisseKitchen.checkoutOrder(takeaway.id), true);
assert.equal(lost.vrapSplit, savedSplit);
assert.equal(JSON.stringify(lost.vrapSplit), savedBefore);
assert.equal(lost.splitState.flow.paidCount, 1);
assert.equal(lost.splitState.flow.parts[0].paid, true);
assert.equal(lost.splitState.flow.parts[0].saleId, 'sale-already-paid');
assert.equal(lost.splitRemainingTotal(lost.splitState.flow), 20);
assert.equal(lost.nodes.get('#split-setup').hidden, true);
assert.equal(lost.nodes.get('#split-flow').hidden, false);
assert.equal(lost.nodes.get('#split-all-done').hidden, true);
evidence('checkout resumes actual saved split flow, retains prior payment and leaves only 20 MAD due');

// Both fresh and previously corrupt local classifications follow canonical routing.
const routing = context(); routing.tables['1'] = occupied();
routing.phoneSeats.set('1', { session: 'ses-field-source', since: now - 120000 });
const tableOrder = row('ord-field-routing', { status: 'accepted' });
routing.opIngest(tableOrder);
assert.equal(routing.kdsOrders[0].type, 'dineIn');
assert.equal(routing.kdsOrders[0].table, '1');
routing.kdsOrders[0].type = 'takeaway'; routing.kdsOrders[0].table = null;
routing.opIngest({ ...tableOrder, status: 'ready' });
assert.equal(routing.kdsOrders[0].type, 'dineIn');
assert.equal(routing.kdsOrders[0].table, '1');
evidence('fresh and restored table tickets follow canonical table routing', {
  canonicalMode: tableOrder.mode, localType: routing.kdsOrders[0].type, localTable: routing.kdsOrders[0].table,
});

const mixed = context(); mixed.tables['1'] = occupied();
mixed.phoneSeats.set('1', { session: 'ses-field-source', since: now - 120000 });
mixed.tableOrders['1'] = [localLine({ orderSession: 'ses-previous', orderProLine: 'ord-previous:0' })];
const detachedLines = mixed.tableOrders['1'];
assert.equal(mixed.attachOrderProTable(row()), true);
assert.equal(mixed.tableOrders['1'].length, 1);
assert.equal(detachedLines.length, 1);
assert.equal(mixed.tableOrders['1'][0].orderProLine, 'ord-field-one:0');
assert.equal(mixed.tableOrders['1'][0].orderSession, 'ses-field-source');
assert.equal(mixed.tableOrders['1'].some(l => l.orderSession === 'ses-previous'), false);
evidence('session purge removes the old visit and appends the new order to the retained array');

const partial = context(); partial.tables['1'] = occupied();
partial.phoneSeats.set('1', { session: 'ses-field-source', since: now - 120000 });
partial.tableOrders['1'] = [localLine({ orderSession: 'ses-previous', orderProLine: 'ord-previous:0' }), localLine()];
const twoLines = row('ord-field-one', { total: 60, lines: [...row().lines, { id: 'water', name: 'Water', qty: 1, unitPrice: 20 }] });
partial.KiwiCaisseKitchen.ingest([twoLines], [twoLines],
  [{ id: 'ses-field-source', mode: 'table', table: '1', opened_ts: now - 120000 }], [], []);
assert.equal(partial.tableOrders['1'].length, 2);
partial.tableOrders['1'].pop(); // Legacy partial attachment: all-only retry must repair it.
partial.KiwiCaisseKitchen.ingest([], [twoLines],
  [{ id: 'ses-field-source', mode: 'table', table: '1', opened_ts: now - 120000 }], [], []);
assert.equal(partial.tableOrders['1'].length, 2);
assert.equal(partial.tableOrders['1'].reduce((s, l) => s + l.price * l.qty, 0), 60);
evidence('partial existing marker does not prevent all-only recovery of the complete 60 MAD bill', {
  canonicalTotal: 60, attachedTotal: partial.tableOrders['1'].reduce((s, l) => s + l.price * l.qty, 0),
});

// Both server closure objects and local legacy string IDs hide closed visits.
const filter = vm.createContext({ state: { orders: { x: tableOrder }, closedSessions: [{ id: tableOrder.session, mode: 'table', table: '1' }] } });
vm.runInContext(fn('list', inbox, 2), filter);
assert.equal(vm.runInContext("list('accepted').length", filter), 0);
filter.state.closedSessions = [tableOrder.session];
assert.equal(vm.runInContext("list('accepted').length", filter), 0);
filter.state.closedSessions = [{ id: 'ses-another' }];
assert.equal(vm.runInContext("list('accepted').length", filter), 1);
evidence('closure object/string filtering hides only the matching visit');

for (const retainCurrent of [false, true]) {
  const fixed = context(); fixed.tables['1'] = occupied(); fixed.selectedId = '1';
  fixed.tableOrders['1'] = [localLine({ orderSession: 'ses-previous', orderProLine: 'ord-previous:0' }),
    ...(retainCurrent ? [localLine()] : [])];
  fixed.KiwiCaisseKitchen.ingest([twoLines], [twoLines],
    [{ id: 'ses-field-source', mode: 'table', table: '1', opened_ts: now - 120000 }], [], []);
  assert.equal(fixed.tableOrders['1'].length, 2);
  assert.equal(fixed.currentTotal(), 60);
  fixed.KiwiCaisseKitchen.ingest([twoLines], [twoLines],
    [{ id: 'ses-field-source', mode: 'table', table: '1', opened_ts: now - 120000 }], [], []);
  assert.equal(fixed.tableOrders['1'].length, 2);
  assert.equal(fixed.currentTotal(), 60);
}
evidence('working attach function keeps all 60 MAD once, with/without an existing current marker');

db.prepare("INSERT INTO table_sessions (id, merchant, table_no, mode, status, opened_ts, seen_ts) VALUES ('ses-field-target', ?, '1', 'table', 'open', ?, ?)").run(merchant, now - 60000, now - 60000);
const targetOrder = row('ord-field-target', { table: '1', session: 'ses-field-target', total: 20,
  lines: [{ id: 'water', name: 'Water', qty: 1, unitPrice: 20 }] });
db.prepare("INSERT INTO orders (id, merchant, number, mode, table_no, total, lines, status, session_id, created_ts, updated_ts) VALUES ('ord-field-target', ?, 18, 'table', '1', 20, ?, 'pending', 'ses-field-target', ?, ?)").run(merchant, JSON.stringify(targetOrder.lines), now - 60000, now - 60000);
const merge = context();
merge.tables = { '1': { ...occupied(), orderStartedAt: now - 60000 }, '2': { ...occupied(), orderStartedAt: now - 120000 } };
merge.tableOrders = { '1': [localLine({ id: 'water', name: 'Water', qty: 1, orderSession: 'ses-field-target', orderProLine: 'ord-field-target:0' })], '2': [localLine()] };
merge.phoneSeats.set('2', { session: 'ses-field-source', since: now - 120000, revision: transferResponse.revision });
merge.phoneSeats.set('1', { session: 'ses-field-target', since: now - 60000, revision: now - 60000 });
merge.phonePending.set('1', 1); merge.phonePending.set('2', 1);
merge.cmrgSourceId = '2'; merge.cmrgSelectedTargetId = '1';
merge.fetch = c.fetch;
await merge.confirmCaisseMerge();
assert.equal(merge.currentTotal(), 60);
assert.equal(merge.tableOrders['1'].length, 2);
assert.ok(merge.tableOrders['1'].every(l => l.orderSession === 'ses-field-target'));
assert.equal(merge.tables['1'].orderStartedAt, now - 120000);
assert.equal(merge.tables['1'].timerSession, 'ses-field-target');
assert.equal(merge.phonePending.get('1'), 2);
assert.equal(merge.phoneSessionOf('2'), '');
evidence('actual merge keeps both bills and pending markers under target visit and preserves oldest timer anchor');

const revision = db.prepare("SELECT seen_ts FROM table_sessions WHERE id = 'ses-field-target'").get().seen_ts;
merge.phoneSeats.get('1').revision = revision;
merge.ctrfFromId = '1'; merge.ctrfSelectedToId = '2';
const payloads = [];
merge.fetch = async (_url, init) => {
  payloads.push(JSON.parse(init.body).transferTable);
  const response = await queue.onRequestPost({ env, request: new Request('https://fixture.invalid/api/order/queue', {
    ...init, headers: { 'Content-Type': 'application/json', Cookie: cookie },
  }) });
  assert.equal(response.status, 200);
  if (payloads.length === 1) throw new Error('lost acknowledgement');
  return response;
};
await merge.confirmCaisseTransfer();
assert.equal(merge.currentTotal(), 60);
await merge.confirmCaisseTransfer();
assert.equal(payloads.length, 2);
assert.deepEqual(payloads[0], payloads[1]);
assert.equal(merge.currentTotal(), 60);
assert.equal(merge.selectedId, '2');
assert.equal(db.prepare('SELECT COUNT(*) AS n FROM table_transfers WHERE id = ?').get('trf-' + payloads[0].operationId).n, 1);
evidence('ambiguous transfer acknowledgement retries identical operation/visit/revision and creates one audit record');

db.prepare("UPDATE store_docs SET data = ? WHERE merchant = ? AND feature = 'floorplan'")
  .run(JSON.stringify({ tables: ['1', '2', '3', '4'].map(num => ({ id: `T${num}`, num, servers: [staffId] })) }), merchant);
db.prepare("INSERT INTO table_sessions (id, merchant, table_no, mode, status, opened_ts, seen_ts) VALUES ('ses-field-empty', ?, '1', 'table', 'open', ?, ?)").run(merchant, now, now);
const empty = context(); empty.tables = { '1': occupied(), '3': { status: 'khawya', covers: 0 } };
empty.ctrfSelectedToId = '3';
empty.KiwiOrderInbox.sessions = () => [{ id: 'ses-field-empty', mode: 'table', table: '1', opened_ts: now, seen_ts: now }];
let emptyResponse;
empty.fetch = async (_url, init) => {
  const response = await queue.onRequestPost({ env, request: new Request('https://fixture.invalid/api/order/queue', {
    ...init, headers: { 'Content-Type': 'application/json', Cookie: cookie },
  }) });
  emptyResponse = await response.clone().json();
  assert.equal(response.status, 200);
  return response;
};
await empty.confirmCaisseTransfer();
assert.equal(emptyResponse.ordersMoved, 0);
assert.equal(empty.phoneSessionOf('3'), 'ses-field-empty');
assert.equal(empty.tables['3'].status, 'ka-yaklo');
assert.equal(empty.tables['1'].status, 'khawya');
assert.equal((empty.tableOrders['3'] || []).length, 0);
evidence('empty canonical visit transfers with zero orders even when local seat map is missing');

const absentResponse = await queue.onRequestPost({ env, request: new Request('https://fixture.invalid/api/order/queue', {
  method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie },
  body: JSON.stringify({ merchant, transferTable: { from: '4', to: '1', covers: 2 } }),
}) });
assert.equal(absentResponse.status, 409);
assert.equal((await absentResponse.json()).error, 'source-session-required');
const absent = context(); absent.tables = { '4': occupied(), '1': { status: 'khawya', covers: 0 } };
absent.ctrfFromId = '4'; absent.ctrfSelectedToId = '1';
await absent.confirmCaisseTransfer();
assert.equal(absent.tables['4'].status, 'ka-yaklo');
assert.equal(absent.tables['1'].status, 'khawya');
assert.ok(absent.messages.some(m => m.includes('actualiser')));
evidence('missing visit retains existing API refusal and local state; no session or financial lines are fabricated');

db.close();
console.log(`\n${checks} working-source regression scenarios passed.`);
