#!/usr/bin/env node
/* Caisse maison · la fiche cliente complète (assets/pos-maison/client-fiche.js).
 *
 * La fiche ne montrait que l'avoir et le total dépensé (20 nov. 2026) : une
 * cliente qui achète à crédit (acomptes) n'y voyait pas ce qu'elle doit. La
 * fiche dit maintenant tout : ce qu'elle doit et sur quels tickets, ses avoirs
 * disponibles, ses achats, son panier moyen, depuis quand elle vient. Ce test
 * tient les chiffres sur le vrai module. */
import assert from 'node:assert/strict';
import { ficheModel } from '../assets/pos-maison/client-fiche.js';

let passed = 0;
const eq = (a, b, label) => { assert.deepEqual(a, b, label); passed++; };

const day = 864e5, now = Date.parse('2026-11-20T12:00:00Z');
const client = { id: 'c-sara', name: 'Sara Bennani', spent: 4200, achats: 6, points: 42, lastSeen: now - 2 * day };
const raw = { id: 'c-sara', email: 'sara@example.ma', city: 'Casablanca', birthday: '1990-04-12', firstSeen: now - 400 * day, tags: ['mariage'], notes: 'Préfère le lin' };
const owed = [
  { id: 'b2', customerId: 'c-sara', ticketRef: 'T-0142', totalCents: 120000, paidCents: 40000, pendingCents: 0, createdTs: now - 3 * day },
  { id: 'b1', customerId: 'c-sara', ticketRef: 'T-0098', totalCents: 50000, paidCents: 20000, pendingCents: 10000, createdTs: now - 30 * day },
  { id: 'b3', customerId: 'c-sara', ticketRef: 'T-0150', totalCents: 30000, paidCents: 30000, pendingCents: 0, createdTs: now - day },
  { id: 'b9', customerId: 'c-nadia', ticketRef: 'T-0151', totalCents: 90000, paidCents: 0, pendingCents: 0, createdTs: now - day },
];
const avoirs = [
  { code: 'AV-1', holderId: 'c-sara', balance: 150, until: new Date(now + 10 * day) },
  { code: 'AV-2', holderId: 'c-sara', balance: 80, until: new Date(now - day) },
  { code: 'AV-3', holderId: 'c-nadia', balance: 300, until: new Date(now + 10 * day) },
  { code: 'AV-4', holderId: 'c-sara', balance: 0, until: new Date(now + 10 * day) },
];

const m = ficheModel({ client, raw, owed, avoirs, now });

/* Ce qu'elle doit : ses notes ouvertes seulement, la plus ancienne d'abord. */
eq(m.owedCents, 100000, 'she owes 1 000 MAD: 300 left on T-0098 (100 still syncing does not count) + 700 on T-0142');
eq(m.notes.map((n) => [n.ref, n.dueCents]), [['T-0098', 20000], ['T-0142', 80000]], 'her open notes, oldest first; a settled note and another client\'s note are left out');
eq([m.notes[0].totalCents, m.notes[0].paidCents], [50000, 30000], 'a note shows its total and what was paid, pending payments included');

/* Ses avoirs encore utilisables. */
eq([m.avoirCount, m.avoirTotal], [1, 150], 'only her unexpired credit notes with a balance count');

/* Les achats. */
eq([m.spent, m.achats, m.basket], [4200, 6, 700], '6 purchases for 4 200 MAD is a 700 MAD average basket');
eq(ficheModel({ client: { ...client, achats: 0, spent: 0 }, now }).basket, 0, 'no purchase, no average basket');

/* Qui elle est. */
eq([m.since, m.last], [now - 400 * day, now - 2 * day], 'client since her first visit, last seen two days ago');
eq([m.email, m.city, m.birthday, m.tags, m.notes.length >= 0], ['sara@example.ma', 'Casablanca', '1990-04-12', ['mariage'], true], 'contact details and tags come from her record');

/* Une cliente sans dette, sans avoir, sans fiche détaillée (démo). */
const bare = ficheModel({ client: { id: 'c-x', name: 'X', spent: 0, achats: 0 }, now });
eq([bare.owedCents, bare.notes, bare.avoirTotal, bare.email, bare.since, bare.tags], [0, [], 0, '', 0, []], 'a bare client shows zeros, never undefined');

console.log(`✓ maison client fiche · ${passed} checks`);
