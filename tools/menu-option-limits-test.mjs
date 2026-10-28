/* menu-option-limits-test · « up to 2 sauces » survives publishing.
 *
 * Wave 11 (menu#0): order/_guest-pricing.js enforces a group's min and max,
 * but normalizeOptionGroup (functions/api/_rules-menu-schema.js) kept only
 * kind and required, so a published menu lost its limits and a « many » group
 * accepted every choice. Proven against the real publish sanitizer, the real
 * pricing of a guest order, and the dashboard's copy of the rule (the menu
 * editor's patchGroup). */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { sanitizeMenu } from '../functions/api/menu.js';
import { normalizeOptionGroup } from '../functions/api/_rules-menu-schema.js';
import { priceOrder } from '../functions/api/order/_guest-pricing.js';

const require = createRequire(import.meta.url);
let checks = 0;
const ok = (v, label) => { assert.ok(v, label); checks++; };

const sauces = { id: 'sauces', name: 'Sauces', kind: 'many', min: 1, max: 2,
  choices: ['Harissa', 'Mayonnaise', 'Algérienne'].map((name, i) => ({ id: 's' + i, name, price: 0 })) };
const published = sanitizeMenu({
  opts: [sauces, { id: 'cuisson', name: 'Cuisson', kind: 'one', required: true, choices: [{ id: 'c0', name: 'Saignant' }] }],
  cats: [{ id: 'c', name: 'Plats' }],
  items: [{ id: 'burger', name: 'Burger', catId: 'c', price: 60, avail: true, opts: ['sauces'] }],
});
const group = published.opts.find((g) => g.id === 'sauces');
ok(group.max === 2 && group.min === 1 && group.required === true, 'publish keeps min and max: ' + JSON.stringify(group));
const legacy = published.opts.find((g) => g.id === 'cuisson');
ok(!('max' in legacy) && !('min' in legacy) && legacy.required === true, 'a menu without limits publishes as before');

const env = { DB: { prepare: () => ({ bind() { return this; }, first: async () => ({ data: JSON.stringify(published), updated_ts: 1 }) }) } };
const order = (n) => priceOrder(env, 'shop', [{ id: 'burger', qty: 1,
  optionChoices: sauces.choices.slice(0, n).map((c) => ({ group: 'sauces', choiceId: c.id })) }], { now: 1 });
const two = await order(2), three = await order(3), none = await order(0);
ok(two.lines.length === 1 && !two.invalidOptions.length, 'two sauces are accepted');
ok(three.invalidOptions.includes('Burger') && !three.lines.length, 'a third sauce is refused');
ok(none.invalidOptions.includes('Burger'), 'min 1: no sauce is refused');

// Bounds: whole numbers, 0 ≤ min ≤ max ≤ 40, a single-choice group never above 1.
const n = (raw) => normalizeOptionGroup({ id: 'g', name: 'G', ...raw });
ok(n({ kind: 'many', max: 2.6 }).max === 3 && n({ kind: 'many', max: 99 }).max === 40 && n({ kind: 'many', max: -3 }).max === 1, 'max is a whole number in 1..40');
ok(n({ kind: 'many', min: 5, max: 2 }).min === 2, 'min never exceeds max');
ok(!('max' in n({ kind: 'one', max: 3 })) && n({ kind: 'one', min: 4 }).min === 1, 'a single-choice group stays single');
ok(!('max' in n({ kind: 'many', max: '' })) && !('min' in n({ kind: 'many', min: null })), 'an empty limit is no limit');
ok(n({ kind: 'many', min: 0, required: true }).required === true && n({ kind: 'many', min: 2 }).required === true, 'a positive minimum makes the group required');

// The dashboard editor's copy of the rule keeps the limits through an edit.
globalThis.window = undefined;
const rules = require('../assets/menu-catalog.js');
const g = { id: 'sauces', name: 'Sauces', kind: 'many', required: true, min: 1, max: 2, choices: [] };
const renamed = rules.patchGroup(g, { name: 'Sauces maison' });
ok(renamed.max === 2 && renamed.min === 1 && renamed.name === 'Sauces maison', 'renaming keeps the limits');
ok(rules.patchGroup(g, { max: 3 }).max === 3, 'the editor can set a maximum');
const single = rules.patchGroup(g, { kind: 'one' });
ok(!('max' in single) && single.min === 1, 'switching to one choice drops the maximum');
const optional = rules.patchGroup(g, { required: false });
ok(optional.required === false && !optional.min, 'unticking « required » clears the minimum');
console.log(`✓ menu-option-limits-test · ${checks} checks`);
