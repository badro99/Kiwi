#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'kiwi-caisse.html'), 'utf8');
let pass = 0; const failures = [];
function ok(name, yes) { if (yes) pass++; else failures.push(name); }

ok('the shift snapshot persists tables', /tables:\s*tables,/.test(src));
/* L'instantané ne garde plus QUE le brouillon local. Les lignes venues du
   relais portent `orderProLine` et se reconstruisent depuis la file : les
   recopier dans l'instantané en faisait une seconde mémoire de l'addition, qui
   ne périme pas — d'où les additions fantômes au démarrage. */
ok('the shift snapshot persists only unsent local table lines',
  /tableOrders: \(function \(\) \{[\s\S]{0,400}filter\(function \(l\) \{ return !l\.orderProLine; \}\)/.test(src));
ok('restore reapplies table state', /if \(d\.tables\)[\s\S]{0,180}Object\.assign\(tables\[id\], d\.tables\[id\]\)/.test(src));
ok('restore reapplies table order lines', /if \(d\.tableOrders\)[\s\S]{0,180}Object\.assign\(tableOrders, d\.tableOrders\)/.test(src));
ok('an empty real sales journal is not discarded by itself',
  /const hadDemoSeeds = genuine\.length !== originalJournal\.length;[\s\S]{0,900}if \(hadDemoSeeds && !genuine\.length\)/.test(src));
ok('only a journal emptied by demo cleanup is discarded',
  !/if \(!genuine\.length\)\s*\{\s*localStorage\.removeItem/.test(src));
// Execute both shipped entry points. Comments are not a persistence boundary.
const vm = require('node:vm');
for (const name of ['sendTableToKitchen', 'createTakeawayKitchenOrder']) {
  const start = src.indexOf('    function ' + name + '(');
  const end = src.indexOf('\n    }', start) + 6;
  let saved = null;
  const lines = [{ qty: 1, price: 35, sent: false }];
  const ctx = {
    tableOrders: { 1: lines }, tables: { 1: {} }, kdsOrders: [], kdsOrderSeq: 0,
    kitchenItemsFromLines: (items) => items, relayLinesFromCaisse: (items) => items,
    serverNameFor: () => 'Synthetic', ticketNo: (order) => order.num,
    updateKdsCount() {}, kdsEl: { classList: { contains: () => false } },
    relayToKitchen: () => Promise.resolve(), printKitchenTickets() {},
    persistShift() { saved = { count: ctx.kdsOrders.length, sent: lines[0].sent }; }
  };
  vm.createContext(ctx);
  vm.runInContext(src.slice(start, end), ctx);
  ctx[name](name === 'sendTableToKitchen' ? 1 : lines);
  ok(name + ' durably saves its queued order before returning', !!saved && saved.count === 1);
  if (name === 'sendTableToKitchen') ok('saved table lines are already marked sent', saved.sent);
}

if (failures.length) {
  failures.forEach(x => console.log('  ✗ ' + x));
  process.exit(1);
}
console.log('  ✓ reprise tables restaurant (' + pass + ' contrôles : tables, additions, commandes avant paiement, garde démo)');
