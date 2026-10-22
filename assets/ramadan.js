/* Kiwi · Ramadan, mesuré sur les ventes du commerce.
 *
 * Kiwi IQ répondait toujours « je n'ai pas d'historique de Ramadan pour votre
 * établissement », même quand le registre couvrait le Ramadan précédent. Ce
 * module date chaque Ramadan avec le calendrier hégirien du navigateur
 * (Intl, Umm al-Qura : gratuit, hors ligne, aucun service tiers) et, quand
 * les ventes couvrent un Ramadan ET les quatre semaines d'avant, compare :
 *
 *   · la journée moyenne pendant Ramadan et pendant les 28 jours d'avant
 *     (moyenne des journées où quelque chose a été encaissé, avec le nombre
 *     de ces journées, pour qu'une fermeture se voie au lieu de se diluer) ;
 *   · la part du chiffre encaissée le soir (18 h → fin de journée commerciale) ;
 *   · le jour de l'Aïd al-Fitr.
 *
 * Règles :
 *   · un Ramadan n'est lu que COMPLET (du 1er au 29/30 du mois) et terminé ;
 *   · chaque fenêtre doit avoir des ventes sur au moins la moitié de ses
 *     jours, sinon le commerce n'était peut-être pas encore sur Kiwi : on ne
 *     dit rien ;
 *   · les dates sont celles du calendrier Umm al-Qura ; l'observation
 *     marocaine peut décaler d'un jour, et la réponse le dit ;
 *   · journée commerciale (KiwiDayReport, bascule à 5 h), comme le rapport Z.
 *
 * window.KiwiRamadan = { supported, periods, next, effect }. */
(function () {
  'use strict';

  const DAY = 864e5;
  let fmt = null;
  try {
    fmt = new (globalThis.KiwiZoneLaw?.DateTimeFormat || Intl.DateTimeFormat)('en-u-ca-islamic-umalqura', { timeZone: 'UTC', year: 'numeric', month: 'numeric', day: 'numeric' });
    if (fmt.resolvedOptions().calendar !== 'islamic-umalqura') fmt = null;
  } catch (_) { fmt = null; }

  const iso = (ms) => new Date(ms).toISOString().slice(0, 10);
  const at = (day) => Date.parse(day + 'T12:00:00Z');
  const addDays = (day, n) => iso(at(day) + n * DAY);
  function hijri(day) {
    const parts = fmt.formatToParts(new Date(at(day)));
    const get = (t) => +((parts.find((p) => p.type === t) || {}).value);
    return { y: get('year'), m: get('month'), d: get('day') };
  }

  /* Les Ramadans complets qui touchent [fromDay, toDay]. */
  function periods(fromDay, toDay) {
    if (!fmt || !fromDay || !toDay) return [];
    const out = [];
    let cur = null;
    for (let d = addDays(fromDay, -32); d <= addDays(toDay, 32); d = addDays(d, 1)) {
      const h = hijri(d);
      if (h.m === 9) {
        if (!cur) cur = { hijriYear: h.y, start: d, end: d, complete: h.d === 1 };
        else cur.end = d;
      } else if (cur) {
        if (cur.complete) out.push({ hijriYear: cur.hijriYear, start: cur.start, end: cur.end, eid: d, days: Math.round((at(cur.end) - at(cur.start)) / DAY) + 1 });
        cur = null;
      }
    }
    return out.filter((p) => p.end >= fromDay && p.start <= toDay);
  }

  /* Le prochain Ramadan qui commence après `today` (ou celui en cours). */
  function next(today) {
    const list = periods(today, addDays(today, 400));
    return list.find((p) => p.end >= today) || null;
  }

  function defaultDayOf(ts) {
    try {
      const R = window.KiwiDayReport;
      if (R && R.businessDay) { const d = R.businessDay(ts); if (/^\d{4}-\d{2}-\d{2}$/.test(d)) return d; }
    } catch (_) {}
    return casablanca(ts - 5 * 3600e3).day;
  }
  function casablanca(ts) {
    const p = new (globalThis.KiwiZoneLaw?.DateTimeFormat || Intl.DateTimeFormat)('en-CA', { timeZone: 'Africa/Casablanca', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(ts));
    const g = (t) => (p.find((x) => x.type === t) || {}).value;
    return { day: `${g('year')}-${g('month')}-${g('day')}`, hour: +g('hour') };
  }
  const defaultHourOf = (ts) => casablanca(ts).hour;
  const amountOf = (e) => {
    const c = e && (e.amountCents != null ? e.amountCents : e.amount_cents);
    if (c != null && isFinite(+c)) return +c / 100;
    return +((e && (e.amount != null ? e.amount : e.total)) || 0) || 0;
  };

  const BEFORE_DAYS = 28;
  const EVENING_FROM = 18;
  /* L'effet du dernier Ramadan que les ventes couvrent entièrement. */
  function effect(sales, opts) {
    const o = opts || {};
    const dayOf = o.dayOf || defaultDayOf, hourOf = o.hourOf || defaultHourOf;
    const minShare = o.minDayShare == null ? 0.5 : o.minDayShare;
    const byDay = new Map();
    let first = null, last = null;
    (sales || []).forEach((e) => {
      if (!e || e.void_ts || e.voided || e.kind === 'refund') return;
      const ts = +e.ts || 0, amt = amountOf(e);
      if (!ts || !(amt > 0)) return;
      const day = dayOf(ts), h = hourOf(ts);
      const row = byDay.get(day) || { rev: 0, evening: 0, n: 0 };
      row.rev += amt; row.n++;
      if (h >= EVENING_FROM || h < 5) row.evening += amt;
      byDay.set(day, row);
      if (!first || day < first) first = day;
      if (!last || day > last) last = day;
    });
    if (!first) return null;
    const today = o.today || dayOf(Date.now());
    const candidates = periods(first, last).filter((p) => p.end < today && addDays(p.start, -BEFORE_DAYS) >= first && p.end <= last).reverse();
    for (const p of candidates) {
      const win = (from, n) => {
        let rev = 0, evening = 0, open = 0;
        for (let i = 0; i < n; i++) { const r = byDay.get(addDays(from, i)); if (r) { rev += r.rev; evening += r.evening; open++; } }
        return { days: n, openDays: open, revenue: rev, avg: open ? rev / open : 0, eveningShare: rev > 0 ? evening / rev : null };
      };
      const during = win(p.start, p.days), before = win(addDays(p.start, -BEFORE_DAYS), BEFORE_DAYS);
      if (during.openDays < Math.ceil(p.days * minShare) || before.openDays < Math.ceil(BEFORE_DAYS * minShare) || !(before.avg > 0)) continue;
      const eidRow = p.eid <= last ? byDay.get(p.eid) : undefined;
      return {
        hijriYear: p.hijriYear, start: p.start, end: p.end, days: p.days,
        during, before,
        change: (during.avg - before.avg) / before.avg,
        eid: p.eid <= last ? { day: p.eid, revenue: eidRow ? eidRow.rev : 0, open: !!eidRow } : null,
        calendar: 'islamic-umalqura',
      };
    }
    return null;
  }

  window.KiwiRamadan = { supported: !!fmt, periods, next, effect, addDays };
})();
