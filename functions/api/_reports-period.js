// Les périodes des rapports (functions/api/reports.js).
//
// Une période est une suite de JOURNÉES COMMERCIALES, jamais de jours civils :
// la caisse range une vente de 02:00 dans la journée de la veille (coupure à
// 05:00 par défaut, _business-day.js), le rapport fait de même, sinon les
// chiffres du rapport et ceux du Z ne tombent jamais d'accord (CLAUDE.md §5).
// Le Maroc vit en UTC+0 depuis le 20 septembre 2026 : _zone-law.js corrige un
// ICU resté sur +01, et _business-day.js passe par lui.
//
// La comparaison est toujours « la même chose, juste avant » :
//   · aujourd'hui      → hier, arrêté à la même heure ;
//   · hier, 7 j, 30 j,
//     une plage choisie → les N journées qui précèdent ;
//   · mois dernier     → le mois d'avant ;
//   · trimestre, année → le même nombre de journées au début du trimestre /
//                        de l'année précédents, arrêté à la même heure.
// Une période en cours (elle contient aujourd'hui) est comparée à une période
// arrêtée au même moment de sa dernière journée : comparer un samedi à 15 h à
// un samedi entier fabriquerait une baisse tous les après-midi.
//
// Pur : pas d'horloge, pas de base. L'appelant donne « maintenant ».

import { businessDate, businessBoundary, addBusinessDays } from './_business-day.js';

export const MAX_DAYS = 400;
export const PRESETS = ['aujourdhui', 'hier', 'septJours', 'trenteJours', 'moisDernier', 'trimestre', 'annee', 'personnalise'];
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

export function validDay(day) {
  if (!DAY_RE.test(String(day || ''))) return false;
  const d = new Date(day + 'T00:00:00Z');
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === day;
}
export function spanDays(fromDay, toDay) {
  return Math.round((Date.parse(toDay + 'T00:00:00Z') - Date.parse(fromDay + 'T00:00:00Z')) / 86400000) + 1;
}
function monthStart(day, back) {
  let y = +day.slice(0, 4), m = +day.slice(5, 7) - 1 - back;
  while (m < 0) { m += 12; y--; }
  return y + '-' + String(m + 1).padStart(2, '0') + '-01';
}
function quarterStart(day, back) {
  const m = +day.slice(5, 7) - 1;
  return monthStart(day.slice(0, 5) + String(m - (m % 3) + 1).padStart(2, '0') + '-01', back * 3);
}

/* La période demandée, en journées commerciales de la boutique de référence.
 * `now` en ms ; `zone`/`cutoff` sont ceux de cette boutique.
 * → { preset, fromDay, toDay, days, live, prev: { fromDay, toDay, days }, cutMs }
 *   ou { error } (400). `cutMs` : la part écoulée de la dernière journée quand
 *   la période est en cours, sinon null. */
export function resolvePeriod({ preset, from, to }, now, zone, cutoff) {
  const p = PRESETS.includes(preset) ? preset : (from || to ? 'personnalise' : 'septJours');
  const today = businessDate(now, cutoff, zone);
  const todayStart = businessBoundary(today, cutoff, zone);
  let fromDay, toDay, prevFrom, prevTo;
  if (p === 'aujourdhui') { fromDay = toDay = today; prevFrom = prevTo = addBusinessDays(today, -1); }
  else if (p === 'hier') { fromDay = toDay = addBusinessDays(today, -1); }
  else if (p === 'septJours') { fromDay = addBusinessDays(today, -6); toDay = today; }
  else if (p === 'trenteJours') { fromDay = addBusinessDays(today, -29); toDay = today; }
  else if (p === 'moisDernier') {
    fromDay = monthStart(today, 1); toDay = addBusinessDays(monthStart(today, 0), -1);
    prevFrom = monthStart(today, 2); prevTo = addBusinessDays(fromDay, -1);
  } else if (p === 'trimestre') {
    fromDay = quarterStart(today, 0); toDay = today;
    prevFrom = quarterStart(today, 1); prevTo = addBusinessDays(prevFrom, spanDays(fromDay, toDay) - 1);
  } else if (p === 'annee') {
    fromDay = today.slice(0, 4) + '-01-01'; toDay = today;
    prevFrom = (+today.slice(0, 4) - 1) + '-01-01'; prevTo = addBusinessDays(prevFrom, spanDays(fromDay, toDay) - 1);
  } else {
    if (!validDay(from) || !validDay(to)) return { error: 'range' };
    fromDay = from <= to ? from : to; toDay = from <= to ? to : from;
    if (fromDay > today) return { error: 'future' };
    if (toDay > today) toDay = today;
  }
  const days = spanDays(fromDay, toDay);
  if (days > MAX_DAYS) return { error: 'range-too-long', maxDays: MAX_DAYS };
  if (!prevFrom) { prevTo = addBusinessDays(fromDay, -1); prevFrom = addBusinessDays(fromDay, -days); }
  const live = toDay === today;
  const cutMs = live ? Math.max(0, now - todayStart) : null;
  return { preset: p, fromDay, toDay, days, live, cutMs, today,
    prev: { fromDay: prevFrom, toDay: prevTo, days: spanDays(prevFrom, prevTo) } };
}

/* Les bornes en ms d'une suite de journées pour UNE boutique (son fuseau, sa
 * coupure). Une période en cours s'arrête à `cutMs` dans sa dernière journée. */
export function windowFor(fromDay, toDay, cutMs, zone, cutoff) {
  const from = businessBoundary(fromDay, cutoff, zone);
  const end = businessBoundary(addBusinessDays(toDay, 1), cutoff, zone);
  const to = cutMs == null ? end : Math.min(end, businessBoundary(toDay, cutoff, zone) + cutMs);
  return { from, to: Math.max(from, to) };
}

/* 0 = lundi … 6 = dimanche, le jour de la semaine d'une journée commerciale. */
export function weekdayOf(day) { return (new Date(day + 'T12:00:00Z').getUTCDay() + 6) % 7; }

/* L'heure locale et la journée commerciale d'un début d'heure UTC (les ventes
 * arrivent regroupées par heure UTC, voir _reports-sql.js). Un formateur par
 * fuseau, et un résultat par heure gardé le temps d'une requête : 400 jours de
 * ventes, c'est au plus 9 600 heures, et la plupart sont vides. */
const clocks = new Map();
export function hourClock(zone, cutoff) {
  const key = zone + '|' + cutoff;
  if (clocks.has(key)) return clocks.get(key);
  const seen = new Map();
  const fn = (hourIndex) => {
    if (seen.has(hourIndex)) return seen.get(hourIndex);
    const ts = hourIndex * 3600000;
    const day = businessDate(ts, cutoff, zone);
    /* L'heure locale : l'écart entre le début de la journée commerciale et
       l'instant, plus l'heure de coupure. Juste aussi les jours de changement
       d'heure, puisque la borne est calculée dans le fuseau. */
    const local = (cutoff + Math.floor((ts - businessBoundary(day, cutoff, zone)) / 3600000)) % 24;
    const out = { day, hour: (local + 24) % 24, weekday: weekdayOf(day) };
    if (seen.size < 20000) seen.set(hourIndex, out);
    return out;
  };
  if (clocks.size > 32) clocks.clear();
  clocks.set(key, fn);
  return fn;
}
