#!/usr/bin/env node
import coreTestSource from './core-test-source.cjs';
/* Inventaire boutique · la fiche produit ne perd pas de stock et dit vrai.
 *
 * 2026-10-12. On the product sheet (dashboard, boutique and maison):
 *   · « Ajouter une variante » on a colour and size the product already had
 *     REPLACED that variant's stock with the form's « Stock initial », 0 by
 *     default, and said « Variante ajoutée » (addVariant sets an absolute
 *     count on a duplicate).
 *   · Clearing a variant's stock field saved 0 (parseInt('') || 0).
 *   · « − » at 0 recorded a −1 the catalogue kept: the next « + » left 0.
 *   · The bin deleted a variant, its stock and its codes on one tap.
 *   · A refused existing code was a toast, « Enregistrement impossible ».
 *   · The colour editor drew a hand-made shield, the label button an upload
 *     arrow; the title said « Sans catégorie » and the stat « Divers ».
 *   · Everything was French under English and Arabic.
 *   · The existing-code and label windows focused their field on a 60 ms
 *     timer that lost the race to the window's own focus: a scan landed in
 *     the close button. They now name the field ([data-autofocus]).
 *   · In dark mode the barcode was ink bars on a dark card, unreadable.
 *   node tools/boutique-product-sheet-test.mjs
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pagesProSource from './pages-pro-test-source.cjs'; // pages-pro.js en quatre fichiers depuis le 22 octobre 2026

const ROOT = process.env.KIWI_ROOT || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = pagesProSource();
// Le catalogue tient en trois fichiers : le journal et les échanges serveur AVANT le principal.
const catSrc = ['assets/boutique-catalog-parts.js', 'assets/boutique-catalog.js']
  .map((f) => readFileSync(path.join(ROOT, f), 'utf8')).join('\n');

let passed = 0, failed = 0;
function ok(label, fn) {
  try { fn(); passed++; console.log(`  ✓ ${label}`); }
  catch (e) { failed++; console.log(`  ✗ ${label}\n      ${String(e.message).split('\n')[0]}`); }
}
const fnSrc = (name) => {
  const m = src.match(new RegExp(`function ${name}\\s*\\([\\s\\S]*?\\n\\}`));
  if (!m) throw new Error(`${name} not found`);
  return m[0];
};
const between = (a, b) => { const i = src.indexOf(a); return i < 0 ? '' : src.slice(i, src.indexOf(b, i + a.length)); };

/* The real dictionary and helpers, run as they are. */
function load(lang) {
  const dict = between('function _bqxArCount(', '\nfunction _bqxShT()');
  return new Function(`
    const _esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
    const _bqxPrice = (n) => String(Math.round(n * 100) / 100);
    const _bqxPfFill = (s, o) => String(s).replace(/\\{(\\w+)\\}/g, (_, k) => (o && o[k] != null ? o[k] : ''));
    const _bqxPfLang = () => ${JSON.stringify(lang)};
    ${dict}
    ${fnSrc('_bqxShT')}
    ${fnSrc('_bqxPieces')}
    ${fnSrc('_bqxSummaryHtml')}
    return { _BQX_SH, _bqxShT, _bqxPieces, _bqxSummaryHtml };
  `)();
}

console.log('the counts the merchant types');
ok('a stock or a number of copies is a whole number, typed as such or refused', () => {
  const { _bqxPieces } = load('fr');
  assert.equal(_bqxPieces('3').n, 3);
  assert.equal(_bqxPieces(' 12 ').n, 12);
  assert.equal(_bqxPieces('0').n, 0);
  assert.equal(_bqxPieces('\u0663').n, 3, 'Arabic-Indic digits');
  assert.equal(_bqxPieces('').empty, true);
  assert.equal(_bqxPieces('2,5').bad, true);
  assert.equal(_bqxPieces('-1').bad, true);
  assert.equal(_bqxPieces('abc').bad, true);
});
ok('clearing a variant’s stock field no longer saves 0', () => {
  assert.ok(!src.includes("parseInt(inp.value, 10) || 0, 'saisie'"));
  const mount = fnSrc('_bqxMountDrawer');
  assert.match(mount, /if \(r\.n == null\) \{ inp\.value = was; say\(r\.empty \? t\.stockEmpty : t\.stockBad\); return; \}/);
  assert.match(mount, /if \(String\(r\.n\) !== was\) CAT\(\)\.setStock\(id, r\.n, 'saisie'\);/);
});
ok('« − » stops at zero, in the row and in the handler', () => {
  assert.match(fnSrc('_variantRow'), /data-action="bqx-var-dec"[^>]*\$\{stock \? '' : ' disabled'\}/);
  assert.match(between("handlers['bqx-var-dec']", "handlers['bqx-var-del']"), /if \(!hit \|\| !\(\+hit\.v\.stock > 0\)\) return;/);
});

console.log('nothing lost by adding or deleting');
ok('the catalogue itself: addVariant overwrites a duplicate, ensureVariant does not', () => {
  const store = new Map();
  const localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k), get length() { return store.size; }, key: (i) => Array.from(store.keys())[i] };
  const node = () => ({ style: {}, classList: { add() {}, remove() {} }, appendChild() {}, addEventListener() {}, setAttribute() {} });
  const document = { addEventListener() {}, dispatchEvent() {}, createElement: node, getElementById: () => null,
    querySelector: () => null, querySelectorAll: () => [], head: node(), body: node() };
  const win = { document, localStorage, addEventListener() {}, removeEventListener() {},
    KiwiEnv: { isReal: () => false, local: true, hosted: false, demosAllowed: true },
    CustomEvent: class { constructor(type, opts) { this.type = type; this.detail = (opts || {}).detail; } },
    navigator: { userAgent: 'node' }, setTimeout, clearTimeout, fetch: () => Promise.reject(new Error('offline test')) };
  win.window = win;
  new Function('window', 'document', 'localStorage', 'CustomEvent', 'navigator', 'setTimeout', 'clearTimeout', 'fetch', 'self', 'console', catSrc)(
    win, document, localStorage, win.CustomEvent, win.navigator, setTimeout, clearTimeout, win.fetch, win, console);
  const C = win.KiwiBoutiqueCatalog;
  C.use('test');
  const p = C.addProduct({ name: 'Jean', priceMAD: 100, kind: 'taille' });
  const v = C.addVariant({ productId: p.id, colorId: 'noir', colorLabel: 'Noir', size: 'M', stock: 8 });
  const again = C.ensureVariant({ productId: p.id, colorId: 'noir', colorLabel: 'Noir', size: 'M', stock: 0 });
  assert.equal(again.created, false);
  assert.equal(C.listVariants(p.id).find((x) => x.id === v.id).stock, 8, 'ensureVariant keeps the 8 pieces');
  C.addVariant({ productId: p.id, colorId: 'noir', colorLabel: 'Noir', size: 'M', stock: 0 });
  assert.equal(C.listVariants(p.id).find((x) => x.id === v.id).stock, 0, 'addVariant is what used to wipe them');
});
ok('the sheet adds through ensureVariant, after saying a duplicate exists', () => {
  assert.ok(!src.includes('CAT().addVariant('), 'the dashboard no longer calls addVariant');
  const save = between("handlers['bqx-var-add-save']", "handlers['bqx-var-color']");
  assert.ok(save.indexOf('if (f.dup) return;') > 0 && save.indexOf('if (f.dup) return;') < save.indexOf('CAT().ensureVariant('));
  assert.match(fnSrc('_bqxVaRead'), /const dup = color \? CAT\(\)\.findVariant\(pid, color\.id, size\) : null;/);
  assert.match(fnSrc('_bqxVaWire'), /if \(go\) go\.disabled = !!f\.dup;/);
  assert.ok(!save.includes("|| { id: 'noir' }"), 'no colour is picked for the merchant');
});
ok('deleting a variant is asked first, with its stock and codes named', () => {
  assert.ok(!src.includes("handlers['bqx-var-del'] = (_el, arg) => CAT().deleteVariant(arg);"));
  const ask = between("handlers['bqx-var-del'] = ", "handlers['bqx-var-del-ok']");
  assert.ok(ask.includes('modal(') && !ask.includes('deleteVariant('));
  assert.match(ask, /stock \? t\.delStock\(stock\) : t\.delNoStock/);
  assert.match(between("handlers['bqx-var-del-ok']", "handlers['bqx-var-gen']"), /CAT\(\)\.deleteVariant\(arg\);/);
});
ok('a refused existing code is said under the field, by reason', () => {
  const save = between("handlers['bqx-var-reg-save']", '/* add a variant');
  for (const r of ["vide:", "'trop-court':", "'trop-long':", 'illisible:', "res.reason === 'doublon'"]) assert.ok(save.includes(r), r);
  assert.ok(!src.includes("toast('Code déjà utilisé'") && !src.includes("toast('Enregistrement impossible'"));
  assert.match(save, /val\.check === 'bad' && inp\.dataset\.confirmed !== raw/);
});

console.log('what the sheet says');
ok('the summary says what is missing instead of inventing it', () => {
  const { _bqxSummaryHtml } = load('fr');
  const data = (variants, stock) => ({ variants, stock });
  const none = _bqxSummaryHtml({ priceMAD: 100 }, data([{ stock: 2, barcodes: [{ code: '1' }] }, { stock: 0, barcodes: [] }], 2));
  assert.ok(none.includes('Coût d’achat non renseigné'));
  assert.ok(none.includes('1 sur 2') && none.includes('1 variante sans code'));
  assert.ok(none.includes('2 variantes · 1 épuisée'));
  const over = _bqxSummaryHtml({ priceMAD: 100, cost: 120 }, data([{ stock: 1, barcodes: [] }], 1));
  assert.ok(over.includes('au-dessus du prix') && over.includes('is-neg'));
  assert.ok(!/Divers/.test(fnSrc('_bqxProductBody') + fnSrc('_bqxSummaryHtml') + fnSrc('_bqxSheetSub')), 'one name for no category');
});
ok('Material icons only: no hand-drawn shield, a print icon to print', () => {
  assert.ok(!src.includes('M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z'));
  assert.match(src, /_bqxIc\('verified_user', 15\)/);
  assert.ok(!/_ICN\.upload\}(Étiquette|Imprimer toutes)/.test(src));
  assert.match(fnSrc('_variantRow'), /_bqxIc\('print'\)/);
});
ok('FR, EN and AR carry the same keys, with plurals that read right', () => {
  const fr = load('fr')._BQX_SH;
  const keys = (o) => Object.keys(o).sort().join(',');
  assert.equal(keys(fr.en), keys(fr.fr));
  assert.equal(keys(fr.ar), keys(fr.fr));
  assert.ok(!JSON.stringify(fr).includes('\u2014'), 'no U+2014');
  assert.equal(fr.fr.pieces(0), '0 pièce');
  assert.equal(fr.fr.pieces(1), '1 pièce');
  assert.equal(fr.fr.pieces(3), '3 pièces');
  assert.equal(fr.en.pieces(1), '1 piece');
  assert.equal(fr.ar.pieces(2), 'قطعتان');
  assert.equal(fr.ar.pieces(5), '5 قطع');
  assert.equal(fr.ar.pieces(11), '11 قطعة');
  assert.equal(fr.ar.variants(1), 'متغيّر واحد');
  assert.equal(fr.fr.colorSafe, 'Le stock, la taille et les codes-barres ne seront pas modifiés.');
});
ok('the sheet and its windows read the language, not a French literal', () => {
  for (const h of ["handlers['bqx-var-add']", "handlers['bqx-var-reg']", "handlers['bqx-var-del']", "handlers['bqx-var-color']", "handlers['bqx-prod-del']"]) {
    assert.ok(between(h, '\n};').includes('const t = _bqxShT();'), h);
  }
  for (const fr of ["title: 'Ajouter une variante'", "title: 'Supprimer ce produit ?'", "title: 'Imprimer les étiquettes'", "title: 'Modifier la couleur'", '>PRIX VENTE<', '>EN STOCK<']) {
    assert.ok(!src.includes(fr), fr);
  }
});

ok('a scan lands in the field: windows name it instead of racing a timer', () => {
  const reg = between("handlers['bqx-var-reg'] =", '\n};');
  assert.ok(/data-bqx-regcode data-autofocus/.test(reg), 'existing-code field carries data-autofocus');
  assert.ok(!/setTimeout\(\(\) => \{?\s*inp\.focus\(\)/.test(reg), 'no timer focus left in bqx-var-reg');
  const copies = between('function _bqxAskCopies(', '\n}');
  assert.ok(copies.includes('data-autofocus data-autofocus-select'), 'copies field is focused with its value selected');
  assert.ok(!/setTimeout\(\(\) => \{?\s*inp\.focus\(\)/.test(copies), 'no timer focus left in the copies window');
  assert.ok(copies.includes('(count || 1) > 1 ? t.copies : t.copiesOne'), 'one variant asks for a number of labels, not copies per variant');
  const ia = coreTestSource.readFileSync(path.join(ROOT, 'assets/interactive.js'), 'utf8');
  assert.ok(ia.includes("panel.querySelector('[data-autofocus]')"), 'trapFocus honours [data-autofocus]');
});
ok('dark mode puts the barcode on paper, and dark-fixes leaves it there', () => {
  assert.ok(/html\[data-theme="dark"\] \.bqx-vr-bc svg, body\[data-vexel-mode="dark"\] \.bqx-vr-bc svg \{ background: #F7F5F0;/.test(src), 'paper behind the bars in dark');
  const dk = readFileSync(path.join(ROOT, 'assets/dark-fixes.js'), 'utf8');
  const skip = (dk.match(/const SKIP = '([^']+)'/) || [])[1] || '';
  assert.ok(skip.split(',').map((x) => x.trim()).includes('.bqx-vr-bc svg'), 'dark-fixes skips the variant barcode');
});

console.log(`\nboutique-product-sheet: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
