#!/usr/bin/env node
import { onboardingTestSource } from './onboarding-test-source.mjs';
/* Installation · le récapitulatif n'annonce que l'équipe que le commerçant a
 * donnée. Exécute les vraies fonctions de assets/onboarding.js.
 *
 * 2026-10-12. « Passer » sur « Vous êtes combien à travailler ici ? » gardait
 * le 3 affiché par défaut : la dernière étape disait « Équipe · 3 personnes »,
 * le magasin était créé avec staffCount 3 et kiwiTeamSize 3, pour une équipe
 * que personne n'avait déclarée. Et « 1 personnes », et l'arabe toujours au
 * pluriel.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = process.env.KIWI_ROOT || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OB = onboardingTestSource();
const DATA = readFileSync(path.join(ROOT, 'assets/onboarding-data.js'), 'utf8');

function grab(start) {
  const i = OB.indexOf(start);
  assert.ok(i >= 0, start + ' found');
  let d = 0;
  for (let k = OB.indexOf('{', i); k < OB.length; k++) {
    if (OB[k] === '{') d++; else if (OB[k] === '}' && --d === 0) return OB.slice(i, k + 1);
  }
  throw new Error('unbalanced ' + start);
}

let checks = 0;
const check = (yes, msg) => { assert.ok(yes, msg); checks++; console.log('  ✓ ' + msg); };

const src = [grab('function unitFor('), grab('function stepFinish('), grab('function stepTeam(')].join('\n')
  + '\nconst STEPS = [null, null, null, null, stepTeam, null, null, stepFinish];'
  + (OB.includes('function noteTeamAnswer(') ? '\n' + grab('function noteTeamAnswer(') : '\nfunction noteTeamAnswer() {}');

function wizard(lang, state) {
  const ctx = vm.createContext({
    S: Object.assign({ step: 4, ownerName: 'Salma', bizName: 'Café Test', typeId: 'restaurant', venueCount: 1, city: '', teamSize: 3, goals: [], pins: [{ role: 'owner', name: 'Salma', code: '' }] }, state),
    TYPES: [{ id: 'restaurant', label: { fr: 'Restaurant', en: 'Restaurant', ar: 'مطعم' } }],
    GOALS: [],
    tr: (o) => (o == null ? '' : (o[lang] ?? o.fr ?? '')),
    esc: (s) => String(s == null ? '' : s),
    stepper: () => '', footNav: () => '',
  });
  vm.runInContext(src, ctx);
  return ctx;
}
const teamRow = (ctx) => {
  const body = ctx.stepFinish().body;
  const m = body.match(/<span>(Équipe|Team|الفريق)<\/span><b>([^<]*)<\/b>/);
  assert.ok(m, 'the recap has a team row');
  return m[2];
};
const button = (skip) => ({ dataset: { go: 'next' }, hasAttribute: (a) => skip && a === 'data-skip' });

{
  const ctx = wizard('fr', {});
  ctx.noteTeamAnswer(button(true));
  check(ctx.S.teamGiven === false, '« Passer » on the team step records that no team size was given');
  check(teamRow(ctx) === 'Non renseignée', 'the recap says « Non renseignée », not the default « 3 personnes »');
}
{
  const ctx = wizard('fr', {});
  ctx.noteTeamAnswer(button(false));
  check(ctx.S.teamGiven === true && teamRow(ctx) === '3 personnes', '« Continuer » accepts the number shown: « 3 personnes »');
}
{
  const ctx = wizard('fr', { teamGiven: true, teamSize: 1 });
  check(teamRow(ctx) === '1 personne', 'one person reads « 1 personne », not « 1 personnes »');
  check(teamRow(wizard('en', { teamGiven: true, teamSize: 1 })) === '1 person' && teamRow(wizard('en', { teamGiven: false })) === 'Not given', 'English reads « 1 person » and « Not given »');
  const ar = [1, 2, 5, 12].map((n) => teamRow(wizard('ar', { teamGiven: true, teamSize: n })));
  check(ar.join('|') === '1 شخص|2 شخصان|5 أشخاص|12 شخصًا', 'Arabic counts its noun: singular, dual, plural, then singular accusative');
}
{
  const ctx = wizard('fr', { step: 5 });
  ctx.S.teamGiven = true;
  ctx.noteTeamAnswer(button(true));
  check(ctx.S.teamGiven === true, '« Passer » on another step leaves the team answer alone');
}
check(/staffCount: S\.teamGiven \? S\.teamSize : 0,/.test(DATA), 'the business is created without a staff count nobody gave');
check(/if \(S\.teamGiven\) storage\.set\('kiwiTeamSize', String\(S\.teamSize\)\); else storage\.del\('kiwiTeamSize'\);/.test(DATA), 'kiwiTeamSize is only kept when it was given');
check(/teamGiven: !!S\.teamGiven/.test(DATA) && /S\.teamGiven = !!d\.teamGiven;/.test(DATA), 'a resumed draft remembers whether the team was given');
check(!/aria-label="(moins|plus)"/.test(OB), 'the stepper buttons are named in the screen\'s language');

console.log(`\nonboarding-team-recap: ${checks} passed, 0 failed`);
