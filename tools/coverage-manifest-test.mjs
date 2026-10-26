#!/usr/bin/env node
import { forLocales } from './test-locales.mjs';
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
const required = read('coverage-required.json');
assert.equal(required.version, 1);
assert(Array.isArray(required.required) && Array.isArray(required.blocked));
const requiredCells = new Set();
for (const row of required.required) {
  const surface = manifest.surfaces.find(s => s.id === row.surface);
  assert(surface && row.reason?.trim(), 'surface requise inconnue ou sans raison');
  assert.equal(row.locale, 'fr', 'seul le français est obligatoire');
  assert.deepEqual([...row.viewports].sort(), [...surface.viewports].sort(), 'tous les appareils vendus sont requis');
  for (const viewport of row.viewports) {
    const key = cellKey({ surface: row.surface, locale: row.locale, viewport });
    assert(declared.has(key) && !requiredCells.has(key), 'cellule requise invalide ou dupliquée : ' + key);
    requiredCells.add(key);
  }
}
// Le sous-ensemble suit les surfaces opérationnelles, pas les visites disponibles.
const operational = manifest.surfaces.filter(s => /^(caisse-|dashboard|boutique-)/.test(s.id) ||
  ['waiter', 'employee', 'team-entry', 'kitchen', 'kitchen-entry', 'console', 'booking', 'credit-book', 'shopify-recovery'].includes(s.id));
assert.deepEqual([...new Set(required.required.map(row => row.surface))].sort(),
  operational.map(s => s.id).sort(), 'une surface opérationnelle ne peut pas sortir du contrôle obligatoire');
const blocked = new Map();
for (const row of required.blocked) {
  assert(requiredCells.has(row.cell) && row.reason?.trim() && !blocked.has(row.cell), 'blocage invalide');
  assert(!covered.has(row.cell), 'blocage résolu à supprimer : ' + row.cell);
  blocked.set(row.cell, row.reason);
  console.log('BLOQUÉ ' + row.cell + ' : ' + row.reason);
}
const missing = [...requiredCells].filter(key => !covered.has(key));
console.log(`Couverture obligatoire FR : ${requiredCells.size} cellules, ${missing.length} manquantes, ${blocked.size} bloquées.`);
assert.equal(missing.filter(key => !blocked.has(key)).length, 0,
  'Parcours FR obligatoires sans vérification : ' + missing.filter(key => !blocked.has(key)).join(', '));
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
console.log('Browser locales: ' + forLocales(manifest.surfaces.flatMap(s => s.locales)).filter((l, i, a) => a.indexOf(l) === i).join(', ') + '; other locales not run by default. Annotations are static declarations, not execution evidence.');
console.log('Surface | locale | desktop tablet phone (✓ reviewed visit, · unclassified)');
for (const s of manifest.surfaces) for (const locale of s.locales) {
  console.log(`${s.id} | ${locale} | ${['desktop', 'tablet', 'phone'].map((viewport) => !s.viewports.includes(viewport) ? '-' : !forLocales([locale]).length ? 'not run by default' : covered.has(cellKey({ surface: s.id, locale, viewport })) ? '✓' : '·').join(' ')}`);
}
console.log(`Static annotated coverage: ${covered.size} / ${declared.size} declared cells; ${suites.length} browser suites scanned; ${suites.filter((s) => !s.cells.length).length} without reviewed annotations.`);
console.log('Couverture EN/AR informative, parcours à lancer à la demande avec KIWI_LOCALES :');
for (const key of declared) if (!covered.has(key) && /\|(en|ar)\|/.test(key)) console.log(`  TODO ${key}`);
console.log('✓ manifeste : inventaire HTML, historique additif et couverture obligatoire FR valides');
