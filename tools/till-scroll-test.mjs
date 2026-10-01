#!/usr/bin/env node
/* Ticket #0159 · Till views must own their scroll + compact phone KPIs.
 *
 * Root cause: the till root and main column are overflow:hidden at viewport
 * height, so every view needs its own scroller. Vendus and Acomptes injected
 * their content straight into the view with no scroller: the page froze on
 * phone and on the web. The guard asserts both till views are block-level
 * scrollers in both verticals, and that the till keeps the 2-column KPI grid
 * on narrow phones (instead of the 1-column stack).
 *
 *   node tools/till-scroll-test.mjs
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

const bq = readFileSync(path.join(ROOT, 'assets/pos-boutique.css'), 'utf8');
const mz = readFileSync(path.join(ROOT, 'assets/pos-maison.css'), 'utf8');

for (const [name, css, v, a] of [
  ['boutique', bq, '[data-bq-panel="vendus"]', '[data-bq-panel="acomptes"]'],
  ['maison', mz, '[data-mz-panel="vendus"]', '[data-mz-panel="acomptes"]'],
]) {
  for (const sel of [v, a]) {
    ok(`${name} ${sel} is a block-level scroller`, () => {
      const m = css.match(new RegExp(sel.replace(/[[\]"]/g, (c) => '\\' + c) + '[^{]*\\{([^}]*)\\}'));
      assert.ok(m, `rule for ${sel} missing`);
      assert.ok(/display\s*:\s*block/.test(m[1]), 'needs display:block (a stretched flex child would overflow instead)');
      assert.ok(/overflow-y\s*:\s*auto/.test(m[1]), 'needs overflow-y:auto');
    });
  }
  ok(`${name} till keeps 2-column KPIs on narrow phones`, () => {
    assert.ok(/max-width:\s*420px[\s\S]{0,400}kx-kpi-strip[\s\S]{0,200}repeat\(2/.test(css), '2-col KPI override missing');
  });
}

console.log(`\ntill-scroll: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
