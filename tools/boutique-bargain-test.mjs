// Remise à la marocaine : l'arithmétique pure du prix convenu (assets/pos-boutique/bargain.js).
// Spec : docs/superpowers/specs/2026-11-18-bargain-remise-design.md
import assert from 'node:assert/strict';
import { maxPct, floorUnit, parseMad, agreedUnit, spreadTicket, unitFor } from '../assets/pos-boutique/bargain.js';

let n = 0;
const ok = (name, fn) => { fn(); n++; console.log('  ✓ ' + name); };
const c = v => Math.round(v * 100);

ok('le taux le plus haut autorisé fait le plancher', () => {
  assert.equal(maxPct([5, 10, 15, 20]), 20);
  assert.equal(maxPct([]), 0);
  assert.equal(floorUnit(350, 20), 280);
  assert.equal(floorUnit(99.99, 15), 85); // 84,9915 arrondi AU-DESSUS au centime
  assert.equal(floorUnit(350, 0), 350);
});

ok('la saisie en dirhams accepte la virgule et les espaces, refuse zéro', () => {
  assert.equal(parseMad('299,50'), 299.5);
  assert.equal(parseMad('1 234'), 1234);
  assert.equal(parseMad(' 300 '), 300);
  assert.equal(parseMad('0'), null);
  assert.equal(parseMad('-5'), null);
  assert.equal(parseMad(''), null);
  assert.equal(parseMad('abc'), null);
  assert.equal(parseMad('12,345'), null); // trois décimales : une faute de frappe, pas un prix
});

ok('prix convenu et montant retiré donnent le même prix, sans arrondi par-dessus', () => {
  assert.deepEqual(agreedUnit(350, 'price', 300, 20), { unit: 300, cut: 50 });
  assert.deepEqual(agreedUnit(350, 'amount', 50, 20), { unit: 300, cut: 50 });
  assert.deepEqual(agreedUnit(349.9, 'price', 299.5, 20), { unit: 299.5, cut: 50.4 });
});

ok('sous le plancher : refus qui nomme le prix minimum', () => {
  assert.deepEqual(agreedUnit(350, 'price', 270, 20), { error: 'floor', floor: 280 });
  assert.deepEqual(agreedUnit(350, 'amount', 80, 20), { error: 'floor', floor: 280 });
  assert.deepEqual(agreedUnit(350, 'price', 280, 20), { unit: 280, cut: 70 });
});

ok('retirer tout le prix n’est pas un prix, même à 100 % autorisé', () => {
  assert.deepEqual(agreedUnit(350, 'amount', 350, 100), { error: 'floor', floor: 0.01 });
  assert.deepEqual(agreedUnit(350, 'amount', 400, 100), { error: 'floor', floor: 0.01 });
});

ok('un prix au-dessus du prix affiché n’est pas une remise', () => {
  assert.equal(agreedUnit(350, 'price', 400, 20).error, 'above');
  assert.equal(agreedUnit(350, 'price', 350, 20).error, 'above');
  assert.equal(agreedUnit(350, 'amount', 0, 20).error, 'invalid');
  assert.equal(agreedUnit(350, 'price', null, 20).error, 'invalid');
  assert.equal(agreedUnit(350, 'pct', 10, 20).error, 'invalid');
});

const sumC = assign => assign.reduce((s, a) => s + c(a.agreed) * a.qty, 0);

ok('le ticket tombe exactement sur le total convenu, en dirhams ronds sauf une pièce', () => {
  const lines = [{ key: 'a', base: 350, qty: 1 }, { key: 'b', base: 250, qty: 2 }];
  const r = spreadTicket(lines, 750, 20);
  assert.equal(sumC(r.assign), c(750));
  const pieces = r.assign.reduce((s, a) => s + a.qty, 0);
  assert.equal(pieces, 3);
  const odd = r.assign.filter(a => c(a.agreed) % 100 !== 0);
  assert.ok(odd.length <= 1, 'au plus une pièce porte le reste');
  for (const a of r.assign) assert.ok(a.agreed <= lines.find(l => l.key === a.key).base);
});

ok('un total à centimes : le reste va sur une pièce de la ligne la plus chère', () => {
  const r = spreadTicket([{ key: 'a', base: 199, qty: 1 }, { key: 'b', base: 99, qty: 1 }], 250.5, 20);
  assert.equal(sumC(r.assign), c(250.5));
  const odd = r.assign.find(a => c(a.agreed) % 100 !== 0);
  assert.equal(odd.key, 'a');
});

ok('la ligne la plus chère se coupe en deux quand sa quantité dépasse 1', () => {
  const r = spreadTicket([{ key: 'a', base: 300, qty: 3 }, { key: 'b', base: 100, qty: 1 }], 901, 20);
  assert.equal(sumC(r.assign), c(901));
  const a = r.assign.filter(x => x.key === 'a');
  assert.equal(a.length, 2, 'la ligne a est coupée');
  assert.deepEqual(a.map(x => x.qty).sort(), [1, 2]);
  assert.equal(r.assign.reduce((s, x) => s + x.qty, 0), 4);
});

ok('total convenu sous le plancher du ticket : refus avec le minimum', () => {
  const r = spreadTicket([{ key: 'a', base: 350, qty: 1 }, { key: 'b', base: 250, qty: 2 }], 600, 20);
  assert.deepEqual(r, { error: 'floor', floor: 680 });
  assert.equal(spreadTicket([{ key: 'a', base: 350, qty: 1 }], 400, 20).error, 'above');
  assert.equal(spreadTicket([], 100, 20).error, 'invalid');
});

ok('aucune pièce ne descend sous son propre plancher dans la répartition', () => {
  const lines = [{ key: 'a', base: 500, qty: 1 }, { key: 'b', base: 20, qty: 5 }];
  const r = spreadTicket(lines, 480, 20); // plancher 400 + 80 = 480
  assert.equal(sumC(r.assign), c(480));
  for (const a of r.assign) assert.ok(c(a.agreed) >= c(floorUnit(lines.find(l => l.key === a.key).base, 20)));
});

ok('le prix d’une ligne : convenu d’abord, pourcentage sinon', () => {
  const pct = (base, remise) => Math.floor(base * (100 - remise)) / 100;
  assert.equal(unitFor(350, { remise: 0, agreed: 300 }, pct), 300);
  assert.equal(unitFor(350, { remise: 10, agreed: null }, pct), 315);
  assert.equal(unitFor(350, { remise: 0 }, pct), 350);
  assert.equal(unitFor(250, { remise: 0, agreed: 300 }, pct), 250); // une promo passée sous le prix convenu reste la meilleure
});

console.log(`boutique-bargain: ${n} checks ok`);
