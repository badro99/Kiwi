#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · Agenda des réservations sur la journée COMMERCIALE (bascule 5 h)
 *
 * CLAUDE.md §5 « Two clocks » : le comptoir groupe sur une journée qui change à
 * 5 h, pas à minuit. L'agenda coupait au minuit civil : à 00 h 30, la table
 * réservée à 22 h 30 (fin 23 h 30) sortait de « Aujourd'hui » alors que le
 * service du soir n'est pas fini, et une réservation à 01 h 00 comptait pour le
 * lendemain.
 * ─────────────────────────────────────────────────────────────────────────── */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../assets/reservations.js', import.meta.url), 'utf8');
const mk = (extra = {}) => {
  const ctx = { console, setTimeout: () => 0, clearTimeout: () => {}, Date, Math, JSON, Intl,
    location: { origin: 'https://kiwi-os.com' }, navigator: {},
    document: { addEventListener() {} }, addEventListener() {}, ...extra };
  ctx.window = ctx; vm.createContext(ctx);
  vm.runInContext(source, ctx, { filename: 'assets/reservations.js' });
  return ctx.KiwiReservations;
};
// Casablanca est à UTC+1 toute l'année depuis 2018 (hors Ramadan, +0) ; on évite
// ce mois et on fixe un jour d'octobre : 2026-10-15 22:30 UTC+1 = 21:30Z.
const at = (ymd, hhmm) => Date.parse(`${ymd}T${hhmm}:00+01:00`);
const R = mk();
assert.equal(typeof R.businessDayBounds, 'function', 'le calcul de bornes est exposé');

// 00:30 le 16 octobre appartient encore à la journée du 15.
let b = R.businessDayBounds(at('2026-10-16', '00:30'));
assert.equal(b.from, at('2026-10-15', '05:00'), 'à 00 h 30 la journée a commencé la veille à 5 h');
assert.equal(b.to, at('2026-10-16', '05:00'), 'et finit à 5 h');
// 04:59 : toujours la veille. 05:00 : nouvelle journée.
assert.equal(R.businessDayBounds(at('2026-10-16', '04:59')).from, at('2026-10-15', '05:00'));
assert.equal(R.businessDayBounds(at('2026-10-16', '05:00')).from, at('2026-10-16', '05:00'));
// Une réservation à 01:00 du 16 est dans la journée du 15, pas celle du 16.
const late = at('2026-10-16', '01:00');
assert.ok(late >= b.from && late < b.to, 'la table de 01 h appartient au service de la veille');
// Une table de 22 h 30 finie à 23 h 30 reste visible à 00 h 30 (endAt >= from).
assert.ok(at('2026-10-15', '23:30') >= b.from, 'le service du soir ne disparaît pas à minuit');

// Quand le rapport du jour est chargé, ses bornes font foi (bascule réglée).
const calls = [];
const R2 = mk({ KiwiDayReport: {
  businessDay: (ts) => { calls.push('bd'); return '2026-10-15'; },
  dayBounds: (d) => { calls.push('db:' + d); return { from: 1000, to: 5000 }; },
} });
b = R2.businessDayBounds(at('2026-10-16', '00:30'));
assert.deepEqual([b.from, b.to], [1000, 5000], 'les bornes du rapport du jour sont utilisées');
assert.deepEqual(calls, ['bd', 'db:2026-10-15']);

// L'agenda lit ces bornes, pas le minuit civil.
assert.ok(/bizDay = businessDayBounds\(now\), today = bizDay\.from, tomorrow = bizDay\.to/.test(source),
  'render() prend aujourd\'hui/demain dans la journée commerciale');
assert.ok(!/today = dayStart\(now\), tomorrow = today \+ 86400000/.test(source), 'l\'ancien minuit civil a disparu');

console.log('reservations-business-day-test: ok');
