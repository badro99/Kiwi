/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · RÉGLAGES DU COMMERÇANT · window.KiwiPolicies
 * ---------------------------------------------------------------------------
 * Deux réglages que le propriétaire pose au bureau et que la caisse lit :
 *   · la fenêtre de retour (0 à 90 jours, 7 par défaut) ;
 *   · la remise B2B du pressing (0 à 50 %, 15 % par défaut), que chaque client
 *     B2B peut surcharger.
 * Ils vivent dans le document `policies` du commerçant (store_docs). Le
 * propriétaire écrit (OWNER_EDIT_FEATURES) ; la caisse appairée lit seulement.
 *
 * La première partie est PURE (ni navigateur, ni base, ni horloge) : le serveur
 * l'importe pour recalculer la fenêtre au remboursement, la caisse et les tests
 * pour calculer la même chose. La seconde, branchée sur KiwiStore, n'existe
 * que dans le navigateur.
 *
 * Argent en centimes entiers. Le pourcentage B2B est tenu en centièmes de
 * pour cent (points de base, entier) : 15 % = 1500, 12,5 % = 1250.
 * ═══════════════════════════════════════════════════════════════════════════ */
(function (/** @type {any} */ root, factory) {
  var api = factory(root);
  if (typeof module === 'object' && module && module.exports) module.exports = api;
  else root.KiwiPolicies = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (/** @type {any} */ root) {
  'use strict';

  var DEFAULT_RETURN_DAYS = 7, MAX_RETURN_DAYS = 90;
  var DEFAULT_B2B_PERCENT = 15, MAX_B2B_PERCENT = 50;
  var DAY = 86400000;

  /* Un entier de 0 à 90. `undefined`, une chaîne vide ou n'importe quoi
     d'illisible rendent le défaut : 0 est une vraie valeur (« aucun retour sans
     responsable »), jamais le résultat d'une saisie absente. */
  function cleanReturnDays(value, fallback) {
    if (value === null || value === undefined || value === '' || typeof value === 'boolean') return fallback === undefined ? DEFAULT_RETURN_DAYS : fallback;
    var n = Number(value);
    if (!isFinite(n)) return fallback === undefined ? DEFAULT_RETURN_DAYS : fallback;
    return Math.max(0, Math.min(MAX_RETURN_DAYS, Math.round(n)));
  }
  /* Un pourcentage de 0 à 50, au centième près. */
  function cleanB2bPercent(value, fallback) {
    if (value === null || value === undefined || value === '' || typeof value === 'boolean') return fallback === undefined ? DEFAULT_B2B_PERCENT : fallback;
    var n = Number(String(value).replace(',', '.'));
    if (!isFinite(n)) return fallback === undefined ? DEFAULT_B2B_PERCENT : fallback;
    return Math.max(0, Math.min(MAX_B2B_PERCENT, Math.round(n * 100) / 100));
  }
  function percentToBps(percent) { return Math.round(cleanB2bPercent(percent) * 100); }

  /* Le taux d'un client : sa surcharge s'il en a une, sinon le réglage du
     commerçant. */
  function b2bPercentFor(customerPercent, merchantPercent) {
    var own = cleanB2bPercent(customerPercent, null);
    return own === null ? cleanB2bPercent(merchantPercent) : own;
  }

  /* La remise B2B d'un sous-total, en centimes. La politique de caisse déclarée
     (docs/specs/trades-money-properties.md TM-P1) : la remise est arrondie au
     dirham entier, UNE fois sur le total, jamais ligne par ligne. Tout est
     entier : cents × bps ne perd pas un centime, et l'arrondi à la moitié
     supérieure ne dépend d'aucune virgule flottante. */
  function b2bDiscountCents(subtotalCents, percent) {
    var cents = Math.max(0, Math.round(Number(subtotalCents) || 0));
    var bps = percentToBps(percent);
    var dirhams = Math.floor((cents * bps + 500000) / 1000000);
    return dirhams * 100;
  }
  /* « Remise B2B −12 % » : le vrai taux, sans zéros inutiles. */
  function percentLabel(percent) {
    var n = cleanB2bPercent(percent);
    return String(n).replace('.', ',');
  }

  /* Nombre de jours d'activité entre deux clés AAAA-MM-JJ. */
  function dayDiff(fromKey, toKey) {
    return Math.round((Date.parse(toKey + 'T00:00:00Z') - Date.parse(fromKey + 'T00:00:00Z')) / DAY);
  }
  /* Une vente est dans la fenêtre quand sa journée d'activité (05:00) est l'une
     des `days` dernières, aujourd'hui compris : c'est le comptage du comptoir
     depuis toujours (« retour sous 7 jours » = aujourd'hui et les six jours
     d'avant). 0 jour : rien n'est dans la fenêtre. Les clés de journée viennent
     de l'appelant (caisse : retDayKey ; serveur : businessDate), la règle est ici. */
  function inReturnWindow(saleDayKey, todayKey, days) {
    var n = cleanReturnDays(days);
    if (!saleDayKey || !todayKey) return true;       /* date inconnue : on ne bloque pas à l'aveugle */
    return dayDiff(saleDayKey, todayKey) < n;
  }

  var pure = {
    DEFAULT_RETURN_DAYS: DEFAULT_RETURN_DAYS, MAX_RETURN_DAYS: MAX_RETURN_DAYS,
    DEFAULT_B2B_PERCENT: DEFAULT_B2B_PERCENT, MAX_B2B_PERCENT: MAX_B2B_PERCENT,
    cleanReturnDays: cleanReturnDays, cleanB2bPercent: cleanB2bPercent, percentToBps: percentToBps,
    b2bPercentFor: b2bPercentFor, b2bDiscountCents: b2bDiscountCents, percentLabel: percentLabel,
    dayDiff: dayDiff, inReturnWindow: inReturnWindow,
  };

  /* ── Navigateur : le document `policies`, lu par la caisse et le tableau de bord ── */
  /* `root` is the browser's window (globalThis) on every page that has KiwiStore. */
  var win = root && root.KiwiStore ? root : null;
  var page = win && win.document;
  if (!win || !win.KiwiStore || typeof win.KiwiStore.define !== 'function') return pure;
  var store = win.KiwiStore.define('policies', {
    blank: function () { return {}; }, cloud: true,
    isEmpty: function (d) { return !d || (d.returnWindowDays === undefined && d.pressingB2bPercent === undefined); },
    merge: function (_local, server) { return server; },
  });
  var venue = function (id) { return id || win.KiwiStore.currentVenue && win.KiwiStore.currentVenue() || null; };
  function doc(id) { return store.get(venue(id)) || {}; }
  function returnWindowDays(id) { return cleanReturnDays(doc(id).returnWindowDays); }
  function pressingB2bPercent(id) { return cleanB2bPercent(doc(id).pressingB2bPercent); }
  /* Écrit un ou deux champs en gardant l'autre : lire d'abord (un navigateur
     neuf n'a pas la révision du serveur), puis enregistrer. Sur une boutique
     de démonstration, le réglage reste local. */
  async function save(patch, id) {
    var target = venue(id);
    if (!target) throw new Error('policies-no-merchant');
    var next = {};
    if (patch && patch.returnWindowDays !== undefined) next.returnWindowDays = cleanReturnDays(patch.returnWindowDays);
    if (patch && patch.pressingB2bPercent !== undefined) next.pressingB2bPercent = cleanB2bPercent(patch.pressingB2bPercent);
    if (!Object.keys(next).length) throw new Error('policies-empty');
    var cloud = store.cloud();
    var real = !!(win.KiwiEnv && win.KiwiEnv.isReal && win.KiwiEnv.isReal());
    if (!cloud || !real) {
      store.set(Object.assign({}, doc(target), next), target);
      return { ok: true, localOnly: true, policies: Object.assign({}, doc(target)) };
    }
    if (target !== (win.KiwiStore.currentVenue && win.KiwiStore.currentVenue())) throw new Error('policies-wrong-merchant');
    await cloud.pull(true);
    var merged = Object.assign({}, doc(target), next);
    store.set(merged, target);
    var result = await cloud.save(merged);
    return Object.assign({}, result, { policies: merged });
  }
  /* La caisse reste ouverte toute la journée : relire le réglage du
     propriétaire quand une décision en dépend, et chaque minute. */
  var last = 0;
  function refresh(force) {
    var cloud = store.cloud();
    if (!cloud || !(win.KiwiEnv && win.KiwiEnv.isReal && win.KiwiEnv.isReal())) return Promise.resolve(false);
    if (!force && Date.now() - last < 15000) return Promise.resolve(false);
    last = Date.now();
    return cloud.pull(false).catch(function () { return false; });
  }
  if (typeof setInterval === 'function' && page) {
    setInterval(function () { if (page.visibilityState === 'visible') refresh(); }, 60000);
  }
  /* Le pressing lit son taux par KiwiPressingOps (déjà chargé avant ce fichier
     sur la caisse et le tableau de bord) : la caisse du pressing n'a ainsi pas
     un global de plus à connaître. */
  function publishToPressing() {
    var ops = win.KiwiPressingOps;
    if (ops && !ops.b2b) ops.b2b = { percent: function () { return pressingB2bPercent(); } };
  }
  publishToPressing();
  if (page && page.addEventListener) page.addEventListener('DOMContentLoaded', publishToPressing);
  return Object.assign({}, pure, {
    returnWindowDays: returnWindowDays, pressingB2bPercent: pressingB2bPercent,
    save: save, refresh: refresh, subscribe: store.subscribe,
  });
});
