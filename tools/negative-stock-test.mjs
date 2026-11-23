#!/usr/bin/env node
/* Kiwi · negative-stock-test · un compte sous zéro se lit sous zéro.
 *
 * Owner, 23 November 2026 (Mabs Outfitters, comparing Kiwi with the shop's old
 * till): « kiwi also shows - when theirs show - ». The old system prints -1
 * when a size sold one more piece than it ever received; Kiwi printed 0, and
 * its importer threw the -1 away as « stock illisible ». This file holds:
 *   1. the importer keeps a negative count (new size and existing size),
 *   2. a count can be set below zero, and a delivery adds on top of it
 *      (-2 then +5 reads 3, never 5),
 *   3. selling still treats a negative size as empty (stock stays 0 for the
 *      availability checks, the signed value lives in ledgerStock),
 *   4. the screens print the signed number: the size list of the product
 *      sheet, the inventory row and the product card of the boutique till.
 *   node tools/negative-stock-test.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let n = 0, bad = 0;
const ok = (cond, msg, detail) => { if (cond) { n++; console.log('  ✓ ' + msg); } else { bad++; console.log('  ✗ ' + msg + (detail !== undefined ? ' · obtenu ' + JSON.stringify(detail) : '')); } };

function makeEnv() {
  const store = new Map();
  const localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    clear: () => store.clear(),
  };
  const el = () => ({
    style: {}, dataset: {}, classList: { add() {}, remove() {}, contains: () => false },
    setAttribute() {}, appendChild() {}, removeChild() {}, remove() {}, click() {},
    addEventListener() {}, querySelector: () => null, querySelectorAll: () => [],
  });
  const document = {
    addEventListener() {}, dispatchEvent() {}, createElement: el, getElementById: () => null,
    querySelector: () => null, querySelectorAll: () => [], head: el(), body: el(),
    readyState: 'complete', visibilityState: 'visible',
  };
  const window = {
    addEventListener() {}, removeEventListener() {}, dispatchEvent() {}, localStorage, document,
    KiwiBarcode: (() => { let i = 0; return { nextInStoreEan: () => '200000000' + String(++i).padStart(4, '0'), detect: () => 'imported', isValidEan13: () => false }; })(),
    fetch: () => Promise.reject(new Error('offline')),
    setTimeout, clearTimeout, navigator: { onLine: false }, TextDecoder,
    CustomEvent: class { constructor(type, o) { this.type = type; this.detail = (o || {}).detail; } },
  };
  window.window = window;
  const ctx = vm.createContext(window);
  ctx.globalThis = window;
  return { ctx, window };
}
const { ctx, window } = makeEnv();
for (const rel of ['assets/boutique-catalog-parts.js', 'assets/boutique-catalog.js', 'assets/catalog-import.js']) {
  new vm.Script(fs.readFileSync(path.join(ROOT, rel), 'utf8'), { filename: rel }).runInContext(ctx);
}
process.on('unhandledRejection', () => {});
const IMP = window.KiwiCatalogImport, CAT = window.KiwiBoutiqueCatalog;
CAT.use('test-negative-stock');
const variant = (pid, size) => CAT.listVariants(pid).find((v) => v.size === size);
const ledger = (v) => Number(v.ledgerStock ?? v.stock);

console.log('■ import · un -1 du fichier reste -1');
const plan = IMP.analyseBoutique(IMP.parse('produit,couleur,taille,prix_mad,stock\nJean,Bleu,38,250,-1\nJean,Bleu,40,250,4\n'));
ok(!plan.issues.some((i) => /illisible/.test(i.msg)), 'aucun « stock illisible » pour -1', plan.issues.map((i) => i.msg));
IMP.applyBoutique(plan, {});
const jean = CAT.listProducts().find((p) => p.name === 'Jean');
ok(!!jean && !!variant(jean.id, '38'), 'la taille 38 existe');
ok(jean && ledger(variant(jean.id, '38')) === -1, 'la taille 38 lit -1', jean && ledger(variant(jean.id, '38')));
ok(jean && variant(jean.id, '38').stock === 0, 'pour la vente, la 38 reste vide (stock 0)', jean && variant(jean.id, '38').stock);
ok(jean && CAT.productStock(jean.id) === 4, 'le total vendable ne retire pas le -1 (4)', jean && CAT.productStock(jean.id));
IMP.applyBoutique(IMP.analyseBoutique(IMP.parse('produit,couleur,taille,stock\nJean,Bleu,40,-2\n')), {});
ok(jean && ledger(variant(jean.id, '40')) === -2, 'une taille existante passe à -2 par l’import', jean && ledger(variant(jean.id, '40')));

console.log('■ comptage et réception');
const v40 = jean && variant(jean.id, '40');
ok(v40 && CAT.receiveStock(v40.id, 5).ok, 'une réception de 5 est acceptée');
ok(v40 && ledger(variant(jean.id, '40')) === 3, '-2 puis +5 lit 3, jamais 5', v40 && ledger(variant(jean.id, '40')));
ok(v40 && !!CAT.setStock(v40.id, -1), 'un comptage peut poser -1');
ok(v40 && ledger(variant(jean.id, '40')) === -1 && variant(jean.id, '40').stock === 0, 'après le comptage : -1 au registre, 0 à la vente', v40 && [ledger(variant(jean.id, '40')), variant(jean.id, '40').stock]);
ok(jean && CAT.adjustVariantStock(jean.id, '40', 'bleu', -1) === false, 'sans le drapeau de vente hors stock, une sortie sur -1 reste refusée');
const fresh = CAT.addVariant({ productId: jean.id, colorId: 'noir', size: '42', stock: -3 });
ok(fresh && ledger(variant(jean.id, '42')) === -3, 'une taille créée à -3 lit -3', fresh && ledger(variant(jean.id, '42')));

console.log('■ écrans · le nombre signé');
const SZ = await import(pathToFileURL(path.join(ROOT, 'assets/boutique-sizes.js')).href);
ok(typeof SZ.haveCount === 'function', 'boutique-sizes.js exporte haveCount(v)');
if (typeof SZ.haveCount === 'function') {
  ok(SZ.haveCount(variant(jean.id, '38')) === -1, 'la fiche lit -1 pour la 38', SZ.haveCount(variant(jean.id, '38')));
  ok(SZ.haveCount({ stock: 4 }) === 4, 'une taille sans registre lit son stock');
  ok(SZ.haveCount(null) === 0, 'pas de taille, zéro');
}
const sizes = fs.readFileSync(path.join(ROOT, 'assets/boutique-sizes.js'), 'utf8');
ok(!/const stock = v \? Math\.max\(0, \+v\.stock \|\| 0\) : 0;/.test(sizes), 'la liste des tailles ne ramène plus le compte à 0');
ok(!/const st = r\.variant \? Math\.max\(0, \+r\.variant\.stock \|\| 0\) : 0;/.test(sizes), 'la grille taille × couleur ne ramène plus le compte à 0');
const inv = fs.readFileSync(path.join(ROOT, 'assets/pos-boutique/inventory.js'), 'utf8');
ok(/const shown = d\.variants\.reduce\(\(s, v\) => s \+ \(Number\(v\.ledgerStock \?\? v\.stock\) \|\| 0\)/.test(inv) && /\$\{shown < 0 \? '−' \+ Math\.abs\(shown\) : shown\}/.test(inv),
  'la ligne d’inventaire affiche le total signé');
ok(inv.includes("${n < 0 ? '−' + Math.abs(n) : n} en stock`"), 'le sous-titre de la fiche lit le total signé');
const sales = fs.readFileSync(path.join(ROOT, 'assets/pos-boutique/sales.js'), 'utf8');
ok(!sales.includes("'<span class=\"bq-card-flag low\">0 · '"), 'la carte produit n’écrit plus « 0 · » devant l’écart');

const OV = await import(pathToFileURL(path.join(ROOT, 'assets/pos-boutique/oversell.js')).href);
const fakeCat = (vals) => ({ listVariants: () => vals.map((x) => Object.defineProperty({ stock: Math.max(0, x) }, 'ledgerStock', { value: x })) });
const id = (x) => x;
ok(OV.stockLabel(fakeCat([-1]), 'p', 0, id) === '−1', 'Maison · une taille à -1 seule lit −1', OV.stockLabel(fakeCat([-1]), 'p', 0, id));
ok(OV.stockLabel(fakeCat([3, -1]), 'p', 3, id).startsWith('2 · '), 'Maison · 3 et -1 lit 2 et garde l’écart', OV.stockLabel(fakeCat([3, -1]), 'p', 3, id));
ok(OV.stockLabel(fakeCat([4]), 'p', 4, id) === '4', 'Maison · sans écart, le total seul');
const maison = fs.readFileSync(path.join(ROOT, 'assets/pos-maison/inventory.js'), 'utf8');
ok(maison.includes('${stockLabel(cat, p.id, d.stock, esc)}'), 'la ligne d’inventaire Maison passe par stockLabel');
const dash = fs.readFileSync(path.join(ROOT, 'assets/pages-pro-boutique.js'), 'utf8');
ok(!dash.includes('bqx-stag low">0 · ') && dash.includes("t.inStock('−' + Math.abs(shown))"), 'le catalogue du tableau de bord lit −N, plus « 0 · écart »');

console.log(bad ? `✗ ${bad} échec(s), ${n} contrôles passés` : `✓ stock sous zéro : ${n} contrôles`);
process.exitCode = bad ? 1 : 0;
