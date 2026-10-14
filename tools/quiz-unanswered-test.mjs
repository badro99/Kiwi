#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · quiz de la salle : une question sans réponse ne vaut jamais un point
 *
 * scoreAnswers comparait `Number(given[qi]) === shown`. Or Number(null),
 * Number('') et Number([]) valent 0 : une question laissée vide (ou envoyée en
 * null par JSON.stringify d'un tableau troué) comptait juste dès que la bonne
 * réponse s'affichait en position 0. Un joueur qui ne répondait à rien
 * ramassait des points selon le hasard de l'ordre des choix.
 * ═══════════════════════════════════════════════════════════════════════════ */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { scoreAnswers, givenPosition, findQuiz } from '../functions/api/order/_guest.js';

let failures = 0;
function ok(label, cond, detail) {
  if (cond) { console.log('  ✓ ' + label); return; }
  failures++;
  console.log('  ✗ ' + label + (detail ? ' — ' + detail : ''));
}
console.log('■ Quiz · réponses vides (tools/quiz-unanswered-test.mjs)');

const doc = { games: { quizzes: [], builtin: true } };
const quiz = findQuiz(doc, 'kiwi-cuisine');
const base = scoreAnswers(quiz, []);
const shown = base.right;
ok('un quiz intégré se charge, dix questions', quiz && shown.length === 10);
ok('aucune réponse : zéro bonne réponse, zéro point', base.correct === 0 && base.score === 0, JSON.stringify(base));

const zeroRight = shown.map((p, i) => ({ p, i })).filter((x) => x.p === 0).map((x) => x.i);
ok('le banc a au moins une question dont la bonne réponse s\'affiche en position 0', zeroRight.length > 0, shown.join());

for (const [label, blank] of [['null', null], ['chaîne vide', ''], ['undefined', undefined], ['-1', -1], ['faux', false], ['tableau vide', []], ['objet', {}], ['NaN', NaN], ['1.5', 1.5], ['texte', 'abc']]) {
  const answers = shown.map(() => blank);
  const r = scoreAnswers(quiz, answers);
  ok(`« ${label} » n'est jamais une bonne réponse`, r.correct === 0 && r.score === 0, JSON.stringify({ correct: r.correct }));
}
{
  const hole = []; hole[9] = shown[9];
  const viaJson = JSON.parse(JSON.stringify(hole));          // le tableau troué part en null
  const r = scoreAnswers(quiz, viaJson);
  ok('un tableau troué envoyé par JSON ne compte que la dernière réponse', r.correct === 1, String(r.correct));
}
{
  const r = scoreAnswers(quiz, shown);
  ok('toutes les bonnes positions : dix sur dix, 1000 points', r.correct === 10 && r.score === 1000);
  const text = scoreAnswers(quiz, shown.map(String));
  ok('la position en texte est acceptée comme avant', text.correct === 10);
  const mixed = scoreAnswers(quiz, shown.map((p, i) => (i % 2 ? p : null)));
  ok('moitié répondu juste, moitié vide : cinq', mixed.correct === 5, String(mixed.correct));
}
ok('givenPosition : entiers positifs seulement', givenPosition(0) === 0 && givenPosition('2') === 2 && givenPosition(null) === -1 && givenPosition('') === -1 && givenPosition(-1) === -1);

/* Le client lit best/right : le récapitulatif nomme le meilleur score. */
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const client = fs.readFileSync(path.join(ROOT, 'assets/orderpro-guest.js'), 'utf8');
ok('le récapitulatif affiche le meilleur score quand il dépasse cette partie',
  /res\.best && res\.best\.score > res\.score/.test(client) && (client.match(/gx_best_quiz:/g) || []).length === 3);

console.log(failures ? `\n✗ ${failures} échec(s)\n` : '\n✓ quiz : réponses vides, tout est vert.\n');
process.exitCode = failures ? 1 : 0;
