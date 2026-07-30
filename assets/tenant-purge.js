/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · CE QUI APPARTIENT À UN COMMERÇANT — window.KiwiTenantPurge
 * ---------------------------------------------------------------------------
 * L'état d'un locataire (liste des établissements, codes, appairage, cible du
 * flux, drapeau d'inscription, et chaque magasin par établissement) vit dans
 * des clés localStorage GLOBALES au navigateur. Quand cet appareil passe d'un
 * commerçant à un autre, tout cela doit partir — sinon le nouveau commerçant
 * hérite de l'ancien : des boutiques étrangères dans le sélecteur, les codes
 * d'un autre magasin, ses ventes, son catalogue, ses clientes.
 *
 * POURQUOI CE FICHIER EXISTE. La règle vivait dans assets/identity.js, qui la
 * déclenche quand un AUTRE COMPTE se connecte. Mais un appareil change aussi de
 * commerçant SANS qu'aucun compte ne se connecte : une caisse se ré-appaire
 * (assets/caisse-pairing.js), et identity.js n'est même pas chargé sur
 * kiwi-caisse.html. Il y avait donc deux portes et une seule serrure — et par
 * la seconde, la caisse d'un client s'est retrouvée à afficher les ventes d'un
 * autre commerce dans « Échanges & avoirs » et dans « Réimprimer ».
 *
 * La règle est ici, une fois, pour que les deux portes ferment pareil. Y
 * ajouter une clé la fait respecter des deux côtés le même jour.
 * ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var TENANT_KEYS = [
    'kiwiCustomVenues', 'kiwiVenue', 'kiwiVenueCount', 'kiwiOnboarded', 'kiwiSkipOnboard',
    'kiwiOwnerName', 'kiwiBizName', 'kiwiBizType', 'kiwiCity', 'kiwiTeamSize', 'kiwiGoals',
    'kiwiPins', 'kiwiLiveMerchant', 'kiwiLive', 'kiwiPaired', 'kiwiPairedVenue', 'kiwiPairings',
    'kiwiBizExtra', 'kiwiTeamV2:custom', 'kiwiSet:ownerName', 'kiwiSet:ownerEmail',
    'kiwiOwnerEmail', 'kiwiRole',
    /* Le service en cours du comptoir. Il porte le journal, les additions, les
       bons cuisine et les mouvements d'espèces — c'est-à-dire l'argent d'un
       commerce, qu'une caisse ré-appairée pousserait sous le nom de l'autre. */
    'kiwi-caisse-shift', 'kiwiTillStaff',
  ];
  // Toute clé commençant par l'un de ces préfixes est de la donnée par
  // établissement → elle part au changement de commerçant.
  var TENANT_PREFIXES = ['kiwi:', 'kiwiSales:', 'kiwiBoutiqueCatalog:', 'kiwiLiveIngested:',
    'kiwiBarcodeSeq:', 'kiwiSet:biz:'];
  // Chrome de l'appareil / préférences d'affichage : ce n'est PAS la donnée d'un
  // commerçant, et ça doit survivre au changement.
  var PRESERVE = {
    kiwiAccountKey: 1, kiwiLang: 1, kiwiCaisseLang: 1, kiwiTheme: 1, kiwiMode: 1,
    kiwiDesign2026: 1,
    /* kiwiDateRange n'est délibérément PAS préservé. C'est une vue sur les
       données d'UN locataire, pas une préférence d'appareil : la transporter
       posait une boutique toute neuve sur « Hier », affichant ENCAISSÉ HIER
       0,00 MAD juste au-dessus d'une vente de 450 MAD bien réelle. */
    kiwiDesignIOS27: 1, kiwiRamadan: 1, kiwiRevCompare: 1,
    kiwiHeroView: 1, kiwiKpiLayout: 1, kiwiGlassLevel: 1, cafeAtlasLang: 1, kiwiDemos: 1,
    kiwiPrinterCfg: 1,   /* l'imprimante est branchée à ce comptoir, pas au commerçant */
  };

  function purge() {
    try {
      TENANT_KEYS.forEach(function (k) { try { localStorage.removeItem(k); } catch (_) {} });
      var kill = [];
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (!k || PRESERVE[k]) continue;
        for (var p = 0; p < TENANT_PREFIXES.length; p++) {
          if (k.indexOf(TENANT_PREFIXES[p]) === 0) { kill.push(k); break; }
        }
      }
      kill.forEach(function (k) { try { localStorage.removeItem(k); } catch (_) {} });
      return kill.length + TENANT_KEYS.length;
    } catch (_) { return 0; }
  }

  window.KiwiTenantPurge = {
    purge: purge,
    keys: TENANT_KEYS.slice(),
    prefixes: TENANT_PREFIXES.slice(),
    preserve: PRESERVE,
  };
})();
