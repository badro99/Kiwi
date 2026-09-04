#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const page = fs.readFileSync(path.join(ROOT, 'kiwi-caisse.html'), 'utf8');
let failed = 0;
function check(label, condition) {
  if (condition) console.log('✓ ' + label);
  else { failed++; console.error('✗ ' + label); }
}

check('a local table order waits for its permanent number before paper is frozen',
  /relayToKitchen\(order\)\.then\(\(\) => printKitchenTickets\(order, items\)\)/.test(page));
check('a recovered server echo replaces the private local counter',
  /if \(o\.number != null && String\(o\.number\)\.trim\(\)\) known\.opNum = o\.number;/.test(page));
check('the takeaway editor title uses the same public number resolver',
  /vrapTitle\.innerHTML = `Commande <strong[^>]*>\$\{ticketNo\(o\)\}<\/strong>/.test(page));
check('the order card, history and KDS all use the public number resolver',
  (page.match(/\$\{ticketNo\(o\)\}/g) || []).length >= 5);
check('payment carries the exact dispatched takeaway into the sale record',
  /const tenderOrder = dispatchUnsentKitchenBeforePayment\(\);[\s\S]{0,700}recordSale\([\s\S]{0,220}tenderOrder\)/.test(page));
check('a permanent number rewrites the already frozen customer receipt',
  /order\.opNum = r\.number;[\s\S]{0,700}reconcileReceiptOrderNumber\(order\);/.test(page)
  && /row\.ref = canonical;[\s\S]{0,700}attachReceipt\(row\);/.test(page));
check('printing heals a persisted receipt-number race before using its snapshot',
  /function receiptDocFor\(entry, opts\)[\s\S]{0,700}reconcileReceiptOrderNumber\(order, entry\);[\s\S]{0,300}K\.fromSnapshot/.test(page));

if (failed) process.exit(1);
console.log('order-number-reconciliation-test: PASS');
