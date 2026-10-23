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
