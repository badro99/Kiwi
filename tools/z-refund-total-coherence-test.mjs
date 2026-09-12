#!/usr/bin/env node
/* #0070 · « il me manque 330 dirhams ».
 *
 * Le Z de MixMax du 11/09 imprimait, l'un sous l'autre :
 *
 *     TOTAL ENCAISSÉ      12 651 MAD
 *       Espèces           12 321 MAD
 *     Remboursements (6)   - 330 MAD
 *
 * `gross` est le brut AVANT remboursements ; `methods` les porte déjà en
 * négatif. Le document démentait donc son propre total, du montant exact des
 * remboursements du service — et le commerçant a passé la nuit à chercher
 * 330 dirhams qui n'avaient jamais manqué.
 *
 * Ce contrôle exige la seule propriété qui rende un Z relisible : LE TOTAL
 * ANNONCÉ EST LA SOMME DE CE QUI EST LISTÉ DESSOUS. Il exécute l'encodeur
 * ESC/POS réel plutôt que de relire sa source.
 */
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const context = { window: {}, Uint8Array, btoa: (s) => Buffer.from(s, 'binary').toString('base64') };
vm.runInNewContext(read('assets/escpos.js'), context);

let passed = 0;
const ok = (label, cond) => { assert.ok(cond, label); passed++; console.log(`  ✓ ${label}`); };

const fmt = (n) => new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 }).format(n);
const print = (report) => Buffer.from(context.window.KiwiEscPos.dayReport({
  paper: '80', shop: 'Restaurant MixMax', title: 'RAPPORT JOURNALIER', fmt,
  methodLabels: { cash: 'Espèces', card: 'Carte' },
  report,
})).toString('latin1');

/* Le service réel du ticket : 148 ventes, 12 651 brut, 6 remboursements
 * pour 330, donc 12 321 réellement entrés — et pas un dirham de carte. */
const mixmax = print({
  day: '2026-09-11', txns: 148, gross: 12651, net: 12321, basket: 85.48,
  methods: { cash: 12321 },
  refunds: { count: 6, amount: 330 },
  categories: [],
  cash: { opening: 1800, sales: 12321, expected: 21950, counted: null, movements: [] },
});

const amountOn = (label) => {
  const m = mixmax.match(new RegExp(label + '\\s+\\-?\\s?([\\d   ,.]+) MAD'));
  return m ? Number(m[1].replace(/[^\d,.-]/g, '').replace(',', '.')) : null;
};

ok('le total encaissé est ce qui est réellement entré, pas le brut',
  amountOn('TOTAL ENCAISSÉ') === 12321);
ok('le brut reste imprimé, sous son vrai nom',
  amountOn('Ventes brutes') === 12651);
ok('les remboursements restent lisibles, avec leur compte',
  /Remboursements \(6\)\s+- /.test(mixmax) && amountOn('Remboursements \\(6\\)') === 330);
ok('la déduction est imprimée AVANT le total, jamais après',
  mixmax.indexOf('Remboursements (6)') < mixmax.indexOf('TOTAL ENCAISSÉ'));
ok('le total annoncé est la somme exacte des modes listés dessous',
  amountOn('TOTAL ENCAISSÉ') === amountOn('Espèces'));
ok('le tiroir attendu reste inchangé',
  amountOn('ATTENDU EN CAISSE') === 21950);

/* Sans remboursement, le document de tous les autres jours ne bouge pas. */
const plain = print({
  day: '2026-09-11', txns: 3, gross: 300, net: 300, basket: 100,
  methods: { cash: 300 }, refunds: { count: 0, amount: 0 }, categories: [],
  cash: { opening: 100, sales: 300, expected: 400, counted: null, movements: [] },
});
ok('un service sans remboursement imprime exactement comme avant',
  /TOTAL ENCAISSÉ\s+300 MAD/.test(plain) && !plain.includes('Ventes brutes')
  && !plain.includes('Remboursements'));

/* Une créance se retranche du même chiffre corrigé, pas du brut. */
const credit = print({
  day: '2026-09-11', txns: 4, gross: 1000, net: 900, basket: 250,
  methods: { cash: 700, credit: 200 }, receivable: 200,
  refunds: { count: 1, amount: 100 }, categories: [],
  cash: { opening: 0, sales: 700, expected: 700, counted: null, movements: [] },
});
ok('avec une créance, le net encaissé part du total corrigé',
  /TOTAL FACTURÉ\s+900 MAD/.test(credit) && /NET ENCAISSÉ\s+700 MAD/.test(credit));

/* Le second encodeur — impression navigateur / imprimante système — imprime
 * le MÊME Z. Deux mises en page d'un même tableau finissent par diverger. */
const bridge = read('assets/printer-bridge.js');
ok('l’encodeur navigateur applique la même correction',
  bridge.includes("R('Ventes brutes', money(r.gross));")
  && bridge.includes("R(recv > 0 ? 'TOTAL FACTURÉ' : 'TOTAL ENCAISSÉ', money(collected), 'kpr-b');")
  && !bridge.includes("money(r.gross), 'kpr-b')"));

/* Et l'écran de la caisse, qui affichait la même contradiction : « Encaissé
 * 12 651 » au-dessus de « Moyens de paiement · Espèces 12 321 ». */
const caisse = read('kiwi-caisse.html');
ok('l’écran Résumé annonce l’encaissé réel',
  caisse.includes("+ kpi('Encaissé', fmtMAD(collected))")
  && caisse.includes('<em>${rpEsc(fmtMAD(collected))}</em>'));
ok('l’écran garde le brut visible dans les ajustements',
  caisse.includes("adj += row('Ventes brutes', fmtMAD(r.gross));"));

console.log(`\nz-refund-total-coherence-test: ${passed} controls passed\n`);
