#!/usr/bin/env node
/* Caisse maison · la remise qui part au serveur (assets/pos-maison/sale-discount.js).
 *
 * La Maison en Vogue (20 nov. 2026) : « la remise sort sur le ticket, mais elle
 * n'apparaît jamais ». La caisse envoyait le net (850) sans dire qu'il venait de
 * 1 000 moins 150 : le serveur sait garder le brut et la remise, la caisse ne
 * les donnait pas. Ce test tient la règle du serveur (/api/sale) sur le vrai
 * module : brut − remise = montant reçu, un motif connu, un acteur qui n'est
 * jamais un code à quatre chiffres. */
import assert from 'node:assert/strict';
import { mzSaleDiscount } from '../assets/pos-maison/sale-discount.js';

let passed = 0;
const eq = (a, b, label) => { assert.deepEqual(a, b, label); passed++; };

/* Trois articles à 1 000 au total, 150 de remise, payés 850 en espèces. */
eq(mzSaleDiscount({ amountCents: 85000, totalCents: 85000, remiseCents: 15000, rewardCents: 0, actorId: 'u-imane' }),
  { grossAmountCents: 100000, discountAmountCents: 15000, discountReason: 'commercial', actorId: 'u-imane' },
  'a 150 MAD discount on 1 000 sends gross 1 000 and discount 150, so the dashboard can show it');

/* La règle du serveur, exactement. */
const d = mzSaleDiscount({ amountCents: 85000, totalCents: 85000, remiseCents: 15000, rewardCents: 0, actorId: 'u-imane' });
eq(d.grossAmountCents - d.discountAmountCents, 85000, 'gross minus discount is the amount received (the server refuses anything else)');

/* Récompense fidélité seule : motif « cliente fidèle » ; avec une remise : commercial. */
eq(mzSaleDiscount({ amountCents: 90000, totalCents: 90000, remiseCents: 0, rewardCents: 10000, actorId: 'u-1' }).discountReason, 'loyal-customer', 'a loyalty reward alone is a loyal-customer discount');
eq(mzSaleDiscount({ amountCents: 80000, totalCents: 80000, remiseCents: 10000, rewardCents: 10000, actorId: 'u-1' }).discountAmountCents, 20000, 'remise and reward add up in one discount');

/* Rien à dire sans remise. */
eq(mzSaleDiscount({ amountCents: 100000, totalCents: 100000, remiseCents: 0, rewardCents: 0, actorId: 'u-1' }), null, 'no discount, no fields');

/* Quand l'argent reçu n'est pas le ticket (avoir, dépôt-vente, acompte, livraison), on se tait plutôt que d'envoyer un brut faux. */
eq(mzSaleDiscount({ amountCents: 50000, totalCents: 85000, remiseCents: 15000, rewardCents: 0, actorId: 'u-1' }), null, 'partly paid by credit note or on account: no discount fields, the server would refuse them');
eq(mzSaleDiscount({ amountCents: 0, totalCents: 85000, remiseCents: 15000, rewardCents: 0, actorId: 'u-1' }), null, 'nothing received: nothing sent');

/* L'acteur : un identifiant, jamais un code. */
eq(mzSaleDiscount({ amountCents: 85000, totalCents: 85000, remiseCents: 15000, rewardCents: 0, actorId: '4821' }).actorId, 'till', 'a four-digit value is never sent as the actor (it could be a staff code)');
eq(mzSaleDiscount({ amountCents: 85000, totalCents: 85000, remiseCents: 15000, rewardCents: 0, actorId: 'Imane B.' }).actorId, 'till', 'a name with spaces or dots falls back to the till');
eq(mzSaleDiscount({ amountCents: 85000, totalCents: 85000, remiseCents: 15000, rewardCents: 0 }).actorId, 'till', 'no actor known: the till');

console.log(`✓ maison sale discount · ${passed} checks`);
