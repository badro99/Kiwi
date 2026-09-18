#!/usr/bin/env node
/* Kiwi · un code-barres déjà présent sur l'article devient LE code de la variante.
 *
 * « Code existant » enregistrait le code comme alias caché dès que Kiwi en avait
 * déjà généré un : la ligne et l'étiquette gardaient le 2000000000046 généré, et le
 * commerçant (La Maison en Vogue, Voile-gm) croyait que rien n'était enregistré.
 * Règle : un code réellement porté par l'article l'emporte sur un code que Kiwi a
 * fabriqué ; le code généré reste rattaché (une étiquette déjà collée scanne encore). */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let passed = 0;
const ok = (value, message) => {
  if (!value) { console.error('  ✗ ' + message); process.exitCode = 1; }
  else passed++;
};
const eq = (actual, expected, message) => ok(actual === expected,
  `${message} — attendu ${JSON.stringify(expected)}, obtenu ${JSON.stringify(actual)}`);

function browser() {
  const store = new Map();
  const localStorage = {
    getItem: (k) => store.has(k) ? store.get(k) : null,
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    get length() { return store.size; },
    key: (i) => Array.from(store.keys())[i],
  };
  const node = () => ({ style: {}, classList: { add() {}, remove() {} }, appendChild() {}, addEventListener() {}, setAttribute() {} });
  const document = {
    addEventListener() {}, dispatchEvent() {}, createElement: node,
    getElementById: () => null, querySelector: () => null, querySelectorAll: () => [],
    head: node(), body: node(),
  };
  const window = {
    document, localStorage, addEventListener() {}, removeEventListener() {},
    KiwiEnv: { isReal: () => false, local: true, hosted: false, demosAllowed: true },
    CustomEvent: class { constructor(type, opts) { this.type = type; this.detail = (opts || {}).detail; } },
    navigator: { userAgent: 'node' }, setTimeout, clearTimeout,
    fetch: () => Promise.reject(new Error('offline test')),
  };
  window.window = window;
  return window;
}

function load(win, rel) {
  const src = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  const run = new Function('window', 'document', 'localStorage', 'CustomEvent', 'navigator',
    'setTimeout', 'clearTimeout', 'fetch', 'self', 'console', src);
  run(win, win.document, win.localStorage, win.CustomEvent, win.navigator,
    win.setTimeout, win.clearTimeout, win.fetch, win, console);
}


const KEYP = 'kiwiBoutiqueCatalog:v1:';
const boot = (win) => {
  load(win, 'assets/barcode.js');
  load(win, 'assets/color-palette.js');
  load(win, 'assets/boutique-catalog.js');
  return win.KiwiBoutiqueCatalog;
};
const primaries = (v) => (v.barcodes || []).filter((b) => b.primary);
const variantIn = (C, pid) => C.listVariants(pid)[0];
const OLD = '1631129930';

/* 1 · Le cas Voile-gm : code généré d'abord, code existant ensuite. */
{
  const C = boot(browser());
  const p = C.addProduct({ name: 'Voile-gm', priceMAD: 600 });
  const v = C.addVariant({ productId: p.id, colorId: 'transparent', size: 'TU', stock: 3 });
  const gen = C.generateBarcode(v.id);
  ok(/^2\d{12}$/.test(String(gen)), 'un code interne Kiwi est généré');
  const r = C.attachBarcode(v.id, OLD);
  ok(r.ok, 'le code existant est accepté');
  const live = variantIn(C, p.id);
  eq(C.primaryBarcode(live), OLD, "le code existant devient le code affiché et imprimé");
  eq(primaries(live).length, 1, 'une seule référence principale');
  ok(live.barcodes.some((b) => b.code === gen && !b.primary), 'le code généré reste rattaché, en second');
  eq(C.findByBarcode(gen) && C.findByBarcode(gen).variant.id, v.id, 'une étiquette générée déjà collée scanne encore');
  eq(C.findByBarcode(OLD) && C.findByBarcode(OLD).variant.id, v.id, 'le code existant scanne');
}

/* 2 · La fiche déjà touchée en production : alias caché derrière le généré.
       Ressaisir le même code doit la réparer, pas répondre « déjà rattaché ». */
{
  const a = browser();
  const CA = boot(a);
  const p = CA.addProduct({ name: 'Voile-gm', priceMAD: 600 });
  const v = CA.addVariant({ productId: p.id, colorId: 'transparent', size: 'TU', stock: 3 });
  const gen = CA.generateBarcode(v.id);
  const key = Array.from({ length: a.localStorage.length }, (_, i) => a.localStorage.key(i)).find((k) => k.startsWith(KEYP));
  ok(!!key, 'le catalogue est persisté');
  const doc = JSON.parse(a.localStorage.getItem(key));
  const dv = doc.variants.find((x) => x.id === v.id);
  dv.barcodes.push({ code: OLD, type: 'imported', sym: '', primary: false, at: 1 });
  const b = browser();
  for (let i = 0; i < a.localStorage.length; i++) { const k = a.localStorage.key(i); b.localStorage.setItem(k, a.localStorage.getItem(k)); }
  b.localStorage.setItem(key, JSON.stringify(doc));
  const CB = boot(b);
  eq(CB.primaryBarcode(variantIn(CB, p.id)), gen, 'état reproduit : le généré masque le code existant');
  const r = CB.attachBarcode(v.id, OLD);
  ok(r.ok, 'la ressaisie est acceptée');
  const live = variantIn(CB, p.id);
  eq(CB.primaryBarcode(live), OLD, 'la ressaisie promeut le code existant');
  eq(primaries(live).length, 1, 'toujours une seule référence principale');
}

/* 3 · Deux codes réellement portés : le premier reste la référence, le second est un alias. */
{
  const C = boot(browser());
  const p = C.addProduct({ name: 'Nappe', priceMAD: 200 });
  const v = C.addVariant({ productId: p.id, colorId: 'blanc', size: 'TU', stock: 1 });
  ok(C.attachBarcode(v.id, '3760123450017').ok, 'premier code fournisseur');
  ok(C.attachBarcode(v.id, OLD).ok, 'second code existant');
  const live = variantIn(C, p.id);
  eq(C.primaryBarcode(live), '3760123450017', "un code existant ne détrône pas un autre code existant");
  eq(primaries(live).length, 1, 'une seule référence principale');
}

/* 4 · Variante sans code : le code existant devient la référence (inchangé). */
{
  const C = boot(browser());
  const p = C.addProduct({ name: 'Serviette', priceMAD: 90 });
  const v = C.addVariant({ productId: p.id, colorId: 'blanc', size: 'TU', stock: 1 });
  ok(C.attachBarcode(v.id, OLD).ok, 'code existant sur variante vierge');
  eq(C.primaryBarcode(variantIn(C, p.id)), OLD, 'il devient la référence');
}

/* 5 · Doublon sur une AUTRE variante : toujours refusé. */
{
  const C = boot(browser());
  const p = C.addProduct({ name: 'Plaid', priceMAD: 300 });
  const v1 = C.addVariant({ productId: p.id, colorId: 'blanc', size: 'TU', stock: 1 });
  const v2 = C.addVariant({ productId: p.id, colorId: 'noir', size: 'TU', stock: 1 });
  ok(C.attachBarcode(v1.id, OLD).ok, 'rattaché à la première');
  const r = C.attachBarcode(v2.id, OLD);
  ok(!r.ok && r.reason === 'doublon', 'refusé sur la seconde');
}

/* 6 · Le tableau de bord promeut, la caisse porte encore l'ancienne copie :
       la fusion ne doit pas ressusciter le code généré comme référence. */
{
  const a = browser();
  const CA = boot(a);
  const p = CA.addProduct({ name: 'Voile-gm', priceMAD: 600 });
  const v = CA.addVariant({ productId: p.id, colorId: 'transparent', size: 'TU', stock: 3 });
  const gen = CA.generateBarcode(v.id);
  const key = Array.from({ length: a.localStorage.length }, (_, i) => a.localStorage.key(i)).find((k) => k.startsWith(KEYP));
  const stale = JSON.parse(a.localStorage.getItem(key));
  const t0 = Date.now(); while (Date.now() === t0) { /* horloge strictement plus tard */ }
  CA.attachBarcode(v.id, OLD);
  const fresh = JSON.parse(a.localStorage.getItem(key));
  for (const [mine, theirs, label] of [[stale, fresh, 'caisse ← tableau de bord'], [fresh, stale, 'tableau de bord ← caisse']]) {
    const out = CA._merge(mine, theirs);
    const mv = out.variants.find((x) => x.id === v.id);
    eq(CA.primaryBarcode(mv), OLD, `fusion ${label} : le code existant reste la référence`);
    eq(primaries(mv).length, 1, `fusion ${label} : une seule référence principale`);
    ok(mv.barcodes.some((b) => b.code === gen), `fusion ${label} : le code généré reste rattaché`);
  }
}

if (process.exitCode) console.error(`boutique-existing-barcode-test: échec (${passed} assertions passées)`);
else console.log(`boutique-existing-barcode-test: ${passed} assertions OK`);
