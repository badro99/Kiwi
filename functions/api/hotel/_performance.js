import { dateOK, problem } from './_commercial.js';
import { roomArray } from './_rooms.js';

/* ═══════════════════════════════════════════════════════════════════════════
 * Performance d'un hôtel sur une plage de nuits : occupation, ADR, RevPAR,
 * arrivées et départs.
 *
 * POURQUOI CE FICHIER EXISTE. La bande du tableau de bord d'un vrai hôtel
 * affichait « Taux d'occupation 0,0 % · ADR 0 MAD · RevPAR 0 MAD · 0 / 0 »
 * codés en dur dans dateRange.js, quoi que contienne le registre des séjours :
 * deux chambres vendues sur huit se lisaient « 0 % ». Rien n'était calculé. Le
 * même vide se retrouvait dans « Tarifs & occupation » (« ADR, RevPAR … s'activent
 * ici ») et dans « Intelligence hôtel », qui lisait un état de chambre que
 * personne ne repasse en « occupée ».
 *
 * DÉFINITIONS (une seule fois, ici, pour que tout l'écran s'accorde) :
 *   · nuitée vendue : une chambre réservée pour une nuit : séjours confirmés, en
 *     maison et terminés, comme la Production mensuelle. Annulations, no-shows
 *     et demandes sont exclus ; la nuit du départ aussi ; le day-use n'a pas de
 *     nuitée. Une réservation sans chambre attribuée compte quand même : elle
 *     est vendue.
 *   · nuitées disponibles : chambres actives × nuits de la plage. Une chambre
 *     hors-service reste dans l'inventaire (rien n'historise sa panne) ; son
 *     nombre est rendu à part pour que l'écran puisse le dire.
 *   · revenu : le total TTC du séjour (logement + formule) réparti également sur
 *     ses nuits. Un séjour à 0 MAD (offert, ou jamais chiffré) n'est PAS un
 *     tarif nul : il sort du calcul d'ADR et ses nuits sont comptées à part
 *     (`unpricedNights`), parce qu'un prix moyen tiré vers le bas par des nuits
 *     que personne n'a chiffrées serait une mesure fausse.
 *   · ADR = revenu / nuitées chiffrées. RevPAR = revenu / nuitées disponibles.
 *   · arrivées / départs : séjours dont la date d'arrivée / de départ tombe dans
 *     la plage, quel que soit leur état (une arrivée attendue compte).
 *
 * Ce que l'on ne sait pas se rend `null`, jamais 0 : sans chambre déclarée,
 * l'occupation n'existe pas ; sans nuit chiffrée, l'ADR non plus. */

export const SOLD = Object.freeze(['confirmed', 'checked_in', 'completed']);
export const MAX_DAYS = 400;

const DAY_MS = 86400000;
const ymdMs = (ymd) => Date.parse(ymd + 'T00:00:00Z');
const addDays = (ymd, n) => new Date(ymdMs(ymd) + n * DAY_MS).toISOString().slice(0, 10);

export function performanceWindow(from, to) {
  if (!dateOK(from) || !dateOK(to) || to < from) problem('bad-range');
  const days = Math.round((ymdMs(to) - ymdMs(from)) / DAY_MS) + 1;
  if (days > MAX_DAYS) problem('range-too-long');
  return { from, to, days, end: addDays(to, 1) };
}

/** Chambres actives du document `rooms` : total et hors-service. `null` si le
 *  document n'existe pas ou est illisible, ce qui n'est pas « zéro chambre ». */
export function roomInventory(rawDoc) {
  if (!rawDoc) return null;
  let doc;
  try { doc = typeof rawDoc === 'string' ? JSON.parse(rawDoc) : rawDoc; } catch (_) { return null; }
  const rooms = roomArray(doc);
  if (!rooms) return null;
  const active = rooms.filter((r) => r && !r.deletedAt);
  return { total: active.length, outOfService: active.filter((r) => r.status === 'hs').length };
}

const round = (n, d) => { const k = 10 ** d; return Math.round(n * k) / k; };

export function hotelPerformance(rows, window, inventory) {
  const perDay = Array.from({ length: window.days }, (_, i) => ({ date: addDays(window.from, i), nights: 0, revenue: 0, pricedNights: 0 }));
  let nights = 0, revenue = 0, pricedNights = 0, arrivals = 0, departures = 0;
  const seen = new Set();
  for (const r of rows) {
    if (!SOLD.includes(r.status)) continue;
    if (!r.id || seen.has(r.id) || !dateOK(r.check_in) || !dateOK(r.check_out)) problem('performance-data-invalid');
    seen.add(r.id);
    let raw = {};
    try { raw = JSON.parse(r.raw_json || '{}') || {}; } catch (_) { problem('performance-data-invalid'); }
    if (raw.hotel?.dayUse === true || r.check_in === r.check_out) continue;
    if (r.check_out < r.check_in) problem('performance-data-invalid');
    if (r.check_in >= window.from && r.check_in <= window.to) arrivals++;
    if (r.check_out >= window.from && r.check_out <= window.to) departures++;
    const stayNights = Math.round((ymdMs(r.check_out) - ymdMs(r.check_in)) / DAY_MS);
    const total = Number(r.total) || 0;
    const priced = total > 0;
    const perNight = priced ? total / stayNights : 0;
    const a = r.check_in > window.from ? r.check_in : window.from;
    const b = r.check_out < window.end ? r.check_out : window.end;
    for (let d = a, i = Math.round((ymdMs(a) - ymdMs(window.from)) / DAY_MS); d < b; d = addDays(d, 1), i++) {
      perDay[i].nights++; nights++;
      if (priced) { perDay[i].revenue += perNight; perDay[i].pricedNights++; revenue += perNight; pricedNights++; }
    }
  }
  const total = inventory ? inventory.total : 0;
  const availableNights = total * window.days;
  return {
    from: window.from, to: window.to, days: window.days,
    rooms: inventory ? { total: inventory.total, outOfService: inventory.outOfService } : null,
    availableNights, nights, pricedNights, unpricedNights: nights - pricedNights,
    revenue: round(revenue, 2),
    occupancyPct: availableNights > 0 ? round(nights / availableNights * 100, 1) : null,
    adr: pricedNights > 0 ? round(revenue / pricedNights, 2) : null,
    /* Aucune nuit vendue : le revenu est réellement 0, le RevPAR aussi. Des nuits
     * vendues mais toutes sans prix : on ne sait pas, donc ni 0 ni un chiffre. */
    revpar: availableNights > 0 && !(nights > 0 && pricedNights === 0) ? round(revenue / availableNights, 2) : null,
    arrivals, departures,
    perDay: perDay.map((d) => ({ date: d.date, nights: d.nights, revenue: round(d.revenue, 2) })),
  };
}
