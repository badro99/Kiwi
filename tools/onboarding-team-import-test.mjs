// Installation · deux trous de l'étape « codes de l'équipe » :
//   1. les champs prénom n'avaient qu'un texte d'exemple, pas de nom accessible
//      (un lecteur d'écran lisait « champ de texte ») ;
//   2. importMembers, qui recopie l'équipe saisie dans la liste Équipe, échouait
//      sans rien dire : codes enregistrés, page Équipe vide, personne prévenu.
// Exécute les vraies fonctions de assets/onboarding.js.
import { onboardingTestSource } from './onboarding-test-source.mjs';
import assert from 'node:assert/strict';
import vm from 'node:vm';

const OB = onboardingTestSource();
function grab(start) {
  const i = OB.indexOf(start);
  assert.ok(i >= 0, start + ' found');
  let d = 0;
  for (let k = OB.indexOf('{', i); k < OB.length; k++) {
    if (OB[k] === '{') d++; else if (OB[k] === '}' && --d === 0) return OB.slice(i, k + 1);
  }
  throw new Error('unbalanced ' + start);
}
let checks = 0;
const ok = (c, m) => { assert.ok(c, m); checks++; console.log('  ✓ ' + m); };

const src = [grab('function roleMeta('), grab('function accessRow('), grab('function trackTeamImport(')].join('\n');
function world(lang) {
  const ctx = vm.createContext({
    S: { ownerName: 'Salma', pins: [{ role: 'owner', name: 'Salma', code: '' }, { role: 'manager', name: '', code: '' }, { role: 'staff', name: '', code: '' }] },
    ACCESS: [{ title: { fr: 'a' }, perm: { fr: 'a' } }, { title: { fr: 'b' }, perm: { fr: 'b' } }, { title: { fr: 'c' }, perm: { fr: 'c' } }],
    tr: (o) => (o == null ? '' : (o[lang] ?? o.fr ?? '')),
    esc: (s) => String(s == null ? '' : s),
  });
  vm.runInContext(src, ctx);
  return ctx;
}

for (const lang of ['fr', 'en', 'ar']) {
  const w = world(lang);
  const rows = [0, 1, 2].map((i) => vm.runInContext(`accessRow(${i})`, w));
  for (const [i, html] of rows.entries()) {
    const name = html.match(/<input class="kob-field kob-name"[^>]*>/)[0];
    const code = html.match(/<input class="kob-field kob-code"[^>]*>/)[0];
    ok(/aria-label="[^"]{3,}"/.test(name) && !/aria-label="(Code)?"/.test(name), `${lang} row ${i}: the name field has an accessible name`);
    ok(/aria-label="[^"]{3,}"/.test(code), `${lang} row ${i}: the code field has an accessible name`);
  }
  const names = rows.map((h) => h.match(/kob-name"[^>]*aria-label="([^"]*)"/)[1]);
  ok(new Set(names).size === 3, `${lang}: the three name fields are told apart (${names.join(' | ')})`);
  ok(!/—/.test(rows.join('')), `${lang}: no em dash`);
}
const fr = world('fr');
ok(/aria-label="Code"/.test(vm.runInContext('accessRow(1)', fr)) === false, 'the code label is no longer the bare English word');

// trackTeamImport
const track = (team) => vm.runInContext('trackTeamImport', fr)(team);
let t = track({ importMembers: () => 2 });
t.api.importMembers({}, []);
ok(t.failed(3) === false, 'an import that ran is not a failure');
t = track({ importMembers() { throw new Error('boom'); } });
assert.throws(() => t.api.importMembers({}, []));
ok(t.failed(3) === true, 'an import that threw is reported');
t = track({ importMembers: () => 0 });
ok(t.failed(3) === true, 'an import that never ran (no venue, nothing called) is reported');
ok(t.failed(0) === false, 'nobody typed (owner only without a name) is not a failure');
t = track(undefined);
ok(t.api === undefined && t.failed(2) === true, 'a missing team module is reported');
console.log(`onboarding-team-import: ${checks} checks passed`);
