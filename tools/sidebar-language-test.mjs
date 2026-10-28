#!/usr/bin/env node
import coreTestSource from './core-test-source.cjs';
/* Barre latérale et durées · écrites dans la langue de l'écran.
 *
 * 2026-10-12. Sous l'arabe, trois restes :
 *  · l'étiquette « LIVE » des rubriques restait en lettres latines, alors que
 *    i18n dit déjà « مباشر » pour le même mot (dash.live) ; « IA » restait
 *    français sous l'anglais comme sous l'arabe ;
 *  · la rubrique Conformité d'un vrai commerce portait une pastille contenant
 *    un seul « · », un badge qui ne dit rien ;
 *  · chaque durée de l'équipe se lisait « 7 h 30 ».
 * Exécute les vraies fonctions de assets/venues.js et assets/team.js.
 */
import teamTestSource from './team-test-source.cjs';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const root = process.env.KIWI_ROOT || path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const read = (f) => coreTestSource.readFileSync(path.join(root, f), 'utf8');
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
check(tctx.navTag('BETA', 'ar') === 'BETA' && tctx.navTag('BETA', 'en') === 'BETA', 'a tag with no translation is left as written, never blanked');
check(tctx.navTag('IA', 'fr') === 'IA' && tctx.navTag('IA', 'en') === 'AI' && tctx.navTag('IA', 'ar') === 'ذكاء اصطناعي', 'the « IA » tag reads « AI » in English and « ذكاء اصطناعي » in Arabic');
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
const team = teamTestSource();
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
// Plain decimal, rounded to the hundredth for reading only: a copied 7 h 10 is stored exactly (wave 11).
check(/input\.value = String\(Math\.round\(\(Number\(input\.dataset\.hoursValue\) \|\| 0\) \* 100\) \/ 100\);/.test(team), 'an hour cell still shows the plain decimal while it is edited, so no one has to type the unit');

/* 4 · Chaque rubrique de métier a son anglais et son arabe.
 * La section Hôtel citait des clés (sidebar.section.hotel, sidebar.hotel.*)
 * qu'aucun dictionnaire ne définissait, et Économat / Points de vente n'en
 * avaient pas du tout : sous EN et AR, tout le bloc restait en français alors
 * que le reste de la barre changeait de langue. */
const block = (src, head) => {
  const start = src.indexOf(head);
  assert.ok(start >= 0, head + ' is still where the test reads it');
  return src.slice(start, src.indexOf('\n  };', start) + 5);
};
const sctx = vm.createContext({});
vm.runInContext(`${block(venues, '  const ICONS = {')}\n${block(venues, '  const VERTICAL_SECTIONS = {')}\nthis.S = VERTICAL_SECTIONS;`, sctx);
vm.runInContext(`${block(i18n, '  const T = {')}\nthis.T = T;`, sctx);
const { S, T } = sctx;
check(Object.keys(S).includes('hotel'), 'the hotel vertical is one of the sidebar sections read here');
const holes = [];
const arabic = /[؀-ۿ]/;
for (const [type, sect] of Object.entries(S)) {
  const keyed = [[sect.i18nHeader, sect.header], ...sect.items.map((it) => [it.i18n, it.label])];
  for (const [key, fr] of keyed) {
    if (!key) holes.push(`${type} · « ${fr} » has no i18n key`);
    else if (!T.en[key]) holes.push(`${type} · ${key} missing in EN`);
    else if (!T.ar[key] || !arabic.test(T.ar[key])) holes.push(`${type} · ${key} missing in AR`);
  }
}
check(holes.length === 0, 'every vertical header and item has a key, written in English and in Arabic' + (holes.length ? ':\n    ' + holes.join('\n    ') : ''));
check(T.en['sidebar.hotel.reception'] === 'Front desk' && T.ar['sidebar.hotel.reception'] === 'مكتب الاستقبال', 'Réception reads « Front desk » / « مكتب الاستقبال », the words the team roster already uses');
check(T.en['sidebar.section.hotel'] === 'Hotel & Riad' && T.en['sidebar.hotel.economat'] === 'Storeroom' && T.en['sidebar.hotel.outlets'] === 'Outlets', 'the hotel header, Économat and Points de vente are named in English');

console.log(`\nsidebar-language: ${checks} passed, 0 failed`);
