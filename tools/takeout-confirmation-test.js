#!/usr/bin/env node
'use strict';

/* Regression contract for the two confirmation boundaries:
 *  1. paying a fresh caisse takeaway dispatches it before clearing the cart;
 *  2. an OrderPro ticket prints only after the server accepts it. */
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const CAISSE = fs.readFileSync(path.join(ROOT, 'kiwi-caisse.html'), 'utf8');
const INBOX = fs.readFileSync(path.join(ROOT, 'assets/orderpro-inbox.js'), 'utf8');
let failed = 0;
function ok(label, yes) {
  if (yes) console.log('  ✓ ' + label);
  else { failed++; console.log('  ✗ ' + label); }
}

const settle = CAISSE.slice(
  CAISSE.indexOf('function settleVrapPayment()'),
  CAISSE.indexOf('function openVrapOrder(', CAISSE.indexOf('function settleVrapPayment()'))
);
ok('payer un nouveau retrait crée un bon avant clearCart',
  settle.indexOf('kdsOrders.push(order)') >= 0 &&
  settle.indexOf('kdsOrders.push(order)') < settle.lastIndexOf('clearCart()'));
ok('le paiement imprime le bon cuisine', /printKitchenTickets\(order, items\)/.test(settle));
ok('le paiement relaie le bon vers le KDS', /relayToKitchen\(order\)/.test(settle));
ok('le bon payé reste marqué payé', /paid:\s*true/.test(settle));

ok('une arrivée OrderPro pending ne déclenche aucune impression',
  !/status === ['"]pending['"][\s\S]{0,300}printKitchenTickets/.test(CAISSE));
ok('seul un accepted réussi appelle le crochet de confirmation',
  /if \(j && j\.ok\)[\s\S]{0,500}status === 'accepted'[\s\S]{0,300}confirmAccepted/.test(INBOX));
ok('le crochet imprime une seule fois',
  /if \(!ticket \|\| ticket\.kitchenPrinted\) return;[\s\S]{0,120}ticket\.kitchenPrinted = true;[\s\S]{0,120}printKitchenTickets/.test(CAISSE));

if (failed) process.exit(1);
console.log('\n  Caisse takeout + OrderPro confirmation boundaries verified.\n');
