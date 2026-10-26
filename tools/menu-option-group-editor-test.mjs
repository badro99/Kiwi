#!/usr/bin/env node
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
const src = readFileSync(path.join(ROOT, 'assets/restaurant-menu-workspace.js'), 'utf8');
const lens = readFileSync(path.join(ROOT, 'assets/liquid-lens.js'), 'utf8');
const caisse = caisseTestSource(readFileSync(path.join(ROOT, 'kiwi-caisse.html'), 'utf8'));
const orderLib = orderQueueTestSource('functions/api/order/_lib.js');

let passed = 0, failed = 0;
function ok(label, fn) {
  try { fn(); passed++; console.log(`  ✓ ${label}`); }
  catch (e) { failed++; console.log(`  ✗ ${label}\n      ${String(e.message).split('\n')[0]}`); }
}
const cut = (from, to) => { const a = src.indexOf(from); return a < 0 ? '' : src.slice(a, src.indexOf(to, a + from.length)); };
const editor = cut('  function openGroup(g){', '  function groupStyle(){');
const picker = cut('  function emojiPicker(button){', '  function choiceRow(c){');
const row = cut('  function choiceRow(c){', '  /* Option group editor');

console.log('option groups · the rule is a sentence, and the sentence is true');
ok('kind and requirement are segmented controls on the liquid lens, not selects', () => {
  assert.ok(!/<select class="kf-input" data-kind>/.test(src), 'old kind select');
  assert.ok(!/<select class="kf-input" data-required>/.test(src), 'old required select');
  assert.match(editor, /seg\('kind',kind,\[\['one',ui\('oneChoice'\)\],\['many',ui\('manyChoices'\)\]\]\)/);
  assert.match(editor, /seg\('req',req,\[\['0',ui\('ogOptional'\)\],\['1',ui\('ogRequired'\)\]\]\)/);
  assert.match(lens, /\{ sel: '\.rmw-og-seg', item: '\.rmw-og-segi', skin: 'surface',/);
  assert.match(lens, /\.rmw-og-seg\[data-kw-lens\] \.rmw-og-segi\.on span\{background:transparent;box-shadow:none;\}/);
});
ok('the four rule sentences match what the till and the order API enforce', () => {
  assert.match(editor, /ui\(many\?\(must\?'ogRuleManyReq':'ogRuleManyOpt'\):\(must\?'ogRuleOneReq':'ogRuleOneOpt'\)\)/);
  // one choice: a second tap clears it (so optional means « one, or none »); many: toggles
  assert.match(caisse, /if\(g\.kind==='many'\)\{if\(at>=0\)a\.splice\(at,1\);else a\.push\(id\);\}else optPicked\[g\.id\]=at>=0\?\[\]:\[id\];/);
  // required: at least one, from the till and from the order API alike
  assert.match(caisse, /g\.required && !picked\[g\.id\]\.length/);
  assert.match(orderLib, /min: Math\.max\(0, Math\.min\(40, Math\.round\(Number\(group\.min\) \|\| \(group\.required === true \? 1 : 0\)\)\)\)/);
  assert.match(orderLib, /\(group\.kind === 'many' \? Math\.max\(1, \(Array\.isArray\(group\.choices\) \? group\.choices\.length : 1\)\) : 1\)/);
});

console.log('option groups · a click on « Enregistrer » always answers');
ok('an empty name is written under the field and takes the focus (it used to return silently)', () => {
  assert.ok(!/if\(!name\|\|!rows\.length\)return;/.test(src), 'the old silent return');
  assert.match(editor, /setErr\('name',name\?'':ui\('ogNameRequired'\)\);/);
  assert.match(editor, /if\(!name\)\{nameEl\.focus\(\);return;\}/);
});
ok('no named choice, or a priced or marked choice without a name, is flagged rather than dropped', () => {
  assert.match(editor, /const unnamed=all\.filter\(x=>!x\.name&&\(x\.price>0\|\|x\.emoji\)\)/);
  assert.match(editor, /setErr\('choices',unnamed\.length\?ui\('ogChoiceUnnamed'\):rows\.length\?'':ui\('ogChoicesRequired'\)\);/);
});
ok('removing the only choice clears it instead of doing nothing', () => {
  assert.match(editor, /if\(\$\$\('\[data-choice\]',wrap\)\.length>1\)row\.remove\(\);else\{row\.dataset\.id='';/);
});
ok('a saved choice is patched with its fields only, never with the row element', () => {
  assert.match(editor, /S\(\)\.updateOptChoice\(id,x\.id,\{name:x\.name,price:x\.price,emoji:x\.emoji\}\)/);
});

console.log('option groups · columns, language, picker');
ok('choice columns are named, and the supplement starts empty instead of « 0 »', () => {
  assert.match(editor, /<div class="rmw-og-cols" aria-hidden="true"><span>\$\{esc\(ui\('ogMark'\)\)\}<\/span><span>\$\{esc\(ui\('ogChoiceName'\)\)\}<\/span><span>\$\{esc\(ui\('ogSupplement'\)\)\}<\/span>/);
  assert.match(row, /value="\$\{price>0\?price:''\}" placeholder="0" aria-label="\$\{esc\(ui\('ogSupplement'\)\)\}"/);
});
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
ok('the marker picker stays on screen, closes on Escape or a click away, and escapes what it prints', () => {
  assert.match(picker, /p\.style\.left=Math\.max\(8,Math\.min\(r\.left,innerWidth-w-8\)\)\+'px';/);
  assert.match(picker, /if\(e\.key==='Escape'\)\{e\.stopPropagation\(\);close\(\);button\.focus\(\);\}/);
  assert.match(picker, /const away=e=>\{if\(!p\.contains\(e\.target\)&&!button\.contains\(e\.target\)\)close\(\);\};/);
  assert.match(picker, /data-emoji="\$\{esc\(e\)\}">\$\{esc\(e\)\}<\/button>/);
});

console.log(`\nmenu-option-group-editor: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
