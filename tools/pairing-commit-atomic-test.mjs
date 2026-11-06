#!/usr/bin/env node
/* Un appairage est tout ou rien : mis en scène et relu avant la purge de
 * l'ancien commerçant, purge vérifiée, clés relues, jamais d'appareil appairé à
 * moitié, jamais de `kiwi-paired` sur un échec. Exécute le vrai
 * assets/pairing-commit.js et le vrai assets/tenant-purge.js avec un stockage
 * qui refuse des écritures ou des suppressions précises. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const read = f => fs.readFileSync(new URL('../' + f, import.meta.url), 'utf8');
const PURGE = read('assets/tenant-purge.js'), COMMIT = read('assets/pairing-commit.js');
const B = { ok: true, merchant: 'restaurant-b', type: 'restaurant', name: 'Chez B' };
const residueOfA = () => ({
  kiwiPaired: '1', kiwiLive: '1', kiwiLiveMerchant: 'restaurant-a',
  kiwiPairedVenue: JSON.stringify({ merchant: 'restaurant-a', name: 'Chez A' }),
  'kiwiSales:scoped@restaurant-a': '[{"total":450}]', 'kiwi:bqDay': '{"count":7}',
  'kiwi-caisse-shift': '{"journal":"A"}', 'kiwi:posDevice': 'tablette-01', kiwiTheme: 'dark',
});

function boot(seed, rules = {}, { withPurge = true } = {}) {
  const memory = new Map(Object.entries(seed)), events = [], reports = [];
  const api = {
    getItem: k => (memory.has(k) ? memory.get(k) : null),
    setItem(k, v) { if (rules.refuseSet && rules.refuseSet(k, v)) throw new Error('QuotaExceededError'); memory.set(k, String(v)); },
    removeItem(k) { if (rules.refuseRemove && rules.refuseRemove(k)) return; memory.delete(k); },
    key: i => Array.from(memory.keys())[i] ?? null,
    get length() { return memory.size; },
  };
  const window = { localStorage: api, KiwiReportError: (e, w) => reports.push(w) };
  window.window = window;
  const ctx = vm.createContext({ window, localStorage: api, document: { dispatchEvent: e => events.push(e.type) },
    CustomEvent: class { constructor(type, o) { this.type = type; this.detail = o && o.detail; } },
    JSON, String, Object, Array, Number, Boolean, Math, Date, console });
  if (withPurge) vm.runInContext(PURGE, ctx);
  vm.runInContext(COMMIT, ctx);
  return { commit: window.KiwiPairingCommit.commit, memory, events, reports };
}

/* 1. Le stockage refuse la mise en scène : rien n'est purgé, l'ancien contexte reste. */
{
  const t = boot(residueOfA(), { refuseSet: k => k === 'kiwiPairingStage' });
  const r = t.commit('123456', B);
  assert.equal(r.ok, false); assert.equal(r.error, 'storage-unavailable');
  assert.equal(t.memory.get('kiwiLiveMerchant'), 'restaurant-a', 'l\'ancien appairage est intact');
  assert.ok(t.memory.has('kiwiSales:scoped@restaurant-a'), 'l\'ancien commerçant n\'a pas été purgé sans remplaçant durable');
  assert.deepEqual(t.events, [], 'pas de kiwi-paired');
}
/* 2. Une clé de l'appairage refuse d'être écrite (après la mise en scène) : retour arrière complet. */
{
  const t = boot(residueOfA(), { refuseSet: k => k === 'kiwiPairedVenue' });
  const r = t.commit('123456', B);
  assert.equal(r.ok, false); assert.equal(r.error, 'persist-failed');
  assert.deepEqual(t.events, [], 'pas de kiwi-paired sur un appairage partiel');
  assert.notEqual(t.memory.get('kiwiLiveMerchant'), 'restaurant-b', 'le nouveau commerçant n\'est pas laissé seul');
  assert.ok(!t.memory.has('kiwiPaired'), 'jamais « appairé » à moitié');
  assert.ok(!t.memory.has('kiwiPairingStage'), 'la mise en scène est nettoyée');
}
/* 2 bis. Même commerçant : l'échec restitue l'appairage d'avant. */
{
  const same = { kiwiPaired: '1', kiwiLive: '1', kiwiLiveMerchant: 'restaurant-b', kiwiPairedVenue: JSON.stringify({ merchant: 'restaurant-b', name: 'Ancien nom' }) };
  const t = boot(same, { refuseSet: k => k === 'kiwiPaired' });
  assert.equal(t.commit('123456', B).ok, false);
  assert.equal(JSON.parse(t.memory.get('kiwiPairedVenue')).name, 'Ancien nom', 'l\'appairage valide d\'avant est restitué');
}
/* 3. La purge de l'ancien n'a pas tout emporté : on n'appaire pas par-dessus. */
{
  const t = boot(residueOfA(), { refuseRemove: k => k === 'kiwiSales:scoped@restaurant-a' });
  const r = t.commit('123456', B);
  assert.equal(r.ok, false); assert.equal(r.error, 'purge-failed'); assert.equal(r.switched, true);
  assert.notEqual(t.memory.get('kiwiLiveMerchant'), 'restaurant-b', 'le nouveau commerçant n\'hérite pas des ventes de l\'ancien');
  assert.deepEqual(t.events, []);
  assert.ok(t.reports.includes('tenant:caisse_tenant_switch_purge_failed'), 'l\'échec est remonté');
}
/* 3 bis. Module de purge absent lors d'un changement de commerçant. */
{
  const t = boot(residueOfA(), {}, { withPurge: false });
  assert.equal(t.commit('123456', B).error, 'purge-failed');
}
/* 4. Chemin heureux : tout est posé, la mise en scène a disparu, l'événement part. */
{
  const t = boot(residueOfA());
  const r = t.commit('123456', B);
  assert.equal(r.ok, true); assert.equal(r.switched, true);
  assert.equal(t.memory.get('kiwiLiveMerchant'), 'restaurant-b'); assert.equal(t.memory.get('kiwiPaired'), '1');
  assert.ok(!t.memory.has('kiwiPairingStage')); assert.deepEqual(t.events, ['kiwi-paired']);
  assert.equal(t.memory.get('kiwi:posDevice'), 'tablette-01');
}
console.log('✓ pairing-commit-atomic-test');
