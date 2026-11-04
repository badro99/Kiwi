// Stock boutique (r19) : un mouvement s'applique en DELTA sur le registre du
// catalogue (le négatif réel y reste), une quantité fractionnaire est refusée
// à voix haute au lieu d'être arrondie.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import split from './split-functions.cjs';
const read = (f) => fs.readFileSync(f, 'utf8');

function makeCatalog(initial) {
  const said = [];
  const variants = initial.map((n, i) => ({ id: 'v' + i, productId: 'p', size: 'T' + i, ledger: n, get stock() { return Math.max(0, this.ledger); } }));
  const calls = [];
  const C = {
    said, variants, calls,
    batch: (run) => run(),
    listVariants: () => variants.map((v) => ({ id: v.id, stock: v.stock })),
    addVariant: (d) => { const v = { id: 'v' + variants.length, productId: d.productId, ledger: d.stock || 0, get stock() { return Math.max(0, this.ledger); } }; variants.push(v); return v; },
    adjustStock: (id, d, why, extra) => {
      calls.push([id, d, why, extra]);
      if (!Number.isInteger(Number(d))) { said.push('refus'); return null; }
      const v = variants.find((x) => x.id === id); if (v) v.ledger += d; return v || null;
    },
  };
  return C;
}
const stateSrc = read('assets/stock/state.js');
function owner(C) {
  const window = {};
  vm.runInNewContext(stateSrc, { window, Date, Math, Object, Array, String, Number, TextEncoder });
  return window.KiwiStockState(() => ({ currentStockFor: () => 0, retailCatalog: () => C, retailSetProductStock() {}, stShowReal: () => false, stockLocationId: () => 'p', stockUnitId: () => 'u' }));
}
const item = { id: 'p', retail: true };

// Perte plus grande que le stock affiché : tout est écrit, le registre garde le négatif.
{ const C = makeCatalog([2]); const r = owner(C).moveRetailStock(item, -5, 'perte', 'manual', 'm1');
  assert.ok(r); assert.equal(C.variants[0].ledger, -3, 'the real negative stays in the ledger'); assert.equal(C.variants[0].stock, 0); }
// Perte sur un produit déjà à 0 (survendu) : elle s'écrit.
{ const C = makeCatalog([0]); assert.ok(owner(C).moveRetailStock(item, -2, 'perte')); assert.equal(C.variants[0].ledger, -2); }
// Delta, pas cible : une vente arrivée entre la lecture et l'écriture n'est pas écrasée.
{ const C = makeCatalog([10]); const o = owner(C); C.variants[0].ledger -= 4; /* vente caisse */ o.moveRetailStock(item, -1, 'perte'); assert.equal(C.variants[0].ledger, 5); }
// Plusieurs déclinaisons : on vide les mieux fournies d'abord, le surplus va au registre.
{ const C = makeCatalog([1, 3]); owner(C).moveRetailStock(item, -5, 'perte'); assert.equal(C.variants[1].ledger, -1); assert.equal(C.variants[0].ledger, 0); assert.equal(C.variants.reduce((s, v) => s + v.ledger, 0), -1); }
// Entrée.
{ const C = makeCatalog([2]); assert.ok(owner(C).moveRetailStock(item, 3, 'receipt', 'manual', 'r1')); assert.equal(C.variants[0].ledger, 5); assert.equal(C.calls[0][3].ref, 'r1'); }
// Fractionnaire : refus, aucune écriture.
{ const C = makeCatalog([4]); assert.equal(owner(C).moveRetailStock(item, -1.5, 'perte'), null); assert.equal(C.variants[0].ledger, 4); assert.equal(C.said.length, 1); }
// Écriture refusée : null, pas de succès affiché.
{ const C = makeCatalog([4]); C.adjustStock = () => null; assert.equal(owner(C).moveRetailStock(item, 1, 'receipt'), null); }

// retailSetProductStock : plus d'arrondi silencieux.
{ const decl = split.declaration(read("assets/stock.js"), "retailSetProductStock");
  const C = makeCatalog([4]);
  const set = vm.runInNewContext(decl + ';retailSetProductStock', { retailCatalog: () => C, Math, Number });
  assert.equal(set('p', 2.6, 'comptage'), false); assert.equal(C.variants[0].ledger, 4, 'nothing rounded, nothing written'); assert.equal(C.said.length, 1);
  assert.equal(set('p', 7, 'comptage'), true); assert.equal(C.variants[0].ledger, 7); }
// Fiche « Inventaire boutique » du tableau de bord : 0 + écart, jamais « Rupture » seul.
{ const src = read('assets/pages-pro-boutique.js');
  const dict = split.declaration(src, '_BQX_INV');
  const tag = split.declaration(src, '_bqxStockTag'), gapFn = split.declaration(src, '_bqxLedgerGap');
  const C = makeCatalog([0, 0]); C.variants[1].ledger = -3;
  const mkEnv = (lang) => ({ _esc: String, _bqxPfLang: () => lang, CAT: () => ({ listVariants: () => C.variants.map((v) => Object.defineProperty({ id: v.id, stock: v.stock }, 'ledgerStock', { value: v.ledger })) }), Math, Number });
  for (const lang of ['fr', 'en', 'ar']) {
    const f = vm.runInNewContext(dict + ';function _bqxInvT(){return _BQX_INV[_bqxPfLang()];}' + tag + ';' + gapFn + ';(p,s)=>_bqxStockTag(s,_bqxLedgerGap(p))', mkEnv(lang));
    assert.match(f('p', 0), /bqx-stag low">0 · .*−3</, lang + ': negative ledger shows 0 and the gap');
    assert.doesNotMatch(f('p', 0), /bqx-stag out/, lang);
  }
  C.variants[1].ledger = 0;
  const f = vm.runInNewContext(dict + ';function _bqxInvT(){return _BQX_INV.fr;}' + tag + ';' + gapFn + ';(p,s)=>_bqxStockTag(s,_bqxLedgerGap(p))', mkEnv('fr'));
  assert.match(f('p', 0), /bqx-stag out">Rupture/, 'a real zero stays Rupture'); }
console.log('✓ stock retail move · delta on the ledger, real negative kept, fractional refused');
