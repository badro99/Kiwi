#!/usr/bin/env node
// Mutation vérifiée : hasTables() retourne false malgré deux tables autorisées.
// Anciennes assertions vertes, exécution rouge ; octets livrés restaurés ensuite.
import { createRequire as text2Require } from 'node:module';
text2Require(import.meta.url)('./text2-runtime.cjs').run('caisse-godmode-toggles');
import maisonSource from './pos-maison-test-source.cjs';
import caisseTestSource from './caisse-test-source.cjs';
'use strict';

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

const ADMIN = maisonSource(fs.readFileSync(path.join(ROOT, 'kiwi-admin.html'), 'utf8'));
const CONFIG_JS = maisonSource(fs.readFileSync(path.join(ROOT, 'assets/merchant-config.js'), 'utf8'));
const CAISSE = caisseTestSource(maisonSource(fs.readFileSync(path.join(ROOT, 'kiwi-caisse.html'), 'utf8')));
const MAISON = maisonSource(fs.readFileSync(path.join(ROOT, 'assets/pos-maison.js'), 'utf8'));
const BOUTIQUE = maisonSource(fs.readFileSync(path.join(ROOT, 'assets/pos-boutique.js'), 'utf8'));

let failed = 0;
function check(label, ok) {
  if (ok) {
    console.log(`  ✓ ${label}`);
  } else {
    failed++;
    console.error(`  ✗ ${label}`);
  }
}

console.log('■ Caisse God Mode & Intertwined Table Tools Test (tools/caisse-godmode-toggles-test.mjs)');

// 1. Clean God Mode (kiwi-admin.html) configuration
check('kiwi-admin.html defines CAISSE_MODES (Modes de service)', ADMIN.includes('var CAISSE_MODES = ['));
check('CAISSE_MODES includes salle (Mode Salle)', /key:'salle'/.test(ADMIN));
check('CAISSE_MODES includes vrap (Mode À emporter)', /key:'vrap'/.test(ADMIN));
check('CAISSE_MODES includes waitlist (Mode File d’attente)', /key:'waitlist'/.test(ADMIN));

check('kiwi-admin.html defines CAISSE_ACTIONS (Actions rapides & tiroir)', ADMIN.includes('var CAISSE_ACTIONS = ['));
check('CAISSE_ACTIONS includes remboursement (Bouton Remboursement)', /key:'remboursement'/.test(ADMIN));
check('CAISSE_ACTIONS includes cashMove (Bouton Mouvement caisse)', /key:'cashMove'/.test(ADMIN));
check('CAISSE_ACTIONS includes passation (Bouton Passation caisse)', /key:'passation'/.test(ADMIN));
check('CAISSE_ACTIONS includes openDrawer (Bouton Ouvrir le tiroir)', /key:'openDrawer'/.test(ADMIN));
check('Maison full inventory control is an explicit God Mode opt-in',
  /key:'caisseInventoryAdmin'[\s\S]{0,120}off:true/.test(ADMIN));
check('Maison treats only boolean true as inventory-admin authorization',
  MAISON.includes('const catalogueAdminEnabled = tillInventoryAllowed;')
  && fs.readFileSync(path.join(ROOT, 'assets/till-inventory-access.js'), 'utf8').includes('features.caisseInventoryAdmin === true'));
check('Maison exposes product, category and variant tools only behind the authorization',
  MAISON.includes("id=\"mzi-category\"") && MAISON.includes("id=\"mzi-new\"") &&
  MAISON.includes('data-inv-addvar') && MAISON.includes('data-vdelete'));
check('Maison product creation exposes A/B only through the strict depot-vente switch',
  MAISON.includes("ownershipField(null, 'mzi-n')") &&
  MAISON.includes("if (!depotOn()) return ''") &&
  MAISON.includes('value="outright"') && MAISON.includes('value="consignment"'));
check('Maison product creation persists the selected ownership in the shared catalogue',
  MAISON.includes('ownership:owner.ownership,consignor:owner.consignor'));
check('God Mode offers the stock-value visibility switch as a default-on boutique option',
  /key:'caisseInventoryValue'[\s\S]{0,180}Allumé par défaut/.test(ADMIN) &&
  !/key:'caisseInventoryValue'[^\n]*off:true/.test(ADMIN));
/* Run Maison's own rule, not its text: only an explicit boolean false hides the value. */
const ivSrc = (MAISON.match(/function inventoryValueVisible\(\) \{[\s\S]*?\n  \}/) || [''])[0];
const ivRun = (features) => new Function('window', ivSrc + '\nreturn inventoryValueVisible();')({ KiwiConfig: features === undefined ? undefined : { features } });
check('Maison hides inventory value only for the explicit boolean false',
  !!ivSrc && ivRun({ caisseInventoryValue: false }) === false && ivRun({ caisseInventoryValue: 0 }) === true &&
  ivRun({ caisseInventoryValue: true }) === true && ivRun({}) === true && ivRun(undefined) === true &&
  MAISON.includes('inventoryValueVisible() ? `<div class="mzi-kpi"'));
/* La boutique ne montre plus du tout la valeur de stock à la caisse
   (propriétaire, 2026-10-28) : elle vit au tableau de bord. */
check('Boutique till never shows the stock value',
  !BOUTIQUE.includes('Valeur de stock') && !BOUTIQUE.includes('stockCost'));

// Grouping clarity without confusing micro-switches
check('modulesForType cleanly structures Modes de service and Actions rapides',
  ADMIN.includes("title:'Caisse · Modes de service'") &&
  ADMIN.includes("title:'Caisse · Actions rapides & Tiroir'"));
check('God Mode does NOT clutter UI with separate sub-buttons for table tools',
  !ADMIN.includes('CAISSE_TABLE_TOOLS'));
check('.featgrp has clear visual divider styling',
  ADMIN.includes('.featgrp::after{content:"";flex:1;height:1px'));

// 2. Client config handler (assets/merchant-config.js)
check('merchant-config.js defines caisse modes and action aliases',
  CONFIG_JS.includes("salle: ['tables']") &&
  CONFIG_JS.includes("vrap: ['a-emporter', 'takeout']") &&
  CONFIG_JS.includes("waitlist: ['attente']") &&
  CONFIG_JS.includes("tableTransfer: ['table-transfer'") &&
  CONFIG_JS.includes("tableMerge: ['table-merge'") &&
  CONFIG_JS.includes("remboursement: ['refund', 'returns']") &&
  CONFIG_JS.includes("'cash-move': ['cashMove', 'mouvement-caisse']"));
check('merchant-config.js featureOff inspects aliases',
  /function featureOff[\s\S]{0,400}aliases\.length/.test(CONFIG_JS));

// 3. Caisse HTML markup (kiwi-caisse.html)
check('mode pill salle has data-feature="salle"', CAISSE.includes('data-mode="salle" data-feature="salle"'));
check('mode pill vrap has data-feature="vrap"', CAISSE.includes('data-mode="vrap" data-feature="vrap"'));
check('mode pill waitlist has data-feature="waitlist"', CAISSE.includes('data-mode="waitlist" data-feature="waitlist"'));
check('table tool transfer has data-feature="table-transfer"',
  CAISSE.includes('id="rp-transfer-table" data-feature="table-transfer"'));
check('table tool merge has data-feature="table-merge"',
  CAISSE.includes('id="rp-merge-table" data-feature="table-merge"'));
check('act pill remboursement has data-feature="remboursement"', CAISSE.includes('data-action="remboursement" data-feature="remboursement"'));
check('act pill cash-move has data-feature="cash-move"', CAISSE.includes('data-action="cash-move" data-feature="cash-move"'));
check('act pill passation has data-feature="passation"', CAISSE.includes('data-action="passation" data-feature="passation"'));
check('act pill open-drawer has data-feature="open-drawer"', CAISSE.includes('data-action="open-drawer" data-feature="open-drawer"'));

// 4. Intertwined table awareness logic (kiwi-caisse.html)
check('hasTables helper checks both features and actual venue table count',
  CAISSE.includes('function hasTables()') &&
  CAISSE.includes("isFeatureOff('salle')") &&
  CAISSE.includes('Object.keys(tables).length > 1'));
check('renderRightPanel intertwines table tools with hasTables()',
  CAISSE.includes('const canUseTableTools = hasTables()') &&
  CAISSE.includes('tt.hidden = transferOff && mergeOff'));
check('openCaisseTransferModal checks hasTables()',
  CAISSE.includes('function openCaisseTransferModal') &&
  CAISSE.includes('!hasTables()'));
check('openCaisseMergeModal checks hasTables()',
  CAISSE.includes('function openCaisseMergeModal') &&
  CAISSE.includes('!hasTables()'));
check('table tool click listeners check hasTables()',
  CAISSE.includes("$('#rp-transfer-table') && $('#rp-transfer-table').addEventListener('click'") &&
  CAISSE.includes('!hasTables()'));

if (failed > 0) {
  console.error(`\nCaisse God Mode toggle tests failed (${failed} error(s)).`);
  process.exit(1);
} else {
  console.log('\nCaisse God Mode toggle tests: All controls green.\n');
}
