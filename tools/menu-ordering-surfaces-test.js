#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');
let failed = 0;
function ok(label, value) { if (value) console.log('✓ ' + label); else { console.error('✗ ' + label); failed++; } }

const caisse = read('kiwi-caisse.html');
const serveur = read('kiwi-serveur.html');
const orderpro = read('OrderPro.html');

ok('caisse preserves published subcategory identity', /subId: sub \? sub\.id/.test(caisse) && /subPills\.id = 'subcat-pills'/.test(caisse));
ok('caisse filters the selected subcategory', /!activeSub \|\| m\.subId === activeSub/.test(caisse));
ok('caisse preserves and opens composed formulas', /formula: it\.formula \|\| null/.test(caisse) && /function openCaisseFormula/.test(caisse));
ok('caisse combines formula stages and regular options', /const groups = itemOptGroups\(item\)/.test(caisse) && /Formule & options/.test(caisse) && /opts,optSig:optSig\(opts\)/.test(caisse));
ok('employee app preserves and renders subcategories', /subId: it\.subId \|\| null/.test(serveur) && /id='subcat-pills'/.test(serveur));
ok('employee app keeps its composed formula flow', /function openFormulaSheet/.test(serveur) && /itemHasFormula\(id\)/.test(serveur));
ok('employee app combines formula stages and regular options', /optSel: \{\}/.test(serveur) && /data-fml-opt-group/.test(serveur) && /opts: opts\.map/.test(serveur));
ok('OrderPro publishes nested filters', /menu-subtab/.test(orderpro) && /m\.subId === subFilter/.test(orderpro));
ok('OrderPro maps composed formula slots into customer choices', /const formulaOptions =/.test(orderpro) && /OPT\[g\.key\] = g/.test(orderpro));
ok('OrderPro combines regular options with formula stages', /filter\(Boolean\)\.concat\(formulaOptions\)/.test(orderpro));

if (failed) process.exit(1);
console.log('Menu ordering surfaces regression checks passed.');
