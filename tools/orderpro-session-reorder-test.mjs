#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · OrderPro Session Reorder, Accidental Touch Prevention & Caisse Timer Test
 * ═══════════════════════════════════════════════════════════════════════════ */
import fs from 'node:fs';
import path from 'node:path';
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
  /function markPaid\(id\) \{[\s\S]{0,250}tableOrders\[id\] = \[\];/.test(CAISSE_SRC));

ok('attachOrderProTable purges lines from other sessions',
  /const lines = tableOrders\[id\] \|\| \(tableOrders\[id\] = \[\]\);[\s\S]{0,200}const curSession = String\(activeSeat\.session\);[\s\S]{0,200}const filtered = lines\.filter\(l => !l\.orderSession \|\| String\(l\.orderSession\) === curSession\);/.test(CAISSE_SRC));

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
  /cancelOrderProTakeaway\(o\)[\s\S]*?dismissExpired\(o\.opId\);[\s\S]*?opPush\(o,\s*'rejected',\s*\{\s*server:\s*'dismissed'\s*\}\)/.test(CAISSE_SRC));

ok('queue.js onRequestPost handles dismiss_expired and marks server_name dismissed',
  /action\s*===\s*'dismiss_expired'[\s\S]*?server_name\s*=\s*'dismissed'/.test(QUEUE_SRC));

ok('queue.js GET query excludes orders marked dismissed',
  /WHERE merchant = \? AND status = 'rejected'[\s\S]*?AND \(server_name IS NULL OR server_name <> 'dismissed'\)/.test(QUEUE_SRC));

console.log('■ Guest Ordering Protection (No Kickout While Ordering)');

// 8. Guest ordering protection against kickout
ok('LIVE.tick protects guests while choosing order: never calls markClosed when !currentOrderId or cart > 0',
  /if \(s && s\.ok && s\.status !== 'open'\) \{[\s\S]*?if \(!currentOrderId \|\| \(cart && cart\.size > 0\)\) \{[\s\S]*?SESSION\.id = '';[\s\S]*?return;/.test(ORDERPRO_SRC));

ok('SESSION.recentlySettled returns false if hadOrder === false or cart > 0',
  /if \(cart && cart\.size > 0\) return false;/.test(ORDERPRO_SRC) &&
  /if \(s\.hadOrder === false\) return false;/.test(ORDERPRO_SRC));

ok('placeOrder retries transparently on session-closed when browsing',
  /if \(res && res\.error === 'session-closed' && \(!currentOrderId \|\| \(cart && cart\.size > 0\)\)\) \{[\s\S]*?SESSION\.open\(orderMode/.test(ORDERPRO_SRC));

ok('session.js allows full 6 hour lifetime when no orders are placed yet',
  /totalOrders === 0 \|\| \(now - lastSeen\) < 30 \* 60 \* 1000/.test(SESSION_SRC));

console.log(`\nResults: ${passed} passed, ${failed} failed.\n`);
if (failed > 0) process.exit(1);
