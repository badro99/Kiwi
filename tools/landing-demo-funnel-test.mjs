#!/usr/bin/env node
/* Ticket #0171 · landing demo request, and #0169/#0170 boutique inventory on a phone.
 *
 *   node tools/landing-demo-funnel-test.mjs
 */
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const read = (p) => fs.readFileSync(new URL('../' + p, import.meta.url), 'utf8');
let passed = 0, failed = 0;
function ok(label, fn) {
  try { fn(); passed++; console.log(`  ✓ ${label}`); }
  catch (e) { failed++; console.log(`  ✗ ${label}\n      ${String(e.message).split('\n')[0]}`); }
}

function load(lang) {
  const store = {};
  const window = {};
  const ctx = {
    window, console, JSON, Object, Array, String, Number, Date, Math, encodeURIComponent, setTimeout, requestAnimationFrame: (f) => f(),
    localStorage: { getItem: () => null },
    sessionStorage: { getItem: (k) => store[k] ?? null, setItem: (k, v) => { store[k] = v; } },
    document: { documentElement: { getAttribute: (a) => (a === 'lang' ? lang : null) }, addEventListener() {} },
  };
  window.window = window;
  vm.createContext(ctx);
  vm.runInContext(read('assets/trades.js'), ctx);
  vm.runInContext(read('assets/landing-demo-funnel.js'), ctx);
  return window;
}

const src = read('assets/landing-demo-funnel.js');
const W = load('fr');
const F = W.KiwiDemoFunnel;
const keys = (o, p = '') => Object.keys(o).sort().flatMap((k) => (o[k] && typeof o[k] === 'object' && !Array.isArray(o[k]) ? keys(o[k], p + k + '.') : [p + k]));

ok('copy exists in French, English and Arabic with the same keys', () => {
  assert.deepEqual(Object.keys(F.STR).sort(), ['ar', 'en', 'fr']);
  assert.deepEqual(keys(F.STR.en), keys(F.STR.fr));
  assert.deepEqual(keys(F.STR.ar), keys(F.STR.fr));
});
ok('no em dash and no italics in the copy or the sheet', () => {
  assert.doesNotMatch(src, /—/);
  assert.doesNotMatch(read('assets/landing-demo-funnel.css'), /—|font-style:\s*italic/);
});
ok('business types are the product list from trades.js, not a copy', () => {
  assert.ok(W.KiwiTrades.LIST.length >= 18);
  assert.match(src, /window\.KiwiTrades && window\.KiwiTrades\.LIST/);
});
ok('five steps, answers kept in the tab between steps', () => {
  assert.match(src, /var STEPS = 5;/);
  assert.match(src, /sessionStorage\.setItem\(STORE/);
});
ok('the WhatsApp message carries every answer and says the slot is to be confirmed', () => {
  Object.assign(F._state(), { first: 'Salma', biz: 'TEST KIWI Café', trade: 'cafe', loc: '1', team: 'exact', teamExact: '8', pains: ['stock', 'retention'], date: '2026-10-14', time: '10:30', phone: '0600000000' });
  const text = F._waText();
  for (const bit of ['Salma', 'TEST KIWI Café', 'Café / Salon de thé', '1 établissement', '8 personnes', 'Écarts de stock', '10:30', 'à confirmer', '0600000000']) assert.ok(text.includes(bit), bit);
});
ok('the existing business number is kept, and only demo buttons open the sheet', () => {
  assert.match(src, /var WA = '212624495159';/);
  assert.match(src, /var DEMO = \/d\[ée\]mo\|عرض\/i;/);
  assert.match(src, /if \(href\.indexOf\('\?'\) >= 0\) return;/);
});
ok('never claims a booked appointment', () => {
  for (const l of ['fr', 'en', 'ar']) assert.ok(F.STR[l].pending && F.STR[l].wa.when, l);
  assert.doesNotMatch(F.STR.fr.doneLead + F.STR.fr.doneNext2, /réservé|confirmé\b/i);
});
ok('the send button is never rebuilt by a field change on the last step', () => {
  assert.match(src, /if \(rec\) rec\.outerHTML = recapHtml\(\);/);
});
const pages = ['index.html', 'fr/index.html', 'en/index.html', 'ar/index.html', 'de/index.html', 'es/index.html', 'it/index.html', 'nl/index.html'];
ok('every landing page loads trades.js, the sheet script and its stylesheet', () => {
  for (const p of pages) {
    const h = read(p);
    assert.match(h, /<script src="\/assets\/trades\.js\?v=\d+" defer><\/script><script src="\/assets\/landing-demo-funnel\.js\?v=\d+" defer><\/script>/, p);
    assert.match(h, /href="\/assets\/landing-demo-funnel\.css\?v=\d+"/, p);
  }
});

const pp = read('assets/pages-pro.js');
const cw = read('assets/catalog-workspace.css');
ok('#0169 inventory toolbar wraps on a phone, new product first', () => {
  assert.match(pp, /class="p-toolbar bqx-toolbar"/);
  assert.match(cw, /\.p-toolbar\.bqx-toolbar \{ display:flex!important;flex-wrap:wrap!important;/);
  assert.match(cw, /\.bqx-toolbar>\.kb\.primary \{ flex-basis:100%!important;order:-1; \}/);
});
ok('#0170 product sheet shows purchase price, stock value and sold-out sizes', () => {
  assert.match(pp, /function _bqxFactsHtml\(p, data, cost\)/);
  assert.match(pp, /\$\{_bqxFactsHtml\(p, data, cost\)\}/);
  assert.match(pp, /cost == null \? 'Non renseigné'/);
});
ok('#0170 variants become cards with the stepper in reach on a phone', () => {
  assert.match(cw, /\.bqx-vtable thead \{ display:none!important; \}/);
  assert.match(cw, /\.bqx-vtable tr \{ display:grid!important;/);
  assert.match(cw, /\.kiwi-drawer-foot \[data-action="bqx-prod-edit"\] \{ grid-column:1\/-1;order:-1;/);
});

console.log(`\nlanding-demo-funnel: ${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
