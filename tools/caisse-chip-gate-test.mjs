#!/usr/bin/env node
/* Ticket #0147(b) · The floating "open caisse" launcher must never sit on an
 * entry, lock or pairing gate.
 *
 * Two root causes guarded here:
 * 1. ensureChip() placed the chip for any real merchant without checking the
 *    gate (dashReady() existed but was never called).
 * 2. dashReady()'s lock test used `lock.offsetParent !== null`, which is
 *    ALWAYS null for position:fixed overlays — so it could never see the
 *    visible PIN lock.
 *
 *   node tools/caisse-chip-gate-test.mjs
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = process.env.KIWI_ROOT || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = readFileSync(path.join(ROOT, 'assets/caisse-link.js'), 'utf8');

let passed = 0, failed = 0;
function ok(label, fn) {
  try { fn(); passed++; console.log(`  ✓ ${label}`); }
  catch (e) { failed++; console.log(`  ✗ ${label}\n      ${String(e.message).split('\n')[0]}`); }
}

ok('ensureChip gates on dashReady and removes a placed chip', () => {
  const m = src.match(/function ensureChip\([^)]*\)\s*\{([\s\S]{0,700})/);
  assert.ok(m, 'ensureChip found');
  assert.ok(/dashReady\(\)/.test(m[1]), 'must consult dashReady()');
  assert.ok(/removeChild/.test(m[1]), 'must remove a chip placed before the gate closed');
});

ok('lock visibility does not rely on offsetParent (null for fixed overlays)', () => {
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  assert.ok(!/offsetParent\s*!==?\s*null/.test(code), 'offsetParent null-check must be gone');
  assert.ok(/getClientRects\(\)/.test(code), 'must use rects for fixed-overlay visibility');
});

ok('chip re-evaluates on unlock and on lock moves', () => {
  assert.ok(/kiwi:dashboard-unlocked/.test(src), 'must re-place after unlock');
  assert.ok(/MutationObserver/.test(src), 'must watch the lock node for re-locks');
});

// Run the real function: a token-presence assertion cannot detect a forced bypass.
const ensureChipSource = src.match(/function ensureChip\(force\) \{[\s\S]*?\n  \}\n  function updateChip/)[0]
  .replace(/\n  function updateChip$/, '');
function exerciseChip({ nativeClass = false, capacitorNative = false, force = false, ready = false, existing = false }) {
  let placements = 0, removals = 0;
  const chip = { setAttribute() {}, addEventListener() {}, parentNode: { removeChild() { removals++; } } };
  const context = {
    document: {
      documentElement: { classList: { contains: name => name === 'kiwi-native' && nativeClass } },
      getElementById: () => existing ? chip : null,
      createElement: () => chip,
    },
    window: { Capacitor: { isNativePlatform: () => capacitorNative } },
    realMerchant: () => true, dashReady: () => ready, css() {}, openPanel() {},
    placeChip() { placements++; }, updateChip() {},
  };
  vm.runInNewContext(ensureChipSource + '; ensureChip(' + JSON.stringify(force) + ');', context);
  return { placements, removals };
}
for (const marker of ['nativeClass', 'capacitorNative']) {
  for (const force of [false, true]) for (const ready of [false, true]) {
    ok('native launcher suppressed and removed: ' + marker + ', forced=' + force + ', dashboardReady=' + ready, () => {
      assert.deepEqual(exerciseChip({ [marker]: true, force, ready, existing: true }), { placements: 0, removals: 1 });
    });
  }
}
ok('unlocked web dashboard retains its launcher', () => {
  assert.deepEqual(exerciseChip({ ready: true }), { placements: 1, removals: 0 });
});
ok('web post-onboarding forced launcher retains its explicit behavior', () => {
  assert.deepEqual(exerciseChip({ force: true }), { placements: 1, removals: 0 });
});
ok('blocked web gate removes an ordinary earlier launcher', () => {
  assert.deepEqual(exerciseChip({ existing: true }), { placements: 0, removals: 1 });
});

console.log(`\ncaisse-chip-gate: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
