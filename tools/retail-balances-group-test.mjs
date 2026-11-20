// Acomptes par cliente (La Maison en Vogue, 20 nov. 2026) : l'écran listait
// les notes une par une. Il liste maintenant les clientes ; on ouvre une
// cliente, on coche les notes qu'elle règle ou on tape ce qu'elle donne, et
// le montant couvre d'abord les notes les plus anciennes. Chaque note garde
// son propre reçu : ces règles décident combien va à chacune, et quelle part
// de chaque mode de paiement (espèces, carte, avoir) lui revient.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const window = {};
vm.runInNewContext(fs.readFileSync(new URL('../assets/retail-balances.js', import.meta.url), 'utf8'), {
  window, localStorage: { getItem: () => '[]', setItem() {} }, navigator: { onLine: false }, console, JSON, Math, Number, String, Array, Map, Set, Date,
});
const K = window.KiwiRetailBalances;
// Le module vit dans un autre royaume (vm) : ses tableaux reviennent en objets ordinaires.
const plain = (fn) => (...args) => JSON.parse(JSON.stringify(fn(...args)));
const R = { groupByCustomer: plain(K.groupByCustomer), sliceTender: plain(K.sliceTender), allocate: plain(K.allocate) };

const rows = [
  { id: 'b', customerId: 'c1', ticketRef: 'M-0012', totalCents: 80000, paidCents: 20000, pendingCents: 0, createdTs: 2000 },
  { id: 'a', customerId: 'c1', ticketRef: 'M-0007', totalCents: 50000, paidCents: 10000, pendingCents: 0, createdTs: 1000 },
  { id: 'c', customerId: 'c2', ticketRef: 'M-0020', totalCents: 30000, paidCents: 0, pendingCents: 0, createdTs: 3000 },
  { id: 'd', customerId: 'c1', ticketRef: 'M-0015', totalCents: 10000, paidCents: 0, pendingCents: 5000, createdTs: 2500 },
];

// Regroupement : une ligne par cliente, total dû, notes de la plus ancienne à la plus récente.
const groups = R.groupByCustomer(rows);
assert.deepEqual(groups.map((g) => g.customerId), ['c1', 'c2'], 'la cliente qui doit le plus passe en tête');
assert.equal(groups[0].dueCents, 40000 + 60000 + 5000);
assert.deepEqual(groups[0].rows.map((r) => r.id), ['a', 'b', 'd'], 'notes de la plus ancienne à la plus récente');
assert.equal(groups[0].oldestTs, 1000);
assert.equal(groups[1].dueCents, 30000);

// Répartition : le montant couvre d'abord les notes les plus anciennes, jamais plus que leur reste.
const open = groups[0].rows.filter((r) => !(r.pendingCents > 0));
assert.deepEqual(R.allocate(open, 50000).map((a) => [a.row.id, a.cents]), [['a', 40000], ['b', 10000]]);
assert.deepEqual(R.allocate(open, 100000).map((a) => [a.row.id, a.cents]), [['a', 40000], ['b', 60000]]);
assert.deepEqual(R.allocate(open, 999999).map((a) => a.cents), [40000, 60000], 'jamais au-delà de ce qu’elle doit');
assert.deepEqual(R.allocate(open, 0), []);
assert.deepEqual(R.allocate(open, -5), []);
// L'ordre suit la date, pas l'ordre reçu.
assert.deepEqual(R.allocate([open[1], open[0]], 45000).map((a) => [a.row.id, a.cents]), [['a', 40000], ['b', 5000]]);
// Une note en attente de synchronisation n'est jamais touchée.
assert.deepEqual(R.allocate(groups[0].rows, 200000).map((a) => a.row.id), ['a', 'b']);

// Les modes de paiement se partagent dans l'ordre : 300 espèces + 200 carte sur deux notes de 400 et 100.
const slices = R.sliceTender([{ m: 'espèces', amount: 300, rendu: 20 }, { m: 'carte', amount: 200 }], [40000, 10000]);
assert.deepEqual(slices, [
  [{ m: 'espèces', amount: 300 }, { m: 'carte', amount: 100 }],
  [{ m: 'carte', amount: 100 }],
]);
// Un avoir garde son code dans la tranche qui le consomme.
assert.deepEqual(R.sliceTender([{ m: 'avoir', amount: 50, code: 'AV-1' }, { m: 'espèces', amount: 50 }], [7000, 3000]),
  [[{ m: 'avoir', amount: 50, code: 'AV-1' }, { m: 'espèces', amount: 20 }], [{ m: 'espèces', amount: 30 }]]);
// Les centimes tombent juste : 3 notes de 33,33 + 33,33 + 33,34 payées en une part de 100.
const thirds = R.sliceTender([{ m: 'espèces', amount: 100 }], [3333, 3333, 3334]);
assert.deepEqual(thirds.map((s) => Math.round(s.reduce((n, p) => n + p.amount * 100, 0))), [3333, 3333, 3334]);
// Les parts à zéro ou négatives sont ignorées.
assert.deepEqual(R.sliceTender([{ m: 'carte', amount: 0 }, { m: 'espèces', amount: 10 }], [1000]), [[{ m: 'espèces', amount: 10 }]]);

console.log('retail-balances-group: ok');
