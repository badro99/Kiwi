#!/usr/bin/env node
/* Kiwi · console#0 · an operator roster that cannot be read is an error on the page,
 * never an empty team. Runs the real owners() / notice() of assets/admin-workspace.js.
 *   node tools/console-operators-load-test.mjs
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const source = fs.readFileSync(new URL('../assets/admin-workspace-copy.js', import.meta.url), 'utf8') + ';' + fs.readFileSync(new URL('../assets/admin-workspace.js', import.meta.url), 'utf8');
const policy = require('../assets/admin-policy.js');

function boot(api) {
  const element = () => ({ innerHTML: '', textContent: '', hidden: false, dataset: {}, classList: { toggle() {}, add() {}, remove() {}, contains: () => false }, style: {}, contains: () => false, querySelector: () => null, querySelectorAll: () => [], setAttribute() {}, removeAttribute() {}, addEventListener() {}, getClientRects: () => [] });
  const elements = new Map();
  const document = {
    documentElement: { lang: 'fr', dir: 'ltr' }, body: { dataset: {}, classList: { toggle() {}, add() {}, remove() {}, }, appendChild() {} }, activeElement: null,
    getElementById(id) { if (!elements.has(id)) elements.set(id, element()); return elements.get(id); },
    querySelector: () => null, querySelectorAll: () => [],
    createElement() { return { innerHTML: '', setAttribute() {}, querySelector: () => null, querySelectorAll: () => [], addEventListener() {}, showModal() {} }; },
  };
  const window = { KiwiAdminPolicy: policy, KiwiOperator: { close() {}, snapshot: () => ({}), api }, KiwiAdminI18n: { lang: 'fr' } };
  const context = vm.createContext({ window, document, Intl, Date, URLSearchParams, CSS: { escape: String }, crypto: { randomUUID: () => 'x' }, location: { search: '', hash: '' }, localStorage: { getItem: () => null } });
  vm.runInContext(source.slice(0, source.indexOf("  document.addEventListener('click'")) + ';window.test={state,notice,owners};})();', context);
  return window.test;
}
const unavailable = 'Liste des opérateurs indisponible';

for (const [label, api] of [
  ['rejected read', async () => { throw Object.assign(new Error('x'), { status: 503 }); }],
  ['200 without a roster', async () => ({})],
  ['roster that is not a list', async () => ({ operators: 'oops' })],
]) {
  const t = boot(api);
  t.state.live = true; t.state.data = { sources: {}, now: 1 };
  await t.owners();
  assert.equal(t.state.operatorsError, true, label + ' is flagged');
  assert.equal(t.state.operators.length, 0);
  assert.ok(t.notice().includes(unavailable), label + ' shows a visible notice instead of looking like no operators');
}

const good = boot(async () => ({ operators: [{ id: 'op1', label: 'Sara' }] }));
good.state.live = true; good.state.data = { sources: {}, now: 1 };
await good.owners();
assert.equal(good.state.operatorsError, false);
assert.equal(good.state.operators.length, 1);
assert.ok(!good.notice().includes(unavailable));

// A later successful read clears the error.
let fail = true;
const flaky = boot(async () => { if (fail) throw new Error('x'); return { operators: [{ id: 'op1', label: 'Sara' }] }; });
flaky.state.live = true; flaky.state.data = { sources: {}, now: 1 };
await flaky.owners(); assert.equal(flaky.state.operatorsError, true);
fail = false; await flaky.owners();
assert.equal(flaky.state.operatorsError, false);
console.log('✓ console-operators-load-test · a failed roster read is a visible error, a retry clears it');
