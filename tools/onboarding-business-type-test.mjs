#!/usr/bin/env node
import { onboardingTestSource } from './onboarding-test-source.mjs';
/* Installation · le type d'activité n'est jamais pré-choisi.
 *
 * 2026-10-12 (audit design, cluster access). L'assistant démarrait avec
 * « Restaurant » déjà sélectionné : un commerçant qui touchait Continuer sans
 * lire déclarait une boutique comme restaurant et chargeait le mauvais métier.
 * Désormais rien n'est choisi, Continuer reste inactif tant qu'aucun type n'est
 * touché, et validate() refuse d'avancer ou de créer l'établissement sans type.
 *
 * Exécute les vraies fonctions de assets/onboarding.js.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = process.env.KIWI_ROOT || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OB = onboardingTestSource();
const DATA = readFileSync(path.join(ROOT, 'assets/onboarding-data.js'), 'utf8');

function grab(start, open = '{') {
  const i = OB.indexOf(start);
  assert.ok(i >= 0, start + ' found');
  let d = 0;
  const close = open === '{' ? '}' : ']';
  for (let k = OB.indexOf(open, i); k < OB.length; k++) {
    if (OB[k] === open) d++; else if (OB[k] === close && --d === 0) return OB.slice(i, k + 1);
  }
  throw new Error('unbalanced ' + start);
}
let checks = 0;
const check = (yes, msg) => { assert.ok(yes, msg); checks++; console.log('  ✓ ' + msg); };

const TYPES = [
  { id: 'restaurant', base: 'restaurant', primary: true, label: { fr: 'Restaurant', en: 'Restaurant', ar: 'مطعم' }, icon: '' },
  { id: 'boutique', base: 'retail', primary: true, label: { fr: 'Boutique', en: 'Shop', ar: 'متجر' }, icon: '' },
  { id: 'pizzeria', base: 'restaurant', label: { fr: 'Pizzeria', en: 'Pizzeria', ar: 'بيتزيريا' }, icon: '' },
];

function wizard(lang, state) {
  const src = [
    grab('const S = {'),
    grab('const TYPE_HINT = {'),
    grab('function footNav('),
    grab('function typeCard('),
    grab('function stepBusiness('),
    grab('function validate('),
  ].join(';\n');
  const ctx = vm.createContext({
    TYPES, RESERVED: [], tr: (o) => (o == null ? '' : (o[lang] ?? o.fr ?? '')),
    parsedDailyGoal: () => 0, esc: (v) => String(v == null ? '' : v),
  });
  vm.runInContext(src.replace('const S = {', 'var S = {'), ctx);
  Object.assign(ctx.S, state);
  return ctx;
}
/* grab() cannot balance `const S = {` through nested braces if a string holds a
   brace; this file's S has none, so a miss here is a real regression. */

console.log('■ Assistant : le type d’activité n’est jamais pré-choisi');

const fresh = wizard('fr', { step: 2, bizName: 'Ma boutique' });
check(fresh.S.typeId === '', 'l’état initial ne choisit aucun type');
check(!/typeId:\s*'restaurant'/.test(OB), 'le source ne ré-installe pas « restaurant » comme valeur par défaut');

const stepNone = fresh.stepBusiness();
check(!/class="kob-type sel/.test(stepNone.body), 'aucune carte n’est affichée comme sélectionnée');
check(/data-go="next"[^>]*\bdisabled\b/.test(stepNone.foot), 'Continuer est désactivé tant qu’aucun type n’est choisi');
check(/aria-disabled="true"/.test(stepNone.foot), 'et annoncé comme désactivé aux lecteurs d’écran');
check(/data-type-hint role="status"(?! hidden)/.test(stepNone.body), 'un message dit quoi faire pour continuer');

for (const lang of ['fr', 'en', 'ar']) {
  const w = wizard(lang, { step: 2, bizName: 'Shop' });
  const hint = w.validate();
  check(typeof hint === 'string' && hint.length > 5, `validate() refuse d’avancer sans type (${lang})`);
}
const fr = wizard('fr', { step: 2, bizName: 'Shop' }).validate();
const en = wizard('en', { step: 2, bizName: 'Shop' }).validate();
const ar = wizard('ar', { step: 2, bizName: 'Shop' }).validate();
check(new Set([fr, en, ar]).size === 3, 'le message existe en trois langues distinctes');
check(wizard('fr', { step: 7, ownerName: 'A', bizName: 'Shop' }).validate() !== null,
  'la création finale refuse aussi un établissement sans type');

const picked = wizard('fr', { step: 2, bizName: 'Shop', typeId: 'boutique' });
const stepPicked = picked.stepBusiness();
check(/class="kob-type sel"[^>]*data-type="boutique"/.test(stepPicked.body), 'le type touché est affiché comme sélectionné');
check(!/data-go="next"[^>]*\bdisabled\b/.test(stepPicked.foot), 'Continuer s’ouvre dès qu’un type est choisi');
check(/data-type-hint role="status" hidden/.test(stepPicked.body), 'le message disparaît une fois le type choisi');
check(picked.validate() === null, 'validate() laisse passer un type connu');
check(wizard('fr', { step: 2, bizName: 'Shop', typeId: 'nimportequoi' }).validate() !== null,
  'un type inconnu (brouillon périmé) ne passe pas non plus');
check(wizard('fr', { step: 2, bizName: '', typeId: 'boutique' }).validate() !== null, 'le nom reste exigé');

/* Le clic réel : il rouvre Continuer et efface le message sans re-rendre l'étape. */
const click = OB.slice(OB.indexOf('const tc = e.target.closest(\'[data-type]\')'), OB.indexOf('const gc = e.target.closest'));
check(/nextBtn\.disabled = false/.test(click) && /hint\.hidden = true/.test(click),
  'toucher un type réactive Continuer et masque le message');
check(/S\.typeId = tc\.dataset\.type;/.test(click), 'et mémorise le choix');

/* Le brouillon ne réinjecte pas un défaut. */
check(/S\.typeId = knownType \? d\.typeId : S\.typeId;/.test(DATA), 'un brouillon sans type valide laisse le choix vide');

console.log(`\n✓ ${checks} checks`);
