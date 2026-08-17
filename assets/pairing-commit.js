/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · POSER UN APPAIRAGE — window.KiwiPairingCommit
 * ---------------------------------------------------------------------------
 * Écrire l'appairage, ce n'est pas écrire quatre clés. C'est aussi CONSTATER
 * que l'appareil change de commerçant, et faire partir ce qui appartenait au
 * précédent. Les quatre écritures sont la partie visible ; la purge est la
 * partie qui protège.
 *
 * POURQUOI CE FICHIER EXISTE. La règle vivait dans applyPairing()
 * (assets/caisse-pairing.js), où elle est née avec la caisse. Mais la caisse
 * n'est pas le seul appareil qui s'appaire : kiwi-cuisine.html a son propre
 * redeem(), qui POSTe sur la même route et écrivait les mêmes quatre clés —
 * sans la détection de changement, sans la purge. Une tablette du passe
 * ré-appairée du restaurant A au restaurant B gardait donc, sous le nom de B,
 * tout l'état local de A : ventes (kiwiSales:*), catalogue, établissements,
 * service en cours. Même origine que la caisse, mêmes clés, aucune serrure.
 *
 * C'est exactement la leçon de assets/tenant-purge.js — « deux portes et une
 * seule serrure » — d'un cran plus haut : là-bas on a partagé la LISTE des
 * clés, ici on partage le GESTE qui les efface. Y ajouter une garde la fait
 * respecter des deux côtés le même jour.
 *
 * Sans transport et sans interface : ce module ne sait ni parler à
 * /api/pair/redeem ni afficher un pavé. Il reçoit un commerce déjà résolu et
 * le pose. C'est ce qui lui permet de vivre sur un écran de cuisine, qui n'a
 * ni pavé PIN, ni dispatcher POS, ni caisse.
 *
 * Dépend de assets/tenant-purge.js (chargé avant) pour la liste des clés.
 * ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  function ls(k) { try { return localStorage.getItem(k); } catch (_) { return null; } }
  function set(k, v) { try { localStorage.setItem(k, v); } catch (_) {} }
  function readMap() { try { return JSON.parse(ls('kiwiPairings') || '{}') || {}; } catch (_) { return {}; } }
  function pairedVenue() { try { return JSON.parse(ls('kiwiPairedVenue') || 'null'); } catch (_) { return null; } }

  /* Les données du locataire partent avec l'appairage ; l'identité matérielle
     reste avec l'appareil physique. KiwiTenantPurge retire à juste titre toute
     clé « kiwi: », donc on préserve explicitement le suffixe de l'appareil POS
     autour de cette purge partagée. */
  function purgeTenantData() {
    var deviceTag = ls('kiwi:posDevice');
    try {
      if (window.KiwiTenantPurge && window.KiwiTenantPurge.purge) window.KiwiTenantPurge.purge();
    } catch (_) {}
    if (deviceTag) set('kiwi:posDevice', deviceTag);
  }

  /* Pose l'appairage. `code` peut être vide (hand-off sans code) ; `d` est la
   * réponse déjà validée du serveur ou l'entrée de la carte locale.
   * opts.onTenantSwitch(was, venue) : ce que CETTE surface doit oublier en plus
   * de la purge partagée — le caissier pour la caisse, la file pour la cuisine.
   * Renvoie { ok, venue, switched } ; `switched` dit si la purge a eu lieu. */
  function commit(code, d, opts) {
    d = d || {};
    opts = opts || {};
    var venue = {
      merchant: d.merchant || '', venueId: d.venueId || '', type: d.type || '',
      subtype: d.subtype || '', name: d.name || '', location: d.location || '',
    };

    /* Ré-appairage vers un AUTRE commerce : ce qui appartenait au précédent n'a
       rien à faire ici. Effacé MAINTENANT, et pas seulement contrôlé au
       rechargement — l'appareil garde son état en mémoire, et le prochain
       autosave le réécrirait estampillé du nouveau commerçant : un blob qui dit
       B en contenant A passe alors tous les contrôles.

       Purge AVANT d'écrire kiwiLiveMerchant : la règle balaye tout ce qui
       commence par « kiwi: » et toute la liste TENANT_KEYS — l'ordre inverse
       effacerait l'appairage qu'on vient de poser. */
    var was = pairedVenue();
    var switched = !!(was && was.merchant && was.merchant !== venue.merchant);
    if (switched) {
      try {
        if (typeof opts.onTenantSwitch === 'function') opts.onTenantSwitch(was, venue);
      } catch (err) {
        if (window.KiwiReportError) window.KiwiReportError(err, 'tenant:pairing_switch_hook_failed');
      }
      /* Le service en cours du comptoir part explicitement en plus de la liste
         partagée : il porte le journal, les additions et les mouvements
         d'espèces, c'est-à-dire l'argent d'un commerce. */
      try { localStorage.removeItem('kiwi-caisse-shift'); } catch (_) {}
      try {
        purgeTenantData();
      } catch (err) {
        if (window.KiwiReportError) window.KiwiReportError(err, 'tenant:caisse_tenant_switch_purge_failed');
      }
    }

    set('kiwiLiveMerchant', venue.merchant);
    set('kiwiLive', '1');
    set('kiwiPaired', '1');
    set('kiwiPairedVenue', JSON.stringify(venue));

    /* Les surfaces peignent le nom du magasin au DOMContentLoaded, soit AVANT
     * que redeem() ait répondu — sur un ré-appairage elles gardaient donc le nom
     * du magasin précédent. On annonce la liaison pour qu'elles repeignent. */
    try { document.dispatchEvent(new CustomEvent('kiwi-paired', { detail: venue })); } catch (_) {}

    /* Reflète « connectée » dans la carte pour que l'onglet du tableau de bord
     * bascule sa pastille (même navigateur). Le hand-off ne porte pas de code :
     * on enregistre alors une ligne contre le magasin lui-même, sans quoi le
     * panneau resterait sur « En attente de la caisse… » à côté d'une caisse qui
     * marche. */
    try {
      var map = readMap();
      var key = code || ('dev:' + venue.merchant);
      map[key] = map[key] || { merchant: venue.merchant, venueId: venue.venueId, type: venue.type,
        subtype: venue.subtype, name: venue.name, location: venue.location, createdAt: Date.now() };
      map[key].status = 'connected';
      map[key].connectedAt = Date.now();
      set('kiwiPairings', JSON.stringify(map));
    } catch (_) {}

    return { ok: true, venue: venue, switched: switched };
  }

  window.KiwiPairingCommit = { commit: commit, purgeTenantData: purgeTenantData };
})();
