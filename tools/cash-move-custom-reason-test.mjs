#!/usr/bin/env node
import caisseTestSource from './caisse-test-source.cjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const caisseHtml = caisseTestSource(fs.readFileSync(path.join(__dirname, '..', 'kiwi-caisse.html'), 'utf8')).replace(/<link rel="stylesheet" href="assets\/caisse-shell\.css\?v=\d+"\s*\/?>/, () => '<style>' + fs.readFileSync(path.join(__dirname, '..', 'assets/caisse-shell.css'), 'utf8') + '</style>');
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

/* Run: mutation movementAmountCents: Math.round(amount * 100) + 1
 * passes the text checks but corrupts the emitted centimes. */
const { createRequire } = await import('node:module');
const vm = await import('node:vm');
const { declarations } = createRequire(import.meta.url)('./caisse-test-source.cjs');
const nodes = { '#cm-amount': { value: '12.50' }, '#cm-custom-input': { value: '   ', focus() {} } };
let approve, gates = 0;
const events = [];
const ctx = vm.createContext({ $: id => nodes[id], money: n => Math.round(n * 100) / 100,
  cmReason: 'Autre', cmType: 'out', window: {}, toast() {}, fmtMAD: String,
  requireTillOperator: (_label, cb) => { gates++; approve = cb; }, cashMovements: [],
  emitCashSession: e => events.push(e), cashSessionId: () => 'session-fixture',
  drawerExpected: () => 87.50, shiftOpenedAt: new Date(1000),
  refreshOpenReconciliationModals() {}, closeCashMove() {} });
vm.runInContext(declarations('confirmCashMove'), ctx);
ctx.confirmCashMove();
assert.equal(gates, 0, 'run: blank custom reason cannot reach authorization');
nodes['#cm-custom-input'].value = '  Livraison  ';
ctx.confirmCashMove();
assert.equal(ctx.cashMovements.length, 0, 'run: no movement before operator approval');
assert.equal(events.length, 0, 'run: no ledger event before approval');
approve({ id: 'operator-fixture', name: 'Test' });
assert.equal(ctx.cashMovements[0].reason, 'Livraison');
assert.equal(ctx.cashMovements[0].amount, 12.50);
assert.equal(events[0].movementAmountCents, 1250, 'run: exact centimes reach cash ledger');
assert.equal(events[0].expectedCents, 8750);
assert.equal(events[0].actorId, 'operator-fixture');
nodes['#cm-amount'].value = '0'; ctx.confirmCashMove();
assert.equal(gates, 1, 'run: zero movement refused');

console.log('✓ cash-move-custom-reason-test passed');
