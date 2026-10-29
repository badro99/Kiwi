/* La barre de vente de la peau 2027 (assets/pos-boutique/search.js) : un NOM
 * trouvé liste chaque déclinaison (taille × couleur) avec son propre stock.
 * Play-test Amira, 2026-10-29 : « hoodie » ne montrait qu'une taille par
 * article, celle du code-barres principal. La barre de l'Inventaire garde une
 * ligne par article (elle ouvre la fiche stock). */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

globalThis.window = globalThis;
const src = readFileSync(new URL('../assets/pos-boutique/search.js', import.meta.url), 'utf8')
  .replace(/^import .*$/gm, '');
const mod = await import('data:text/javascript;base64,' + Buffer.from(src + '\nfunction bqKitScanBar(){} function bqKitSellScroll(){}').toString('base64'));
const { searchArticles } = mod;

const V = {
  hb: [
    { id: 'v1', size: 'S', colorId: 'blue', colorFamily: 'blue', stock: 2, barcodes: [{ code: '2000000000011', primary: true }] },
    { id: 'v2', size: 'M', colorId: 'blue', colorFamily: 'blue', stock: 0, barcodes: [{ code: '2000000000028', primary: true }] },
    { id: 'v3', size: 'L', colorId: 'blue', colorFamily: 'blue', stock: 5, barcodes: [] },
  ],
  tee: [{ id: 'v9', size: 'M', colorId: 'white', colorFamily: 'white', stock: 7, barcodes: [{ code: '2000000000097', primary: true }] }],
};
const stockByKey = { 'hb|S|blue': 2, 'hb|M|blue': 0, 'hb|L|blue': 5, 'tee|M|white': 7 };
window.KiwiBoutiqueCatalog = {
  listVariants: (pid) => (V[pid] || []).slice(),
  resolveScan: (code) => {
    for (const pid of Object.keys(V)) for (const v of V[pid]) if (v.barcodes.some((b) => b.code === code)) return { pid, size: v.size, colorId: v.colorId, colorFamily: v.colorFamily };
    return null;
  },
};
const P = {
  hb: { id: 'hb', name: 'Hoodie Blue', price: 300, colors: ['blue'], ean: '2000000000011' },
  tee: { id: 'tee', name: 'Tee Blanc', price: 120, colors: ['white'], ean: '2000000000097' },
};
const BY_EAN = { '2000000000011': 'hb', '2000000000028': 'hb', '2000000000097': 'tee' };
const d = {
  P, BY_EAN, promoFor: () => null, shelf: (x) => x,
  stockOf: (p) => V[p.id].reduce((s, v) => s + v.stock, 0),
  availableStock: (pid, size, color) => stockByKey[pid + '|' + size + '|' + color] ?? -1,
  colorLabel: (c) => c,
};

let ok = 0; const t = (name, fn) => { fn(); ok++; };
t('a name match on the sale bar lists every variant with its own stock', () => {
  const rows = searchArticles('hoodie', d, 0, { variants: true });
  assert.deepEqual(rows.map((r) => r.detail), ['S · blue', 'M · blue', 'L · blue']);
  assert.deepEqual(rows.map((r) => r.stock), [2, 0, 5]);
  assert.deepEqual(rows.map((r) => r.ean), ['2000000000011', '2000000000028', '']);
});
t('accents and case are folded', () => {
  assert.equal(searchArticles('HOODÏE', d, 0, { variants: true }).length, 3);
});
t('a barcode digit search does not duplicate a variant also matched by name', () => {
  const rows = searchArticles('2000000000011', d, 0, { variants: true });
  assert.equal(rows.filter((r) => r.ean === '2000000000011').length, 1);
});
t('the Inventaire bar keeps one row per article', () => {
  const rows = searchArticles('hoodie', d);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].ean, '2000000000011');
});
t('the limit still holds', () => {
  assert.equal(searchArticles('e', d, 2, { variants: true }).length, 2);
});
console.log(`✓ boutique-search-variants-test · ${ok} held`);
