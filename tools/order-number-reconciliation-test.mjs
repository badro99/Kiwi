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

if (failed) process.exit(1);
console.log('order-number-reconciliation-test: PASS');
