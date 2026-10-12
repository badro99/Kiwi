#!/usr/bin/env node
/* Équipe · fonctions et services se lisent dans la langue de l'écran et
 * s'enregistrent en français. Exécute le vrai dictionnaire et le vrai jobName()
 * de assets/team.js, puis contrôle chaque point d'affichage.
 *
 * 2026-10-12. Sous l'anglais et l'arabe, la page Équipe, l'accueil (« qui est
 * là aujourd'hui ») et le planning disaient « Caissier », « Salle »,
 * « Propriétaire » : 128 intitulés, tous en français, sans traduction nulle part.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const root = process.env.KIWI_ROOT || path.resolve(new URL('..', import.meta.url).pathname);
const src = fs.readFileSync(path.join(root, 'assets/team.js'), 'utf8');
let checks = 0;
const check = (yes, msg) => { assert.ok(yes, msg); checks++; console.log('  ✓ ' + msg); };

function grabConst(name) {
  const i = src.indexOf(`  const ${name} = `);
  assert.ok(i >= 0, name + ' found');
  const open = src.indexOf('{', i);
  let d = 0;
  for (let k = open; k < src.length; k++) {
    if (src[k] === '{') d++; else if (src[k] === '}' && --d === 0) return src.slice(i, src.indexOf(';', k) + 1);
  }
  throw new Error('unbalanced ' + name);
}
const ctx = vm.createContext({ LANG: 'fr' });
vm.runInContext(['const trLang = () => LANG;', grabConst('JOB_FN'), grabConst('JOB_DEPT'), grabConst('jobName'),
  'this.api = { JOB_FN, JOB_DEPT, jobName };'].join('\n'), ctx);
const { JOB_FN, JOB_DEPT, jobName } = ctx.api;
const read = (lang, v, kind) => { ctx.LANG = lang; return jobName(v, kind); };

/* Couverture : chaque intitulé que la page peut proposer a sa traduction. */
const q = (blob) => [...blob.matchAll(/'((?:[^'\\]|\\.)*)'|"([^"]*)"/g)].map((m) => (m[1] ?? m[2]).replace(/\\'/g, "'"));
const fns = new Set(), depts = new Set();
for (const m of src.matchAll(/functions:\s*\[([^\]]*)\]/g)) q(m[1]).forEach((x) => fns.add(x));
for (const m of src.matchAll(/departments:\s*\[([^\]]*)\]/g)) q(m[1]).forEach((x) => depts.add(x));
const onb = src.slice(src.indexOf('const ONB_ROLE_FN = {'), src.indexOf('};', src.indexOf('const ONB_ROLE_FN = {')));
for (const m of onb.matchAll(/fn:\s*'([^']*)',\s*dept:\s*'([^']*)'/g)) { fns.add(m[1]); depts.add(m[2]); }
const missFn = [...fns].filter((f) => !(JOB_FN[f] && JOB_FN[f].en && JOB_FN[f].ar));
const missDept = [...depts].filter((d) => !(JOB_DEPT[d] && JOB_DEPT[d].en && JOB_DEPT[d].ar));
check(fns.size > 70 && !missFn.length, `every function the page offers reads in EN and AR (${fns.size})` + (missFn.length ? ' · missing ' + missFn.join(', ') : ''));
check(depts.size > 40 && !missDept.length, `every department reads in EN and AR (${depts.size})` + (missDept.length ? ' · missing ' + missDept.join(', ') : ''));
check(Object.values(JOB_FN).concat(Object.values(JOB_DEPT)).every((r) => /[؀-ۿ]/.test(r.ar) && !/[—]/.test(r.en + r.ar)), 'every Arabic name is Arabic, and no name carries an em dash');

check(read('en', 'Caissier') === 'Cashier' && read('ar', 'Caissier') === 'أمين الصندوق' && read('fr', 'Caissier') === 'Caissier', 'a function reads per language, and French reads as stored');
check(read('en', 'Commercial') === 'Sales representative' && read('en', 'Commercial', 'dept') === 'Business development', 'the same French word reads as a function or as a department by context');
check(read('en', 'Propriétaire') === 'Owner' && read('ar', 'Direction', 'dept') === 'الإدارة العامة', 'the onboarding owner role reads too');
check(read('ar', 'Chef pâtissier maison') === 'Chef pâtissier maison' && read('en', '') === '', 'a title typed by hand stays as written');

/* Points d'affichage : le texte se lit, la valeur reste la clé. */
check(/<option value="\$\{esc\(v\)\}"\$\{current === v \? ' selected' : ''\}>\$\{esc\(jobName\(v, kind\)\)\}<\/option>/.test(src), 'editor selects keep the French key as the value and show the read name');
check(/optsWithCurrent\(cat\.departments, m\.department, 'dept'\)/.test(src), 'the department select reads departments');
check(/data-arg="\$\{esc\(d\)\}">\$\{esc\(jobName\(d, 'dept'\)\)\}<\/button>/.test(src), 'the department filter keeps its French argument and shows the read name');
check(!/\$\{esc\(m\.function\)\}/.test(src) && !/\$\{esc\(m\.department\)\}/.test(src), 'no member card, row or select prints a raw function or department');
check(/const rolePreview = \(T, fn, dept\) => \[jobName\(fn\), jobName\(dept, 'dept'\)\]/.test(src), 'the role preview reads');
check(/role: m\.function \? jobName\(m\.function\) : jobName\(m\.department \|\| '', 'dept'\),\n\s*avatar:/.test(src), 'the home « who is in today » roster reads');
check(/\$\{role===selected\?' selected':''\}>\$\{esc\(jobName\(role\)\)\}<\/option>/.test(src), 'the planning role filter reads');
check(/\$\{jobName\(m\.function\)\} \$\{jobName\(m\.department, 'dept'\)\}/.test(src), 'search finds a member by the read name too');
check(/function: data\.function,/.test(src) && /role: m\.function \|\| m\.department \|\| m\.role \|\| '',/.test(src), 'what is saved, and what reports and the assistant read, stays the French key');

console.log(`\nteam-job-names: ${checks} passed, 0 failed`);
