/* Kiwi — shared service worker for both installable apps (owner "Kiwi" and
 * "Kiwi Caisse"). Served from the repo root so its scope is "/", which is the
 * only way two root-level app pages both load offline: one SW owns the scope
 * and serves whichever shell the navigation asks for.
 *
 * Update strategy — split by request type:
 *  • NAVIGATIONS (HTML documents) are NETWORK-FIRST: always fetch the live page,
 *    fall back to the cached shell only when the network fails. A cached HTML doc
 *    must never be replayed to a navigation while online — a redirected/opaque
 *    cached response is rejected by the browser and hard-fails the page
 *    (ERR_FAILED). Documents change on deploy anyway, so fresh is also correct.
 *  • ASSETS (JS, CSS, images, fonts, icons, manifests) are STALE-WHILE-REVALIDATE:
 *    served from cache instantly (fast + offline), refreshed in the background so
 *    a deploy still lands on the next load with no manual refresh.
 * The worker skipWaiting()s so a new version takes over promptly instead of
 * waiting for every tab to close; it does NOT force a reload, so a caisse sale in
 * progress is never interrupted — fresh assets are simply served on the next load. */
'use strict';
var CACHE = 'kiwi-app-v218';
var SHELL = [
  '/dashboard.html',
  '/kiwi-caisse.html',
  /* L'écran cuisine. Dans la coquille hors-ligne parce qu'une cuisine est
     l'endroit du commerce où le wifi est le plus mauvais — mur porteur, four,
     sous-sol. La tablette doit au minimum se rouvrir sur son dernier tableau
     quand le réseau tousse, au lieu d'une page blanche au milieu du service. */
  '/kiwi-cuisine.html',
  '/assets/kiwi-env.js',
  '/dashboard.webmanifest',
  '/manifest.webmanifest',
  '/cuisine.webmanifest',
  '/assets/tokens.css',
  '/assets/theme.css',
  '/assets/polish.css',
  '/assets/simple.css',
  '/assets/ux.css',
  '/assets/pages-pro.css',
  '/assets/polish-dashboard.css',
  '/assets/hotel.css',
  '/assets/mobile.css',
  '/assets/design-2026.css',
  '/assets/design-ios27.css',
  '/assets/design-vitrine.css',
  '/assets/design-vitrine.js',
  '/assets/liquid-glass.css',
  '/assets/liquid-glass.js',
  '/assets/agent-skin.css',
  '/assets/agent-skin.js',
  '/assets/dashboard-native.css',
  '/assets/cloud-doc.js',
  '/assets/ai-telemetry.js',
  '/assets/agent-data.js',
  '/assets/i18n.js',
  /* Les milliers en arabe. Dans la coquille avec i18n : hors ligne, un
     commerçant arabophone lirait sinon son objectif du jour à l'envers. */
  '/assets/rtl-numbers.js',
  /* Les métiers. Dans la coquille parce que venues.js et les assistants
     d'inscription la lisent à l'évaluation : sans elle hors ligne, un
     établissement retombe sur la famille par défaut. */
  '/assets/trades.js',
  '/assets/interactive.js',
  '/assets/features.js',
  '/assets/venues.js',
  '/assets/demoClock.js',
  '/assets/dateRange.js',
  '/assets/mobile-nav.js',
  '/assets/liquid-lens.js',
  '/assets/pages.js',
  '/assets/production-action-guard.js',
  // Shared floor-plan vocabulary — the dashboard designer AND the caisse both
  // read it, so leaving it out of the shell meant the till could come up
  // offline with no table geometry at all.
  '/assets/floorplan-core.js',
  '/assets/oppo-cards.js',
  '/assets/dashboard-pwa.js',
  '/assets/dashboard-native.js',
  '/assets/pwa-update.js',
  '/assets/caisse-skin.css',
  '/assets/pos-mobile.css',
  '/assets/caisse-motion.js',
  '/assets/caisse-pwa.js',
  '/assets/live-link.js',
  /* Le rapport journalier. Dans la coquille hors-ligne parce qu'une clôture ne
     peut pas dépendre du réseau : un commerçant ferme sa caisse le soir, parfois
     dans un sous-sol sans wifi, et c'est précisément le moment où le Z doit
     s'écrire et s'imprimer. La remontée serveur, elle, retentera plus tard. */
  '/assets/day-report.js',
  '/assets/day-report-dash.js',
  /* Les horaires d'ouverture. Dans la coquille hors-ligne parce que la caisse
     s'en sert au moment le plus hors-ligne qui soit : l'ouverture du service.
     Sans eux le contrôle « ouvre-t-on maintenant ? » ne peut pas se faire, et
     un contrôle qui ne peut pas se faire doit laisser passer — donc autant
     qu'il puisse se faire. */
  '/assets/hours.js',
  '/assets/hours-ui.js',
  /* Le reçu de caisse. Dans la coquille hors-ligne pour la même raison que le
     rapport journalier : un ticket s'imprime au comptoir, parfois sans réseau,
     et un client qui repart sans reçu ne revient pas le chercher. */
  '/assets/receipt.js',
  '/assets/receipt-ui.js',
  '/assets/merchant-config.js',
  '/assets/staff-roles.js',
  /* Ce qui appartient à un commerçant. Dans la coquille parce que la purge se
     déclenche au ré-appairage, et qu'un ré-appairage se fait souvent dans un
     réseau douteux : absente, la caisse s'ouvrirait chez B avec les ventes de A. */
  '/assets/tenant-purge.js',
  '/assets/identity.js',
  '/assets/caisse-link.js',
  '/assets/operator-access.js',
  '/assets/auth-guard.js',
  '/assets/caisse-hardware.js',
  '/assets/escpos.js',
  '/assets/printer-bridge.js',
  '/assets/barcode.js',
  '/assets/color-palette.js',
  '/assets/boutique-catalog.js',
  /* Les promotions. Dans la coquille avec le catalogue : hors ligne, une caisse
     qui a perdu ses promotions vend au prix plein pendant que la vitrine
     annonce −30 % — et c'est la caissière qui doit s'en expliquer. */
  '/assets/promos.js',
  '/assets/boutique-promos-dashboard.js',
  /* La langue du comptoir. Dans la coquille : une caissière arabophone hors
     ligne ne doit pas retrouver son écran en français au premier creux réseau. */
  '/assets/caisse-lang.js',
  '/assets/venue-store.js',
  /* Le coût de revient. Dans la coquille parce que les tuiles Marge brute,
     Bénéfice brut et Coût matière du tableau de bord passent toutes par lui :
     sans lui hors ligne, elles retomberaient sur un tiret alors que le
     commerçant a bel et bien saisi ses coûts. */
  '/assets/cost.js',
  '/assets/clients-store.js',
  '/assets/clients-book.js',
  '/assets/clients-directory.js',
  '/assets/menu-catalog.js',
  // Reprise du fichier d'articles de l'ancienne caisse (inventaire + carte).
  '/assets/catalog-import.js',
  // OrderPro — publisher + NFC panel (dashboard), inbox (caisse).
  '/assets/orderpro-publish.js',
  '/assets/orderpro-panel.js',
  '/assets/orderpro-inbox.js',
  /* Le relais cuisine — la caisse pose ses bons, la tablette du passe les lit.
     Dans la coquille pour les deux pages : c'est lui qui porte la file de
     secours hors ligne, donc il doit exister QUAND le réseau n'existe pas. */
  '/assets/kitchen-relay.js',
  '/assets/pos-sale.js',
  '/assets/pos-dispatch.js',
  '/assets/pos-mobile.js',
  /* La boutique est chargée après le code employé. La garder dans la coquille
     versionnée évite qu'une ancienne mise en page reste centrée/coupée après
     une mise à jour de la caisse. */
  '/assets/pos-boutique.css',
  '/assets/pos-boutique.js',
  /* pos-dispatch lazy-loads these verticals only after a PIN is entered. If
     they are not pre-cached, an installed till that loses Wi-Fi before a
     particular métier has ever been opened cannot unlock that métier at all. */
  '/assets/pos-spa.css',
  '/assets/pos-spa.js',
  '/assets/pos-hotel.css',
  '/assets/pos-hotel.js',
  '/assets/pos-fastfood.css',
  '/assets/pos-fastfood.js',
  '/assets/pos-boulangerie.css',
  '/assets/pos-boulangerie.js',
  '/assets/pos-pizzeria.css',
  '/assets/pos-pizzeria.js',
  '/assets/pos-traiteur.css',
  '/assets/pos-traiteur.js',
  '/assets/pos-foodtruck.css',
  '/assets/pos-foodtruck.js',
  '/assets/pos-epicerie.css',
  '/assets/pos-epicerie.js',
  '/assets/pos-pharmacie.css',
  '/assets/pos-pharmacie.js',
  '/assets/pos-librairie.css',
  '/assets/pos-librairie.js',
  '/assets/pos-fleuriste.css',
  '/assets/pos-fleuriste.js',
  '/assets/pos-coiffure.css',
  '/assets/pos-coiffure.js',
  '/assets/pos-gym.css',
  '/assets/pos-gym.js',
  '/assets/caisse-pairing.js',
  /* Réimprimer un ticket. Dans la coquille hors-ligne parce que c'est un geste
     de panne : le rouleau bourre, le réseau est tombé, et c'est précisément là
     qu'il faut pouvoir ressortir le ticket. Un bouton de secours qui a besoin du
     réseau n'est pas un secours. */
  '/assets/pos-reprint.js',
  '/assets/pressing-caisse.js',
  '/assets/pressing-caisse.css',
  '/assets/lucide.min.js',
  '/assets/icons/kiwi-app.svg',
  '/assets/icons/kiwi-app-192.png',
  '/assets/icons/kiwi-app-512.png',
  '/assets/icons/kiwi-app-180.png',
  '/assets/icons/kiwi-caisse.svg',
  '/assets/icons/kiwi-caisse-192.png',
  '/assets/icons/kiwi-caisse-180.png'
];

self.addEventListener('install', function (e) {
  // Take over as soon as installed — updates stop waiting for every tab to
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
// this — harmless now that install() already skipWaiting()s.
self.addEventListener('message', function (e) {
  if (e.data && e.data.type === 'SKIP_WAITING') self.skipWaiting();
});

// Store a fresh copy in the cache without blocking the response. Only good,
// same-origin (non-opaque), NON-redirected 200s are cached — a redirected
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
  // Live Link API is dynamic — never cache it, or the dashboard poll would read
  // stale sales. Let /api/* fall straight through to the network.
  if (url.pathname.indexOf('/api/') === 0) return;
  // …et RIEN sous /auth/ non plus. Ce sont des décisions d'authentification, pas
  // des ressources : la validité d'un lien de réinitialisation change entre deux
  // requêtes identiques. Servie depuis le cache, la vérification de
  // /auth/reset?token=… répondait « ce lien est bon » à un lien déjà consommé —
  // le client voyait le formulaire, saisissait son mot de passe, et se faisait
  // refuser à l'envoi. Observé pendant la recette de la console opérateur.
  if (url.pathname.indexOf('/auth/') === 0) return;

  // NAVIGATIONS: NETWORK-FIRST. Always fetch the live document; fall back to the
  // cached shell only when the network fails. A cached HTML document must never be
  // served to a navigation while online — a redirected/opaque cached response is
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
             n'est pas un repli, c'est une panne déguisée — et sur une tablette
             murale sans clavier, personne ne s'en sortira. */
          var p = url.pathname;
          if (p.indexOf('/kiwi-cuisine') === 0) return caches.match('/kiwi-cuisine.html');
          if (p.indexOf('/kiwi-caisse') === 0) return caches.match('/kiwi-caisse.html');
          return caches.match('/dashboard.html');
        });
      })
    );
    return;
  }

  // ASSETS (JS, CSS, images, fonts, icons, manifests): STALE-WHILE-REVALIDATE —
  // serve the cached copy instantly (fast + offline), and refresh it in the
  // background so a deploy still lands on the next load with no manual refresh.
  e.respondWith(
    caches.match(req).then(function (hit) {
      var net = fetch(req).then(function (res) { return put(req, res); }).catch(function () { return hit; });
      return hit || net;
    })
  );
});
