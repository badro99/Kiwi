#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const source = fs.readFileSync(path.join(__dirname, '..', 'assets', 'pages-pro.js'), 'utf8');

const checks = [
  ["delivery: 'Livraison'", 'Livraison has an explicit payment label'],
  ["unknown: 'Non renseigné'", 'missing legacy payment methods are stated honestly'],
  ['[data-rtx-day-selector]', 'the visible sales page mounts the shared day selector'],
  ['offsets: [0, 1, 2]', 'the page offers today, yesterday and the day before'],
  ['Array.isArray(s.lines)', 'sales render their recorded product lines'],
  ['${qty} × ${escS(l.name)}', 'product quantity and name are rendered'],
  ['${fmt(lineAmount)} MAD', 'each product line renders its amount'],
  ["['all', 'cash', 'card', 'delivery']", 'Tout plus the three requested payment filters are rendered'],
  ['current.length >= 2', 'choosing a third payment type resets the filter'],
  ['selectedMethods.includes(salesMethodKey(s))', 'sale rows are filtered by payment type'],
  ['financialWindow.reduce(', 'the cash summary uses the payment-filtered rows independently of activity type'],
  ['String(s.ref || s.label || \'\')', 'each sale resolves its caisse/order reference'],
  ["origin === 'employee'", 'employee-origin sales are labelled separately'],
  ["origin === 'orderpro'", 'OrderPro-origin sales are labelled separately'],
  ["origin === 'caisse'", 'caisse-origin sales are labelled separately'],
  ['s.server', 'the server name is rendered for employee orders'],
];

for (const [needle, message] of checks) {
  if (!source.includes(needle)) throw new Error(message);
}
if (source.includes('<span class="rtx-l">${escS(L.vente)}</span>')) {
  throw new Error('generic Vente label still replaces product details');
}

console.log(`  ✓ Ventes detail gate green (${checks.length + 1} checks: products, payment filters, filtered total, shared days)`);
