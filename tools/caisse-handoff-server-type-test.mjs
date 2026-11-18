#!/usr/bin/env node
/* « Ouvrir la caisse sur cet appareil » : le type du commerce vient du serveur.
 *
 * Santos Store, 18 nov. 2026 (vidéo du propriétaire) : depuis le tableau de bord
 * de Santos, une boutique, le bouton ouvrait une caisse de RESTAURANT (Salle, À
 * emporter, « Carte pas encore composée »). La passation (kiwiPairHandoff) ne
 * portait pas de type, l'appairage a été enregistré sans, et la caisse envoie
 * tout type inconnu vers le restaurant. Le serveur, lui, sait
 * (merchant_config.type = boutique). Au moment de choisir la caisse
 * (caisse-pairing.js › bootVertical), un commerce sans type demande donc le sien
 * au serveur (assets/pairing-commit.js › typeFirst), 2,5 s au plus, et le garde.
 *
 * Runs the real assets/tenant-purge.js + assets/pairing-commit.js (the real
 * commit()), and the real routeFor / bootVertical of assets/caisse-pairing.js.
 *   node tools/caisse-handoff-server-type-test.mjs
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => readFileSync(path.join(ROOT, f), 'utf8');
const pairing = read('assets/caisse-pairing.js');
const PURGE = read('assets/tenant-purge.js'), COMMIT = read('assets/pairing-commit.js');
let passed = 0;
const ok = async (label, fn) => { await fn(); passed++; console.log('  ✓ ' + label); };

/* One function of the pairing bundle, to run it (a missing one fails the load). */
function lift(name) {
  const m = pairing.match(new RegExp('\\n  function ' + name + '\\([^)]*\\) \\{[\\s\\S]*?\\n  \\}'));
  if (!m) throw new Error(name + ' missing from assets/caisse-pairing.js');
  return m[0];
}

/* A till page: storage, a fake /api/config, fake timers, the real modules. */
function harness(reply, seed = {}) {
  const timers = [], asked = [], unlocked = [], events = [];
  const memory = new Map(Object.entries(seed));
  const localStorage = {
    getItem: (k) => (memory.has(k) ? memory.get(k) : null),
    setItem: (k, v) => { memory.set(k, String(v)); },
    removeItem: (k) => { memory.delete(k); },
    key: (i) => Array.from(memory.keys())[i] ?? null,
    get length() { return memory.size; },
  };
  const window = {
    localStorage,
    KiwiPosDispatch: { registry: { '1': { id: 'boutique' }, '2': { id: 'pressing' }, '3': { id: 'hotel' } }, unlockById: (id) => unlocked.push(id) },
    __kiwiUnlockApp: () => unlocked.push('restaurant'),
  };
  window.window = window;
  const ctx = vm.createContext({
    window, localStorage,
    document: { dispatchEvent: (e) => events.push(e.type), getElementById: () => null, addEventListener() {} },
    CustomEvent: class { constructor(type, o) { this.type = type; this.detail = o && o.detail; } },
    setTimeout: (fn, ms) => { timers.push({ fn, ms }); return timers.length; }, clearTimeout() {},
    fetch: (url) => { asked.push(url); return reply(url); },
    encodeURIComponent, JSON, String, Object, Array, Number, Boolean, Math, Date, Promise, console,
    hidePad() {}, hideNativePin() {},
  });
  vm.runInContext(PURGE, ctx);
  vm.runInContext(COMMIT, ctx);
  vm.runInContext(['var SUB_ALIAS = { bakery: \'boulangerie\', sport: \'gym\' };', lift('registryIds'), lift('routeFor'), lift('bootVertical'),
    'this.routeFor = routeFor; this.bootVertical = bootVertical;'].join('\n'), ctx);
  const pc = window.KiwiPairingCommit;
  const run = (h) => new Promise((resolve) => pc.serverTyped(h, resolve));
  const fireTimeout = () => timers.filter((t) => t.ms >= 1000).forEach((t) => t.fn());
  const saved = () => JSON.parse(memory.get('kiwiPairedVenue') || 'null');
  const route = (v) => ({ ...ctx.routeFor(v) });
  return { ctx, pc, run, asked, fireTimeout, timers, memory, saved, route, unlocked, events };
}
const answer = (body) => () => Promise.resolve({ ok: true, json: () => Promise.resolve(body) });
const settle = () => new Promise((r) => setImmediate(r));
const SANTOS = { merchant: 'santos-store', name: 'Santos Store', location: 'Rabat' };
const pairedAs = (v) => ({ kiwiPaired: '1', kiwiLive: '1', kiwiLiveMerchant: v.merchant, kiwiPairedVenue: JSON.stringify(v) });

await ok('no type, the server says boutique → the boutique till', async () => {
  const h = harness(answer({ type: 'boutique', features: {} }));
  const out = await h.run({ ...SANTOS, type: '' });
  assert.equal(out.type, 'boutique');
  assert.deepEqual(h.route(out), { kind: 'vertical', id: 'boutique' });
  assert.match(h.asked[0], /\/api\/config\?merchant=santos-store$/);
});

await ok('a wrong type (restaurant): the server wins and the stale subtype goes', async () => {
  const h = harness(answer({ type: 'boutique' }));
  const out = await h.run({ ...SANTOS, type: 'restaurant', subtype: 'restaurant' });
  assert.equal(out.type, 'boutique');
  assert.equal(out.subtype, '');
  assert.deepEqual(h.route(out), { kind: 'vertical', id: 'boutique' });
});

await ok('the server agrees → the venue is kept as it is, subtype included', async () => {
  const h = harness(answer({ type: 'boutique' }));
  const handed = { ...SANTOS, type: 'boutique', subtype: 'boutique' };
  assert.equal(await h.run(handed), handed);
});

await ok('offline or an error → the venue\'s own type, never a blank one', async () => {
  const down = harness(() => Promise.reject(new Error('offline')));
  assert.equal((await down.run({ ...SANTOS, type: 'boutique' })).type, 'boutique');
  const bad = harness(() => Promise.resolve({ ok: false, json: () => Promise.resolve({}) }));
  assert.equal((await bad.run({ ...SANTOS, type: 'pressing' })).type, 'pressing');
  const empty = harness(answer({ type: '' }));
  assert.equal((await empty.run({ ...SANTOS, type: 'hotel' })).type, 'hotel', 'a store with no type on record keeps its own');
});

await ok('a slow server never holds the till: after 2.5 s the venue goes as it is, the late answer is dropped', async () => {
  let release;
  const h = harness(() => new Promise((r) => { release = r; }));
  const p = h.run({ ...SANTOS, type: 'boutique' });
  assert.ok(h.timers.some((t) => t.ms === 2500), 'a 2.5 s deadline is set');
  h.fireTimeout();
  const out = await p;
  assert.equal(out.type, 'boutique');
  release({ ok: true, json: () => Promise.resolve({ type: 'restaurant' }) });
  await settle();
  assert.equal(out.type, 'boutique', 'the late answer changes nothing');
});

/* Santos's iPad: paired with type '' by the hand-off, so every start (and every
   staff unlock) chose the restaurant till. This is the till's own path:
   bootVertical → typeFirst → the real commit() → bootVertical again. */
await ok('a till paired with no type opens the boutique and keeps it, through the real commit()', async () => {
  const v = { ...SANTOS, venueId: 'v1', type: '', subtype: '' };
  const h = harness(answer({ type: 'boutique' }), { ...pairedAs(v), 'kiwiSales:scoped@santos-store': '[{"total":450}]' });
  h.ctx.bootVertical(v);
  assert.deepEqual(h.unlocked, [], 'nothing opens before the answer');
  await settle();
  assert.deepEqual(h.unlocked, ['boutique'], 'the boutique till, not the restaurant');
  assert.equal(h.ctx.window.__kiwiPairedBoutiqueVenue, 'v1');
  const saved = h.saved();
  assert.equal(saved.type, 'boutique', 'the next start goes straight to the boutique');
  assert.equal(saved.venueId, 'v1');
  assert.equal(saved.typeAsked, undefined, 'the marker never reaches storage');
  assert.equal(h.memory.get('kiwiSales:scoped@santos-store'), '[{"total":450}]', 'the same store: nothing is purged');
  assert.deepEqual(h.events, ['kiwi-paired'], 'announced like any pairing');
  h.ctx.bootVertical(saved);
  assert.equal(h.asked.length, 1, 'a typed pairing never asks again');
  assert.deepEqual(h.unlocked, ['boutique', 'boutique']);
});

await ok('a typed venue, a venue with no merchant, and a store with no type on record all route at once, as before', async () => {
  const h = harness(answer({ type: '' }), pairedAs({ ...SANTOS, type: '' }));
  h.ctx.bootVertical({ ...SANTOS, type: 'pressing' });
  h.ctx.bootVertical({ name: 'Démo', type: '' });
  assert.deepEqual(h.unlocked, ['pressing', 'restaurant'], 'synchronously');
  assert.equal(h.asked.length, 0, 'no request for either');
  h.ctx.bootVertical({ ...SANTOS, type: '' });
  await settle();
  assert.deepEqual(h.unlocked, ['pressing', 'restaurant', 'restaurant'], 'no type anywhere: the restaurant, as before, and no loop');
  assert.equal(h.asked.length, 1);
  assert.equal(h.saved().type, '', 'nothing invented is saved');
  assert.deepEqual(h.events, [], 'no commit without an answer');
});

await ok('an operator view of another store is typed but never rewrites this device\'s pairing', async () => {
  const mine = { merchant: 'another-store', type: '' };
  const h = harness(answer({ type: 'boutique' }), pairedAs(mine));
  h.ctx.bootVertical({ ...SANTOS, type: '' });
  await settle();
  assert.deepEqual(h.unlocked, ['boutique']);
  assert.deepEqual(h.saved(), mine);
  assert.deepEqual(h.events, []);
});

console.log(`caisse-handoff-server-type: ${passed} passed`);
