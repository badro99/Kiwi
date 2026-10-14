#!/usr/bin/env node
/* ═════════════════════════════════════════════════════════════════
 * Kiwi · les compteurs de « Mon compte » et les méthodes de paiement
 * ne lisent que le commerce affiché.
 *
 *   node tools/account-scope-test.mjs
 *
 * 1 · account.js › scanCount prenait le PLUS GRAND magasin parmi toutes les clés
 *     `kiwi*plandesalle*` / `*client*` / `*reserv*` du navigateur, et teamCount la
 *     plus grande équipe de tous les établissements : le plan de salle d'un autre
 *     magasin, ou d'un compte précédent, gonflait « tables sur le plan ».
 *     Seules comptent désormais les clés qui portent l'identifiant du commerce
 *     affiché (`:<id>` ou `@<slug>`).
 * 2 · interactive.js › « Méthodes de paiement » retombait sur la clé GLOBALE
 *     `kiwiSet:methods`, ou sur la liste de la démo pour un vrai commerçant qui
 *     n'avait rien choisi. La clé porte maintenant le compte et le magasin, et la
 *     liste de la démo ne s'affiche qu'à une démo.
 * Les extraits viennent des fichiers livrés. Valeurs d'essai fabriquées.
 * ═════════════════════════════════════════════════════════════════ */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = process.env.KIWI_ROOT || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ACC = fs.readFileSync(path.join(ROOT, 'assets/account.js'), 'utf8');
const IA = fs.readFileSync(path.join(ROOT, 'assets/interactive.js'), 'utf8');

let passed = 0, failed = 0;
function ok(label, fn) {
  try { fn(); passed++; console.log(`  ✓ ${label}`); }
  catch (e) { failed++; console.log(`  ✗ ${label}\n      ${String(e.message).split('\n')[0]}`); }
}
function grab(src, start) {
  const i = src.indexOf(start);
  assert.ok(i >= 0, start + ' introuvable');
  let d = 0;
  for (let k = src.indexOf('{', i); k < src.length; k++) {
    if (src[k] === '{') d++; else if (src[k] === '}' && --d === 0) return src.slice(i, k + 1);
  }
  throw new Error('unbalanced ' + start);
}
function memStore(init) {
  const m = new Map(Object.entries(init || {}));
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); }, key: (i) => [...m.keys()][i] ?? null, get length() { return m.size; },
  };
}
const arr = (n) => JSON.stringify({ tables: Array.from({ length: n }, (_, i) => ({ id: 't' + i })) });

/* ── 1 · scanCount / teamCount ──────────────────────────────────────────── */
const a = ACC.indexOf('const scopeIds = (() => {');
const b = ACC.indexOf('const salesT = ');
const t0 = ACC.indexOf('const teamCount = (() => {');
const t1 = ACC.indexOf('const aiCount = ');
ok('les extraits d’account.js sont retrouvés', () => assert.ok(a > 0 && b > a && t0 > 0 && t1 > t0));
const scanSrc = ACC.slice(a, b);
const teamSrc = ACC.slice(t0, t1);
function counters(ls, win) {
  const code = 'const lsJson = (k) => { try { return JSON.parse(localStorage.getItem(k)); } catch (_) { return null; } };\n'
    + scanSrc + '\n' + teamSrc + '\nreturn { scanCount, teamCount };';
  return new Function('localStorage', 'window', code)(ls, win);
}
const venue = (id, slug) => ({ KiwiVenue: { getVenue: () => id, slugOf: () => slug, tenantOf: () => slug, getCurrentVenueData: () => ({ id, slug }) } });

ok('seul le plan du magasin affiché est compté (pas le plus grand de l’appareil)', () => {
  const ls = memStore({
    'kiwiPlanDeSalle:v100': arr(3),
    'kiwiPlanDeSalle:slug:mon-cafe': arr(3),
    'kiwiPlanDeSalle:v999': arr(40),                 // un autre magasin
    'kiwiPlanDeSalle:slug:autre-resto': arr(55),     // le compte précédent
    'kiwiPlanDeSalle:own@autre-resto': arr(60),
  });
  const C = counters(ls, Object.assign({ __kiwiTeamV2: { byVenue: {} } }, venue('v100', 'mon-cafe')));
  assert.equal(C.scanCount('plandesalle', 'tables'), 3);
});
ok('une clé sans identifiant de commerce ne compte pas', () => {
  const ls = memStore({ kiwiPlanDeSalle: arr(30), 'kiwiPlanDeSalle:default': arr(30) });
  const C = counters(ls, Object.assign({ __kiwiTeamV2: { byVenue: {} } }, venue('v100', 'mon-cafe')));
  assert.equal(C.scanCount('plandesalle', 'tables'), 0);
});
ok('les clients du carnet courant, pas ceux d’un autre carnet', () => {
  const book = (n) => JSON.stringify(Array.from({ length: n }, (_, i) => ({ id: 'c' + i })));
  const ls = memStore({ 'kiwi:clients:v1:mon-cafe': book(4), 'kiwi:clients:v1:autre-resto': book(90) });
  const C = counters(ls, Object.assign({ __kiwiTeamV2: { byVenue: {} } }, venue('v100', 'mon-cafe')));
  assert.equal(C.scanCount('client', 'clients'), 4);
});
ok('l’équipe du magasin affiché, pas la plus grande de tous', () => {
  const team = { byVenue: { v100: [{}, {}], v999: new Array(12).fill({}) } };
  const C = counters(memStore({}), Object.assign({ __kiwiTeamV2: team }, venue('v100', 'mon-cafe')));
  assert.equal(C.teamCount, 2);
});
ok('aucun magasin résolu : tout reste à zéro, jamais le chiffre d’ailleurs', () => {
  const ls = memStore({ 'kiwiPlanDeSalle:v999': arr(40) });
  const C = counters(ls, Object.assign({ __kiwiTeamV2: { byVenue: { v999: [{}, {}] } } }, venue('', '')));
  assert.equal(C.scanCount('plandesalle', 'tables') + C.teamCount, 0);
});

/* ── 2 · méthodes de paiement ───────────────────────────────────────────── */
function methods(ls, win) {
  const def = IA.match(/const METHODS_DEMO_DEFAULT = [^;]+;/)[0];
  const src = def + '\n' + grab(IA, 'function methodsKey()') + '\n' + grab(IA, 'function methodsSaved()')
    + '\nreturn { methodsKey, methodsSaved };';
  return new Function('localStorage', 'window', src)(ls, win);
}
const real = (isReal, vid) => ({ KiwiEnv: { isReal: () => isReal }, KiwiVenue: { getVenue: () => vid } });

ok('vrai commerçant sans choix : rien (jamais la liste de la démo), même si la clé globale existe', () => {
  const ls = memStore({ kiwiAccountKey: 'a@example.test', 'kiwiSet:methods': 'Cash · CMI' });
  const M = methods(ls, real(true, 'v100'));
  assert.equal(M.methodsSaved(), '');
});
ok('démo : la liste de la démo (ou l’ancienne clé) reste proposée', () => {
  assert.equal(methods(memStore({}), real(false, 'cafeAtlas')).methodsSaved(), 'Visa · Mastercard · Kiwi Tap · QR');
  assert.equal(methods(memStore({ 'kiwiSet:methods': 'Cash' }), real(false, 'cafeAtlas')).methodsSaved(), 'Cash');
});
ok('le choix est rangé par compte ET par magasin', () => {
  const ls = memStore({ kiwiAccountKey: 'A@Example.test' });
  const M = methods(ls, real(true, 'v100'));
  assert.equal(M.methodsKey(), 'kiwi:methods:a@example.test|v100');
  ls.setItem(M.methodsKey(), 'Espèces · CMI');
  assert.equal(M.methodsSaved(), 'Espèces · CMI');
  ls.setItem('kiwiAccountKey', 'b@example.test');
  assert.equal(methods(ls, real(true, 'v100')).methodsSaved(), '', 'un autre compte ne lit pas ce choix');
  ls.setItem('kiwiAccountKey', 'a@example.test');
  assert.equal(methods(ls, real(true, 'v200')).methodsSaved(), '', 'un autre magasin non plus');
});
ok('le code livré n’écrit plus et ne lit plus la clé globale pour un vrai commerçant', () => {
  assert.ok(!/localStorage\.setItem\('kiwiSet:methods'/.test(IA));
  assert.ok(/localStorage\.setItem\(methodsKey\(\)/.test(IA));
  assert.ok(!/getSet\('methods'/.test(IA));
});

console.log(`\n${failed ? '✗' : '✓'} account-scope : ${passed} ok, ${failed} en échec`);
process.exit(failed ? 1 : 0);
