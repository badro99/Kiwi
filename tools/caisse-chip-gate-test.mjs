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

console.log(`\ncaisse-chip-gate: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
