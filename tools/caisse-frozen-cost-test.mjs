#!/usr/bin/env node
import caisseTestSource from './caisse-test-source.cjs';
/* La caisse restaurant gèle le coût de chaque plat au moment de la vente.
 *
 * Avant, aucune ligne de la caisse restaurant ne portait de coût : l'Analyse
 * du menu appliquait le coût d'aujourd'hui à toute l'histoire, et une hausse
 * du prix d'achat réécrivait les contributions passées. recordSale() écrit
 * maintenant `unitCost` (fiche technique complète, sinon coût saisi, via
 * KiwiCost.of, le moteur du dashboard). Inconnu : rien, jamais 0. */
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const { loadCost } = require('./kiwi-cost-harness.js');
const html = caisseTestSource(fs.readFileSync(path.join(ROOT, 'kiwi-caisse.html'), 'utf8'));
let pass = 0, fail = 0;
const ok = (c, label, extra) => { if (c) { pass++; console.log('  ✓ ' + label); } else { fail++; console.log('  ✗ ' + label + (extra != null ? '\n      ' + String(extra).slice(0, 400) : '')); } };
console.log('■ Caisse restaurant · coût gelé à la vente (tools/caisse-frozen-cost-test.mjs)');

const src = (html.match(/\n      function frozenUnitCost\(l\) \{[\s\S]*?\n      \}\n/) || [])[0];
ok(!!src, 'frozenUnitCost() existe dans kiwi-caisse.html');
const rec = html.slice(html.indexOf('function recordSale('), html.indexOf('function recordSale(') + 9000);
ok(/const frozenCost = frozenUnitCost\(l\);\s*if \(frozenCost != null\) saved\.unitCost = frozenCost;/.test(rec), 'recordSale() écrit unitCost sur chaque ligne enregistrée');
ok(html.indexOf('assets/cost.js') > 0, 'la caisse charge KiwiCost');

const win = { addEventListener() {}, console, setTimeout };
win.window = win;
const ctx = vm.createContext({ window: win, document: { addEventListener() {} }, console, setTimeout, clearTimeout });
win.KiwiMenuStore = { items: () => [{ id: 'tajine', name: 'Tajine' }, { id: 'the', name: 'Thé' }, { id: 'salade', name: 'Salade' }] };
const C = loadCost(ctx, { costs: {
  items: { the: { cost: 3.456 } },
  recipes: { tajine: { status: 'complete', yield: 1, lines: [{ ing: 'i1', qty: 1 }] } },
  ingredients: [{ id: 'i1', useCost: 38.5 }], charges: [], targets: {},
} });
const freeze = vm.runInContext(`(function(){${src}; return frozenUnitCost;})()`, ctx);
const tajineOf = C.of({ id: 'tajine', name: 'Tajine' });
ok(freeze({ itemId: 'tajine', name: 'Tajine', qty: 2, total: 220 }) === tajineOf.mad && tajineOf.src === 'recipe' && tajineOf.mad > 0, 'Tajine : le coût de la fiche technique est gelé', JSON.stringify(tajineOf));
ok(freeze({ itemId: 'the', name: 'Thé', qty: 1, total: 22 }) === 3.46, 'Thé : le coût saisi, arrondi au centime');
ok(freeze({ itemId: 'salade', name: 'Salade', qty: 1, total: 33 }) === null, 'Salade : coût inconnu, rien n’est écrit (jamais 0)');
ok(freeze({ itemId: 'the', name: 'Thé', qty: 1, total: 0 }) === null, 'ligne offerte à 0 MAD : pas de coût gelé (le registre ne la chiffre pas)');
ok(freeze({ itemId: 'tajine', kind: 'formula', name: 'Menu', qty: 1, total: 120 }) === null && freeze({ itemId: 'the', kind: 'formula-part', name: 'Thé', qty: 1, total: 0 }) === null, 'formule et part de formule : rien d’inventé');
ok(freeze({ name: 'Article libre', qty: 1, total: 15 }) === null, 'article libre sans identifiant : rien');
ok(freeze({ itemId: 'the', name: 'Thé · 1/2', baseName: 'Thé', qty: 1, total: 11, shareDen: 2 }) === 3.46, 'part d’addition : coût du plat entier, la quantité est ramenée à 1/N plus loin');
win.KiwiCost = undefined;
ok(freeze({ itemId: 'the', name: 'Thé', qty: 1, total: 22 }) === null, 'KiwiCost absent : la vente passe, sans coût');

/* Le registre du dashboard lit ce coût comme gelé. */
const L = C.ledger([{ saleId: 's', ts: 5, amount: 22, lines: [{ itemId: 'the', name: 'Thé', qty: 1, total: 22, k: 2 }] }], { from: 0, to: 10 });
ok(L.lines[0].src === 'frozen' && L.lines[0].unit === 2, 'le dashboard prend le coût gelé (k) avant le coût d’aujourd’hui');

console.log(`\n${fail ? '✗' : '✓'} ${pass} contrôles verts${fail ? `, ${fail} en échec` : ''}`);
process.exit(fail ? 1 : 0);
