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

console.log('■ staff-perms-till.js › le pavé connaît le droit de l’acte');
{
  const src = fs.readFileSync(new URL('../assets/staff-perms-till.js', import.meta.url), 'utf8');
  const store = new Map();
  const doc = { configured: true, freeDiscountPct: 10, ts: 1, staff: [{ k: 'lina saidi', n: 'Lina Saidi', perms: ['sales.drawer'] },
    { k: 'sara alaoui', n: 'Sara Alaoui', perms: ['money.cash', 'sales.drawer'] }, { k: 'omar berrada', n: 'Omar Berrada', perms: ['money.cash'] }] };
  store.set('kiwiPerms:v1:droits-fixture', JSON.stringify(doc));
  const ctx = {
    console, JSON, Object, Array, String, Number, Math, Date, Promise, setInterval: () => 0,
    localStorage: { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) },
    document: { readyState: 'complete', documentElement: { lang: 'fr' }, head: { appendChild() {} }, getElementById: () => null,
      createElement: () => ({}), querySelectorAll: () => [], addEventListener() {} },
    fetch: () => new Promise(() => {}),
  };
  ctx.window = ctx;
  ctx.addEventListener = () => {};
  ctx.KiwiCaissePairing = { pairedVenue: () => ({ merchant: 'droits-fixture' }) };
  ctx.KiwiStaff = { id: 'pin-lina', name: 'Lina Saidi', role: 'Caissière', sellerProof: 'seller-lina' };
  vm.runInNewContext(src, ctx, { filename: 'assets/staff-perms-till.js' });
  const forAct = ctx.KiwiCaissePairing.permsForAct;
  check(typeof forAct === 'function', 'le module se branche sur l’espace de l’appairage, que le pavé lit déjà');
  const out = forAct({ kind: 'cash_out', amountCents: 2000, move: 'out' }, 'till', () => {}, null, {});
  check(out && typeof out.opts.validate === 'function', 'sortie d’espèces : le pavé reçoit un juge du droit');
  check(/Lina Saidi.*sortir ou entrer des espèces/.test(out.opts.validate({ name: 'Lina Saidi' })), 'le code de Lina (sans le droit) est refusé, avec son nom et l’acte');
  check(out.opts.validate({ name: 'Sara Alaoui' }) === null, 'celui de Sara (avec le droit) passe et devient l’auteur');
  check(out.opts.hint === 'Lina Saidi n’a pas le droit de sortir ou entrer des espèces. Sara Alaoui ou Omar Berrada peuvent valider.',
    'avant tout code, le pavé dit le droit qui manque et qui peut valider');
  const P = ctx.KiwiCaissePairing;
  check(JSON.stringify(P.permsProofs()) === '{"sellerProof":"seller-lina"}', 'sans accord récent, un mouvement part avec la preuve de la personne en poste');
  check(JSON.stringify(out.authContext) === '{"kind":"cash","amountCents":2000,"move":"out"}', 'le pavé envoie l’acte, le montant et le sens avec le code (même au niveau caisse)');
  out.onApprove({ id: 'pin-sara', name: 'Sara Alaoui', actorProof: 'actor-sara', actProof: 'act-sara' });
  check(P.permsProofs().actProof === 'act-sara' && !('actorProof' in P.permsProofs()), 'après l’accord de Sara, le mouvement part avec la preuve de CE geste, pas la preuve d’identité générique');
  check(out.opts.validate({ name: 'Sara Alaoui', offline: true, permission: { id: 'money.cash', granted: false, configured: true } }) === null,
    'un verdict hors ligne n’est jamais lu : la copie de l’équipe tranche');
  const self = forAct({ kind: 'open_drawer' }, 'manager', () => {}, null, {});
  check(self && !self.done && self.authContext.kind === 'drawer' && self.opts.validate({ name: 'Lina Saidi' }) === null,
    'Lina a le droit au tiroir : le pavé lui demande SON code (la preuve du geste), pas celui d’un responsable');
  check(self.opts.hint === 'Confirmez avec votre code : ce geste est inscrit à votre nom.', 'et lui dit pourquoi');
  /* Hors ligne : espèces et clôture ne bloquent pas la caisse, le journal les inscrira au retour. */
  let online = true;
  ctx.navigator = { get onLine() { return online; } };
  online = false;
  let offWho = null;
  const offClose = forAct({ kind: 'close_till' }, 'manager', (who) => { offWho = who; }, null, {});
  const offCash = forAct({ kind: 'cash_out', amountCents: 2000, move: 'out' }, 'till', () => {}, null, {});
  const offDisc = forAct({ kind: 'discount', pct: 30 }, 'manager', () => {}, null, {});
  check(offClose && offClose.done && offClose.offline && offWho.name === 'Lina Saidi' && offCash && offCash.done && !P.permsProofs().actProof,
    'hors ligne : Lina clôture et sort des espèces sans pavé, sans preuve de geste (le journal du patron les inscrira à la synchro)');
  check(offDisc && !offDisc.done, 'hors ligne, la remise au-delà du seuil garde le pavé');
  online = true;
  /* navigator.onLine dit « en ligne » mais la dernière vérification de code n'a pas eu de réponse. */
  P.lastRequestFailed = () => true;
  const netClose = forAct({ kind: 'close_till' }, 'manager', () => {}, null, {});
  const netCash = forAct({ kind: 'cash_in', amountCents: 500, move: 'in' }, 'till', () => {}, null, {});
  const netDisc = forAct({ kind: 'discount', pct: 30 }, 'manager', () => {}, null, {});
  check(netClose && netClose.done && netClose.offline && netCash && netCash.done && netDisc && !netDisc.done,
    'une vérification de code restée sans réponse vaut hors ligne : clôture et espèces passent, la remise garde le pavé');
  P.lastRequestFailed = () => false;
  check(!forAct({ kind: 'close_till' }, 'manager', () => {}, null, {}).done, 'le réseau répond de nouveau : la clôture repasse par le pavé');
  delete P.lastRequestFailed;
  {
    const pairing = fs.readFileSync(new URL('../assets/caisse-pairing.js', import.meta.url), 'utf8');
    const verify = pairing.slice(pairing.indexOf('function verifyCode('), pairing.indexOf('function verifyReply('));
    check(/fetchDeadline\('\/api\/pin\/verify'[\s\S]*?\.then\(function \(r\) \{ lastFailed = false; return r; \}, function \(e\) \{ lastFailed = true; throw e; \}\)/.test(verify),
      'le pavé classique note lui aussi une vérification restée sans réponse (lastRequestFailed)');
    check(/window\.addEventListener\('online', function \(\) \{ lastFailed = false; \}\)/.test(pairing), 'le réseau revenu (événement online) efface l’échec : la caisse repasse en ligne');
  }
  ctx.navigator = undefined;
  const refund = forAct({ kind: 'refund' }, 'manager', () => { throw new Error('jamais sans pavé'); }, { kind: 'refund', refundId: 'r' }, {});
  check(refund && !refund.done && refund.authContext.kind === 'refund', 'un remboursement passe toujours par le pavé (preuve signée liée à la commande)');
  store.set('kiwiPerms:v1:droits-fixture', JSON.stringify({ ...doc, configured: false }));
  check(forAct({ kind: 'cash_out' }, 'till', () => {}, null, {}) === null, 'boutique non configurée : le pavé ne change rien');
}

console.log('■ Le pavé 2027 (assets/kit/pin-flow.js) suit le droit, plus le rôle');
{
  const src = fs.readFileSync(new URL('../assets/kit/pin-flow.js', import.meta.url), 'utf8');
  const ctx = { console, JSON, Object, Array, String, Number, Math, Date, Promise };
  ctx.window = ctx;
  vm.runInNewContext(src, ctx, { filename: 'assets/kit/pin-flow.js' });
  const F = ctx.KiwiPinFlow;
  const reply = (staff, permission) => ({ kind: 'answer', status: 200, json: true, body: { ok: true, staff, ...(permission ? { permission } : {}) } });
  const drawer = { act: { kind: 'open_drawer' } };
  check(F.classify('manager', reply(manager, { id: 'sales.drawer', granted: false, configured: true }), drawer).key === 'pin.manager.not_manager', 'un gérant privé du droit par le patron : refusé sur le pavé 2027');
  check(!!F.classify('manager', reply(cashier, { id: 'sales.drawer', granted: true, configured: true }), drawer).success, 'une caissière qui a le droit : acceptée, quel que soit son intitulé');
  check(F.classify('manager', reply(cashier, { id: 'sales.drawer', granted: false, configured: false }), drawer).key === 'pin.manager.not_manager', 'droits pas activés : la règle d’avant (le rôle) tient');
  check(F.classify('manager', reply(manager), { ...drawer, permits: () => false }).key === 'pin.manager.not_manager', 'sans verdict du serveur, la copie de la caisse refuse un code sans le droit');
}

console.log(`\nstaff-permissions-till-test · ${checks} vérifications`);
