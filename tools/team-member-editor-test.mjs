#!/usr/bin/env node
// Mutation vérifiée : edError() retourne avant de signaler ou effacer une erreur.
// Anciennes assertions vertes, exécution rouge ; octets livrés restaurés ensuite.
import { createRequire as text2Require } from 'node:module';
text2Require(import.meta.url)('./text2-runtime.cjs').run('team-member-editor');
/* Équipe · the member editor and the empty roster say only what is true.
 *
 * 2026-10-12. The form behind « Ajouter un membre » was a single grey column
 * whose placeholders read like a filled-in record (« Sara », « Belkadi »,
 * « BK 384721 », « Allergie crustacés… »). A new member was pre-set as the
 * catalogue's first post (« Chef de cuisine · Cuisine ») speaking French and
 * Arabic, nobody having said so. Contract and language names stayed French
 * under EN and AR, a missing field only raised a toast, and the empty
 * roster's « Ajouter un membre » button re-opened the page instead.
 *   node tools/team-member-editor-test.mjs
 */
import teamTestSource from './team-test-source.cjs';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = process.env.KIWI_ROOT || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const team = teamTestSource();
const lens = readFileSync(path.join(ROOT, 'assets/liquid-lens.js'), 'utf8');

let passed = 0, failed = 0;
function ok(label, fn) {
  try { fn(); passed++; console.log(`  ✓ ${label}`); }
  catch (e) { failed++; console.log(`  ✗ ${label}\n      ${String(e.message).split('\n')[0]}`); }
}
const slice = (from, to) => {
  const a = team.indexOf(from);
  return a < 0 ? '' : team.slice(a, to ? team.indexOf(to, a + from.length) : undefined);
};
const modalFn = slice('  function openMemberModal(memberId) {', "  handlers['kt-add-member']");
const submit = slice("  handlers['kt-submit-member'] = () => {", '  /* ═══════════════ VIEW PROFILE MODAL');

console.log('member editor · nothing filled in on anyone\'s behalf');
ok('placeholders are formats, not a person (no Sara, Belkadi, BK 384721, Karim, crustacés)', () => {
  assert.ok(!/placeholder: \{ firstName:/.test(team), 'the old sample-person placeholder dictionary');
  assert.ok(!/T\.placeholder\./.test(modalFn));
  const ph = (team.match(/^      ph: \{ email: .*$/gm) || []);
  assert.equal(ph.length, 3, 'FR, EN, AR format hints');
  assert.ok(!ph.some((l) => /Sara|Belkadi|BK 384721|crustacés/.test(l)));
});
ok('a new member has no role, no department and no languages until someone picks them', () => {
  const defaults = modalFn.slice(modalFn.indexOf('const m = existing || {'), modalFn.indexOf('const isCddOrStage'));
  assert.match(defaults, /function: '',\n\s+department: '',/);
  assert.match(defaults, /languages: \[\],/);
  assert.ok(!/cat\.functions\[0\]/.test(defaults));
});
ok('the role select starts on « Choisir un poste » for a new member, and the role is still required', () => {
  assert.match(modalFn, /editing \? '' : `<option value=""\$\{m\.function \? '' : ' selected'\}>\$\{esc\(T\.edChooseFn\)\}<\/option>`/);
  assert.match(submit, /\['firstName', 'lastName', 'email', 'function'\]\.forEach/);
});
ok('a contract nobody set is saved as unset, not silently « CDI »', () => {
  assert.match(submit, /contract: data\.contract \|\| '',/);
});

console.log('member editor · layout and language');
ok('two columns: sections on the left; who and the till code on the right', () => {
  assert.match(modalFn, /<form class="kt-ed" data-kt-form/);
  assert.match(modalFn, /<aside class="kt-ed-side">/);
  assert.match(modalFn, /class="kt-ed-in kt-ed-pin" type="text" name="password"/);
  assert.match(team, /\.kt-ed \{ display: grid; grid-template-columns: minmax\(0, 1fr\) 264px;/);
});
ok('the sheet is opaque in both themes (no frosted glass under the form)', () => {
  assert.match(team, /\.kiwi-backdrop\.kt-ed-modal \.kiwi-modal\.kiwi-modal \{[^}]*backdrop-filter: none !important;/);
  assert.match(team, /body\[data-vexel-mode="dark"\] \.kiwi-backdrop\.kt-ed-modal \.kiwi-modal\.kiwi-modal \{ --kt-bg: #0F1512;/);
  assert.match(modalFn, /mdl\.el\.classList\.add\('kt-ed-modal'\);/);
});
ok('contract type is a segmented control on the liquid lens, not a select', () => {
  assert.match(modalFn, /role="radiogroup" aria-labelledby="kt-ed-ct-l" data-kt-contract-group/);
  assert.ok(!/name="contract" data-kt-contract>/.test(modalFn), 'old <select name="contract">');
  assert.match(lens, /\{ sel: '\.kt-ed-seg', item: '\.kt-ed-segi', skin: 'surface',/);
  assert.match(lens, /\.kt-ed-seg\[data-kw-lens\] \.kt-ed-segi\.on span\{background:transparent;box-shadow:none;\}/);
});
ok('contract and language names follow the session language (form, roster, profile)', () => {
  assert.match(team, /const langLabel = \(T, l\) =>/);
  assert.match(team, /const contractLabel = \(T, c\) =>/);
  assert.match(modalFn, /esc\(langLabel\(T, l\)\)/);
  assert.match(team, /esc\(m\.contract \? contractLabel\(T, m\.contract\) : '·'\)/);
  assert.match(team, /row\(T\.contractType, m\.contract \? esc\(contractLabel\(T, m\.contract\)\) : notSet\)/);
});
ok('every new string exists in FR, EN and AR', () => {
  for (const k of ['edReq', 'edEmailHint', 'edChooseFn', 'edChooseDept', 'edRoleUnset', 'edSalary', 'edHourly',
    'edPerMonth', 'edPerHour', 'edCompHint', 'edCodeT', 'edCodeHint', 'edErrRequired', 'edCheck', 'noMembersYet', 'noMembersHint']) {
    assert.equal((team.match(new RegExp(`^      ${k}: `, 'gm')) || []).length, 3, k);
  }
});
ok('no em dash in the new copy', () => {
  const block = team.slice(team.indexOf("      edReq: 'obligatoire',"), team.indexOf("      edReq: 'required',"));
  assert.ok(block && !/—/.test(block));
});
ok('language chips say whether they are pressed', () => {
  assert.match(modalFn, /aria-pressed="\$\{on\}"/);
  assert.match(team, /el\.setAttribute\('aria-pressed', String\(idx === -1\)\)/);
});

console.log('member editor · errors where they happen');
ok('each problem is written under its own field and the first one takes the focus', () => {
  assert.match(team, /function edError\(root, name, msg\) \{/);
  assert.match(submit, /errs\.forEach\(\(\[n, msg\]\) => \{ if \(!seen\[n\]\) \{ seen\[n\] = 1; edError\(root, n, msg\); \} \}\);/);
  assert.match(submit, /target\.focus\(\{ preventScroll: true \}\)/);
});
ok('an empty e-mail is not compared against members who have none', () => {
  assert.match(submit, /if \(emailKey && members\.some\(/);
});
ok('typing in a flagged field clears its error', () => {
  assert.match(team, /if \(e\.target\.name && e\.target\.getAttribute\('aria-invalid'\) === 'true'\) edError\(mdl\.el, e\.target\.name, ''\);/);
});
ok('the four-digit and duplicate-code rules survive', () => {
  assert.match(submit, /if \(code && !isCode\(code\)\) errs\.push\(\['password', T\.vCode\]\);/);
  assert.match(submit, /errs\.push\(\['password', T\.vDuplicateCode\]\);/);
});

console.log('member profile · says what is on file, nothing else');
const profile = slice("  handlers['kt-view-profile'] = (_el, id) => {", '  function profileSection(');
ok('a salary nobody entered reads « Non renseigné », not « 0 MAD »', () => {
  assert.match(profile, /const pay = \(n, per\) => \(\(\+n \|\| 0\) > 0/);
  assert.match(profile, /: notSet\);/);
  assert.ok(!/\(m\.baseSalary \|\| 0\), \{\}\)/.test(profile), 'the old 0-defaulting salary line');
});
ok('dates are written in the session language, not as 2026-10-12', () => {
  assert.match(profile, /toLocaleDateString\(dateLocale\(\), \{ day: 'numeric', month: 'long', year: 'numeric' \}\)/);
  assert.match(profile, /row\(T\.startDate, day\(m\.startDate\)\)/);
});
ok('the personal code is masked until the owner presses « Afficher »', () => {
  assert.match(profile, /<b data-kt-pv-code aria-live="polite">••••<\/b>/);
  assert.match(profile, /data-kt-pv-reveal aria-pressed="false"/);
  assert.match(profile, /out\.textContent = shown \? code : '••••';/);
  assert.ok(!/esc\(m\.password \|\| T\.placeholderPwd\)/.test(profile), 'the old clear-text code row');
});
ok('no dangling « · » when a member has no department', () => {
  assert.equal((team.match(/profileSub: \(role, dept\) => \[role, dept\]\.filter\(Boolean\)\.join\(' · '\),/g) || []).length, 3);
  assert.ok(!/\$\{esc\(m\.function\)\} · \$\{esc\(m\.department\)\}/.test(team));
  assert.match(team, /\$\{m\.department \? `<span class="eq-venue-badge">\$\{esc\(jobName\(m\.department, 'dept'\)\)\}<\/span>` : ''\}/);
});
ok('the sheet is the editor\'s opaque sheet, and its words exist in FR, EN and AR', () => {
  assert.match(profile, /profileM\.el\.classList\.add\('kt-ed-modal'\);/);
  for (const k of ['pvTitle', 'pvNotSet', 'pvShow', 'pvHide', 'pvNoCode', 'pvCodeHint', 'pvIdEmergency']) {
    assert.equal((team.match(new RegExp(`^      ${k}: `, 'gm')) || []).length, 3, k);
  }
});

console.log('roster · empty state');
ok('« Ajouter un membre » on the empty roster opens the form (it re-opened the page)', () => {
  const pane = slice('  function renderProfilesPane(T, venue, venueType, members) {', '  function renderMembersTable(');
  assert.match(pane, /data-action="kt-add-member" style="margin-top:12px;">/);
  assert.ok(!/data-action="nav-equipe" style="margin-top:10px;">/.test(pane));
});
ok('no members at all is not « no member matches the filters »', () => {
  assert.equal((team.match(/members\.length \? T\.noMatch : T\.noMembersYet/g) || []).length, 2);
});

console.log('arabic · icons in buttons');
ok('only arrows and chevrons are mirrored in RTL (the check on « Ajouter » read as a chevron)', () => {
  const theme = readFileSync(path.join(ROOT, 'assets/theme.css'), 'utf8');
  assert.ok(!/html\[dir="rtl"\] \.btn svg, html\[dir="rtl"\] \.kb svg/.test(theme), 'the old flip-every-icon rule');
  assert.match(theme, /svg:is\(\[data-lucide\*="arrow"\], \[data-lucide\*="chevron"\], \[data-material-symbol\*="arrow"\], \[data-material-symbol\*="chevron"\]\) \{ transform: scaleX\(-1\); \}/);
});

console.log(`\nteam-member-editor: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
