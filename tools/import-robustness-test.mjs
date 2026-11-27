/* Import robustness (27 nov. 2026)
 * ---------------------------------------------------------------------------
 * « Quelqu'un essayait d'importer, ça ne marchait pas. » Every importer was fed
 * the files merchants really have: a header with a unit (« Prix (DH) »), more
 * words (« Désignation article »), a title line above the header, a price
 * written « 45,00 DH », an Excel FR CSV in Windows-1252, a Numbers TSV, a
 * barcode Excel rounded to 6,11E+12, hours as 7:30, and a real .xlsx. Before
 * the fix most of these refused the whole file or dropped a column silently.
 *
 * Covers: assets/sheet-file.mjs, assets/catalog-import.js (menu + boutique),
 * assets/stock/import.js, assets/planning/csv-import.js,
 * assets/pages-pro/catalog-bulk/rules.js.
 * ─────────────────────────────────────────────────────────────────────────── */
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
let pass = 0, fail = 0;
function ok(cond, label, got) {
  if (cond) { pass++; return; }
  fail++; console.log('✗ ' + label + (got === undefined ? '' : '  → ' + JSON.stringify(got).slice(0, 300)));
}

const SF = await import(pathToFileURL(path.join(ROOT, 'assets/sheet-file.mjs')).href);

/* ── sheet-file ─────────────────────────────────────────────────────────── */
{
  const w = SF.decodeBytes(Buffer.from('Désignation;Prix\nCrème brûlée;25\n', 'latin1'));
  ok(w.indexOf('Crème brûlée') !== -1, 'windows-1252 bytes decode to the right accents', w);
  ok(SF.decodeBytes(Buffer.from('Crème', 'utf8')) === 'Crème', 'utf-8 stays utf-8');
  ok(JSON.stringify(SF.textRows('a;b;c\n1;2;3\n')) === '[["a","b","c"],["1","2","3"]]', 'semicolon sniffed');
  ok(SF.textRows('a\tb\tc\n1\t2\t3\n')[1][2] === '3', 'tab sniffed');
  ok(SF.textRows('﻿a,b\n1,2\n')[0][0] === 'a', 'BOM stripped');
  ok(SF.textRows('Titre du fichier\nA;B;C\n1;2;3\n')[1].length === 3, 'a title line does not decide the separator');
  ok(SF.textRows('a;b\n"x;y";2\n')[1][0] === 'x;y', 'quoted separator kept in its cell');
  ok(SF.textRows("a;b\n'=1+1;2\n")[1][0] === '=1+1', 'leading quote before a formula removed');
  const asFile = (bytes) => ({ arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) });
  const xls = await SF.readSheetFile(asFile(Uint8Array.from([0xD0, 0xCF, 0x11, 0xE0, 0, 0, 0, 0])));
  ok(!xls.ok && xls.error === 'xls', 'old .xls says so', xls);
  ok(/xlsx/.test(SF.errorText('xls', 'fr')) && SF.errorText('nope', 'fr').length > 0, 'error words exist');
  const empty = await SF.readSheetFile(asFile(Buffer.from('\n;;\n')));
  ok(!empty.ok && empty.error === 'empty', 'empty file says so', empty);
  const csv = await SF.readSheetFile(asFile(Buffer.from('Employé;Heures\nHélène;7\n', 'latin1')));
  ok(csv.ok && csv.rows[1][0] === 'Hélène', 'csv file read through readSheetFile', csv);
  /* A real .xlsx, written by the catalogue's own writer, read back. */
  await import(pathToFileURL(path.join(ROOT, 'assets/pages-pro/catalog-bulk/xlsx.js')).href);
  if (globalThis.KiwiXlsx && typeof DecompressionStream === 'function' && typeof CompressionStream === 'function') {
    const bytes = await globalThis.KiwiXlsx.write([['Article', 'Catégorie', 'Prix (DH)'], ['Cheese burger', 'Burgers', 45]], { sheet: 'Carte' });
    const book = await SF.readSheetFile(asFile(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)));
    ok(book.ok && book.rows[0][2] === 'Prix (DH)' && Number(book.rows[1][2]) === 45, '.xlsx read back', book);
  } else ok(false, 'xlsx reader unavailable in this Node');
}

/* ── menu + boutique (catalog-import.js) ────────────────────────────────── */
{
  const window = { KiwiI18n: { getLang: () => 'fr' } };
  const ctx = vm.createContext({ window, document: { documentElement: { lang: 'fr' } }, TextDecoder, TextEncoder, Intl, URL, Blob, console });
  vm.runInContext(read('assets/catalog-import.js'), ctx);
  const C = window.KiwiCatalogImport;
  window.KiwiMenuStore = { categories: () => [{ id: 'c1', name: 'Burgers' }], items: () => [] };
  const menu = (text) => { const p = C.parse(text); return p.ok ? C.analyseMenu(p) : { ok: false, error: p.error }; };
  const first = (a) => a.ok && a.rows[0] ? { n: a.rows[0].name || a.rows[0].article, p: a.rows[0].price != null ? a.rows[0].price : a.rows[0].prix } : null;
  const menuCase = (label, text, name, price) => { const a = menu(text); const f = first(a); ok(f && f.n === name && Number(f.p) === price, 'menu · ' + label, a.ok ? f : a); };
  menuCase('plain', 'Article;Catégorie;Prix\nCheese burger;Burgers;45\n', 'Cheese burger', 45);
  menuCase('« Prix de vente »', 'Article;Catégorie;Prix de vente\nCheese burger;Burgers;45\n', 'Cheese burger', 45);
  menuCase('« Prix (DH) »', 'Article;Catégorie;Prix (DH)\nCheese burger;Burgers;45\n', 'Cheese burger', 45);
  menuCase('« Prix TTC (MAD) »', 'Article;Catégorie;Prix TTC (MAD)\nCheese burger;Burgers;45\n', 'Cheese burger', 45);
  menuCase('« Nom du plat »', 'Nom du plat;Catégorie;Prix\nCheese burger;Burgers;45\n', 'Cheese burger', 45);
  menuCase('« Produit » + « Prix unitaire »', 'Produit,Famille,Prix unitaire\nCheese burger,Burgers,45\n', 'Cheese burger', 45);
  menuCase('title rows above the header', "Carte Jon's Burgers;;\n;;\nArticle;Catégorie;Prix\nCheese burger;Burgers;45\n", 'Cheese burger', 45);
  menuCase('« 45,00 DH »', 'Article;Catégorie;Prix\nCheese burger;Burgers;45,00 DH\n', 'Cheese burger', 45);
  menuCase('« 1 200,00 MAD »', 'Article;Catégorie;Prix\nPlateau;Burgers;1 200,00 MAD\n', 'Plateau', 1200);
  menuCase('promo column is not the price', 'Article;Prix promo;Prix\nCheese burger;30;45\n', 'Cheese burger', 45);
  {
    const a = C.analyseMenu(C._fromRows([['Carte'], ['Article', 'Catégorie', 'Prix (DH)'], ['Cheese burger', 'Burgers', 45]]));
    const f = first(a); ok(f && f.n === 'Cheese burger' && Number(f.p) === 45, 'menu · .xlsx rows with a title row', a.ok ? f : a);
  }

  window.KiwiBoutiqueCatalog = { listProducts: () => [], listCategories: () => [], colors: () => [{ label: 'Noir', id: 'noir' }], findByBarcode: () => null };
  const bout = (text) => { const p = C.parse(text); return p.ok ? C.analyseBoutique(p) : { ok: false, error: p.error }; };
  const bCase = (label, text, check) => { const a = bout(text); const p0 = a.ok && a.products[0]; ok(p0 && check(p0, a), 'boutique · ' + label, a.ok ? { p0: p0 && { n: p0.name, price: p0.priceMAD, cost: p0.cost }, issues: a.issues.map((i) => i.msg) } : a); };
  bCase('plain with sizes', 'Produit;Catégorie;Couleur;Taille;Prix;Stock\nChemise;Hommes;Noir;M;250;3\nChemise;Hommes;Noir;L;250;2\n', (p) => p.name === 'Chemise' && Number(p.priceMAD) === 250 && p.variants.length === 2);
  bCase('« Prix de vente (DH) »', 'Produit;Prix de vente (DH);Stock\nChemise;250;3\n', (p) => Number(p.priceMAD) === 250);
  bCase('« Prix TTC (MAD) » + « Prix d\'achat HT »', "Produit;Prix TTC (MAD);Prix d'achat HT;Qté\nChemise;250;120;3\n", (p) => Number(p.priceMAD) === 250 && Number(p.cost) === 120);
  bCase('« Désignation article »', 'Désignation article;Prix;Code-barres EAN\nChemise;250;6111234567890\n', (p) => p.name === 'Chemise');
  bCase('« 250,00 DH »', 'Produit;Prix\nChemise;250,00 DH\n', (p) => Number(p.priceMAD) === 250);
  bCase('title row', 'Inventaire boutique 2026;;\nProduit;Prix;Stock\nChemise;250;3\n', (p) => Number(p.priceMAD) === 250);
  bCase('EAN rounded by Excel is flagged, not imported', 'Produit;Prix;Code-barres\nChemise;250;6,11123E+12\n',
    (p, a) => !JSON.stringify(p).includes('E+12') && a.issues.some((i) => /Excel|scientifique/i.test(i.msg)));
}

/* ── stock list (stock/import.js) ───────────────────────────────────────── */
{
  const window = { KiwiI18n: { getLang: () => 'fr' } };
  const ctx = vm.createContext({ window, document: { documentElement: { lang: 'fr' } }, TextDecoder, Intl, URL, Blob, console });
  let part = null;
  window.KiwiStockInternal = { install: (name, factory) => { part = { name, factory }; } };
  vm.runInContext(read('assets/stock/import.js'), ctx);
  const S = { stUserItems: [], stUserCategories: [], allCategories: () => [], getInv: () => [], getSup: () => [], lang: () => 'fr', esc: String, fmtMad: String, stockUnit: (u) => u, catLabel: String, currentStockFor: () => 0 };
  const api = part.factory(S);
  const sCase = (label, input, cost, stock) => {
    const a = api.analyse(input); const r = a.ok && a.rows[0];
    ok(r && Number(r.cost) === cost && Number(r.stock) === stock, 'stock · ' + label, a.ok ? r : a);
  };
  sCase('plain', 'Article;Unité;Coût;Stock\nTortilla;unité;1,875;240\n', 1.875, 240);
  sCase('« Prix unitaire HT » « Quantité en stock »', 'Désignation;Unité de mesure;Prix unitaire HT;Quantité en stock\nTortilla;unité;1,875;240\n', 1.875, 240);
  sCase('« Coût (MAD) » « Qté »', 'Produit;Unité;Coût (MAD);Qté\nTortilla;unité;1,875;240\n', 1.875, 240);
  sCase('« Prix d\'achat (DH) »', "Ingrédient;Prix d'achat (DH);Stock\nTortilla;1,875;240\n", 1.875, 240);
  sCase('« 12,50 DH »', 'Article;Coût;Stock\nTomate;12,50 DH;5\n', 12.5, 5);
  sCase('title row', 'Inventaire du 01/11;;\nArticle;Coût;Stock\nTomate;12;5\n', 12, 5);
  sCase('.xlsx rows', [['Article', 'Coût (MAD)', 'Stock'], ['Tomate', 12.5, 5]], 12.5, 5);
}

/* ── planning hours (planning/csv-import.js) ────────────────────────────── */
{
  const src = read('assets/planning/csv-import.js');
  const a = src.indexOf('  function parseCsv('), b = src.indexOf('  let pendingImport');
  ok(a !== -1 && b > a, 'planning · import functions found');
  const P = new Function('pad', 'lockBucket', 'memberFullName', src.slice(a, b) + '\nreturn { parseCsv, planHoursImport };')(
    (n) => String(n).padStart(2, '0'), () => ({}), (m) => m.first + ' ' + m.last);
  const members = [{ id: 'm1', first: 'Hélène', last: 'Benali' }, { id: 'm2', first: 'Youssef', last: 'Amrani' }];
  const hours = (plan) => plan && JSON.stringify(plan);
  const pCase = (label, rowsOrText, expectDay, expectHours) => {
    const plan = P.planHoursImport(typeof rowsOrText === 'string' ? SF.textRows(rowsOrText) : rowsOrText, members, {});
    const s = hours(plan) || '';
    ok(plan && s.indexOf(expectDay) !== -1 && s.indexOf(String(expectHours)) !== -1, 'planning · ' + label, plan);
  };
  pCase('Kiwi export shape', 'ID membre;Employé;Date;Heures\nm1;Hélène Benali;2026-11-10;7,5\n', '2026-11-10', 7.5);
  pCase('name only', 'Employé;Date;Heures\nHélène Benali;10/11/2026;7,5\n', '2026-11-10', 7.5);
  pCase('windows-1252 file', SF.textRows(SF.decodeBytes(Buffer.from('Employé;Date;Heures\nHélène Benali;10/11/2026;7,5\n', 'latin1'))), '2026-11-10', 7.5);
  pCase('« 7:30 »', 'Employé;Date;Heures\nYoussef Amrani;10/11/2026;7:30\n', '2026-11-10', 7.5);
  pCase('« 7h30 »', 'Employé;Date;Heures\nYoussef Amrani;10/11/2026;7h30\n', '2026-11-10', 7.5);
  pCase('« 10/11/26 »', 'Employé;Date;Heures\nYoussef Amrani;10/11/26;8\n', '2026-11-10', 8);
  pCase('tab separated', 'Employé\tDate\tHeures\nYoussef Amrani\t10/11/2026\t8\n', '2026-11-10', 8);
  pCase('« Heures travaillées »', 'Employé;Date;Heures travaillées\nYoussef Amrani;10/11/2026;8\n', '2026-11-10', 8);
  pCase('.xlsx serial date + time fraction', [['Employé', 'Date', 'Heures'], ['Youssef Amrani', 46336, 0.3125]], '2026-11-10', 7.5);
}

/* ── bulk catalogue grid (catalog-bulk/rules.js) ────────────────────────── */
{
  const window = {};
  const ctx = vm.createContext({ window, globalThis: window, Intl, console });
  vm.runInContext(read('assets/pages-pro/catalog-bulk/rules.js'), ctx);
  const R = window.KiwiCatalogBulkRules || Object.values(window).find((v) => v && typeof v.analyseImport === 'function');
  ok(!!R, 'bulk · rules module found');
  if (R) {
    const run = (table, kind) => R.analyseImport(table, { kind: kind || 'boutique', categories: [], existing: [] });
    const bCase = (label, table, check) => { const a = run(table); const r = a.rows && a.rows[0]; ok(!a.error && r && check(r, a), 'bulk · ' + label, a.error ? a : r && { v: r.values, e: r.errors, line: r.line }); };
    bCase('« Prix (DH) »', [['Nom', 'Prix (DH)'], ['Chemise', '250']], (r) => r.values.price === 250);
    bCase('« Désignation article » + « Prix de vente TTC »', [['Désignation article', 'Prix de vente TTC'], ['Chemise', '250']], (r) => r.values.name === 'Chemise' && r.values.price === 250);
    bCase('title row, line numbers follow the file', [['Catalogue 2026'], [], ['Nom', 'Prix'], ['Chemise', '250']], (r) => r.values.price === 250 && r.line === 4);
    bCase('« Prix d\'achat HT » is the cost, never the price', [['Nom', "Prix d'achat HT", 'Prix'], ['Chemise', '120', '250']], (r) => r.values.price === 250 && r.values.cost === 120);
    bCase('Excel-rounded barcode flagged', [['Nom', 'Prix', 'Code-barres'], ['Chemise', '250', '6,11123E+12']], (r) => r.errors.barcode === 'excel-barcode');
    bCase('a real barcode passes', [['Nom', 'Prix', 'EAN'], ['Chemise', '250', '6111234567890']], (r) => !r.errors.barcode && String(r.values.barcode) === '6111234567890');
    ok(run([['Rien'], ['x']]).error === 'no-name-column', 'bulk · still refuses a file with no name column');
  }
}

console.log(`import-robustness: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
