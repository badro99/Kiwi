#!/usr/bin/env node
'use strict';

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

const ADMIN = fs.readFileSync(path.join(ROOT, 'kiwi-admin.html'), 'utf8');
const CONFIG_JS = fs.readFileSync(path.join(ROOT, 'assets/merchant-config.js'), 'utf8');
const CAISSE = fs.readFileSync(path.join(ROOT, 'kiwi-caisse.html'), 'utf8');

let failed = 0;
function check(label, ok) {
  if (ok) {
    console.log(`  ✓ ${label}`);
  } else {
    failed++;
    console.error(`  ✗ ${label}`);
  }
}

console.log('■ Caisse God Mode Toggles & Grouping Test (tools/caisse-godmode-toggles-test.mjs)');

// 1. God Mode (kiwi-admin.html) configuration & clear arrangement
check('kiwi-admin.html defines CAISSE_MODES (Modes de service)', ADMIN.includes('var CAISSE_MODES = ['));
check('CAISSE_MODES includes salle (Mode Salle)', /key:'salle'/.test(ADMIN));
check('CAISSE_MODES includes vrap (Mode À emporter)', /key:'vrap'/.test(ADMIN));
check('CAISSE_MODES includes waitlist (Mode File d’attente)', /key:'waitlist'/.test(ADMIN));

check('kiwi-admin.html defines CAISSE_TABLE_TOOLS (Outils de table)', ADMIN.includes('var CAISSE_TABLE_TOOLS = ['));
check('CAISSE_TABLE_TOOLS includes tableTransfer (Déplacer table)', /key:'tableTransfer'/.test(ADMIN));
check('CAISSE_TABLE_TOOLS includes tableMerge (Fusionner tables)', /key:'tableMerge'/.test(ADMIN));

check('kiwi-admin.html defines CAISSE_ACTIONS (Actions rapides & tiroir)', ADMIN.includes('var CAISSE_ACTIONS = ['));
check('CAISSE_ACTIONS includes remboursement (Bouton Remboursement)', /key:'remboursement'/.test(ADMIN));
check('CAISSE_ACTIONS includes cashMove (Bouton Mouvement caisse)', /key:'cashMove'/.test(ADMIN));
check('CAISSE_ACTIONS includes passation (Bouton Passation caisse)', /key:'passation'/.test(ADMIN));
check('CAISSE_ACTIONS includes openDrawer (Bouton Ouvrir le tiroir)', /key:'openDrawer'/.test(ADMIN));

// Grouping clarity
check('modulesForType cleanly splits Modes de service, Outils de table, Actions rapides',
  ADMIN.includes("title:'Caisse · Modes de service'") &&
  ADMIN.includes("title:'Caisse · Outils de table & Salle'") &&
  ADMIN.includes("title:'Caisse · Actions rapides & Tiroir'"));
check('moduleLabel includes all sub-arrays',
  ADMIN.includes('CAISSE_MODES') &&
  ADMIN.includes('CAISSE_TABLE_TOOLS') &&
  ADMIN.includes('CAISSE_ACTIONS'));
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

// 4. Caisse JS logic (kiwi-caisse.html)
check('isFeatureOff helper supports tableTransfer and tableMerge',
  CAISSE.includes("key === 'tableTransfer'") && CAISSE.includes("key === 'tableMerge'"));
check('renderRightPanel hides #rp-table-tools when transfer and merge are both off',
  CAISSE.includes("transferOff && mergeOff"));
check('openCaisseTransferModal is gated by isFeatureOff',
  /function openCaisseTransferModal\([\s\S]{0,200}isFeatureOff\('tableTransfer'\)/.test(CAISSE));
check('openCaisseMergeModal is gated by isFeatureOff',
  /function openCaisseMergeModal\([\s\S]{0,200}isFeatureOff\('tableMerge'\)/.test(CAISSE));
check('table tool click listeners check isFeatureOff',
  CAISSE.includes("$('#rp-transfer-table') && $('#rp-transfer-table').addEventListener('click'") &&
  CAISSE.includes("isFeatureOff('tableTransfer')"));

if (failed > 0) {
  console.error(`\nCaisse God Mode toggle tests failed (${failed} error(s)).`);
  process.exit(1);
} else {
  console.log('\nCaisse God Mode toggle tests: All controls green.\n');
}
