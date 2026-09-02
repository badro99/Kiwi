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

console.log('■ Caisse God Mode Toggles Test (tools/caisse-godmode-toggles-test.mjs)');

// 1. God Mode (kiwi-admin.html) configuration
check('kiwi-admin.html defines CAISSE_MODULES', ADMIN.includes('var CAISSE_MODULES = ['));
check('CAISSE_MODULES includes salle (Mode Salle)', /key:'salle'/.test(ADMIN));
check('CAISSE_MODULES includes vrap (Mode À emporter)', /key:'vrap'/.test(ADMIN));
check('CAISSE_MODULES includes waitlist (Mode File d’attente)', /key:'waitlist'/.test(ADMIN));
check('CAISSE_MODULES includes remboursement (Bouton Remboursement)', /key:'remboursement'/.test(ADMIN));
check('CAISSE_MODULES includes cashMove (Bouton Mouvement caisse)', /key:'cashMove'/.test(ADMIN));
check('CAISSE_MODULES includes passation (Bouton Passation caisse)', /key:'passation'/.test(ADMIN));
check('CAISSE_MODULES includes openDrawer (Bouton Ouvrir le tiroir)', /key:'openDrawer'/.test(ADMIN));
check('modulesForType includes Modes & Actions caisse', ADMIN.includes("title:'Modes & Actions caisse'"));
check('moduleLabel includes CAISSE_MODULES in module list', ADMIN.includes('CAISSE_MODULES'));

// 2. Client config handler (assets/merchant-config.js)
check('merchant-config.js defines caisse aliases',
  CONFIG_JS.includes("salle: ['tables']") &&
  CONFIG_JS.includes("vrap: ['a-emporter', 'takeout']") &&
  CONFIG_JS.includes("waitlist: ['attente']") &&
  CONFIG_JS.includes("remboursement: ['refund', 'returns']") &&
  CONFIG_JS.includes("'cash-move': ['cashMove', 'mouvement-caisse']"));
check('merchant-config.js featureOff inspects aliases',
  /function featureOff[\s\S]{0,400}aliases\.length/.test(CONFIG_JS));

// 3. Caisse HTML markup (kiwi-caisse.html)
check('mode pill salle has data-feature="salle"', CAISSE.includes('data-mode="salle" data-feature="salle"'));
check('mode pill vrap has data-feature="vrap"', CAISSE.includes('data-mode="vrap" data-feature="vrap"'));
check('mode pill waitlist has data-feature="waitlist"', CAISSE.includes('data-mode="waitlist" data-feature="waitlist"'));
check('act pill remboursement has data-feature="remboursement"', CAISSE.includes('data-action="remboursement" data-feature="remboursement"'));
check('act pill cash-move has data-feature="cash-move"', CAISSE.includes('data-action="cash-move" data-feature="cash-move"'));
check('act pill passation has data-feature="passation"', CAISSE.includes('data-action="passation" data-feature="passation"'));
check('act pill open-drawer has data-feature="open-drawer"', CAISSE.includes('data-action="open-drawer" data-feature="open-drawer"'));

// 4. Caisse JS logic (kiwi-caisse.html)
check('isFeatureOff helper is defined in kiwi-caisse.html', CAISSE.includes('function isFeatureOff('));
check('syncActiveMode switches away from disabled modes', CAISSE.includes('function syncActiveMode('));
check('setMode falls back when targeted mode is off', /function setMode[\s\S]{0,300}isFeatureOff\(newMode\)/.test(CAISSE));
check('openRefund is gated by isFeatureOff', /function openRefund\(\)[\s\S]{0,200}isFeatureOff\('remboursement'\)/.test(CAISSE));
check('openCashMove is gated by isFeatureOff', /function openCashMove\(\)[\s\S]{0,200}isFeatureOff\('cash-move'\)/.test(CAISSE));
check('openHandover is gated by isFeatureOff', /function openHandover\(\)[\s\S]{0,200}isFeatureOff\('passation'\)/.test(CAISSE));
check('openDrawerNoSale is gated by isFeatureOff', /function openDrawerNoSale\(\)[\s\S]{0,200}isFeatureOff\('open-drawer'\)/.test(CAISSE));

if (failed > 0) {
  console.error(`\nCaisse God Mode toggle tests failed (${failed} error(s)).`);
  process.exit(1);
} else {
  console.log('\nCaisse God Mode toggle tests: All controls green.\n');
}
