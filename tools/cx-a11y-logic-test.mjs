import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import * as KiwiZoneLaw from '../functions/api/_zone-law.js';
import { spawnSync } from 'node:child_process';
const require = createRequire(import.meta.url), ts = require('../app/node_modules/typescript');
const read = f => { if (process.env.KIWI_CX_HEAD) { const r = spawnSync('git', ['show', 'HEAD:' + f], { encoding: 'utf8' }); if (r.status) throw new Error('HEAD lacks ' + f); return r.stdout; } return fs.readFileSync(f, 'utf8'); };
// Execute production function declarations, extracted with the parser, without booting a till.
function fn(file, name, globals = {}) {
  const src = read(file), ast = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true);
  let found;
  (function visit(n) { if (ts.isFunctionDeclaration(n) && n.name?.text === name) found = n.getText(ast); ts.forEachChild(n, visit); })(ast);
  assert.ok(found, name);
  return vm.runInNewContext('(' + found.replace(/^export\s+/, '') + ')', globals);
}
let failed = 0;
async function test(name, run) { try { await run(); console.log('PASS ' + name); } catch (e) { failed++; console.error('FAIL ' + name + ': ' + e.message); } }
let promoDictCache;
function promoDict() {
  // The promo strings live in assets/i18n.js as Object.assign(T.<lang>, {...}) JSON blocks.
  if (promoDictCache) return promoDictCache;
  promoDictCache = {};
  for (const m of read('assets/i18n.js').matchAll(/Object\.assign\(T\.(fr|en|ar), (\{"promos\.[^\n]*?\})\);/g)) Object.assign(promoDictCache[m[1]] ||= {}, JSON.parse(m[2]));
  return promoDictCache;
}
await test('invalid purchase dates are undated, including normalized impossible dates', () => {
  const ctx = vm.createContext({ STALE_DAYS: 90 });
  vm.runInContext(read('assets/simple-food-cost/calc.js') + '\nthis.compute = compute;', ctx);
  for (const priceDate of ['garbage', '2026-02-30']) {
    const r = ctx.compute({ lines: [{ packPrice: 5, packQty: 1, useQty: 1, priceDate }] }, { today: '2026-11-04' });
    assert.equal(r.lines[0].undated, true); assert.equal(r.lines[0].age, null);
  }
});
await test('isolated calculation follows merchant 05:00 boundary and Morocco zone law', () => {
  let at = Date.parse('2026-11-04T04:30:00Z');
  class Clock extends Date { constructor(...a) { super(...(a.length ? a : [at])); } static now() { return at; } }
  const ctx = vm.createContext({ STALE_DAYS: 90, Date: Clock, Intl });
  ctx.KiwiZoneLaw = KiwiZoneLaw;
  vm.runInContext(read('assets/simple-food-cost/calc.js') + '\nthis.compute = compute;', ctx);
  const sheet = { lines: [{ packPrice: 5, packQty: 1, useQty: 1, priceDate: '2026-11-03' }] };
  assert.equal(ctx.compute(sheet).lines[0].age, 0);
  at = Date.parse('2026-11-04T05:00:00Z');
  assert.equal(ctx.compute(sheet).lines[0].age, 1);
  assert.equal(ctx.compute(sheet, { timeZone: 'America/New_York' }).lines[0].age, 0);
});
await test('all unresolved advance conflicts retained up to cap with explicit overflow', () => {
  const keepAdvanceConflicts = fn('functions/api/_credit-book-refund.js', 'keepAdvanceConflicts');
  const alerts = Array.from({ length: 27 }, (_, i) => ({ id: 'a' + i, kind: 'debt-on-advance', entryKey: 'k' + i }));
  const [c] = keepAdvanceConflicts([], [{ id: 'fixture', hist: [], creditAlerts: alerts }], []);
  assert.equal(c.creditAlerts.length, 27);
  const [large] = keepAdvanceConflicts([], [{ id: 'fixture', hist: [], creditAlerts: Array.from({ length: 1005 }, (_, i) => ({ ...alerts[0], id: 'a' + i, entryKey: 'k' + i })) }], []);
  assert.equal(large.creditAlerts.length, 1000); assert.equal(large.creditAlertsMore, 5);
});
await test('custom promo controls have translated accessible names', () => {
  for (const lang of [0, 1, 2]) {
    const code = ['fr', 'en', 'ar'][lang], T = promoDict();
    const tr = (key) => (T[code] && T[code][key]) || key;
    const scopeControl = fn('assets/boutique-promos-dashboard.js', 'scopeControl', { L: (...v) => v[lang], tr, toInput: () => '', esc: x => x });
    for (const type of ['avant', 'stock']) {
      const html = scopeControl({}, { scope: { type } });
      // Parse the actual rendered element, rather than inspect the production source.
      const input = ts.createSourceFile('render.tsx', '<>' + html + '</>', ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
      let name;
      (function walk(n) { if (ts.isJsxSelfClosingElement(n) || ts.isJsxOpeningElement(n)) for (const a of n.attributes.properties) if (a.name?.text === 'aria-label') name = a.initializer?.text; ts.forEachChild(n, walk); })(input);
      assert.ok(name && name.length > 2 && !/^promos\./.test(name), type + ' locale ' + lang + ': ' + name);
    }
  }
});
await test('correction timestamp uses refreshed merchant zone and Morocco law', () => {
  const nodes = [];
  const document = { documentElement: { lang: 'en' }, getElementById: (id) => id === 'main-content' ? { prepend() {} } : null, body: { prepend() {} }, createElement(tag) { const el = { tag, style: {}, setAttribute() {}, appendChild() {}, addEventListener() {} }; nodes.push(el); return el; } };
  const ctx = vm.createContext({ Intl }); ctx.KiwiZoneLaw = KiwiZoneLaw;
  for (const zone of ['Africa/Casablanca', 'Pacific/Auckland']) {
    nodes.length = 0;
    const at = Date.parse('2026-11-04T12:00:00Z');
    const render = fn('assets/employee-live.js', 'renderCorrections', { document, Date, lastData: { store: { timezone: zone } }, KiwiZoneLaw: ctx.KiwiZoneLaw, queueOwner: 'fixture', recovery: {}, records: () => [{ at, kind: 'clock-in' }], needsCorrection: () => true, correctionWords: () => ({ title: 'Correction', in: 'In', dismiss: 'Dismiss' }) });
    render();
    const label = nodes.find(n => n.tag === 'p').textContent;
    const expected = new ctx.KiwiZoneLaw.DateTimeFormat('en-GB', { timeZone: zone, year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(at);
    assert.equal(label, 'In · ' + expected);
  }
});
await test('floor discount renders named native buttons without changing its three cells', () => {
  const src = read('assets/caisse-floor.js'), ast = ts.createSourceFile('floor.js', src, ts.ScriptTarget.Latest, true);
  let template;
  (function walk(n) { if (ts.isTemplateExpression(n) && n.getText(ast).includes('rp-item--discount')) template = n.getText(ast); ts.forEachChild(n, walk); })(ast);
  const html = vm.runInNewContext(template, { tag: 'Remise 10 %', d: { reason: '' }, discAmt: 1, fmtMAD: () => '1,00' });
  const { DOMParser } = require('../app/node_modules/@xmldom/xmldom');
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const controls = [...Array.from(doc.getElementsByTagName('*'))].filter(n => n.getAttribute('data-action') === 'edit-discount');
  assert.equal(controls.length, 3);
  for (const el of controls) { assert.equal(el.tagName, 'button'); assert.equal(el.getAttribute('type'), 'button'); assert.ok(el.getAttribute('aria-label')); }
});
await test('Maison delegates reward arithmetic to the shared rule with centime inputs', () => {
  let calls = 0;
  const reward = { clientId: 'fixture', kind: 'percent', value: 15 };
  const discount = fn('assets/pos-maison.js', 'rewardDiscount', { loyaltyRewardDiscount: (...args) => { calls++; assert.equal(args[0], reward); assert.equal(args[1], 'fixture'); assert.equal(args[2], 12.55); assert.deepEqual(Array.from(args[3]), [12.55]); return 1.88; }, lineUnit: l => l.price });
  assert.equal(discount({ reward, client: 'fixture', lines: [{ price: 12.55 }] }, 12.55), 1.88); assert.equal(calls, 1);
});
await test('briefing evidence cuts on whitespace and preserves the complete thresholds', () => {
  const thresholdEvidence = fn('assets/briefing.js', 'thresholdEvidence', { GROUPS: { 0: ['test'] }, LIMITS: { test: [0, 0, 0, 'Test', 'Test', 'اختبار'] }, lang: () => 'fr', num: () => '5', shown: () => 5 });
  const text = 'Short evidence ' + 'x'.repeat(500);
  const result = thresholdEvidence({ kind: 'sales-drop', evidence: { source: 'fixture', text: { fr: text, en: text, ar: text } } });
  for (const value of Object.values(result.evidence.text)) { assert.ok(value.length <= 400); assert.ok(value.startsWith('Short evidence… · ')); assert.ok(value.endsWith('5')); }
  const grouped = 'Purchase ' + Array.from({ length: 200 }, () => '123').join(' ');
  const number = thresholdEvidence({ kind: 'sales-drop', evidence: { source: 'fixture', text: { en: grouped } } }).evidence.text.en;
  assert.equal(number.split('…')[0], 'Purchase', 'a grouped amount is never cut between its digit groups');
});
await test('KDS clock, check and serve icons use intact vendored Material paths', () => {
  const src = read('kiwi-cuisine.html');
  const start = src.indexOf('  var SVG = {'), end = src.indexOf('\n  };', start) + 5;
  const icons = vm.runInNewContext(src.slice(start, end) + '\nSVG');
  const { DOMParser } = require('../app/node_modules/@xmldom/xmldom');
  for (const [key, file] of [['clock','schedule'], ['check','check'], ['hand','room_service']]) {
    const actual = new DOMParser().parseFromString(icons[key], 'image/svg+xml');
    const expected = new DOMParser().parseFromString(read('assets/icons/material/' + file + '.svg'), 'image/svg+xml');
    assert.equal(actual.documentElement.getAttribute('fill'), 'currentColor');
    assert.equal(actual.documentElement.getAttribute('viewBox'), expected.documentElement.getAttribute('viewBox'));
    assert.deepEqual(Array.from(actual.getElementsByTagName('path'), p => p.getAttribute('d')), Array.from(expected.getElementsByTagName('path'), p => p.getAttribute('d')));
  }
});

await test('weekday focus paints the visible control using the existing token', () => {
  const { parse } = require('./kit-css.js');
  const rule = parse(read('assets/planning-ui.css')).rules.find(r => r.selectors.includes('.kt-plan-weekdays input:focus-visible+span'));
  assert.ok(rule); assert.equal(rule.decls.find(d => d.prop === 'outline')?.value, '2px solid var(--atlas)');
});
await test('phone invoice targets gain 44px minima at the existing 620px breakpoint', () => {
  const { parse } = require('./kit-css.js');
  const rules = parse(read('assets/invoicing.css')).rules;
  const mobile = rules.filter(r => r.at === '@media (max-width: 620px)');
  for (const selector of ['.inv-overlay button', '.inv-overlay .inv-btn.small', '.inv-overlay input', '.inv-overlay select', '.inv-overlay .inv-line-row input', '.inv-overlay .inv-line-row select']) {
    const rule = mobile.find(r => r.selectors.includes(selector)); assert.ok(rule, selector);
    for (const prop of ['min-height', 'min-width']) assert.equal(rule.decls.find(d => d.prop === prop)?.value, '44px');
  }
  assert.equal(rules.find(r => !r.at && r.selectors.includes('.inv-btn.small')).decls.find(d => d.prop === 'min-height').value, '32px', 'desktop remains unchanged');
});

await test('overflow count is server-owned and visible in each translated credit card', () => {
  const union = fn('functions/api/_credit-book-store.js', 'unionBook', { clone: structuredClone });
  assert.equal(union([], [{ id: 'fixture', hist: [], creditAlertsMore: 99 }]).carnet[0].creditAlertsMore, undefined);
  assert.equal(union([{ id: 'fixture', hist: [], creditAlertsMore: 5 }], [{ id: 'fixture', hist: [], creditAlertsMore: 99 }]).carnet[0].creditAlertsMore, 5);
  for (const locale of [0, 1, 2]) {
    const cards = fn('assets/trade-workspaces.js', 'tillCards', { tillDoc: () => ({ carnet: [{ id: 'fixture', hist: [], creditAlertsMore: 5 }] }), owedOf: () => -1, oldestOpenDebt: () => null, refundAvailable: () => 100, pick: x => Array.isArray(x) ? x[locale] : x, L: (...v) => v, mad: String, when: () => '', TILL: {}, REFUND: {} });
    assert.ok(cards({ trade: 'epicerie', nav: 'credit' })[0].alert.includes('+5'));
  }
});
await test('briefing boot creates no style element', () => {
  let boot;
  const document = { readyState: 'loading', documentElement: { lang: 'fr' }, addEventListener(type, fn) { if (type === 'DOMContentLoaded') boot = fn; }, querySelector: () => null, head: { appendChild() {} }, createElement(tag) { assert.notEqual(tag, 'style'); return { setAttribute() {} }; } };
  const localStorage = { getItem: () => null, setItem() {} };
  const window = { document, localStorage, addEventListener() {}, KiwiEnv: { isReal: () => false }, KiwiCloudDoc: { currentSlug: () => 'fixture' }, KiwiDayReport: { businessDay: () => '2026-11-04' } };
  const ctx = vm.createContext({ window, document, localStorage, console, Date, Intl, setTimeout, clearTimeout });
  for (const file of ['briefing-rules.js', 'briefing-persistence.js', 'briefing.js']) vm.runInContext(read('assets/' + file), ctx);
  boot();
});

process.exitCode = failed ? 1 : 0;
