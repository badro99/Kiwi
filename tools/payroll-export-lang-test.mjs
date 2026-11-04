#!/usr/bin/env node
/* Payroll export: language and honesty (r18 planning#0, planning#1, i18n#1).
 *
 *  · the CSV headings and the contract-period total follow the dashboard
 *    language (FR/EN/AR) and the file still imports back (the import reads the
 *    same headings in the three languages);
 *  · when the durable audit hand-off of the export is refused, the merchant is
 *    told instead of the rejection being swallowed.
 * Runs the real team-hours handlers (with their planning parts) in the team
 * suite's dashboard harness, and the real import planner from csv-import.js. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import owners from './team-owners-test-source.cjs';
import sourceHelper from './planning-test-source.cjs';
import { shippedFunction } from './shipped-function.mjs';

const run = (fn, ...args) => fn(...args); // every value below comes from running the shipped code
const read = (f) => fs.readFileSync(f, 'utf8');
const suite = read('tools/team-split-test.mjs');
const harness = suite.slice(suite.indexOf('function realm('), suite.indexOf("\nfor (const lang of ['fr'"));
const realm = vm.runInNewContext('(' + harness + ')', { vm, console });
const team = read('assets/team/catalog.js') + '\n' + owners.runtimeSource(false);
const runtime = sourceHelper.planningRuntimeSource();

const HEAD = {
  fr: 'Période début;Période fin;ID membre;Employé;Fonction;Date;Heures;Taux horaire MAD;Coût heures MAD;Salaire de base MAD',
  en: 'Period start;Period end;Member ID;Employee;Role;Date;Hours;Hourly rate MAD;Hourly cost MAD;Base salary MAD',
  ar: 'بداية الفترة;نهاية الفترة;رقم العضو;الموظف;الوظيفة;التاريخ;الساعات;سعر الساعة MAD;تكلفة الساعات MAD;الراتب الأساسي MAD',
};
const TOTAL = { fr: /^Total période \(contrat \d+(\.\d+)? h \/ semaine\)$/, en: /^Period total \(contract \d+(\.\d+)? h \/ week\)$/, ar: /^إجمالي الفترة \(عقد \d+(\.\d+)? ساعة \/ أسبوع\)$/ };

// The real import planner, lifted from the shipped part, to prove the round trip.
const importSource = read('assets/planning/csv-import.js');
const lift = {};
for (const name of ['parseCsv', 'dayIsLocked', 'planHoursImport']) lift[name] = shippedFunction(importSource, name, lift);
// normHead is declared as a const arrow in the part: lift it by evaluating the declaration.
vm.runInNewContext('globalThis.normHead = ' + importSource.match(/const normHead = ([^\n]+);/)[1], lift);
lift.pad = (n) => String(n).padStart(2, '0');
lift.lockBucket = () => ({});
lift.memberFullName = (m) => [m.first, m.last, m.name].filter(Boolean).join(' ');

function exportCsv(lang, operations) {
  const r = run(realm, team + '\n' + runtime, lang);
  const csvParts = [];
  const ctx = r.context;
  ctx.Blob = class { constructor(parts) { csvParts.push(parts.join('')); } };
  ctx.URL = { createObjectURL: () => 'blob:x', revokeObjectURL() {} };
  ctx.document.body.appendChild = () => {};
  const baseCreate = ctx.document.createElement;
  ctx.document.createElement = (tag) => Object.assign(baseCreate(tag), { click() {}, remove() {} });
  ctx.KiwiOperations = operations;
  // Hours for the first member so the contract total row exists when it applies.
  ctx.Kiwi.handlers['nav-equipe']();
  const members = ctx.Kiwi.__teamCore.getMembers('boutique');
  return { r, ctx, csvParts, members };
}

for (const lang of ['fr', 'en', 'ar']) {
  const { r, ctx, csvParts, members } = exportCsv(lang, { create: async () => ({ ok: true }) });
  members[0].baseSalary = 3000; members[0].hourlyRate = 20; // a contract + rate: the total row is emitted
  ctx.Kiwi.handlers['kt-export-csv']();
  const csv = csvParts[0].replace(/^﻿/, '');
  const lines = csv.split('\r\n');
  assert.equal(lines[0].replace(/"/g, ''), HEAD[lang], 'headings in ' + lang);
  const totals = lines.filter((l) => /^(?:"[^"]*";){5}"(Total|Period total|إجمالي)/.test(l));
  assert.ok(totals.length >= 1, 'a contract-period total row exists in ' + lang);
  totals.forEach((l) => assert.match(l.split(';')[5].replace(/"/g, ''), TOTAL[lang], 'contract total label in ' + lang));
  // Round trip: the exported file is recognised by the import in every language.
  const plan = lift.planHoursImport(csv, members, {});
  assert.ok(plan && plan.changes.length > 0, 'the ' + lang + ' export imports back');
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(r.notices.filter((n) => n[1] && n[1].type === 'warning').length, 0, 'no warning when the audit hand-off succeeds');
}

// planning#1: a refused audit hand-off is told, in the merchant's language.
const WARN = { fr: 'Journal d’audit non mis à jour', en: 'Audit log not updated', ar: 'لم يتم تحديث سجل التدقيق' };
for (const lang of ['fr', 'en', 'ar']) {
  const { r, ctx, csvParts } = exportCsv(lang, { create: () => Promise.reject(Object.assign(new Error('permission-denied'), { code: 'permission-denied' })) });
  ctx.Kiwi.handlers['kt-export-csv']();
  assert.equal(csvParts.length, 1, 'the file is still produced');
  await new Promise((resolve) => setImmediate(resolve));
  const warnings = r.notices.filter((n) => n[1] && n[1].type === 'warning');
  assert.equal(warnings.length, 1, 'one warning when the audit hand-off is refused (' + lang + ')');
  assert.equal(warnings[0][0], WARN[lang]);
  assert.ok(warnings[0][1].desc && warnings[0][1].desc.length > 20);
}
// An ok:false result (nothing recorded, nothing queued) is the same failure.
{
  const { r, ctx } = exportCsv('en', { create: async () => ({ ok: false, offline: true, queued: false }) });
  ctx.Kiwi.handlers['kt-export-csv']();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(r.notices.filter((n) => n[1] && n[1].type === 'warning').length, 1);
}
// No operations module at all (demo surface): the export stands, nothing to warn about.
{
  const { r, ctx, csvParts } = exportCsv('fr', undefined);
  ctx.Kiwi.handlers['kt-export-csv']();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(csvParts.length, 1);
  assert.equal(r.notices.filter((n) => n[1] && n[1].type === 'warning').length, 0);
}
console.log('✓ payroll-export-lang-test : en-têtes de l\'export de paie en FR/EN/AR, fichier réimportable, échec du journal d\'audit annoncé');
