#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
const ROOT = path.resolve(import.meta.dirname, '..');
const require = createRequire(import.meta.url);
const rules = require('../assets/menu-catalog.js');
const source = fs.readFileSync(path.join(ROOT, 'assets/menu-catalog.js'), 'utf8');
const pure = source.slice(source.indexOf("  'use strict';"), source.indexOf('})(function (rules)'));
assert(!/\b(?:document|window|localStorage|sessionStorage|fetch|setTimeout|setInterval|requestAnimationFrame)\b/.test(pure.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '')));
// Run the actual factory with all ambient browser capabilities unavailable.
const isolated = { exports: {} };
vm.runInNewContext(source.slice(0, source.indexOf('/* MENU RULES END */')), { module: isolated });
assert.equal(typeof isolated.exports.priceDish, 'function');
console.log('✓ pure factory has no DOM, storage, networking or timers; Node require skips screen boot');
let fc;
try { fc = createRequire(path.join(ROOT, 'app/package.json'))('fast-check'); }
catch { console.log('○ fast-check absent; menu rules properties skipped'); process.exit(0); }
const RUNS = Number(process.env.KIWI_PROPERTY_RUNS) || 500;
const SEED = Number(process.env.KIWI_PROPERTY_SEED) || 20261023;
let passed = 0, failed = 0, known = 0;
async function strict(label, property) {
  const result = await fc.check(property, { numRuns: RUNS, seed: SEED });
  if (result.failed) { failed++; console.error('✗ ' + label, fc.stringify(result.counterexample), result.errorInstance); }
  else { passed++; console.log('✓ ' + label); }
}
async function knownIssue(label, property) {
  const result = await fc.check(property, { numRuns: RUNS, seed: SEED });
  if (result.failed) { known++; console.log('○ known ' + label + ': ' + fc.stringify(result.counterexample)); }
  else { failed++; console.error('✗ known property now holds; promote to strict: ' + label); }
}
const cents = fc.integer({ min: 0, max: 10000000 });
const amounts = fc.array(cents, { maxLength: 20 });
const context = { cats: [{ id: 'c' }], items: [{ id: 'i' }, { id: 'archived', archived: true }] };
const input = fc.record({ name: fc.string(), price: fc.oneof(fc.double(), fc.string()), desc: fc.string(), avail: fc.boolean(), formulaOnly: fc.boolean(), archived: fc.boolean() });
await strict('dish normalisation is idempotent and does not mutate input', fc.property(input, data => {
  const before = structuredClone(data);
  const once = rules.normalizeItem(data, context, 'i', 'Produit');
  assert.deepEqual(rules.normalizeItem(once, context, once.id, 'Produit'), once);
  assert.deepEqual(structuredClone(data), before);
}));
await strict('dish and patch schemas drop hostile unknown fields', fc.property(input, fc.jsonValue(), (data, junk) => {
  const hostile = JSON.parse('{"__proto__":{"polluted":true},"constructor":{"prototype":{"polluted":true}},"onclick":"bad"}');
  const clean = rules.normalizeItem({ ...data, ...hostile, unknown: junk }, context, 'i', 'Produit');
  for (const key of ['__proto__', 'constructor', 'onclick', 'unknown']) assert(!Object.hasOwn(clean, key));
  assert.deepEqual(rules.patchItem(clean, { ...hostile, unknown: junk }, context.items), clean);
  assert.equal({}.polluted, undefined);
}));
await strict('categories, groups and choices normalise idempotently', fc.property(fc.string(), cents, (name, price) => {
  const c = rules.normalizeCategory(name, 'c', 'Catégorie');
  assert.deepEqual(rules.normalizeCategory(c.name, c.id, 'Catégorie'), c);
  const g = rules.normalizeGroup(name, 'g', 'Options');
  assert.deepEqual(rules.patchGroup(g, g), g);
  const o = rules.normalizeChoice(name, price / 100, '☕', 'o', 'Choix');
  assert.deepEqual(rules.normalizeChoice(o.name, o.price, o.emoji, o.id, 'Choix'), o);
}));
await strict('formula schema is idempotent, drops hostile fields and removes missing/archived choices', fc.property(cents, fc.string(), (extra, label) => {
  const f = { unknown: true, slots: [{ label, min: 5, max: 2, unknown: true, choices: ['i', 'archived', 'missing'].map(itemId => ({ itemId, extra: extra / 100, onclick: 'bad' })) }] };
  const before = structuredClone(f);
  const clean = rules.cleanFormula(f, context.items);
  assert.deepEqual(rules.cleanFormula(clean, context.items), clean);
  assert.deepEqual(Object.keys(clean), ['slots']);
  assert.deepEqual(Object.keys(clean.slots[0]), ['id', 'label', 'min', 'max', 'choices']);
  assert.deepEqual(clean.slots[0].choices, [{ itemId: 'i', extra: Math.min(extra, 10000000) / 100 }]);
  assert.equal(clean.slots[0].min, 2);
  assert.deepEqual(f, before);
}));
await strict('dish and modifiers sum exactly in centimes with quantity and optional tax', fc.property(cents, amounts, fc.integer({ min: 0, max: 1000 }), fc.integer({ min: 0, max: 100 }), (base, extras, qty, rate) => {
  const result = rules.priceDish({ price: base / 100 }, extras.map(p => ({ price: p / 100 })), qty, rate);
  const unit = base + extras.reduce((a, b) => a + b, 0), subtotal = unit * qty;
  assert.deepEqual(result, { unitCents: unit, subtotalCents: subtotal, taxCents: Math.round(subtotal * rate / 100), totalCents: subtotal + Math.round(subtotal * rate / 100) });
}));
await strict('removing any nonnegative modifier never increases the total', fc.property(cents, amounts, fc.nat(), (base, extras, index) => {
  const choices = extras.map(p => ({ price: p / 100 }));
  const removed = choices.filter((_, i) => i !== index % Math.max(1, choices.length));
  assert(rules.priceDish({ price: base / 100 }, removed, 3, 20).totalCents <= rules.priceDish({ price: base / 100 }, choices, 3, 20).totalCents);
}));
await strict('availability, slug and sequential IDs preserve their explicit rules', fc.property(fc.boolean(), fc.boolean(), fc.boolean(), fc.string(), fc.integer({ min: 0, max: 1000000 }), (avail, formulaOnly, archived, name, seq) => {
  assert.equal(rules.isAvailable({ avail, formulaOnly, archived }), avail && !formulaOnly && !archived);
  assert.equal(rules.slug(rules.slug(name)), rules.slug(name));
  const d = { seq, cats: [{ id: 'cat_' + (seq + 1), sub: [] }] };
  const healed = rules.healSeq(d);
  assert.equal(d.seq, seq);
  assert.deepEqual(rules.nextId(healed.seq, 'it'), { seq: seq + 2, id: 'it_' + (seq + 2) });
}));
await strict('formula labels preserve server truncation, including boundary whitespace', fc.property(fc.integer({ min: 1, max: 59 }), n => {
  const formula = { slots: [{ label: 'x'.repeat(n) + ' '.repeat(60 - n) + 'suffix', choices: [{ itemId: 'i' }] }] };
  const once = rules.cleanFormula(formula, context.items);
  return once.slots[0].label === formula.slots[0].label.slice(0, 60);
}));
console.log(`${passed} menu rules properties passed; ${known} known; ${failed} failed (seed ${SEED}, ${RUNS} runs)`);
process.exitCode = failed ? 1 : 0;
