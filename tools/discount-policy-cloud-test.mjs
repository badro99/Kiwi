#!/usr/bin/env node
// #93: a first owner save must not race the initial server revision pull.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source = fs.readFileSync(new URL('../assets/discount-policy.js', import.meta.url), 'utf8');
const events = [];
let local = { percentages: [] };
const cloud = {
  async pull() { events.push('pull'); await new Promise(resolve => setTimeout(resolve, 5)); local = { percentages: [10] }; },
  async save(data) { events.push('save:' + data.percentages.join(',')); return { ok: true, status: 200 }; },
  flush() { throw new Error('flush-before-read-is-not-safe'); },
};
const context = { window: { KiwiEnv: { isReal: () => true }, KiwiStore: {
  currentVenue: () => 'fixture-merchant',
  define: () => ({ get: () => local, set(data) { events.push('set:' + data.percentages.join(',')); local = data; },
    cloud: () => cloud, subscribe() {} }),
} }, setTimeout };
vm.runInNewContext(source, context);
const result = await context.window.KiwiDiscountPolicy.save([5]);
assert.equal(result.ok, true);
assert.deepEqual(events, ['pull', 'set:5', 'save:5'], 'read revision before posting owner choice');
assert.equal(local.percentages.join(','), '5', 'initial pull cannot overwrite saved owner choice');
console.log('✓ discount policy cloud: first save waits for revision then posts owner choice');
