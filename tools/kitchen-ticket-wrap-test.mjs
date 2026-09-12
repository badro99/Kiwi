#!/usr/bin/env node
/* #0067 · « les articles longs ne passent pas à la ligne, ils sont coupés ».
 *
 * Le bon de cuisine imprimé chez le commerçant disait, en toutes lettres :
 *     1× Spaghetti Fruits de M
 * Le nom du plat est encodé en double largeur · 24 colonnes sur un 80 mm · et
 * `fit()` tranche ce qui dépasse. Un cuisinier qui lit un nom coupé envoie un
 * autre plat : cette troncature-là n'est pas cosmétique.
 *
 * On exige donc qu'AUCUN caractère du nom, du choix de formule ou de la note
 * ne disparaisse du papier, et que les suites soient visiblement rattachées à
 * leur article.
 */
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const ctx = { window: {}, Uint8Array, btoa: (s) => Buffer.from(s, 'binary').toString('base64') };
vm.runInNewContext(readFileSync(new URL('../assets/escpos.js', import.meta.url), 'utf8'), ctx);

let passed = 0;
const ok = (label, cond) => { assert.ok(cond, label); passed++; console.log(`  ✓ ${label}`); };

/* Les lignes lisibles, débarrassées des séquences de contrôle ESC/POS. */
const printed = (o) => Buffer.from(ctx.window.KiwiEscPos.kitchenTicket(o))
  .toString('latin1')
  .replace(/\x1B[@!aEdV][\x00-\xFF]?|\x1D[Vv][\x00-\xFF]{0,3}|[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '')
  .split('\n');

const DISH = 'Spaghetti Fruits de Mer';
const lines = printed({
  paper: '80', title: 'CUISINE', order: '#155', time: '00:08',
  items: [{ qty: 1, name: DISH }],
});
const body = lines.join(' ').replace(/\s+/g, ' ');

ok('le nom du plat sort en entier', body.includes('1× Spaghetti Fruits de Mer'));
ok('il ne sort plus tronqué comme sur le ticket du commerçant',
  !lines.some((l) => /Fruits de M$/.test(l.trim())));
ok('il occupe plusieurs lignes plutôt qu’une ligne coupée',
  lines.filter((l) => /Spaghetti|Mer/.test(l)).length === 2);
ok('la suite est retraitée, on voit que c’est le même article',
  lines.some((l) => /^ {3}Mer/.test(l)));

/* Aucune ligne ne dépasse la largeur utile. En double largeur, 48 colonnes de
 * papier n'en offrent que 24 : c'est CE plafond-là qui doit tenir. */
const nameLines = lines.filter((l) => /Spaghetti|Mer/.test(l));
ok('aucune ligne de nom ne dépasse les 24 colonnes du double largeur',
  nameLines.every((l) => l.length <= 24));

/* Un mot seul plus large que le papier : il faut bien le couper, mais rien ne
 * doit disparaître. C'est la garantie minimale · aucun caractère perdu. */
const longWord = 'Antidisestablishmentarianismesupercalifragilistic';
const monster = printed({ paper: '80', items: [{ qty: 1, name: longWord }] }).join('');
ok('un mot plus large que le papier est coupé mais jamais amputé',
  monster.replace(/\s/g, '').includes(longWord));

/* Les choix de formule et la note suivent la même règle · ce sont eux qui
 * portent « sans oignons », et une allergie coupée en deux est un incident. */
const noted = printed({
  paper: '80',
  items: [{
    qty: 2, name: 'Pizza Royale',
    formulaChoices: [{ name: 'Boisson fraîche au choix du client', note: 'citron' }],
    note: 'allergie aux fruits de mer · surtout pas de crevettes',
  }],
}).join(' ').replace(/\s+/g, ' ');
ok('un choix de formule long passe à la ligne au lieu d’être coupé',
  noted.includes('Boisson fraîche au choix du client'));
ok('une note longue survit en entier · une allergie ne se tronque pas',
  noted.includes('allergie aux fruits de mer') && noted.includes('surtout pas de crevettes'));

/* Un nom court imprime exactement comme avant : une ligne, sans retrait. */
const short = printed({ paper: '80', items: [{ qty: 1, name: 'Café' }] });
ok('un nom court sort sur une seule ligne, inchangé',
  short.filter((l) => l.includes('Café')).length === 1
  && short.some((l) => l.trim().endsWith('1× Café')));

console.log(`\nkitchen-ticket-wrap-test: ${passed} controls passed\n`);
