#!/usr/bin/env node
/* Droits de l'équipe au comptoir · assets/caisse-pairing.js › authorizeManager.
 *
 * Le verdict de /api/pin/verify ne vaut que pour l'acte demandé, et seulement
 * en ligne : un accord pour le tiroir n'approuve pas un remboursement, un
 * verdict ne s'écrit jamais dans le cache hors ligne, et hors ligne c'est la
 * règle du rôle qui tranche (le serveur relit à la synchronisation).
 * Codes : valeurs de banc inventées pour ce fichier.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';

let checks = 0;
const check = (yes, msg) => { assert.ok(yes, msg); checks++; console.log('  ✓ ' + msg); };
const source = fs.readFileSync(new URL('../assets/caisse-pairing.js', import.meta.url), 'utf8');

function till(reply) {
  const storage = new Map([
    ['kiwiPaired', '1'],
    ['kiwiPairedVenue', JSON.stringify({ merchant: 'droits-fixture', name: 'Droits Fixture', type: 'restaurant' })],
  ]);
  const state = { online: true, reply, asked: [] };
  const context = {
    console, Promise, Date, Math, JSON, Object, Array, String, Number, RegExp,
    TextEncoder, crypto: webcrypto,
    localStorage: { getItem: (k) => storage.has(k) ? storage.get(k) : null, setItem: (k, v) => storage.set(k, String(v)), removeItem: (k) => storage.delete(k) },
    sessionStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    navigator: { get onLine() { return state.online; } },
    location: { search: '', hostname: 'kiwi-os.com' },
    setTimeout, clearTimeout, AbortController,
    CustomEvent: class { constructor(type, init = {}) { this.type = type; this.detail = init.detail; } },
    document: { readyState: 'loading', addEventListener() {}, dispatchEvent() {}, getElementById: () => null, body: {} },
    fetch: async (url, init) => {
      if (!state.online) throw new TypeError('offline');
      const body = JSON.parse(init.body);
      state.asked.push(body.action || null);
      return { ok: true, status: 200, headers: { get: () => null }, json: async () => state.reply(body) };
    },
  };
  context.window = context;
  context.window.KiwiEnv = { demosAllowed: false };
  context.window.KiwiRoles = { opensTill: (role) => /manager|owner|caiss/i.test(String(role)) };
  vm.runInNewContext(source, context, { filename: 'assets/caisse-pairing.js' });
  return { P: context.KiwiCaissePairing, storage, state };
}
const cashier = { id: 'pin-lina', name: 'Lina', role: 'Caissière' };
const manager = { id: 'pin-sara', name: 'Sara', role: 'Manager' };
/* Un serveur qui répond pour le droit de l'acte demandé, comme pin/verify. */
const KIND = { refund: 'sales.refund', drawer: 'sales.drawer', discount: 'sales.discount' };
const serverFor = (staff, granted) => (body) => {
  const id = body.action && KIND[body.action.kind];
  return { ok: true, staff, ...(id ? { permission: { id, granted: granted.includes(id), configured: true } } : {}),
    ...(id === 'sales.refund' && granted.includes(id) ? { approval: 'signed-refund' } : {}) };
};

console.log('■ authorizeManager · verdict lié à l’acte');
{
  const { P } = till(serverFor(cashier, ['sales.drawer']));
  check(await P.authorizeManager('4101', { kind: 'drawer' }) === true, 'Lina, autorisée au tiroir, valide le tiroir avec son code');
  check(await P.authorizeManager('4101', { kind: 'refund', refundId: 'r1' }) === false, 'ce même accord n’approuve pas un remboursement');
  check(await P.authorizeManager('4101', { kind: 'discount' }) === false, 'ni une remise');
  check(await P.authorizeManager('4101') === false, 'sans acte nommé : la règle du rôle (une caissière ne valide pas)');
}
{
  /* Un serveur (ou une réponse rejouée) qui annonce le verdict d'un AUTRE droit : ignoré. */
  const { P } = till(() => ({ ok: true, staff: cashier, permission: { id: 'sales.drawer', granted: true, configured: true } }));
  check(await P.authorizeManager('4101', { kind: 'cash' }) === false, 'un verdict pour un autre droit que celui demandé ne vaut rien');
}
{
  const { P } = till(serverFor(manager, []));
  check(await P.authorizeManager('4102', { kind: 'drawer' }) === false, 'un gérant privé du droit par le patron est refusé en ligne');
  const legacy = till((body) => ({ ok: true, staff: manager, ...(body.action ? { permission: { id: KIND[body.action.kind], granted: false, configured: false } } : {}) }));
  check(await legacy.P.authorizeManager('4102', { kind: 'drawer' }) === true, 'boutique non configurée : la règle d’avant (le gérant valide)');
}

console.log('■ Hors ligne');
{
  const { P, storage, state } = till(serverFor(cashier, ['sales.drawer']));
  check(await P.authorizeManager('4103', { kind: 'drawer' }) === true, 'en ligne : accord pour le tiroir');
  for (let i = 0; i < 200 && ![...storage.keys()].some((k) => k.startsWith('kiwi:caisse:offline-pins:v1:')); i++) await new Promise((r) => setTimeout(r, 25));
  const key = [...storage.keys()].find((k) => k.startsWith('kiwi:caisse:offline-pins:v1:'));
  check(!!key && !/permission|granted|configured|sales\./.test(storage.get(key)), 'le cache hors ligne ne garde aucun verdict de droit');
  state.online = false;
  check(await P.authorizeManager('4103', { kind: 'drawer' }) === false, 'hors ligne, le cache ne rejoue pas l’accord : la règle du rôle refuse la caissière');
}

console.log(`\nstaff-permissions-till-test · ${checks} vérifications`);
