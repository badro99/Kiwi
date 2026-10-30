#!/usr/bin/env node
/* Who opens the till: the server and the browser must give the same answer.
 *
 *   node tools/till-role-parity-test.mjs
 *
 * Owner report, 30 Oct 2026: two Santos sellers (« Vendeur conseil ») had
 * codes on the Team page, yet the till refused them. The server keeps a
 * code in staff_pins only when employeeRoleOpensTill(role) says yes
 * (functions/api/_staff-publication.js), and sales roles were not on that
 * list, so their codes were dropped without a word. The browser keeps its own
 * copy of the rule (assets/staff-roles.js › opensTill), read by the till and the
 * team editor. This runs both real rules over every job title and department
 * the Team page can hand out (assets/team/catalog.js) and every role the
 * operator console offers, and holds:
 *   · the two agree on every value;
 *   · counter sellers open the till in every trade that has them;
 *   · kitchen, floor, stock and back-office titles still open none. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { employeeRoleOpensTill } from '../functions/auth/_lib.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const load = (file) => {
  const window = {};
  const ctx = { window, console, Object, Array, String, JSON };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(ROOT, file), 'utf8'), ctx);
  return window;
};
const roles = load('assets/staff-roles.js').KiwiRoles;
const catalog = load('assets/team/catalog.js').KiwiTeamCatalog;
assert.ok(roles && roles.opensTill, 'assets/staff-roles.js exposes KiwiRoles.opensTill');
assert.ok(catalog && catalog.CATALOG, 'assets/team/catalog.js exposes the catalogue');

let passed = 0;
const ok = (label, fn) => { fn(); passed++; console.log(`  ✓ ${label}`); };

const values = new Set();
for (const trade of Object.values(catalog.CATALOG)) {
  (trade.functions || []).forEach((v) => values.add(v));
  (trade.departments || []).forEach((v) => values.add(v));
}
Object.keys(catalog.FN_DEPT || {}).forEach((v) => values.add(v));
Object.entries(roles.LABELS).forEach(([id, labelText]) => { values.add(id); values.add(labelText); });
['owner', 'staff', 'admin', 'direction', 'Propriétaire', 'Caisse', 'Manager'].forEach((v) => values.add(v));

ok(`server and browser agree on all ${values.size} job titles, departments and console roles`, () => {
  const disagree = [...values].filter((v) => employeeRoleOpensTill(v) !== roles.opensTill(v))
    .map((v) => `${v} (server ${employeeRoleOpensTill(v)}, browser ${roles.opensTill(v)})`);
  assert.deepEqual(disagree, []);
});

const SELLERS = ['Vendeur conseil', 'Vendeur', 'Caissier', 'Libraire', 'Conseiller', 'Fleuriste',
  'Pharmacien titulaire', 'Pharmacien assistant', 'Réceptionniste', 'Agent de réception', 'Barista',
  'Équipier polyvalent', 'Équipier food truck', 'Manager', 'Propriétaire', 'Vente', 'Caisse', 'Comptoir'];
ok('counter sellers open the till (Vendeur conseil first: the Santos case)', () => {
  for (const r of SELLERS) {
    assert.equal(employeeRoleOpensTill(r), true, `server: ${r}`);
    assert.equal(roles.opensTill(r), true, `browser: ${r}`);
  }
});

const NOT_TILL = ['Serveur', 'Chef de rang', 'Cuisinier', 'Commis', 'Plongeur', 'Magasinier', 'Réassortisseur',
  'Visual merchandiser', 'Coiffeur', 'Masseuse', 'Gouvernante', 'Femme de chambre', 'Livreur',
  'Préparateur en pharmacie', 'Coach sportif', 'Stock', 'Cuisine', 'Salle', 'Plonge', 'Vitrine', 'Inconnu'];
ok('kitchen, floor, stock and back-office titles still open no till', () => {
  for (const r of NOT_TILL) {
    assert.equal(employeeRoleOpensTill(r), false, `server: ${r}`);
    assert.equal(roles.opensTill(r), false, `browser: ${r}`);
  }
});

ok('every trade that sells at a counter has at least one non-manager role that opens the till', () => {
  const missing = Object.entries(catalog.CATALOG)
    .filter(([, t]) => !(t.functions || []).some((f) => !/manager|propri/i.test(f) && employeeRoleOpensTill(f)))
    .map(([k]) => k);
  assert.deepEqual(missing, []);
});

console.log(`\ntill-role-parity: ${passed} passed`);
