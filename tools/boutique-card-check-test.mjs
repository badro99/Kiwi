/* Clôture boutique et maison · le total carte du terminal (TPE) comparé à Kiwi
 * (propriétaire, 22 nov. 2026). La caisse restaurant le demandait déjà ; les
 * deux caisses de détail ne comptaient que le tiroir, et un ticket carte
 * oublié ou encaissé deux fois ne se voyait nulle part. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { cardCheckParse, cardCheckResult, cardCheckHtml, cardCheckValue } =
  await import(path.join(ROOT, 'assets/pos-boutique/card-check.js'));

let n = 0;
const check = (ok, label) => { assert.ok(ok, label); n++; console.log('  ✓', label); };
const fmt = (v) => Number(v).toFixed(2) + ' MAD';

/* Lecture du champ : vide = non vérifié, illisible = NaN, sinon au centime. */
check(cardCheckParse('') === null, 'un champ vide n’est pas une saisie');
check(cardCheckParse('  ') === null, 'des espaces non plus');
check(cardCheckParse('1250,5') === 1250.5, 'la virgule décimale est lue');
check(cardCheckParse('0') === 0, 'zéro est une vraie saisie');
check(Number.isNaN(cardCheckParse('-3')), 'un total négatif est refusé');
check(Number.isNaN(cardCheckParse('12.345')), 'pas de millième de dirham');

/* Le résultat, avec les mots de la caisse restaurant. */
check(cardCheckResult(800, null, fmt).text === 'À saisir', 'rien saisi : À saisir');
check(cardCheckResult(800, 800, fmt).cls === 'is-ok', 'TPE = Kiwi : rapproché');
check(/Rapproché/.test(cardCheckResult(800, 800, fmt).text), 'le mot Rapproché');
const over = cardCheckResult(800, 950, fmt);
check(over.cls === 'is-off' && over.text === 'Terminal + 150.00 MAD', 'le terminal a encaissé plus que Kiwi');
const under = cardCheckResult(0.3, 0.1, fmt);
check(under.cls === 'is-off' && under.text === 'Kiwi + 0.20 MAD', 'Kiwi a plus que le terminal, au centime (0,3 − 0,1)');
check(cardCheckResult(800, NaN, fmt).text === 'Montant invalide', 'une saisie illisible le dit');

/* Le bloc affiche le total carte de Kiwi et un champ facultatif. */
const html = cardCheckHtml(1234.5, fmt);
check(html.includes('1234.50 MAD'), 'le total carte de Kiwi est affiché');
check(html.includes('id="bqclo-card"') && !/required/.test(html), 'le champ TPE existe et ne bloque pas la clôture');
check(html.includes('clo-card-box') && html.includes('clo-ecart-line'), 'mêmes classes que le bloc restaurant');

/* La valeur lue à la fermeture. */
const rootWith = (value) => ({ querySelector: (s) => (s === '#bqclo-card' ? { value } : null) });
check(cardCheckValue(rootWith('640')) === 640, 'la valeur saisie part au rapport');
check(cardCheckValue(rootWith('')) === null, 'vide : non vérifié');
check(cardCheckValue(rootWith('abc')) === null, 'illisible : non vérifié, la clôture passe');
check(cardCheckValue(null) === null, 'sans feuille : non vérifié');

/* Les deux caisses de détail montent le bloc et passent le total au rapport,
 * jamais au ticket des livraisons (le livreur n'a pas de TPE). */
for (const f of ['assets/pos-boutique.js', 'assets/pos-maison.js']) {
  const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
  check(/from '\.\/pos-boutique\/card-check\.js\?v=\d+'/.test(src), `${f} importe card-check.js`);
  check(/cardCheckHtml\(/.test(src) && /cardCheckWire\(/.test(src), `${f} affiche le bloc TPE à la clôture`);
  check(/terminalCardTotal:\s*only === 'delivery' \? null : bqCardZ/.test(src), `${f} passe le total TPE au rapport, pas aux livraisons`);
  check((src.match(/bqCardZ = cardCheckValue\(/g) || []).length >= 2, `${f} relit le TPE avant l’impression et à la fermeture`);
}

/* Le rapport du jour sait déjà comparer : day-report.js cardReconciliation. */
const dr = fs.readFileSync(path.join(ROOT, 'assets/day-report.js'), 'utf8');
check(/cardReconciliation\(methods, sess\.terminalCardTotal/.test(dr), 'le rapport lit session.terminalCardTotal');

console.log(`\nboutique-card-check-test: ${n} contrôles verts.`);
