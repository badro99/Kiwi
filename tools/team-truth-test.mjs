#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
 * ÉQUIPE · CE QUE LA PAGE AFFIRME
 *
 * 1. Le département suit le poste.
 * La fiche d'un membre proposait le poste et le département côte à côte sans
 * les relier : choisir « Serveur » laissait le membre en « Cuisine », et le
 * planning comme la masse salariale par département le comptaient en cuisine.
 * Ce fichier exécute le vrai CATALOG / FN_DEPT / deptForFunction de team.js.
 *
 * 2. Un salaire vide n'est pas « 0 MAD », et « En service » dit d'où il
 *    tient son chiffre (pointage en direct, ou heures saisies).
 * 3. Paie & planning : un salaire MENSUEL se ramène aux jours de la période,
 *    la saisie ne totalise que la période, une semaine vide n'est pas un
 *    « conflit ».
 * 4. Salaire et taux horaire : le taux ne paie que les heures au-delà du
 *    contrat (44 h par semaine si rien n'est saisi).
 *
 *   node tools/team-truth-test.mjs
 * ═══════════════════════════════════════════════════════════════════════════ */
import teamTestSource from './team-test-source.cjs';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = process.env.KIWI_ROOT || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = teamTestSource();

function grabBlock(start) {
  const i = SRC.indexOf(start);
  assert.ok(i >= 0, start + ' found');
  let d = 0;
  for (let k = SRC.indexOf('{', i); k < SRC.length; k++) {
    if (SRC[k] === '{') d++; else if (SRC[k] === '}' && --d === 0) return SRC.slice(i, k + 1);
  }
  throw new Error('unbalanced ' + start);
}

const ctx = vm.createContext({});
vm.runInContext([
  grabBlock('const CATALOG = {') + ';',
  grabBlock('const FN_DEPT = {') + ';',
  grabBlock('function deptForFunction('),
  'this.CATALOG = CATALOG; this.deptForFunction = deptForFunction;',
].join('\n'), ctx);
const { CATALOG, deptForFunction } = ctx;

let passed = 0, failed = 0;
function ok(label, fn) {
  try { fn(); passed++; console.log(`  ✓ ${label}`); }
  catch (e) { failed++; console.log(`  ✗ ${label}\n      ${String(e.message).split('\n')[0]}`); }
}

ok('restaurant : Serveur → Salle, Barman → Bar, Plongeur → Plonge', () => {
  const d = CATALOG.restaurant.departments;
  assert.equal(deptForFunction('Serveur', d), 'Salle');
  assert.equal(deptForFunction('Barman', d), 'Bar');
  assert.equal(deptForFunction('Plongeur', d), 'Plonge');
  assert.equal(deptForFunction('Chef de cuisine', d), 'Cuisine');
});
ok('le même poste suit le métier : Maître d’hôtel chez un traiteur → Service, Plongeur en fast-food → Cuisine', () => {
  assert.equal(deptForFunction("Maître d'hôtel", CATALOG.traiteur.departments), 'Service');
  assert.equal(deptForFunction('Plongeur', CATALOG.fastfood.departments), 'Cuisine');
  assert.equal(deptForFunction('Vendeur conseil', CATALOG.pharmacie.departments), 'Comptoir');
  assert.equal(deptForFunction('Vendeur conseil', CATALOG.boutique.departments), 'Vente');
});
ok('chaque poste de chaque métier trouve un département de ce métier', () => {
  const missing = [];
  for (const [trade, c] of Object.entries(CATALOG)) {
    for (const fn of c.functions) {
      const d = deptForFunction(fn, c.departments);
      if (!d || c.departments.indexOf(d) < 0) missing.push(trade + ' · ' + fn);
    }
  }
  assert.deepEqual(missing, []);
});
ok('un poste inconnu ne touche pas au département', () => {
  assert.equal(deptForFunction('Propriétaire', CATALOG.restaurant.departments), '');
});
ok('le formulaire est branché : nouveau membre cohérent, et changement de poste écouté', () => {
  /* 2026-10-12 · a new member no longer starts as the catalogue's first post:
     role and department stay empty until someone picks them, and picking a
     role still fills in its department (team-member-editor-test). */
  assert.ok(/function: '',\n\s+department: '',/.test(SRC), 'nothing chosen on the new member\'s behalf');
  assert.ok(/<select class="kt-ed-in" name="function" required data-kt-function data-depts=/.test(SRC), 'select tagged');
  assert.ok(/e\.target\.matches\('\[data-kt-function\]'\)[\s\S]{0,400}deptForFunction\(e\.target\.value, depts\)[\s\S]{0,600}sel\.dispatchEvent\(new Event\('change'/.test(SRC), 'listener notifies the custom select');
});

ok('un salaire non saisi s’affiche « · Non renseigné », pas « 0 MAD / 0 MAD/h »', () => {
  assert.ok(/salaryUnset: 'Non renseigné'/.test(SRC));
  assert.ok(/\(\+m\.baseSalary \|\| 0\) > 0 \|\| \(\+m\.hourlyRate \|\| 0\) > 0[\s\S]{0,700}T\.salaryUnset/.test(SRC));
  assert.ok(!/<div class="eq-salary-v">\$\{fmtMad\(m\.baseSalary\)\}<\/div><div class="eq-salary-sub">\$\{\(window/.test(SRC), 'old cell gone');
});
ok('masse salariale : « · aucun salaire renseigné » quand personne n’a de salaire', () => {
  assert.ok(/tile\(T\.statPayroll, salaried \? fmtMad\(monthlyPayroll\) : '·', payrollSub\)/.test(SRC));
  assert.ok(/statPayrollNone: 'aucun salaire renseigné'/.test(SRC));
});
ok('« En service » ne se dit plus « estimation » : en direct, ou heures du jour', () => {
  assert.ok(!/\(estimation\)|\(estimate\)|\(تقدير\)/.test(SRC));
  assert.ok(/presentLive \? T\.statPresentSub : T\.statPresentHoursSub/.test(SRC));
});

ok('le sondage de l’équipe en direct redessine quand quelque chose a changé', () => {
  const i = SRC.indexOf('function pollLiveTeam(');
  const body = SRC.slice(i, SRC.indexOf('\n  }\n', i));
  assert.ok(/if \(signature === liveTeamSignature\) \{ liveTeamDelay = Math.min\(120000, liveTeamDelay \* 2\); return; \}\s*liveTeamDelay = LIVE_TEAM_FAST_MS;\s*liveTeamSignature = signature;/.test(body), 'early return on identical reply');
  assert.ok(!/if \(signature !== liveTeamSignature\)/.test(body), 'dead comparison gone');
  assert.ok(/\n\s*applyLiveTeam\(\);\s*\n\s*\}\)\.catch/.test(body), 'renders after a change');
});
ok('« Salaire calculé » sans taux horaire : « · », pas « 0 MAD »', () => {
  assert.ok(/const rated = \(\+m\.hourlyRate \|\| 0\) > 0;/.test(SRC));
  assert.ok(/kt-h-pay mono">\$\{rated \?/.test(SRC));
  assert.ok(/kt-h-foot-tot mono">\$\{anyRated \?/.test(SRC));
});

function payCtx(hours) {
  const c = vm.createContext({ getHours: () => hours });
  vm.runInContext([grabBlock('function periodMonthShare('), grabBlock('function contractWeekHours('),
    grabBlock('function hourlyPayFor('), grabBlock('const payCents = '), grabBlock('function payrollFigures(')].join('\n')
    + '\nthis.f = payrollFigures; this.share = periodMonthShare; this.pay = hourlyPayFor;', c);
  return c;
}
const WEEK = ['2026-10-05','2026-10-06','2026-10-07','2026-10-08','2026-10-09','2026-10-10','2026-10-11'];
ok('une semaine ne doit pas un mois de salaire de base : 7/31 du mensuel', () => {
  const c = payCtx({ a: { '2026-10-06': 8 } });
  const f = c.f([{ id: 'a', baseSalary: 3100, hourlyRate: 0 }], 'x', { days: WEEK });
  assert.equal(Math.round(f.baseDue), 700);
  assert.equal(f.baseMass, 3100);
  assert.equal(f.variablePay, 0);
  assert.equal(f.rated, 0);
});
ok('un mois entier vaut exactement 1, une semaine à cheval reste juste', () => {
  const c = payCtx({});
  const oct = Array.from({ length: 31 }, (_, i) => '2026-10-' + String(i + 1).padStart(2, '0'));
  assert.equal(Math.round(c.share(oct) * 1e9) / 1e9, 1);
  const across = ['2026-09-28','2026-09-29','2026-09-30','2026-10-01','2026-10-02','2026-10-03','2026-10-04'];
  assert.equal(Math.round(c.share(across) * 1e6), Math.round((3 / 30 + 4 / 31) * 1e6));
});
ok('heures × taux : seuls les membres avec un taux comptent', () => {
  const c = payCtx({ a: { '2026-10-06': 8 }, b: { '2026-10-06': 5 } });
  const f = c.f([{ id: 'a', hourlyRate: 20 }, { id: 'b' }], 'x', { days: WEEK });
  assert.equal(f.variablePay, 160);
  assert.equal(f.rated, 1);
  assert.equal(f.totalHours, 13);
});
/* 4. Salaire ET taux horaire : le taux ne paie que les heures au-delà du
 *    contrat (propriétaire, 20 octobre). Avant, « À payer » ajoutait toutes
 *    les heures × taux au salaire, et payait deux fois les heures du contrat. */
ok('salarié avec taux : 50 h sur une semaine de 44 h, seules 6 h passent au taux', () => {
  const c = payCtx({ a: { '2026-10-05': 10, '2026-10-06': 10, '2026-10-07': 10, '2026-10-08': 10, '2026-10-09': 10 } });
  const f = c.f([{ id: 'a', baseSalary: 3100, hourlyRate: 20 }], 'x', { days: WEEK });
  assert.equal(f.variablePay, 120);
  assert.equal(Math.round(f.baseDue), 700);
  assert.equal(f.totalHours, 50);
});
ok('salarié avec taux sous son contrat : rien au taux, le salaire seul', () => {
  const c = payCtx({ a: { '2026-10-06': 8, '2026-10-07': 8 } });
  const f = c.f([{ id: 'a', baseSalary: 3100, hourlyRate: 20 }], 'x', { days: WEEK });
  assert.equal(f.variablePay, 0);
  assert.equal(f.rated, 1);
});
ok('heures du contrat saisies : un 24 h qui en fait 30 touche 6 h au taux', () => {
  const c = payCtx({});
  assert.equal(c.pay({ baseSalary: 2000, hourlyRate: 25, contractHours: 24 }, 30, WEEK), 150);
});
ok('sur un mois, le contrat compte en semaines : 44 h × 31/7', () => {
  const c = payCtx({});
  const oct = Array.from({ length: 31 }, (_, i) => '2026-10-' + String(i + 1).padStart(2, '0'));
  const pay = c.pay({ baseSalary: 4000, hourlyRate: 30 }, 200, oct);
  assert.equal(Math.round(pay * 100) / 100, Math.round((200 - 44 * 31 / 7) * 30 * 100) / 100);
});
ok('sans salaire, toutes les heures restent au taux', () => {
  const c = payCtx({});
  assert.equal(c.pay({ hourlyRate: 20 }, 50, WEEK), 1000);
  assert.equal(c.pay({ baseSalary: 3000 }, 50, WEEK), 0);
});
ok('les quatre écrans qui chiffrent des heures passent par hourlyPayFor', () => {
  assert.ok(!/\* \(\+m\.hourlyRate( \|\| 0)?\)/.test(SRC), 'no raw hours × rate left');
  assert.ok(/const pay = rated \? hourlyPayFor\(m, total, period\.days\) : 0;/.test(SRC), 'hours grid');
  assert.ok(/const pay = hourlyPayFor\(m, tot, period\.days\);/.test(SRC), 'live hours entry');
  assert.equal((SRC.match(/const cost = hourlyPayFor\(m, h, period\.days\);/g) || []).length, 2, 'planning cost, render and live');
  assert.ok(/split \? '' : \(value \* \(\+member\.hourlyRate \|\| 0\)\)\.toFixed\(2\)/.test(SRC), 'CSV leaves a salaried day without its own cost');
  assert.ok(/contractHours: Math\.min\(80, Math\.max\(0, parseFloat\(data\.contractHours\) \|\| 0\)\)/.test(SRC), 'editor saves the contract hours');
});
ok('la saisie en direct ne totalise que les jours de la période affichée', () => {
  assert.ok(!/Object\.values\(row\)\.reduce\(\(a, b\) => a \+ \(\+b \|\| 0\), 0\)/.test(SRC), 'all-time sum gone');
  assert.ok(/const tot = period\.days\.reduce\(\(a, d\) => a \+ \(\+row\[d\] \|\| 0\), 0\);/.test(SRC));
  assert.ok(/const pt = payTiles\(t\(\), payrollFigures\(members, vt, period\), period, members\.length\);/.test(SRC), 'live tiles share the render');
});
ok('une semaine vide se dit « Rien de planifié », pas « 1 conflit à résoudre »', () => {
  assert.ok(/const emptyPlan=blockers\.length===1&&blockers\[0\]\.code==='empty-schedule';/.test(SRC));
  assert.ok(/emptyPlan:'Rien de planifié pour l’instant'/.test(SRC));
  assert.ok(/issue\.code === 'empty-schedule' \? '' : planIssueDay\(issue\.day\)/.test(SRC));
});
ok('coût prévu sans taux horaire : « · »', () => {
  assert.ok(/showCosts \? \(\(\+m\.hourlyRate \|\| 0\) > 0 \?/.test(SRC));
});

console.log(`\nteam-truth: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
