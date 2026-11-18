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
 *   node tools/caisse-handoff-server-type-test.mjs
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pairing = readFileSync(path.join(ROOT, 'assets/caisse-pairing.js'), 'utf8');
const commit = readFileSync(path.join(ROOT, 'assets/pairing-commit.js'), 'utf8');
let passed = 0;
const ok = async (label, fn) => { await fn(); passed++; console.log('  ✓ ' + label); };

function lift(src, file, name) {
  const m = src.match(new RegExp('\\n  function ' + name + '\\([^)]*\\) \\{[\\s\\S]*?\\n  \\}'));
  assert.ok(m, name + ' found in ' + file);
  return m[0];
}

/* The real serverTyped + typeFirst (pairing-commit.js) and routeFor
   (caisse-pairing.js), with a fake fetch, fake timers and a fake pairing. */
function harness(reply, paired) {
  const timers = [];
  const asked = [];
  const store = { kiwiPairedVenue: paired ? JSON.stringify(paired) : null };
  const ctx = {
    window: { KiwiPosDispatch: { registry: { '1': { id: 'boutique' }, '2': { id: 'pressing' }, '3': { id: 'hotel' } } } },
    setTimeout: (fn, ms) => { timers.push({ fn, ms }); return timers.length; },
    clearTimeout() {},
    fetch: (url) => { asked.push(url); return reply(url); },
    pairedVenue: () => JSON.parse(store.kiwiPairedVenue || 'null'),
    commit: (code, d) => { assert.equal(code, ''); store.kiwiPairedVenue = JSON.stringify(d); store.commits = (store.commits || 0) + 1; return { ok: true, venue: d, switched: false }; },
    encodeURIComponent, Object, String, JSON, Promise,
  };
  vm.createContext(ctx);
  vm.runInContext([lift(commit, 'pairing-commit.js', 'serverTyped'), lift(commit, 'pairing-commit.js', 'typeFirst'),
    'var SUB_ALIAS = { bakery: \'boulangerie\', sport: \'gym\' };',
    lift(pairing, 'caisse-pairing.js', 'registryIds'), lift(pairing, 'caisse-pairing.js', 'routeFor'),
    'this.serverTyped = serverTyped; this.typeFirst = typeFirst; this.routeFor = routeFor;'].join('\n'), ctx);
  const run = (h) => new Promise((resolve) => ctx.serverTyped(h, resolve));
  const fireTimeout = () => timers.filter((t) => t.ms >= 1000).forEach((t) => t.fn());
  return { ctx, run, asked, fireTimeout, timers, store };
}
const answer = (body) => () => Promise.resolve({ ok: true, json: () => Promise.resolve(body) });
const SANTOS = { merchant: 'santos-store', name: 'Santos Store', ts: 1 };
const route = (h, v) => ({ ...h.ctx.routeFor(v) });

await ok('no type, the server says boutique → the boutique till', async () => {
  const h = harness(answer({ type: 'boutique', features: {} }));
  const out = await h.run({ ...SANTOS, type: '' });
  assert.equal(out.type, 'boutique');
  assert.deepEqual(route(h, out), { kind: 'vertical', id: 'boutique' });
  assert.match(h.asked[0], /\/api\/config\?merchant=santos-store$/);
});

await ok('a wrong type (restaurant): the server wins and the stale subtype goes', async () => {
  const h = harness(answer({ type: 'boutique' }));
  const out = await h.run({ ...SANTOS, type: 'restaurant', subtype: 'restaurant' });
  assert.equal(out.type, 'boutique');
  assert.equal(out.subtype, '');
  assert.deepEqual(route(h, out), { kind: 'vertical', id: 'boutique' });
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
  await new Promise((r) => setImmediate(r));
  assert.equal(out.type, 'boutique', 'the late answer changes nothing');
});

/* Santos's iPad: paired with type '' by the hand-off, so every start (and every
   staff unlock) chose the restaurant till. */
await ok('typeFirst: a pairing with no type is typed by the server, kept on the device, then routed', async () => {
  const h = harness(answer({ type: 'boutique' }), { ...SANTOS, venueId: 'v1', type: '', subtype: '' });
  const routed = await new Promise((resolve) => assert.equal(h.ctx.typeFirst({ ...SANTOS, venueId: 'v1', type: '' }, resolve), true));
  assert.equal(routed.type, 'boutique');
  assert.deepEqual(route(h, routed), { kind: 'vertical', id: 'boutique' });
  const saved = JSON.parse(h.store.kiwiPairedVenue);
  assert.equal(saved.type, 'boutique', 'the next start goes straight to the boutique');
  assert.equal(saved.venueId, 'v1');
  assert.equal(saved.typeAsked, undefined, 'the marker never reaches storage');
  assert.equal(h.store.commits, 1, 'through commit(), the one writer of the pairing');
  assert.equal(h.ctx.typeFirst(routed, () => assert.fail('asked twice')), false, 'the typed venue routes at once');
});

await ok('typeFirst asks nothing for a typed venue, a venue with no merchant, or one already asked; no type on record ends the loop', async () => {
  const h = harness(answer({ type: '' }), { ...SANTOS, type: '' });
  const never = () => assert.fail('no request expected');
  assert.equal(h.ctx.typeFirst({ ...SANTOS, type: 'boutique' }, never), false);
  assert.equal(h.ctx.typeFirst({ name: 'Démo', type: '' }, never), false);
  assert.equal(h.ctx.typeFirst(null, never), false);
  assert.equal(h.asked.length, 0, 'no request for any of them');
  const routed = await new Promise((resolve) => h.ctx.typeFirst({ ...SANTOS, type: '' }, resolve));
  assert.equal(routed.type, '', 'the server has none: the till routes as before');
  assert.equal(h.ctx.typeFirst(routed, never), false, 'asked once, then it routes');
  assert.equal(JSON.parse(h.store.kiwiPairedVenue).type, '', 'nothing invented is saved');
  assert.equal(h.store.commits, undefined, 'no commit without an answer');
  const other = harness(answer({ type: 'boutique' }), { merchant: 'another-store', type: '' });
  await new Promise((resolve) => other.ctx.typeFirst({ ...SANTOS, type: '' }, resolve));
  assert.equal(JSON.parse(other.store.kiwiPairedVenue).merchant, 'another-store', 'an operator view of another store never rewrites this device\'s pairing');
  assert.equal(JSON.parse(other.store.kiwiPairedVenue).type, '');
});

await ok('the till types a venue before it picks the vertical, and the hook ships with the till', async () => {
  const bv = lift(pairing, 'caisse-pairing.js', 'bootVertical');
  assert.match(bv, /^\n  function bootVertical\(v\) \{\n    var pc = window\.KiwiPairingCommit; if \(pc && pc\.typeFirst && pc\.typeFirst\(v, bootVertical\)\) return;/,
    'the first thing bootVertical does');
  assert.match(commit, /window\.KiwiPairingCommit = \{ commit: commit, purgeTenantData: purgeTenantData, serverTyped: serverTyped, typeFirst: typeFirst \};/);
  const html = readFileSync(path.join(ROOT, 'kiwi-caisse.html'), 'utf8');
  const a = html.indexOf('assets/pairing-commit.js?v='), b = html.indexOf('assets/caisse-pairing.js?v=');
  assert.ok(a > 0 && b > a, 'pairing-commit.js loads before caisse-pairing.js');
});

console.log(`caisse-handoff-server-type: ${passed} passed`);
