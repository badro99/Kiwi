// Le reçu WhatsApp de la boutique dit sa remise, comme le ticket 80 mm.
// Sans elle, les lignes dépassaient le TOTAL et le seul mot entre les deux
// était le mode de paiement : la cliente lisait « Espèces » là où elle avait
// eu une remise (Santos, 20 nov. 2026). On charge le VRAI module.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const docBox = vm.createContext({});
vm.runInContext(fs.readFileSync('assets/pos-boutique/receipt-doc.js', 'utf8').replace(/\nexport \{[^}]*\};\s*$/, '\n') + '\nthis.waReceiptTotals = waReceiptTotals;', docBox);
const waReceiptTotals = docBox.waReceiptTotals;

const fmt = (n) => `${n} MAD`;
const tr = (_k, fr) => fr;

const off = waReceiptTotals({ subtotal: 330, promo: { amount: 30, label: 'Soldes −10 %' }, discount: 50, amount: 250 }, fmt, tr);
assert.deepEqual([...off], ['Sous-total 330 MAD', 'Soldes −10 % −30 MAD', 'Remise −50 MAD'], 'remise et promotion nommées, sous-total en tête');

const onlyRemise = waReceiptTotals({ subtotal: 8300, discount: 50, amount: 8250 }, fmt, tr);
assert.deepEqual([...onlyRemise], ['Sous-total 8300 MAD', 'Remise −50 MAD']);

const noLabel = waReceiptTotals({ subtotal: 100, promo: { amount: 10 }, amount: 90 }, fmt, tr);
assert.deepEqual([...noLabel], ['Sous-total 100 MAD', 'Promotion −10 MAD'], 'une promotion sans libellé garde un nom');

assert.deepEqual([...waReceiptTotals({ subtotal: 100, discount: 0, amount: 100 }, fmt, tr)], [], 'sans remise, rien ne s’ajoute');
assert.deepEqual([...waReceiptTotals({ amount: 100 }, fmt, tr)], []);

// Et le bouton WhatsApp s'en sert, entre les lignes et le TOTAL.
const co = fs.readFileSync('assets/pos-boutique/checkout.js', 'utf8');
const wa = co.slice(co.indexOf("$('#bq-pay-wa', el).onclick"), co.indexOf("$('#bq-pay-done', el).onclick"));
assert.match(wa, /\.\.\.waReceiptTotals\(opts, fmtMAD, tr\),\s*`\$\{tr\("checkout\.total"/, 'le reçu WhatsApp place la remise juste avant le TOTAL');

// Le duplicata recomposé dit aussi sa remise. Une vente boutique encaissée
// sans ticket imprimé n'a pas de `rc` : la réimpression la recompose (docFrom),
// et sans la remise ses lignes dépassaient le total, suivi du seul « Espèces ».
const stubNode = () => ({ style: {}, classList: { add() {}, remove() {}, contains: () => false }, appendChild() {}, setAttribute() {}, addEventListener() {}, querySelector: () => null, querySelectorAll: () => [] });
const reprintWin = { KiwiPosSale: { isReal: () => true, today: () => [] }, addEventListener() {} };
const reprintBox = vm.createContext({ window: reprintWin, document: { getElementById: () => null, createElement: stubNode, querySelector: () => null, querySelectorAll: () => [], body: stubNode(), head: { appendChild() {} }, addEventListener() {} }, setTimeout() {}, clearTimeout() {}, console });
vm.runInContext(fs.readFileSync('assets/pos-reprint.js', 'utf8'), reprintBox);
const RP = reprintWin.KiwiPosReprint;
const dup = RP.docFrom({ ts: 1, total: 250, method: 'espèces', ref: 'B-7', discount: 50, promo: 30, lines: [{ name: 'Caftan S', qty: 1, total: 300 }] });
assert.equal(dup.discount, 50, 'la remise suit le duplicata');
assert.equal(dup.promo.amount, 30, 'la promotion suit le duplicata');
assert.equal(dup.subtotal, 330, 'le sous-total remonte du payé : total + remise + promotion');
const plain = RP.docFrom({ ts: 1, total: 84.5, method: 'espèces', ref: 'T-1', lines: [{ name: 'Pain', qty: 2, total: 84.5 }] });
assert.ok(plain.discount == null && plain.subtotal == null && plain.promo == null, 'sans remise, rien n’est inventé');

// Et la boutique lui passe la remise et les promotions de la vente, sauf sur
// un acompte, dont le total n'est que la part encaissée.
const bq = fs.readFileSync('assets/pos-boutique.js', 'utf8');
const prov = bq.slice(bq.indexOf("provide('boutique'"), bq.indexOf("provide('boutique'") + 1400);
assert.match(prov, /discount: s\.kind === 'acompte' \? 0 : s\.discount, promo: s\.kind === 'acompte' \? 0 : s\.promoOff/, 'le fournisseur boutique passe remise et promotions');

console.log('✓ remise sur les reçus boutique : WhatsApp et duplicata recomposé portent sous-total, promotion et remise avant le TOTAL');
