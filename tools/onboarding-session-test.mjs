import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import data from '../assets/onboarding-data.js';
import { onboardingTestSource } from './onboarding-test-source.mjs';
const live = fs.readFileSync('assets/onboarding.js', 'utf8');
function grab(source, name) {
  const start = source.indexOf('  async function ' + name + '(');
  assert.ok(start >= 0);
  return source.slice(start, source.indexOf('\n  }', start) + 4);
}
const types = [{ id: 'boutique', base: 'boutique' }];
const tr = o => o.en;
// No ambient sibling state is available, even if a future edit tries to read it.
const sandbox = new Proxy({}, {
  get(target, name) {
    if (name === 'window' || name === 'document' || name === 'KiwiOnboarding' || name === 'KiwiDashOnboarding') throw Error('Undeclared onboarding dependency: ' + String(name));
    return target[name];
  },
});
// Intrinsics remain supplied by the VM; deny ambient browser objects explicitly.
const context = vm.createContext({});
for (const name of ['window', 'document', 'KiwiOnboarding', 'KiwiDashOnboarding']) Object.defineProperty(context, name, { get() { return sandbox[name]; } });
vm.runInContext(fs.readFileSync('assets/onboarding-data.js', 'utf8'), context);
const isolated = context.KiwiOnboardingData.createSession({ TYPES: types, tr });
assert.equal(isolated.kitProblem() !== null, true);
assert.deepEqual(Object.keys(data.createSession({ TYPES: types, tr })).sort(), ['isSubmitting','setSubmitting','finalProblem','updatePin','addPin','removePin','state','reserved','typeHint','update','fitPinsToTeam','parsedDailyGoal','validate','kitCodeProblem','kitProblem','submit'].sort());
assert.doesNotMatch(fs.readFileSync('assets/onboarding-data.js', 'utf8').slice(400), /\b(?:window|globalThis|host)\s*(?:\[|\.)/g, 'owner must not reach browser or sibling state');

async function run(source, kit, answers) {
  const session = data.createSession({ TYPES: types, tr });
  session.update({ step: 7, ownerName: 'Test', bizName: 'Shop', typeId: 'boutique', dailyGoal: '12,50', pins: [{ role: 'owner', name: 'Test', code: String(2468) }], ...answers });
  let payload = null, error = null;
  const storage = { set() {}, del() {} };
  const ctx = vm.createContext({ session, S: session.state, TYPES: types, tr,
    parsedDailyGoal: session.parsedDailyGoal, kitProblem: session.kitProblem, validate: session.validate,
    finishing: false, root: null, draft: null, capture() {},
    flashErr(e) { error = e; }, celebrate() {}, loadData: async () => data, LS: storage,
    window: { KiwiVenue: { async createVenue(p) { payload = JSON.parse(JSON.stringify(p)); return 'test'; } } },
    document: { body: { classList: { remove() {}, add() {} } } },
  });
  // finish() reports a team-roster seeding failure through trackTeamImport (declared dependency).
  const tracker = source.indexOf('  function trackTeamImport(');
  vm.runInContext(source.slice(tracker, source.indexOf('\n  }\n', tracker) + 5) + '\nlet teamImportFailed = false;', ctx);
  vm.runInContext(grab(source, 'finish'), ctx);
  const result = await ctx.finish({ kit });
  return { payload, rejected: !!(error || result?.error) };
}
// Each disagreement is red against the original finalizer, then equal through
// both live renderer adapters. Never print a payload: it includes credentials.
const cases = [
  ['blank owner at final submission', { ownerName: '' }],
  ['blank business at final submission', { bizName: '' }],
  ['malformed non-owner code', { pins: [{ role: 'owner', name: 'Test', code: String(2468) }, { role: 'staff', name: '', code: 'invalid' }] }],
  ['reserved non-owner code', { pins: [{ role: 'owner', name: 'Test', code: String(2468) }, { role: 'staff', name: '', code: String(0).padStart(4, '0') }] }],
  ['duplicate non-owner code', { pins: [{ role: 'owner', name: 'Test', code: String(2468) }, { role: 'staff', name: '', code: String(2468) }] }],
  ['resumed invalid daily goal', { dailyGoal: '12.345' }],
];
for (const [label, answers] of cases) {
  const oldLegacy = await run(onboardingTestSource(), false, answers);
  const oldKit = await run(onboardingTestSource(), true, answers);
  assert.notEqual(oldLegacy.rejected, oldKit.rejected, label + ': regression reproduces on original');
  const legacy = await run(live, false, answers), kit = await run(live, true, answers);
  assert.deepEqual(legacy, kit, label + ': both renderers produce identical submission');
  assert.deepEqual(legacy, oldLegacy, label + ': default live legacy submission retained');
}
const legacy = await run(live, false, {}), kit = await run(live, true, {});
assert.deepEqual(legacy, kit);
assert.equal(legacy.payload.goal, 12.5);
assert.equal(legacy.payload.staffCount, 0);
console.log('✓ onboarding owner: isolated boundary, explicit interface, six old-code regressions, renderer payload parity');

// Declared browser dependencies of each renderer. Adding a sibling's private
// global requires an explicit contract change, rather than silently passing.
for (const [file, receiver, declared] of [
  ['assets/onboarding.js', 'window', ['Kiwi','KiwiCaisseLink','KiwiEnv','KiwiIdentity','KiwiMe','KiwiOnboarding','KiwiOnboardingData','KiwiStoreTemplates','KiwiTeam','KiwiTrades','KiwiVenue','__kiwiLock','__kiwiRole','dispatchEvent','requestIdleCallback']],
]) {
  const source = fs.readFileSync(file, 'utf8');
  const reads = [...source.matchAll(new RegExp('\\b' + receiver + '\\.(\\w+)', 'g'))].map(m => m[1]);
  assert.deepEqual([...new Set(reads)].sort(), declared.sort(), file + ': declared browser boundary');
  assert.doesNotMatch(source, new RegExp('\\b' + receiver + '\\s*\\['), file + ': computed global access needs an interface');
}

// Execute shipped startup and the public adapter, rather than reconstructed code.
const doc = { readyState: 'loading', addEventListener() {} };
const realm = { document: doc, localStorage: { getItem() { return null; } }, setTimeout() {} };
realm.window = realm;
vm.createContext(realm);
vm.runInContext(fs.readFileSync('assets/onboarding-data.js', 'utf8'), realm);
vm.runInContext(live, realm);
const publicApi = realm.KiwiOnboarding.kit;
publicApi.update({ bizName: 'Test Shop', typeId: 'boutique' });
assert.equal(publicApi.state.bizName, 'Test Shop');
assert.equal(publicApi.state.typeId, 'boutique');
assert.equal(publicApi.viewModel().steps[0].done, true);
const html = fs.readFileSync('dashboard.html', 'utf8');
assert.ok(html.indexOf('src="assets/onboarding-data.js?') < html.indexOf('src="assets/onboarding.js?'), 'existing data owner loads before renderer');
