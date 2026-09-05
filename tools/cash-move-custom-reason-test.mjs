#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const caisseHtml = fs.readFileSync(path.join(__dirname, '..', 'kiwi-caisse.html'), 'utf8');
const pairingJs = fs.readFileSync(path.join(__dirname, '..', 'assets', 'caisse-pairing.js'), 'utf8');

// 1. Markup exists & enforces required
assert.ok(caisseHtml.includes('id="cm-custom-wrap"'), 'cm-custom-wrap container exists in kiwi-caisse.html');
assert.ok(caisseHtml.includes('id="cm-custom-label"'), 'cm-custom-label exists');
assert.ok(caisseHtml.includes('id="cm-custom-input"'), 'cm-custom-input exists');
assert.ok(caisseHtml.includes('maxlength="80"'), 'custom input caps length at 80 characters');
assert.ok(caisseHtml.includes('required'), 'custom input has required attribute');
assert.ok(caisseHtml.includes('.cm-custom-wrap[hidden] { display: none !important; }'), 'hidden CSS rule present');

// 2. Logic exists & indicates obligatoire
assert.ok(caisseHtml.includes('function updateCmCustomVisibility()'), 'updateCmCustomVisibility function defined');
assert.ok(caisseHtml.includes("cmReason === 'Autre'"), 'logic checks for Autre reason');
assert.ok(caisseHtml.includes('Précisez le motif de la sortie (obligatoire)'), 'out prompt defined as obligatoire');
assert.ok(caisseHtml.includes("Précisez le motif de l'entrée (obligatoire)"), 'in prompt defined as obligatoire');

// 3. Obligatory validation: blocks empty note when Autre is selected
assert.ok(
  caisseHtml.includes("if (cmReason === 'Autre' && !customVal)"),
  'confirmCashMove rejects empty custom reason when Autre is selected'
);

// 4. PIN verification & Actor identification
assert.ok(
  caisseHtml.includes("requireTillOperator(`${cmType === 'in' ? 'Entrée' : 'Sortie'} de caisse · ${fmtMAD(amount)}`"),
  'confirmCashMove gates cash movement behind PIN verification'
);
assert.ok(
  caisseHtml.includes("actorId: actorId, actorName: actorName"),
  'cash movement stores verified actor id and name'
);
assert.ok(
  pairingJs.includes("lastOperator = { id: String(who.id || '').slice(0, 80)"),
  'caisse-pairing records verified actor on till authorization'
);
assert.ok(
  pairingJs.includes("lastOperator: function () { return lastOperator; }"),
  'caisse-pairing exposes lastOperator'
);

// 5. Sanitize reason & actor in list
assert.ok(
  caisseHtml.includes("cleanReason = String(m.reason || 'Autre').replace(/&/g, '&amp;')"),
  'renderCmList sanitizes reason output'
);
assert.ok(
  caisseHtml.includes("cleanActor = m.actorName ?"),
  'renderCmList displays actor name on movements'
);

console.log('✓ cash-move-custom-reason-test passed');
