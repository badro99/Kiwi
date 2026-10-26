#!/usr/bin/env node
// Non-browser ratchet. It measures static, reviewed coverage declarations;
// browser success remains the responsibility of the corresponding gate suites.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { ROOT, scan, claims, cellKey, viewportClass, ratchet } from './coverage-map.mjs';

assert.deepEqual([599, 600, 1100, 1101].map(viewportClass), ['phone', 'tablet', 'tablet', 'desktop']);
assert.throws(() => claims('// coverage: surface=x locale=fr viewport=phone\nawait unrelated();', 'fixture'));
assert.equal(claims('// coverage: surface=x locale=ar viewport=tablet\nawait page.goto(url);', 'fixture').length, 1);
assert.deepEqual(ratchet(['a'], ['a', 'b']), ['a', 'b']);
assert.throws(() => ratchet(['a'], ['b']), /cannot remove/);
const read = (file) => JSON.parse(fs.readFileSync(path.join(ROOT, 'tools', file), 'utf8'));
const manifest = read('coverage-manifest.json');
for (const id of ['dashboard-analysis','dashboard-promotion-editor','dashboard-product-editor']) assert(manifest.surfaces.some(s=>s.id===id), 'missing dedicated restaurant workflow: '+id);
const declared = new Set(), ids = new Set(), shells = new Set();
for (const s of manifest.surfaces) {
  assert(!ids.has(s.id), `duplicate surface ${s.id}`); ids.add(s.id);
  assert(s.shells.length && s.locales.length && s.viewports.length && s.state, `incomplete surface ${s.id}`);
  for (const shell of s.shells) {
    assert(fs.existsSync(path.join(ROOT, shell)), `missing shell ${shell}`); shells.add(shell);
  }
  for (const locale of s.locales) for (const viewport of s.viewports) {
    assert(['desktop', 'tablet', 'phone'].includes(viewport), `invalid viewport ${viewport}`);
    const key = cellKey({ surface: s.id, locale, viewport });
    assert(!declared.has(key), `duplicate cell ${key}`); declared.add(key);
  }
}
for (const e of manifest.excludedHtml) {
  assert(e.reason && /^(tools|docs|content|app|bridge\/rust\/src)\//.test(e.path), `invalid shell exclusion ${e.path}`);
  assert(!shells.has(e.path), `duplicate shell classification ${e.path}`); shells.add(e.path);
}
function walk(dir, prefix = '') {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['.git', 'node_modules', '.kiwi', 'graphify-out'].includes(entry.name) || entry.isSymbolicLink()) continue;
    const relative = prefix + entry.name;
    if (entry.isDirectory()) walk(path.join(dir, entry.name), relative + '/');
    else if (entry.name.endsWith('.html')) assert(shells.has(relative), `unlisted HTML shell: ${relative}`);
  }
}
walk(ROOT);
for (const id of ['boutique-checkout', 'boutique-returns', 'boutique-exchange', 'boutique-return-refusal', 'shopify-recovery']) assert(ids.has(id), 'dedicated money state missing: ' + id);
const suites = scan(), covered = new Set();
for (const suite of suites) for (const c of suite.cells) {
  const key = cellKey(c);
  assert(declared.has(key), `${suite.suite}:${c.line}: undeclared cell ${key}`);
  covered.add(key);
}
const baselinePath = path.join(ROOT, 'tools/coverage-baseline.json');
for (const origin of ['photo', 'document', 'assistant']) {
  for (const locale of ['fr', 'en', 'ar']) for (const viewport of ['phone', 'tablet']) {
    const key = `dashboard-intake-${origin}|${locale}|${viewport}`;
    assert(declared.has(key) && covered.has(key), 'complete annotated intake workflow missing: ' + key);
  }
}
const baseline = fs.existsSync(baselinePath) ? read('coverage-baseline.json') : { covered: [] };
assert(Array.isArray(baseline.covered), 'invalid coverage baseline');
// Check losses BEFORE the update: the update flag cannot bless a regression.
const nextBaseline = ratchet(baseline.covered, covered);
if (process.env.KIWI_UPDATE_COVERAGE_BASELINE === '1') {
  fs.writeFileSync(baselinePath, JSON.stringify({ version: 1, covered: nextBaseline }, null, 2) + '\n');
} else assert(fs.existsSync(baselinePath), 'initialize baseline with KIWI_UPDATE_COVERAGE_BASELINE=1');
console.log('Surface | locale | desktop tablet phone (✓ reviewed visit, · unclassified)');
for (const s of manifest.surfaces) for (const locale of s.locales) {
  console.log(`${s.id} | ${locale} | ${['desktop', 'tablet', 'phone'].map((viewport) => !s.viewports.includes(viewport) ? '-' : covered.has(cellKey({ surface: s.id, locale, viewport })) ? '✓' : '·').join(' ')}`);
}
console.log(`Coverage: ${covered.size} / ${declared.size} declared cells; ${suites.length} browser suites scanned; ${suites.filter((s) => !s.cells.length).length} without reviewed annotations.`);
console.log('TODO: verify/annotate or add rendered visits for these cells:');
for (const key of declared) if (!covered.has(key)) console.log(`  TODO ${key}`);
console.log('✓ coverage manifest: HTML inventory and additive baseline hold');
