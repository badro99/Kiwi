#!/usr/bin/env node
/* La catégorie d'une sortie de caisse (Pasta Corner, 23 nov. 2026).
 *
 *   · une seule liste : la grille de la caisse (assets/till-categories.js), le
 *     calcul de Dépenses (engine.js), la route (functions/api/_cash-category.js)
 *     et les libellés du tableau de bord ont les mêmes seize clés ;
 *   · la caisse enregistre un motif lisible et la catégorie à part ; « Divers »
 *     sans détail est refusé, le dépôt en banque n'a pas de catégorie ;
 *   · une sortie classée à la caisse n'est plus « à compléter » ;
 *   · les motifs que l'équipe tape vraiment (relevés du mois de Pasta Corner)
 *     se classent, les prénoms de l'équipe en dernier recours. */
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const mod = (p) => import(pathToFileURL(path.join(ROOT, p)).href);
const T = await mod('assets/till-categories.js');
const E = await mod('assets/expenses/engine.js');
const S = await mod('functions/api/_cash-category.js');
const strings = await mod('assets/expenses/strings.js');
const view = await mod('assets/expenses/view.js');

let n = 0;
const ok = (msg) => { n++; console.log('✓ ' + msg); };

{
  assert.deepEqual(T.CATEGORIES, E.CATEGORIES, 'till grid = expenses engine');
  assert.deepEqual([...S.CASH_CATEGORIES], E.CATEGORIES, 'route = expenses engine');
  for (const c of E.CATEGORIES) {
    assert.equal(T.ICON[c], view.CAT_ICON[c], c + ': same Material icon at the till and on the dashboard');
    for (const l of ['fr', 'en', 'ar']) {
      assert.ok(T.tr(c, l), c + ' has a ' + l + ' label at the till');
      assert.ok(strings.dictFor(l)['cat.' + c], c + ' has a ' + l + ' label on the dashboard');
    }
    assert.equal(T.tr(c, 'fr'), strings.dictFor('fr')['cat.' + c], c + ': the till says what the dashboard says');
  }
  ok('one list of sixteen categories: till grid, expenses engine, cash route, dashboard labels and icons');
}

{
  assert.deepEqual(T.reasonFor('produce', '  Khadar  '), { ok: true, reason: 'Khadar', category: 'produce' });
  assert.deepEqual(T.reasonFor('meat', ''), { ok: true, reason: 'Viande', category: 'meat' }, 'no detail: the category name is the reason');
  assert.equal(T.reasonFor('other', '').ok, false, '« Divers » with nothing typed says nothing');
  assert.equal(T.reasonFor('other', '').error, 'needDetail');
  assert.deepEqual(T.reasonFor('other', 'Zambu'), { ok: true, reason: 'Zambu', category: 'other' });
  assert.equal(T.reasonFor('', 'Poulet').error, 'needCat', 'a sortie needs a tile');
  assert.equal(T.reasonFor('theft', 'x').ok, false);
  const bank = T.reasonFor(T.BANK, '');
  assert.deepEqual(bank, { ok: true, reason: 'Dépôt banque', category: '' }, 'a bank deposit has no category');
  assert.equal(E.notAnExpense(bank.reason), 'bank', 'and the expenses page still sets it apart');
  assert.equal(E.notAnExpense(T.reasonFor(T.BANK, 'BMCE').reason), 'bank');
  assert.equal(T.reasonFor('drinks', 'x'.repeat(200)).reason.length, 80, 'the reason fits the route (80)');
  for (const c of E.CATEGORIES) {
    assert.equal(E.classifyReason(T.tr(c, 'fr')), c, c + ': a sortie saved before migration 0036 (reason = category name) is guessed right');
  }
  ok('the till records a readable reason and the category apart; Divers needs a word; a bank deposit stays apart');
}

{
  const events = [
    { id: 'a', movement_kind: 'out', movement_amount_cents: 16200, movement_reason: 'Khadar', day: '2026-11-06', movement_category: 'produce' },
    { id: 'b', movement_kind: 'out', movement_amount_cents: 2000, movement_reason: 'Saad', day: '2026-11-06' },
    { id: 'c', movement_kind: 'out', movement_amount_cents: 900, movement_reason: 'x', day: '2026-11-06', movement_category: 'nonsense' },
  ];
  const rows = E.cashOutRows(events, [], { staff: ['saad'] });
  const a = rows.find((r) => r.cashEventId === 'a');
  assert.equal(a.category, 'produce');
  assert.equal(a.picked, true);
  assert.ok(!a.guessed, 'picked at the till: nothing left to complete');
  assert.equal(rows.find((r) => r.cashEventId === 'b').category, 'staff');
  assert.equal(rows.find((r) => r.cashEventId === 'b').guessed, true);
  assert.equal(rows.find((r) => r.cashEventId === 'c').guessed, true, 'an unknown key is ignored, the reason is guessed');
  const v = E.monthView({ month: '2026-11', today: '2026-11-23', expenses: [], cashOuts: events, salesDays: [], staff: ['Saad'] });
  assert.equal(v.rows.filter((r) => r.guessed).length, 2);
  assert.equal(v.byCategory.find((c) => c.category === 'produce').cents, 16200);
  /* Gardée depuis le bandeau : la même ligne que la fiche « Compléter ». */
  const kept = { id: E.completionId('b'), date: '2026-11-06', amountCents: 2000, category: 'staff', method: 'cash', supplier: '', note: 'Saad',
    vatCents: 0, source: 'till', cashEventId: 'b', createdAt: 1, updatedAt: 1 };
  const v2 = E.monthView({ month: '2026-11', today: '2026-11-23', expenses: [kept], cashOuts: events, salesDays: [], staff: ['Saad'] });
  assert.equal(v2.rows.filter((r) => r.guessed).length, 1, 'a kept guess is no longer to complete');
  assert.equal(v2.outCents, v.outCents, 'and counts once');
  ok('a sortie classed at the till counts as picked, never to complete; an unknown key falls back to the guess');
}

{
  /* Les motifs du mois de Pasta Corner, tels que l'équipe les a tapés. */
  const CASES = {
    meat: ['Poulet et viande', 'Fournisseur de beef', 'Reste de poulet', 'Gezar', 'Gampa', 'Fromages et gampa', 'Fromage et crevettes'],
    produce: ['Khadar', 'Légumes et fruits', 'Basilic 2', 'Persil', 'Fournisseur de lègumes', 'Piment fort'],
    grocery: ['Bayedat', 'Helib', '3atriya', 'Lait', 'Moutarde', 'Cacao', 'Achat de ricota et mascarpone', 'الفراااان'],
    drinks: ['Coca-Cola', 'Cafè', 'Coffe', "Achat de l'eau et oulmes", 'Coca cola ziro'],
    hygiene: ['Javell', 'Sanecroit', 'Sachet poubelle', 'Serviettes', 'Halfa selk', 'Sanecroit et sachet poubelle'],
    energy: ['Bota', 'Butane', 'Lydec'],
    transport: ['Livraison', 'Livreurs'],
    supplier: ['Achat fournisseur', 'Carfour'],
    repairs: ['Technicien de projecteur'],
    marketing: ['Logo'],
    equipment: ['Duracell simply balance'],
    packaging: ['Aluminium'],
  };
  for (const [cat, list] of Object.entries(CASES)) {
    for (const reason of list) assert.equal(E.classifyReason(reason), cat, `« ${reason} » → ${cat}`);
  }
  for (const reason of ['12', '104', 'Zambu', 'Acajou']) assert.equal(E.classifyReason(reason), 'other', `« ${reason} » stays Divers`);
  assert.equal(E.notAnExpense('Change'), 'change', 'making change is not an expense');
  ok('the reasons the team actually types are guessed (Pasta Corner, November 2026); unknown words stay Divers');
}

{
  const staff = { staff: ['saad', 'Kaoutar', 'ADAM', 'Al'] };
  assert.equal(E.classifyReason('Saad', staff), 'staff');
  assert.equal(E.classifyReason('Kawtar cuisine', staff), 'staff', 'Kaoutar written by ear');
  assert.equal(E.classifyReason('Kawtar cuissine', staff), 'staff');
  assert.equal(E.classifyReason('Saad poulet', staff), 'meat', 'a purchase beats the name of who ran the errand');
  assert.equal(E.classifyReason('Adam', staff), 'staff');
  assert.equal(E.classifyReason('Ayoub', staff), 'other', 'not on the team: not guessed as staff');
  assert.equal(E.classifyReason('Albert', staff), 'other', 'a two-letter name never matches');
  assert.equal(E.classifyReason('Saad'), 'other', 'without the team, a name is just a word');
  ok('a team first name is staff, but only when nothing else in the reason is recognisable');
}

console.log(n + ' groupes · till categories');
