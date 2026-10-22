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
 *     relu : il échoue aussi ;
 *   · chaque entrée du fichier porte sa nature et sa gravité, sinon le test
 *     échoue : un inventaire de garanties qui ne tiennent pas ne vaut que si
 *     l'on sait ce qu'on attend et ce que l'on risque.
 *       kind     : "decision" (attend une décision produit du propriétaire)
 *                  ou "defect" (bogue connu, pas encore corrigé) ;
 *       severity : "money", "security", "data" ou "display".
 *     KIWI_UPDATE_KNOWN_ISSUES=1 garde la nature et la gravité des entrées
 *     déjà classées et laisse les nouvelles sans : elles échouent tant que
 *     personne ne les a classées à la main. */
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

/* Nature et gravité : relues à la main, jamais devinées par l'outil. */
export const KINDS = ['decision', 'defect'];
export const SEVERITIES = ['money', 'security', 'data', 'display'];
export function classificationErrors(issue) {
  const errs = [];
  if (!KINDS.includes(issue.kind)) errs.push(`kind ${issue.kind === undefined ? 'absent' : JSON.stringify(issue.kind)} (attendu : ${KINDS.join(' | ')})`);
  if (!SEVERITIES.includes(issue.severity)) errs.push(`severity ${issue.severity === undefined ? 'absente' : JSON.stringify(issue.severity)} (attendu : ${SEVERITIES.join(' | ')})`);
  return errs;
}
/* La réécriture : la liste vient du code, la classification du fichier relu. */
export function rewriteBaseline(currentIssues, acceptedByKey) {
  return currentIssues.map((i) => {
    const prev = acceptedByKey.get(key(i.suite, i.label));
    const out = { suite: i.suite, label: i.label };
    if (prev) for (const [k, v] of Object.entries(prev)) if (!(k in out)) out[k] = v;
    return out;
  }).sort((a, b) => a.suite.localeCompare(b.suite) || a.label.localeCompare(b.label));
}

/* La réécriture elle-même : une entrée classée garde sa classe, une nouvelle
 * reste sans, et la seconde doit échouer. */
{
  const prev = new Map([[key('x-properties-test.mjs', 'X-1'), { suite: 'x-properties-test.mjs', label: 'X-1', kind: 'decision', severity: 'money' }]]);
  const out = rewriteBaseline([{ suite: 'x-properties-test.mjs', label: 'X-2' }, { suite: 'x-properties-test.mjs', label: 'X-1' }], prev);
  const ok = out.length === 2 && out[0].label === 'X-1' && out[0].kind === 'decision' && out[0].severity === 'money'
    && classificationErrors(out[0]).length === 0 && !('kind' in out[1]) && classificationErrors(out[1]).length === 2
    && classificationErrors({ kind: 'bug', severity: 'money' }).length === 1;
  if (!ok) { console.error('✗ known-issues-test : la réécriture ne garde plus la classification relue : ' + JSON.stringify(out)); process.exit(1); }
}

let issuesOnFile = base.issues || [];
if (update) {
  issuesOnFile = rewriteBaseline([...current.values()], accepted);
  fs.writeFileSync(BASE, JSON.stringify({ version: 1, issues: issuesOnFile }, null, 2) + '\n');
  console.log(`  tools/known-issues-baseline.json écrit : ${issuesOnFile.length} défauts acceptés (${added.length} ajoutés, ${removed.length} retirés)`);
} else {
  for (const i of added) fail.push(`${i.suite} : nouveau défaut accepté « ${i.label} » absent de tools/known-issues-baseline.json. Corrigez-le, ou ajoutez-le au fichier dans le même commit pour le faire relire.`);
  for (const i of removed) console.log(`  note : « ${i.label} » (${i.suite}) n'est plus un défaut accepté ; KIWI_UPDATE_KNOWN_ISSUES=1 le retire du fichier.`);
}

for (const i of issuesOnFile) {
  const errs = classificationErrors(i);
  if (errs.length) fail.push(`${i.suite} : « ${i.label} » n'est pas classé dans tools/known-issues-baseline.json : ${errs.join(', ')}. Classez-le à la main.`);
}

/* Le décompte, une ligne : ce que l'inventaire attend, et ce qu'il risque. */
const tally = (field, values) => values.map((v) => `${v} ${issuesOnFile.filter((i) => i[field] === v).length}`).join(', ');
const unclassified = issuesOnFile.filter((i) => classificationErrors(i).length).length;
const summary = `  inventaire : ${issuesOnFile.length} entrées · nature : ${tally('kind', KINDS)} · gravité : ${tally('severity', SEVERITIES)}${unclassified ? ` · ${unclassified} non classées` : ''}`;

if (fail.length) {
  console.error('✗ known-issues-test\n  ' + fail.join('\n  '));
  console.log(summary);
  process.exit(1);
}
console.log(`✓ known-issues-test · ${current.size} défauts acceptés dans ${suites.length} suites de propriétés, tous relus et classés dans tools/known-issues-baseline.json`);
console.log(summary);
