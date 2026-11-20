// Filtres du carnet clients (La Maison en Vogue, 20 nov. 2026) : la caisse
// listait toutes les fiches d'un bloc. Une seule règle sert la caisse et le
// tableau de bord : qui doit de l'argent, qui a un avoir, qui n'a acheté
// qu'une fois, qui revient, qui dort. Les compteurs disent combien avant de toucher.
import assert from 'node:assert/strict';
import { CLIENT_FILTERS, clientMatches, clientCounts, sortClients, filterClients, moneyMaps, filterLabel } from '../assets/client-filters.js';

const DAY = 86400000, now = Date.UTC(2026, 10, 20, 12);
const book = [
  { id: 'c1', name: 'Samia', visits: 39, spend: 12000, lastSeen: now - 2 * DAY },
  { id: 'c2', name: 'Hatimi', visits: 1, spend: 300, lastSeen: now - 5 * DAY },
  { id: 'c3', name: 'Wiam', achats: 2, spent: 800, lastSeen: now - 90 * DAY },       // forme caisse (achats/spent)
  { id: 'c4', name: 'Oumaima', visits: 0, spend: 0, lastSeen: 0 },
  { id: 'c5', name: 'Nezha', visits: 13, spend: 5200, lastSeen: now - 1 * DAY, vip: true },
];
const ctx = moneyMaps({
  balances: [{ customerId: 'c2', balanceCents: 45000 }, { customerId: 'c2', balanceCents: 5000 }, { customerId: 'c3', balanceCents: 0 }],
  credits: [{ customerId: 'c4', balanceCents: 47050 }, { holderId: 'c1', balance: 120 }],
  now,
});

assert.deepEqual(CLIENT_FILTERS, ['all', 'owes', 'avoir', 'repeat', 'once', 'none', 'vip', 'dormant']);
// Doit de l'argent : la somme de ses notes ouvertes, en centimes.
assert.equal(ctx.owes.get('c2'), 50000);
assert.ok(!ctx.owes.has('c3'), 'une note soldée ne compte pas');
assert.deepEqual(filterClients(book, { filter: 'owes' }, ctx).map((c) => c.id), ['c2']);
// Avoir : serveur (balanceCents) ou caisse (balance en MAD).
assert.equal(ctx.avoir.get('c4'), 47050);
assert.equal(ctx.avoir.get('c1'), 12000);
assert.deepEqual(filterClients(book, { filter: 'avoir', sort: 'name' }, ctx).map((c) => c.id), ['c4', 'c1']);
// Achats : fidèles (2 et plus), une seule fois, jamais.
assert.deepEqual(filterClients(book, { filter: 'repeat', sort: 'name' }, ctx).map((c) => c.id), ['c5', 'c1', 'c3']);
assert.deepEqual(filterClients(book, { filter: 'once' }, ctx).map((c) => c.id), ['c2']);
assert.deepEqual(filterClients(book, { filter: 'none' }, ctx).map((c) => c.id), ['c4']);
assert.ok(clientMatches(book[4], 'vip', ctx) && !clientMatches(book[0], 'vip', ctx));
// À relancer : déjà venue, plus vue depuis 60 jours. Une fiche jamais vue n'est pas « dormante ».
assert.deepEqual(filterClients(book, { filter: 'dormant' }, ctx).map((c) => c.id), ['c3']);
// Les compteurs des puces.
assert.deepEqual(clientCounts(book, ctx), { all: 5, owes: 1, avoir: 2, repeat: 3, once: 1, none: 1, vip: 1, dormant: 1 });
// Tris.
assert.deepEqual(sortClients(book, 'recent', ctx).map((c) => c.id), ['c5', 'c1', 'c2', 'c3', 'c4']);
assert.deepEqual(sortClients(book, 'spend', ctx).map((c) => c.id), ['c1', 'c5', 'c3', 'c2', 'c4']);
assert.deepEqual(sortClients(book, 'visits', ctx).map((c) => c.id), ['c1', 'c5', 'c3', 'c2', 'c4']);
assert.deepEqual(sortClients(book, 'owes', ctx).map((c) => c.id)[0], 'c2');
assert.deepEqual(sortClients(book, 'name', ctx).map((c) => c.name), ['Hatimi', 'Nezha', 'Oumaima', 'Samia', 'Wiam']);
// Un filtre inconnu ne vide pas le carnet ; le tri ne modifie pas la liste reçue.
assert.equal(filterClients(book, { filter: 'nope' }, ctx).length, 5);
const before = book.map((c) => c.id).join();
sortClients(book, 'name', ctx);
assert.equal(book.map((c) => c.id).join(), before);
// Sans données d'argent (hors ligne), « doit » et « avoir » sont vides, jamais faux.
assert.equal(filterClients(book, { filter: 'owes' }, moneyMaps({ now })).length, 0);
// Libellés FR/EN/AR présents pour chaque filtre et chaque tri.
for (const lang of ['fr', 'en', 'ar']) {
  for (const id of CLIENT_FILTERS) assert.ok(filterLabel(id, lang), lang + ':' + id);
  for (const id of ['recent', 'spend', 'visits', 'owes', 'name']) assert.ok(filterLabel('sort.' + id, lang), lang + ':sort.' + id);
}
console.log('client-filters: ok');
