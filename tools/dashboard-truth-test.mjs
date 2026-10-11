#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
 * TABLEAU DE BORD · CE QUE LES CARTES AFFIRMENT
 *
 * Passe « vérité » du 2026-10-11, sur le stack local, un café réel :
 *  - « Heures de pointe » affichait des « couverts » ; une vente n'en porte
 *    pas, la carte comptait des tickets.
 *  - « Score de santé » et « Vous vs établissements similaires » promettaient
 *    un chiffre « après vos premières semaines » que Kiwi ne calcule pour
 *    aucun vrai commerce. Masquées hors démo ; le compteur « Plus
 *    d'analyses » suit.
 *  - « Ventes par canal » disait « indisponible » avant la première vente.
 *  - « Objectif du jour » montrait le chiffre du jour à la place de
 *    l'objectif quand aucun n'était fixé.
 *  - L'anneau « Mix de paiement » portait 16 590 de démo dans le HTML.
 *
 * Rapport journalier : sans instantané de la caisse, l'heure de la première
 * vente s'affichait sous « Ouverture » (11:48 pour un service ouvert la veille
 * à 23:50).
 *
 *   node tools/dashboard-truth-test.mjs
 * ═══════════════════════════════════════════════════════════════════════════ */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = process.env.KIWI_ROOT || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => readFileSync(path.join(ROOT, f), 'utf8');
const DR = read('assets/dateRange.js');
const VX = read('assets/design-vexel-layout.js');
const DASH = read('dashboard.html');
const DRD = read('assets/day-report-dash.js');

let passed = 0, failed = 0;
function ok(label, fn) {
  try { fn(); passed++; console.log(`  ✓ ${label}`); }
  catch (e) { failed++; console.log(`  ✗ ${label}\n      ${String(e.message).split('\n')[0]}`); }
}
function body(src, name) {
  const i = src.indexOf('function ' + name + '(');
  assert.ok(i >= 0, name + ' found');
  let d = 0;
  for (let k = src.indexOf('{', i); k < src.length; k++) {
    if (src[k] === '{') d++; else if (src[k] === '}' && --d === 0) return src.slice(i, k + 1);
  }
  throw new Error('unbalanced ' + name);
}

ok('real peak hours count orders and say so', () => {
  assert.ok(/covers: cov\[i\], unit: 'orders'/.test(body(DR, 'buildHeatmap')));
  assert.ok(/d\.unit === 'orders' \? \(ORDERS_LABEL\[lang\]/.test(body(DR, 'renderHeatmap')));
});

for (const [fn, label] of [['renderHealth', 'health score'], ['renderBench', 'peer benchmark']]) {
  ok(`${label}: hidden for a real store, shown again for the demo`, () => {
    const b = body(DR, fn);
    const real = b.slice(0, b.indexOf('return;'));
    assert.ok(/card\.hidden = true;/.test(real), 'real branch hides the card');
    assert.ok(/card\.hidden = false;/.test(b.slice(b.indexOf('return;'))), 'demo branch unhides it');
  });
}
ok('their empty copy no longer promises a future figure', () => {
  const copy = DR.slice(DR.indexOf('const HEALTH_EMPTY = {'), DR.indexOf('const PRODUCTS_EMPTY = {'));
  assert.ok(copy.length > 200, 'copy block found');
  assert.ok(!/premières semaines|à venir|coming soon|Dès que vous|Once you|قريبًا|بعد أسابيعك/.test(copy));
});

ok('"Plus d\'analyses" counts only visible analyses, and recounts when one hides', () => {
  assert.ok(/more\.querySelectorAll\('\.block'\), \(b\) => !b\.hidden && !\('integCard' in b\.dataset\)\)\.length/.test(DASH));
  assert.ok(/observe\(pool, \{ attributes: true, attributeFilter: \['hidden'\], subtree: true \}\)/.test(VX));
});

ok('channels say "Aucune vente" before the first sale, "indisponible" only for unlabelled sales', () => {
  assert.ok(/hasAmounts \? copy\.share : \(total > 0 \? copy\.unavailable : copy\.noSales\)/.test(VX));
  assert.ok(/noSales: 'Aucune vente'/.test(VX) && /noSales: 'No sales'/.test(VX));
});

ok('goal card shows no amount when no goal is set', () => {
  assert.ok(/setText\(currentTarget, goalUnset \? '·' : amountText\)/.test(VX));
});

ok('payment mix ships no demo figure in its markup', () => {
  assert.ok(/data-mix-center-amt>·</.test(DASH));
  assert.ok(!/data-mix-center-amt>16 590/.test(DASH));
});

ok('day report names the first sale as such when the opening time is unknown', () => {
  assert.ok(/openedKnown: !!num\(sess\.openedAt\),/.test(read('assets/day-report.js')), 'the report records whether the till gave an opening time');
  assert.ok(/var openedKnown = r\.openedAt && r\.openedKnown !== false;\s*if \(openedKnown\) push\(T\(L\.openedAt\)[\s\S]{0,40}else push\(T\(L\.firstSale\)/.test(DRD));
  assert.ok(/openedLabel: r\.openedAt && r\.openedKnown !== false \? hm\(r\.openedAt\) : ''/.test(DRD), 'the printed ticket prints no "Ouverture" line it cannot back');
  assert.ok(!/hm\(r\.openedAt \|\| r\.firstSaleAt\)/.test(DRD));
});

ok('client book: a client never seen at the till has no "last visit"', () => {
  const CD = read('assets/clients-directory.js');
  assert.ok(/last: daysSince\(c\.lastSeen\) === Infinity \? null :/.test(CD));
  assert.equal((CD.match(/ago: function \(d\) \{ return d == null \? '·' :/g) || []).length, 3, 'FR, EN and AR');
});

ok('loyalty runs only once the merchant chose a programme (store, till, assistant)', () => {
  const CS = read('assets/clients-store.js');
  assert.ok(/function loyaltyOn\(book\)[\s\S]{0,260}return !!\(c && c\.model && !c\.auto\);/.test(CS), 'an auto default is not a programme');
  assert.ok(/if \(!loyaltyOn\(book\)\) \{[\s\S]{0,80}\} else if \(cfg\.model === 'amount'\)/.test(CS), 'recordPurchase accrues nothing without one');
  assert.ok(/if \(!loyaltyOn\(book\)\) return rec;/.test(CS), 'redeem burns nothing without one');
  assert.ok(/if \(KC\.loyaltyOn && !KC\.loyaltyOn\(\)\) return '';/.test(read('kiwi-caisse.html')), 'the till shows no "0/10"');
  const AG = read('assets/agent-data.js').replace(/\/\*[\s\S]*?\*\//g, '');
  assert.ok(!/cfg\.on\b/.test(AG) && /window\.KiwiClients\.loyaltyOn/.test(AG), 'the assistant reads the real switch');
});

console.log(`\ndashboard-truth: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
