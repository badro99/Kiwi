/* Kiwi · shared service worker for both installable apps (owner "Kiwi" and
 * "Kiwi Caisse"). Served from the repo root so its scope is "/", which is the
 * only way two root-level app pages both load offline: one SW owns the scope
 * and serves whichever shell the navigation asks for.
 *
 * Update strategy · split by request type:
 *  • NAVIGATIONS (HTML documents) are NETWORK-FIRST: always fetch the live page,
 *    fall back to the cached shell only when the network fails. A cached HTML doc
 *    must never be replayed to a navigation while online · a redirected/opaque
 *    cached response is rejected by the browser and hard-fails the page
 *    (ERR_FAILED). Documents change on deploy anyway, so fresh is also correct.
 *  • ASSETS (JS, CSS, images, fonts, icons, manifests) are STALE-WHILE-REVALIDATE:
 *    served from cache instantly (fast + offline), refreshed in the background so
 *    a deploy still lands on the next load with no manual refresh.
 * The worker skipWaiting()s so a new version takes over promptly instead of
 * waiting for every tab to close; it does NOT force a reload, so a caisse sale in
 * progress is never interrupted · fresh assets are simply served on the next load. */
'use strict';
var CACHE = 'kiwi-app-v482';
var SHELL = [
  '/dashboard.html',
  '/kiwi-caisse.html',
  /* SANS le .html. Pages sert /kiwi-serveur.html en 308 vers /kiwi-serveur :
     c.add() sur une réponse redirigée jette, la salle n'entrait donc JAMAIS
     dans la coquille · en silence, puisque install() avale l'échec. Et c'est
     bien /kiwi-serveur que l'application ouvre partout ailleurs. */
  '/kiwi-serveur',
  /* L'écran cuisine. Dans la coquille hors-ligne parce qu'une cuisine est
     l'endroit du commerce où le wifi est le plus mauvais · mur porteur, four,
     sous-sol. La tablette doit au minimum se rouvrir sur son dernier tableau
     quand le réseau tousse, au lieu d'une page blanche au milieu du service. */
  '/kiwi-cuisine.html',
  '/assets/err-reporter.js',
  '/assets/kiwi-env.js',
  '/dashboard.webmanifest',
  '/manifest.webmanifest',
  '/cuisine.webmanifest',
  '/serveur.webmanifest',
  '/assets/tokens.css',
  '/assets/theme.css',
  '/assets/print-paper.css?v=1',
  '/assets/polish.css',
  '/assets/simple.css',
  '/assets/ux.css',
  '/assets/pages-pro.css',
  '/assets/help-centre.css?v=4',
  '/assets/polish-dashboard.css',
  '/assets/pressing-catalog.css?v=4',
  '/assets/pressing-dashboard.css?v=10',
  '/assets/trade-workspaces.css?v=3',
  '/assets/reservations.css?v=5',
  '/assets/hotel.css',
  '/assets/genpage.css?v=2',
  '/assets/mobile.css?v=4',
  '/assets/sold-insights.js?v=2',
  '/assets/design-2026.css',
  '/assets/design-ios27.css',
  '/assets/design-vitrine.css',
  '/assets/design-vitrine.js',
  '/assets/liquid-glass.css',
  '/assets/liquid-glass.js',
  '/assets/agent-skin.css?v=15',
  '/assets/agent-skin.js?v=4',
  '/assets/dashboard-native.css',
  '/assets/cloud-doc.js',
  '/assets/agent-action-center.js?v=2',
  '/assets/cancellation-history.js?v=2',
  '/assets/briefing.js?v=17',
  '/assets/ai-telemetry.js',
  '/assets/agent-data.js',
  '/assets/agent-features.js?v=4',
  '/assets/agent-truth.js?v=6',
  '/assets/agent-voice.js?v=5',
  '/assets/i18n.js?v=7',
  /* Les milliers en arabe. Dans la coquille avec i18n : hors ligne, un
     commerçant arabophone lirait sinon son objectif du jour à l'envers. */
  '/assets/rtl-numbers.js',
  /* Les métiers. Dans la coquille parce que venues.js et les assistants
     d'inscription la lisent à l'évaluation : sans elle hors ligne, un
     établissement retombe sur la famille par défaut. */
  '/assets/trades.js?v=6',
  '/assets/interactive.js?v=26',
  '/assets/features.js?v=4',
  '/assets/invoicing.css?v=6',
  '/assets/invoicing.js?v=8',
  '/assets/order-qr.js?v=3',
  /* Ces deux-là sont estampillées ?v= dans dashboard.html. La chaîne doit être
     RIGOUREUSEMENT identique : c'est l'URL qui sert de clé de cache, et une
     entrée pré-cachée sans estampille ne répondrait jamais à la requête de la
     page (donc pas de hors-ligne), tandis qu'une estampille périmée ici
     re-servirait l'ancien fichier. Voir le commentaire dans dashboard.html. */
  '/assets/venues.js?v=24',
  '/assets/phone.js?v=1',
  '/assets/trade-workspace-schema.js?v=4',
  '/assets/trade-workspaces.js?v=4',
  '/assets/reservations.js?v=10',
  '/assets/pressing-ops.js?v=7',
  '/assets/pressing-garment-icons.js?v=2',
  '/assets/pressing-catalog.js?v=7',
  '/assets/pressing-dashboard.js?v=14',
  '/assets/pressing-products/chemise.png',
  '/assets/pressing-products/tshirt.png',
  '/assets/pressing-products/pull.png',
  '/assets/pressing-products/veste.png',
  '/assets/pressing-products/costume-2p.png',
  '/assets/pressing-products/costume-3p.png',
  '/assets/pressing-products/manteau.png',
  '/assets/pressing-products/pantalon.png',
  '/assets/pressing-products/jean.png',
  '/assets/pressing-products/jupe.png',
  '/assets/pressing-products/short.png',
  '/assets/pressing-products/robe.png',
  '/assets/pressing-products/robe-soiree.png',
  '/assets/pressing-products/caftan.png',
  '/assets/pressing-products/drap.png',
  '/assets/pressing-products/housse.png',
  '/assets/pressing-products/couverture.png',
  '/assets/pressing-products/nappe.png',
  '/assets/pressing-products/rideaux.png',
  '/assets/pressing-products/tapis-s.png',
  '/assets/pressing-products/tapis-m.png',
  '/assets/pressing-products/tapis-l.png',
  '/assets/pressing-products/veste-cuir.png',
  '/assets/pressing-products/daim.png',
  '/assets/pressing-products/doudoune.png',
  '/assets/pressing-products/chaussures.png',
  '/assets/pressing-products/baskets.png',
  '/assets/pressing-products/babouches.png',
  '/assets/demoClock.js',
  '/assets/dateRange.js?v=14',
  '/assets/mobile-nav.js?v=2',
  '/assets/liquid-lens.js',
  '/assets/pages.js?v=3',
  '/assets/help-centre.js?v=4',
  '/assets/account.js?v=17',
  '/assets/production-action-guard.js',
  // Shared floor-plan vocabulary · the dashboard designer AND the caisse both
  // read it, so leaving it out of the shell meant the till could come up
  // offline with no table geometry at all.
  '/assets/floorplan-core.js?v=2050',
  '/assets/oppo-cards.js',
  '/assets/dashboard-pwa.js?v=426',
  '/assets/dashboard-native.js?v=1',
  '/assets/pwa-update.js?v=359',
  '/assets/caisse-skin.css?v=3',
  '/assets/pos-mobile.css?v=3',
  '/assets/caisse-motion.js',
  '/assets/caisse-pwa.js?v=427',
  '/assets/vendor/dexie.min.js',
  '/assets/offline-db.js?v=3',
  '/assets/platform-kernel.js?v=5',
  '/assets/platform-ops.js?v=3',
  '/assets/platform-ops.css?v=1',
  '/assets/operations.js?v=10',
  '/assets/operations-ui.js?v=12',
  '/assets/live-link.js?v=15',
  '/assets/channel-sales.js?v=3',
  /* Le rapport journalier. Dans la coquille hors-ligne parce qu'une clôture ne
     peut pas dépendre du réseau : un commerçant ferme sa caisse le soir, parfois
     dans un sous-sol sans wifi, et c'est précisément le moment où le Z doit
     s'écrire et s'imprimer. La remontée serveur, elle, retentera plus tard. */
  '/assets/day-report.js?v=5',
  '/assets/day-report-dash.js?v=8',
  '/assets/day-report-export.js?v=5',
  /* Les horaires d'ouverture. Dans la coquille hors-ligne parce que la caisse
     s'en sert au moment le plus hors-ligne qui soit : l'ouverture du service.
     Sans eux le contrôle « ouvre-t-on maintenant ? » ne peut pas se faire, et
     un contrôle qui ne peut pas se faire doit laisser passer · donc autant
     qu'il puisse se faire. */
  '/assets/hours.js',
  '/assets/morocco-holidays.js?v=1',
  '/assets/hours-ui.js',
  /* Le reçu de caisse. Dans la coquille hors-ligne pour la même raison que le
     rapport journalier : un ticket s'imprime au comptoir, parfois sans réseau,
     et un client qui repart sans reçu ne revient pas le chercher. */
  '/assets/receipt.js',
  '/assets/receipt-ui.js',
  '/assets/invoice.js?v=6',
  '/assets/merchant-config.js?v=265',
  '/assets/entitlements.css?v=5',
  '/assets/entitlements.js?v=6',
  '/assets/staff-roles.js',
  /* Ce qui appartient à un commerçant. Dans la coquille parce que la purge se
     déclenche au ré-appairage, et qu'un ré-appairage se fait souvent dans un
     réseau douteux : absente, la caisse s'ouvrirait chez B avec les ventes de A. */
  '/assets/tenant-purge.js?v=1',
  /* Le geste qui pose un appairage · et qui déclenche la purge ci-dessus. La
     caisse ET l'écran cuisine passent par lui : absent, l'un des deux lierait un
     nouveau commerçant par-dessus les données de l'ancien. */
  '/assets/pairing-commit.js?v=1',
  '/assets/identity.js?v=2',
  '/assets/caisse-link.js?v=10',
  '/assets/operator-access.js',
  '/assets/auth-guard.js',
  '/assets/idle-lock.js?v=2',
  '/assets/caisse-hardware.js?v=1',
  '/assets/live-socket.js?v=2',
  '/assets/escpos.js?v=6',
  '/assets/printer-bridge.js?v=8',
  '/assets/barcode.js',
  '/assets/color-palette.js',
  '/assets/boutique-catalog.js?v=1',
  '/assets/store-templates.js?v=2',
  /* Les promotions. Dans la coquille avec le catalogue : hors ligne, une caisse
     qui a perdu ses promotions vend au prix plein pendant que la vitrine
     annonce −30 % · et c'est la caissière qui doit s'en expliquer. */
  '/assets/promos.js',
  '/assets/boutique-promos-dashboard.js?v=4',
  /* La langue du comptoir. Dans la coquille : une caissière arabophone hors
     ligne ne doit pas retrouver son écran en français au premier creux réseau. */
  '/assets/caisse-lang.js',
  '/assets/venue-store.js?v=3',
  /* One stock across owner dashboard and till. Catalog metadata is a cloud
     document; quantities are append-only movements, both usable offline. */
  '/assets/inventory-ledger.js?v=4',
  '/assets/caisse-stock-sync.js?v=9',
  '/assets/pos-inventory-count.js?v=3',
  '/assets/stock.js?v=34',
  /* Le coût de revient. Dans la coquille parce que les tuiles Marge brute,
     Bénéfice brut et Coût matière du tableau de bord passent toutes par lui :
     sans lui hors ligne, elles retomberaient sur un tiret alors que le
     commerçant a bel et bien saisi ses coûts. */
  '/assets/cost.js?v=3',
  '/assets/clients-store.js?v=3',
  '/assets/clients-book.js?v=9',
  '/assets/clients-directory.js',
  '/assets/menu-catalog.js?v=23',
  '/assets/stock-identity.js?v=2',
  '/assets/restaurant-recipes.js?v=7',
  '/assets/restaurant-units.js',
  '/assets/employee-live.js?v=425',
  '/assets/employee-planning.js?v=8',
  '/assets/employee-trade-shell.css?v=2',
  '/assets/employee-trade-shell.js?v=2',
  '/assets/planning-core.js?v=8',
  '/assets/planning-ui.css?v=10',
  '/assets/team.js?v=281',
  '/assets/menu-i18n.js?v=5',
  '/assets/restaurant-menu-workspace.js?v=66',
  // Reprise du fichier d'articles de l'ancienne caisse (inventaire + carte).
  '/assets/catalog-import.js?v=3',
  // Scanner un menu · photo / PDF / lien → Kiwi AI → revue d'import.
  '/assets/menu-scan.js?v=2',
  '/assets/salle-scan.js?v=2',
  // OrderPro · publisher + NFC panel (dashboard), inbox (caisse).
  '/assets/orderpro-publish.js?v=5',
  '/assets/orderpro-panel.js',
  '/assets/orderpro-inbox.js?v=7',
  /* Le relais cuisine · la caisse pose ses bons, la tablette du passe les lit.
     Dans la coquille pour les deux pages : c'est lui qui porte la file de
     secours hors ligne, donc il doit exister QUAND le réseau n'existe pas. */
  '/assets/kitchen-relay.js',
  /* File locale durable et dédupliquée des bons cuisine. Sans ce module hors
     ligne, une commande prise pendant une coupure pourrait atteindre la
     cuisine à l'écran sans jamais sortir sur la thermique. */
  '/assets/kitchen-print-queue.js?v=6',
  '/assets/food-production-print.js?v=2',
  '/assets/pos-sale.js?v=4',
  '/assets/pos-dispatch.js?v=31',
  '/assets/retail-scan.css?v=7',
  '/assets/vendor/zxing-browser.min.js?v=1',
  '/assets/retail-scan.js?v=6',
  '/assets/caisse-dna.css?v=3',
  '/assets/caisse-dna.js?v=2',
  '/assets/pos-mobile.js?v=3',
  '/assets/pos-workspaces.css?v=4',
  '/assets/pos-workspaces.js?v=5',
  /* La boutique est chargée après le code employé. La garder dans la coquille
     versionnée évite qu'une ancienne mise en page reste centrée/coupée après
     une mise à jour de la caisse. */
  '/assets/pos-boutique.css?v=8',
  '/assets/pos-boutique.js?v=8',
  /* pos-dispatch lazy-loads these verticals only after a PIN is entered. If
     they are not pre-cached, an installed till that loses Wi-Fi before a
     particular métier has ever been opened cannot unlock that métier at all. */
  '/assets/pos-spa.css?v=5',
  '/assets/pos-spa.js?v=5',
  '/assets/pos-hotel.css?v=3',
  '/assets/pos-hotel.js?v=3',
  '/assets/pos-fastfood.css?v=5',
  '/assets/pos-fastfood.js?v=5',
  '/assets/pos-boulangerie.css?v=7',
  '/assets/pos-boulangerie.js?v=7',
  '/assets/pos-pizzeria.css?v=3',
  '/assets/pos-pizzeria.js?v=3',
  '/assets/pos-traiteur.css?v=5',
  '/assets/pos-traiteur.js?v=5',
  '/assets/pos-foodtruck.css?v=5',
  '/assets/pos-foodtruck.js?v=5',
  '/assets/pos-epicerie.css?v=5',
  '/assets/pos-epicerie.js?v=5',
  '/assets/pos-pharmacie.css?v=5',
  '/assets/pos-pharmacie.js?v=5',
  '/assets/pos-librairie.css?v=5',
  '/assets/pos-librairie.js?v=5',
  '/assets/pos-fleuriste.css?v=7',
  '/assets/pos-fleuriste.js?v=7',
  '/assets/pos-coiffure.css?v=5',
  '/assets/pos-coiffure.js?v=5',
  '/assets/pos-gym.css?v=5',
  '/assets/pos-gym.js?v=5',
  '/assets/pos-autre.css?v=2',
  '/assets/pos-autre.js?v=2',
  '/assets/pos-maison.css?v=19',
  '/assets/pos-maison.js?v=19',
  '/assets/caisse-pairing.js?v=15',
  /* Réimprimer un ticket. Dans la coquille hors-ligne parce que c'est un geste
     de panne : le rouleau bourre, le réseau est tombé, et c'est précisément là
     qu'il faut pouvoir ressortir le ticket. Un bouton de secours qui a besoin du
     réseau n'est pas un secours. */
  '/assets/pos-reprint.js',
  '/assets/pressing-caisse.js?v=39',
  '/assets/pressing-caisse.css?v=39',
  '/assets/lucide.min.js?v=4',
  '/assets/kiwi-favicon-new.svg',
  '/assets/kiwi-newlogo.svg',
  '/assets/kiwi-newlogo.svg?v=2',
  '/assets/kiwi-newlogo-dark.svg',
  '/assets/kiwi-newlogo-inverse.svg',
  '/assets/landing/kiwi-mark-app-icon.png',
  '/assets/icons/kiwi-caisse-192.png',
  '/assets/icons/kiwi-caisse-180.png',
  '/assets/icons/kiwi-new-k.svg',
  '/assets/icons/kiwi-employee-192.png',
  '/assets/icons/kiwi-employee-512.png',
  '/assets/icons/kiwi-employee-180.png'
];

self.addEventListener('install', function (e) {
  // Take over as soon as installed · updates stop waiting for every tab to
  // close. Safe here because we never force a reload (see the note at top).
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then(function (c) {
    // Cache each asset individually so one missing file doesn't fail install.
    return Promise.all(SHELL.map(function (u) {
      return c.add(u).catch(function () { /* skip missing */ });
    }));
  }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.map(function (k) { return k === CACHE ? null : caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

// Kept for compatibility with any lingering "Rafraîchir" nudge that still posts
// this · harmless now that install() already skipWaiting()s.
self.addEventListener('message', function (e) {
  if (e.data && e.data.type === 'SKIP_WAITING') self.skipWaiting();
});

// Store a fresh copy in the cache without blocking the response. Only good,
// same-origin (non-opaque), NON-redirected 200s are cached · a redirected
// response cannot be replayed to a navigation (the browser hard-fails it with
// ERR_FAILED), and we never want to cache an error page or a redirect.
function put(req, res) {
  if (res && res.status === 200 && res.type === 'basic' && !res.redirected) {
    var copy = res.clone();
    caches.open(CACHE).then(function (c) { c.put(req, copy); });
  }
  return res;
}

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  // Live Link API is dynamic · never cache it, or the dashboard poll would read
  // stale sales. Let /api/* fall straight through to the network.
  if (url.pathname.indexOf('/api/') === 0) return;
  // …et RIEN sous /auth/ non plus. Ce sont des décisions d'authentification, pas
  // des ressources : la validité d'un lien de réinitialisation change entre deux
  // requêtes identiques. Servie depuis le cache, la vérification de
  // /auth/reset?token=… répondait « ce lien est bon » à un lien déjà consommé ·
  // le client voyait le formulaire, saisissait son mot de passe, et se faisait
  // refuser à l'envoi. Observé pendant la recette de la console opérateur.
  if (url.pathname.indexOf('/auth/') === 0) return;

  // NAVIGATIONS: NETWORK-FIRST. Always fetch the live document; fall back to the
  // cached shell only when the network fails. A cached HTML document must never be
  // served to a navigation while online · a redirected/opaque cached response is
  // rejected by the browser for navigations and hard-fails the page (ERR_FAILED),
  // which is exactly what a cache-first strategy here caused. Documents change on
  // deploy anyway, so fetching fresh is also the correct freshness behaviour.
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req).then(function (res) { return put(req, res); }).catch(function () {
        return caches.match(req).then(function (hit) {
          if (hit) return hit;
          /* Le repli doit rendre LA MÊME application, pas une autre. Un écran
             cuisine hors ligne qui se rouvre sur le tableau de bord du patron
             n'est pas un repli, c'est une panne déguisée · et sur une tablette
             murale sans clavier, personne ne s'en sortira. */
          var p = url.pathname;
          if (p.indexOf('/kiwi-cuisine') === 0) return caches.match('/kiwi-cuisine.html');
          if (p.indexOf('/kiwi-caisse') === 0) return caches.match('/kiwi-caisse.html');
          if (p.indexOf('/kiwi-serveur') === 0) return caches.match('/kiwi-serveur');
          return caches.match('/dashboard.html');
        });
      })
    );
    return;
  }

  // ASSETS (JS, CSS, images, fonts, icons, manifests): STALE-WHILE-REVALIDATE ·
  // serve the cached copy instantly (fast + offline), and refresh it in the
  // background so a deploy still lands on the next load with no manual refresh.
  //
  // …sauf pour une URL estampillée (`?v=NNNN`), qui est immuable par contrat :
  // le jour où le fichier change, `tools/bump-stamp.js` déplace l'estampille,
  // l'URL change, et c'est un défaut de cache qui va chercher la version neuve.
  // Revalider une URL estampillée ne peut donc rien rapporter, et ça coûtait
  // cher : `fetch()` partait même quand le cache répondait, si bien que chaque
  // ouverture du tableau de bord rejouait ~130 requêtes et réécrivait ~7 Mo
  // dans le Cache Storage pour des octets identiques. Deux onglets ouverts
  // (caisse + tableau de bord) doublaient la note.
  //
  // Les fichiers NON estampillés gardent le comportement d'avant : eux peuvent
  // changer sans que leur URL bouge, donc il faut continuer à les revalider.
  var stamped = /[?&]v=/.test(url.search);
  e.respondWith(
    caches.match(req).then(function (hit) {
      if (hit && stamped) return hit;
      var net = fetch(req).then(function (res) { return put(req, res); }).catch(function () { return hit; });
      return hit || net;
    })
  );
});
