#!/usr/bin/env node
/* Une étiquette de carton (réf. 1986-10, KHAKI, 36 à 41 : 1 2 3 3 2 1, 12 paires)
 * doit arriver à l'écran comme un assortiment de tailles prêt à entrer en stock,
 * pas comme une phrase dans une note. Le 21 nov. 2026, le modèle principal
 * rendait UNE ligne de 12 avec les tailles dans `notes` : le bouton « Ajouter au
 * stock » n'avait rien pour remplir la grille. Ce fichier tient le contrat du
 * serveur (functions/api/ai/vision-inspect.js) ; aucun modèle n'est appelé. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
const route = await import('../functions/api/ai/vision-inspect.js');
const src = fs.readFileSync(new URL('../functions/api/ai/vision-inspect.js', import.meta.url), 'utf8');
const { validateVisionData, interpretVisionOutput } = route;
let n = 0;
const ok = (value, name) => { assert.ok(value, name); n++; };
const eq = (a, b, name) => { assert.deepEqual(a, b, name); n++; };

const RUN = [['36', 1], ['37', 2], ['38', 3], ['39', 3], ['40', 2], ['41', 1]].map(([size, qty]) => ({ size, qty }));
const base = (entities) => ({
  docType: 'boutique_product', categoryLabel: 'Étiquette de carton', title: 'Carton 1986-10', confidence: 0.97,
  summary: 'Étiquette de carton.', entities,
  suggestedActions: [{ id: 'a', type: 'product-add', label: 'Ajouter', primary: true }],
});

/* 1 · La forme rendue le 21 novembre : une ligne de 12, les tailles en prose. */
{
  const out = validateVisionData(base({
    invoiceNumber: '1986-10', totalMad: 0,
    items: [{ name: 'Khaki Item (Art No. 1986-10)', qty: 12, unitPrice: 0, total: 0 }],
    notes: 'Size breakdown: 36(1), 37(2), 38(3), 39(3), 40(2), 41(1).',
  }));
  eq(out.entities.sizeRun, [], 'des tailles écrites en prose ne deviennent pas un assortiment');
  ok(!out.reviewNeeded, 'la lecture reste valable, simplement sans grille de tailles');
}

/* 2 · L'assortiment structuré : six tailles, douze paires, référence et couleur. */
{
  const out = validateVisionData(base({ reference: '1986-10', color: 'Khaki', packQty: 12, sizeRun: RUN, totalMad: 0, items: [] }));
  eq(out.entities.sizeRun, RUN, 'une entrée par taille, dans l’ordre de l’étiquette');
  eq([out.entities.reference, out.entities.color, out.entities.packQty], ['1986-10', 'Khaki', 12], 'référence, couleur et quantité du carton');
  ok(!out.reviewNeeded && out.reviewReasons.length === 0, 'un assortiment dont la somme tombe juste n’est pas à vérifier');
}

/* 3 · La somme ne tombe pas sur la quantité imprimée : à vérifier, aucune action. */
{
  const short = RUN.map((r) => (r.size === '39' ? { size: '39', qty: 2 } : r));
  const out = validateVisionData(base({ reference: '1986-10', packQty: 12, sizeRun: short, items: [] }));
  ok(out.reviewNeeded === true && out.reviewReasons.includes('size-run-mismatch'), '11 paires lues pour 12 imprimées : à vérifier');
  eq(out.suggestedActions, [], 'une lecture à vérifier n’offre aucune action');
}

/* 4 · Sans quantité imprimée, il n'y a rien à quoi comparer : la somme fait foi. */
{
  const out = validateVisionData(base({ reference: '1986-10', sizeRun: RUN, items: [] }));
  ok(!out.reviewNeeded && out.entities.packQty === null, 'pas de quantité imprimée, pas de comparaison inventée');
}

/* 5 · Une entrée illisible n'est jamais devinée ni arrondie. */
for (const [label, bad] of [
  ['quantité fractionnaire', { size: '38', qty: 1.5 }],
  ['quantité négative', { size: '38', qty: -1 }],
  ['quantité absente', { size: '38' }],
  ['quantité en lettres', { size: '38', qty: 'trois' }],
  ['taille vide', { size: ' ', qty: 3 }],
  ['taille en double', { size: '36', qty: 3 }],
]) {
  const out = validateVisionData(base({ sizeRun: [...RUN.filter((r) => r.size !== '38'), bad], items: [] }));
  ok(out.reviewNeeded === true && out.reviewReasons.includes('invalid-size-run'), label + ' : à vérifier');
  ok(out.suggestedActions.length === 0, label + ' : aucune action');
}
{
  const many = Array.from({ length: 41 }, (_, i) => ({ size: 'T' + i, qty: 1 }));
  const out = validateVisionData(base({ sizeRun: many, items: [] }));
  ok(out.reviewReasons.includes('invalid-size-run') && out.entities.sizeRun.length <= 40, 'un assortiment sans fin est borné et signalé');
}
{
  const out = validateVisionData(base({ sizeRun: RUN, packQty: 'douze', items: [] }));
  ok(out.reviewReasons.includes('invalid-size-run'), 'une quantité de carton illisible est signalée');
}
{
  const out = validateVisionData(base({ sizeRun: [{ size: '36', qty: '1' }, { size: 'M/L', qty: 2 }], reference: 'x'.repeat(90), items: [] }));
  eq(out.entities.sizeRun, [{ size: '36', qty: 1 }, { size: 'M/L', qty: 2 }], 'une quantité écrite « 1 » est un 1 ; une taille en lettres passe telle quelle');
  ok(out.entities.reference.length === 60 && out.reviewReasons.includes('truncated-fields'), 'une référence trop longue est coupée et signalée');
}

/* 6 · De bout en bout, depuis le texte du modèle. */
{
  const text = 'Voici :\n' + JSON.stringify(base({ reference: '1986-10', color: 'KHAKI', packQty: 12, sizeRun: RUN, items: [] }));
  const out = interpretVisionOutput(text);
  ok(out.status === 'parsed' && out.data.entities.sizeRun.length === 6, 'la réponse du modèle arrive avec ses six tailles');
}

/* 7 · Le modèle est bien prié de remplir l'assortiment, et pas la note. */
ok(/"sizeRun"\s*:/.test(src) && /"reference"\s*:/.test(src) && /"packQty"\s*:/.test(src), 'le format demandé au modèle porte sizeRun, reference et packQty');
ok(/sizeRun[^\n]*(jamais|never)[^\n]*notes|notes[^\n]*sizeRun/i.test(src), 'le prompt interdit de ranger l’assortiment dans notes');

console.log('✓ vision-size-run · ' + n + ' contrôles : assortiment de tailles structuré, somme vérifiée, rien de deviné');
