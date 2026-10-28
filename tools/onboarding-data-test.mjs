import assert from 'node:assert/strict';
import data from '../assets/onboarding-data.js';
const values = new Map();
let refused = false;
const storage = { get: k => values.get(k), set(k, v) { if (refused) throw Error('blocked'); values.set(k, v); return true; }, del: k => values.delete(k) };
const draft = data.createDraft(storage, ['boutique'], ['sales']);
for (let n = 0; n < 100; n++) {
  const state = { step: n % 7, ownerName: 'Test ' + n, bizName: 'Commerce', typeId: 'boutique', venueCount: 1 + n % 60, city: 'Rabat', teamSize: 1 + n, teamGiven: true, goals: ['sales'], dailyGoal: String(n), pins: [{ role: 'owner', name: 'Test', code: '' }] };
  assert.equal(draft.save(state), true);
  const restored = {}; draft.load(restored);
  assert.deepEqual(restored, state);
}
refused = true;
assert.equal(draft.save({}), false);
for (const lang of ['fr', 'en', 'ar']) assert.equal(draft.warning(lang), data.DRAFT_NOTE[lang]);
draft.load({}); draft.clear();
assert.equal(draft.saved(), false);
refused = false;
assert.equal(draft.save({}), true);
assert.equal(draft.warning('fr'), '');
values.set('kiwiOnboardingDraft:v1', '{broken');
const unchanged = { step: 3 }; assert.doesNotThrow(() => draft.load(unchanged)); assert.deepEqual(unchanged, { step: 3 });
let calls = 0;
const state = { ownerName: 'Test', bizName: 'Commerce', city: '', pins: [], goals: [], venueCount: 1, typeId: 'boutique' };
values.clear();
assert.equal(await data.submit({ S: state, t: { id: 'boutique', base: 'boutique' }, goal: 0, tr: o => o.en, storage, venueApi: { async createVenue() { calls++; return null; } } }), null);
assert.equal(calls, 1); assert.equal(values.size, 0, 'no completion flags before ACK');
let acknowledge;
const pending = data.submit({ S: state, t: { id: 'boutique', base: 'boutique' }, goal: 125,
  tr: o => o.en, storage, venueApi: { createVenue(payload) {
    assert.equal(payload.staffCount, 0);
    assert.equal(payload.goal, 125);
    return new Promise(resolve => { acknowledge = resolve; });
  } } });
assert.equal(values.size, 0, 'completion waits for acknowledgement');
acknowledge('test-venue');
assert.equal(await pending, 'test-venue');
assert.equal(values.get('kiwiOnboarded'), '1');
assert.equal(values.has('kiwiOnboardingDraft:v1'), false);
assert.equal(values.has('kiwiPins'), false);
console.log('✓ onboarding-data: 100 round trips, refused storage, translated warning, corrupt draft, submission ACK');

// Run the shipped draft implementation, including Blob download, inside node:vm.
const { readFileSync } = await import('node:fs');
const vm = await import('node:vm');
const source = readFileSync(process.env.KIWI_DRAFT_SOURCE || 'assets/onboarding-data.js', 'utf8');
const sandbox = vm.createContext({}); vm.runInContext(source, sandbox);
const real = sandbox.KiwiOnboardingData;
const blocked = { get() { throw Error('blocked'); }, set() { throw Error('full'); }, del() {} };
const recovery = real.createDraft(blocked, ['boutique'], ['sales']);
const original = { step: 2, ownerName: 'Test', bizName: 'Commerce', typeId: 'boutique', venueCount: 2, city: 'Rabat', teamSize: 2, teamGiven: true, goals: ['sales'], dailyGoal: '12.50', device: 'till', pins: [{ role: 'owner', name: 'Test', code: '' }] };
assert.equal(recovery.save(original), false);
if (process.env.KIWI_DRAFT_CASE !== 'server') {
  let blob, clicked = false, revoked = false;
  const browser = { Blob, URL: { createObjectURL(file) { blob = file; return 'blob:test'; }, revokeObjectURL() { revoked = true; } },
    setTimeout(fn) { fn(); }, document: { body: { appendChild() {} }, createElement() { return { click() { clicked = true; assert.equal(this.download, 'kiwi-onboarding.json'); }, remove() {} }; } } };
  recovery.exportFile(original, browser);
  assert.ok(clicked && revoked); assert.equal(blob.type, 'application/json');
  assert.equal(recovery.saved(), true);
  const file = await blob.text();
  const imported = real.createDraft(blocked, ['boutique'], ['sales']), restored = {};
  imported.importFile(file, restored);
  assert.deepEqual(JSON.parse(JSON.stringify(restored)), original);
  assert.equal(imported.saved(), true);
  imported.save({ ...restored, city: 'Fes' }); assert.equal(imported.saved(), false, 'a changed draft needs a fresh home');
  assert.throws(() => imported.importFile('[]', {}));
  console.log('✓ Blob export/import identical, changed draft warns again');
}
if (process.env.KIWI_DRAFT_CASE !== 'export') {
  // Execute the production account route with an authenticated-session boundary
  // and a D1-shaped document store. Body/query identities cannot select an account.
  const docs = new Map(); let aid = 'account-a';
  const routeContext = vm.createContext({
    activeAccountSession: async () => aid ? { aid } : null,
    json: (value, status = 200) => new Response(JSON.stringify(value), { status }), URL, Date,
  });
  const routeSource = readFileSync('functions/api/account/onboarding-draft.js', 'utf8').replace(/^import .*;$/m, '').replace('export async function', 'async function');
  vm.runInContext(routeSource, routeContext);
  const env = { AUTH_SECRET: 'test-only', DB: { prepare(sql) { return { bind(...args) { return {
    async first() { const value = docs.get(args[0] + '/' + args[1]); return value ? { data: value } : null; },
    async run() { const key = args[0] + '/' + args[1]; if (sql.startsWith('DELETE')) docs.delete(key); else docs.set(key, args[2]); },
  }; } }; } } };
  const transport = async (value) => {
    const request = new Request('https://kiwi.test/api/account/onboarding-draft?account=account-a', value === undefined ? {} : { method: 'POST', headers: { 'X-Kiwi-Draft-Account': aid }, body: JSON.stringify(value) });
    const response = await routeContext.onRequest({ request, env }); assert.equal(response.status, 200);
    return (await response.json()).draft;
  };
  recovery.transport = transport;
  await recovery.sync(); assert.equal(recovery.saved(), true);
  const nextVisit = real.createDraft(blocked, ['boutique'], ['sales']); nextVisit.transport = transport;
  const restored = {}; await nextVisit.restore(restored);
  assert.deepEqual(JSON.parse(JSON.stringify(restored)), original);
  aid = 'account-b'; assert.equal(await transport(), null);
  const switched = await routeContext.onRequest({ request: new Request('https://kiwi.test/api/account/onboarding-draft', { method: 'POST', headers: { 'X-Kiwi-Draft-Account': 'account-a' }, body: JSON.stringify(original) }), env });
  assert.equal(switched.status, 409, 'a queued write from another session cannot cross accounts');
  await transport({ ...original, bizName: 'Other', account: 'account-a' });
  aid = 'account-a'; assert.equal((await transport()).bizName, 'Commerce');
  nextVisit.clear(); await nextVisit.sync(); await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(await transport(), null);
  aid = 'account-a';
  await transport({ ...original, bizName: 'Kept' });
  for (const body of ['{"step":', 'not json', '<html>', '']) {
    const bad = await routeContext.onRequest({ request: new Request('https://kiwi.test/api/account/onboarding-draft', { method: 'POST', headers: { 'X-Kiwi-Draft-Account': aid }, body }), env });
    assert.equal(bad.status, 400, 'a malformed body is the caller\'s mistake (400), not an outage (503): ' + JSON.stringify(body));
    assert.equal((await bad.json()).error, 'format');
  }
  assert.equal((await transport()).bizName, 'Kept', 'a refused body leaves the saved draft untouched');
  aid = null;
  assert.equal((await routeContext.onRequest({ request: new Request('https://kiwi.test/api/account/onboarding-draft'), env })).status, 401);
  console.log('✓ server round trip, account isolation, clear, unauthenticated refusal');
}
// Existing local projection stays byte-for-byte equivalent on generated inputs.
if (process.env.KIWI_DRAFT_PREVIOUS) {
  const old = vm.createContext({}); vm.runInContext(readFileSync(process.env.KIWI_DRAFT_PREVIOUS, 'utf8'), old);
  for (let n = 0; n < 100; n++) {
    const input = { ...original, step: n % 9, city: 'City ' + n, teamSize: n + 1 };
    const bytes = [];
    for (const api of [old.KiwiOnboardingData, real]) {
      let value; const d = api.createDraft({ set(k, v) { value = v; return true; }, get() { return value; } }, ['boutique'], ['sales']);
      d.save(input); const out = {}; d.load(out); bytes.push([value, JSON.stringify(out)]);
    }
    assert.deepEqual(bytes[0], bytes[1]);
  }
  console.log('✓ old/new local save/load equivalence: 100 generated inputs');
}
for (const lang of ['fr', 'en', 'ar']) {
  const d = real.createDraft(blocked, ['boutique'], ['sales']); d.save(original);
  const makeNode = (tag) => ({ tag, children: [], textContent: '', appendChild(n) { this.children.push(n); }, setAttribute() {} });
  const container = makeNode('div');
  real.mountRecovery(container, d, original, lang, { document: { createElement: makeNode } }, () => {}, true);
  assert.equal(container.children[0].tag, 'button');
  assert.equal(container.children[1].children[0].type, 'file');
  assert.ok(container.children.every(n => n.textContent));
}
assert.match(readFileSync('assets/onboarding.js', 'utf8'), /recovery:.*mountRecovery/);
console.log('✓ shared FR/EN/AR export and first-step import controls');
// Arabic is a first-class language of the onboarding: layout properties are logical
// (they flip with dir), the one physical value left is a background image position
// that has its own RTL rule, and the markup carries no inline style.
{
  const css = readFileSync('assets/onboarding.css', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  const physical = [...css.matchAll(/([^{}]+)\{([^}]*)\}/g)].flatMap(([, selector, body]) => body.split(';')
    .filter(d => /^\s*(margin-left|margin-right|padding-left|padding-right|border-left|border-right|left|right)\s*:|text-align\s*:\s*(left|right)\b/.test(d))
    .map(d => selector.trim() + ' { ' + d.trim() + ' }'));
  assert.deepEqual(physical.filter(d => !/html\[dir="rtl"\]/.test(d)), [], 'onboarding.css uses logical properties outside its RTL rules');
  assert.match(css, /html\[dir="rtl"\] \.kob-role\{background-position:left/, 'the role chevron flips in Arabic');
  assert.doesNotMatch(readFileSync('assets/onboarding.js', 'utf8'), /\sstyle="/, 'onboarding.js builds markup without inline style');
  console.log('✓ onboarding.css logical properties, no inline style');
}
