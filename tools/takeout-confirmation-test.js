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
const LIVE = fs.readFileSync(path.join(ROOT, 'assets/live-link.js'), 'utf8');
let failed = 0;
function ok(label, yes) {
  if (yes) console.log('  ✓ ' + label);
  else { failed++; console.log('  ✗ ' + label); }
}

const finalize = CAISSE.slice(
  CAISSE.indexOf('function finalizeTender('),
  CAISSE.indexOf('function updateRendu(', CAISSE.indexOf('function finalizeTender('))
);
const dispatch = CAISSE.slice(
  CAISSE.indexOf('function createTakeawayKitchenOrder('),
  CAISSE.indexOf('function serverNameFor(', CAISSE.indexOf('function createTakeawayKitchenOrder('))
);
ok('payer un retrait envoie le bon avant d’enregistrer la vente',
  finalize.indexOf('dispatchUnsentKitchenBeforePayment()') >= 0 &&
  finalize.indexOf('dispatchUnsentKitchenBeforePayment()') < finalize.indexOf('recordSale('));
ok('le paiement imprime le bon cuisine', /printKitchenTickets\(order, items\)/.test(dispatch));
ok('le paiement relaie le bon vers le KDS', /relayToKitchen\(order\)/.test(dispatch));
ok('un retrait OrderPro payé sort de held avec l’état paid',
  /dispatchHeldTakeaway\(existing, true, true\)/.test(dispatch));

ok('une arrivée OrderPro pending ne déclenche aucune impression',
  !/status === ['"]pending['"][\s\S]{0,300}printKitchenTickets/.test(CAISSE));
ok('seul un accepted réussi appelle le crochet de confirmation',
  /if \(j && j\.ok\)[\s\S]{0,500}status === 'accepted'[\s\S]{0,300}confirmAccepted/.test(INBOX));
ok('le crochet imprime localement avec l’identifiant OrderPro dédupliqué',
  /confirmAccepted\(order\)[\s\S]{0,500}localKitchenAction: true/.test(CAISSE) &&
  /sourceId: o\.id/.test(CAISSE));
ok('envoyer en cuisine et encaisser restent deux gestes distincts sur OrderPro',
  /data-kop-acc/.test(INBOX) && /data-kop-pay/.test(INBOX) &&
  /data-vrap-send/.test(CAISSE));
ok('le premier encaissement OrderPro possède une clé comptable stable',
  /orderProSaleId[\s\S]{0,500}journal\.find\(row => row && row\.id === orderProSaleId\)/.test(CAISSE));
ok('le statut payé est persisté après la confirmation, même si le modal est fermé',
  /function settleVrapPayment\(\)[\s\S]{0,1800}opPush\(o, remoteStatus, \{ paid: true \}\)[\s\S]{0,400}persistShift\(\)/.test(CAISSE));
ok('la vente cloud transporte l’identifiant OrderPro sans dépendre du libellé',
  LIVE.includes('if (entry.orderId) body.orderId ='));
ok('le reçu imprime le même numéro que la caisse et la cuisine',
  /ref: vrapOrder \? ticketNo\(vrapOrder\)/.test(CAISSE));
ok('une commande OrderPro non payée peut être annulée depuis son ticket',
  /function cancelOrderProTakeaway\(o\)[\s\S]{0,420}opPush\(o, 'rejected'\)/.test(CAISSE)
    && /data-vrap-cancel/.test(CAISSE)
    && /mode === 'vrap'[\s\S]{0,300}cancelOrderProTakeaway\(order\)/.test(CAISSE));
if (failed) process.exit(1);
console.log('\n  Caisse takeout + OrderPro confirmation boundaries verified.\n');
