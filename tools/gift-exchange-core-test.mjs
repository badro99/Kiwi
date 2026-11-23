#!/usr/bin/env node
/* Échange sans ticket (caisse Maison) · la partie qui compte, sans DOM.
 * Une cliente rapporte un cadeau sans ticket : la caissière retrouve la
 * référence au clavier (pas de code-barres chez Vogue), la valeur rendue est
 * le prix de vente du jour, et l'échange ne se règle que si ce qui part vaut
 * au moins ce qui revient (échange contre marchandise, jamais d'argent rendu).
 * docs/specs/2026-11-23-maison-echange-sans-ticket.md */
import assert from 'node:assert/strict';
import { compact, searchProducts, exchangeTotals, allocateCents, PHRASES, phrase, tillLang } from '../assets/pos-maison/gift-exchange-core.js';

let n = 0;
const ok = (cond, msg) => { assert.ok(cond, msg); n++; };
const eq = (a, b, msg) => { assert.deepEqual(a, b, msg); n++; };

/* ── la référence se tape comme on la lit ── */
eq(compact('AM-58-8 MARRON'), 'am588marron', 'ponctuation et casse retirées');
eq(compact('Assiette Fès É'), 'assiettefese', 'accents retirés');

const cat = [
  { id: 'a', name: 'AM-58-8 MARRON', price: 450 },
  { id: 'b', name: 'AM-58-81', price: 300 },
  { id: 'c', name: 'XAM-58-8', price: 120 },
  { id: 'd', name: 'plateau oval new-gm', marque: 'Baobab', price: 990 },
  { id: 'e', name: 'plateau oval new-pm', price: 890 },
];
eq(searchProducts(cat, 'am588').map((p) => p.id), ['a', 'b', 'c'], 'début de référence avant le milieu, sans tirets');
eq(searchProducts(cat, 'AM-58-8 marron').map((p) => p.id), ['a'], 'référence entière exacte');
eq(searchProducts(cat, 'oval gm').map((p) => p.id), ['d'], 'plusieurs mots, dans n’importe quel ordre');
eq(searchProducts(cat, 'baobab').map((p) => p.id), ['d'], 'la marque compte');
eq(searchProducts(cat, '   '), [], 'rien tapé, rien proposé');
eq(searchProducts(cat, 'plateau', 1).length, 1, 'la liste est bornée');

/* ── les totaux, en centimes ── */
const t0 = exchangeTotals([{ unitCents: 45000, qty: 2 }], [{ unitCents: 89000, qty: 1 }]);
eq(t0, { backCents: 90000, outCents: 89000, diffCents: -1000, remainingCents: 1000, ready: false }, 'il reste 10 MAD à choisir');
const t1 = exchangeTotals([{ unitCents: 45000, qty: 1 }], [{ unitCents: 45000, qty: 1 }]);
eq(t1.diffCents, 0); ok(t1.ready, 'valeur égale : échange direct');
const t2 = exchangeTotals([{ unitCents: 45000, qty: 1 }], [{ unitCents: 30000, qty: 1 }, { unitCents: 20000, qty: 1 }]);
eq([t2.diffCents, t2.remainingCents, t2.ready], [5000, 0, true], 'la cliente paie la différence');
ok(!exchangeTotals([], [{ unitCents: 100, qty: 1 }]).ready, 'sans article rendu, ce n’est pas un échange');
ok(!exchangeTotals([{ unitCents: 100, qty: 1 }], []).ready, 'sans article emporté non plus');

/* ── la différence se répartit sur les articles emportés, au centime ── */
eq(allocateCents(5000, [30000, 20000]), [3000, 2000], 'au prorata');
eq(allocateCents(1000, [1, 1, 1]), [334, 333, 333], 'le reste au plus grand reliquat, la somme tombe juste');
eq(allocateCents(0, [500, 700]), [0, 0], 'rien à répartir');
for (const [total, w] of [[9999, [3, 7, 11]], [101, [1, 0, 0]], [7, [0, 0]]]) {
  eq(allocateCents(total, w).reduce((s, x) => s + x, 0), total, 'somme exacte ' + total);
}

/* ── chaque phrase de la feuille existe en anglais et en arabe ── */
for (const [fr, tr] of Object.entries(PHRASES)) {
  ok(Array.isArray(tr) && tr.length === 2 && tr[0] && tr[1], 'EN et AR pour « ' + fr + ' »');
  ok(!/—/.test(fr + tr.join('')), 'pas de tiret cadratin dans « ' + fr + ' »');
}
eq(phrase('Échange sans ticket', 'fr'), 'Échange sans ticket');
eq(phrase('Échange sans ticket', 'en'), PHRASES['Échange sans ticket'][0]);
eq(phrase('Échange sans ticket', 'ar'), PHRASES['Échange sans ticket'][1]);
eq(phrase('Phrase inconnue', 'en'), 'Phrase inconnue', 'une phrase absente reste en français');
eq(phrase('Il reste {x} à choisir', 'fr', { x: '10 MAD' }), 'Il reste 10 MAD à choisir', 'le montant prend sa place');
eq(tillLang(), 'fr', 'sans sélecteur de langue, la caisse parle français');
globalThis.window = { KiwiCaisseLang: { get: () => 'ar' } };
eq(tillLang(), 'ar', 'la langue choisie au comptoir');
delete globalThis.window;

console.log(`✓ gift-exchange-core · ${n} checks`);
