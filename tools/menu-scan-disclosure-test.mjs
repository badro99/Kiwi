import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const root = process.env.KIWI_VISION_TEST_ROOT || '..';
const read = (p) => fs.readFileSync(new URL(root + '/' + p, import.meta.url), 'utf8');
const pdf = { numPages: 15, async getPage(i) { return {
  async getTextContent() { return { items: [{ str: 'Page ' + i }] }; },
  getViewport: ({ scale }) => ({ width: 100 * scale, height: 100 * scale }),
  render: () => ({ promise: Promise.resolve() }),
}; } };
const window = { pdfjsLib: { getDocument: () => ({ promise: Promise.resolve(pdf) }) } };
const document = { createElement: () => ({ getContext: () => ({}), toDataURL: () => 'data:image/jpeg;base64,AA' }) };
vm.runInNewContext(read('assets/menu-scan-reader.js'), { window, document });
const R = window.KiwiMenuScanReader, file = { arrayBuffer: async () => new ArrayBuffer(0) };
const text = await R.pdfText(file, true);
assert.equal(text.pageCount, 15); assert.equal(text.pagesRead, 12); assert.equal(text.truncated, true);
assert.ok(!text.text.includes('Page 13'));
const scan = await R.pdfFirstPageImage(file, true);
assert.equal(scan.pageCount, 15); assert.equal(scan.pagesRead, 1); assert.equal(scan.truncated, true);
pdf.numPages = 1;
assert.equal((await R.pdfText(file, true)).truncated, false);
assert.equal((await R.pdfFirstPageImage(file, true)).truncated, false);
const items = [{ name: 'Soup', cat: 'Starters', price: 20, desc: 'Small' },
  { name: 'soup', cat: 'starters', price: 25, desc: 'Small' },
  { name: 'Soup', cat: 'Starters', price: 20, desc: 'Large' }];
const retained = R.dedupe([...items, items[0]]);
assert.equal(retained.length, 3); assert.ok(retained.every((r) => r.needsReview));
assert.ok(!items[0].needsReview, 'does not mutate API results');
assert.equal(R.toCsvText(retained).split('\n').length, 4, 'conflicting rows reach CSV');
assert.match(read('assets/menu-scan.js'), /scanNotices: notices/);
assert.match(read('assets/catalog-import.js'), /opts.scanNotices.*role="status"/);
console.log('✓ PDF coverage metadata, conflicting dish retention and review disclosure');
// Drive a multi-page PDF through the actual controller and its review handoff.
pdf.numPages = 15;
let review, events = {};
const stage = { innerHTML: '' };
const Kiwi = { modal: () => ({ close() {}, el: {
  setAttribute() {}, querySelector: (q) => q === '[data-kms-stage]' ? stage : null,
  addEventListener: (type, cb) => { events[type] = cb; },
} }) };
const i18n = read('assets/i18n.js'), start = i18n.indexOf('const T = '), end = i18n.indexOf('\n  };', start);
const T = vm.runInNewContext(i18n.slice(start, end + 5) + '; T;');
Object.assign(window, { Kiwi, KiwiI18n: { T, getLang: () => 'en' },
  KiwiCatalogImport: { openMenuWithCsv: (csv, options) => { review = { csv, options }; } },
  KiwiAiImageImport: { busyHtml: () => 'Reading', callApi: async () => ({ items }) },
});
const doc = { getElementById: () => true, documentElement: { lang: 'en' } };
vm.runInNewContext(read('assets/menu-scan.js'), { window, Kiwi, KiwiCatalogImport: window.KiwiCatalogImport,
  document: doc, AbortController, localStorage: { getItem: () => 'en' },
});
window.KiwiMenuScan.open();
events.change({ target: { matches: () => true, files: [{ ...file, type: 'application/pdf', name: 'Dinner.pdf' }] } });
await new Promise(setImmediate);
assert.ok(review.csv.includes('Soup;Starters;;20;Small'));
assert.equal(review.csv.split('\n').length, 4);
assert.ok(review.options.scanNotices.some((s) => s.includes('Dinner.pdf') && s.includes('12 of 15')));
assert.ok(review.options.scanNotices.some((s) => s.includes('Review both rows') && s.includes('Large')));
console.log('✓ review receives filename, unread-page disclosure and conflicting dish details');
