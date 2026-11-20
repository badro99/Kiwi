// Le reçu WhatsApp de la boutique dit sa remise, comme le ticket 80 mm.
// Sans elle, les lignes dépassaient le TOTAL et le seul mot entre les deux
// était le mode de paiement : la cliente lisait « Espèces » là où elle avait
// eu une remise (Santos, 20 nov. 2026). On charge le VRAI module.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const src = fs.readFileSync('assets/pos-boutique/receipt-doc.js', 'utf8').replace(/\nexport \{[^}]*\};\s*$/, '\n');
const ctx = vm.createContext({});
vm.runInContext(src + '\nthis.waReceiptTotals = waReceiptTotals;', ctx);
const { waReceiptTotals } = ctx;

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

console.log('✓ reçu WhatsApp boutique : sous-total, promotion et remise avant le TOTAL');
