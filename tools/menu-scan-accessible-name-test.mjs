import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const root = process.env.KIWI_VISION_TEST_ROOT || '..';
const read = (p) => fs.readFileSync(new URL(root + '/' + p, import.meta.url), 'utf8');
const scan = read('assets/menu-scan.js'), i18n = read('assets/i18n.js');
assert.match(scan, /<input type="url"[^>]*data-i18n-attr="aria-label:menuScan.urlLabel"[^>]*aria-label="/);
assert.match(scan, /esc\(dashboardText\('urlLabel'\)\)/);
for (const locale of ['en', 'ar']) {
  const section = i18n.split(locale + ': {')[1].split('\n    },')[0];
  for (const key of ['urlLabel', 'truncated', 'conflicts']) assert.ok(section.includes('"menuScan.' + key + '"'), locale + ' translated ' + key);
}
assert.match(scan, /KiwiI18n\?\.T\?\.\[language\(\)\]/);
console.log('✓ URL accessible name uses dashboard EN/AR translations; review notices translated');

// Render the actual controller with the real dashboard translations.
const start = i18n.indexOf('const T = '), end = i18n.indexOf('\n  };', start);
const T = vm.runInNewContext(i18n.slice(start, end + 5) + '; T;');
for (const lang of ['en', 'ar']) {
  let rendered;
  const stage = { set innerHTML(v) { rendered = v; } };
  const Kiwi = { modal: () => ({ close() {}, el: {
    setAttribute() {}, addEventListener() {}, querySelector(q) { return q === '[data-kms-stage]' ? stage : null; },
  } }) };
  const window = { Kiwi, KiwiI18n: { T, getLang: () => lang }, KiwiMenuScanReader: {}, KiwiCatalogImport: { openMenuWithCsv() {} } };
  const context = { window, Kiwi, KiwiCatalogImport: window.KiwiCatalogImport, document: { getElementById: () => true, documentElement: { lang } }, localStorage: { getItem: () => lang } };
  vm.runInNewContext(scan, context);
  window.KiwiMenuScan.open();
  assert.ok(rendered.includes('aria-label="' + T[lang]['menuScan.urlLabel'] + '"'), lang + ' rendered accessible name');
}
