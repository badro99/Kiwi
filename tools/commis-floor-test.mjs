#!/usr/bin/env node
/* Kiwi · commis-floor-test · a bar commis opens tables.
 *
 * Browse, 22 November 2026: « l'application serveur ne veut pas ouvrir de
 * tables pour Fatima ». Her team sheet says Commis, department Bar. « Commis »
 * resolved to the kitchen helper, so the waiter app gave her the restricted
 * view and the server refused her the order channels. A commis is a helper
 * whose post is its department: Bar or Salle serves, Cuisine does not.
 *
 * Holds both readers of the rule together: assets/staff-roles.js › isService
 * (the waiter app, assets/serveur-app.js › resolveRole) and
 * functions/auth/_lib.js › employeeWorksFloor (activeServiceEmployee).
 *   node tools/commis-floor-test.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let n = 0, bad = 0;
const ok = (cond, msg, detail) => { if (cond) { n++; console.log('  ✓ ' + msg); } else { bad++; console.log('  ✗ ' + msg + (detail ? ' · ' + detail : '')); } };

const box = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(root, 'assets/staff-roles.js'), 'utf8'), box);
const R = box.window.KiwiRoles;
const { employeeWorksFloor } = await import(pathToFileURL(path.join(root, 'functions/auth/_lib.js')).href);

const cases = [
  ['Commis', 'Bar', true], ['Commis', 'Salle', true], ['commis', 'service', true],
  ['Commis', 'Cuisine', false], ['Commis', '', false], ['Commis', 'Plonge', false],
  ['Serveur', 'Cuisine', true], ['Barman', '', true], ['Cuisinier', 'Bar', false], ['Plongeur', 'Salle', false],
];
console.log('■ the waiter app and the server agree');
for (const [fn, dept, want] of cases) {
  const app = R.isService(fn, dept);
  const srv = employeeWorksFloor(fn, dept);
  ok(app === want && srv === want, `${fn} · ${dept || 'no department'} → ${want ? 'works the floor' : 'restricted view'}`, `app=${app} server=${srv}`);
}
ok(R.isService('Commis') === false, 'a commis with no department stays off the floor, as before');

console.log('■ the call sites pass the department');
const app = fs.readFileSync(path.join(root, 'assets/serveur-app.js'), 'utf8');
ok(/R\.isService\(raw, emp\.department\)/.test(app), 'serveur-app.js · resolveRole reads the employee\'s department');
const lib = fs.readFileSync(path.join(root, 'functions/auth/_lib.js'), 'utf8');
ok(/employeeWorksFloor\(employee\.member\.function, employee\.member\.department\)/.test(lib), '_lib.js · activeServiceEmployee asks employeeWorksFloor');
const emp = fs.readFileSync(path.join(root, 'functions/api/employee.js'), 'utf8');
ok(/department: String\(\(m && m\.department\) \|\| ''\)/.test(emp), 'api/employee.js · the live payload carries the department');

console.log(bad ? `\n✗ ${bad} failed, ${n} passed` : `\n✓ ${n} checks passed`);
process.exit(bad ? 1 : 0);
