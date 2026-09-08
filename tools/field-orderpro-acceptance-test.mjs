#!/usr/bin/env node
// Local-only field acceptance audit. Runs shipped browser functions and real
// handlers against in-memory SQLite. Known acceptance gaps intentionally fail.
// Run directly: node tools/field-orderpro-acceptance-test.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { DatabaseSync } from 'node:sqlite';
import { makeSession, sessionCookie } from '../functions/auth/_lib.js';
import { onRequestPost as seat } from '../functions/api/order/session.js';
import { onRequestPost as order } from '../functions/api/order/index.js';
import { onRequestGet as queue } from '../functions/api/order/queue.js';

const read = name => fs.readFileSync(new URL('../' + name, import.meta.url), 'utf8');
const phoneSource = read('OrderPro.html'), caisseSource = read('kiwi-caisse.html');
function slice(source, start, end) {
  const a = source.indexOf(start), b = source.indexOf(end, a + start.length);
  assert.ok(a >= 0 && b > a, 'production slice exists: ' + start);
  return source.slice(a, b);
}
const sendSource = slice(phoneSource, '    async function sendOrder()', '    /* Table mode gets');
const sessionSource = slice(phoneSource, '    const SESSION = {', '    /* Le service est fini');
const closedSource = slice(phoneSource, '    function onSessionClosed()', '    /* ═══════════════════════════════════════════════════════════════════════\n       LE DIRECT');
const attachSource = slice(caisseSource, '    function attachOrderProTable(o)', '    /* Une commande du serveur');
const timerSource = slice(caisseSource, '    /* ---------- Live elapsed minutes', '    /* ---------- Khlass-fade');
let passed = 0, failed = 0;
async function check(name, run) {
  try { await run(); passed++; console.log('PASS ' + name); }
  catch (error) { failed++; console.error('FAIL ' + name + '\n  ' + error.message); }
}

const db = new DatabaseSync(':memory:');
db.exec(read('schema.sql'));
const DB = { prepare(sql) {
  let args = [];
  return {
    bind(...values) { args = values; return this; },
    async first() { return db.prepare(sql).get(...args) || null; },
    async all() { return { results: db.prepare(sql).all(...args) }; },
    async run() { return { meta: { changes: Number(db.prepare(sql).run(...args).changes) } }; },
  };
}, async batch(statements) {
  db.exec('BEGIN IMMEDIATE');
  try { const results = []; for (const s of statements) results.push(await s.run()); db.exec('COMMIT'); return results; }
  catch (error) { db.exec('ROLLBACK'); throw error; }
} };
const merchant = 'field-orderpro-test', env = { DB, AUTH_SECRET: 'field-test-only' }, now = Date.now();
const menu = { cats: [{ id: 'food', name: 'Plats' }], items: [
  { id: 'dish', name: 'Tajine poulet', catId: 'food', price: 50, avail: true },
  { id: 'formula', name: 'Prépare ton Plat', catId: 'food', price: 40, avail: true,
    formula: { slots: [
      { id: 'pasta', label: 'Pâtes', min: 1, max: 1, choices: [{ itemId: 'gnocchi', extra: 0 }] },
      { id: 'sauce', label: 'Sauce', min: 0, max: 1, choices: [{ itemId: 'rosa', extra: 12 }] },
    ] } },
  { id: 'gnocchi', name: 'Gnocchi', catId: 'food', price: 30, avail: true, formulaOnly: true },
  { id: 'rosa', name: 'Rosa Pomodoro', catId: 'food', price: 12, avail: true, formulaOnly: true },
] };
db.prepare('INSERT INTO accounts(id,email,name,business,salt,hash,created_ts) VALUES(?,?,?,?,?,?,?)')
  .run('field-owner', 'field@test.invalid', 'Test', 'Test', 's', 'h', now);
db.prepare('INSERT INTO merchant_config(merchant,features,type,account_id,updated_ts) VALUES(?,?,?,?,?)')
  .run(merchant, '{"orderpro":true}', 'restaurant', 'field-owner', now);
db.prepare('INSERT INTO order_desk(merchant,seen_ts) VALUES(?,?)').run(merchant, now);
db.prepare('INSERT INTO menus(merchant,name,type,data,updated_ts) VALUES(?,?,?,?,?)')
  .run(merchant, 'Test menu', 'restaurant', JSON.stringify(menu), now);
const cookie = sessionCookie(await makeSession('field-owner', env.AUTH_SECRET)).split(';')[0];
async function post(handler, body) {
  const response = await handler({ env, request: new Request('https://kiwi.test/api/test', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ merchant, ...body }),
  }) });
  return { http: response.status, ...await response.json() };
}
async function feed() {
  const response = await queue({ env, request: new Request('https://kiwi.test/api/order/queue?merchant=' + merchant + '&since=0', {
    headers: { Cookie: cookie },
  }) });
  assert.equal(response.status, 200);
  return response.json();
}

function phone(table, storage = new Map()) {
  const nodes = new Map(), screens = [], requests = [], toasts = [];
  let loseNextResponse = false;
  function node(selector) {
    if (!nodes.has(selector)) {
      const classes = new Set();
      nodes.set(selector, { textContent: '', classList: {
        contains: key => classes.has(key), add: key => classes.add(key), remove: key => classes.delete(key),
      } });
    }
    return nodes.get(selector);
  }
  const context = vm.createContext({
    console, Date, Math, Map, crypto: globalThis.crypto, TextEncoder, cart: new Map(), sentLines: [], sessionTotal: 0,
    currentOrderId: '', pendingRef: '', lastStatus: '', orderMode: 'table', tableNumber: table,
    localStorage: { getItem: k => storage.get(k) || null, setItem: (k,v) => storage.set(k,v), removeItem: k => storage.delete(k) },
    NET: {
      slug: merchant,
      openSession: (mode, table) => post(seat, { mode, table }),
      placeOrder: async body => {
        requests.push(body);
        const result = await post(order, body);
        if (loseNextResponse) { loseNextResponse = false; return { ok: false, error: 'network' }; }
        return result;
      },
    },
    LIVE: { start() {}, stop() {} }, $: node, t: key => key, cur: () => 'MAD',
    gotoScreen: screen => screens.push(screen), refreshCartUI() {}, closeCart() {}, watchTableOrder() {},
    showToast: message => toasts.push(message), bootState() {},
    itemOf: id => id === 'formula' ? { options: [
      { key: 'pasta', formulaSlotId: 'pasta', label: 'Pâtes', type: 'single' },
      { key: 'sauce', formulaSlotId: 'sauce', label: 'Sauce', type: 'single' },
    ] } : { options: [] },
    nameOf: id => menu.items.find(item => item.id === id)?.name || '',
    totals: () => ({ total: 50 }), describeOptionChoices: () => [], describeOptionVisuals: () => [], groupLabel: key => key,
  });
  vm.runInContext(sessionSource + closedSource + sendSource + '\nglobalThis.production = { SESSION, sendOrder };', context);
  return { context, storage, screens, requests, toasts, ...context.production,
    loseResponse() { loseNextResponse = true; },
    add(id = 'dish', options = {}, qty = 1) { context.cart.set(id, { id, options, qty, note: '', unitPrice: 50 }); },
  };
}
function till(table, session) {
  let tick;
  const context = vm.createContext({
    Date, tables: { [table]: { status: 'ka-yaklo', elapsed: 0 } }, tableOrders: {}, orders: {},
    phoneSeats: new Map([[table, { session, since: now }]]), servers: {}, selectedId: '', mode: 'salle',
    caisseTableId: value => value, tableKey: value => value, ticketNo: value => String(value.opNum),
    menuLineFind: predicate => menu.items.find(predicate), newLineUid: () => 'synthetic-line',
    refreshTableNode() {}, renderRightPanel() {}, persistShift() {},
    document: { querySelector() { return null; }, addEventListener() {} }, setInterval: callback => { tick = callback; },
  });
  vm.runInContext(attachSource + timerSource + '\nglobalThis.attach = attachOrderProTable;', context);
  return { context, attach: context.attach, tick: () => tick() };
}

await check('#1 / multi-phone: real sendOrder -> API -> authenticated queue -> caisse, exactly once', async () => {
  const phones = [phone('1'), phone('1'), phone('1')];
  await Promise.all(phones.map(p => p.SESSION.open('table', '1')));
  assert.equal(new Set(phones.map(p => p.SESSION.id)).size, 1);
  phones.forEach((p, i) => p.add('dish', {}, i + 1));
  await Promise.all(phones.map(p => p.sendOrder()));
  assert.ok(phones.every(p => p.screens.at(-1) === 'screen-success'));
  const response = await feed(), orders = response.orders.filter(o => o.table === '1');
  assert.equal(orders.length, 3);
  const t = till('1', phones[0].SESSION.id);
  orders.forEach(t.attach); orders.forEach(t.attach);
  assert.equal(t.context.tableOrders['1'].length, 3);
  assert.equal(t.context.tableOrders['1'].reduce((n,l) => n + l.price * l.qty, 0), 300);
});
await check('#16: formula names, included choice and optional empty stage survive actual send and caisse import', async () => {
  const p = phone('2'); await p.SESSION.open('table', '2');
  p.add('formula', { pasta: 'gnocchi', sauce: '' }); await p.sendOrder();
  assert.equal(p.screens.at(-1), 'screen-success');
  assert.equal(p.requests[0].lines.length, 2);
  const o = (await feed()).orders.find(o => o.table === '2');
  const t = till('2', p.SESSION.id); t.attach(o);
  assert.deepEqual(Array.from(t.context.tableOrders['2'], l => [l.name,l.price]), [['Prépare ton Plat',40],['Gnocchi',0]]);
});
await check('#11: returning to an unpaid table resumes the visit and permits another order', async () => {
  const first = phone('3'); await first.SESSION.open('table', '3'); first.add(); await first.sendOrder();
  const returned = phone('3', first.storage); await returned.SESSION.open('table', '3');
  assert.equal(returned.SESSION.id, first.SESSION.id);
  returned.add(); await returned.sendOrder();
  assert.equal(returned.screens.at(-1), 'screen-success');
  assert.equal((await feed()).orders.filter(o => o.table === '3').length, 2);
});
await check('#1: lost response followed by retry on the same page creates one order', async () => {
  const p = phone('4'); await p.SESSION.open('table', '4'); p.add(); p.loseResponse(); await p.sendOrder();
  assert.equal(p.SESSION.pendingSend.durable, true);
  assert.equal(p.toasts.at(-1), 'order_unconfirmed', 'a lost response never claims the order was not sent');
  for (const text of [
    'Envoi non confirmé · réessayez, sans créer une nouvelle commande',
    'Send unconfirmed · retry without creating a new order',
    'الإرسال ما تأكدش · عاود جرّب بلا ما تنشئ طلب جديد',
  ]) assert.ok(phoneSource.includes('order_unconfirmed: ' + JSON.stringify(text)));
  assert.equal(p.context.cart.size, 1); await p.sendOrder();
  assert.equal((await feed()).orders.filter(o => o.table === '4').length, 1);
});
await check('#1/#11: uncertain send survives navigation and manual basket resubmission without duplicate', async () => {
  const first = phone('5'); await first.SESSION.open('table', '5'); first.add(); first.loseResponse(); await first.sendOrder();
  const returned = phone('5', first.storage); await returned.SESSION.open('table', '5');
  returned.add(); await returned.sendOrder();
  assert.equal((await feed()).orders.filter(o => o.table === '5').length, 1,
    'lost response + page recreation + manual resubmission created TWO orders; pendingRef is not persisted');
  assert.equal(returned.requests[0].ref, first.requests[0].ref);
});
await check('#11/#16: navigation restores ref AND formula/child line IDs before submission', async () => {
  const first = phone('7'); await first.SESSION.open('table', '7');
  first.add('formula', { pasta: 'gnocchi', sauce: 'rosa' }); first.loseResponse(); await first.sendOrder();
  const returned = phone('7', first.storage); await returned.SESSION.open('table', '7');
  returned.add('formula', { pasta: 'gnocchi', sauce: 'rosa' }); await returned.sendOrder();
  assert.equal(JSON.stringify(returned.requests[0]), JSON.stringify(first.requests[0]));
  assert.equal((await feed()).orders.filter(o => o.table === '7').length, 1);
  assert.equal(first.storage.has(first.SESSION.sendKey()), false, 'acknowledgement clears pending identity');
  returned.add('formula', { pasta: 'gnocchi', sauce: 'rosa' }); await returned.sendOrder();
  assert.notEqual(returned.requests[1].ref, returned.requests[0].ref, 'intentional identical order has a new ref');
  assert.equal((await feed()).orders.filter(o => o.table === '7').length, 2);
});
await check('#11: changed basket cannot reuse the uncertain order ref, on-page or after navigation', async () => {
  const first = phone('8'); await first.SESSION.open('table', '8');
  first.add(); first.loseResponse(); await first.sendOrder();
  first.add('dish', {}, 2); first.loseResponse(); await first.sendOrder();
  assert.notEqual(first.requests[0].ref, first.requests[1].ref);
  const returned = phone('8', first.storage); await returned.SESSION.open('table', '8');
  returned.add('dish', {}, 3); await returned.sendOrder();
  assert.notEqual(returned.requests[0].ref, first.requests[1].ref);
  assert.equal((await feed()).orders.filter(o => o.table === '8').length, 3);
});
await check('#11: scope isolates merchant, table, mode and visit; changed options and notes change fingerprint', async () => {
  const p = phone('9'); await p.SESSION.open('table', '9');
  const initial = await p.SESSION.prepareSend([{ id: 'dish', qty: 1, note: '', optionChoices: [] }]);
  const record = JSON.parse(p.storage.get(p.SESSION.sendKey()));
  assert.match(record.fingerprint, /^[a-f0-9]{64}$/);
  assert.deepEqual(Object.keys(record).sort(), ['fingerprint','ref','scope','v']);
  assert.equal(initial.durable, true);
  for (const [field, value] of [['id','next-visit'], ['table','10'], ['mode','takeout']]) {
    const returned = phone('9', new Map(p.storage));
    Object.assign(returned.SESSION, { id: p.SESSION.id, mode: 'table', table: '9', [field]: value });
    assert.notEqual((await returned.SESSION.prepareSend([{ id: 'dish', qty: 1, note: '', optionChoices: [] }])).ref, initial.ref, field);
  }
  const other = phone('9', new Map(p.storage));
  Object.assign(other.SESSION, { id: p.SESSION.id, mode: 'table', table: '9' });
  other.context.NET.slug = 'another-test-merchant';
  assert.notEqual((await other.SESSION.prepareSend([{ id: 'dish', qty: 1, note: '', optionChoices: [] }])).ref, initial.ref);
  assert.notEqual((await p.SESSION.prepareSend([{ id: 'dish', qty: 1, note: 'No salt', optionChoices: [] }])).ref, initial.ref);
  const noteRef = p.SESSION.pendingSend.ref;
  assert.notEqual((await p.SESSION.prepareSend([{ id: 'dish', qty: 1, note: 'No salt', optionChoices: [{ choiceId: 'extra' }] }])).ref, noteRef);
});
await check('#11: closed visit clears pending identity; next visit never reuses it', async () => {
  const first = phone('10'); await first.SESSION.open('table', '10'); first.add(); first.loseResponse(); await first.sendOrder();
  const oldSession = first.SESSION.id, oldRef = first.requests[0].ref;
  first.SESSION.markClosed('settle');
  assert.equal(first.storage.has(first.SESSION.sendKey()), false);
  db.prepare("UPDATE table_sessions SET status='closed',closed_by='settle' WHERE id=?").run(oldSession);
  const returned = phone('10', first.storage); await returned.SESSION.open('table', '10'); returned.add(); await returned.sendOrder();
  assert.notEqual(returned.SESSION.id, oldSession);
  assert.notEqual(returned.requests[0].ref, oldRef);
});
await check('#11: pending identity is durable BEFORE transport; failed storage only promises in-page retry', async () => {
  const p = phone('11'); await p.SESSION.open('table', '11');
  const transport = p.context.NET.placeOrder;
  p.context.NET.placeOrder = body => {
    assert.equal(JSON.parse(p.storage.get(p.SESSION.sendKey())).ref, body.ref);
    return transport(body);
  };
  p.add(); await p.sendOrder();
  const broken = phone('12'); await broken.SESSION.open('table', '12');
  broken.context.localStorage.setItem = () => { throw new Error('storage unavailable'); };
  broken.add(); broken.loseResponse(); await broken.sendOrder();
  assert.equal(broken.SESSION.pendingSend.durable, false);
  assert.equal(broken.toasts.at(-1), 'order_retry_local');
  await broken.sendOrder();
  assert.equal(broken.requests[0].ref, broken.requests[1].ref);
  assert.equal((await feed()).orders.filter(o => o.table === '12').length, 1);
});
await check('#11: unreadable or corrupt storage does not claim a durable pending send', async () => {
  const p = phone('13'); await p.SESSION.open('table', '13');
  p.context.localStorage.getItem = () => { throw new Error('read unavailable'); };
  const pending = await p.SESSION.prepareSend([{ id: 'dish', qty: 1 }]);
  assert.equal(pending.durable, false);
  const corrupt = phone('14'); await corrupt.SESSION.open('table', '14');
  corrupt.storage.set(corrupt.SESSION.sendKey(), '{invalid');
  assert.equal((await corrupt.SESSION.prepareSend([{ id: 'dish', qty: 1 }])).durable, true);
});
await check('#11: acknowledgement cleanup still removes the record when writes become unavailable', async () => {
  const p = phone('15'); await p.SESSION.open('table', '15');
  const attempt = await p.SESSION.prepareSend([{ id: 'dish', qty: 1 }]);
  p.context.localStorage.setItem = () => { throw new Error('writes unavailable'); };
  p.SESSION.clearPendingSend(attempt);
  assert.equal(p.storage.has(p.SESSION.sendKey()), false);
});
await check('#11: late transport success/error cannot change a closed or replacement visit', async () => {
  for (const [table, reopen, lateError] of [['16', false, false], ['17', true, false], ['18', true, true]]) {
    const p = phone(table); await p.SESSION.open('table', table); p.add();
    let entered, release;
    const received = new Promise(resolve => { entered = resolve; });
    const barrier = new Promise(resolve => { release = resolve; });
    const transport = p.context.NET.placeOrder;
    p.context.NET.placeOrder = async body => {
      const response = await transport(body); entered(); await barrier;
      return lateError ? { ok: false, error: 'session-closed' } : response;
    };
    const sending = p.sendOrder(); await received;
    const oldVisit = p.SESSION.id;
    p.SESSION.markClosed('settle');
    assert.equal(p.screens.at(-1), 'screen-thanks');
    let later;
    if (reopen) {
      db.prepare("UPDATE table_sessions SET status='closed',closed_by='settle' WHERE id=?").run(oldVisit);
      p.SESSION.id = ''; p.SESSION.closed = false;
      await p.SESSION.open('table', table);
      p.context.gotoScreen('screen-menu');
      p.add('dish', {}, 3);
      p.context.currentOrderId = 'new-visit-order'; p.context.sessionTotal = 17;
      p.context.$('#send-label').textContent = 'New visit label';
      later = await p.SESSION.prepareSend([{ id: 'dish', qty: 3 }]);
      p.context.pendingRef = later.ref;
    }
    const screensBefore = JSON.stringify(p.screens);
    release(); await sending;
    assert.equal(JSON.stringify(p.screens), screensBefore, 'late response must not navigate');
    assert.equal(p.context.$('#send-btn').classList.contains('is-loading'), false);
    if (reopen) {
      assert.equal(p.SESSION.closed, false, 'old session-closed response cannot close new visit');
      assert.equal(p.context.cart.get('dish').qty, 3);
      assert.equal(p.context.currentOrderId, 'new-visit-order');
      assert.equal(p.context.sessionTotal, 17);
      assert.equal(p.context.sentLines.length, 0);
      assert.equal(p.context.$('#send-label').textContent, 'New visit label');
      assert.equal(p.context.pendingRef, later.ref);
      assert.equal(JSON.parse(p.storage.get(later.key)).ref, later.ref);
      assert.equal(p.SESSION.pendingSend, later);
    } else assert.equal(p.context.currentOrderId, '');
  }
});
await check('#11: acknowledgement during storage read failure cannot replay on identical next order after navigation', async () => {
  const p = phone('19'); await p.SESSION.open('table', '19'); p.add();
  const getItem = p.context.localStorage.getItem, transport = p.context.NET.placeOrder;
  p.context.NET.placeOrder = async body => {
    const response = await transport(body);
    p.context.localStorage.getItem = () => { throw new Error('temporary read failure'); };
    return response;
  };
  await p.sendOrder();
  assert.equal(p.screens.at(-1), 'screen-success');
  p.context.localStorage.getItem = getItem;
  const original = p.requests[0].ref;
  const returned = phone('19', p.storage); await returned.SESSION.open('table', '19');
  returned.add(); await returned.sendOrder();
  assert.notEqual(returned.requests[0].ref, original);
  assert.equal((await feed()).orders.filter(o => o.table === '19').length, 2);
});
await check('#11: failed-read cleanup retires only its captured ref and preserves a later pending attempt', async () => {
  const p = phone('20'); await p.SESSION.open('table', '20');
  const old = await p.SESSION.prepareSend([{ id: 'dish', qty: 1 }]);
  const later = await p.SESSION.prepareSend([{ id: 'dish', qty: 2 }]);
  const getItem = p.context.localStorage.getItem;
  p.context.localStorage.getItem = () => { throw new Error('temporary read failure'); };
  p.SESSION.clearPendingSend(old);
  p.context.localStorage.getItem = getItem;
  assert.equal(p.SESSION.pendingSend, later);
  assert.equal(JSON.parse(p.storage.get(later.key)).ref, later.ref);
  const returned = phone('20', p.storage); await returned.SESSION.open('table', '20');
  assert.equal((await returned.SESSION.prepareSend([{ id: 'dish', qty: 2 }])).ref, later.ref);
  // A late callback still owns its original merchant key, even if the UI changed scope.
  p.context.NET.slug = 'another-test-merchant';
  const other = await p.SESSION.prepareSend([{ id: 'dish', qty: 3 }]);
  p.SESSION.clearPendingSend(later);
  assert.equal(JSON.parse(p.storage.get(other.key)).ref, other.ref);
  assert.equal(p.SESSION.pendingSend, other);
});
await check('#11: old acknowledgement cannot unlock the replacement visit while its new send is in flight', async () => {
  const p = phone('21'); await p.SESSION.open('table', '21'); p.add();
  let enteredOld, enteredNew, releaseOld, releaseNew;
  const oldEntered = new Promise(resolve => { enteredOld = resolve; });
  const newEntered = new Promise(resolve => { enteredNew = resolve; });
  const oldBarrier = new Promise(resolve => { releaseOld = resolve; });
  const newBarrier = new Promise(resolve => { releaseNew = resolve; });
  const transport = p.context.NET.placeOrder;
  let calls = 0;
  p.context.NET.placeOrder = async body => {
    const number = ++calls, response = await transport(body);
    if (number === 1) { enteredOld(); await oldBarrier; }
    else { enteredNew(); await newBarrier; }
    return response;
  };
  const oldSend = p.sendOrder(); await oldEntered;
  const oldVisit = p.SESSION.id;
  p.SESSION.markClosed('settle');
  assert.equal(p.context.$('#send-btn').classList.contains('is-loading'), false);
  db.prepare("UPDATE table_sessions SET status='closed',closed_by='settle' WHERE id=?").run(oldVisit);
  p.SESSION.id = ''; p.SESSION.closed = false;
  await p.SESSION.open('table', '21'); p.add('dish', {}, 2);
  const newSend = p.sendOrder(); await newEntered;
  const newerAttempt = p.SESSION.pendingSend;
  releaseOld(); await oldSend;
  assert.equal(p.context.$('#send-btn').classList.contains('is-loading'), true);
  assert.equal(p.context.$('#send-label').textContent, 'order_sending');
  assert.equal(p.SESSION.pendingSend, newerAttempt);
  assert.equal(p.context.cart.get('dish').qty, 2);
  releaseNew(); await newSend;
  assert.equal(p.context.$('#send-btn').classList.contains('is-loading'), false);
  assert.equal(p.screens.at(-1), 'screen-success');
  assert.equal(p.context.sessionTotal, 100);
});
await check('#3: phone presence without an order does not advance the timer', () => {
  const t = till('6', 'test-session'); t.tick();
  assert.equal(t.context.tables['6'].elapsed, 0);
});
await check('#3: a delayed interval reflects twenty wall-clock minutes', () => {
  const t = till('6', 'test-session');
  t.attach({ id: 'test-order', session: 'test-session', mode: 'table', table: '6', status: 'pending', created_ts: now,
    lines: [{ id: 'dish', name: 'Tajine poulet', qty: 1, unitPrice: 50 }] });
  // A backgrounded/suspended tab receives one callback on resumption.
  t.context.Date = class extends Date { static now() { return now + 20 * 60000; } };
  t.tick();
  assert.equal(t.context.tables['6'].elapsed, 20,
    'twenty minutes of wall time render as ONE minute; timer increments callbacks instead of using timestamps');
});
await check('#3: additional orders preserve the first anchor; reset and next visit start fresh', () => {
  const t = till('timer-table', 'visit-one');
  const first = { id: 'first', session: 'visit-one', mode: 'table', table: 'timer-table', status: 'pending', created_ts: now,
    lines: [{ id: 'dish', name: 'Tajine poulet', qty: 1, unitPrice: 50 }] };
  t.attach(first);
  t.context.Date = class extends Date { static now() { return now + 20 * 60000; } };
  t.attach({ ...first, id: 'second', created_ts: now + 20 * 60000 }); t.tick();
  assert.equal(t.context.tables['timer-table'].elapsed, 20);
  t.context.resetTableTimer(t.context.tables['timer-table']);
  t.context.tableOrders['timer-table'] = [];
  t.context.phoneSeats.set('timer-table', { session: 'visit-two', since: now + 20 * 60000 });
  t.attach({ ...first, id: 'third', session: 'visit-two', created_ts: now + 20 * 60000 });
  assert.equal(t.context.tables['timer-table'].elapsed, 0);
  t.context.Date = class extends Date { static now() { return now + 25 * 60000; } };
  t.tick(); assert.equal(t.context.tables['timer-table'].elapsed, 5);
});
await check('#3: legacy elapsed fallback and persisted anchor survive delayed callbacks', () => {
  const t = till('old-table', 'old-visit');
  t.context.tables['old-table'].elapsed = 12;
  t.context.tableOrders['old-table'] = [{ id: 'dish' }];
  t.context.Date = class extends Date { static now() { return now; } };
  t.tick(); assert.equal(t.context.tables['old-table'].elapsed, 12);
  t.context.Date = class extends Date { static now() { return now + 20 * 60000; } };
  t.tick(); assert.equal(t.context.tables['old-table'].elapsed, 32);
});
await check('#3: reconnect importing newest ticket first still uses the earliest order timestamp', () => {
  const t = till('reconnect', 'visit');
  t.context.Date = class extends Date { static now() { return now + 20 * 60000; } };
  const o = { id: 'newer', session: 'visit', mode: 'table', table: 'reconnect', status: 'pending',
    created_ts: now + 15 * 60000, lines: [{ id: 'dish', qty: 1, unitPrice: 50 }] };
  t.attach(o); assert.equal(t.context.tables.reconnect.elapsed, 5);
  t.attach({ ...o, id: 'older', created_ts: now });
  assert.equal(t.context.tables.reconnect.elapsed, 20);
});
await check('#3: actual markPaid clears the anchor before a reused table receives an order', () => {
  const t = till('paid', 'visit');
  Object.assign(t.context, { releasePhoneTable() {}, shift: { tablesPaid: 0 }, renderShiftStats() {}, setTimeout() {} });
  vm.runInContext(slice(caisseSource, '    function markPaid(id)', '    /* ===========================================================\n       Vente rapida'), t.context);
  const o = { id: 'paid-order', session: 'visit', mode: 'table', table: 'paid', status: 'pending', created_ts: now,
    lines: [{ id: 'dish', qty: 1, unitPrice: 50 }] };
  t.attach(o); assert.ok(t.context.tables.paid.orderStartedAt);
  t.context.markPaid('paid');
  assert.equal(t.context.tables.paid.orderStartedAt, undefined);
  assert.equal(t.context.tables.paid.elapsed, 0);
  assert.equal(t.context.tableOrders.paid.length, 0);
  t.context.Date = class extends Date { static now() { return now + 30 * 60000; } };
  t.context.tables.paid.status = 'ka-yaklo';
  t.context.phoneSeats.set('paid', { session: 'next-visit', since: now + 30 * 60000 });
  t.attach({ ...o, id: 'next-order', session: 'next-visit', created_ts: now + 30 * 60000 });
  assert.equal(t.context.tables.paid.elapsed, 0);
});
await check('#3: actual transfer migration carries the anchor and clears the source', () => {
  const t = till('source', 'visit');
  t.context.tables.target = { status: 'khawya', elapsed: 0 };
  const o = { id: 'move-order', session: 'visit', mode: 'table', table: 'source', status: 'pending', created_ts: now,
    lines: [{ id: 'dish', qty: 1, unitPrice: 50 }] };
  t.attach(o);
  t.context.Date = class extends Date { static now() { return now + 20 * 60000; } };
  // Execute the production migration block; API authorization and networking
  // are covered by the shared-table suite. Timer helpers above are real code.
  const migration = slice(caisseSource, '      // Local state migration', '      refreshTableNode(from);');
  Object.assign(t.context, {
    transferData: { movedSession: 'visit', revision: 1 },
    transferIntent: { since: now, destinationClosedAt: 0 },
    phoneMovedVisits: new Map(), phonePending: new Map(), window: {},
    confirmCaisseTransfer() {}, publishServiceFloor() {},
  });
  vm.runInContext(slice(caisseSource, '    function applyCaisseMovedVisit(', '    function openCaisseTransferModal('), t.context);
  vm.runInContext('const from="source",to="target",fromT=tables[from],toT=tables[to];\n' + migration, t.context);
  assert.equal(t.context.tables.target.orderStartedAt, now);
  assert.equal(t.context.tables.target.elapsed, 20);
  assert.equal(t.context.tables.source.orderStartedAt, undefined);
  assert.equal(t.context.tables.source.elapsed, 0);
});
db.close();
console.log(`\nField OrderPro acceptance: ${passed} passed, ${failed} failed.`);
process.exitCode = failed ? 1 : 0;
