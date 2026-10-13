/* Kiwi · business-day.js , la journée commerciale d'un magasin, côté client.
 *
 * Direction 2027, §17.1 : une seule règle pour dire « quel jour est ce
 * moment ? », la même que celle du serveur. Ce fichier est la copie cliente
 * de functions/api/_business-day.js, fonction pour fonction :
 *
 *   businessDate(ts, cutoff, zone)   → 'YYYY-MM-DD'  (l'heure civile du magasin
 *                                       moins un jour avant l'heure de bascule)
 *   businessBoundary(day, cutoff, zone) → ms        (l'instant où ce jour commence)
 *   businessDayStart / businessDayWindows / addBusinessDays / validZone
 *
 * LA JOURNÉE DE 5 HEURES. Le comptoir groupe les ventes sur une journée qui
 * commence à 05:00 et non à minuit (CLAUDE.md §5, « Two clocks »). Une vente à
 * 00:30 appartient à la veille. Tout ce qui dit « aujourd'hui » doit employer
 * cette frontière, sinon la caisse et le tableau de bord se contredisent.
 * L'implémentation livrée côté navigateur est KiwiDayReport.businessDay
 * (assets/day-report.js) : même arithmétique (heure civile dans la zone du
 * magasin, jamais celle de l'appareil ; veille si l'heure < bascule), mêmes
 * bornes par itération sur l'heure civile (journées de 23 h et de 25 h comprises).
 *
 * LES VALEURS PAR DÉFAUT VIVENT ICI, ET NULLE PART AILLEURS côté client :
 * DEFAULT_CUTOFF = 5 et DEFAULT_ZONE = 'Africa/Casablanca', ce que le serveur
 * applique quand un magasin n'a pas de ligne merchant_config
 * (merchantCutoff() / merchantZone()). `business-day-default-test` échoue si
 * les deux côtés divergent.
 *
 * resolve(config) donne { cutoff, zone } pour une réponse de /api/config :
 *   1. le bloc `businessDay` que la route renvoie depuis l'étape 1 (valeurs
 *      déjà résolues par le serveur) ;
 *   2. sinon, pour un déploiement plus ancien, `businessCutoff` et `timezone`
 *      bruts (null et '' quand le magasin n'a rien publié), complétés par les
 *      défauts ci-dessus.
 *
 * Aucun état, aucune écriture, aucun réseau. Chargé par rien pour l'instant. */
(function (root) {
  'use strict';

  var DAY = 86400000;
  var DEFAULT_CUTOFF = 5;
  var DEFAULT_ZONE = 'Africa/Casablanca';

  /* Un nom de zone IANA plausible ET connu de ce navigateur, sinon ''. */
  function validZone(zone) {
    var z = String(zone == null ? '' : zone).trim();
    if (!z || z.length > 64 || !/^[A-Za-z_]+(?:\/[A-Za-z0-9_+-]+){0,2}$|^UTC$/.test(z)) return '';
    try { new Intl.DateTimeFormat('en-GB', { timeZone: z }).format(0); return z; } catch (_) { return ''; }
  }
  /* Une heure de bascule : un entier de 0 à 12, sinon -1. */
  function validCutoff(value) {
    return typeof value === 'number' && isFinite(value) && Math.floor(value) === value && value >= 0 && value <= 12 ? value : -1;
  }

  var clocks = {};
  function clock(zone) {
    var z = validZone(zone) || DEFAULT_ZONE;
    if (!clocks[z]) {
      clocks[z] = new Intl.DateTimeFormat('en-GB', {
        timeZone: z, year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
      });
    }
    return clocks[z];
  }
  function parts(epoch, zone) {
    var out = {};
    clock(zone).formatToParts(epoch).forEach(function (p) { out[p.type] = p.value; });
    return out;
  }

  function addBusinessDays(day, days) {
    return new Date(Date.parse(day + 'T00:00:00Z') + days * DAY).toISOString().slice(0, 10);
  }
  function businessDate(epoch, cutoff, zone) {
    if (cutoff === undefined) cutoff = DEFAULT_CUTOFF;
    if (zone === undefined) zone = DEFAULT_ZONE;
    var p = parts(epoch, zone);
    var day = p.year + '-' + p.month + '-' + p.day;
    return Number(p.hour) < cutoff ? addBusinessDays(day, -1) : day;
  }
  function businessBoundary(day, cutoff, zone) {
    if (cutoff === undefined) cutoff = DEFAULT_CUTOFF;
    if (zone === undefined) zone = DEFAULT_ZONE;
    var target = Date.parse(day + 'T00:00:00Z') + cutoff * 3600000;
    var guess = target;
    for (var i = 0; i < 4; i++) {
      var p = parts(guess, zone);
      var observed = Date.parse(p.year + '-' + p.month + '-' + p.day + 'T' + p.hour + ':' + p.minute + ':' + p.second + 'Z');
      if (observed === target) return guess;
      guess += target - observed;
    }
    return guess;
  }
  function businessDayStart(epoch, cutoff, zone) {
    return businessBoundary(businessDate(epoch, cutoff, zone), cutoff, zone);
  }
  function businessDayWindows(epoch, count, cutoff, zone) {
    if (count === undefined) count = 30;
    var today = businessDate(epoch, cutoff, zone);
    var out = [];
    for (var i = 0; i < count; i++) {
      var d = addBusinessDays(today, i - count + 1);
      out.push({ d: d, from: businessBoundary(d, cutoff, zone), to: businessBoundary(addBusinessDays(d, 1), cutoff, zone) });
    }
    return out;
  }

  /* { cutoff, zone, cutoffIsDefault, zoneIsDefault } pour une réponse de
   * /api/config. Une valeur absente ou invalide devient le défaut, jamais NaN
   * ni l'heure de l'appareil. */
  function resolve(config) {
    var c = config && typeof config === 'object' ? config : {};
    var b = c.businessDay && typeof c.businessDay === 'object' ? c.businessDay : null;
    var cutoff = validCutoff(b ? b.cutoff : c.businessCutoff);
    var zone = validZone(b ? b.zone : c.timezone);
    if (b) {                                    /* un bloc incomplet retombe sur les champs bruts */
      if (cutoff < 0) cutoff = validCutoff(c.businessCutoff);
      if (!zone) zone = validZone(c.timezone);
    }
    return {
      cutoff: cutoff < 0 ? DEFAULT_CUTOFF : cutoff,
      zone: zone || DEFAULT_ZONE,
      cutoffIsDefault: cutoff < 0,
      zoneIsDefault: !zone
    };
  }

  var api = {
    DEFAULT_CUTOFF: DEFAULT_CUTOFF,
    DEFAULT_ZONE: DEFAULT_ZONE,
    validZone: validZone,
    validCutoff: function (v) { return validCutoff(v) >= 0; },
    resolve: resolve,
    addBusinessDays: addBusinessDays,
    businessDate: businessDate,
    businessBoundary: businessBoundary,
    businessDayStart: businessDayStart,
    businessDayWindows: businessDayWindows
  };

  if (typeof module === 'object' && module && module.exports) module.exports = api;
  if (root) root.KiwiBusinessDay = api;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
