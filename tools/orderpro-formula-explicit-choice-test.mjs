#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = fs.readFileSync(path.join(ROOT, 'OrderPro.html'), 'utf8');

function extractFunction(name) {
  const start = source.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `${name} exists`);
  const open = source.indexOf('{', start);
  let depth = 0;
  for (let i = open; i < source.length; i++) {
    if (source[i] === '{') depth++;
    if (source[i] === '}' && --depth === 0) return source.slice(start, i + 1);
  }
  throw new Error(`${name} has no closing brace`);
}

const initialize = new Function(`return (${extractFunction('initialCustomizerSelections')});`)();
const selections = initialize([
  { key: 'cooking', type: 'single', default: 'medium', choices: [{ id: 'rare' }, { id: 'medium' }] },
  { key: 'formula_pasta', formulaSlotId: 'pasta', type: 'single', default: 'gnocchi', min: 1, choices: [{ id: 'gnocchi' }, { id: 'penne' }] },
  { key: 'formula_sauce', formulaSlotId: 'sauce', type: 'single', default: '', min: 1, choices: [{ id: 'cheese' }, { id: 'tomato' }] },
  { key: 'formula_toppings', formulaSlotId: 'toppings', type: 'multi', min: 1, max: 2, choices: [{ id: 'basil' }] },
]);

assert.equal(selections.cooking, '', 'ordinary product defaults never become customer consent');
assert.equal(selections.formula_pasta, '', 'a formula default never becomes customer consent');
assert.equal(selections.formula_sauce, '', 'the first formula choice is never selected implicitly');
assert.deepEqual(selections.formula_toppings, [], 'multi-choice formula stages also begin empty');

assert.match(source, /invalidRequiredOption[\s\S]*?scrollIntoView\(\{ behavior: 'smooth', block: 'center' \}\)/,
  'Add scrolls to the first unanswered required option');
assert.match(source, /opt\.required \? 1 : 0/,
  'ordinary required groups require an explicit customer choice');
assert.match(source, /mayClear && customizerSelections\[optKey\] === choiceId \? '' : choiceId/,
  'tapping an active optional single choice clears it');
assert.match(source, /group\.classList\.add\('is-invalid'\)/,
  'the unanswered stage is visibly highlighted');
assert.match(source, /group\.classList\.remove\('is-invalid'\)/,
  'an explicit choice clears the validation state');
assert.match(source, /opt_required_missing: "Choisissez une option/,
  'French explains the missing choice');
assert.match(source, /opt_required_missing: "Choose an option/,
  'English explains the missing choice');
assert.match(source, /opt_required_missing: "اختار واحد الاختيار/,
  'Darija explains the missing choice');
assert.doesNotMatch(source,
  /if \(opt\.type === 'single'\) customizerSelections\[opt\.key\] = opt\.default \|\| opt\.choices\[0\]\.id/,
  'the old blanket first-choice selection cannot return unnoticed');

console.log('✓ OrderPro requires an explicit customer tap for every option choice');
