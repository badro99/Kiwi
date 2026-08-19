#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · Formules (Menus Composés) Protocol & Model Test Suite
 *
 * Verifies:
 * 1. functions/api/menu.js sanitizeMenu preserves formula structure on round-trip
 * 2. sanitizeMenu bounds: max 10 slots, max 20 choices per slot, string limits
 * 3. sanitizeMenu normalizes min > max (min clamped to max)
 * 4. assets/menu-catalog.js drops choices pointing to deleted items at load
 * 5. assets/menu-catalog.js exposes formula editor with toggle and slots
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

console.log('■ Formules (Menus Composés) Model & Protocol Gate');

const menuApiSource = fs.readFileSync(path.join(ROOT, 'functions/api/menu.js'), 'utf8');
const menuCatalogSource = fs.readFileSync(path.join(ROOT, 'assets/menu-catalog.js'), 'utf8');

// 1. Check functions/api/menu.js whitelist contains formula
ok(menuApiSource.includes('formula'), 'functions/api/menu.js references formula');
ok(menuApiSource.includes('sanitizeFormula'), 'functions/api/menu.js implements sanitizeFormula');

// Extract sanitizeFormula and sanitizeMenu
const sanitizeFormulaMatch = menuApiSource.match(/function sanitizeFormula\([\s\S]*?\n\}/);
const sanitizeMenuMatch = menuApiSource.match(/function sanitizeMenu\([\s\S]*?\n\}/);
ok(!!sanitizeFormulaMatch, 'found sanitizeFormula in functions/api/menu.js');
ok(!!sanitizeMenuMatch, 'found sanitizeMenu in functions/api/menu.js');

let sanitizeMenuFn = null;
if (sanitizeFormulaMatch && sanitizeMenuMatch) {
  try {
    const helperCode = `
      const str = (v, n) => String(v == null ? '' : v).slice(0, n);
      const optionEmoji = (v) => '';
      const mediaUrl = (v) => '';
      const sanitizePeriods = () => [];
      const sanitizeHours = () => null;
      ${sanitizeFormulaMatch[0]}
      ${sanitizeMenuMatch[0]}
      return sanitizeMenu;
    `;
    sanitizeMenuFn = new Function(helperCode)();
  } catch (e) {
    console.error('Failed to construct sanitizeMenu test runner:', e);
  }
}

if (sanitizeMenuFn) {
  // Test 1: Formula preservation on valid input
  const validMenu = {
    cats: [{ id: 'c1', name: 'Formules', station: 'st_cuisine' }],
    items: [{
      id: 'it_brunch',
      name: 'Petit-déjeuner norvégien',
      price: 89,
      catId: 'c1',
      formula: {
        slots: [
          {
            id: 'sl_1',
            label: 'Le pain',
            min: 1,
            max: 1,
            choices: [
              { itemId: 'm-012', extra: 0 },
              { itemId: 'm-013', extra: 10 }
            ]
          },
          {
            id: 'sl_2',
            label: 'La boisson',
            min: 1,
            max: 1,
            choices: [
              { itemId: 'm-020', extra: 0 },
              { itemId: 'm-021', extra: 5 }
            ]
          }
        ]
      }
    }]
  };

  const sanitized = sanitizeMenuFn(validMenu);
  const outItem = sanitized.items && sanitized.items[0];
  ok(outItem && outItem.formula, 'sanitizeMenu preserves formula on valid item');
  ok(outItem && outItem.formula && outItem.formula.slots && outItem.formula.slots.length === 2, 'preserved 2 slots');
  ok(outItem && outItem.formula && outItem.formula.slots[0].choices.length === 2, 'preserved slot choices');
  ok(outItem && outItem.formula && outItem.formula.slots[0].choices[1].extra === 10, 'preserved choice extra price');

  // Test 2: Bounds & clamping (15 slots -> capped at 10, 25 choices -> capped at 20)
  const bloatedSlots = [];
  for (let i = 0; i < 15; i++) {
    const bloatedChoices = [];
    for (let j = 0; j < 25; j++) {
      bloatedChoices.push({ itemId: 'it_' + j, extra: 99999999 });
    }
    bloatedSlots.push({
      id: 'sl_' + i,
      label: 'Slot ' + i + ' '.repeat(100),
      min: 50,
      max: 2, // min > max!
      choices: bloatedChoices
    });
  }

  const bloatedMenu = {
    items: [{
      id: 'it_big',
      name: 'Grand Menu',
      price: 150,
      formula: { slots: bloatedSlots }
    }]
  };

  const bloatedRes = sanitizeMenuFn(bloatedMenu);
  const bloatedItem = bloatedRes.items && bloatedRes.items[0];
  ok(bloatedItem && bloatedItem.formula && bloatedItem.formula.slots.length === 10, 'slots capped at 10');
  ok(bloatedItem && bloatedItem.formula && bloatedItem.formula.slots[0].choices.length === 20, 'choices per slot capped at 20');
  ok(bloatedItem && bloatedItem.formula && bloatedItem.formula.slots[0].choices[0].extra <= 100000, 'extra clamped to max 1e5');
  ok(bloatedItem && bloatedItem.formula && bloatedItem.formula.slots[0].label.length <= 60, 'slot label clamped to <= 60 chars');
  ok(bloatedItem && bloatedItem.formula && bloatedItem.formula.slots[0].min <= bloatedItem.formula.slots[0].max, 'min > max normalized');
}

// Check assets/menu-catalog.js features
ok(menuCatalogSource.includes('formulaIs'), 'menu-catalog.js has formulaIs i18n');
ok(menuCatalogSource.includes('data-f-is-formula'), 'menu-catalog.js has formula toggle in modal');
ok(menuCatalogSource.includes('data-f-add-slot'), 'menu-catalog.js has slot addition in modal');
ok(menuCatalogSource.includes('cleanFormula'), 'menu-catalog.js has cleanFormula helper');

// Test cleanFormula logic from menu-catalog.js
const cleanFormulaMatch = menuCatalogSource.match(/function cleanFormula\([\s\S]*?\n  \}/);
ok(!!cleanFormulaMatch, 'found cleanFormula in menu-catalog.js');
if (cleanFormulaMatch) {
  const cleanFormulaFn = new Function(cleanFormulaMatch[0] + '; return cleanFormula;')();
  const existingItems = [
    { id: 'm-001', name: 'Pain suédois' },
    { id: 'm-002', name: 'Café noir' },
  ];

  const formulaWithGhost = {
    slots: [
      {
        id: 'sl_1',
        label: 'Pain',
        min: 1,
        max: 1,
        choices: [
          { itemId: 'm-001', extra: 0 },
          { itemId: 'deleted_item_xyz', extra: 10 } // ghost item!
        ]
      },
      {
        id: 'sl_2',
        label: 'Boisson',
        min: 2, // min > max
        max: 1,
        choices: [
          { itemId: 'deleted_drink_abc', extra: 0 } // slot with ONLY ghost choices
        ]
      }
    ]
  };

  const cleaned = cleanFormulaFn(formulaWithGhost, existingItems);
  ok(cleaned && cleaned.slots, 'cleaned formula returned');
  ok(cleaned.slots[0].choices.length === 1, 'ghost choice dropped from slot 1');
  ok(cleaned.slots[0].choices[0].itemId === 'm-001', 'valid choice kept');
  ok(cleaned.slots[1].choices.length === 0, 'slot 2 choice list empty after dropping ghost');
  ok(cleaned.slots[1].min <= cleaned.slots[1].max, 'slot 2 min > max normalized to min <= max');
}

console.log(`\n✓ ${passed} controls green (${failures.length} failure(s))`);
if (failures.length) {
  process.exit(1);
}
