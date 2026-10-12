#!/usr/bin/env node
// Icons: Material Symbols Outlined from assets/icons/material/, and nothing else.
// Guards the five things that slipped before 2026-10-12 (see
// docs/audits/2026-10-12-icon-migration.md): a retouched or non-Material file in
// the vendored folder, a runtime or mapping table edited by hand, an icon name
// that silently drew a "?", a page still loading the old Rounded shim, and new
// `data-lucide` call sites. Static reads only: no browser, no network.
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import {
  ROOT, ICON_DIR, RUNTIME, DOC, BASELINE_FILE, readGlyphs, readAliases, resolve,
  renderRuntime, renderDocTable, spliceDoc, sourceFiles, countDataLucide, iconNamesIn
} from './build-material-icons.mjs';

const read = (rel) => readFileSync(path.join(ROOT, rel), 'utf8');
let checks = 0;
const ok = (value, label) => { assert.ok(value, label); checks++; console.log('  ✓ ' + label); };

// 1 · the vendored folder is Material and only Material
const glyphs = readGlyphs(); // throws on a file that is not one path on the 960 grid
ok(Object.keys(glyphs).length > 200, `${Object.keys(glyphs).length} vendored glyphs, each a single-path Material Symbol`);
ok(existsSync(path.join(ROOT, ICON_DIR, 'LICENSE')) && existsSync(path.join(ROOT, ICON_DIR, 'README.md')), 'the Apache-2.0 LICENSE and the README sit with the glyphs');

// 2 · the Lucide → Material table points at vendored files
const aliases = readAliases();
const orphans = Object.entries(aliases).filter(([, m]) => !glyphs[m]).map(([k, m]) => `${k} → ${m}`);
ok(!orphans.length, orphans.length ? `alias targets not vendored: ${orphans.join(', ')} (node tools/build-material-icons.mjs --fetch)` : `${Object.keys(aliases).length} aliases, every target vendored`);

// 3 · nothing generated was edited by hand
ok(read(RUNTIME) === renderRuntime(glyphs, aliases), `${RUNTIME} is exactly what the generator writes (node tools/build-material-icons.mjs)`);
ok(read(DOC) === spliceDoc(read(DOC), renderDocTable(aliases)), 'the mapping table in the audit doc matches tools/material-icon-aliases.json');

// 4 · every name a call site asks for draws a real glyph
const files = sourceFiles();
const unresolved = [];
const notMaterial = [];
let asked = 0;
for (const f of files) {
  for (const x of iconNamesIn(read(f))) {
    asked++;
    if (!glyphs[resolve(x.name, aliases)]) unresolved.push(`${f}:${x.line} "${x.name}"`);
    if (x.attr === 'icon' && !glyphs[x.name]) notMaterial.push(`${f}:${x.line} "${x.name}"`);
  }
}
ok(!unresolved.length, unresolved.length ? `names with no glyph (would draw "?"): ${unresolved.join(', ')}` : `${asked} icon names read from ${files.length} files, all resolve to a vendored glyph`);
ok(!notMaterial.length, notMaterial.length ? `data-icon / KiwiIcon.svg take Material names, not Lucide ones: ${notMaterial.join(', ')}` : 'data-icon and KiwiIcon.svg are given Material names');

// 5 · the pages load the Outlined runtime, nobody loads the Rounded shim
ok(!existsSync(path.join(ROOT, 'assets/lucide.min.js')), 'assets/lucide.min.js (the Rounded shim) is gone');
const stillLucide = files.filter((f) => /lucide\.min\.js/.test(read(f)) && !f.startsWith('functions/'));
ok(!stillLucide.length, stillLucide.length ? `still loading lucide.min.js: ${stillLucide.join(', ')}` : 'no page or script asks for lucide.min.js');
for (const page of ['kiwi-caisse.html', 'kiwi-serveur.html', 'dashboard.html', 'kiwi-order.html', 'OrderPro.html', 'cafe-atlas-qr.html']) {
  ok(/<script src="assets\/material-icons\.js\?v=\d+" defer><\/script>/.test(read(page)), `${page} loads assets/material-icons.js`);
}
ok(/'\/assets\/material-icons\.js\?v=\d+'/.test(read('kiwi-sw.js')), 'the service worker precaches the runtime, so the till draws icons offline');
const pagesWithIcons = files.filter((f) => f.endsWith('.html') && !f.includes('/') && /data-(lucide|icon)\s*=/.test(read(f)));
const blind = pagesWithIcons.filter((f) => !/assets\/material-icons\.js/.test(read(f)));
ok(!blind.length, blind.length ? `pages with icon placeholders but no runtime: ${blind.join(', ')}` : 'every page that writes an icon placeholder loads the runtime');

// 6 · the ratchet: no file gains a data-lucide
const baseline = JSON.parse(read(BASELINE_FILE));
const grew = [];
const shrank = [];
let total = 0;
for (const f of files) {
  const n = countDataLucide(read(f));
  total += n;
  const was = baseline[f] || 0;
  if (n > was) grew.push(`${f} ${was} → ${n}`);
  else if (n < was) shrank.push(f);
}
ok(!grew.length, grew.length
  ? `new data-lucide (write <i data-icon="material_name">, see ${DOC}): ${grew.join(', ')}`
  : `no new data-lucide (${total} left in ${Object.keys(baseline).length} files)`);
if (shrank.length) console.log(`  · fewer data-lucide in ${shrank.join(', ')}: lock it in with node tools/build-material-icons.mjs --ratchet`);

console.log(`\nmaterial-icons-test · ${checks} checks green`);
