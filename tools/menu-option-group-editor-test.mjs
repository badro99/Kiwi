#!/usr/bin/env node
// Mutation vérifiée : choiceRow() retourne une chaîne vide.
// Anciennes assertions vertes, exécution rouge ; octets livrés restaurés ensuite.
import { createRequire as text2Require } from 'node:module';
text2Require(import.meta.url)('./text2-runtime.cjs').run('menu-option-group-editor');
import menuWorkspaceSource from './menu-workspace-test-source.cjs';
import orderQueueTestSource from './order-queue-test-source.cjs';
import caisseTestSource from './caisse-test-source.cjs';
/* Menu · the option group editor says what the order screens will do, and
 * never swallows a click.
 *
 * 2026-10-12. « Nouveau groupe d'options » was two selects, a help line in
 * French under every language (« Le repère visuel accepte uniquement… »), price
 * boxes pre-filled with « 0 » and no column names, and an « Enregistrer » that
 * did nothing at all when the name or every choice was empty. The emoji picker
 * opened off the left edge of a phone, said « Aucun repère » in French, and
 * could not be closed without picking. The delete confirmation's default
 * sentence was French in every language.
 *   node tools/menu-option-group-editor-test.mjs
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = process.env.KIWI_ROOT || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = menuWorkspaceSource();
const lens = readFileSync(path.join(ROOT, 'assets/liquid-lens.js'), 'utf8');
const caisse = caisseTestSource(readFileSync(path.join(ROOT, 'kiwi-caisse.html'), 'utf8'));
const orderLib = orderQueueTestSource('functions/api/order/_lib.js');

let passed = 0, failed = 0;
function ok(label, fn) {
  try { fn(); passed++; console.log(`  ✓ ${label}`); }
  catch (e) { failed++; console.log(`  ✗ ${label}\n      ${String(e.message).split('\n')[0]}`); }
}

console.log('option groups · the rule is a sentence, and the sentence is true');
/* The editor itself (segmented controls, rule sentences, saving, errors, choice
   rows, the marker picker) now runs in tools/menu-option-group-editor-run-test.mjs.
   What stays here is wiring to other files and the language tables. */
ok('the segmented controls are registered on the liquid lens', () => {
  assert.match(lens, /\{ sel: '\.rmw-og-seg', item: '\.rmw-og-segi', skin: 'surface',/);
  assert.match(lens, /\.rmw-og-seg\[data-kw-lens\] \.rmw-og-segi\.on span\{background:transparent;box-shadow:none;\}/);
});
ok('the till and the order API enforce what the rule sentences say', () => {
  // one choice: a second tap clears it (so optional means « one, or none »); many: toggles
  assert.match(caisse, /if\(g\.kind==='many'\)\{if\(at>=0\)a\.splice\(at,1\);else a\.push\(id\);\}else optPicked\[g\.id\]=at>=0\?\[\]:\[id\];/);
  // required: at least one, from the till and from the order API alike
  assert.match(caisse, /g\.required && !picked\[g\.id\]\.length/);
  assert.match(orderLib, /min: Math\.max\(0, Math\.min\(40, Math\.round\(Number\(group\.min\) \|\| \(group\.required === true \? 1 : 0\)\)\)\)/);
  assert.match(orderLib, /\(group\.kind === 'many' \? Math\.max\(1, \(Array\.isArray\(group\.choices\) \? group\.choices\.length : 1\)\) : 1\)/);
});

console.log('option groups · language');
ok('no French left hard-coded in the editor, the picker or the delete confirmation', () => {
  assert.ok(!/Le repère visuel accepte/.test(src));
  assert.ok(!/class="rmw-none">Aucun repère/.test(src));
  assert.match(src, /function confirm\(title,run,detail=ui\('confirmDeleteDefault'\)\)\{/);
});
ok('every new string exists in FR, EN and AR, without an em dash', () => {
  for (const k of ['ogOptional', 'ogRequired', 'ogRuleOneReq', 'ogRuleOneOpt', 'ogRuleManyReq', 'ogRuleManyOpt', 'ogChoicesHelp',
    'ogMark', 'ogMarkPick', 'ogNoMark', 'ogMarkHelp', 'ogChoiceName', 'ogSupplement', 'ogRemoveChoice', 'ogNameRequired',
    'ogChoicesRequired', 'ogChoiceUnnamed', 'confirmDeleteDefault']) {
    const lines = src.match(new RegExp(`^      ${k}: .*$`, 'gm')) || [];
    assert.equal(lines.length, 3, k);
    assert.ok(!lines.some((l) => /—/.test(l)), k + ' em dash');
  }
});
console.log(`\nmenu-option-group-editor: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
