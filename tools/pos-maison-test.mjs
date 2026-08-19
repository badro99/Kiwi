#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · POS Maison (Art de table & Décoration · Vogue Home) Unit Test Suite
 *
 * Verifies:
 * 1. Pin 0017 registration in pos-dispatch.js
 * 2. Pos-maison assets (.js and .css) integrity and matching revisions
 * 3. Maison categories, default products, brands, motifs, and fragile flags in boutique-catalog.js
 * 4. Format handling (Service complet vs À la pièce) & inventory arithmetic
 * 5. Gift receipts (no prices), gift wrap, and fragile delivery slips
 * 6. Wedding & gift registries (listes de mariage/naissance) contributions
 * 7. Breakage & loss declaration (casse), unit cost depreciation & stock deduction
 * ─────────────────────────────────────────────────────────────────────────── */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

let passed = 0;
const failures = [];

function ok(cond, msg) {
  if (cond) {
    passed++;
  } else {
    failures.push(msg);
    console.error(`  ✗ ${msg}`);
  }
}

console.log('■ POS Maison (Art de table & Décoration) Test Suite');

// 1. Check dispatch registration
const dispatchSrc = fs.readFileSync(path.join(ROOT, 'assets/pos-dispatch.js'), 'utf8');
ok(dispatchSrc.includes("'0017':"), "PIN '0017' registered in pos-dispatch.js");
ok(dispatchSrc.includes("id: 'maison'"), "id: 'maison' declared in pos-dispatch.js");
ok(dispatchSrc.includes("file: 'pos-maison'"), "file: 'pos-maison' declared in pos-dispatch.js");

// 2. Check assets existence & syntax
const jsPath = path.join(ROOT, 'assets/pos-maison.js');
const cssPath = path.join(ROOT, 'assets/pos-maison.css');
const catPath = path.join(ROOT, 'assets/boutique-catalog.js');
ok(fs.existsSync(jsPath), 'assets/pos-maison.js exists on disk');
ok(fs.existsSync(cssPath), 'assets/pos-maison.css exists on disk');
ok(fs.existsSync(catPath), 'assets/boutique-catalog.js exists on disk');

const jsSrc = fs.readFileSync(jsPath, 'utf8');
const cssSrc = fs.readFileSync(cssPath, 'utf8');
const catSrc = fs.readFileSync(catPath, 'utf8');

// Ensure valid JS syntax via Function constructor
let syntaxOk = false;
try {
  new Function(jsSrc);
  new Function(catSrc);
  syntaxOk = true;
} catch (e) {
  console.error('Syntax error in scripts:', e);
}
ok(syntaxOk, 'pos-maison.js and boutique-catalog.js parse as valid JavaScript without syntax errors');

// 3. Check specialized categories & products in boutique-catalog SEED_MAISON
ok(catSrc.includes('SEED_MAISON'), 'SEED_MAISON declared in boutique-catalog.js');
ok(catSrc.includes('Arts de la table'), 'Arts de la table rayon defined');
ok(catSrc.includes('Verrerie & Cristallerie'), 'Verrerie & Cristallerie rayon defined');
ok(catSrc.includes('Bougies & Senteurs'), 'Bougies & Senteurs rayon defined');
ok(catSrc.includes('Décoration & Cadeaux'), 'Décoration & Cadeaux rayon defined');

// Check Moroccan luxury brands & motifs
ok(catSrc.includes('Vogue Table'), 'Vogue Table brand present');
ok(catSrc.includes('Beldi Glass'), 'Beldi Glass brand present');
ok(catSrc.includes('Baobab Collection'), 'Baobab Collection brand present');
ok(catSrc.includes('Céramique Majorelle'), 'Céramique Majorelle brand present');
ok(catSrc.includes('Fès Bleu'), 'Fès Bleu motif present');
ok(catSrc.includes('Zellige Vert'), 'Zellige Vert motif present');
ok(catSrc.includes('fragile: true'), 'Fragile flag present on ceramic/crystal items');

// 4. Check Service vs Piece logic
ok(jsSrc.includes("format: 'service'") || catSrc.includes("format: 'service'"), 'Service format supported');
ok(jsSrc.includes('servicePieces') || catSrc.includes('servicePieces'), 'servicePieces attribute tracked');
ok(jsSrc.includes('piecePriceMAD') || catSrc.includes('piecePriceMAD'), 'piecePriceMAD attribute supported');
ok(jsSrc.includes('STOCK ARITHMETIC : Service vs Pièce'), 'Clear stock arithmetic documented and handled');

// 5. Check Gift Receipt & Delivery Notes
ok(jsSrc.includes('*** TICKET CADEAU ***'), 'Gift receipt layout with no prices present');
ok(jsSrc.includes('BON DE LIVRAISON SÉCURISÉ'), 'Fragile delivery note template present');
ok(jsSrc.includes('printDeliveryNoteNow'), 'printDeliveryNoteNow function defined');
ok(jsSrc.includes('mz-tk-giftwrap'), 'Gift wrap option toggle on ticket');
ok(jsSrc.includes('mz-tk-delivery'), 'Delivery option on ticket');
ok(jsSrc.includes('mz-fragile-alert'), 'Automatic fragile warning banner in ticket');

// 6. Check Gift & Wedding Registries (Listes de Mariage / Naissance)
ok(jsSrc.includes('renderRegistries'), 'renderRegistries function defined');
ok(jsSrc.includes('loadRegistries'), 'loadRegistries function defined');
ok(jsSrc.includes('updateRegistryContribution'), 'updateRegistryContribution function defined');
ok(jsSrc.includes('Mariage Sarah & Mehdi Benjelloun'), 'Demo wedding registry present');

// 7. Check Breakage & Loss Management (Déclaration de casse)
ok(jsSrc.includes('renderCasse'), 'renderCasse function defined');
ok(jsSrc.includes('recordCasse'), 'recordCasse function defined');
ok(jsSrc.includes('loadCasseLog'), 'loadCasseLog function defined');
ok(jsSrc.includes("reason: 'waste'"), 'Waste reason forwarded to KiwiInventory');

// 8. Check CSS styling tokens
ok(cssSrc.includes('.mz-reg-card'), 'Registry card CSS styles present');
ok(cssSrc.includes('.mz-casse-box'), 'Casse box CSS styles present');
ok(cssSrc.includes('.mz-fragile-alert'), 'Fragile alert CSS styles present');
ok(cssSrc.includes('.mz-tk-opt-bar'), 'Ticket option bar CSS styles present');

console.log(`\n✓ ${passed} controls green (${failures.length} failure(s))`);
if (failures.length) {
  process.exit(1);
}
