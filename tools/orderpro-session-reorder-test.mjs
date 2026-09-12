#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · OrderPro Session Reorder, Accidental Touch Prevention & Caisse Timer Test
 * ═══════════════════════════════════════════════════════════════════════════ */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

const ORDERPRO_SRC = fs.readFileSync(path.join(ROOT, 'OrderPro.html'), 'utf8');
const CAISSE_SRC   = fs.readFileSync(path.join(ROOT, 'kiwi-caisse.html'), 'utf8');
const SESSION_SRC  = fs.readFileSync(path.join(ROOT, 'functions/api/order/session.js'), 'utf8');
const INBOX_SRC    = fs.readFileSync(path.join(ROOT, 'assets/orderpro-inbox.js'), 'utf8');
const QUEUE_SRC    = fs.readFileSync(path.join(ROOT, 'functions/api/order/queue.js'), 'utf8');

let passed = 0;
let failed = 0;

function ok(name, cond) {
  if (cond) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    console.error(`  ✗ ${name}`);
  }
}

console.log('■ OrderPro Reorder Button & Lockout Prevention');

// 1. Reorder button & styles in OrderPro.html
ok('#thanks-reorder-btn button exists inside #screen-thanks',
  /<button class="thanks-reorder-btn" id="thanks-reorder-btn"[^>]*data-i18n="thanks_reorder"/.test(ORDERPRO_SRC));

ok('.thanks-reorder-btn CSS styling is present',
  /\.thanks-reorder-btn\s*\{[\s\S]*?background:\s*#fff;[\s\S]*?color:\s*var\(--forest\);/.test(ORDERPRO_SRC));

ok('French translation thanks_reorder is present',
  /thanks_reorder:\s*"Commander à nouveau"/.test(ORDERPRO_SRC));

ok('English translation thanks_reorder is present',
  /thanks_reorder:\s*"Order again"/.test(ORDERPRO_SRC));

ok('Arabic translation thanks_reorder is present',
  /thanks_reorder:\s*"طلب من جديد"/.test(ORDERPRO_SRC));

// 2. SESSION & recentlySettled behavior
ok('SESSION.recentlySettled allows reorder and does not block caisse or expiry closures',
  /recentlySettled\(mode,\s*table,\s*allowReorder\s*=\s*false\)[\s\S]*?if\s*\(allowReorder\)\s*return false;[\s\S]*?if\s*\(s\.closedBy && s\.closedBy !== 'settle'\)\s*return false;/.test(ORDERPRO_SRC));

ok('SESSION.markClosed records closedBy in local storage payload',
  /markClosed\(why\)[\s\S]{0,200}closedBy:\s*this\.closedBy/.test(ORDERPRO_SRC));

ok('seatHere passes allowReorder to recentlySettled',
  /async function seatHere\(mode,\s*table,\s*allowReorder\s*=\s*false\)[\s\S]{0,150}SESSION\.recentlySettled\(mode,\s*table,\s*allowReorder\)/.test(ORDERPRO_SRC));

ok('#thanks-reorder-btn click listener clears dead session and reseats client',
  /if\s*\(e\.target\.closest\('#thanks-reorder-btn'\)\)\s*\{[\s\S]{0,300}SESSION\._write\(null\);[\s\S]{0,300}seatHere\('table',\s*tableNumber,\s*true\)/.test(ORDERPRO_SRC));

console.log('■ Accidental Touch & Water Addition Prevention');

// 3. Dish card vs + button isolation
ok('dish-card article uses data-card and does NOT place data-add on the article element',
  /<article class="dish-card\$\{out \? ' is-out' : ''\}"\$\{out \? '' : ` data-card="\$\{escapeHtml\(m\.id\)\}"`\}>/.test(ORDERPRO_SRC) &&
  !/<article class="dish-card[^"]*"[^>]*data-add=/.test(ORDERPRO_SRC));

ok('dish-add + button retains data-add',
  /<button type="button" class="dish-add" data-add=/.test(ORDERPRO_SRC));

ok('cardEl tap listener only opens customizer if item has options',
  /const cardEl = e\.target\.closest\('\[data-card\]'\);[\s\S]{0,200}if \(item && item\.options && item\.options\.length > 0\)\s*\{[\s\S]{0,100}openCustomizer\(item\);/.test(ORDERPRO_SRC));

console.log('■ Session Resumption & Zombie Session Isolation');

// 4. Session resumption in session.js
ok('session.js checks seen_ts activity and verifies orders are not already all paid',
  /const lastSeen = Number\(\(live && \(live\.seen_ts \|\| live\.opened_ts\)\) \|\| 0\);/.test(SESSION_SRC) &&
  /allPaid = true;/.test(SESSION_SRC) &&
  /allPaid \? 'settle' : 'expiry'/.test(SESSION_SRC));

console.log('■ Caisse Table Timer & Stale Line Purge');

// 5. Caisse timer suppression when no orders exist
ok('caisseNoirCellHTML / cplanTableHTML only display elapsed timer if hasOrder is true',
  /const hasOrder = \(tableOrders\[id\] && tableOrders\[id\]\.length > 0\) \|\| \(orders\[id\] && orders\[id\]\.length > 0\);[\s\S]{0,200}hot = \(live\.status === 'ka-yaklo'[\s\S]{0,150}&& hasOrder;/.test(CAISSE_SRC));

ok('renderRightPanel displays honest substatus when no orders exist',
  /const hasOrder = \(tableOrders\[id\] && tableOrders\[id\]\.length > 0\) \|\| \(orders\[id\] && orders\[id\]\.length > 0\);[\s\S]{0,200}Client connecté sur téléphone/.test(CAISSE_SRC));

ok('live elapsed loop only increments elapsed when table has orders',
  /const hasOrder = \(tableOrders\[id\] && tableOrders\[id\]\.length > 0\) \|\| \(orders\[id\] && orders\[id\]\.length > 0\);[\s\S]{0,150}if \(hasOrder && \(t\.status === 'ka-yaklo'/.test(CAISSE_SRC));

ok('markPaid clears tableOrders synchronously',
  /function markPaid\(id\) \{[\s\S]{0,1100}tableOrders\[id\] = \[\];/.test(CAISSE_SRC));

ok('attachOrderProTable purges lines from other sessions',
  /let lines = tableOrders\[id\] \|\| \(tableOrders\[id\] = \[\]\);[\s\S]{0,200}const curSession = String\(activeSeat\.session\);[\s\S]{0,200}const filtered = lines\.filter\(l => !l\.orderSession \|\| String\(l\.orderSession\) === curSession\);[\s\S]{0,150}lines = tableOrders\[id\] = filtered;/.test(CAISSE_SRC));

console.log('■ Commandes Clients Print Button Removal');

// 6. Print button removal in inbox
ok('orderpro-inbox.js omits kop-print button from action row',
  !/class="[^"]*kop-print/.test(INBOX_SRC));

console.log('■ Expired Takeaway Orders Dismissal & Vider Prevention');

// 7. Expired orders dismissal & Vider prevention
ok('expiredRow provides a Supprimer action button with data-exp-dismiss',
  /data-exp-dismiss=/.test(CAISSE_SRC) &&
  /data-exp-reprendre=/.test(CAISSE_SRC));

ok('reprendreExpired tracks vrapResumedExpiredId and dismisses order from expired list',
  /reprendreExpired\(id\)[\s\S]*?vrapResumedExpiredId\s*=\s*String\(id\);[\s\S]*?dismissExpired\(id\);/.test(CAISSE_SRC));

ok('clearCart dismisses resumed expired order so it does not return to Expirées',
  /clearCart\(\)\s*\{[\s\S]*?if\s*\(vrapResumedExpiredId\)\s*\{[\s\S]*?dismissExpired\(vrapResumedExpiredId\);[\s\S]*?vrapResumedExpiredId\s*=\s*null;/.test(CAISSE_SRC));

ok('cancelOrderProTakeaway dismisses order so it never lands in Expirées',
  /cancelOrderProTakeaway\(o,\s*authorizedWho\s*=\s*null\)[\s\S]*?dismissExpired\(o\.opId\);[\s\S]*?opPush\(o,\s*'rejected',\s*\{\s*server:\s*'dismissed',\s*actorProof:/.test(CAISSE_SRC));

ok('queue.js onRequestPost handles dismiss_expired and marks server_name dismissed',
  /action\s*===\s*'dismiss_expired'[\s\S]*?server_name\s*=\s*'dismissed'/.test(QUEUE_SRC));

ok('queue.js GET query excludes orders marked dismissed',
  /WHERE merchant = \? AND status = 'rejected'[\s\S]*?AND \(server_name IS NULL OR server_name <> 'dismissed'\)/.test(QUEUE_SRC));

console.log('■ Guest Ordering Protection (No Kickout While Ordering)');

// 8. Execute the shipped SESSION, onSessionClosed and LIVE together. The VM
// supplies only DOM/network/timer seams; cart reset and closure routing remain
// the production functions.
const sessionSource = ORDERPRO_SRC.match(/    const SESSION = \{[\s\S]*?\n    \};\n\n    \/\* Le service est fini/);
if (!sessionSource) throw new Error('FAIL: could not extract production SESSION object');
const onClosedSource = ORDERPRO_SRC.match(/    function onSessionClosed\(\) \{[\s\S]*?\n    \}\n\n    \/\* ═══════════════════════════════════════════════════════════════════════\n       LE DIRECT/);
if (!onClosedSource) throw new Error('FAIL: could not extract production onSessionClosed');
const liveSource = ORDERPRO_SRC.match(/    const LIVE = \(\(\) => \{[\s\S]*?\n    \}\)\(\);/);
if (!liveSource) throw new Error('FAIL: could not extract production LIVE');
const sendOrderSource = ORDERPRO_SRC.match(/    async function sendOrder\(\) \{[\s\S]*?\n    \}\n\n    \/\* Table mode gets/);
if (!sendOrderSource) throw new Error('FAIL: could not extract production sendOrder function');

function deferred() {
  let resolve;
  const promise = new Promise((r) => { resolve = r; });
  return { promise, resolve };
}
const flushPromises = () => new Promise((resolve) => setImmediate(resolve));

function makeProductionContext(net, cart) {
  const storage = new Map();
  const thanksSub = { textContent: '' };
  const screenEvents = [];
  const refreshes = [];
  const element = { classList: { add() {}, remove() {}, contains: () => false }, textContent: '' };
  const context = vm.createContext({
    NET: net,
    cart,
    currentOrderId: '',
    sentLines: [],
    pendingRef: '',
    storage,
    thanksSub,
    screenEvents,
    refreshes,
    element,
    localStorage: {
      getItem: (key) => storage.get(key) || null,
      setItem: (key, value) => storage.set(key, String(value)),
      removeItem: (key) => storage.delete(key),
    },
    document: { hidden: false, addEventListener() {} },
    window: { addEventListener() {} },
    setTimeout: () => 1,
    clearTimeout() {},
    refreshCartUI: () => refreshes.push('cart'),
    $: (selector) => selector === '#thanks-sub' ? thanksSub : element,
    t: (key) => key,
    gotoScreen: (screen) => screenEvents.push(screen),
    applyOrderStatus() {},
  });
  const source = [
    'let lastStatus = "";',
    sessionSource[0].replace(/\n\n    \/\* Le service est fini[\s\S]*$/, ''),
    onClosedSource[0].replace(/\n\n    \/\* ═══════════════════════════════════════════════════════════════════════\n       LE DIRECT[\s\S]*$/, ''),
    liveSource[0],
    'globalThis.__production = { SESSION, LIVE, storage, thanksSub, screenEvents, refreshes, element };',
  ].join('\n');
  new vm.Script(source, { filename: 'OrderPro.html · session/live production slice' }).runInContext(context);
  return { context, ...context.__production };
}

const unreachable = deferred();
let statusCalls = 0;
const draftCart = new Map([['draft', { id: 'coffee', qty: 1 }]]);
const liveProduction = makeProductionContext({
  slug: 'cafe-atlas',
  sessionStatus: () => { statusCalls++; return unreachable.promise; },
}, draftCart);
liveProduction.SESSION.id = 'session-network-unknown';
liveProduction.SESSION.mode = 'table';
liveProduction.SESSION.table = 'A';
liveProduction.LIVE.start();
unreachable.resolve({ ok: false, error: 'network' });
await unreachable.promise;
await flushPromises();
ok('production LIVE.tick does not close or clear a draft on an unreachable session status',
  statusCalls === 1 && liveProduction.SESSION.closed === false && draftCart.size === 1
  && liveProduction.screenEvents.length === 0);
liveProduction.LIVE.stop();

const closedStatus = deferred();
const closedCart = new Map([['draft', { id: 'coffee', qty: 1 }]]);
const closedProduction = makeProductionContext({
  slug: 'cafe-atlas',
  sessionStatus: () => closedStatus.promise,
}, closedCart);
closedProduction.SESSION.id = 'session-closed-draft';
closedProduction.SESSION.mode = 'table';
closedProduction.SESSION.table = 'A';
closedProduction.LIVE.start();
closedStatus.resolve({ ok: true, status: 'closed', closedBy: 'settle' });
await closedStatus.promise;
await flushPromises();
const closedPayload = closedProduction.SESSION._read();
ok('production LIVE.tick invokes shipped onSessionClosed for a closed shared visit with a draft',
  closedProduction.SESSION.closed === true && closedCart.size === 0
  && closedProduction.refreshes.length === 1
  && closedProduction.screenEvents.at(-1) === 'screen-thanks'
  && closedPayload && closedPayload.closedBy === 'settle'
  && closedProduction.SESSION.id === 'session-closed-draft');

// The same VM context now executes the real sendOrder function. The only
// network seam is a server-level session-closed response; SESSION.open is
// wrapped only to prove this branch never silently reseats.
const sendProduction = makeProductionContext({
  slug: 'cafe-atlas',
  placeOrder: async () => { sendProductionCalls++; return { ok: false, error: 'session-closed' }; },
}, new Map([['draft', { id: 'coffee', qty: 1, options: {}, note: '', unitPrice: 20, qty: 1 }]]));
let sendProductionCalls = 0;
let openCalls = 0;
const originalOpen = sendProduction.SESSION.open;
sendProduction.SESSION.open = async (...args) => { openCalls++; return originalOpen.apply(sendProduction.SESSION, args); };
sendProduction.SESSION.id = 'session-server-closed';
sendProduction.SESSION.mode = 'table';
sendProduction.SESSION.table = 'A';
Object.assign(sendProduction.context, {
  orderMode: 'table', tableNumber: 'A', sessionTotal: 0, sentLines: [],
  nameOf: () => 'Coffee', totals: () => ({ total: 20 }), itemOf: () => ({ options: [] }),
  describeOptionChoices: () => [], describeOptionVisuals: () => [], groupLabel: () => '',
  watchTableOrder() {},
});
new vm.Script(`${sendOrderSource[0].replace(/\n\n    \/\* Table mode gets[\s\S]*$/, '')}\nglobalThis.__sendOrder = sendOrder;`, { filename: 'OrderPro.html · sendOrder production slice' }).runInContext(sendProduction.context);
await sendProduction.context.__sendOrder();
ok('production sendOrder handles server session-closed without reopening the visit',
  sendProductionCalls === 1 && openCalls === 0 && sendProduction.SESSION.closed === true
  && sendProduction.context.cart.size === 0
  && sendProduction.screenEvents.at(-1) === 'screen-thanks'
  && sendProduction.SESSION.id === 'session-server-closed');

ok('SESSION.recentlySettled returns false if hadOrder === false or cart > 0',
  /if \(cart && cart\.size > 0\) return false;/.test(ORDERPRO_SRC) &&
  /if \(s\.hadOrder === false\) return false;/.test(ORDERPRO_SRC));

ok('session.js allows full 6 hour lifetime when no orders are placed yet',
  /totalOrders === 0 \|\| \(now - lastSeen\) < 30 \* 60 \* 1000/.test(SESSION_SRC));

console.log(`\nResults: ${passed} passed, ${failed} failed.\n`);
if (failed > 0) process.exit(1);
