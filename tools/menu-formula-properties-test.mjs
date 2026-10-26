import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { sanitizeFormula } from '../functions/api/_menu-formula.js';
import { sanitizeMenu } from '../functions/api/menu.js';
import { build } from './build-menu-formula.mjs';
const fc = createRequire(new URL('../app/package.json', import.meta.url))('fast-check');
const read = p => fs.readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const load = (p, name) => vm.runInNewContext(read(p) + '\n' + name);
const oldServer = load('tools/fixtures/menu-formula/server-before.js', 'sanitizeFormula');
const oldEditor = load('tools/fixtures/menu-formula/editor-before.js', 'cleanFormula');
const catalog = read('assets/menu-catalog.js');
const editor = vm.runInNewContext(catalog.slice(0, catalog.indexOf('  function kitchenIdOf')) .replace(/^[\s\S]*?  const catById/, '  const catById') + '\ncleanFormula');
const plain = v => JSON.parse(JSON.stringify(v));
const items = [{ id: 'i', name: 'Plat' }, { id: 'archived', name: 'Archive', archived: true }];
const allowed = new Set(['i']);
function compare(raw) {
  let expected;
  try { expected = plain(oldServer(raw, allowed)); }
  catch (error) {
    for (const run of [() => sanitizeFormula(raw, allowed), () => editor(raw, items), () => oldEditor(raw, items)]) {
      assert.throws(run, e => e.name === error.name && e.message === error.message);
    }
    return;
  }
  assert.deepEqual(sanitizeFormula(raw, allowed), expected);
  assert.deepEqual(plain(editor(raw, items)), expected);
  const before = plain(oldEditor(raw, items));
  // The only historical disagreement: editor trimEnd after the 60-character cut.
  if (before) before.slots.forEach((s, i) => { s.label = expected.slots[i].label; });
  assert.deepEqual(before, expected);
  const menu = sanitizeMenu({ items: [{ ...items[0], formula: raw }, items[1]], formulaTemplates: [{ id: 't', name: 'Template', formula: raw }] });
  assert.deepEqual(menu.items[0].formula ?? null, expected);
  assert.deepEqual(menu.formulaTemplates[0]?.formula ?? null, expected);
}
const witness = { slots: [{ label: 'a'.repeat(59) + ' b', choices: [{ itemId: 'i', extra: 1.005 }] }] };
assert.notDeepEqual(plain(oldEditor(witness, items)), plain(oldServer(witness, allowed)));
compare(witness);
console.log('✓ named disagreement: trailing whitespace at the label truncation boundary, server wins');
const atom = fc.oneof(fc.jsonValue(), fc.constantFrom(undefined, NaN, Infinity, -Infinity, 'i', 'archived', '__proto__', '<script>', 'x'.repeat(1000)));
const choice = fc.oneof(atom, fc.record({ itemId: fc.oneof(atom, fc.constant('i')), extra: atom }));
const slot = fc.oneof(atom, fc.record({ id: atom, label: atom, min: atom, max: atom, choices: fc.oneof(atom, fc.array(choice, { maxLength: 35 })) }));
fc.assert(fc.property(fc.oneof(atom, fc.record({ slots: fc.array(slot, { maxLength: 18 }) })), compare), { seed: 20261026, numRuns: 1500 });
for (const raw of [null, {}, witness, { slots: Array(25).fill({ label: '<script>' + 'x'.repeat(500), min: Infinity, max: -Infinity, choices: Array(30).fill({ itemId: 'i', extra: Infinity }) }) }]) compare(raw);
build(true);
assert.match(read('functions/api/menu.js'), /import \{ sanitizeFormula \} from '\.\/_menu-formula.js'/);
assert.doesNotMatch(read('functions/api/menu.js'), /function sanitizeFormula\(/);
console.log('✓ 1500 seeded valid, broken, hostile and oversized formulas: old server = shared module = editor = item/template routes; generated copy current');
