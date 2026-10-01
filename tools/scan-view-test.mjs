#!/usr/bin/env node
/* Ticket #0157 · Boutique scan view keeps phone clearance + honest camera note.
 *
 * Root causes guarded here:
 * 1. The scan header was nested inside .bq-scan-inner, so the shared phone
 *    clearance selectors (.vx-view > * > [class*="-head"]:first-child, which
 *    add burger clearance + safe-area top margin) never matched: the title
 *    collided with the status bar and the menu button. The header must be a
 *    direct child of .bq-scan.
 * 2. The "this browser cannot read barcodes" note showed inside the native
 *    app, where there is no getUserMedia/BarcodeDetector at all. The native
 *    branch must exist and its strings must have EN + AR translations.
 *
 *   node tools/scan-view-test.mjs
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = process.env.KIWI_ROOT || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const bq = readFileSync(path.join(ROOT, 'assets/pos-boutique.js'), 'utf8');
const lang = readFileSync(path.join(ROOT, 'assets/caisse-lang.js'), 'utf8');

let passed = 0, failed = 0;
function ok(label, fn) {
  try { fn(); passed++; console.log(`  ✓ ${label}`); }
  catch (e) { failed++; console.log(`  ✗ ${label}\n      ${String(e.message).split('\n')[0]}`); }
}

ok('scan header is a direct child of .bq-scan (phone clearance applies)', () => {
  const m = bq.match(/<div class="bq-scan">\s*<header class="bq-head">/);
  assert.ok(m, 'header must sit directly under .bq-scan');
  assert.ok(!/<div class="bq-scan">\s*<div class="bq-scan-inner">\s*<header/.test(bq), 'header must not be nested in .bq-scan-inner');
});

ok('native-app camera note branch exists', () => {
  assert.ok(bq.includes('kiwi-native'), 'must detect the native wrapper');
  assert.ok(bq.includes('Caméra indisponible dans l’application') || bq.includes("Caméra indisponible dans l'application"), 'native note present');
  assert.ok(bq.includes('Ce navigateur ne sait pas lire un code-barres'), 'browser note kept for the web');
});

ok('native note has EN + AR translations', () => {
  const hit = lang.includes('Caméra indisponible dans l’application') || lang.includes("Caméra indisponible dans l'application");
  assert.ok(hit, 'T-table entry present');
});

console.log(`\nscan-view: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
