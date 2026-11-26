/* Design 2027 de la caisse · en vue opérateur, il suit le commerce AFFICHÉ.
 *
 * 19 nov. 2026 : le propriétaire ouvre la caisse de Santos Store depuis la
 * console (kiwi-caisse?pair=1&op=1&merchant=santos-store) et reçoit le design
 * 2027, que Santos n'a jamais activé. Le serveur choisissait d'après le cookie
 * de caisse appairée du navigateur (un magasin de test, interrupteur allumé),
 * pas d'après le magasin à l'écran. En vue opérateur, c'est le magasin de
 * l'adresse qui décide ; partout ailleurs rien ne change (la caisse appairée,
 * puis les magasins du compte connecté).
 *   node tools/staff-skin-operator-test.mjs
 */
import assert from 'node:assert/strict';
import { staffSkinOn } from '../functions/_middleware.js';

const FEATURES = { 'santos-store': { skin2027: false }, 'amira-cafe': { skin2027: true } };
const env = { DB: { prepare(sql) {
  return { bind(slug) { return { async all() {
    assert.match(sql, /WHERE merchant = \?/);
    return { results: FEATURES[slug] ? [{ features: JSON.stringify(FEATURES[slug]) }] : [] };
  } }; } };
} } };
const req = (path, cookie) => new Request('https://kiwi-os.com' + path, { headers: cookie ? { Cookie: cookie } : {} });
let passed = 0;
const ok = async (label, run) => { await run(); passed++; console.log('  ✓ ' + label); };

await ok('operator view of Santos (switch off) from a browser paired to Amira Cafe (switch on): old design', async () => {
  assert.equal(await staffSkinOn(req('/kiwi-caisse?pair=1&op=1&merchant=santos-store', 'kiwi_till_store=amira-cafe'), env, 'device'), false);
});
await ok('operator view of Amira Cafe from a browser paired to Santos: 2027 design', async () => {
  assert.equal(await staffSkinOn(req('/kiwi-caisse?pair=1&op=1&merchant=amira-cafe', 'kiwi_till_store=santos-store'), env, 'device'), true);
});
await ok('a paired till without op=1 still follows its own store, whatever the address says', async () => {
  assert.equal(await staffSkinOn(req('/kiwi-caisse?merchant=amira-cafe', 'kiwi_till_store=santos-store'), env, 'device'), false);
  assert.equal(await staffSkinOn(req('/kiwi-caisse', 'kiwi_till_store=amira-cafe'), env, 'device'), true);
});
await ok('a malformed merchant in the address is ignored', async () => {
  assert.equal(await staffSkinOn(req('/kiwi-caisse?op=1&merchant=Amira%20Cafe!', 'kiwi_till_store=santos-store'), env, 'device'), false);
});

console.log(`staff-skin-operator: ${passed} passed`);
