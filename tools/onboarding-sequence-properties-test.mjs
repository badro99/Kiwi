#!/usr/bin/env node
/* Kiwi · onboarding-sequence-properties-test.mjs · onboarding#1.
 *
 * onboarding-alignment-properties-test.mjs runs the recap functions on generated
 * answers. This one runs the create/activation sequence itself
 * (assets/onboarding-data.js submit): server creation, then a dozen local
 * writes, the venue switch, the team import, and the draft removal. The
 * browser can die between any two of them. fast-check draws the answers; every
 * durable operation is recorded in order; for EVERY prefix of that order the
 * disk a reload would find is rebuilt and checked:
 *
 *   · the completion flag (kiwiOnboarded) is never on disk without a
 *     server-confirmed creation;
 *   · no staff code is ever persisted, in the flags, in kiwiPins (retired) or
 *     in the draft;
 *   · the draft is removed last, so a death anywhere before it leaves a draft
 *     the wizard resumes from, with the typed answers (never the codes);
 *   · a death after the server confirmed the venue and a retry from the resumed
 *     draft does not create a second venue: the server's refusal is surfaced
 *     (no flags, draft kept) rather than swallowed;
 *   · a refused or failed creation leaves the disk exactly as it was.
 */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import data from '../assets/onboarding-data.js';

const fc = createRequire(new URL('../app/package.json', import.meta.url))('fast-check');
const RUNS = Number(process.env.KIWI_PROPERTY_RUNS) || 150;
const TYPES = ['boutique', 'restaurant', 'spa', 'hotel'], GOALS = ['sales', 'stock', 'time'];
const tr = (o) => o.fr;

const answers = fc.record({
  ownerName: fc.stringMatching(/^[A-Za-z]{1,12}$/), bizName: fc.stringMatching(/^[A-Za-z][A-Za-z ]{1,20}$/), city: fc.constantFrom('', 'Rabat', 'Fès'),
  typeId: fc.constantFrom(...TYPES), venueCount: fc.integer({ min: 1, max: 5 }), teamGiven: fc.boolean(), teamSize: fc.integer({ min: 1, max: 12 }),
  goals: fc.subarray(GOALS), dailyGoal: fc.constantFrom('', '1500', '2000,50'),
  pins: fc.array(fc.record({ role: fc.constantFrom('owner', 'manager', 'staff'), name: fc.stringMatching(/^[A-Za-z]{0,8}$/), code: fc.stringMatching(/^[1-9]{4}$/) }), { minLength: 1, maxLength: 4 }),
});

/* A server that owns the venue list: a second creation under the same business name is refused (409). */
function server() {
  const venues = new Map();
  return { venues, createVenue: async (cfg) => {
    const slug = cfg.name.trim().toLowerCase().replace(/\s+/g, '-');
    if (venues.has(slug)) throw Object.assign(new Error('conflict'), { status: 409 });
    venues.set(slug, cfg); return 'v-' + slug;
  } };
}

async function runSubmit(S, disk, srv, { failCreate = false } = {}) {
  const ops = [], t = { id: S.typeId, base: S.typeId };
  const storage = {
    get: (k) => disk.get(k),
    set(k, v) { ops.push(['set', k, String(v)]); disk.set(k, String(v)); return true; },
    del(k) { ops.push(['del', k]); disk.delete(k); },
  };
  const venueApi = {
    createVenue: async (cfg) => { if (failCreate) throw Object.assign(new Error('offline'), { status: 0 }); const id = await srv.createVenue(cfg); ops.push(['ack', id]); return id; },
    setVenue: (id) => ops.push(['setVenue', id]),
    getCurrentVenueData: () => ({ id: 'cur' }),
  };
  const teamApi = { importMembers: () => ops.push(['team']) };
  let vid = null, error = null;
  try { vid = await data.submit({ S, t, goal: 0, tr, storage, venueApi, teamApi }); } catch (e) { error = e; }
  return { ops, vid, error };
}
const draftStorage = (disk) => ({ get: (k) => disk.get(k), set: (k, v) => { disk.set(k, String(v)); return true; }, del: (k) => disk.delete(k) });
const mk = (a) => ({ step: 6, pinsFitFor: undefined, ...a, pins: a.pins.map((p) => ({ ...p })) });
const codesOf = (S) => S.pins.map((p) => p.code).filter((c) => /^\d{4}$/.test(c));

await fc.assert(fc.asyncProperty(answers, async (a) => {
  const S = mk(a);
  /* the wizard saved its draft on the way (the real draft object, the real disk) */
  const disk = new Map(), draft = data.createDraft(draftStorage(disk), TYPES, GOALS);
  assert.equal(draft.save(S), true);
  const base = new Map(disk);
  const srv = server();
  const { ops, vid } = await runSubmit(S, disk, srv);
  assert.ok(vid, 'a healthy sequence completes');
  const ackAt = ops.findIndex((o) => o[0] === 'ack'), delDraft = ops.findIndex((o) => o[0] === 'del' && o[1] === 'kiwiOnboardingDraft:v1');
  assert.ok(ackAt >= 0 && delDraft === ops.length - 1, 'the draft is removed last, after the server ack');
  assert.ok(ackAt < ops.findIndex((o) => o[0] === 'set' && o[1] === 'kiwiOnboarded'), 'completion is written after the server ack');

  for (let k = 0; k <= ops.length; k++) {
    /* the disk a reload finds if the browser died after k operations */
    const crash = new Map(base);
    for (const op of ops.slice(0, k)) { if (op[0] === 'set') crash.set(op[1], op[2]); else if (op[0] === 'del') crash.delete(op[1]); }
    const acked = ops.slice(0, k).some((o) => o[0] === 'ack');
    if (crash.has('kiwiOnboarded')) assert.ok(acked, `kiwiOnboarded on disk at crash point ${k} without a server-confirmed creation`);
    for (const [key, value] of crash) for (const code of codesOf(S)) assert.ok(!value.includes(code), `a staff code reached ${key} at crash point ${k}`);
    assert.ok(!crash.has('kiwiPins'), 'kiwiPins is never written');
    if (k < ops.length) {
      assert.ok(crash.has('kiwiOnboardingDraft:v1'), `the draft survives a death at point ${k}`);
      const resumed = { }, d2 = data.createDraft(draftStorage(crash), TYPES, GOALS); d2.load(resumed);
      assert.equal(resumed.bizName, S.bizName.slice(0, 60), 'the resumed draft carries the typed business name');
      assert.ok(resumed.pins.every((p) => p.code === ''), 'and no code');
    }
    /* a death after the ack, then the owner retries from the resumed draft */
    if (acked && k < ops.length) {
      const retryDisk = new Map(crash), again = mk(a);
      again.pins = again.pins.map((p) => ({ ...p }));
      const r = await runSubmit(again, retryDisk, srv);
      assert.equal(srv.venues.size, 1, 'no second venue after a retry');
      assert.equal(r.vid, null, 'the refused retry does not report success');
      assert.ok(r.error && r.error.status === 409, 'the server refusal is surfaced to the wizard');
      assert.equal(JSON.stringify([...retryDisk]), JSON.stringify([...crash]), 'a refused retry leaves the disk exactly as the crash left it');
    }
  }
  /* a creation that fails (offline) leaves the disk untouched and the draft in place */
  const d2 = new Map(base), failed = await runSubmit(mk(a), d2, server(), { failCreate: true });
  assert.equal(failed.vid, null);
  assert.equal(JSON.stringify([...d2]), JSON.stringify([...base]), 'a failed creation writes nothing');
}), { numRuns: RUNS });
console.log(`  ✓ onboarding : ${RUNS} réponses tirées, chaque point d'interruption de la séquence de création lit un disque sûr (pas d'activation sans accusé, aucun code, brouillon repris, pas de second établissement)`);
