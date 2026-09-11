#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · L'INVENTAIRE PHYSIQUE EN CAISSE (assets/pos-inventory-count.js)
 *
 * Le comptage s'ouvrait sur « 0 / 0 articles · Aucun article correspondant »,
 * devant un inventaire de deux produits et sept déclinaisons affiché juste
 * derrière. Le module appelait `KiwiBoutiqueCatalog.export()` et `stockOf()` :
 * deux méthodes qui n'ont jamais existé. `export` valant `undefined`, le
 * ternaire retombait sur `null`, la liste des variantes restait vide — et
 * comme lire une propriété absente rend `undefined` et non une exception,
 * la console est restée muette. Le caissier voyait un écran vide sans rien à
 * signaler ; la fonctionnalité était morte depuis sa livraison.
 *
 * Cette suite garde donc DEUX choses, et la première est la plus importante :
 *
 *  1. LE CONTRAT. Chaque méthode de KiwiBoutiqueCatalog que ce fichier appelle
 *     doit exister sur le vrai module. Un renommage côté catalogue casse le
 *     build, pas l'écran du caissier.
 *  2. LE COMPTAGE. Sur un vrai catalogue, une ligne par déclinaison, le stock
 *     système matérialisé (pas le socle), un code-barres qui est du TEXTE.
 * ─────────────────────────────────────────────────────────────────────────── */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let passed = 0;
const failures = [];
const ok = (cond, msg) => { if (cond) passed++; else { failures.push(msg); console.error(`  ✗ ${msg}`); } };

console.log('■ Inventaire physique en caisse (pos-inventory-count)');

const src = fs.readFileSync(path.join(ROOT, 'assets/pos-inventory-count.js'), 'utf8');
/* Le CODE seul. Les commentaires de ce fichier NOMMENT les deux méthodes
   fantômes pour expliquer pourquoi elles en sont sorties ; les chercher dans
   le texte brut ferait échouer la suite sur son propre récit. */
const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

/* ── un navigateur en carton, juste assez pour charger les vrais modules ─── */
function browser() {
  const store = new Map();
  const localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    key: (i) => [...store.keys()][i],
    get length() { return store.size; },
  };
  const el = () => ({ style: {}, dataset: {}, setAttribute() {}, appendChild() {},
    querySelector: () => null, querySelectorAll: () => [], addEventListener() {},
    classList: { add() {}, remove() {}, toggle() {} }, focus() {} });
  const document = { addEventListener() {}, removeEventListener() {}, createElement: el,
    getElementById: () => null, head: { appendChild() {} },
    body: { appendChild() {}, classList: { add() {}, remove() {} } },
    querySelector: () => null, querySelectorAll: () => [], visibilityState: 'visible' };
  const window = { localStorage, addEventListener() {}, removeEventListener() {},
    dispatchEvent() {}, location: { href: 'https://kiwi-os.com/kiwi-caisse.html', search: '' },
    navigator: { onLine: true } };
  window.window = window; window.document = document;
  const g = { window, document, localStorage, setTimeout, clearTimeout,
    setInterval: () => 0, clearInterval() {}, console,
    fetch: async () => ({ ok: false, json: async () => ({}) }),
    navigator: window.navigator, location: window.location,
    requestAnimationFrame: (f) => setTimeout(f, 0),
    CustomEvent: class { constructor(t, o) { this.type = t; Object.assign(this, o); } } };
  const run = (file) => {
    const names = Object.keys(g);
    // eslint-disable-next-line no-new-func
    new Function(...names, fs.readFileSync(path.join(ROOT, file), 'utf8'))(...names.map((n) => g[n]));
  };
  return { window, run };
}

/* ── 1. LE CONTRAT — ce que le module appelle doit exister ───────────────── */
const bare = browser();
bare.run('assets/color-palette.js');
bare.run('assets/barcode.js');
bare.run('assets/boutique-catalog.js');
const CAT_API = bare.window.KiwiBoutiqueCatalog;
ok(!!CAT_API, 'le vrai catalogue boutique se charge');

const called = Array.from(new Set(
  Array.from(code.matchAll(/(?:KiwiBoutiqueCatalog|\bcat)\.([A-Za-z_$][\w$]*)/g)).map((m) => m[1])
)).filter((n) => n !== 'listProducts' || true);
ok(called.length >= 3, `${called.length} méthodes du catalogue appelées ici : ${called.join(', ')}`);
called.forEach((name) => {
  ok(typeof CAT_API[name] === 'function',
    `KiwiBoutiqueCatalog.${name}() existe vraiment (c'est ce contrôle qui manquait)`);
});
/* Les deux fantômes, nommément. Ils ne doivent jamais revenir. */
ok(!/\.export\s*\(/.test(code) && !/\bexport\s*\?/.test(code),
  'plus aucun appel à export(), qui n’a jamais existé sur le catalogue');
ok(!/stockOf\s*\(/.test(code), 'plus aucun appel à stockOf(), qui n’a jamais existé non plus');
ok(!/barcodes\s*&&\s*\w+\.barcodes\[0\]/.test(code) && /primaryBarcode/.test(code),
  'le code-barres passe par primaryBarcode() : barcodes[0] est un OBJET, pas un code');

/* ── 2. LE COMPTAGE sur un vrai catalogue ────────────────────────────────── */
function seeded() {
  const b = browser();
  b.run('assets/color-palette.js');
  b.run('assets/barcode.js');
  b.run('assets/boutique-catalog.js');
  const CAT = b.window.KiwiBoutiqueCatalog;
  /* Un magasin qui n'est pas la vitrine de démo : sinon le catalogue s'amorce
     tout seul avec ses 22 articles de démonstration et le témoin ne dit plus
     rien de ce que ce test veut prouver. */
  CAT.use('boutique-temoin');
  const c = CAT.addCategory('T-shirt', 'atlas');
  const p1 = CAT.addProduct({ name: 'T-Shirt Blanc', categoryId: c.id, priceMAD: 300, cost: 150, kind: 'taille' });
  ['blanc', 'noir'].forEach((col) => ['M', 'L', 'XL'].forEach((sz) => {
    const v = CAT.addVariant({ productId: p1.id, colorId: col, size: sz, stock: 9 });
    CAT.generateBarcode(v.id);
  }));
  const p2 = CAT.addProduct({ name: 'Polo Stretch', categoryId: c.id, priceMAD: 400, cost: 210, kind: 'tu' });
  CAT.generateBarcode(CAT.addVariant({ productId: p2.id, colorId: 'bleu', size: 'TU', stock: 1 }).id);
  b.run('assets/pos-inventory-count.js');
  return { CAT, KPI: b.window.KiwiPosInventoryCount, window: b.window };
}

const S = seeded();
ok(typeof S.KPI._loadItems === 'function', 'le chargeur de lignes est exposé pour être vérifiable');
const stats = S.CAT.stats();
ok(stats.products === 2 && stats.variants === 7, `catalogue témoin : ${stats.products} produits · ${stats.variants} déclinaisons`);

const lines = S.KPI._loadItems('boutique');
ok(lines.length === 7, `${lines.length} lignes à compter — une par déclinaison (c'était 0)`);
ok(lines.reduce((s, l) => s + l.systemQty, 0) === stats.totalStock,
  'le stock système du comptage égale celui de la grille, à l’unité près');
ok(lines.every((l) => typeof l.barcode === 'string' && typeof l.sku === 'string'),
  'code-barres et référence sont du TEXTE, douchables et cherchables');
ok(lines.some((l) => l.barcode.length === 13), 'au moins une déclinaison porte un EAN-13 complet');
ok(new Set(lines.map((l) => l.barcode)).size === lines.length,
  'deux déclinaisons ne partagent pas un code-barres');
ok(lines.every((l) => l.unitCost > 0), 'le coût vient du PRODUIT — il vaut 0 s’il est lu sur la déclinaison');
ok(lines.every((l) => l.productName && l.size), 'chaque ligne nomme son article et sa taille');
ok(lines.filter((l) => l.color).length >= 6, 'la couleur suit la déclinaison quand il y en a une');
ok(lines.every((l) => l.variantId && l.itemId && l.key.startsWith('v_')),
  'chaque ligne garde de quoi être rapprochée du catalogue à la validation');

/* Comptage À L'AVEUGLE : les quantités partent vides, jamais préremplies. */
ok(lines.every((l) => l.countedQty === 0 && l.counted === false),
  'aucune quantité n’est préremplie — le comptage reste à l’aveugle');

/* ── 3. LA MAISON COMPTE LE MÊME STOCK ───────────────────────────────────── */
const maison = S.KPI._loadItems('maison');
ok(maison.length === lines.length,
  'la caisse Maison compte les mêmes déclinaisons (elle passait par le moteur ingrédients et n’en trouvait aucune)');

/* ── 4. LE MOTEUR INGRÉDIENTS N'EST PAS TOUCHÉ ───────────────────────────── */
S.window.stockItems = [
  { id: 'far', name: 'Farine', unit: 'kg', stock: 12, cost: 8 },
  { id: 'suc', name: 'Sucre', unit: 'kg', stock: 5, cost: 11 },
];
const ledger = S.KPI._loadItems('ledger');
ok(ledger.length === 2 && ledger[0].unit === 'kg',
  'le moteur « ledger » compte toujours les ingrédients, avec leur unité');
ok(S.KPI._loadItems('vertical-inconnu').length === 2,
  'un moteur inconnu retombe sur les ingrédients — il ne compte pas le catalogue par hasard');

/* ── 5. LES TROIS APPELANTS DEMANDENT UN MOTEUR CONNU ────────────────────── */
const engines = (code.match(/CATALOG_ENGINES = \[([^\]]*)\]/) || [, ''])[1]
  .split(',').map((s) => s.trim().replace(/['"]/g, '')).filter(Boolean);
ok(engines.includes('boutique') && engines.includes('maison'),
  `les moteurs adossés au catalogue sont nommés : ${engines.join(', ')}`);
const callers = [
  ['assets/pos-boutique.js', 'boutique'],
  ['assets/pos-maison.js', 'maison'],
  ['kiwi-caisse.html', 'ledger'],
];
callers.forEach(([file, engine]) => {
  const s = fs.readFileSync(path.join(ROOT, file), 'utf8');
  const asked = Array.from(new Set(
    Array.from(s.matchAll(/KiwiPosInventoryCount[\s\S]{0,80}?engine:\s*'([a-z-]+)'/g)).map((m) => m[1])
  ));
  ok(asked.includes(engine), `${file} ouvre le comptage avec le moteur « ${engine} »`);
  ok(asked.every((e) => engines.includes(e) || e === 'ledger'),
    `${file} ne demande aucun moteur que le module ne connaît pas`);
});

/* ── 6. LA REVUE RESTE LE SEUL CHEMIN D'ÉCRITURE ─────────────────────────── */
ok(/'submitted'/.test(code), 'la transmission reste un document soumis, pas un ajustement');
ok(!/setStock|adjustStock|receiveStock/.test(code),
  'le comptage n’écrit JAMAIS dans le stock : il attend la validation du propriétaire');

console.log(`\n✓ ${passed} contrôles verts (${failures.length} échec(s))`);
if (failures.length) process.exit(1);
