#!/usr/bin/env node
/* planning-pay-cents-test · une semaine, un seul total de paie, au centime.
 *
 * Avant : la grille de planning et la grille des heures arrondissaient le coût au
 * dirham et additionnaient des flottants, alors que la paie par ligne
 * (hourlyPayFor) est calculée au centime et que les tuiles l'affichent au
 * centime : deux totaux pour la même semaine. payrollFigures additionnait aussi
 * le variable et la masse de base en flottants. Les en-têtes de jours de la grille
 * des heures étaient en français même en arabe.
 *
 * Tout passe maintenant par payCents / fmtPay (assets/team.js), additionnés en
 * centimes entiers. Ce fichier exécute le vrai payrollFigures (via le banc de
 * paie), la vraie vue de paie (ES module) et les vraies fonctions payCents/fmtPay. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { clients } from './payroll-harness.mjs';

let checks = 0;
const ok = (yes, msg) => { assert.ok(yes, msg); checks++; console.log('  ✓ ' + msg); };
console.log('planning-pay-cents-test');

/* ── payrollFigures : des centimes entiers, pas des flottants ── */
const c = clients();
const DAY = '2026-10-06';
const WEEK = ['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09', '2026-10-10', '2026-10-11'];
{
  const members = [{ id: 'a', hourlyRate: 10.1 }, { id: 'b', hourlyRate: 20.2 }, { id: 'c', hourlyRate: 30.3 }];
  c.setHours({ a: { [DAY]: 1 }, b: { [DAY]: 1 }, c: { [DAY]: 1 } });
  const lines = members.map((m) => c.team.hourlyPayFor(m, 1, WEEK));
  ok(lines[0] + lines[1] + lines[2] !== 60.6, 'le piège existe : 10,10 + 20,20 + 30,30 en flottants ne fait pas 60,60 (' + (lines[0] + lines[1] + lines[2]) + ')');
  const f = c.team.payrollFigures(members, 'x', { days: WEEK });
  ok(f.variablePay === 60.6, 'payrollFigures : la paie variable est la somme exacte des lignes, 60,60');
  ok(f.rated === 3, 'trois membres au taux horaire');
}
{
  const members = [{ id: 'a', baseSalary: 3000.1 }, { id: 'b', baseSalary: 2000.2 }, { id: 'c', baseSalary: 1000.3 }];
  c.setHours({});
  const f = c.team.payrollFigures(members, 'x', { days: WEEK });
  ok(f.baseMass === 6000.6, 'payrollFigures : la masse salariale de base est exacte, 6 000,60');
  ok(Math.abs(f.baseDue * 100 - Math.round(f.baseDue * 100)) < 1e-6, 'la part de base due sur la période est un montant au centime');
  ok(Math.abs(f.baseDue - 6000.6 * 7 / 31) < 0.006, 'et reste la quote-part 7/31 du mensuel, au demi-centime près');
}
{
  const f = c.team.payrollFigures([], 'x', { days: WEEK });
  ok(f.variablePay === 0 && f.baseMass === 0 && f.baseDue === 0, 'sans membre, tout est à zéro');
}

/* ── payCents / fmtPay : les vraies fonctions de team.js ── */
const teamSrc = fs.readFileSync(new URL('../assets/team.js', import.meta.url), 'utf8');
const grabConst = (start) => {
  const i = teamSrc.indexOf(start);
  assert.ok(i >= 0, start);
  let d = 0;
  for (let k = teamSrc.indexOf('{', i); k < teamSrc.length; k++) {
    if (teamSrc[k] === '{') d++; else if (teamSrc[k] === '}' && --d === 0) return teamSrc.slice(i, k + 1);
  }
  throw new Error('unbalanced ' + start);
};
globalThis.window = { __kiwiTeamV2: { periodKind: 'week', hoursByVenue: {}, shiftsByVenue: {} }, KiwiVenue: { getCurrentVenueData: () => ({ type: 'restaurant' }) } };
globalThis.document = { addEventListener() {}, documentElement: { lang: 'fr' }, querySelector: () => null, querySelectorAll: () => [] };
const { payCents, fmtPay } = vm.runInNewContext(`${grabConst('const payCents = ')};\n${grabConst('const fmtPay = ')};\n({ payCents, fmtPay })`,
  { window: globalThis.window, document: globalThis.document, Math, Number });
ok(payCents(4.35) === 435 && payCents(1.005) === 101 && payCents(0.1 + 0.2) === 30 && payCents(-12.9) === -1290, 'payCents : 4,35 → 435, jamais 434 ; 0,1 + 0,2 → 30');
ok(payCents('abc') === 0 && payCents(undefined) === 0 && payCents(NaN) === 0, 'payCents : une valeur absente ou illisible vaut zéro');
const flat = (s) => String(s).replace(/[  \s]+/g, ' ');
ok(flat(fmtPay(123.91)) === '123,91' && flat(fmtPay(250)) === '250' && flat(fmtPay(1234.5)) === '1 234,50', 'fmtPay : un entier reste entier, sinon deux décimales');
ok(flat(fmtPay(60.599999999999994)) === '60,60', 'fmtPay : le bruit binaire d’une somme de flottants ne se voit pas');

/* ── la vue de paie : jours dans la langue de l'écran, total au centime ── */
const { createPayrollView } = await import('../assets/planning/payroll-view.js');
const fn = () => '';
const minutes = (s) => { const [h, m] = String(s).split(':').map(Number); return h * 60 + m; };
const localeOf = (lang) => ({ en: 'en-US', ar: 'ar-MA' }[lang] || 'fr-FR');
const members = [{ id: 'm1', firstName: 'A', hourlyRate: 10.1 }, { id: 'm2', firstName: 'B', hourlyRate: 20.2 }, { id: 'm3', firstName: 'C', hourlyRate: 30.3 }];
function view(lang) {
  return createPayrollView({
    AVATAR_COLORS: {}, IC: {}, Kiwi: { toast() {} }, handlers: {}, live: {},
    buildPeriod: () => ({ days: ['2026-10-05', '2026-10-06'], startFr: '05/10', endFr: '06/10' }),
    correctionsHtml: fn, dateLocale: () => localeOf(lang), deferredMark: fn, esc: (v) => String(v), fmtHours: (v) => String(v), fmtMad: (n) => String(Math.round(n)) + ' MAD', fmtPay, payCents,
    getHours: () => ({ m1: { '2026-10-06': 1 }, m2: { '2026-10-06': 1 }, m3: { '2026-10-06': 1 } }), getMembers: () => members,
    hourlyPayFor: (m, h) => Math.round(h * m.hourlyRate * 100) / 100,
    initials: () => 'X', jobName: (v) => v, memberFullName: (m) => m.firstName, pad: (n) => String(n).padStart(2, '0'),
    payrollFigures: () => ({}), periodNavigatorHtml: fn, periodPillsHtml: fn, render() {}, renderPlanningPane: fn, saveCustomTeams() {},
    shiftHours: (s) => (minutes(s.end) - minutes(s.start)) / 60, svgIcon: fn,
    t: () => ({}), teamKey: () => 'v', toISO: (d) => new Date(d).toISOString().slice(0, 10), trLang: () => lang,
  });
}
const T = new Proxy({}, { get: () => Object.assign(() => '', { toString: () => '' }) });
const heads = (html) => [...html.matchAll(/<span class="m">([^<]*)<\/span>/g)].map((x) => x[1]);
{
  const ar = heads(view('ar').renderHoursPane(T, {}, 'v', members));
  const fr = heads(view('fr').renderHoursPane(T, {}, 'v', members));
  const en = heads(view('en').renderHoursPane(T, {}, 'v', members));
  ok(ar.length === 2 && ar.every((d) => /[؀-ۿ]/.test(d)), 'grille des heures en arabe : les jours s’écrivent en arabe (' + ar.join(' ') + ')');
  ok(fr.every((d) => /^[a-zé.]+$/i.test(d)) && en.every((d) => /^[A-Za-z]+$/.test(d)) && fr.join() !== en.join(), 'le français et l’anglais gardent leurs jours');
  const html = view('fr').renderHoursPane(T, {}, 'v', members);
  const foot = (html.match(/kt-h-foot-tot mono"><b>([^<]*)<\/b><span>MAD/) || [])[1];
  ok(flat(foot) === '60,60', 'la grille des heures : total de la période au centime, somme exacte des lignes (' + foot + ')');
  const tiles = view('fr').payTiles(T, { totalHours: 3, variablePay: 60.6, baseMass: 3000.5, salaried: 1, rated: 3, share: 1, baseDue: 3000.5 }, { days: ['2026-10-06'] }, 4);
  ok(flat(tiles[3].v) === '3 000,50 MAD', 'la masse de base garde ses centimes sur la tuile (' + tiles[3].v + ')');
}

/* ── le câblage : une seule règle pour la grille de planning, l'éditeur et la vue ── */
const hoursSrc = fs.readFileSync(new URL('../assets/team-hours.js', import.meta.url), 'utf8');
const editorSrc = fs.readFileSync(new URL('../assets/planning/shift-editor.js', import.meta.url), 'utf8');
ok(/fmtPay\(cost\)/.test(hoursSrc) && /fmtPay\(grandCostC \/ 100\)/.test(hoursSrc) && /grandCostC \+= payCents\(cost\)/.test(hoursSrc),
  'la grille de planning affiche chaque ligne et le total par fmtPay, additionnés en centimes');
ok(/pb\.textContent = fmtPay\(cost\)/.test(editorSrc) && /fmtPay\(grandCC \/ 100\)/.test(editorSrc) && /grandCC \+= payCents\(cost\)/.test(editorSrc),
  'l’éditeur de service recalcule les mêmes totaux en place');
ok(!/maximumFractionDigits: 0/.test(hoursSrc) && !/maximumFractionDigits: 0/.test(editorSrc), 'plus aucun coût arrondi au dirham dans le planning');
console.log(`✓ planning-pay-cents-test · ${checks} checks`);
