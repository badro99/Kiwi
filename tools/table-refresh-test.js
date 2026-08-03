#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'kiwi-caisse.html'), 'utf8');
let pass = 0; const failures = [];
function ok(name, yes) { if (yes) pass++; else failures.push(name); }

ok('the shift snapshot persists tables', /tables:\s*tables,/.test(src));
ok('the shift snapshot persists table orders', /tableOrders:\s*tableOrders,/.test(src));
ok('restore reapplies table state', /if \(d\.tables\)[\s\S]{0,180}Object\.assign\(tables\[id\], d\.tables\[id\]\)/.test(src));
ok('restore reapplies table order lines', /if \(d\.tableOrders\)[\s\S]{0,180}Object\.assign\(tableOrders, d\.tableOrders\)/.test(src));
ok('an empty real sales journal is not discarded by itself',
  /const hadDemoSeeds = genuine\.length !== originalJournal\.length;[\s\S]{0,900}if \(hadDemoSeeds && !genuine\.length\)/.test(src));
ok('only a journal emptied by demo cleanup is discarded',
  !/if \(!genuine\.length\)\s*\{\s*localStorage\.removeItem/.test(src));
ok('an order action saves the shift before refresh',
  /kdsOrders\.push\(order\);[\s\S]{0,500}persistShift\(\)/.test(src));

if (failures.length) {
  failures.forEach(x => console.log('  ✗ ' + x));
  process.exit(1);
}
console.log('  ✓ reprise tables restaurant (' + pass + ' contrôles : tables, additions, commandes avant paiement, garde démo)');
