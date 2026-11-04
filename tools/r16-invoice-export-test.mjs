import assert from 'node:assert/strict';
import vm from 'node:vm';
import { invoicingTestSource } from './invoicing-test-source.cjs';
const source = invoicingTestSource();
for (const lang of ['fr','en','ar']) {
  const root = { innerHTML: '' }, downloads = [];
  const ctx = { console, Intl, Date, Math, Number, Blob, URL: { createObjectURL: () => 'blob:fixture', revokeObjectURL() {} }, setTimeout() {}, clearTimeout() {},
    localStorage: { getItem: () => null, setItem() {} },
    document: { readyState: 'loading', documentElement: { lang }, addEventListener() {}, querySelectorAll: () => [], createElement: () => ({ click() { downloads.push(this.download); } }) } };
  ctx.window = ctx; ctx.addEventListener = () => {};
  vm.createContext(ctx);
  vm.runInContext(source.replace(/\}\)\(\);\s*$/, `globalThis.proof = { T, renderList, exportCsv, setup() {
    overlay = { querySelector: () => root }; currentView = 'list';
    show = () => {}; paintAll = () => {}; toast = () => {};
    cache.invoice = [
      { id:'a',number:'F-A',type:'invoice',customer:{name:'Match',ice:''},issueDate:'2026-11-04',dueDate:'2026-11-04',displayStatus:'paid',ttcCents:12345,balanceCents:0 },
      { id:'b',number:'F-B',type:'invoice',customer:{name:'Other',ice:''},issueDate:'2026-11-04',dueDate:'2026-11-04',displayStatus:'paid',ttcCents:20000,balanceCents:0 }
    ]; tab='invoice'; query='Match'; filter='all'; nextCursor.invoice='unloaded-page';
  } };\n})();`), ctx);
  ctx.root = root; ctx.proof.setup(); ctx.proof.renderList();
  const expected = { fr: 'Exporter les lignes chargées et filtrées', en: 'Export loaded and filtered rows', ar: 'تصدير الصفوف المحملة والمصفاة' }[lang];
  assert.ok(root.innerHTML.includes(expected), lang + ': export control states its actual boundary');
  const csv = ctx.proof.exportCsv();
  assert.ok(csv.includes('F-A') && csv.includes('123,45'), 'loaded matching row exports exact centimes');
  assert.ok(!csv.includes('F-B'), 'filtered-out row is excluded');
  assert.equal(downloads.length, 1);
}
console.log('✓ invoice CSV: real render, filtering, loaded-page boundary and centime output in FR/EN/AR');
