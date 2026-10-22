#!/usr/bin/env node
import maisonSource from './pos-maison-test-source.cjs';
/* Maison · la page des retours range les ventes par journée commerciale.
 *
 * « Aujourd'hui » découpait à minuit (new Date().setHours(0)) alors que le
 * reste de la caisse bascule à 05:00 : à 0 h 30, une vente de 23 h quittait
 * « Aujourd'hui » et le banc maison-caisse-browser-test tombait chaque nuit.
 * On extrait les vrais businessDateKey / shiftDateKey de assets/pos-maison.js
 * et on les fait parler à heure fixe, sans KiwiDayReport (le repli) puis avec. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = maisonSource(fs.readFileSync(path.join(ROOT, 'assets/pos-maison.js'), 'utf8'));
const grab = (name) => {
  const at = src.indexOf(`  function ${name}(`);
  assert.ok(at >= 0, `${name} introuvable`);
  return src.slice(at, src.indexOf('\n  }\n', at) + 4);
};
let passed = 0;
const ok = (label, cond) => { assert.ok(cond, label); passed++; console.log(`  ✓ ${label}`); };

function load(dayReport) {
  const ctx = vm.createContext({ window: { KiwiDayReport: dayReport }, Date, String, Number });
  vm.runInContext(`const pad2 = (n) => String(n).padStart(2, '0');\n${grab('businessDateKey')}\n${grab('shiftDateKey')}\nglobalThis.k = businessDateKey; globalThis.s = shiftDateKey;`, ctx);
  return ctx;
}

console.log('■ Maison · retours rangés par journée commerciale');
const c = load(undefined);
const at = (d, h, m) => +new Date(2026, 9, d, h, m);
ok('une vente de 23:00 et 00:30 la nuit suivante tombent le même jour', c.k(at(13, 23, 0)) === c.k(at(14, 0, 30)) && c.k(at(14, 0, 30)) === '2026-10-13');
ok('04:59 appartient encore à la veille, 05:00 au jour même', c.k(at(14, 4, 59)) === '2026-10-13' && c.k(at(14, 5, 0)) === '2026-10-14');
ok('la clé est au format d\'un <input type="date">', /^\d{4}-\d{2}-\d{2}$/.test(c.k(at(2, 12, 0))) && c.k(at(2, 12, 0)) === '2026-10-02');
ok('« Hier » et la borne des sept jours passent les mois et les années', c.s('2026-10-01', -1) === '2026-09-30' && c.s('2026-01-03', -6) === '2025-12-28');
const withReport = load({ businessDay: () => '2026-10-11' });
ok('le rapport journalier, quand il est là, fait foi', withReport.k(at(14, 12, 0)) === '2026-10-11');
const broken = load({ businessDay: () => 'n/a' });
ok('une réponse illisible du rapport retombe sur la bascule de 05:00', broken.k(at(14, 0, 30)) === '2026-10-13');
const used = src.slice(src.indexOf('  function renderEchanges('), src.indexOf('  function renderEchanges(') + 1200);
ok('la page des retours s\'en sert, sans minuit', /businessDateKey/.test(used) && !/setHours\(0, 0, 0, 0\)/.test(used));
console.log(`\nmaison-returns-business-day: ${passed} passed`);
