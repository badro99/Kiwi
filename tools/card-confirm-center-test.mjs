#!/usr/bin/env node
/* Ticket #0155 · Card confirm button must center icon + label as one group.
 *
 * The green "Encaissement confirmé sur le lecteur" button centers its TEXT
 * (text-align:center) while the check icon sat at the left edge, so the whole
 * read as off-center. The guard: both POS stylesheets keep an explicit
 * inline-flex + justify-content:center grouping rule on the card-confirm
 * button, which also holds in RTL (symmetric centering).
 *
 *   node tools/card-confirm-center-test.mjs
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = process.env.KIWI_ROOT || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let passed = 0, failed = 0;
function ok(label, fn) {
  try { fn(); passed++; console.log(`  ✓ ${label}`); }
  catch (e) { failed++; console.log(`  ✗ ${label}\n      ${String(e.message).split('\n')[0]}`); }
}

for (const [file, scope] of [['assets/pos-boutique.css', '.bq-card-confirm'], ['assets/pos-maison.css', '.mz-card-confirm']]) {
  const css = readFileSync(path.join(ROOT, file), 'utf8');
  const m = css.match(new RegExp(scope.replace('.', '\\.') + '\\s+\\.cash-confirm\\s*\\{([^}]*)\\}'));
  ok(`${file}: grouped centering rule present`, () => {
    assert.ok(m, 'rule missing');
    const body = m[1];
    assert.ok(/display\s*:\s*inline-flex/.test(body), 'needs display:inline-flex');
    assert.ok(/justify-content\s*:\s*center/.test(body), 'needs justify-content:center');
    assert.ok(/align-items\s*:\s*center/.test(body), 'needs align-items:center');
  });
}

console.log(`\ncard-confirm-center: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
