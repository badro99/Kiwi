#!/usr/bin/env node
/* known-issues-test · la liste des défauts acceptés est relue, jamais silencieuse.
 *
 *   node tools/known-issues-test.mjs
 *   KIWI_UPDATE_KNOWN_ISSUES=1 node tools/known-issues-test.mjs   (acte une liste relue)
 *
 * Les suites tools/*-properties-test.mjs rangent un défaut déjà relevé, en
 * attente d'une décision, dans knownIssue(...) : son contre-exemple s'affiche
 * sans faire échouer le gate. Rien n'empêchait d'en ajouter un de plus pour
 * faire passer une propriété rouge : le gate restait vert.
 *
 * Ce test lit la SOURCE de chaque suite (aucun navigateur, aucun réseau), relève
 * l'identifiant ou le libellé de chaque appel knownIssue(...) et le compare à
 * tools/known-issues-baseline.json :
 *   · un défaut absent du fichier fait échouer le test : il faut le corriger,
 *     ou l'ajouter au fichier dans le même commit, donc le faire relire ;
 *   · un défaut retiré du code (corrigé, passé en stricte) n'échoue pas : une
 *     note le signale et KIWI_UPDATE_KNOWN_ISSUES=1 le retire du fichier ;
 *   · un appel dont le premier argument n'est pas un littéral ne peut pas être
 *     relu : il échoue aussi. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TOOLS = path.join(ROOT, 'tools');
const BASE = path.join(TOOLS, 'known-issues-baseline.json');
const update = process.env.KIWI_UPDATE_KNOWN_ISSUES === '1';

const LITERAL = /^\s*(?:'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)"|`((?:[^`\\]|\\.)*)`)/;

/* Les appels knownIssue(...) d'une source : { label } ou { unreadable }.
 * La définition (function knownIssue(...), knownIssue=(...)=>) n'en est pas un. */
export function collectKnownIssues(source) {
  const found = [];
  const call = /(?<![\w$.])knownIssue\(/g;
  let m;
  while ((m = call.exec(source))) {
    const lineStart = source.lastIndexOf('\n', m.index) + 1;
    const before = source.slice(lineStart, m.index);
    if (/^\s*(\/\/|\*|\/\*)/.test(before)) continue;
    if (/function\s*\*?\s*$/.test(before)) continue;
    const lit = LITERAL.exec(source.slice(m.index + m[0].length));
    if (!lit) { found.push({ unreadable: true, at: source.slice(0, m.index).split('\n').length }); continue; }
    found.push({ label: (lit[1] ?? lit[2] ?? lit[3]).replace(/\\(['"`\\])/g, '$1') });
  }
  return found;
}

const key = (suite, label) => suite + '\u0000' + label;

/* L'extracteur lui-même : si une forme d'appel cessait d'être vue, la liste
 * resterait verte sans rien garder. */
{
  const sample = [
    "async function knownIssue(id,label,p){}",
    "const strict=(l,p)=>1,knownIssue=(l,p)=>2;",
    "await knownIssue('A-1','long libellé',fc.property())",
    '  await knownIssue("B 2 l\'apostrophe", x)',
    '// knownIssue(\'commentaire\', p)',
    'await knownIssue(`C3`, p)',
    'await knownIssue(dynamic, p)',
    'await xknownIssue(\'pas un appel\', p)',
  ].join('\n');
  const got = collectKnownIssues(sample);
  const labels = got.filter((g) => g.label).map((g) => g.label);
  const ok = labels.length === 3 && labels[0] === 'A-1' && labels[1] === "B 2 l'apostrophe" && labels[2] === 'C3'
    && got.filter((g) => g.unreadable).length === 1;
  if (!ok) { console.error('✗ known-issues-test : l\'extracteur ne relève plus les appels attendus : ' + JSON.stringify(got)); process.exit(1); }
}

const suites = fs.readdirSync(TOOLS).filter((f) => /-properties-test\.mjs$/.test(f) && !/ 2\./.test(f)).sort();
const current = new Map();
const fail = [];
for (const suite of suites) {
  for (const item of collectKnownIssues(fs.readFileSync(path.join(TOOLS, suite), 'utf8'))) {
    if (item.unreadable) fail.push(`${suite}:${item.at} : knownIssue(...) sans identifiant ni libellé littéral en premier argument, impossible à relire.`);
    else current.set(key(suite, item.label), { suite, label: item.label });
  }
}

let base = { version: 1, issues: [] };
try { base = JSON.parse(fs.readFileSync(BASE, 'utf8')); } catch (_) { if (!update) fail.push('tools/known-issues-baseline.json est illisible ou absent (KIWI_UPDATE_KNOWN_ISSUES=1 pour l\'écrire).'); }
const accepted = new Map((base.issues || []).map((i) => [key(i.suite, i.label), i]));

const added = [...current.values()].filter((i) => !accepted.has(key(i.suite, i.label)));
const removed = [...accepted.values()].filter((i) => !current.has(key(i.suite, i.label)));

if (update) {
  const issues = [...current.values()].sort((a, b) => a.suite.localeCompare(b.suite) || a.label.localeCompare(b.label));
  fs.writeFileSync(BASE, JSON.stringify({ version: 1, issues }, null, 2) + '\n');
  console.log(`  tools/known-issues-baseline.json écrit : ${issues.length} défauts acceptés (${added.length} ajoutés, ${removed.length} retirés)`);
} else {
  for (const i of added) fail.push(`${i.suite} : nouveau défaut accepté « ${i.label} » absent de tools/known-issues-baseline.json. Corrigez-le, ou ajoutez-le au fichier dans le même commit pour le faire relire.`);
  for (const i of removed) console.log(`  note : « ${i.label} » (${i.suite}) n'est plus un défaut accepté ; KIWI_UPDATE_KNOWN_ISSUES=1 le retire du fichier.`);
}

if (fail.length) {
  console.error('✗ known-issues-test\n  ' + fail.join('\n  '));
  process.exit(1);
}
console.log(`✓ known-issues-test · ${current.size} défauts acceptés dans ${suites.length} suites de propriétés, tous relus dans tools/known-issues-baseline.json`);
