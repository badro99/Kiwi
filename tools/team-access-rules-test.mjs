import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const ui = fs.readFileSync('assets/team/profile-ui.js', 'utf8');
const start = '    const errs = [];';
const end = "    ['firstName', 'lastName', 'email', 'function', 'endDate', 'password'].forEach";
const body = ui.includes(start) ? ui.slice(ui.indexOf(start), ui.indexOf(end)) : fs.readFileSync('assets/team/access-rules.js', 'utf8').split('/* validation:start */\n')[1].split('/* validation:end */')[0].replaceAll('credentialRules','KiwiStaffCredential');
const T = new Proxy({}, { get: (_, key) => key === 'vDuplicateCodeNamed' ? () => 'duplicate' : key });
const canonicalCode = m => String((m && (m.pinCode || m.password)) || '').trim();
const deps = { T, isCode: v => /^\d{4}$/.test(v), KiwiStaffCredential: { canonicalCode }, memberFullName: m => m.firstName, memberState: { reservedCode: v => v === 'reserved' } };
const evaluate = (data, st, members) => vm.runInNewContext('(function(){' + body + '\nreturn {errs, code, prev};})()', { ...deps, data, st, getMembers: () => members });
const base = { firstName: 'Test', lastName: 'Staff', email: 'staff@example.invalid', function: 'Serveur' };
const cases = [
  [base, {memberId:'new'}, [], []],
  [{}, {memberId:'new'}, [], ['firstName','lastName','email','function']],
  [{...base,email:'invalid'}, {memberId:'new'}, [], ['email']],
  [{...base,contract:'CDD',startDate:'2026-10-20',endDate:'2026-10-19'}, {memberId:'new'}, [], ['endDate']],
  [{...base,contract:'CDI',startDate:'2026-10-20',endDate:'2026-10-19'}, {memberId:'new'}, [], []],
  [{...base,password:'invalid'}, {memberId:'new'}, [], ['password']],
  [base, {memberId:'new'}, [{id:'other',email:' STAFF@example.invalid '}], ['email']],
  [base, {memberId:'same',editing:true}, [{id:'same',email:base.email,hasCode:true}], []],
  [{...base,password:'reserved'}, {memberId:'new'}, [], ['password','password']],
  [{...base,password:'duplicate'}, {memberId:'new'}, [{id:'other',password:'duplicate',firstName:'Other'}], ['password','password']],
];
for (const [data, st, members, fields] of cases) {
  assert.deepEqual(Array.from(evaluate(data,st,members).errs, e => e[0]), fields);
}
console.log('✓ existing editor access behaviour: required identity/function, email uniqueness, contracts, credential conflicts and unresolved access');
if (process.argv.includes('--behaviour-only')) process.exit(0);
const rules = require('../assets/team/access-rules.js');
for (const [data, st, members] of cases) {
  const actual = rules.validate(data, st, members, {...deps,credentialRules:deps.KiwiStaffCredential});
  const expected = evaluate(data,st,members);
  assert.ok(JSON.stringify({errs:actual.errs,code:actual.code,prev:actual.prev}) === JSON.stringify(expected), 'same access decisions');
}
console.log('✓ pure access module matches the shipped editor decisions without DOM');
const saveStart = ui.indexOf('    const savedCode =');
const saveBody = saveStart >= 0 ? ui.slice(saveStart, ui.indexOf('\n    if (st.editing)', saveStart)) : fs.readFileSync('assets/team/access-rules.js','utf8').split('/* member:start */\n')[1].split('/* member:end */')[0].replaceAll('credentialRules','KiwiStaffCredential');
const saveDeps = { Date, Math, makeCode: () => 'synthetic-new', memberCode: canonicalCode, KiwiStaffCredential: {canonicalCode}, teamSlug: () => 'fixture', AVATAR_TONES:['fixture'] };
const saveData = {...base,department:'Salle'};
const saveState = {memberId:'same',languages:[],avatarTone:'fixture',origCreatedAt:1};
for (const prev of [null, {hasCode:true}, {password:'synthetic-old'}]) {
  const args = {data:saveData,st:saveState,code:'',prev,members:[],venueType:'fixture',...saveDeps};
  const expected = vm.runInNewContext('(function(){'+saveBody+'\nreturn member;})()',args);
  assert.ok(expected.password === (prev?.hasCode ? '' : prev?.password || 'synthetic-new'), 'saving preserves existing or unresolved access');
  assert.ok(expected.function === base.function && expected.department === 'Salle', 'assignment is saved verbatim');
  if (!process.argv.includes('--save-behaviour-only')) {
    const actual = rules.buildMember(saveData,saveState,'',prev,[],'fixture',{...saveDeps,credentialRules:saveDeps.KiwiStaffCredential});
    assert.ok(JSON.stringify(actual) === JSON.stringify(expected), 'pure save preserves member fields and access');
  }
}
console.log('✓ member save preserves assignment and credential lifecycle');
