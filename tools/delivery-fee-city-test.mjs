/* Ce que le client paie pour la livraison Ozon (Santos, 17 nov. 2026) :
 * 20 MAD à Casablanca, 50 MAD partout ailleurs. Le serveur décide ce que le
 * livreur encaisse (functions/api/ozon/parcels.js › customerFeeCents), la
 * caisse l'affiche (assets/pos-boutique/delivery-card.js › customerFeeMAD) :
 * les deux règles doivent donner le même chiffre pour chaque ville. */
import assert from 'node:assert/strict';
import { customerFeeCents, CUSTOMER_FEE_CENTS, CASABLANCA_FEE_CENTS } from '../functions/api/ozon/parcels.js';
import { customerFeeMAD } from '../assets/pos-boutique/delivery-card.js';

assert.equal(CUSTOMER_FEE_CENTS, 5000);
assert.equal(CASABLANCA_FEE_CENTS, 2000);
/* Les noms tels qu'Ozon les écrit (quartiers de Casablanca compris). */
const casa = ['Casablanca', 'CASABLANCA', 'Casablanca – Centre Ville', 'Casablanca – Ain Sebaa', 'Casablanca – Bernoussi',
  'Casablanca – Sidi Maarouf', 'Casablanca – 2 Mars', 'casablanca - hay hassani', '  Casablanca – Maârif'];
const elsewhere = ['Agadir', 'Rabat', 'SALE', 'Mohammedia', 'Bouskoura', 'Dar Bouazza', 'Laâyoune', 'Marrakech', 'Casablancaise', '', null, undefined];
let n = 0;
for (const c of casa) {
  assert.equal(customerFeeCents(c), 2000, 'serveur · ' + c); n++;
  assert.equal(customerFeeMAD(c), 20, 'caisse · ' + c); n++;
}
for (const c of elsewhere) {
  assert.equal(customerFeeCents(c), 5000, 'serveur · ' + c); n++;
  assert.equal(customerFeeMAD(c), 50, 'caisse · ' + c); n++;
}
for (const c of casa.concat(elsewhere)) { assert.equal(customerFeeMAD(c) * 100, customerFeeCents(c), 'même règle · ' + c); n++; }
console.log('✓ delivery-fee-city-test · ' + n + ' checks');
