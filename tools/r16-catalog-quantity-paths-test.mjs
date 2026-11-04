import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const notices = [], memory = new Map();
const el = () => ({ style: {}, classList: { add() {}, remove() {} }, appendChild() {}, setAttribute() {} });
const ctx = { console, localStorage: { getItem: k => memory.get(k), setItem: (k,v) => memory.set(k,String(v)) },
  document: { readyState:'loading', addEventListener() {}, querySelector: () => null, querySelectorAll: () => [], getElementById: () => null, createElement: el, head: el(), body: el() },
  Kiwi: { toast: m => notices.push(m) }, KiwiEnv: { isReal: () => false, demosAllowed: true }, navigator: {}, addEventListener() {},
  CustomEvent: class {}, setTimeout: () => 0, clearTimeout() {}, fetch: () => { throw Error('unexpected network'); } };
ctx.window = ctx; ctx.self = ctx; vm.createContext(ctx);
for (const file of ['barcode','color-palette','boutique-catalog-parts','boutique-catalog','catalog-import']) vm.runInContext(fs.readFileSync('assets/'+file+'.js','utf8'),ctx);
const C = ctx.KiwiBoutiqueCatalog; C.use('r16-fixture');
const p = C.addProduct({ name:'Quantity fixture', priceMAD:10 });
const v = C.addVariant({ productId:p.id,colorId:'noir',size:'M',stock:5 });
const stock = () => C.listVariants(p.id).find(x => x.id === v.id).stock;
const snapshot = () => JSON.stringify(C.listVariants(p.id));
const cases = [
  ['create variant', () => C.addVariant({productId:p.id,colorId:'noir',size:'L',stock:1.5})],
  ['duplicate variant', () => C.addVariant({productId:p.id,colorId:'noir',size:'M',stock:1.5})],
  ['variant editor', () => C.updateVariant(v.id,{stock:1.5,size:'CHANGED'})],
  ['absolute correction', () => C.setStock(v.id,1.5,'inventaire')],
  ['delta correction', () => C.adjustStock(v.id,0.5,'ajust')],
  ['intake creation', () => C.ensureVariant({productId:p.id,colorId:'noir',size:'XL',stock:1.5})],
  ['receipt', () => C.receiveStock(v.id,1.5)],
];
for (const [label, run] of cases) {
  const before = snapshot(), n = notices.length; run();
  assert.equal(snapshot(),before,label+': refusal happens before any stock or metadata mutation');
  assert.equal(notices.length,n+1,label+': staff hears the refusal');
}
const I = ctx.KiwiCatalogImport;
assert.ok(I, 'real importer loaded');
const plan = {ok:true,newCategories:[],products:[{name:p.name,existing:p,variants:[{colorId:'noir',colorLabel:'Noir',size:'M',stockGiven:true,stock:1.5,barcodes:[]}]}]};
const before = snapshot(), n = notices.length;
const result = I.applyBoutique(plan);
assert.equal(snapshot(),before,'import refuses fractional stock before changing existing variant');
assert.equal(result.failed.length,1); assert.equal(notices.length,n+1);
// Exercise the normal CSV path too. The importer has its own refusal decision:
// it reports the fractional field and preserves existing stock, rather than
// requiring the helper to run when no stock mutation will be attempted.
const parsed = I.parse('produit;taille;couleur;stock;prix\nQuantity fixture;M;Noir;1,5;10');
const analysed = I.analyseBoutique(parsed);
assert.equal(analysed.ok,true);
assert.ok(analysed.issues.some(x => x.code === 'stock-fraction'));
const initialStock = stock(); I.applyBoutique(analysed);
assert.equal(stock(),initialStock,'parse/analyse/apply never rounds a fractional imported quantity');
C.setStock(v.id,8,'inventaire'); assert.equal(stock(),8,'integer correction still works');
C.adjustStock(v.id,-2,'ajust'); assert.equal(stock(),6,'integer adjustment still works');
assert.equal(C.receiveStock(v.id,2).ok,true); assert.equal(stock(),8);
console.log('✓ catalogue quantity: real import, duplicate/create/edit, corrections, intake and receipt refuse before mutation and explain why');
