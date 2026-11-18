/* Ce que le client paie pour la livraison Ozon (Santos) :
 * 20 MAD à Casablanca et Rabat, 30 MAD à Salé et Témara, 50 MAD partout ailleurs
 * (propriétaire, 18 nov. 2026 ; Casablanca seule à 20 depuis le 17 nov.). Le
 * serveur décide ce que le livreur encaisse (functions/api/ozon/parcels.js ›
 * customerFeeCents), la caisse l'affiche (assets/pos-boutique/delivery-card.js ›
 * customerFeeMAD) : les deux règles doivent donner le même chiffre pour chaque ville. */
import assert from 'node:assert/strict';
import { customerFeeCents, CUSTOMER_FEE_CENTS, CASABLANCA_FEE_CENTS, NEAR_FEE_CENTS } from '../functions/api/ozon/parcels.js';
import { customerFeeMAD } from '../assets/pos-boutique/delivery-card.js';

assert.equal(CUSTOMER_FEE_CENTS, 5000);
assert.equal(CASABLANCA_FEE_CENTS, 2000);
assert.equal(NEAR_FEE_CENTS, 3000);
/* Les noms tels qu'Ozon les écrit, quartiers compris (« Casablanca – Ain Sebaa »). */
const twenty = ['Casablanca', 'CASABLANCA', 'Casablanca – Centre Ville', 'Casablanca – Ain Sebaa', 'Casablanca – Bernoussi',
  'Casablanca – Sidi Maarouf', 'Casablanca – 2 Mars', 'casablanca - hay hassani', '  Casablanca – Maârif',
  'Rabat', 'RABAT', 'Rabat – Agdal', 'Rabat - Hay Riad'];
const thirty = ['Salé', 'SALE', 'Sale', 'Salé – Tabriquet', 'Sala Al Jadida', 'Témara', 'Temara', 'TEMARA', 'Témara – Harhoura'];
const fifty = ['Agadir', 'Mohammedia', 'Bouskoura', 'Dar Bouazza', 'Laâyoune', 'Marrakech', 'Kénitra', 'Skhirat',
  'Casablancaise', 'Rabatville', 'Salem', '', null, undefined];
let n = 0;
for (const [list, mad] of [[twenty, 20], [thirty, 30], [fifty, 50]]) {
  for (const c of list) {
    assert.equal(customerFeeCents(c), mad * 100, 'serveur · ' + c); n++;
    assert.equal(customerFeeMAD(c), mad, 'caisse · ' + c); n++;
  }
}
console.log('✓ delivery-fee-city-test · ' + n + ' checks');
