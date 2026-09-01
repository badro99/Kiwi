#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sanitizeMenu } from '../functions/api/menu.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

const sanitized = sanitizeMenu({
  items: [
    { id: 'formula', name: 'Choisissez vos pâtes', formula: { slots: [{ id: 'pasta', label: 'Pâtes', min: 1, max: 1, choices: [{ itemId: 'rigatoni' }, { itemId: 'penne' }] }] } },
    { id: 'rigatoni', name: 'Rigatoni', formulaOnly: true, photo: 'https://kiwi.test/api/media/rigatoni.jpg', showPhotoInFormulas: true },
    { id: 'penne', name: 'Penne', formulaOnly: true, photo: 'https://kiwi.test/api/media/penne.jpg', showPhotoInFormulas: false },
    { id: 'legacy', name: 'Legacy', formulaOnly: true, photo: 'https://kiwi.test/api/media/legacy.jpg' },
  ],
});

assert.equal(sanitized.items.find((item) => item.id === 'rigatoni').showPhotoInFormulas, true,
  'the public menu sanitizer preserves an explicit formula-photo opt-in');
assert.equal(sanitized.items.find((item) => item.id === 'penne').showPhotoInFormulas, false,
  'an explicit opt-out remains off');
assert.equal(sanitized.items.find((item) => item.id === 'legacy').showPhotoInFormulas, false,
  'existing menu items default to text-only formula choices');

const catalog = read('assets/menu-catalog.js');
const workspace = read('assets/restaurant-menu-workspace.js');
const orderPro = read('OrderPro.html');

for (const [surface, source] of [['menu catalogue', catalog], ['restaurant workspace', workspace]]) {
  assert.match(source, /showPhotoInFormulas/, `${surface} persists the item setting`);
  assert.match(source, /Afficher la photo dans les formules/, `${surface} exposes the French checkbox label`);
}

assert.match(orderPro, /target\.showPhotoInFormulas === true \? String\(target\.photo \|\| ''\) : ''/,
  'OrderPro only attaches a component photo after an explicit opt-in');
assert.match(orderPro, /!!opt\.formulaSlotId && opt\.choices\.some\(choice => choice\.photo\)/,
  'only formula option groups switch into the visual-card layout');
assert.match(orderPro, /class="option-choice-media"[\s\S]*loading="lazy" decoding="async"/,
  'formula choice images are lazy and asynchronously decoded');
assert.match(orderPro, /\.option-group\.has-choice-images \.option-chips[\s\S]*grid-template-columns: repeat\(2/,
  'visual formula choices use a compact two-column mobile grid');
assert.match(orderPro, /@media \(max-width: 350px\)[\s\S]*grid-template-columns: 1fr/,
  'very narrow phones fall back to one readable column');

console.log('OrderPro formula choice images: 12 checks passed.');
