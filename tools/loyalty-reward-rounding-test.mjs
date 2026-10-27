#!/usr/bin/env node
/* Fidélité · une seule règle d'arrondi pour la remise d'une récompense en pourcentage
 * (décision wave Q, 26 octobre 2026, « même règle pour tous les métiers »).
 *
 * Avant, la boutique gardait le total arrondi vers le bas (la remise montait au
 * centime supérieur) et la librairie arrondissait la remise au plus proche : pour
 * 1,01 MAD à -10 %, 0,11 contre 0,10. La règle vit maintenant dans
 * functions/api/_rules-loyalty.js ; les copies générées (magasin clients, caisse
 * boutique, fidélité librairie) sont exécutées telles quelles et doivent rendre la
 * même remise, au centime le plus proche, bornée entre 0 et la base. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import sharedRules from './shared-rules-source.cjs';
import * as source from '../functions/api/_rules-loyalty.js';

const ROOT = new URL('..', import.meta.url).pathname;
const fc = createRequire(ROOT + 'app/package.json')('fast-check');
let checks = 0;
const ok = (c, m) => { assert.ok(c, m); checks++; console.log('  ✓ ' + m); };

const COPIES = ['assets/clients-store.js', 'assets/clients-store/loyalty.js', 'assets/pos-boutique.js', 'assets/librairie-loyalty.js'];
const rules = { 'functions/api/_rules-loyalty.js': source };
for (const file of COPIES) {
  const ctx = vm.createContext({});
  vm.runInContext(sharedRules(fs.readFileSync(ROOT + file, 'utf8')), ctx);
  rules[file] = ctx.KiwiLoyaltyRules;
}
const pct = (value) => ({ clientId: 'c', kind: 'percent', value });
const nearest = (cents, value) => Math.round(cents * value / 100 + 1e-9) / 100;   // centimes entiers → MAD

for (const [name, r] of Object.entries(rules)) {
  ok(typeof r.rewardDiscount === 'function', `${name}: exports rewardDiscount`);
  ok(r.rewardDiscount(pct(10), 'c', 1.01, []) === 0.10, `${name}: -10 % sur 1,01 MAD fait 0,10 (nearest centime, pas 0,11)`);
  ok(r.rewardDiscount(pct(10), 'c', 1.01, [], 'boutique') === r.rewardDiscount(pct(10), 'c', 1.01, [], 'librairie'), `${name}: l'ancienne politique passée en argument ne change plus rien`);
  ok(r.rewardDiscount(pct(15), 'c', 24.95, []) === 3.74, `${name}: -15 % sur 24,95 MAD fait 3,74`);
  ok(r.rewardDiscount(pct(100), 'c', 12.34, []) === 12.34 && r.rewardDiscount(pct(0), 'c', 12.34, []) === 0, `${name}: 100 % rend la base, 0 % rien`);
  ok(r.rewardDiscount(pct(250), 'c', 12.34, []) === 12.34 && r.rewardDiscount(pct(-5), 'c', 12.34, []) === 0, `${name}: un pourcentage hors 0 à 100 est borné`);
  ok(r.rewardDiscount(pct(10), 'c', -20, []) === 0 && r.rewardDiscount(pct(10), 'c', NaN, []) === 0, `${name}: base négative ou illisible, aucune remise`);
  ok(r.rewardDiscount(pct(10), 'autre-client', 100, []) === 0 && r.rewardDiscount(null, 'c', 100, []) === 0, `${name}: pas la récompense de ce client, aucune remise`);
  ok(r.rewardDiscount({ clientId: 'c', kind: 'free' }, 'c', 100, [30, 12.5, 40]) === 12.5 && r.rewardDiscount({ clientId: 'c', kind: 'free' }, 'c', 100, []) === 0, `${name}: l'article offert reste le moins cher du ticket`);
}

await fc.assert(fc.property(fc.integer({ min: 0, max: 2000000 }), fc.integer({ min: 0, max: 100 }), (cents, value) => {
  const expected = nearest(cents, value);
  for (const [name, r] of Object.entries(rules)) {
    const got = r.rewardDiscount(pct(value), 'c', cents / 100, []);
    assert.equal(got, expected, `${name}: ${value} % de ${cents / 100}`);
    assert.ok(got >= 0 && got <= cents / 100 + 1e-9, `${name}: bornée par la base`);
    assert.equal(Math.round(got * 100) / 100, got, `${name}: au centime`);
  }
}), { numRuns: 400, seed: 20261027 });
ok(true, 'propriété : les cinq exemplaires rendent la même remise, au centime le plus proche, bornée (400 cas)');

// Le total payé reste correct : base - remise ne descend jamais sous zéro et reste au centime.
await fc.assert(fc.property(fc.integer({ min: 0, max: 2000000 }), fc.integer({ min: 0, max: 100 }), (cents, value) => {
  const total = Math.round((cents / 100 - source.rewardDiscount(pct(value), 'c', cents / 100, [])) * 100);
  assert.ok(total >= 0 && total <= cents);
}), { numRuns: 200, seed: 7 });
ok(true, 'propriété : le total après remise reste entre 0 et la base');

const lib = fs.readFileSync(ROOT + 'assets/librairie-loyalty.js', 'utf8');
ok(!/'librairie'\)/.test(lib), 'la librairie appelle la règle partagée sans politique propre');
console.log(`loyalty-reward-rounding: ${checks} checks`);
