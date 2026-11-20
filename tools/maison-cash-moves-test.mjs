#!/usr/bin/env node
/* Caisse maison · mouvements de caisse (sorties et entrées du tiroir).
 *
 * La caisse restaurant note les dépenses payées en liquide (achat fournisseur,
 * technicien, courses) comme des sorties de caisse ; la caisse maison n'en
 * avait aucune, donc une dépense payée dans le tiroir passait pour un écart à
 * la clôture et le rapport du jour envoyait `cashMovements: []`.
 *
 * Ce test tient : les totaux au centime, la forme remise au rapport du jour,
 * l'attendu du rapport (fond + espèces + entrées − sorties), et le câblage de
 * pos-maison.js (bouton, poste qui garde ses mouvements au rechargement, Z,
 * clôture, rapprochement). */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import maisonSource from './pos-maison-test-source.cjs';
import { mzMoves, mzMoveTotals, mzReportMoves } from '../assets/pos-maison/cash-moves.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let passed = 0;
const ok = (v, label) => { assert.ok(v, label); passed++; };
const eq = (a, b, label) => { assert.deepEqual(a, b, label); passed++; };

/* ── les totaux, au centime ── */
const ts = Date.parse('2026-11-20T11:00:00Z');
const shift = { openedAt: ts - 3600000, float: 500, moves: [
  { id: 'a', ts, type: 'out', amount: 0.1, reason: 'Achat fournisseur' },
  { id: 'b', ts: ts + 1, type: 'out', amount: 0.2, reason: 'Taxi' },
  { id: 'c', ts: ts + 2, type: 'in', amount: 100, reason: 'Appoint monnaie' },
  { id: 'd', ts: ts + 3, type: 'out', amount: 0, reason: 'vide' },
  { id: 'e', ts: ts + 4, type: 'weird', amount: 50, reason: 'sens inconnu' },
  null,
] };
eq(mzMoves(shift).map((m) => m.id), ['a', 'b', 'c'], 'a zero amount, an unknown direction and a hole are dropped');
eq(mzMoveTotals(shift), { movesIn: 100, movesOut: 0.3 }, '0.10 + 0.20 sums to exactly 0.30, not 0.30000000000000004');
eq(mzMoveTotals(null), { movesIn: 0, movesOut: 0 }, 'no shift means no movement');
eq(mzMoveTotals({ float: 0 }), { movesIn: 0, movesOut: 0 }, 'a shift saved before this version has no moves array');
eq(mzReportMoves(shift)[0], { ts, type: 'out', amount: 0.1, reason: 'Achat fournisseur' },
  'the report receives ts, direction, amount and reason, nothing else (no staff code, no id)');

/* ── le rapport du jour compte les sorties dans l'attendu du tiroir ── */
const memory = new Map();
const ls = { getItem: (k) => (memory.has(k) ? memory.get(k) : null), setItem: (k, v) => memory.set(k, String(v)), removeItem: (k) => memory.delete(k) };
ls.setItem('kiwiPairedVenue', JSON.stringify({ merchant: 'maison-cash-test', type: 'maison' }));
const ctx = vm.createContext({ window: { localStorage: ls, addEventListener() {} }, localStorage: ls, Date, Math, JSON, RegExp, Array, Object, String, Number });
ctx.window.window = ctx.window;
vm.runInContext(fs.readFileSync(path.join(ROOT, 'assets/day-report.js'), 'utf8'), ctx, { filename: 'assets/day-report.js' });
const DR = ctx.window.KiwiDayReport;
const report = DR.build({
  day: '2026-11-20',
  store: { slug: 'maison-cash-test', name: 'Maison test', type: 'maison' },
  sales: [{ id: 's1', ts: ts + 10, amount: 300, method: 'cash', ref: 's1' }],
  session: { openedAt: shift.openedAt, openingFloat: 500, cashMovements: mzReportMoves(shift), handovers: [], countedCash: 899.7 },
  source: 'caisse',
});
eq(report.cash.movesOut, 0.3, 'the Z carries the cash-outs');
eq(report.cash.movesIn, 100, 'the Z carries the cash-ins');
eq(report.cash.movements.length, 3, 'each movement is listed on the Z');
eq(report.cash.expected, 899.7, 'expected = float 500 + cash 300 + in 100 − out 0.30');
eq(report.cash.ecart, 0, 'a drawer that paid its expenses closes without a gap');

/* ── le câblage de la caisse maison ── */
const RAW = fs.readFileSync(path.join(ROOT, 'assets/pos-maison.js'), 'utf8');
const MAISON = maisonSource(RAW);
ok(/from '\.\/pos-maison\/cash-moves\.js\?v=\d+'/.test(RAW), 'pos-maison imports the module with a stamp');
ok(/id="mz-cash-move"/.test(MAISON) && /\$\('#mz-cash-move', root\)[^;]*;\s*if \(cashMove\) cashMove\.addEventListener\('click', bqOpenCashMove\)/.test(MAISON),
  'a real store has a « Mouvement de caisse » button wired to the sheet');
ok(/IS_DEMO \? '' : '<button class="mz-lock" id="mz-cash-move"/.test(MAISON), 'the demo till has no drawer, so no button');
ok(/moves: Array\.isArray\(s\.moves\) \? s\.moves : \[\]/.test(MAISON), 'a reload keeps the movements of the open shift');
ok(/cashMovements: only === 'delivery' \? \[\] : mzReportMoves\(bqShift\)/.test(MAISON),
  'the store Z carries the movements; the delivery Z has no drawer');
ok(/bqCloExpected = Math\.round\(\(\(bqShift \? bqShift\.float : 0\) \+ t\.cash \+ mv\.movesIn - mv\.movesOut\) \* 100\) \/ 100/.test(MAISON),
  'the closing sheet expects float + cash + in − out, like the Z');
ok(/'Sorties de caisse', '− ' \+ fmtMAD\(mv\.movesOut\)/.test(MAISON), 'the closing sheet shows the cash-outs line');
ok(/bqCashEvent\('movement', \{ movementKind: kind, movementAmountCents: amountCents, movementReason: reason/.test(MAISON),
  'each movement reaches the cash reconciliation like the restaurant till');
ok(/KiwiConfig\.off\('cash-move'\) \|\| window\.KiwiConfig\.off\('cashMove'\)/.test(MAISON), 'the operator can switch it off with the restaurant flag');
const SW = fs.readFileSync(path.join(ROOT, 'kiwi-sw.js'), 'utf8');
const stamp = RAW.match(/pos-maison\/cash-moves\.js\?v=(\d+)/)[1];
ok(SW.includes(`'/assets/pos-maison/cash-moves.js?v=${stamp}'`), 'the service worker precaches the same stamp');

console.log(`✓ maison cash moves · ${passed} checks`);
