#!/usr/bin/env node
/* « Demander une démo » on the landing (assets/landing-demo-funnel.js), and
 * #0169/#0170 boutique inventory on a phone.
 *
 * The sheet used to be five steps ending in a WhatsApp message the visitor
 * still had to send; a request filled in and never sent reached nobody. It is
 * now one short form posted to /api/demo-request (stored in D1, shown in the
 * operator console), with WhatsApp kept as the fallback when the server
 * cannot take it. The server side is tools/demo-request-api-test.mjs.
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
    window, console, JSON, Object, Array, String, Number, Date, Math, RegExp, encodeURIComponent, setTimeout, clearTimeout,
    requestAnimationFrame: (f) => f(),
    location: { pathname: '/' + lang + '/', search: '', hash: '' },
    localStorage: { getItem: () => null },
    sessionStorage: { getItem: (k) => store[k] ?? null, setItem: (k, v) => { store[k] = v; }, removeItem: (k) => { delete store[k]; } },
    document: { documentElement: { getAttribute: (a) => (a === 'lang' ? lang : null) }, addEventListener() {}, currentScript: null },
  };
  window.window = window;
  vm.createContext(ctx);
  vm.runInContext(read('assets/trades.js'), ctx);
  vm.runInContext(read('assets/landing-demo-funnel.js'), ctx);
  return window;
}

const src = read('assets/landing-demo-funnel.js');
const css = read('assets/landing-demo-funnel.css');
const W = load('fr');
const F = W.KiwiDemoFunnel;
const keys = (o, p = '') => Object.keys(o).sort().flatMap((k) => (o[k] && typeof o[k] === 'object' && !Array.isArray(o[k]) ? keys(o[k], p + k + '.') : [p + k]));
const fill = (F, v) => Object.assign(F._state(), { firstName: '', business: '', family: '', trade: '', phone: '', email: '', day: '', part: '', note: '', website: '' }, v);

ok('copy exists in French, English and Arabic with the same keys', () => {
  assert.deepEqual(Object.keys(F.STR).sort(), ['ar', 'en', 'fr']);
  assert.deepEqual(keys(F.STR.en), keys(F.STR.fr));
  assert.deepEqual(keys(F.STR.ar), keys(F.STR.fr));
});
ok('no em dash and no italics in the copy or the sheet', () => {
  assert.doesNotMatch(src, /—/);
  assert.doesNotMatch(css, /—|font-style:\s*italic/);
});
ok('one mint filled button, the rest quiet; the sheet is dark like the landing', () => {
  assert.match(css, /\.kdf-primary \{ border: 0; background: var\(--kdf-mint\); color: var\(--kdf-mint-ink\); \}/);
  assert.match(css, /\.kdf-secondary \{ border: 1px solid var\(--kdf-line-strong\); background: transparent;/);
  assert.match(css, /--kdf-bg: #0A0F0D;/);
  assert.doesNotMatch(css, /#fff\b|#ffffff/i);
});
ok('a bottom sheet on a phone, a centred dialog elsewhere; reduced motion respected', () => {
  assert.match(css, /@media \(max-width: 620px\) \{\n  \.kdf-back \{ align-items: flex-end; padding: 0; \}/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
});
ok('icons are vendored Material Symbols that exist on disk', () => {
  const used = [...src.matchAll(/icon: '([a-z_]+)'|icon\('([a-z_]+)'\)/g)].map((m) => m[1] || m[2]);
  assert.ok(used.length >= 4);
  for (const n of new Set(used)) assert.ok(fs.existsSync(new URL('../assets/icons/material/' + n + '.svg', import.meta.url)), n);
});
ok('the precise trade comes from trades.js, not a copy', () => {
  assert.ok(W.KiwiTrades.LIST.length >= 18);
  assert.match(src, /window\.KiwiTrades && window\.KiwiTrades\.LIST/);
});
ok('nothing is sent until the four required fields are there; email and phone are checked', () => {
  fill(F, {});
  assert.deepEqual(Object.keys(F._validate()).sort(), ['business', 'family', 'firstName', 'phone']);
  fill(F, { firstName: 'Salma', business: 'TEST KIWI Café', family: 'restaurant', phone: '06 12', email: 'x@' });
  assert.deepEqual(Object.keys(F._validate()).sort(), ['email', 'phone']);
  fill(F, { firstName: 'Salma', business: 'TEST KIWI Café', family: 'restaurant', phone: '+212 6 12 34 56 78' });
  assert.deepEqual(Object.keys(F._validate()), []);
});
ok('the payload is what the server reads; the family stands in for an unpicked trade', () => {
  fill(F, { firstName: ' Salma ', business: 'TEST KIWI Café', family: 'restaurant', phone: '0612345678', day: 'tomorrow', part: 'morning' });
  const p = F._payload();
  assert.deepEqual([p.firstName, p.trade, p.day, p.part, p.lang, p.page, p.website], ['Salma', 'restaurant', 'tomorrow', 'morning', 'fr', '/fr/', '']);
  F._state().trade = 'cafe';
  assert.equal(F._payload().trade, 'cafe');
});
ok('the WhatsApp fallback carries every answer and the reference when there is one', () => {
  fill(F, { firstName: 'Salma', business: 'TEST KIWI Café', family: 'restaurant', trade: 'cafe', phone: '0600000000', day: 'tomorrow', part: 'afternoon', note: 'Le stock' });
  const text = F._waText('D-1310-ABCD');
  for (const bit of ['Salma', 'TEST KIWI Café', 'Café', 'demain, après-midi', '0600000000', 'Le stock', 'D-1310-ABCD']) assert.ok(text.includes(bit), bit);
  const en = load('en').KiwiDemoFunnel;
  fill(en, { firstName: 'Sam', business: 'TEST KIWI', family: 'boutique', phone: '0600000000' });
  assert.doesNotMatch(en._waText(''), / : /, 'English uses "Name: x", not the French spacing');
});
ok('posts to /api/demo-request with a deadline; a server refusal falls back to WhatsApp', () => {
  assert.match(src, /var API = '\/api\/demo-request';/);
  assert.match(src, /setTimeout\(function \(\) \{ if \(controller\) controller\.abort\(\); \}, 15000\)/);
  assert.match(src, /if \(res\.status === 400 && res\.body && res\.body\.field\)/);
  assert.match(src, /phase = 'failed';/);
});
ok('the honeypot is out of reach for people and never saved', () => {
  assert.match(src, /class="kdf-trap" aria-hidden="true"><label>Website<input tabindex="-1" autocomplete="off" data-field="website"/);
  assert.match(src, /if \(f !== 'website'\) save\(\);/);
});
ok('never claims a booked appointment, only a call to confirm', () => {
  for (const l of ['fr', 'en', 'ar']) assert.ok(F.STR[l].doneSteps && F.STR[l].doneSteps.length === 3, l);
  assert.doesNotMatch(F.STR.fr.doneLead + F.STR.fr.doneSteps.join(' '), /réservé|rendez-vous confirmé/i);
});
ok('the existing business number is kept, and only demo buttons open the sheet', () => {
  assert.match(src, /var WA = '212624495159';/);
  assert.match(src, /var DEMO = \/d\[ée\]mo\|عرض\/i;/);
  assert.match(src, /if \(href\.indexOf\('\?'\) >= 0\) return;/);
  assert.match(src, /a\[data-kiwi-demo\]/);
});
ok('?demo=1 opens the sheet on arrival and closing drops it from the address', () => {
  assert.match(src, /if \(\/\[\?&\]demo=1\(\?:&\|\$\)\/\.test\(location\.search\)\) \{\n      var go/);
  assert.match(src, /history\.replaceState\(history\.state, ''/);
});
ok('a dialog with a title, a focus trap and Escape', () => {
  assert.match(src, /role="dialog" aria-modal="true" aria-labelledby="kdf-title"/);
  assert.equal((src.match(/id="kdf-title"/g) || []).length, 3, 'form, done and failed each name the dialog');
  assert.match(src, /if \(e\.key === 'Escape'\)/);
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
ok('#0170 product sheet shows purchase cost, stock value and sold-out variants', () => {
  assert.match(pp, /function _bqxSummaryHtml\(p, data\)/);
  assert.match(pp, /\$\{_bqxSummaryHtml\(p, data\)\}/);
  assert.match(pp, /const priceSub = cost == null \? t\.costNone/);
  assert.match(pp, /out \? `\$\{t\.variants\(n\)\} · \$\{t\.outN\(out\)\}`/);
  assert.match(pp, /\$\{stock \? '' : `<span class="bqx-vr-out">\$\{_esc\(t\.out\)\}<\/span>`\}/);
});
ok('#0170 variants are cards with the stepper in reach on a phone', () => {
  assert.match(pp, /<ul class="bqx-vlist">/);
  assert.match(pp, /<li class="bqx-vr\$\{stock \? '' : ' is-out'\}"/);
  assert.match(cw, /\.bqx-stk>button \{ width:40px;height:40px;/);
  assert.match(cw, /\.kiwi-drawer-foot \[data-action="bqx-prod-edit"\] \{ grid-column:1\/-1;order:-1;/);
});

console.log(`\nlanding-demo-funnel: ${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
