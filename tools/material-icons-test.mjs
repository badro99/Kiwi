#!/usr/bin/env node
// Icons: Material Symbols Outlined from assets/icons/material/, and nothing else.
// Guards the five things that slipped before 2026-10-12 (see
// docs/audits/2026-10-12-icon-migration.md): a retouched or non-Material file in
// the vendored folder, a runtime or mapping table edited by hand, an icon name
// that silently drew a "?", a page still loading the old Rounded shim, and new
// `data-lucide` call sites. Static reads only: no browser, no network.
import assert from 'node:assert/strict';
import serveurSource from './serveur-source.cjs';
import caisseWorkflowSource from './caisse-test-source.cjs';
import coreTestSource from './core-test-source.cjs';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import {
  ROOT, ICON_DIR, RUNTIME, DOC, BASELINE_FILE, readGlyphs, readAliases, resolve,
  renderRuntime, renderDocTable, spliceDoc, sourceFiles, countDataLucide, iconNamesIn,
  SUBSETS, subsetOf
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
for (const [name, spec] of Object.entries(SUBSETS)) {
  const x = subsetOf(spec, glyphs, aliases);
  ok(existsSync(path.join(ROOT, spec.out)) && read(spec.out) === renderRuntime(x.glyphs, x.aliases, name), `${spec.out} is exactly what the generator writes (${Object.keys(x.glyphs).length} glyphs)`);
  const lacking = spec.from.flatMap((f) => iconNamesIn(read(f)).filter((n) => glyphs[resolve(n.name, aliases)] && !x.glyphs[resolve(n.name, aliases)]).map((n) => `${f}:${n.line} ${n.name}`));
  ok(!lacking.length, lacking.length ? `the ${name} subset lacks names its pages ask for: ${lacking.join(', ')}` : `the ${name} subset holds every name ${spec.from.length} files ask for`);
}

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

// 4b · data-icon means "icon placeholder" only on <i>. The boutique and maison
// pickers used to carry data-icon on their <button>s, and the runtime replaced
// every picker button with an svg; they now say data-icon-key.
const wrongTag = [];
for (const f of files) {
  const text = read(f);
  for (const m of text.matchAll(/<([a-zA-Z][\w-]*)\b[^<>]*?\sdata-icon\s*=/g)) {
    if (m[1].toLowerCase() !== 'i') wrongTag.push(`${f}:${text.slice(0, m.index).split('\n').length} <${m[1]}>`);
  }
}
ok(!wrongTag.length, wrongTag.length ? `data-icon outside an <i> placeholder (the runtime would ignore it, or a picker would collide): ${wrongTag.join(', ')}` : 'data-icon only ever sits on an <i> placeholder');

// 4c · the runtime itself, in a stub DOM: it leaves a picker <button data-icon>
// alone, draws an <i data-icon>, and never writes a hostile name into markup.
{
  const vm = await import('node:vm');
  const el = (tag, attrs) => {
    const a = { ...attrs };
    return {
      tagName: tag.toUpperCase(), replaced: null,
      get attributes() { return Object.entries(a).map(([name, value]) => ({ name, value })); },
      hasAttribute: (n) => Object.prototype.hasOwnProperty.call(a, n),
      getAttribute: (n) => (Object.prototype.hasOwnProperty.call(a, n) ? a[n] : null),
      setAttribute: (n, v) => { a[n] = String(v); },
      appendChild() {},
      replaceWith(x) { this.replaced = x; },
    };
  };
  const button = el('button', { 'data-icon': 'robe', class: 'bqi-icon' });
  const placeholder = el('i', { 'data-icon': 'print' });
  const warnings = [];
  const ctx = {
    console: { warn: (m) => warnings.push(m) },
    queueMicrotask: () => {},
    MutationObserver: class { observe() {} },
    document: {
      readyState: 'complete', documentElement: {},
      createElementNS: (_ns, tag) => el(tag, {}),
      querySelectorAll: () => [button, placeholder],
      addEventListener() {},
    },
  };
  ctx.window = ctx;
  vm.runInNewContext(read(RUNTIME), ctx);
  ctx.KiwiIcon.render(ctx.document);
  ok(button.replaced === null, 'a picker <button data-icon> is left in place, not replaced by an svg');
  ok(placeholder.replaced && placeholder.replaced.getAttribute('data-material-symbol') === 'print', 'an <i data-icon="print"> is drawn as the print glyph');
  const hostile = ctx.KiwiIcon.svg('a"><img src=x onerror=alert(1)>', 18);
  ok(!/<img|onerror/.test(hostile) && (hostile.match(/"/g) || []).length % 2 === 0, 'KiwiIcon.svg() never writes a hostile name into the markup');
  ok(ctx.KiwiIcon.missing.includes('a"><img src=x onerror=alert(1)>') && warnings.length > 0, 'and reports it as a missing icon instead');
}

// 4d · the subset: a glyph it has is drawn; one it lacks loads the full
// runtime once, and the placeholder waits for it instead of drawing "?".
{
  const vm = await import('node:vm');
  const el = (tag, attrs) => {
    const a = { ...attrs };
    return {
      tagName: tag.toUpperCase(), replaced: null,
      get attributes() { return Object.entries(a).map(([name, value]) => ({ name, value })); },
      hasAttribute: (n) => Object.prototype.hasOwnProperty.call(a, n),
      getAttribute: (n) => (Object.prototype.hasOwnProperty.call(a, n) ? a[n] : null),
      setAttribute: (n, v) => { a[n] = String(v); },
      appendChild() {},
      replaceWith(x) { this.replaced = x; },
    };
  };
  const spec = SUBSETS.ordering;
  const x = subsetOf(spec, glyphs, aliases);
  const absent = Object.keys(glyphs).find((g) => !x.glyphs[g]);
  const have = el('i', { 'data-icon': 'check' });
  const lack = el('i', { 'data-icon': absent });
  const injected = [];
  const self = el('script', { 'data-full': 'assets/material-icons.js?v=9' });
  const ctx = {
    console: { warn() {} },
    queueMicrotask: () => {},
    MutationObserver: class { observe() {} },
    document: {
      readyState: 'complete', documentElement: {}, currentScript: self,
      head: { appendChild: (n) => injected.push(n) },
      createElement: (tag) => el(tag, {}),
      createElementNS: (_ns, tag) => el(tag, {}),
      querySelectorAll: () => [have, lack],
      addEventListener() {},
    },
  };
  ctx.window = ctx;
  vm.runInNewContext(read(spec.out), ctx);
  ctx.KiwiIcon.render(ctx.document);
  ok(have.replaced && have.replaced.getAttribute('data-material-symbol') === 'check', 'the subset draws a glyph it carries');
  ok(lack.replaced === null && injected.length === 1 && injected[0].src === 'assets/material-icons.js?v=9', `a glyph it lacks ("${absent}") loads the full runtime from data-full and keeps its placeholder`);
  ctx.KiwiIcon.render(ctx.document);
  ok(injected.length === 1, 'the full runtime is asked for once');
  ok(/^<i data-icon="/.test(ctx.KiwiIcon.svg(absent, 20)), 'KiwiIcon.svg() hands back a placeholder for it, not a "?"');
  injected[0].onerror();
  ok(lack.replaced && lack.replaced.getAttribute('data-material-symbol') === absent && ctx.KiwiIcon.missing.includes(absent), 'offline, it falls back to the ? glyph and says so');
}

// 5 · the pages load the Outlined runtime, nobody loads the Rounded shim
ok(!existsSync(path.join(ROOT, 'assets/lucide.min.js')), 'assets/lucide.min.js (the Rounded shim) is gone');
const stillLucide = files.filter((f) => /lucide\.min\.js/.test(read(f)) && !f.startsWith('functions/'));
ok(!stillLucide.length, stillLucide.length ? `still loading lucide.min.js: ${stillLucide.join(', ')}` : 'no page or script asks for lucide.min.js');
for (const page of ['kiwi-caisse.html', 'kiwi-serveur.html', 'dashboard.html', 'cafe-atlas-qr.html']) {
  ok(/<script src="assets\/material-icons\.js\?v=\d+" defer><\/script>/.test(read(page)), `${page} loads assets/material-icons.js`);
}
ok(/<script src="assets\/material-icons\.ordering\.js\?v=\d+" data-full="assets\/material-icons\.js\?v=\d+" defer><\/script>/.test(read('OrderPro.html')),
  'OrderPro.html loads the ordering subset, and names the full runtime for a glyph it lacks');
ok(/'\/assets\/material-icons\.js\?v=\d+'/.test(read('kiwi-sw.js')), 'the service worker precaches the runtime, so the till draws icons offline');
const pagesWithIcons = files.filter((f) => f.endsWith('.html') && !f.includes('/') && /data-(lucide|icon)\s*=/.test(read(f)));
const blind = pagesWithIcons.filter((f) => !/assets\/material-icons\.js/.test(read(f)));
ok(!blind.length, blind.length ? `pages with icon placeholders but no runtime: ${blind.join(', ')}` : 'every page that writes an icon placeholder loads the runtime');

// 6 · the ratchet: no file gains a data-lucide
const baseline = JSON.parse(read(BASELINE_FILE));
const grew = [];
const shrank = [];
let total = 0;
// Count moved waiter call sites at their original path; the split proof checks every byte.
// Preserve the same icon ceiling across the caisse's byte-exact move.
const caisseParts = new Set(JSON.parse(read('tools/fixtures/caisse-app/workflows.json')).files);
const serveurParts = new Set([...serveurSource.fragments().map(m => m.file), JSON.parse(read('tools/fixtures/serveur/split.json')).bundle]);
// Count extracted caisse and core code at its original owner.
const coreParts = new Set(['assets/daterange/renderers.js', 'assets/agent/ui.js',
  ...JSON.parse(read('tools/fixtures/venues-split/split.json')).parts]);
for (const f of files.filter(file => !serveurParts.has(file) && !caisseParts.has(file) && !coreParts.has(file))) {
  const n = countDataLucide(f === 'assets/serveur-app.js' ? serveurSource() : f === 'assets/caisse-app.js' ? caisseWorkflowSource.appSource() : coreTestSource.readFileSync(path.join(ROOT, f), 'utf8'));
  total += n;
  const was = baseline[f] || 0;
  if (n > was) grew.push(`${f} ${was} → ${n}`);
  else if (n < was) shrank.push(f);
}
ok(!grew.length, grew.length
  ? `new data-lucide (write <i data-icon="material_name">, see ${DOC}): ${grew.join(', ')}`
  : `no new data-lucide (${total} left in ${Object.keys(baseline).length} files)`);
if (shrank.length) console.log(`  · fewer data-lucide in ${shrank.join(', ')}: lock it in with node tools/build-material-icons.mjs --ratchet`);

// 7 · the dashboard shell draws no icon by hand: its last 23 stroke-drawn
// <svg> became vendored Material paths (2026-10-11 and 2026-10-12).
const handDrawn = (read('dashboard.html').match(/<svg\b[^>]*\bstroke="currentColor"/g) || []).length;
ok(handDrawn === 0, handDrawn ? `dashboard.html still draws ${handDrawn} icon(s) by hand: use the vendored Material path` : 'dashboard.html draws no icon by hand');

console.log(`\nmaterial-icons-test · ${checks} checks green`);
