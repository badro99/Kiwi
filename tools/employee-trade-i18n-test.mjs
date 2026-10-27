#!/usr/bin/env node
/* App employé · l'espace métier parle la langue de la page et n'utilise que
 * Material Symbols.
 *
 * Vague 14, voie A. Les libellés de métier et leurs quatre repères
 * (« Boulangerie », « Fournil », « Invendus »…) restaient en français sous EN
 * et AR, et la coquille posait des icônes `data-lucide` alors que la règle du
 * dépôt est Google Material Symbols seul. On monte ici la vraie coquille dans
 * une page factice, dans les trois langues, pour chacun des métiers.
 *   node tools/employee-trade-i18n-test.mjs
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = process.env.KIWI_ROOT || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = fs.readFileSync(path.join(ROOT, 'assets/employee-trade-shell.js'), 'utf8');
let passed = 0;
function ok(label, fn) { fn(); passed++; console.log(`  ok  ${label}`); }

function boot(lang) {
  const mounted = [];
  const listeners = {};
  const tab = { insertBefore(node) { mounted.push(node); } };
  const navFirst = { attrs: {}, setAttribute(k, v) { this.attrs[k] = v; }, set innerHTML(v) { this.nav = v; }, get innerHTML() { return this.nav; } };
  const document = {
    documentElement: { lang },
    body: { classList: { add() {}, remove() {} } },
    addEventListener(name, fn) { listeners[name] = fn; },
    getElementById() { return null; },
    createElement() { return { dataset: {}, addEventListener() {}, set innerHTML(v) { this.html = v; }, get innerHTML() { return this.html || ''; } }; },
    querySelector(sel) { return sel === '.tab-tables' ? tab : sel === '.bt-btn[data-tab="tables"]' ? navFirst : null; },
  };
  const drawn = [];
  const window = { addEventListener() {}, KiwiIcon: { render: () => drawn.push(1) } };
  vm.runInNewContext(source, { window, document, Date, Intl, String, Object, Array, Number, setTimeout, setInterval() {} });
  return { api: window.KiwiEmployeeTradeShell, mounted, navFirst, drawn };
}
const data = (type) => ({ employee: { id: 'e1', firstName: 'Salma', role: 'Vendeuse' }, store: { type, name: 'Maison Test' }, schedule: {}, planning: {}, colleagues: [], messages: [], attendance: {} });
const ARABIC = /[؀-ۿ]/;

console.log('employee trade shell · labels and steps follow the page language');
const fr = boot('fr').api;
for (const id of fr.trades) {
  for (const lang of ['fr', 'en', 'ar']) {
    ok(`${id} · ${lang}: label and four steps, all non-empty`, () => {
      const t = boot(lang).api.tradeText(id);
      assert.ok(t.label && t.steps.length === 4 && t.steps.every(Boolean));
      if (lang === 'ar') assert.ok(ARABIC.test(t.label) && t.steps.every((s) => ARABIC.test(s)), 'Arabic label and steps');
    });
  }
  ok(`${id}: the English steps are not the French ones`, () => {
    const en = boot('en').api.tradeText(id);
    const f = fr.tradeText(id);
    assert.ok(en.steps.some((s, i) => s !== f.steps[i]) || en.label !== f.label, 'something is translated');
  });
}
ok('the bakery from the review reads in English and Arabic', () => {
  const en = boot('en').api.tradeText('bakery');
  assert.deepEqual([en.label, ...en.steps].join('|'), 'Bakery|Counter|Bakehouse|Orders|Unsold items');
  assert.ok(ARABIC.test(boot('ar').api.tradeText('bakery').steps[1]));
});

console.log('employee trade shell · the mounted page');
for (const [lang, expect] of [['fr', /Boulangerie/], ['en', /Bakery/], ['ar', /مخبزة/]]) {
  ok(`${lang}: mount() writes the translated label and the Material icon, no lucide`, () => {
    const b = boot(lang);
    b.api.mount(data('bakery'));
    assert.equal(b.mounted.length, 1);
    const html = b.mounted[0].innerHTML;
    assert.match(html, expect);
    assert.match(html, /data-icon="bakery_dining"/);
    assert.ok(!/lucide/i.test(html), 'no Lucide name in the markup');
    assert.ok(!/lucide/i.test(b.navFirst.innerHTML || ''), 'nor in the tab bar');
    if (lang !== 'fr') assert.ok(!/Fournil|Invendus/.test(html), 'no French step left');
    assert.ok(b.drawn.length >= 1, 'icons are drawn through KiwiIcon');
  });
}
ok('no data-lucide or Lucide global anywhere in the shell source', () => {
  assert.ok(!/lucide/i.test(source));
});
ok('every icon the shell names is a vendored Material Symbols file', () => {
  for (const id of fr.trades) {
    const icon = fr.tradeIcon(id);
    assert.ok(fs.existsSync(path.join(ROOT, 'assets/icons/material', icon + '.svg')), `${id}: ${icon}`);
  }
  for (const icon of ['refresh', 'calendar_month', 'event_available', 'event_busy', 'chat', 'restaurant']) {
    assert.ok(fs.existsSync(path.join(ROOT, 'assets/icons/material', icon + '.svg')), icon);
    assert.ok(source.includes(`"${icon}"`) || source.includes(`'${icon}'`) || source.includes(`data-icon="${icon}"`), `${icon} used`);
  }
});

console.log(`\n${passed} passed`);
