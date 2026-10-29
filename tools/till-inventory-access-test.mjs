#!/usr/bin/env node
/* Kiwi · till-inventory-access-test · who may edit inventory from the till.
 *
 * Owner, 29 October 2026: from the dashboard he gives some of his workers the
 * right to change inventory on the till. Decision: the owner and managers
 * always can once the operator switch (caisseInventoryAdmin) is on; any other
 * member only when the owner ticked them in Équipe (members[].tillInventory).
 *
 * Runs the real assets/till-inventory-access.js with the real KiwiRoles
 * (assets/staff-roles.js), and the real dashboard save rule
 * (assets/team/access-rules.js › buildMember). Nothing reaches a server.
 *   node tools/till-inventory-access-test.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let n = 0, bad = 0;
const ok = (cond, msg, detail) => { if (cond) { n++; console.log('  ✓ ' + msg); } else { bad++; console.log('  ✗ ' + msg + (detail ? ' · ' + detail : '')); } };

function store() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), clear: () => m.clear() };
}
const SLUG = 'boutique-test';
const team = { members: [
  { id: 'm1', firstName: 'Sara', lastName: 'El Idrissi', function: 'Caissière', tillInventory: true, venueSlug: SLUG },
  { id: 'm2', firstName: 'Yassine', lastName: 'Amrani', function: 'Vendeur', venueSlug: SLUG },
  { id: 'm3', firstName: 'Nora', lastName: 'Bennani', function: 'Vendeuse', tillInventory: true, venueSlug: 'another-store' },
  { id: 'm4', firstName: 'Omar', lastName: 'Tazi', function: 'Vendeur', tillInventory: true, deleted: true, venueSlug: SLUG },
] };
let served = team, fetches = 0;
globalThis.window = globalThis;
globalThis.localStorage = store();
globalThis.sessionStorage = store();
globalThis.document = { addEventListener() {} };
globalThis.fetch = async (url) => {
  fetches++;
  ok(String(url) === '/api/store?feature=team&merchant=' + SLUG, 'reads the team document of the paired store only', String(url));
  if (served === 'offline') throw new Error('offline');
  return { ok: true, json: async () => ({ data: served }) };
};
vm.runInThisContext(fs.readFileSync(path.join(root, 'assets/staff-roles.js'), 'utf8'), { filename: 'staff-roles.js' });
localStorage.setItem('kiwiPairedVenue', JSON.stringify({ merchant: SLUG, type: 'boutique' }));

const url = pathToFileURL(path.join(root, 'assets/till-inventory-access.js')).href;
let gen = 0;
const fresh = () => import(url + '?fresh=' + (++gen));
const on = (pins) => { window.KiwiConfig = { features: { caisseInventoryAdmin: true }, pins: pins || [{ id: 'p1', name: 'Sara El Idrissi', role: 'Caissière' }] }; };
const off = () => { window.KiwiConfig = { features: {}, pins: [{ id: 'p1' }] }; };
const as = (name, role) => { window.KiwiStaff = name ? { name, role } : null; };

let mod = await fresh();
await mod.refreshTillInventoryStaff();

console.log('■ the operator switch is the door');
off(); as('Owner Name', 'owner');
ok(mod.tillInventoryAllowed() === false, 'switch off · not even the owner edits on the till');
ok(/tableau de bord/.test(mod.tillInventoryRefusal()), 'switch off · the till sends people to the dashboard');
window.KiwiConfig = { features: { caisseInventoryAdmin: 'true' }, pins: [] };
ok(mod.tillInventoryAllowed() === false, 'only the boolean true opens the door, not the string');

console.log('■ owner and managers always');
on();
for (const role of ['owner', 'Propriétaire', 'Manager', 'Gérante', 'responsable']) {
  as('Someone', role);
  ok(mod.tillInventoryAllowed() === true, 'role « ' + role + ' » edits');
}

console.log('■ other staff only when ticked');
as('Sara El Idrissi', 'Caissière');
ok(mod.tillInventoryAllowed() === true, 'a ticked cashier edits');
as('  sara  el idrissi ', 'Caissière');
ok(mod.tillInventoryAllowed() === true, 'the name matches whatever its case and spacing');
as('Yassine Amrani', 'Vendeur');
ok(mod.tillInventoryAllowed() === false, 'an unticked seller does not');
ok(/Équipe/.test(mod.tillInventoryRefusal()), 'the refusal says the owner can allow it in Équipe');
as('Nora Bennani', 'Vendeuse');
ok(mod.tillInventoryAllowed() === false, 'a member ticked for another establishment does not');
as('Omar Tazi', 'Vendeur');
ok(mod.tillInventoryAllowed() === false, 'a deleted member does not');

console.log('■ no pad, God Mode');
as(null);
ok(mod.tillInventoryAllowed() === false, 'nobody signed in on a till that has codes · refused');
on([]);
ok(mod.tillInventoryAllowed() === true, 'a till without any staff code is the owner\'s own · allowed');
on(); as('Yassine Amrani', 'Vendeur');
sessionStorage.setItem('kiwi:tillOperator:v1', SLUG);
ok(mod.tillInventoryAllowed() === true, 'God Mode, proven for this store, edits');
sessionStorage.setItem('kiwi:tillOperator:v1', 'another-store');
ok(mod.tillInventoryAllowed() === false, 'an operator view for another store does not count');
sessionStorage.clear();

console.log('■ offline and change of mind');
served = 'offline';
mod = await fresh();
await mod.refreshTillInventoryStaff();
as('Sara El Idrissi', 'Caissière');
ok(mod.tillInventoryAllowed() === true, 'offline, the last list read for this store still holds');
served = { members: [{ ...team.members[0], tillInventory: false }] };
await mod.refreshTillInventoryStaff();
ok(mod.tillInventoryAllowed() === false, 'unticked by the owner · refused at the next read');
ok(fetches >= 3, 'each refresh reads the server', String(fetches));

console.log('■ the dashboard save rule (team/access-rules.js › buildMember)');
const rules = createRequire(import.meta.url)(path.join(root, 'assets/team/access-rules.js'));
const deps = { makeCode: () => '4821', memberCode: () => '', credentialRules: { canonicalCode: () => '' }, teamSlug: () => SLUG, AVATAR_TONES: ['a'], Date, Math };
const st = { memberId: 'm2', languages: [], editing: true };
const base = { firstName: 'Yassine', lastName: 'Amrani', email: 'y@example.com', function: 'Vendeur' };
const save = (data, prev) => rules.buildMember({ ...base, ...data }, st, '', prev, [], 'boutique', deps).tillInventory;
ok(save({ tillInventoryShown: '1', tillInventory: '1' }, null) === true, 'ticked box · saved true');
ok(save({ tillInventoryShown: '1' }, { tillInventory: true }) === false, 'box shown and unticked · saved false');
ok(save({}, { tillInventory: true }) === true, 'box not shown (switch off) · keeps what the member had');
ok(save({}, null) === false, 'new member, box not shown · false');

console.log(`\ntill-inventory-access: ${n} passed, ${bad} failed`);
process.exit(bad ? 1 : 0);
