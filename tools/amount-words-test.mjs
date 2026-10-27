#!/usr/bin/env node
/* amount-words-test · le montant en lettres des factures (KiwiInvoice.amountWords,
 * dans assets/invoice.js, lu aussi par le gabarit de assets/invoicing/print.js).
 *
 * Une table d'orthographe tenue à la main (les cas où le français piège :
 * 70 à 99, cent et vingt qui prennent un s ou non, mille invariable, million
 * accordé), puis un aller-retour : un analyseur indépendant relit le texte
 * produit pour des milliers de nombres et doit retrouver le nombre d'origine. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
const invoiceSource = fs.readFileSync(new URL('../assets/invoice.js', import.meta.url), 'utf8');
const makeInvoice = (receipt) => {
  const win = { KiwiReceipt: receipt, document: { baseURI: 'https://kiwi.test/' }, localStorage: { getItem: () => null, setItem() {} } };
  return new Function('window', 'document', 'localStorage', `${invoiceSource}; return window.KiwiInvoice;`)(win, win.document, win.localStorage);
};
const KiwiInvoice = makeInvoice({ business: () => ({ name: 'Café de la Gare', city: 'Casablanca', ice: '001234567000089' }), config: () => ({ vat: { mode: 'included', rate: 20 } }) });
const { numberToWordsFr: words, amountInWordsFr: amount, arreteFr } = KiwiInvoice.amountWords;

const TABLE = {
  0: 'zéro', 1: 'un', 2: 'deux', 10: 'dix', 11: 'onze', 16: 'seize', 17: 'dix-sept', 20: 'vingt', 21: 'vingt et un', 22: 'vingt-deux',
  31: 'trente et un', 61: 'soixante et un', 70: 'soixante-dix', 71: 'soixante et onze', 72: 'soixante-douze', 79: 'soixante-dix-neuf',
  80: 'quatre-vingts', 81: 'quatre-vingt-un', 91: 'quatre-vingt-onze', 99: 'quatre-vingt-dix-neuf',
  100: 'cent', 101: 'cent un', 121: 'cent vingt et un', 180: 'cent quatre-vingts', 200: 'deux cents', 201: 'deux cent un',
  280: 'deux cent quatre-vingts', 999: 'neuf cent quatre-vingt-dix-neuf',
  1000: 'mille', 1001: 'mille un', 1080: 'mille quatre-vingts', 1100: 'mille cent', 2000: 'deux mille', 21000: 'vingt et un mille',
  80000: 'quatre-vingt mille', 81000: 'quatre-vingt-un mille', 200000: 'deux cent mille', 200001: 'deux cent mille un',
  1000000: 'un million', 2000000: 'deux millions', 80000000: 'quatre-vingts millions', 200000000: 'deux cents millions',
  1500000: 'un million cinq cent mille', 1000000000: 'un milliard', 2000000000: 'deux milliards',
};
for (const [n, expected] of Object.entries(TABLE)) assert.equal(words(Number(n)), expected, `${n} s'écrit « ${expected} »`);

// Des montants entiers en centimes : dirhams, centimes, singulier et pluriel, « de » devant le nom.
const AMOUNTS = [
  [0, 'zéro dirham'], [1, 'zéro dirham et un centime'], [50, 'zéro dirham et cinquante centimes'], [100, 'un dirham'],
  [101, 'un dirham et un centime'], [200, 'deux dirhams'], [22345, 'deux cent vingt-trois dirhams et quarante-cinq centimes'],
  [123456, 'mille deux cent trente-quatre dirhams et cinquante-six centimes'], [7100, 'soixante et onze dirhams'],
  [8001, 'quatre-vingts dirhams et un centime'], [9199, 'quatre-vingt-onze dirhams et quatre-vingt-dix-neuf centimes'],
  [100000, 'mille dirhams'], [100000000, 'un million de dirhams'], [200000000, 'deux millions de dirhams'],
  [100000100, 'un million un dirhams'], [150000000, 'un million cinq cent mille dirhams'],
];
for (const [cents, expected] of AMOUNTS) assert.equal(amount(cents), expected, `${cents} centimes`);
assert.equal(amount('22345'), amount(22345), 'des centimes en texte (colonne SQL) passent aussi');

// Ce qui n'est pas un montant n'imprime rien : jamais une somme fausse.
for (const bad of [-1, 1.5, NaN, Infinity, null, undefined, '', 'abc', '1.5', 1e15, {}, []]) {
  assert.equal(amount(bad), '', `amount(${String(bad)})`);
  assert.equal(words(bad), '');
  assert.equal(arreteFr('invoice', bad), '');
}

// La formule, accordée au document.
assert.equal(arreteFr('invoice', 150050), 'Arrêtée la présente facture à la somme de : mille cinq cents dirhams et cinquante centimes.');
assert.equal(arreteFr('credit_note', 100), 'Arrêté le présent avoir à la somme de : un dirham.');
assert.equal(arreteFr('quote', 8000), 'Arrêté le présent devis à la somme de : quatre-vingts dirhams.');
assert.ok(arreteFr('inconnu', 100).startsWith('Arrêtée la présente facture'), 'type inconnu : formule de la facture');

// Aller-retour : un analyseur écrit à part relit les mots et doit retrouver le nombre.
const SMALL = { zéro: 0, un: 1, deux: 2, trois: 3, quatre: 4, cinq: 5, six: 6, sept: 7, huit: 8, neuf: 9, dix: 10, onze: 11, douze: 12, treize: 13,
  quatorze: 14, quinze: 15, seize: 16, vingt: 20, trente: 30, quarante: 40, cinquante: 50, soixante: 60 };
function parse(text) {
  let total = 0, group = 0, current = 0;
  for (const raw of text.split(/[\s-]+/)) {
    const w = raw.replace(/s$/, (m) => (['cents', 'vingts', 'millions', 'milliards'].includes(raw) ? '' : m));
    if (w === 'et') continue;
    if (w === 'cent') { current = (current || 1) * 100; group += current; current = 0; continue; }
    if (w === 'quatre') { current += 4; continue; }
    if (w === 'vingt' && current === 4) { current = 80; continue; }
    if (w === 'mille') { total += (group + current || 1) * 1000; group = 0; current = 0; continue; }
    if (w === 'million') { total += (group + current) * 1e6; group = 0; current = 0; continue; }
    if (w === 'milliard') { total += (group + current) * 1e9; group = 0; current = 0; continue; }
    if (w in SMALL) { current += SMALL[w]; continue; }
    throw new Error('mot inconnu : ' + raw + ' dans « ' + text + ' »');
  }
  return total + group + current;
}
// « soixante-dix » = 60 + 10 et « quatre-vingt-dix » = 80 + 10 : les additions de l'analyseur suffisent.
let seed = 20261027;
const rand = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
const samples = [...Array(1000).keys(), 1000, 1001, 1999, 2000, 999999, 1000000, 1999999, 80000000, 999999999, 1000000000, 999999999999];
for (let i = 0; i < 4000; i++) samples.push(Math.floor(rand() ** 2 * 1e12) % (1e12));
for (const n of samples) {
  const text = words(n);
  assert.ok(/^[a-zéè -]+$/.test(text), `${n} : lettres minuscules, tirets et espaces seulement : ${text}`);
  assert.equal(parse(text), n, `${n} → « ${text} » → ${parse(text)}`);
  // Pas de « un cents », pas de double espace, pas de s sur « mille », « cent » sans s devant « mille ».
  assert.ok(!/un cents|  |milles|cents mille|vingts mille/.test(text), `${n} : ${text}`);
}
// La facture de vente du comptoir (KiwiInvoice.html) l'imprime sous ses totaux, du TTC en centimes.
const sale = { id: 's1', ref: 'T-1042', ts: 1771488000000, amountCents: 12550, method: 'card', lines: [{ name: 'Menu', qty: 1, total: 95.5 }, { name: 'Soda', qty: 2, total: 30 }] };
const printed = KiwiInvoice.html(KiwiInvoice.build(sale, { tvaRate: 20, number: 'F-2026-0001' }));
assert.ok(printed.includes('<p class="amount-words">Arrêtée la présente facture à la somme de : cent vingt-cinq dirhams et cinquante centimes.</p>'), '125,50 MAD en lettres sous les totaux');
assert.ok(printed.indexOf('Total TTC') < printed.indexOf('class="amount-words"'), 'sous le total TTC');
assert.ok(!KiwiInvoice.html(KiwiInvoice.build({ ...sale, amountCents: 0, amount: 0 }, { tvaRate: 20 })).includes('NaN'), 'montant nul : aucun NaN');

console.log(`✓ montant en lettres : ${Object.keys(TABLE).length + AMOUNTS.length} cas écrits, ${samples.length} nombres relus par un analyseur indépendant, refus des valeurs invalides, formule accordée, facture de comptoir`);
