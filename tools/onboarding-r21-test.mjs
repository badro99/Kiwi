/* r21 · onboarding persistence: cross-account pending clear, export "offered" vs
   saved, refused activation flags, and the durable "finish importing your team"
   task. Runs the real assets/onboarding-data.js, assets/team-import-pending.js
   and assets/tenant-purge.js. */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const require = createRequire(import.meta.url);
const data = require('../assets/onboarding-data.js');
const pending = data.TeamImportPending;
let n = 0;
async function test(name, fn) { await fn(); n++; console.log('  ✓ ' + name); }
const mem = (init) => { const values = new Map(init); return { values, get: (k) => values.get(k), set: (k, v) => { values.set(k, v); return true; }, del: (k) => values.delete(k) }; };

/* A server holding one draft per account, and a transport bound to one account. */
function world() {
  const server = { drafts: new Map(), failDelete: 0, deletes: [] };
  const bind = (account) => {
    const t = async (value) => {
      if (value === undefined) return server.drafts.get(account) || null;
      if (value === null) { if (server.failDelete > 0) { server.failDelete--; throw Error('offline'); } server.deletes.push(account); server.drafts.delete(account); return null; }
      server.drafts.set(account, value); return value;
    };
    t.account = () => account;
    return t;
  };
  return { server, bind };
}

await test('onboarding#B0 · account A\'s owed deletion never deletes account B\'s draft', async () => {
  const w = world(); const browser = mem();
  w.server.drafts.set('A', { revision: 3, typeId: 'boutique', ownerName: 'Old A' });
  w.server.drafts.set('B', { revision: 9, typeId: 'boutique', ownerName: 'Fresh B', step: 2 });
  const a = data.createDraft(browser, ['boutique'], ['sales']); a.transport = w.bind('A');
  await a.restore({});
  w.server.failDelete = 1;
  assert.equal(await a.clear(), false);
  assert.ok(browser.values.get('kiwiOnboardingDraft:clear'), 'the debt is remembered');
  assert.equal(JSON.parse(browser.values.get('kiwiOnboardingDraft:clear')).account, 'A', 'and it names the account');
  /* Another account signs in on the same browser. */
  const b = data.createDraft(browser, ['boutique'], ['sales']); b.transport = w.bind('B');
  const S = {}; await b.restore(S);
  assert.ok(w.server.drafts.get('B'), 'B\'s server draft survives');
  assert.deepEqual(w.server.deletes, [], 'nothing was deleted for A\'s debt while B was signed in');
  assert.equal(S.ownerName, 'Fresh B', 'B gets their own answers back');
  assert.equal(browser.values.has('kiwiOnboardingDraft:clear'), false, 'a debt that is not B\'s is dropped');
});
await test('onboarding#B0 · a bare legacy marker is not settled against whoever is signed in', async () => {
  const w = world(); const browser = mem([['kiwiOnboardingDraft:clear', '1']]);
  w.server.drafts.set('B', { revision: 5, typeId: 'boutique', ownerName: 'Mine' });
  const b = data.createDraft(browser, ['boutique'], ['sales']); b.transport = w.bind('B');
  const S = {}; await b.restore(S);
  assert.ok(w.server.drafts.get('B')); assert.equal(S.ownerName, 'Mine');
});
await test('onboarding#B0 · the same account still settles its own debt', async () => {
  const w = world(); const browser = mem();
  w.server.drafts.set('A', { revision: 3, typeId: 'boutique', ownerName: 'Old A' });
  const a = data.createDraft(browser, ['boutique'], ['sales']); a.transport = w.bind('A'); await a.restore({});
  w.server.failDelete = 1; await a.clear();
  const again = data.createDraft(browser, ['boutique'], ['sales']); again.transport = w.bind('A');
  const S = {}; await again.restore(S);
  assert.equal(w.server.drafts.has('A'), false); assert.equal(S.ownerName, undefined);
  assert.equal(browser.values.has('kiwiOnboardingDraft:clear'), false);
});
await test('onboarding#B0 · tenant purge removes the marker and the team task', () => {
  const store = new Map([['kiwiOnboardingDraft:clear', '{"account":"A"}'], ['kiwiOnboardingTeamPending', '{}'], ['kiwiLang', 'fr']]);
  const localStorage = { getItem: (k) => store.get(k) ?? null, removeItem: (k) => store.delete(k), get length() { return store.size; }, key: (i) => [...store.keys()][i] };
  const win = { localStorage }; const ctx = vm.createContext({ window: win, localStorage }); vm.runInContext(readFileSync('assets/tenant-purge.js', 'utf8'), ctx);
  win.KiwiTenantPurge.purge();
  assert.equal(store.has('kiwiOnboardingDraft:clear'), false); assert.equal(store.has('kiwiOnboardingTeamPending'), false); assert.equal(store.has('kiwiLang'), true);
});

await test('onboarding#B1 · an accepted download is offered, not saved, until the person confirms', () => {
  const dead = { set: () => { throw Error('full'); }, get: () => null, del() {} };
  const d = data.createDraft(dead, ['boutique'], ['sales']);
  const S = { step: 1, ownerName: 'Zed', bizName: 'Shop', typeId: 'boutique', pins: [] };
  d.save(S);
  const browser = { URL: { createObjectURL: () => 'blob:x', revokeObjectURL() {} }, Blob: class {}, setTimeout() {}, document: { createElement: () => ({ click() {}, remove() {} }), body: { appendChild() {} } } };
  assert.equal(d.exportFile(S, browser), true);
  assert.equal(d.saved(), false, 'a silently blocked download must not read as protected');
  assert.equal(d.warning('fr') !== '', true);
  assert.equal(d.exportOffered(), true);
  assert.equal(d.confirmExport(), true);
  assert.equal(d.saved(), true); assert.equal(d.warning('fr'), '');
  d.save({ ...S, city: 'Fes' }); assert.equal(d.saved(), false, 'a changed draft is unprotected again');
});
await test('onboarding#B1 · the recovery panel asks the person to confirm after an export', () => {
  const dead = { set: () => { throw Error('full'); }, get: () => null, del() {} };
  const d = data.createDraft(dead, ['boutique'], ['sales']);
  const S = { step: 1, typeId: 'boutique', pins: [] }; d.save(S);
  const mk = (tag) => ({ tag, children: [], textContent: '', appendChild(c) { this.children.push(c); }, setAttribute() {}, remove() {}, click() {} });
  const browser = { URL: { createObjectURL: () => 'blob:x', revokeObjectURL() {} }, Blob: class {}, setTimeout() {}, document: { createElement: mk, body: { appendChild() {} } } };
  const box = mk('div'); let paints = 0;
  data.mountRecovery(box, d, S, 'en', browser, () => { paints++; }, false);
  assert.equal(box.children.length, 1, 'export button only, before any export');
  box.children[0].onclick(); assert.equal(d.saved(), false);
  const again = mk('div'); data.mountRecovery(again, d, S, 'en', browser, () => {}, false);
  assert.equal(again.children.length, 2); assert.equal(again.children[1].textContent, 'I saved the file');
  again.children[1].onclick(); assert.equal(d.saved(), true);
});

const people = () => ({ ownerName: 'Sara', bizName: 'Atelier', city: '', typeId: 'boutique', venueCount: 1, goals: [], teamGiven: true, teamSize: 2,
  pins: [{ role: 'owner', name: 'Sara', code: '7391' }, { role: 'staff', name: 'Omar', code: '2580' }] });
const T = { id: 'boutique', base: 'boutique' };
const tr = (o) => o.fr;

await test('onboarding#A2 · refused activation flags are reported, the venue is still returned', async () => {
  const storage = mem(); const realSet = storage.set;
  storage.set = (k, v) => (k === 'kiwiOnboarded' || k === 'kiwiBizName') ? false : realSet(k, v);
  const outcome = {};
  const vid = await data.submit({ S: people(), t: T, goal: 0, tr, storage, outcome, venueApi: { createVenue: async () => 'v1', setVenue() {}, getCurrentVenueData: () => ({}) }, teamApi: { importMembers: () => 2 } });
  assert.equal(vid, 'v1');
  assert.deepEqual(outcome.persistFailed.sort(), ['kiwiBizName', 'kiwiOnboarded']);
  assert.equal(storage.values.has('kiwiOnboarded'), false);
  const throwing = mem(); throwing.set = () => { throw Error('QuotaExceeded'); };
  const o2 = {}; await data.submit({ S: people(), t: T, goal: 0, tr, storage: throwing, outcome: o2, venueApi: { createVenue: async () => 'v1' }, teamApi: { importMembers: () => 2 } });
  assert.ok(o2.persistFailed.includes('kiwiOnboarded'));
});

await test('onboarding#A1 · a failed roster import leaves a durable task: names and roles, never a code', async () => {
  const storage = mem(); const outcome = {};
  await data.submit({ S: people(), t: T, goal: 0, tr, storage, outcome, venueApi: { createVenue: async () => 'v1', setVenue() {}, getCurrentVenueData: () => ({ id: 'v1' }) }, teamApi: { importMembers() { throw Error('team module crashed'); } } });
  assert.equal(outcome.teamPending, true);
  const raw = storage.values.get(data.TEAM_PENDING_KEY);
  assert.ok(raw && !/7391|2580/.test(raw), 'no code in the stored task');
  assert.deepEqual(JSON.parse(raw), { venue: 'v1', people: [{ role: 'owner', name: 'Sara' }, { role: 'staff', name: 'Omar' }] });
  assert.equal(storage.values.has('kiwiOnboardingDraft:v1'), false);
});
await test('onboarding#A1 · a venue that could not be selected never receives the roster', async () => {
  const storage = mem(); const outcome = {}; let imported = 0;
  await data.submit({ S: people(), t: T, goal: 0, tr, storage, outcome, venueApi: { createVenue: async () => 'v1', setVenue() { throw Error('nope'); }, getCurrentVenueData: () => ({ id: 'someone-else' }) }, teamApi: { importMembers() { imported++; return 2; } } });
  assert.equal(imported, 0); assert.equal(outcome.teamPending, true); assert.equal(outcome.venueSelectFailed, true);
});
await test('onboarding#A1 · a clean import leaves no task', async () => {
  const storage = mem(); const outcome = {};
  await data.submit({ S: people(), t: T, goal: 0, tr, storage, outcome, venueApi: { createVenue: async () => 'v1', setVenue() {}, getCurrentVenueData: () => ({}) }, teamApi: { importMembers: () => 2 } });
  assert.equal(outcome.teamPending, false); assert.equal(storage.values.has(data.TEAM_PENDING_KEY), false);
});
await test('team#A1 · the retry keeps the task until the roster really takes the people', () => {
  const storage = mem([[pending.KEY, JSON.stringify({ venue: 'v1', people: [{ role: 'owner', name: 'Sara' }, { role: 'staff', name: 'Omar' }] })]]);
  assert.equal(pending.read(storage).people.length, 2);
  let fail = true; const calls = [];
  const teamApi = { importMembers(venue, list) { calls.push([venue, list]); if (fail) throw Error('profile save failed'); return list.length; } };
  const venueApi = { getVenueData: (id) => (id === 'v1' ? { id } : null) };
  assert.equal(pending.retry({ storage, venueApi, teamApi }).ok, false);
  assert.ok(storage.values.has(pending.KEY), 'still pending after a failed retry');
  assert.equal(pending.retry({ storage, venueApi: { getVenueData: () => null }, teamApi }).ok, false, 'unknown venue stays pending');
  fail = false;
  const done = pending.retry({ storage, venueApi, teamApi });
  assert.deepEqual([done.ok, done.added], [true, 2]);
  assert.equal(storage.values.has(pending.KEY), false);
  assert.ok(calls.every(([, list]) => list.every((p) => p.code === '')), 'a stored task carries no code');
  assert.equal(pending.read(mem([[pending.KEY, '{broken']])), null);
});
await test('team#A1 · the banner shows only while a task exists and its button runs the retry', () => {
  const store = new Map([[pending.KEY, JSON.stringify({ venue: 'v1', people: [{ role: 'staff', name: 'Omar' }] })], ['kiwiLang', 'en']]);
  const localStorage = { getItem: (k) => store.get(k) ?? null, removeItem: (k) => store.delete(k) };
  const els = [];
  const mk = (tag) => { const e = { tag, children: [], style: {}, setAttribute() {}, appendChild(c) { this.children.push(c); }, remove() { e.gone = true; } }; els.push(e); return e; };
  const body = { firstChild: null, insertBefore(el) { this.first = el; } };
  const win = { localStorage, setTimeout: (f) => f(), document: { getElementById: () => null, createElement: mk, body },
    KiwiVenue: { getVenueData: () => ({}) }, KiwiTeam: { importMembers: () => 1 } };
  const bar = pending.mount(win);
  assert.ok(bar && body.first === bar);
  const [text, button] = bar.children;
  assert.equal(button.textContent, 'Finish importing your team');
  button.onclick();
  assert.equal(text.textContent, 'Team imported.'); assert.equal(store.has(pending.KEY), false); assert.equal(bar.gone, true);
  assert.equal(pending.mount(win), null, 'no task, no banner');
});
console.log(`✓ onboarding-r21: ${n} behaviours`);
