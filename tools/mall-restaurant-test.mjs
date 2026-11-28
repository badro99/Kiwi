#!/usr/bin/env node
/* Mall restaurants (God mode › mallRestaurant, 27 Nov 2026).
 * A food-court counter: order, pay, take a bipeur, wait. The real
 * counter-flow.js, receipt.js and escpos.js run in vm; the till's shared
 * state is a small stub. What this holds:
 *   · switch off: nothing changes (settings read as saved, kitchen ticket at
 *     once, no bipeur, counter sales still end at payment);
 *   · switch on: pay first (the three counter switches forced on), the lowest
 *     free bipeur of 1..N, freed at handover, printed large on the receipt and
 *     the kitchen ticket, carried through the kitchen queue, the kitchen
 *     ticket after the receipt, no Salle and no « Annuler une vente ».
 * Run: node tools/mall-restaurant-test.mjs */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

let n = 0;
const ok = async (name, fn) => { await fn(); n++; console.log('  ✓ ' + name); };
const read = (f) => fs.readFileSync(f, 'utf8');

/* ── counter-flow.js with a stub till ── */
function till({ mall, saved = {}, pagers } = {}) {
  const listeners = {};
  const timers = [];
  const printed = [];
  const toasts = [];
  const window = {
    KiwiConfig: { features: mall ? { mallRestaurant: true } : {} },
    KiwiDiscountPolicy: { counterFlow: () => ({ direct: false, payToKitchen: false, typeAtPay: false, ...saved }) },
    KiwiCounterFlow: { get: () => (pagers == null ? {} : { pagers }) },
    addEventListener: (name, fn) => { (listeners[name] = listeners[name] || []).push(fn); },
  };
  const ctx = vm.createContext({
    window, console, Date, Set, Math, Number, String, Array, Object, Promise, JSON,
    setTimeout: (fn, ms) => { timers.push({ fn, ms }); return timers.length; },
    toast: (m) => toasts.push(String(m)),
    printKitchenTickets: (order) => printed.push(order.num),
  });
  vm.runInContext('var mode = "vrap", cart = [], vrapEditingNum = null, kdsOrders = [], tables = {}, selectedId = null;', ctx);
  vm.runInContext(read('assets/caisse/counter-flow.js'), ctx, { filename: 'counter-flow.js' });
  const fire = (name) => (listeners[name] || []).forEach((fn) => fn({}));
  const runTimers = (maxMs) => { const due = timers.filter((t) => t.ms <= maxMs); due.forEach((t) => { timers.splice(timers.indexOf(t), 1); t.fn(); }); };
  return { ctx, window, printed, toasts, fire, runTimers, timers, run: (src) => vm.runInContext(src, ctx) };
}
/* One paid counter order, as finalizeTender makes it: gate, then the order. */
async function payOne(T, num, service = 'surplace') {
  T.run(`counterState().type = ${JSON.stringify(service)};`);
  assert.equal(await T.run('counterTenderGate("cash")'), true);
  return T.run(`(() => { const o = { num: ${num}, type: 'takeaway', status: 'new', sentAt: new Date(), relayLines: [{ name: 'Tacos' }], items: [] }; counterStampOrder(o); kdsOrders.push(o); return o; })()`);
}

console.log('\n\x1b[1mMall restaurants · bipeurs, payer d’abord, le bon après le reçu\x1b[0m');

await ok('switch off: the till reads the owner’s settings as saved', () => {
  const T = till({ mall: false, saved: { typeAtPay: true } });
  assert.deepEqual({ ...T.run('counterFlow()') }, { direct: false, payToKitchen: false, typeAtPay: true });
  assert.equal(T.run('mallOn()'), false);
});
await ok('switch off: an order gets no bipeur and its kitchen ticket prints at once', async () => {
  const T = till({ mall: false, saved: { typeAtPay: true } });
  const o = await payOne(T, 1);
  assert.equal(o.pager, undefined);
  assert.equal(o.relayLines[0].pager, undefined);
  assert.equal(T.run('mallCardTag(kdsOrders[0])'), '');
  assert.equal(T.run('mallKitchenHolds(kdsOrders[0], [])'), false, 'not held: the caller prints at once');
});
await ok('switch on: pay first, sur place / à emporter at payment, kitchen starts at once', () => {
  const T = till({ mall: true });
  assert.deepEqual({ ...T.run('counterFlow()') }, { direct: true, payToKitchen: true, typeAtPay: true });
  assert.equal(T.run('counterHidesSend(false, null)'), true, '« Envoyer en cuisine » hidden');
});
await ok('switch on: each order takes the lowest free bipeur, handover frees it', async () => {
  const T = till({ mall: true, pagers: 3 });
  const a = await payOne(T, 1), b = await payOne(T, 2, 'emporter');
  assert.equal(a.pager, 1); assert.equal(b.pager, 2);
  assert.equal(a.relayLines[0].pager, 1, 'the bipeur travels to the kitchen queue');
  T.run('kdsOrders[0].pickedUp = true;');
  const c = await payOne(T, 3);
  assert.equal(c.pager, 1, 'bipeur 1 is free again after « Remettre au client »');
  const d = await payOne(T, 4);
  assert.equal(d.pager, 3);
  const e = await payOne(T, 5);
  assert.equal(e.pager, undefined, 'all three busy: no bipeur');
  assert.ok(T.toasts.some((t) => /Aucun bipeur libre/.test(t)), 'the cashier is told');
});
await ok('switch on: an order older than twelve hours no longer holds its bipeur', async () => {
  const T = till({ mall: true, pagers: 1 });
  const a = await payOne(T, 1);
  a.sentAt = new Date(Date.now() - 13 * 3600000);
  assert.equal((await payOne(T, 2)).pager, 1);
});
await ok('the bipeur count is clamped to 1..20, ten when the owner has not set it', () => {
  assert.equal(till({ mall: true }).run('mallPagerCount()'), 10);
  assert.equal(till({ mall: true, pagers: 20 }).run('mallPagerCount()'), 20);
  assert.equal(till({ mall: true, pagers: 40 }).run('mallPagerCount()'), 20);
});
await ok('a delivery order gets no bipeur and the gate does not ask', async () => {
  const T = till({ mall: true });
  T.run('globalThis.dlvCur = () => ({ id: "glovo" });');
  T.run('counterState().type = "";');
  assert.equal(await T.run('counterTenderGate("platform")'), true);
  assert.equal(T.run('counterState().pager || 0'), 0);
});
await ok('the bipeur reaches the kitchen ticket, the sale and the board card', async () => {
  const T = till({ mall: true });
  const o = await payOne(T, 26, 'surplace');
  assert.equal(T.run('counterTicketFields(kdsOrders[0]).table'), 'BIPEUR 1');
  const entry = { label: 'À emporter #26' };
  T.run('counterSaleTag')(entry, o);
  assert.equal(entry.pager, 1);
  assert.equal(entry.label, 'Sur place #26', 'the label keeps its shape (« · part N » stays last)');
  const card = T.run('mallCardTag(kdsOrders[0])');
  assert.match(card, /Bipeur 1/); assert.doesNotMatch(card, /Sur place|#053B2C|#7DF2B0|font-weight/, 'the bipeur is plain card type, no dark mint pill');
  assert.match(T.run("mallCardTag(kdsOrders[0], 'badge')"), /^<span class="vrap-badge p-unpaid vrap-service">Sur place<\/span>$/, '« Sur place » is a status chip like « Payé »');
});
await ok('another screen learns the bipeur from the queue', () => {
  const T = till({ mall: true });
  const t = {};
  T.run('counterFromQueue')(t, [{ name: 'Tacos', service: 'emporter', pager: 7 }]);
  assert.equal(t.pager, 7); assert.equal(t.service, 'emporter');
  const u = {};
  T.run('counterFromQueue')(u, [{ name: 'Tacos', pager: 99 }]);
  assert.equal(u.pager, undefined, 'out of range is ignored');
});
await ok('the kitchen ticket waits for the receipt, then prints', async () => {
  const T = till({ mall: true });
  await payOne(T, 1);
  assert.equal(T.run('mallKitchenHolds(kdsOrders[0], [])'), true);
  assert.deepEqual(T.printed, [], 'held while the sale is being paid');
  T.fire('kiwi:sale-paid');
  assert.deepEqual(T.printed, [], 'not before the receipt (same breath)');
  T.runTimers(300);
  assert.deepEqual(T.printed, [1]);
  T.runTimers(8000);
  assert.deepEqual(T.printed, [1], 'never twice');
});
await ok('no receipt comes (a split share, an error): the kitchen still gets its ticket', async () => {
  const T = till({ mall: true });
  await payOne(T, 1);
  assert.equal(T.run('mallKitchenHolds(kdsOrders[0], [])'), true);
  T.runTimers(8000);
  assert.deepEqual(T.printed, [1]);
});
await ok('a kitchen ticket outside a payment is not held, mall or not', () => {
  const T = till({ mall: true });
  assert.equal(T.run('kdsOrders.push({ num: 9 }); mallKitchenHolds(kdsOrders[0], [])'), false);
});

/* ── receipt.js : the bipeur, large ── */
const document = { readyState: 'loading', addEventListener() {}, getElementById() { return null; }, createElement() { return {}; } };
const win = { document };
const rctx = vm.createContext({
  window: win, document, console,
  localStorage: { getItem() { return null; }, setItem() {}, key() { return null; }, length: 0 },
  sessionStorage: { getItem() { return null; }, setItem() {} },
  setTimeout() { return 0; }, clearTimeout() {}, Uint8Array, Uint8ClampedArray, Promise, Date, TextEncoder,
});
vm.runInContext(read('assets/escpos.js'), rctx);
vm.runInContext(read('assets/receipt.js'), rctx);
const K = win.KiwiReceipt;
const sale = (pager) => ({ ref: '26', label: 'Sur place #26', pager, lines: [{ qty: 1, name: 'Tacos', total: 60 }], total: 60, pay: [{ label: 'espèces', amount: 60 }] });
await ok('the receipt prints « BIPEUR 7 » in large type, and nothing without one', () => {
  const doc = K.build(sale(7));
  assert.equal(doc.meta.pager, 7);
  const paper = Buffer.from(K.escpos(doc)).toString('latin1');
  assert.ok(paper.includes('BIPEUR 7'));
  assert.ok(K.html(doc).includes('BIPEUR'));
  assert.ok(K.html(K.fromSnapshot(K.snapshot(doc))).includes('BIPEUR'), 'a reprint keeps it');
  const none = K.build(sale(0));
  assert.equal(none.meta.pager, undefined);
  assert.ok(!Buffer.from(K.escpos(none)).toString('latin1').includes('BIPEUR'));
});

/* ── the wiring, read from the sources ── */
await ok('the switch hides Salle and « Annuler une vente », nothing else', () => {
  const mc = read('assets/merchant-config.js');
  assert.match(mc, /if \(cfg\.features && cfg\.features\.mallRestaurant === true && \(key === 'salle' \|\| key === 'cancelSale'\)\) return true;/);
  assert.match(read('kiwi-caisse.html'), /data-action="cancel-sale" data-feature="cancelSale"/);
  assert.match(read('kiwi-admin.html'), /key:'mallRestaurant', label:'Mall restaurants', off:true/);
});
await ok('the board keeps a paid mall order until it is handed over', () => {
  const board = read('assets/caisse-kitchen/takeaway-board.js');
  assert.match(board, /function vrapIsCounterSale\(o\) \{\n\s+if \(!o\) return false; if \(o\.delivery\) return false; if \(typeof mallOn === 'function' && mallOn\(\)\) return false;/);
  assert.match(board, /typeof mallCardTag === 'function' \? mallCardTag\(o\) : ''/);
  assert.match(read('assets/caisse-kitchen/kitchen-paper.js'), /const paper = \(\) => \(typeof mallKitchenHolds === 'function' && mallKitchenHolds\(order, items\)\) \|\| printKitchenTickets\(order, items\);/);
});
await ok('the kitchen queue and the kitchen screens carry the bipeur', () => {
  assert.match(read('functions/api/order/_queue-create.js'), /if \(Number\.isInteger\(l\.pager\) && l\.pager >= 1 && l\.pager <= 20\) line\.pager = l\.pager;/);
  assert.match(read('assets/caisse-kitchen/kds-board.js'), /if \(o\.pager && typeof mallPagerLabel === 'function'\) chips\.unshift\(mallPagerLabel\(o\.pager\)\);/);
  const cuisine = read('kiwi-cuisine.html');
  assert.equal((cuisine.match(/'chip\.pager':/g) || []).length, 3, 'fr, en, ar');
  assert.equal((cuisine.match(/T\('chip\.pager'\)/g) || []).length, 2, 'classic card and 2027 ticket');
});
await ok('kitchen tablet: on, a paid order skips « Nouvelles » and cooks from the start', () => {
  const src = read('kiwi-cuisine.html');
  const fn = (name) => { const i = src.indexOf('  function ' + name + '('); const j = src.indexOf('\n  }\n', i); return src.slice(i, j + 4); };
  const S = { station: 'all', cooking: {}, mall: false };
  const env = new Function('S', fn('stationIsReady') + fn('stationIsAccepted') + fn('bucket') + '; return bucket;')(S);
  const order = { id: 'a', status: 'accepted', created_ts: 1, lines: [{ station: 'cuisine' }] };
  assert.equal(env(order), 'new', 'off: the chef still takes it');
  S.mall = true;
  assert.equal(env(order), 'cook', 'on: straight to En préparation');
  assert.equal(env({ ...order, status: 'ready' }), 'pass', 'ready stays ready');
  assert.match(src, /var mall = cfg\.features\.mallRestaurant === true;\n\s+if \(mall !== S\.mall\) \{ S\.mall = mall; paint\(\); \}/, 'the tablet reads the switch from /api/config');
});
await ok('the owner sets the bipeur count (1..20), the server refuses anything else', () => {
  assert.match(read('functions/api/store.js'), /counterflow: \{ keys: \['direct', 'payToKitchen', 'typeAtPay', 'pagers'\]/);
  assert.match(read('functions/api/store.js'), /k === 'pagers' \? !\(Number\.isInteger\(v\) && v >= 1 && v <= 20\) : typeof v !== 'boolean'/);
  assert.match(read('assets/till-policy-settings.js'), /data-tps-pagers/);
});

await ok('kitchen screen: the empty « Nouvelles » column is gone, « En préparation » takes its width', () => {
  for (const f of ['assets/caisse-kitchen/kds-board.js', 'assets/caisse-kitchen.js']) {
    assert.match(read(f), /nb\.style\.display = \(typeof mallOn === 'function' && mallOn\(\) && !newList\.length\) \? 'none' : ''/, f);
  }
  assert.match(read('assets/caisse-shell.css'), /\.kit-col-cooking \{ flex: 1;/);
  assert.match(read('assets/caisse-kitchen/kds-board.js'), /if \(source\.kind === 'takeaway'\) source\.label = svc; else chips\.unshift\(svc\);/, 'sur place / à emporter replaces the source, never shown twice');
});

console.log(`\n✓ mall restaurants: ${n} checks · off changes nothing, on pays first, hands out bipeurs, prints the kitchen after the receipt`);
