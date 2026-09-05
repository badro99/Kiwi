#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const caisseHtml = fs.readFileSync(path.join(__dirname, '..', 'kiwi-caisse.html'), 'utf8');

// 1. Markup exists
assert.ok(caisseHtml.includes('id="cm-custom-wrap"'), 'cm-custom-wrap container exists in kiwi-caisse.html');
assert.ok(caisseHtml.includes('id="cm-custom-label"'), 'cm-custom-label exists');
assert.ok(caisseHtml.includes('id="cm-custom-input"'), 'cm-custom-input exists');
assert.ok(caisseHtml.includes('maxlength="80"'), 'custom input caps length at 80 characters');
assert.ok(caisseHtml.includes('.cm-custom-wrap[hidden] { display: none !important; }'), 'hidden CSS rule present');

// 2. Logic exists
assert.ok(caisseHtml.includes('function updateCmCustomVisibility()'), 'updateCmCustomVisibility function defined');
assert.ok(caisseHtml.includes("cmReason === 'Autre'"), 'logic checks for Autre reason');
assert.ok(caisseHtml.includes('Précisez le motif de la sortie (facultatif)'), 'out prompt defined');
assert.ok(caisseHtml.includes("Précisez le motif de l'entrée (facultatif)"), 'in prompt defined');

// 3. Fallback logic in confirmCashMove
assert.ok(
  caisseHtml.includes("finalReason = (cmReason === 'Autre' && customVal) ? customVal : (cmReason || 'Autre')"),
  'confirmCashMove uses custom value if provided or falls back to Autre / selected reason'
);

// 4. Sanitize reason in list
assert.ok(
  caisseHtml.includes("cleanReason = String(m.reason || 'Autre').replace(/&/g, '&amp;')"),
  'renderCmList sanitizes reason output'
);

console.log('✓ cash-move-custom-reason-test passed');
