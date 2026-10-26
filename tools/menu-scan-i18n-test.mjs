import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

// Optional source path lets the same assertions prove the untouched HEAD fails.
const source = fs.readFileSync(process.argv[2] || 'assets/menu-scan.js', 'utf8');
let lang = 'fr', response = [], apiError = null, modal, stage, events, lastToast, review;
const doc = {
  documentElement: { lang: 'fr' }, head: { appendChild() {} },
  getElementById: () => true,
};
const Kiwi = {
  toast: (title, opts) => { lastToast = title + ' ' + opts.desc; },
  modal(opts) {
    stage = { innerHTML: '' }; events = {};
    const attrs = {}, closeAttrs = {};
    modal = {
      opts, attrs, closeAttrs, closed: false,
      close() { this.closed = true; },
      el: {
        setAttribute: (k, v) => { attrs[k] = v; },
        querySelector: (q) => q === '[data-kms-stage]' ? stage :
          q === '.kiwi-modal-close' ? { setAttribute: (k,v) => { closeAttrs[k] = v; } } :
          { value: 'sample menu' },
        addEventListener: (k, cb) => { events[k] = cb; },
      },
    };
    return modal;
  },
};
const importer = { openMenuWithCsv: (csv, opts) => { review = { csv, opts }; } };
const win = { Kiwi, KiwiCatalogImport: importer };
win.window = win;
const context = vm.createContext({
  window: win, document: doc, Kiwi, KiwiCatalogImport: importer, AbortController, setTimeout, clearTimeout,
  localStorage: { getItem: () => lang },
  fetch: async (_, opts) => {
    assert.equal(JSON.parse(opts.body).targetLang, lang);
    if (apiError) throw new Error(apiError);
    return { ok: true, status: 200, json: async () => ({ ok: true, items: response }) };
  },
});
// Expose only lexical copy for exhaustive key coverage, keeping the shipped API unchanged.
vm.runInContext(source.replace('window.KiwiMenuScan =', 'window.testCopy = typeof COPY === "undefined" ? null : COPY; window.testBusy = (key, params) => busyHtml(ui(key, params), ui("extract")); window.KiwiMenuScan ='), context);
assert.ok(win.testCopy, 'FR/EN/AR dictionary must exist');
const copy = win.testCopy;
for (const l of ['en', 'ar']) {
  assert.deepEqual(Object.keys(copy[l]).sort(), Object.keys(copy.fr).sort());
  for (const [key, value] of Object.entries(copy[l])) {
    assert.ok(value.trim(), l + ': ' + key);
    assert.notEqual(value, copy.fr[key], l + ': untranslated ' + key);
  }
}
function noFrench(output) {
  if (lang === 'fr') return;
  for (const value of Object.values(copy.fr)) {
    const fragment = value.split('{')[0];
    assert.ok(!output.includes(fragment), lang + ': French copy leaked: ' + fragment);
  }
}
function click(selector) {
  events.click({ target: { closest: (q) => q === selector ? {} : null } });
}
async function settle() { for (let i = 0; i < 30; i++) await Promise.resolve(); }
for (lang of ['fr', 'en', 'ar']) {
  win.KiwiMenuScan.open();
  assert.equal(modal.opts.title, copy[lang].title);
  assert.ok(modal.opts.foot.includes(copy[lang].cancel));
  assert.equal(modal.attrs.dir, lang === 'ar' ? 'rtl' : 'ltr');
  assert.equal(modal.closeAttrs['aria-label'], copy[lang].close);
  assert.ok(stage.innerHTML.includes(copy[lang].disclosure.replaceAll("'", '&#39;')));
  for (const key of ['drop', 'pick', 'camera', 'orLink', 'urlPlaceholder', 'readLink', 'paste']) {
    assert.ok(stage.innerHTML.includes(copy[lang][key]));
  }
  for (const key of ['pdf', 'photo', 'reading']) {
    const busy = win.testBusy(key, { n: 1, total: 2 });
    assert.ok(busy.includes(copy[lang].extract));
    assert.ok(!busy.includes('undefined'));
    noFrench(busy);
  }
  noFrench(stage.innerHTML + modal.opts.title + modal.opts.foot);
  click('[data-kms-paste]');
  noFrench(stage.innerHTML);
  for (const key of ['pasteLabel', 'sample', 'back', 'analyse']) {
    assert.ok(stage.innerHTML.includes(copy[lang][key]));
  }
  click('[data-kms-go-text]');
  noFrench(stage.innerHTML);
  await settle();
  assert.ok(lastToast.includes(copy[lang].unparsedTitle));
  noFrench(lastToast + stage.innerHTML);
  for (const error of ['auth', 'quota', 'js-only', 'url-fetch', 'url-status', 'unparsed', 'server', 'unknown']) {
    apiError = error;
    click('[data-kms-go-url]');
    noFrench(stage.innerHTML);
    await settle();
    noFrench(lastToast + stage.innerHTML);
  }
  apiError = null;
  response = [{ name: 'Merchant item', cat: 'Category', price: 95 }];
  const onDone = () => {};
  win.KiwiMenuScan.open({ onDone });
  click('[data-kms-go-text]');
  await settle();
  assert.ok(modal.closed);
  assert.ok(review.csv.includes('Merchant item;Category;;95'));
  assert.equal(review.opts.onDone, onDone);
  response = [];
  win.KiwiCatalogImport = null;
  win.KiwiMenuScan.open();
  assert.ok(lastToast.includes(copy[lang].unavailable));
  noFrench(lastToast);
  win.KiwiCatalogImport = importer;
}
// Source of truth and HTML fallback, with language resolved after script evaluation.
win.KiwiI18n = { getLang: () => 'ar' };
lang = 'en';
win.KiwiMenuScan.open();
assert.equal(modal.opts.title, copy.ar.title);
delete win.KiwiI18n;
lang = '';
doc.documentElement.lang = 'en';
win.KiwiMenuScan.open();
assert.equal(modal.opts.title, copy.en.title);
console.log('✓ Menu scanner FR/EN/AR keys, stages, errors, disclosure, RTL and review handoff');
