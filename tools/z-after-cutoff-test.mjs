// Le Z d'une caisse restée ouverte la nuit (audit du 26 nov. 2026).
//
// Service ouvert le soir (fond 500), 2 700 d'espèces, 300 par carte, une sortie
// de 200. Fermé à 2 h : Z du 20, écart 0. Fermé à 7 h 20, tablette restée
// allumée : le Z partait sur la journée du 21, vide, attendu 500 pour 3 000
// comptés, et un écart de + 2 500 qui n'existait pas. Le Z suit maintenant la
// journée de la dernière activité du service (vente ou mouvement de caisse).
// Vrais assets/day-report.js et assets/caisse-accounting/closing.js.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const mem = new Map();
const ls = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
ls.setItem('kiwiPairedVenue', JSON.stringify({ merchant: 'resto-test', name: 'Resto', type: 'restaurant' }));
let NOW = 0;
const ctx = vm.createContext({ window: { localStorage: ls, addEventListener() {}, KiwiLive: { now: () => NOW } }, localStorage: ls, Date, Math, JSON, RegExp, Array, Object, String, Number, Intl, console });
ctx.window.window = ctx.window;
vm.runInContext(fs.readFileSync(path.join(ROOT, 'assets/day-report.js'), 'utf8'), ctx);
const clo = fs.readFileSync(path.join(ROOT, 'assets/caisse-accounting/closing.js'), 'utf8');
const grab = (name) => { const i = clo.indexOf('    function ' + name + '('); assert.ok(i > 0, name); let d = 0; for (let k = clo.indexOf('{', i); k < clo.length; k++) { if (clo[k] === '{') d++; if (clo[k] === '}') { d--; if (!d) return clo.slice(i, k + 1); } } };
const T = Date.parse;
let checks = 0;
const ok = (v, m, d) => { assert.ok(v, m + (d ? ' · ' + d : '')); checks += 1; };

function till(journal, cashMovements, openedAt) {
  return new Function('journal', 'cashMovements', 'shiftOpenedAt', 'window', 'isReportableJournalEntry', 'dayReportSession', 'storeName', 'storeCity', 'storePaired', 'currentCashier',
    grab('currentBusinessDay') + '\n' + grab('buildDayReport') + '\nreturn buildDayReport;')(journal, cashMovements, new Date(openedAt), ctx.window, (e) => !e.voided,
    (counted) => ({ sessionId: 'cs1', terminalId: 't1', openedAt, openingFloat: 500, cashMovements, handovers: [], discounts: 0, discountsCount: 0, cancels: 0, countedCash: counted }),
    () => 'Resto', () => 'Tanger', () => ({ type: 'restaurant' }), { name: 'Sara' });
}
const evening = [
  { id: 's1', time: new Date(T('2026-11-20T21:00:00Z')), amount: 1200, method: 'cash', label: 'Table 1', ref: '1', tip: 0 },
  { id: 's2', time: new Date(T('2026-11-20T23:30:00Z')), amount: 1500, method: 'cash', label: 'Table 2', ref: '2', tip: 0 },
  { id: 's3', time: new Date(T('2026-11-21T01:10:00Z')), amount: 300, method: 'card', label: 'Table 3', ref: '3', tip: 0 },
];
const out = [{ id: 'cm1', time: new Date(T('2026-11-20T22:00:00Z')), type: 'out', amount: 200, reason: 'Pain' }];
{
  const build = till(evening, out, T('2026-11-20T18:00:00Z'));
  NOW = T('2026-11-21T02:00:00Z');
  const night = build(3000, NOW);
  ok(night.day === '2026-11-20' && night.cash.ecart === 0, 'closed at 02:00: Z of the 20th, no gap', JSON.stringify({ day: night.day, ecart: night.cash.ecart }));
  NOW = T('2026-11-21T07:20:00Z');
  const morning = build(3000, NOW);
  ok(morning.day === '2026-11-20', 'closed at 07:20 with the tablet left on: still the Z of the 20th', morning.day);
  ok(morning.gross === 3000 && morning.cash.expected === 3000 && morning.cash.ecart === 0, 'its sales, expected cash and no invented gap',
    JSON.stringify({ gross: morning.gross, expected: morning.cash.expected, ecart: morning.cash.ecart }));
}
{
  // Un service qui passe la bascule en vendant reste sur la journée de MAINTENANT (le cas 4 h 56 → 5 h 02).
  const build = till([{ id: 'a', time: new Date(T('2026-11-21T05:01:00Z')), amount: 50, method: 'cash', label: 'T', ref: 'a', tip: 0 }], [], T('2026-11-21T03:56:00Z'));
  NOW = T('2026-11-21T05:02:00Z');
  ok(build(550, NOW).day === '2026-11-21', 'a sale after the cutoff keeps the Z on the new day');
}
{
  // Rien vendu : le Z de l'ouverture.
  const build = till([], [], T('2026-11-20T18:00:00Z'));
  NOW = T('2026-11-21T07:20:00Z');
  ok(build(500, NOW).day === '2026-11-20', 'an idle service closes on the day it opened');
}
console.log(`✓ z-after-cutoff-test : ${checks} contrôles (une caisse fermée après la bascule garde le Z de son service)`);
