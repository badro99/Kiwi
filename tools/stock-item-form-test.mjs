#!/usr/bin/env node
/* Stock · « Nouvel article » records what the merchant typed, nothing else.
 *
 * 2026-10-12. A new article saved with « Stock actuel » empty was written with
 * its par level as stock, and that invented quantity went to the ledger as the
 * opening balance. An empty reorder level became 40 % of par without a word.
 * « 2,5 » kg was stored as 2. The first supplier was picked for every new
 * article, an unconfirmed « + Nouvelle catégorie… » filed it under Légumes, and
 * the « Nom de la catégorie / Confirmer » row never hid.
 *   node tools/stock-item-form-test.mjs
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = process.env.KIWI_ROOT || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = readFileSync(path.join(ROOT, 'assets/stock.js'), 'utf8');

let passed = 0, failed = 0;
function ok(label, fn) {
  try { fn(); passed++; console.log(`  ✓ ${label}`); }
  catch (e) { failed++; console.log(`  ✗ ${label}\n      ${String(e.message).split('\n')[0]}`); }
}
const between = (a, b) => { const i = src.indexOf(a); return i < 0 ? '' : src.slice(i, src.indexOf(b, i + a.length)); };
const fnSrc = (name) => {
  const m = src.match(new RegExp(`  function ${name}\\s*\\([\\s\\S]*?\\n  \\}`));
  if (!m) throw new Error(`${name} not found`);
  return m[0];
};
const form = between('  function openItemForm(existing) {', '        const nutritionData = readNutrition(scope);');
const load = (l) => new Function(`const lang = () => ${JSON.stringify(l)}; ${fnSrc('stItemNum')} ${fnSrc('stItemVal')} return { stItemNum, stItemVal };`)();

console.log('numbers');
ok('« 2,5 », « 2.5 », « 0,125 » and Arabic-Indic digits are read as typed', () => {
  const { stItemNum } = load('fr');
  assert.equal(stItemNum('2,5').n, 2.5);
  assert.equal(stItemNum('2.5').n, 2.5);
  assert.equal(stItemNum('0,125').n, 0.125);
  assert.equal(stItemNum('\u0662\u066B\u0665').n, 2.5);
  assert.equal(stItemNum('0').n, 0);
  assert.equal(stItemNum('').empty, true);
  assert.equal(stItemNum('2,5 kg').bad, true, 'a unit typed in the box is refused, not guessed');
  assert.equal(stItemNum('-1').bad, true);
});
ok('a stored quantity is shown back with the language’s decimal mark', () => {
  assert.equal(load('fr').stItemVal(2.5), '2,5');
  assert.equal(load('en').stItemVal(2.5), '2.5');
  assert.equal(load('fr').stItemVal(0), '0');
  assert.equal(load('fr').stItemVal(undefined), '');
  assert.ok(!/parseFloat\(scope\.querySelector\('\[data-stock-add-(current|par|reorder|cost)\]'\)/.test(src), 'no parseFloat on the form');
});

console.log('nothing invented');
ok('a new article’s stock is the number typed, required, and never the par level', () => {
  assert.ok(!src.includes('(existing ? currentStockFor(existing) : parLevel)'));
  assert.match(form, /const currentStock = nCur\.empty \? \(existing \? currentStockFor\(existing\) : 0\) : nCur\.n;/);
  assert.match(form, /mark\('current', nCur\.bad \? t\('itemNumBad'\) : \(nCur\.empty && !isEdit\) \? t\('itemStockErr'\) : ''\);/);
});
ok('the 40 % reorder rule is spelled out under the field before saving', () => {
  assert.match(form, /hint\.textContent = auto > 0 \? t\('itemReorderAuto', fmtUnit\(auto, u\)\) : t\('itemReorderNone'\);/);
  assert.match(form, /const reorderLevel = nReorder\.empty \? Math\.max\(0, Math\.round\(parLevel \* 0\.4\)\) : nReorder\.n;/);
});
ok('no supplier is chosen for the merchant, and « Aucun » can be saved', () => {
  assert.match(form, /const supOpts = `<option value="">\$\{esc\(t\('itemNoSupplierOpt'\)\)\}<\/option>`/);
  assert.match(form, /const supplier = supSel \? supSel\.value : \(existing\?\.supplier \|\| ''\);/);
});
ok('an unconfirmed new category stops the save instead of filing under Légumes', () => {
  assert.ok(!form.includes("if (category === '__new__') category = existing?.category || 'legumes';"));
  assert.match(form, /mark\('newcat', catSel\?\.value === '__new__' \? t\('itemNewCatErr'\) : ''\);/);
});
ok('the new-category row is hidden until asked for', () => {
  assert.ok(!src.includes('style="display:none; margin-top:8px; display:flex; gap:6px;"'));
  assert.match(form, /<div class="st-if-newcat" data-stock-newcat-wrap hidden>/);
  assert.match(src, /inlineWrap\.hidden = false;/);
});
ok('every problem is written under its field and the save stops on the first', () => {
  for (const k of ['name', 'current', 'par', 'reorder', 'cost', 'newcat']) assert.ok(form.includes(`mark('${k}',`), k);
  assert.match(form, /if \(firstBad\) \{ firstBad\.focus\(\); return; \}/);
});

console.log('three languages');
ok('every new string exists in FR, EN and AR, without an em dash', () => {
  const keys = ['itemSecItem', 'itemSecStock', 'itemSecCost', 'itemNamePh', 'itemNameErr', 'itemNewCatErr', 'itemNoSupplierOpt',
    'itemNoSupplier', 'itemOptional', 'itemStockErr', 'itemStockHint', 'itemNumBad', 'itemParHint', 'itemReorderHint',
    'itemReorderAuto', 'itemReorderNone', 'itemCostLabel'];
  for (const k of keys) {
    const n = (src.match(new RegExp(`\\b${k}: `, 'g')) || []).length;
    assert.equal(n, 3, `${k} appears ${n} times`);
  }
  const blocks = [...src.matchAll(/itemSecItem: [\s\S]*?itemCostLabel: '[^']*'/g)].map((m) => m[0]);
  assert.equal(blocks.length, 3);
  assert.ok(blocks.every((b) => !b.includes('\u2014')));
});

console.log('reorder level, measured');
const reorder = new Function(`${fnSrc('reorderFromHistory')} return reorderFromHistory;`)();
ok('consumption × the usual gap between deliveries, worked by hand', () => {
  const r = reorder(2, ['2026-10-01', '2026-10-04', '2026-10-07', '2026-10-10']);
  assert.deepEqual(r, { perDay: 2, gap: 3, deliveries: 4, qty: 6 });
  const u = reorder(2.5, ['2026-10-01', '2026-10-04', '2026-10-08']);
  assert.equal(u.gap, 3.5);
  assert.equal(u.qty, 8.8, '2,5 × 3,5 = 8,75, rounded UP: rounding down would run out');
});
ok('the last four deliveries only, one per day, in date order', () => {
  const r = reorder(1, ['2026-09-01', '2026-10-10', '2026-10-01', '2026-10-01', '2026-10-04', '2026-10-07']);
  assert.equal(r.deliveries, 4);
  assert.equal(r.gap, 3);
});
ok('nothing is proposed without both measures', () => {
  assert.equal(reorder(2, ['2026-10-01', '2026-10-04']), null, 'two deliveries are one gap: not enough');
  assert.equal(reorder(0, ['2026-10-01', '2026-10-04', '2026-10-07']), null, 'no measured consumption');
  assert.equal(reorder(2, ['bad', '2026-10-04', '2026-10-07']), null, 'a malformed day is dropped, not guessed');
});
ok('the proposal shows on an existing article only, and enters the field only on a click', () => {
  assert.match(form, /const reorderSugg = isEdit \? reorderSuggestionFor\(existing\) : null;/);
  assert.match(form, /data-st-if-reorder-use="\$\{esc\(stItemVal\(reorderSugg\.qty\)\)\}"/);
  assert.match(form, /f\.value = ev\.currentTarget\.getAttribute\('data-st-if-reorder-use'\)/);
  assert.match(src, /r\.reason === 'receipt' && \+r\.occurredTs > 0/, 'deliveries come from the ledger receipts');
  for (const k of ['itemReorderMeasured', 'itemReorderUse']) assert.equal((src.match(new RegExp(`\\b${k}: `, 'g')) || []).length, 3, `${k} in FR, EN and AR`);
});

console.log(`\nstock-item-form: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
