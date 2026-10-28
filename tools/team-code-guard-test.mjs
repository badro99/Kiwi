#!/usr/bin/env node
/* Équipe · les codes de caisse ne se perdent plus en silence.
 *
 * Vague 14, voie A. Trois défauts relevés par la notation 12 :
 *   · publishPins() écartait sans un mot le salarié dont le code en doublonnait
 *     un autre (`seen[code]`), si bien que le 409 duplicate-staff-code du
 *     serveur ne partait jamais et que la page annonçait « enregistré » ;
 *   · makeCode() tirait au hasard sans regarder le roster (collision ~5 % à
 *     30 salariés), ce qui alimentait le défaut ci-dessus ;
 *   · l'éditeur laissait attribuer 0001, que la caisse réserve à l'écran
 *     cuisine avant de chercher un code de salarié : celui qui le porte ne
 *     peut jamais ouvrir sa caisse.
 * Tout tourne : les modules du navigateur sont exécutés dans vm. Les codes
 * ci-dessous sont synthétiques et ne sont jamais imprimés.
 *   node tools/team-code-guard-test.mjs
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = process.env.KIWI_ROOT || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

let passed = 0;
async function ok(label, fn) { await fn(); passed++; console.log(`  ok  ${label}`); }
const members = (list) => list.map(([id, first, code]) => ({ id, firstName: first, lastName: 'T.', pinCode: code, password: code }));

/* ───────── invitations.js : makeCode / reservedCode / importMembers ───────── */
function bootInvitations(win, deps) {
  win.KiwiTeamParts = {};
  vm.runInNewContext(read('assets/team/invitations.js'), { window: win, Uint32Array, Math });
  return win.KiwiTeamParts.invitations.create({ ensureVenueData() {}, teamKey: () => 'v', teamSlug: () => 's', saveCustomTeams() {}, render() {}, AVATAR_TONES: ['a'], ...deps });
}
const realCrypto = { getRandomValues(a) { a[0] = Math.floor(Math.random() * 0xffffffff); return a; } };

console.log('team codes · generated codes avoid the roster');
await ok('a generated code never equals a code already in a 30-person roster (20 000 draws)', () => {
  const inv = bootInvitations({ crypto: realCrypto });
  const roster = members(Array.from({ length: 30 }, (_, i) => ['m' + i, 'P' + i, String(2000 + i * 37)]));
  const taken = new Set(roster.map((m) => m.pinCode));
  for (let i = 0; i < 20000; i++) {
    const c = inv.makeCode(roster);
    assert.ok(/^\d{4}$/.test(c), 'four digits');
    assert.ok(!taken.has(c), 'collision with the roster');
  }
});
await ok('with a single free code left, that is the code returned, whatever the draw', () => {
  const free = '5555';
  const roster = Array.from({ length: 9000 }, (_, i) => String(1000 + i)).filter((c) => c !== free);
  for (const draw of [0, 1, 5555 - 1000, 8999, 123456]) {
    const inv = bootInvitations({ crypto: { getRandomValues(a) { a[0] = draw; return a; } } });
    assert.equal(inv.makeCode(roster), free);
  }
});
await ok('a code held in password only (legacy member) counts as taken', () => {
  const inv = bootInvitations({ crypto: { getRandomValues(a) { a[0] = 1234 - 1000; return a; } } });
  assert.notEqual(inv.makeCode([{ id: 'x', password: '1234' }]), '1234');
  assert.notEqual(inv.makeCode([{ id: 'x', pinCode: '1234' }]), '1234');
  assert.equal(inv.makeCode([]), '1234', 'no roster: the draw is kept');
});
await ok('importMembers gives a code-less hire a code outside the imported roster', () => {
  const win = { crypto: { getRandomValues(a) { a[0] = 2222 - 1000; return a; } }, __kiwiTeamV2: { byVenue: { v: members([['a', 'Ana', '2222']]) }, hoursByVenue: {} } };
  const inv = bootInvitations(win);
  assert.equal(inv.importMembers({}, [{ name: 'Bea Z.' }]), 1);
  const added = win.__kiwiTeamV2.byVenue.v.find((m) => m.firstName === 'Bea');
  assert.ok(added && /^\d{4}$/.test(added.password) && added.password !== '2222');
});

/* ───────── member-state.js : reservedCode, publishPins ───────── */
function bootMemberState(roster, lang) {
  const calls = { sync: [], toast: [] };
  const win = {
    KiwiTeamParts: {},
    KiwiVenue: { getCurrentVenueData: () => ({ custom: true, type: 'boutique' }) },
    KiwiConfig: { syncPins: (pins) => { calls.sync.push(pins); } },
    __kiwiTeamV2: { byVenue: { v: roster }, hoursByVenue: {}, shiftsByVenue: {}, planningByVenue: {}, locksByVenue: {}, removedByVenue: {} },
    dispatchEvent() {},
  };
  const noop = () => {};
  vm.runInNewContext(read('assets/team/member-state.js'), { window: win, localStorage: { getItem: () => null, setItem: noop, removeItem: noop }, Date, Promise, console });
  const ms = win.KiwiTeamParts.memberState.create({
    fetchDeadline: noop, teamKey: () => 'v', teamVenueKey: () => 'v', teamSlug: () => 's', memberBelongsToStore: () => true,
    scopeTeamDoc: (d) => d, persistableTeamKey: () => true, memberFullName: (m) => `${m.firstName} ${m.lastName}`,
    restorePeriodLock: noop, buildPeriod: noop, render: noop, trLang: () => lang || 'fr', toast: (msg, opt) => { calls.toast.push({ msg, opt }); },
    seedFor: () => [], seedHours: () => ({}),
  });
  return { ms, calls };
}

console.log('team codes · a shared code is refused out loud, never dropped');
await ok('0001 is reserved (and only the KDS code is)', () => {
  const { ms } = bootMemberState([]);
  assert.equal(ms.reservedCode('0001'), true);
  assert.equal(ms.reservedCode(' 0001 '), true);
  for (const other of ['0002', '1000', '', undefined, null, '00010']) assert.equal(ms.reservedCode(other), false);
});
await ok('a generated code is never 0001, whatever the draw', () => {
  for (const draw of [0, 1, 8999]) {
    const inv = bootInvitations({ crypto: { getRandomValues(a) { a[0] = draw; return a; } } });
    assert.notEqual(inv.makeCode([]), '0001');
  }
});
await ok('two members with the same code: nothing is published and the toast names both', () => {
  const { ms, calls } = bootMemberState(members([['a', 'Amal', '4821'], ['b', 'Bilal', '4821'], ['c', 'Chaima', '7310']]));
  ms.publishPins();
  assert.equal(calls.sync.length, 0, 'the server must not receive a roster that silently lost a member');
  assert.equal(calls.toast.length, 1);
  assert.match(calls.toast[0].msg, /Amal T\./);
  assert.match(calls.toast[0].msg, /Bilal T\./);
  assert.ok(!calls.toast[0].msg.includes('4821'), 'a code is a credential: never in a message');
});
for (const lang of ['fr', 'en', 'ar']) {
  await ok(`the refusal is worded in ${lang} and names both members`, () => {
    const { ms, calls } = bootMemberState(members([['a', 'Amal', '4821'], ['b', 'Bilal', '4821']]), lang);
    ms.publishPins();
    assert.equal(calls.toast.length, 1);
    assert.ok(calls.toast[0].msg.includes('Amal') && calls.toast[0].msg.includes('Bilal'));
    if (lang === 'ar') assert.match(calls.toast[0].msg, /[؀-ۿ]/);
    if (lang === 'en') assert.match(calls.toast[0].msg, /same till code/);
    assert.ok(!/—/.test(calls.toast[0].msg), 'no em dash');
  });
}
await ok('distinct codes: every member is published, nothing is toasted', () => {
  const { ms, calls } = bootMemberState(members([['a', 'Amal', '4821'], ['b', 'Bilal', '4822'], ['c', 'Chaima', '7310']]));
  ms.publishPins();
  assert.equal(calls.toast.length, 0);
  assert.equal(calls.sync.length, 1);
  assert.equal(JSON.stringify(calls.sync[0].map((p) => p.memberId)), '["a","b","c"]');
});
await ok('a member with no code yet is skipped without a warning; the same member twice is not a duplicate', () => {
  const roster = members([['a', 'Amal', '4821'], ['a', 'Amal', '4821'], ['d', 'Driss', '']]);
  const { ms, calls } = bootMemberState(roster);
  ms.publishPins();
  assert.equal(calls.toast.length, 0);
  assert.equal(calls.sync.length, 1);
  assert.ok(calls.sync[0].every((p) => p.memberId === 'a'));
});

/* ───────── profile-ui.js : le formulaire de l'éditeur ───────── */
/* profile-ui.js is an IIFE fed by window.Kiwi.__teamProfileCore: build a
 * minimal core, run the real file, drive its real submit handler. */
function makeEditorEnv(roster, lang) {
  const handlers = {};
  const toasts = [];
  const saved = [];
  const win = {
    Kiwi: { __teamMemberState: null },
    KiwiVenue: { getCurrentVenueData: () => ({ custom: true, type: 'boutique' }) },
    __kiwiTeamV2: { byVenue: { v: roster }, hoursByVenue: { v: {} } },
    CSS: { escape: (x) => x },
    addEventListener() {}, dispatchEvent() {},
  };
  win.Kiwi.__teamMemberState = { current: () => win.__kiwiTeamV2, reservedCode: (c) => String(c).trim() === '0001' };
  const core = {
    Kiwi: { toast: (msg) => toasts.push(msg), handlers }, handlers,
    modal() { return {}; }, toast: (msg) => toasts.push(msg), trLang: () => lang || 'fr',
    catalogFor: () => ({ functions: [], departments: [] }), tradeKey: () => 'boutique',
    CONTRACT_TYPES: ['CDI'], LANGS: [], AVATAR_TONES: ['a'], AVATAR_COLORS: {}, initials: () => '?',
    esc: (x) => String(x), memberFullName: (m) => `${m.firstName} ${m.lastName}`.trim(), teamKey: () => 'v',
    getMembers: (k) => win.__kiwiTeamV2.byVenue[k] || [], getHours: () => ({}), toISO: () => '2026-01-01',
    fmtMad: String, svgIcon: () => '', IC: {}, activeFilters: () => ({}), memberMatchesFilters: () => true,
    memberDutyStatus: () => '', isCustomVenue: () => true, teamSlug: () => 's', liveMember: () => null,
    makeCode: (r) => 'GEN' + (Array.isArray(r) ? r.length : 'x'),
    memberCode: (m) => (m && /^\d{4}$/.test(m.pinCode || '') ? m.pinCode : ''), codeUnresolved: () => false, rosterWriteBlocked: () => false,
    saveCustomTeams: () => saved.push(1), mergeRemoved() {}, render() {}, MODAL_CSS: '', deptForFunction: () => '',
    buildPeriod: () => ({}), fmtHours: String, isCode: (v) => /^\d{4}$/.test(String(v || '').trim()), fromISO: (x) => new Date(x),
    dateLocale: () => 'fr', contractWeekHours: () => 0,
    onState(fn) { fn(true, []); },
    install() {},
  };
  win.Kiwi.__teamProfileCore = core;
  const sandbox = {
    window: win, document: { addEventListener() {}, querySelector: () => null, activeElement: null, createElement: () => ({ style: {}, setAttribute() {}, appendChild() {} }), head: { appendChild() {} }, getElementById: () => null, body: {} },
    localStorage: { getItem: () => null }, console, requestAnimationFrame: () => {},
    FormData: class { constructor(f) { this.f = f; } entries() { return Object.entries(this.f.data)[Symbol.iterator](); } },
    CSS: win.CSS,
  };
  vm.runInNewContext(read('assets/team/access-rules.js'), sandbox);
  sandbox.window.Kiwi.__teamProfileCore.accessRules = sandbox.window.KiwiTeamParts.accessRules;
  vm.runInNewContext(read('assets/team/profile-ui.js'), sandbox);
  return { handlers, toasts, saved, win, core };
}

function fakeElement(store, key) {
  const el = store[key] || (store[key] = {
    attrs: {}, textContent: '', hidden: true, id: '', value: '',
    getAttribute(n) { return this.attrs[n] == null ? null : this.attrs[n]; },
    setAttribute(n, v) { this.attrs[n] = String(v); }, removeAttribute(n) { delete this.attrs[n]; },
    closest: () => null, querySelector: () => null, classList: { toggle() {}, add() {}, remove() {} },
  });
  return el;
}
function submit(env, { editingId, form }) {
  const store = {};
  const formEl = { data: form };
  let closed = 0;
  const root = {
    __ktState: { memberId: editingId || 'new-1', editing: !!editingId, venueType: 'v', languages: [], avatarTone: 'a', origCreatedAt: 1 },
    querySelector(sel) {
      if (sel === '[data-kt-form]') return formEl;
      const m = sel.match(/^\[(?:name|data-err-for)="(\w+)"\]$/);
      if (m) return fakeElement(store, sel);
      if (sel === '[aria-invalid="true"]') return null;
      return null;
    },
    contains: () => true,
  };
  env.win.__kiwiTeamModal = { el: root, close: () => { closed++; } };
  env.toasts.length = 0;
  env.handlers['kt-submit-member']();
  return { error: (name) => (store[`[data-err-for="${name}"]`] || {}).textContent || '', closed, toasts: env.toasts };
}
const form = (over) => ({ firstName: 'Zineb', lastName: 'Alaoui', email: 'zineb@example.test', function: 'Caissier', password: '', contract: 'CDI', ...over });

console.log('team editor · duplicate and reserved codes are refused with a message');
for (const [lang, probe] of [['fr', /Zineb Alaoui.*Amal T\./], ['en', /Zineb Alaoui.*Amal T\./], ['ar', /Zineb Alaoui[\s\S]*Amal T\./]]) {
  await ok(`${lang}: a code already held by another member is refused, naming both people`, () => {
    const env = makeEditorEnv(members([['a', 'Amal', '4821']]), lang);
    const r = submit(env, { form: form({ password: '4821' }) });
    assert.equal(r.closed, 0, 'the form stays open');
    assert.equal(env.saved.length, 0, 'nothing is saved');
    assert.match(r.error('password'), probe);
  });
}
for (const lang of ['fr', 'en', 'ar']) {
  await ok(`${lang}: 0001 (the till's kitchen code) is refused for a member`, () => {
    const env = makeEditorEnv(members([['a', 'Amal', '4821']]), lang);
    const r = submit(env, { form: form({ password: '0001' }) });
    assert.equal(r.closed, 0);
    assert.equal(env.saved.length, 0);
    assert.ok(r.error('password').includes('0001'), 'the message says which code');
    if (lang === 'ar') assert.match(r.error('password'), /[؀-ۿ]/);
    assert.ok(!/—/.test(r.error('password')));
  });
}
await ok('an ordinary free code is saved', () => {
  const env = makeEditorEnv(members([['a', 'Amal', '4821']]), 'fr');
  const r = submit(env, { form: form({ password: '9173' }) });
  assert.equal(r.error('password'), '');
  assert.equal(env.saved.length, 1);
  assert.equal(r.closed, 1);
});
await ok('a new member left without a code is generated against the roster', () => {
  const env = makeEditorEnv(members([['a', 'Amal', '4821'], ['b', 'Bilal', '4822']]), 'fr');
  submit(env, { form: form({ password: '' }) });
  const added = env.win.__kiwiTeamV2.byVenue.v.find((m) => m.firstName === 'Zineb');
  assert.equal(added.pinCode, 'GEN2', 'makeCode received the two-person roster');
});

console.log(`\n${passed} passed`);
