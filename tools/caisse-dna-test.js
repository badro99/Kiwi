#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const js = read('assets/caisse-dna.js');
const css = read('assets/caisse-dna.css');
const page = read('kiwi-caisse.html');
const sw = read('kiwi-sw.js');
const dispatch = read('assets/pos-dispatch.js');
let passed = 0;
const failed = [];
const ok = (label, condition) => condition ? passed++ : failed.push(label);

const dispatchMatch = page.match(/assets\/pos-dispatch\.js\?v=(\d+)/);
ok('shared visual DNA is loaded after the dispatcher and before operator use',
  !!dispatchMatch &&
  sw.includes(`'/assets/pos-dispatch.js?v=${dispatchMatch[1]}'`) &&
  page.includes('assets/caisse-dna.css?v=3') &&
  page.includes('assets/caisse-dna.js?v=2'));
ok('shared visual DNA remains available offline',
  sw.includes("'/assets/caisse-dna.css?v=3'") && sw.includes("'/assets/caisse-dna.js?v=2'"));
ok('dispatcher enhances only after the vertical has mounted its own controls',
  dispatch.indexOf('spec.mount(root)') < dispatch.indexOf('KiwiCaisseDna.enhance(root, id)') &&
  dispatch.indexOf('KiwiPosWorkspaces.mount(root, id)') < dispatch.indexOf('KiwiCaisseDna.enhance(root, id)'));
ok('the enhancer does not touch tenant, auth, catalog, sale or network state',
  !/localStorage|sessionStorage|fetch\s*\(|XMLHttpRequest|KiwiPosSale|KiwiBoutiqueCatalog|merchant|tenant|pin/i.test(js));
ok('the enhancer does not remove, replace, move or click an existing control',
  !/\.remove\s*\(\s*\)|removeChild|replaceChild|replaceWith|appendChild\(button|\.click\s*\(|addEventListener\s*\(/.test(js));
ok('restaurant-level rail anatomy is present',
  ['kiwi-dna-service', 'kiwi-dna-venue', 'kiwi-dna-clock', 'kiwi-dna-primary', 'kiwi-dna-secondary']
    .every((name) => js.includes(name) && css.includes(name)));
ok('late workspace and client buttons are reclassified without rebinding clicks',
  js.includes("observer.observe(nav, { childList: true })") && js.includes('classifyNav(nav)'));
ok('Santos boutique keeps its absolute content offset tied to the enhanced rail',
  css.includes('#pos-boutique.kiwi-dna > .kiwi-dna-main') && css.includes('left: var(--kiwi-dna-rail-w)') &&
  css.includes('.kiwi-rtl #pos-boutique.kiwi-dna > .kiwi-dna-main'));
ok('the generic caisse grid follows the enhanced rail width',
  css.includes('#pos-autre.kiwi-dna .ot-app') && css.includes('grid-template-columns: var(--kiwi-dna-rail-w)') &&
  css.includes('@media (max-width: 800px)'));
ok('specialist product pickers expose more choices on common laptop tills',
  css.includes('@media (min-width: 801px) and (max-width: 1366px)') &&
  css.includes('#pos-boutique.kiwi-dna .bq-grid') &&
  css.includes('#pos-pharmacie.kiwi-dna .ph-grid') &&
  css.includes('minmax(112px, 1fr)') && css.includes('minmax(124px, 1fr)'));
ok('the skin stays inside the locked Kiwi palette',
  !/#(?!0A0F0D|7DF2B0|F7F5F0|0B6E4F|053B2C)[0-9A-Fa-f]{6}\b/.test(css));
ok('the skin introduces no italic type', !/font-style\s*:\s*italic/.test(css));

const entries = [...dispatch.matchAll(/id:\s*'([^']+)',\s+file:\s*'([^']+)'/g)];
ok('every dispatched non-restaurant type remains registered', entries.length === 16);
entries.forEach(([, id, file]) => {
  const module = read(`assets/${file}.js`);
  ok(`${id} still owns a native rail for visual enhancement`, /<aside class=["'`][^"'`]*-rail/.test(module));
});

if (failed.length) {
  failed.forEach((label) => console.error('  ✗ ' + label));
  process.exit(1);
}
console.log(`✓ ${passed} caisse DNA checks green (all verticals, Santos-safe)`);
