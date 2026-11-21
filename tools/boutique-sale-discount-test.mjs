#!/usr/bin/env node
/* Caisse boutique · la remise qui part au serveur, comme la caisse maison.
 *
 * 21 nov. 2026 : la boutique envoyait le net d'une vente remisée (850) sans dire
 * qu'il venait de 1 000 moins 150 ; le tableau de bord ne pouvait pas montrer la
 * remise. Ce test passe par le vrai originalSalePayload de pos-boutique.js
 * (banc retail-money-harness) et lit le vrai paiement du ticket. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { mzSaleDiscount } from '../assets/pos-maison/sale-discount.js';

const require = createRequire(import.meta.url);
const { world } = require('./retail-money-harness.cjs');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let passed = 0;
const eq = (a, b, label) => { assert.deepEqual(a, b, label); passed++; };

const c = world('boutique').c;
const line = { pid: 'p1', size: 'M', color: 'noir', qty: 1, unit: 850, name: 'Caftan' };
const sale = (extra) => ({ id: 'B-1', syncId: 'sync-1', tenderVersion: 2, total: 850, discount: 150, lines: [line], parts: [{ m: 'espèces', amount: 850 }], ...extra });

const p = c.originalSalePayload(sale());
eq([p.grossAmountCents, p.discountAmountCents, p.discountReason], [100000, 15000, 'commercial'], 'a sale of 1 000 discounted to 850 sends gross 1 000 and discount 150');
eq(p.grossAmountCents - p.discountAmountCents, p.amountCents, 'gross minus discount is the amount received (the server refuses anything else)');
eq(p.actorId, 'till', 'an old ticket has no actor: the till');
eq({ gross: p.grossAmountCents, off: p.discountAmountCents }, (({ grossAmountCents: gross, discountAmountCents: off }) => ({ gross, off }))(mzSaleDiscount({ amountCents: 85000, totalCents: 85000, remiseCents: 15000 })), 'the boutique uses the same rule as the maison till (one module, pos-maison/sale-discount.js)');
eq('grossAmountCents' in c.originalSalePayload(sale({ discount: 0 })), false, 'no discount, no fields');
eq('grossAmountCents' in c.originalSalePayload(sale({ parts: [{ m: 'espèces', amount: 500 }, { m: 'avoir', amount: 350 }] })), false, 'partly paid by credit note: no discount fields');

/* La vente du comptoir : le même calcul, avec la remise gérante et la récompense fidélité du ticket. */
const src = fs.readFileSync(path.join(ROOT, 'assets/pos-boutique.js'), 'utf8');
const live = src.slice(src.indexOf('const payload = {', src.indexOf('bqFoldBasket(frozen.lines')));
assert.ok(/\.\.\.\(mzSaleDiscount\(\{ amountCents: Math\.round\(cashIn \* 100\), totalCents: Math\.round\(total \* 100\), remiseCents: Math\.round\(tot\.remise \* 100\), rewardCents: Math\.round\(tot\.reward \* 100\), actorId: bqActorId\(\) \}\) \|\| \{\}\)/.test(live.slice(0, 2000)),
  'the counter sale sends the remise and the loyalty reward with the money received');
passed++;

console.log(`✓ boutique sale discount · ${passed} checks`);
