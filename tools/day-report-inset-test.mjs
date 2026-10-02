#!/usr/bin/env node
/* Ticket #0148 · The daily report must never bleed past the viewport sides.
 *
 * Family of #0119 (wrong horizontal inset). Guard: the report nav children
 * can shrink (no flex blowout), the long day label can break, and the report
 * column is confined to the viewport width — at every width, in every locale
 * (EN dates and badges are the longest).
 *
 *   node tools/day-report-inset-test.mjs
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = process.env.KIWI_ROOT || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = readFileSync(path.join(ROOT, 'assets/day-report-dash.js'), 'utf8');

let passed = 0, failed = 0;
function ok(label, fn) {
  try { fn(); passed++; console.log(`  ✓ ${label}`); }
  catch (e) { failed++; console.log(`  ✗ ${label}\n      ${String(e.message).split('\n')[0]}`); }
}

ok('report nav children can shrink (flex blowout guard)', () => {
  assert.ok(/\.kdr-nav\s*>\s*\*\s*\{[^}]*min-width\s*:\s*0/.test(src), '.kdr-nav > * needs min-width:0');
});

ok('long day label breaks instead of pushing the page', () => {
  assert.ok(/\.kdr-day\s*\{[^}]*overflow-wrap\s*:\s*anywhere/.test(src), '.kdr-day needs overflow-wrap:anywhere');
});

ok('report column confined to the viewport', () => {
  assert.ok(/\[data-kdr\]\s*\{[^}]*max-width\s*:\s*100%/.test(src), '[data-kdr] needs max-width:100%');
});

console.log(`\nday-report-inset: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
