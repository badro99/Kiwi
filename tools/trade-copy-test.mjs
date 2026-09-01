#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · INVENTAIRE — VOCABULAIRE PAR MÉTIER (tools/trade-copy-test.mjs)
 *
 * Vérifie que la modale de création / édition de produits et les sélecteurs
 * de types de variantes n'imposent plus le vocabulaire caftan / vêtement S-XL
 * aux magasins de maison (Vogue Home, Zaka Vogue) ou aux autres métiers.
 *
 * Le harnais extrait directement les fonctions de assets/pages-pro.js
 * (regex + new Function) pour tester le code réel sans réimplémentation.
 * ─────────────────────────────────────────────────────────────────────────── */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const EXPECTED_COUNT = 7;
let passed = 0;
const failures = [];
const ok = (cond, msg) => {
  if (cond) passed++;
  else {
    failures.push(msg);
    console.error(`  ✗ ${msg}`);
  }
};

console.log('■ Inventaire · Vocabulaire par métier (trade copy)');

const pagesProPath = path.join(ROOT, 'assets/pages-pro.js');
let pagesProSrc = '';
try {
  pagesProSrc = fs.readFileSync(pagesProPath, 'utf8');
} catch (e) {
  console.error(`  ✗ Échec de lecture de assets/pages-pro.js: ${e.message}`);
  process.exit(1);
}

/* ── Extraction du code réel de pages-pro.js ────────────────────────────── */
const copyMatch = pagesProSrc.match(/function _bqxCopy\s*\([\s\S]*?\n\}/);
const kindMatch = pagesProSrc.match(/function _kindOptions\s*\([\s\S]*?\n\}/);

if (!copyMatch || !kindMatch) {
  console.error('  ✗ Échec de construction du harnais : impossible d\'extraire _bqxCopy ou _kindOptions de assets/pages-pro.js');
  process.exit(1);
}

function createEnv(currentTradeVal) {
  const fakeWindow = {
    KiwiStoreTemplates: {
      currentTrade: () => currentTradeVal,
    },
  };
  const factory = new Function('window', `
    ${copyMatch[0]}
    ${kindMatch[0]}
    return { _bqxCopy, _kindOptions };
  `);
  return factory(fakeWindow);
}

/* 1. TRADE MAISON : _kindOptions ne contient ni « Vêtement » ni « pointure », l'option selected est tu. */
try {
  const { _kindOptions } = createEnv('maison');
  const html = _kindOptions();
  const noClothing = !/Vêtement/i.test(html);
  const noShoe = !/pointure/i.test(html);
  const isTuSelected = /value="tu"\s+selected/.test(html);
  ok(noClothing && noShoe && isTuSelected,
    'trade maison → _kindOptions ne contient ni « Vêtement » ni « pointure », l\'option selected est tu');
} catch (e) {
  ok(false, `trade maison → erreur d'exécution: ${e.message}`);
}

/* 2. TRADE BOUTIQUE : chaîne de sortie identique à la version actuelle. */
const ORIGINAL_BOUTIQUE_OUTPUT = '<option value="taille" selected>Vêtement (tailles S-XL)</option><option value="pointure" >Chaussure (pointures)</option><option value="tu" >Taille unique</option>';
try {
  const { _kindOptions } = createEnv('boutique');
  const html = _kindOptions('taille');
  ok(html === ORIGINAL_BOUTIQUE_OUTPUT,
    'trade boutique → chaîne de sortie identique à la version historique à l\'octet près');
} catch (e) {
  ok(false, `trade boutique → erreur d'exécution: ${e.message}`);
}

/* 3. TRADE INCONNU / VIDE : voix neutre, défaut tu. */
try {
  const { _kindOptions } = createEnv('');
  const html = _kindOptions();
  const noClothing = !/Vêtement/i.test(html);
  const isTuSelected = /value="tu"\s+selected/.test(html);
  ok(noClothing && isTuSelected,
    'trade inconnu/vide → voix neutre, défaut tu');
} catch (e) {
  ok(false, `trade inconnu/vide → erreur d'exécution: ${e.message}`);
}

/* 4. _bqxCopy('maison').namePlaceholder ne contient pas « Caftan » ; boutique oui. */
try {
  const { _bqxCopy } = createEnv('maison');
  const maisonCopy = _bqxCopy('maison');
  const boutiqueCopy = _bqxCopy('boutique');
  const maisonOk = !/Caftan/i.test(maisonCopy.namePlaceholder) && /Vase/i.test(maisonCopy.namePlaceholder);
  const boutiqueOk = /Caftan/i.test(boutiqueCopy.namePlaceholder);
  ok(maisonOk && boutiqueOk,
    '_bqxCopy(\'maison\').namePlaceholder ne contient pas « Caftan » (« Vase ») ; boutique oui (« Caftan »)');
} catch (e) {
  ok(false, `_bqxCopy placeholders → erreur d'exécution: ${e.message}`);
}

/* 5. ÉDITION D'UN PRODUIT kind:'pointure' HORS BOUTIQUE : l'option pointure est présente et sélectionnée. */
try {
  const { _kindOptions } = createEnv('maison');
  const html = _kindOptions('pointure');
  const hasPointure = /value="pointure"\s+selected/.test(html);
  ok(hasPointure,
    'édition d\'un produit kind:\'pointure\' hors boutique → l\'option pointure est présente et sélectionnée');
} catch (e) {
  ok(false, `édition kind:pointure hors boutique → erreur d'exécution: ${e.message}`);
}

/* 6. GARDE STATIQUE : dans le corps du handler bqx-new, zéro occurrence littérale de Caftan, S-XL, 1890. */
const bqxNewMatch = pagesProSrc.match(/handlers\['bqx-new'\]\s*=\s*\(\)\s*=>\s*\{([\s\S]*?)\n\};[\s\r\n]*handlers\['bqx-new-save'\]/);
if (bqxNewMatch) {
  const body = bqxNewMatch[1];
  const noCaftan = !/Caftan/i.test(body);
  const noSXL = !/S-XL/i.test(body);
  const no1890 = !/1890/.test(body);
  ok(noCaftan && noSXL && no1890,
    'garde statique bqx-new : zéro occurrence littérale de « Caftan », « S-XL », « 1890 »');
} else {
  ok(false, 'garde statique : impossible d\'extraire le corps de handlers[\'bqx-new\']');
}

/* 7. PLACEHOLDERS PRIX : 450 pour maison, 1890 pour boutique */
try {
  const { _bqxCopy } = createEnv('maison');
  const maisonPrice = _bqxCopy('maison').pricePlaceholder;
  const boutiquePrice = _bqxCopy('boutique').pricePlaceholder;
  ok(maisonPrice === '450' && boutiquePrice === '1890',
    '_bqxCopy prix d\'exemple : 450 pour maison, 1890 pour boutique');
} catch (e) {
  ok(false, `prix placeholders → erreur: ${e.message}`);
}

/* ── Bilan et garde d'épinglage ─────────────────────────────────────────── */
if (passed !== EXPECTED_COUNT) {
  failures.push(`Contrôles exécutés (${passed}) != attendus (${EXPECTED_COUNT})`);
  console.error(`  ✗ Nombre de contrôles (${passed}) ne correspond pas à EXPECTED_COUNT (${EXPECTED_COUNT})`);
}

console.log(`\n✓ ${passed} controls green (${failures.length} failure(s))\n`);
if (failures.length > 0) {
  process.exit(1);
}
