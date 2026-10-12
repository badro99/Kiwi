/* Kiwi · la météo du commerce — window.KiwiWeather
 *
 * Lit /api/weather (MET Norway, gratuit, cité) pour la ville de la fiche du
 * commerce, et mesure ce que la pluie fait à SES ventes à partir du carnet que
 * le serveur tient jour après jour.
 *
 *   KiwiWeather.load()            → Promise<données | null>, une lecture par
 *                                    demi-heure et par commerce
 *   KiwiWeather.cached()          → les dernières données lues, ou null
 *   KiwiWeather.rainEffect(rows, log, opts)
 *                                 → { rainDays, dryDays, rainAvg, dryAvg, change }
 *                                    ou null tant que les jours mesurés ne
 *                                    suffisent pas
 *
 * Règles de la mesure :
 *   · un jour de pluie = au moins 1 mm annoncé ce jour-là (ou orage) ; un jour
 *     sec = moins de 0,2 mm. Entre les deux, le jour ne compte pas ;
 *   · seuls comptent les jours où le commerce a encaissé quelque chose (un
 *     jour fermé n'est pas un jour de pluie qui ne vend rien) ;
 *   · il faut au moins MIN_DAYS jours de chaque sorte, et on compare chaque
 *     jour de pluie aux jours secs du MÊME jour de la semaine quand il y en a
 *     (un samedi pluvieux face aux samedis secs), sinon à tous les jours secs ;
 *   · le résultat dit combien de jours il porte. Rien n'est extrapolé.
 *
 * Émet `kiwi:weather` sur window quand de nouvelles données arrivent. */
(function () {
  'use strict';

  var TTL = 30 * 60 * 1000;
  var MIN_DAYS = 5;
  var memo = null, memoAt = 0, memoSlug = '', inflight = null;

  function slug() {
    try { return String(window.KiwiCloudDoc && window.KiwiCloudDoc.currentSlug ? window.KiwiCloudDoc.currentSlug() : ''); }
    catch (_) { return ''; }
  }
  function isReal() {
    try { return !!(window.KiwiEnv && window.KiwiEnv.isReal && window.KiwiEnv.isReal()); }
    catch (_) { return false; }
  }

  function load(opts) {
    var s = slug();
    if (!s || !isReal() || typeof fetch !== 'function') return Promise.resolve(null);
    var force = !!(opts && opts.force);
    if (!force && memo && memoSlug === s && Date.now() - memoAt < TTL) return Promise.resolve(memo);
    if (inflight && memoSlug === s) return inflight;
    memoSlug = s;
    inflight = fetch('/api/weather?merchant=' + encodeURIComponent(s), { credentials: 'same-origin', cache: 'no-store' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .catch(function () { return null; })
      .then(function (data) {
        inflight = null;
        if (slug() !== s) return null;
        memo = data && typeof data === 'object' ? data : null;
        memoAt = Date.now();
        try { window.dispatchEvent(new CustomEvent('kiwi:weather', { detail: memo })); } catch (_) {}
        return memo;
      });
    return inflight;
  }
  function cached() { return memoSlug === slug() ? memo : null; }

  function isRain(w) { return !!w && ((Number(w.precip) || 0) >= 1 || w.kind === 'storm'); }
  function isDry(w) { return !!w && (Number(w.precip) || 0) < 0.2 && w.kind !== 'rain' && w.kind !== 'storm' && w.kind !== 'snow'; }

  function defaultDayOf(ts) {
    try {
      var R = window.KiwiDayReport;
      if (R && R.businessDay) { var d = R.businessDay(ts); if (/^\d{4}-\d{2}-\d{2}$/.test(d)) return d; }
    } catch (_) {}
    var x = new Date(ts - 5 * 3600e3);
    return x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0') + '-' + String(x.getDate()).padStart(2, '0');
  }
  function amountOf(row) {
    if (!row || row.void_ts || row.voided || row.kind === 'refund') return 0;
    var c = row.amountCents != null ? row.amountCents : row.amount_cents;
    if (c != null && isFinite(+c)) return Math.max(0, +c / 100);
    return Math.max(0, Number(row.amount != null ? row.amount : row.total) || 0);
  }
  function weekday(day) { return new Date(day + 'T12:00:00Z').getUTCDay(); }
  function avg(list) { return list.length ? list.reduce(function (s, x) { return s + x; }, 0) / list.length : 0; }

  /* Ce que la pluie a fait aux ventes de CE commerce, sur les jours mesurés. */
  function rainEffect(rows, log, opts) {
    var o = opts || {};
    var dayOf = o.dayOf || defaultDayOf;
    var today = o.today || dayOf(Date.now());
    var min = o.minDays || MIN_DAYS;
    var byDay = Object.create(null);
    (rows || []).forEach(function (row) {
      var ts = Number(row && row.ts) || 0, amt = amountOf(row);
      if (!ts || !(amt > 0)) return;
      var d = dayOf(ts);
      byDay[d] = (byDay[d] || 0) + amt;
    });
    var rain = [], dry = [];
    Object.keys(log || {}).forEach(function (day) {
      if (day >= today || !(byDay[day] > 0)) return;
      var w = log[day];
      if (isRain(w)) rain.push(day);
      else if (isDry(w)) dry.push(day);
    });
    if (rain.length < min || dry.length < min) return null;
    var dryByWeekday = Object.create(null);
    dry.forEach(function (d) { (dryByWeekday[weekday(d)] = dryByWeekday[weekday(d)] || []).push(byDay[d]); });
    var dryAll = dry.map(function (d) { return byDay[d]; });
    var ratios = rain.map(function (d) {
      var same = dryByWeekday[weekday(d)];
      var base = avg(same && same.length ? same : dryAll);
      return base > 0 ? byDay[d] / base : null;
    }).filter(function (x) { return x != null && isFinite(x); });
    if (ratios.length < min) return null;
    return {
      rainDays: rain.length, dryDays: dry.length,
      rainAvg: Math.round(avg(rain.map(function (d) { return byDay[d]; }))),
      dryAvg: Math.round(avg(dryAll)),
      change: Math.round((avg(ratios) - 1) * 100) / 100,
    };
  }

  window.KiwiWeather = { load: load, cached: cached, rainEffect: rainEffect, isRain: isRain, isDry: isDry, MIN_DAYS: MIN_DAYS };
})();
