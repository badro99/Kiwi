#!/usr/bin/env node
/* Barre latérale et durées · écrites dans la langue de l'écran.
 *
 * 2026-10-12. Sous l'arabe, trois restes :
 *  · l'étiquette « LIVE » des rubriques restait en lettres latines, alors que
 *    i18n dit déjà « مباشر » pour le même mot (dash.live) ;
 *  · la rubrique Conformité d'un vrai commerce portait une pastille contenant
 *    un seul « · », un badge qui ne dit rien ;
 *  · chaque durée de l'équipe se lisait « 7 h 30 ».
 * Exécute les vraies fonctions de assets/venues.js et assets/team.js.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const root = process.env.KIWI_ROOT || path.resolve(new URL('..', import.meta.url).pathname);
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
let checks = 0;
const check = (yes, msg) => { assert.ok(yes, msg); checks++; console.log('  ✓ ' + msg); };

/* 1 · L'étiquette de rubrique */
const venues = read('assets/venues.js');
const tagLines = venues.split('\n').filter((l) => /^\s*const (NAV_TAG_TEXT|navTag) = /.test(l));
check(tagLines.length === 2, 'the sidebar has one table of tag words and one reader');
const tctx = vm.createContext({});
vm.runInContext(tagLines.join('\n') + '\nthis.navTag = navTag;', tctx);
check(tctx.navTag('LIVE', 'ar') === 'مباشر' && tctx.navTag('LIVE', 'fr') === 'LIVE' && tctx.navTag('LIVE', 'en') === 'LIVE', 'the « LIVE » tag reads « مباشر » under Arabic, « LIVE » in French and English');
const i18n = read('assets/i18n.js');
check(/'dash\.live': 'مباشر'/.test(i18n), 'which is the word the dashboard already uses for live (dash.live)');
check(tctx.navTag('IA', 'ar') === 'IA', 'a tag with no translation is left as written, never blanked');
check(/<span class="tag">\$\{navTag\(it\.tag, lang\)\}<\/span>/.test(venues) && !/<span class="tag">\$\{it\.tag\}<\/span>/.test(venues), 'the sidebar writes every tag through that reader');

/* 2 · La pastille Conformité d'un vrai commerce */
const conf = venues.split('\n').find((l) => /if \(confEl\)/.test(l)) || '';
const run = (cv) => {
  const el = { textContent: 'AAA', style: { display: '' } };
  vm.runInContext(conf, vm.createContext({ confEl: el, cv }));
  return el;
};
const real = run(true), demo = run(false);
check(real.style.display === 'none' && real.textContent === '', 'a real store\'s Conformité link no longer carries a pill holding a lone « · »');
check(demo.style.display === '' && demo.textContent === 'AAA', 'the demo keeps its badge');

/* 3 · Les durées de l'équipe */
const team = read('assets/team.js');
const grab = (name) => {
  const start = team.indexOf(`  function ${name}(`);
  assert.ok(start > 0, name + ' is still in team.js');
  let depth = 0, i = team.indexOf('{', start);
  for (; i < team.length; i++) { if (team[i] === '{') depth++; else if (team[i] === '}' && --depth === 0) break; }
  return team.slice(start, i + 1);
};
const dctx = vm.createContext({ LANG: 'fr' });
vm.runInContext(`const trLang = () => LANG;\n${grab('pad')}\n${grab('fmtDur')}\n${grab('fmtHours')}\nthis.fmtDur = fmtDur; this.fmtHours = fmtHours;`, dctx);
const dur = (lang, mins) => { dctx.LANG = lang; return dctx.fmtDur(mins); };
check(dur('ar', 450) === '7 س 30 د' && dur('ar', 0) === '0 س', 'under Arabic a duration reads « 7 س 30 د », and an empty week « 0 س »');
check(dur('fr', 450) === '7 h 30' && dur('en', 480) === '8 h', 'French and English read exactly as before');
dctx.LANG = 'ar';
check(dctx.fmtHours(0.5) === '0 س 30 د', 'decimal attendance hours go through the same words (0,5 h → 30 minutes)');
check(/input\.value = String\(Number\(input\.dataset\.hoursValue\) \|\| 0\);/.test(team), 'an hour cell still shows the plain decimal while it is edited, so no one has to type the unit');

console.log(`\nsidebar-language: ${checks} passed, 0 failed`);
