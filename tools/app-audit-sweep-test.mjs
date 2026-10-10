#!/usr/bin/env node
/* App-wide audit sweep (2026-10-09): the bugs found across the till, the
 * kitchen screen, the waiter app, the customer order page and the dashboard,
 * pinned so they cannot come back silently.
 *
 *   node tools/app-audit-sweep-test.mjs
 */
import fs from 'node:fs';
import assert from 'node:assert/strict';

const read = (p) => fs.readFileSync(new URL('../' + p, import.meta.url), 'utf8');
let passed = 0, failed = 0;
function ok(label, fn) {
  try { fn(); passed++; console.log(`  ✓ ${label}`); }
  catch (e) { failed++; console.log(`  ✗ ${label}\n      ${String(e.message).split('\n')[0]}`); }
}

const sale = read('assets/pos-sale.js');
ok('every register folds the phone ticket sheet after a paid sale, demo included', () => {
  assert.match(sale, /function ticketDone\(total, method\)/);
  assert.match(sale, /if \(!\(total > 0\)\) return null;\n    ticketDone\(total, sale\.method\);\n    if \(!isReal\(\)\) return null;/);
});
ok('saleId and clientId reach the stored ledger row', () => {
  assert.match(sale, /creditClient\(entry\);[\s\S]{0,400}if \(entry\.saleId \|\| entry\.clientId\) write\(vertical, rows\);/);
});
const mobile = read('assets/pos-mobile.js');
ok('the phone register measures layout once the screen settles, not on every tap', () => {
  assert.doesNotMatch(mobile, /ensureTicket\(screen\);\n    restack\(screen\);\n  \}/);
  assert.match(mobile, /restackTimer = setTimeout\(function \(\) \{ restack\(screen\); \}, 250\);/);
});
ok('every register stepper is 44 px under the thumb on a phone', () => {
  assert.match(read('assets/pos-mobile.css'), /\.vx-root \[class\*="-qty"\] button \{\n    min-width: 44px; min-height: 44px;/);
});

const caisse = read('kiwi-caisse.html');
ok('cash tendered is compared in cents, so a remise cannot block an exact payment', () => {
  assert.equal((caisse.match(/const got = Math\.round\(\(parseFloat\(String\(cashInput\.value\)\.replace\(',', '\.'\)\) \|\| 0\) \* 100\) \/ 100;/g) || []).length, 2);
});
ok('receipt and staff names are escaped', () => {
  for (const bit of ['${escTeam(l.name)}', '${escTeam(entry.label)}', '${escTeam(storeName())}', '${escTeam(c.name)}', '${escTeam(handoverState.incoming.name)}']) {
    assert.ok(caisse.includes(bit), bit);
  }
});
ok('no em dash as an empty value on the till or the boutique pages', () => {
  for (const f of ['kiwi-caisse.html', 'assets/pos-boutique.js', 'assets/pos-maison.js', 'assets/pages-pro.js']) {
    assert.doesNotMatch(read(f), /'—'/, f);
  }
});
ok('boutique searches keep the field being typed in', () => {
  const b = read('assets/pos-boutique.js');
  assert.equal((b.match(/if \(fresh && fresh !== typed\) fresh\.replaceWith\(typed\);/g) || []).length, 2);
});

const cuisine = read('kiwi-cuisine.html');
ok('kitchen: a column switcher replaces the columns that used to vanish on small screens', () => {
  assert.doesNotMatch(cuisine, /\.col--pass \{ display: none; \}/);
  assert.match(cuisine, /<div class="coltabs" id="coltabs" role="tablist"/);
  assert.match(cuisine, /function showCol\(col\)/);
});
ok('kitchen: a lost « prêt » or « servi » is queued and resent before the next poll', () => {
  assert.match(cuisine, /function sendBump\(id, status, station\)/);
  assert.match(cuisine, /flushBumps\(\)\.then\(function \(\) \{\n      return KiwiKitchenRelay\.pullAll/);
  assert.equal((cuisine.match(/KiwiKitchenRelay\.bump\(/g) || []).length, 1, 'only sendBump calls the relay');
});
ok('kitchen: one poll at a time', () => {
  assert.match(cuisine, /if \(!window\.KiwiKitchenRelay \|\| S\.pulling\) return;/);
});

const order = read('kiwi-order.html');
ok('order page: a double tap sends one order', () => {
  assert.match(order, /if \(btn\.classList\.contains\('is-loading'\)\) return;/);
  assert.match(order, /\.send-btn\.is-loading \{ pointer-events: none; \}/);
});
ok('order page: a refused takeout order says so in three languages', () => {
  assert.match(order, /triggerRejected\(\); \}/);
  assert.equal((order.match(/prep_rejected: "/g) || []).length, 3);
});
ok('order page: no invented ticket number on a live order', () => {
  assert.match(order, /orderNumber = sent && sent\.demo \?/);
});

const serveur = read('kiwi-serveur.html');
ok('waiter app: background refreshes wait for the finger and the keyboard', () => {
  assert.match(serveur, /function svWhenIdle\(key, fn\)/);
  assert.match(serveur, /svWhenIdle\('all', \(\) => \{ try \{ renderAll\(\); \} catch \(_\) \{\} \}\);/);
  assert.match(serveur, /svWhenIdle\('detail', \(\) => \{/);
});
ok('waiter app: refusals read as sentences, not API codes', () => {
  assert.doesNotMatch(serveur, /refusée : \$\{\(data && data\.error\)/);
  assert.match(serveur, /const svErrLabel = code =>/);
});
ok('waiter app: one quantity change per line at a time', () => {
  assert.match(serveur, /if \(inFlight\.has\(flightKey\)\) return;/);
});

ok('dashboard: no fake iftar countdown', () => {
  assert.doesNotMatch(read('assets/features.js'), /data-iftar/);
});
ok('dashboard: staff form stacks on a phone and its tags follow the theme', () => {
  const team = read('assets/team.js');
  assert.match(team, /\[data-kt-form\] \.kt-fgrid-2, \[data-kt-form\] \.kt-fgrid-3, \.kt-qe-form \.kt-fgrid-2 \{ grid-template-columns: 1fr; \}/);
  assert.doesNotMatch(team, /#FFF4E3/);
});

console.log(`\napp-audit-sweep: ${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
