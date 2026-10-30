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
var CACHE = 'kiwi-app-v674';
var SHELL = [
  '/assets/boutique-sizes.js?v=16',
  '/assets/boutique-size-split.js?v=4',
  '/assets/boutique-size-codes.js?v=3',
  '/assets/boutique-size-colors.js?v=6',
  '/assets/team/access-rules.js?v=7',
  '/assets/hotel-economat-transport.js?v=2',
  '/assets/pos-boutique/drawer.js?v=37',
  '/assets/till-inventory-access.js?v=1',
  '/assets/credit-history-page.js?v=3',
  '/assets/librairie-loyalty.js?v=10',
  '/assets/money-cents.js?v=4',
  '/assets/pages-pro/boutique-promos-returns.js?v=15',
  '/assets/day-report-conflicts.js?v=2',
  '/assets/printer/pairing-lang.js?v=9',
  '/assets/planning/shift-editor.js?v=5',
  '/assets/planning/csv-import.js?v=3',
  '/assets/planning/optimiser.js?v=5',
  '/assets/planning/payroll-view.js?v=8',
  '/assets/planning/corrections.js?v=3',
  '/assets/orderpro/draft.js?v=3',
  '/assets/orderpro/transport.js?v=3',
  '/assets/orderpro-page.js?v=15',
  '/assets/orderpro/payment.js?v=5',
  '/assets/orderpro/cart.js?v=6',
  '/assets/orderpro/menu.js?v=6',
  '/assets/orderpro/table.js?v=3',
  '/assets/orderpro/session.js?v=5',
  '/assets/daterange/presentation.js?v=5',
  '/assets/daterange/ledger.js?v=7',
  '/assets/daterange/cards.js?v=8',
  '/assets/daterange/date-picker.js?v=5',
  '/assets/daterange/activity.js?v=7',
  '/assets/daterange/revenue.js?v=5',
  '/assets/daterange/kpi.js?v=12',
  '/assets/daterange/hero.js?v=5',
  '/assets/team/roster-list.js?v=6',
  '/assets/team/invitations.js?v=9',
  '/assets/team/venue-scope.js?v=6',
  '/assets/team/member-state.js?v=10',
  '/assets/stock/movements.js?v=3',
  '/assets/stock/alerts.js?v=3',
  '/assets/stock/overview.js?v=3',
  '/assets/stock/state.js?v=4',
  '/assets/menu-catalog/availability.js?v=3',
  '/assets/menu-catalog/media.js?v=3',
  '/assets/menu-catalog/item-editor.js?v=7',
  '/assets/menu-catalog/formulas.js?v=3',
  '/assets/menu-catalog/item-list.js?v=3',
  '/assets/menu-catalog/modifiers.js?v=3',
  '/assets/menu-catalog/state.js?v=5',
  '/assets/pressing/custody.js?v=11',
  '/assets/pressing/rack.js?v=10',
  '/assets/pressing/pickup.js?v=10',
  '/assets/pressing/workshop.js?v=10',
  '/assets/pressing/deposit.js?v=10',
  '/assets/hotel/rate-actions.js?v=6',
  '/assets/hotel/folio-actions.js?v=4',
  '/assets/hotel/room-board.js?v=6',
  '/assets/hotel/arrivals.js?v=4',
  '/assets/tickets-data.js?v=3',
  '/assets/tickets-board.js?v=7',
  '/assets/tickets-composer.js?v=5',
  '/assets/tickets-thread.js?v=3',
  '/assets/invoicing/print.js?v=8',
  '/assets/invoicing/history.js?v=9',
  '/assets/invoicing/composer.js?v=9',
  '/assets/invoicing/transport.js?v=4',
  '/assets/booking-view.js?v=2',
  '/assets/booking-manage.js?v=4',
  '/assets/booking-submission.js?v=5',
  '/assets/booking-hotel.js?v=2',
  '/assets/booking-service.js?v=2',
  '/assets/onboarding-data.js?v=8',
  // First-use dashboard owners must also open before the first offline visit.
  '/assets/ramadan.js?v=3',
  '/assets/growth-kit.js?v=2',
  '/assets/growth-crm.js?v=7',
  '/assets/channel-link.js?v=202608272308',
  '/assets/marketing-suite-tease.js?v=1',
  '/assets/pages-pro.js?v=2196',
  '/assets/pages-pro-spa-starter.js?v=4',
  '/assets/cash-sessions.js?v=8',
  '/assets/simple-food-cost.js?v=18',
  '/assets/finance.js?v=14',
  '/assets/conformite.js?v=8',
  '/dashboard.html',
  '/assets/dashboard-shell.css?v=7',
  '/kiwi-caisse.html',
  '/assets/caisse/table-settlement.js?v=2',
  '/assets/caisse-accounting.js?v=18',
  '/assets/caisse-floor.js?v=13',
  '/assets/caisse-kitchen.js?v=7',
  '/assets/caisse/receipts.js?v=2',
  '/assets/caisse/closing.js?v=1',
  '/assets/caisse/workflows-loader.js?v=3',
  '/assets/caisse/catalogue.js?v=9',
  '/assets/caisse/till-frame.js?v=15',
  '/assets/caisse/orders.js?v=2',
  '/assets/caisse/payment.js?v=6',
  '/assets/caisse/split-tender.js?v=5',
  '/assets/caisse/shift.js?v=3',
  '/assets/caisse/settings.js?v=2',
  '/assets/caisse/held-sales.js?v=1',
  '/assets/caisse/discounts.js?v=4',
  '/assets/caisse/returns.js?v=2',
  '/assets/caisse/handover.js?v=2',
  '/assets/caisse/inventory.js?v=4',
  '/assets/caisse/offline.js?v=3',
  '/assets/caisse-app.js?v=32',
  '/assets/caisse-loyalty-reward.js?v=7',
  '/assets/caisse-refresh.js?v=9',
  /* SANS le .html. Pages sert /kiwi-serveur.html en 308 vers /kiwi-serveur :
     c.add() sur une réponse redirigée jette, la salle n'entrait donc JAMAIS
     dans la coquille · en silence, puisque install() avale l'échec. Et c'est
     bien /kiwi-serveur que l'application ouvre partout ailleurs. */
  '/kiwi-serveur',
  '/assets/serveur-shell.css?v=8',
  /* Bundle serveur : service-runtime.js, payments.js et shift-report.js. */
  '/assets/serveur/service.js?v=10',
  '/assets/serveur-app.js?v=23',
  /* L'écran cuisine. Dans la coquille hors-ligne parce qu'une cuisine est
     l'endroit du commerce où le wifi est le plus mauvais · mur porteur, four,
     sous-sol. La tablette doit au minimum se rouvrir sur son dernier tableau
     quand le réseau tousse, au lieu d'une page blanche au milieu du service. */
  '/kiwi-cuisine.html',
  /* La page publique de réservation. Elle vit sur le même domaine, donc CE
     service worker la sert : sans elle dans la coquille, une cliente hors
     ligne recevait le tableau de bord du patron. Elle est légère (une page,
     un script, deux feuilles) et n'a pas de session à protéger. */
  '/booking.html',
  '/assets/booking.js?v=45',
  '/assets/booking-recover.js?v=2',
  '/assets/booking.css?v=16',
  '/assets/phone.js?v=1',
  '/assets/err-reporter.js?v=2',
  '/assets/kiwi-env.js?v=9',
  '/dashboard.webmanifest',
  '/manifest.webmanifest',
  '/cuisine.webmanifest',
  '/serveur.webmanifest',
  '/assets/tokens.css?v=2053',
  '/assets/caisse-shell.css?v=20',
  '/assets/theme.css?v=2',
  '/assets/print-paper.css?v=1',
  '/assets/polish.css',
  '/assets/simple.css',
  '/assets/ux.css',
  '/assets/pages-pro.css?v=4',
  '/assets/catalog-workspace.css?v=24',
  '/assets/catalog-workspace.js?v=5',
  '/assets/help-centre.css?v=5',
  '/assets/polish-dashboard.css',
  '/assets/pressing-catalog.css?v=4',
  '/assets/pressing-dashboard.css?v=11',
  '/assets/trade-workspaces.css?v=6',
  '/assets/reservations.css?v=11',
  '/assets/hotel.css?v=47',
  '/assets/hotel-language.js?v=3',
  '/assets/hotel-rates.js?v=1',
  '/assets/hotel-housekeeping.js?v=1',
  '/assets/hotel-folio.js?v=1',
  '/assets/hotel-channels.js?v=1',
  '/assets/pages-pro-office.js?v=3',
  '/assets/pages-pro-boutique.js?v=32',
  '/assets/menu-nutrition.js?v=4',
  '/assets/kiwi-select.js?v=4',
  '/assets/food-trade-settings.js?v=2',
  '/assets/z-reconciliation.js?v=29',
  '/assets/design-2026.js?v=2',
  '/assets/design-vexel-layout.js?v=2098',
  '/assets/pages/dashboard-startup.js?v=104',
  '/assets/pages/dashboard-loader.js?v=30',
  '/assets/hotel/model.js?v=8',
  '/assets/hotel/views.js?v=3',
  '/assets/hotel/groups.js?v=1',
  '/assets/hotel/editors.js?v=2',
  '/assets/hotel.js?v=91',
  '/assets/hotel-economat.js?v=22',
  '/assets/genpage.css?v=5',
  '/assets/mobile.css?v=13',
  '/assets/sold-insights.js?v=20',
  '/assets/design-2026.css?v=3',
  '/assets/design-ios27.css',
  '/assets/design-vitrine.css',
  '/assets/design-vitrine.js?v=1',
  '/assets/liquid-glass.css',
  '/assets/liquid-glass.js?v=1',
  '/assets/agent-skin.css?v=15',
  '/assets/dashboard-native.css',
  '/assets/cloud-doc.js?v=13',
  '/assets/agent-action-center.js?v=4',
  '/assets/cancellation-history.js?v=3',
  '/assets/weather.js?v=1',
  '/assets/briefing-rules.js?v=2',
  '/assets/briefing-persistence.js?v=2',
  '/assets/briefing.js?v=38',
  '/assets/ai-telemetry.js?v=1',
  '/assets/agent-data.js?v=7',
  '/assets/agent-features.js?v=5',
  '/assets/agent-truth.js?v=10',
  '/assets/agent-voice.js?v=11',
  '/assets/i18n.js?v=44',
  /* Les milliers en arabe. Dans la coquille avec i18n : hors ligne, un
     commerçant arabophone lirait sinon son objectif du jour à l'envers. */
  '/assets/rtl-numbers.js?v=1',
  /* Les métiers. Dans la coquille parce que venues.js et les assistants
     d'inscription la lisent à l'évaluation : sans elle hors ligne, un
     établissement retombe sur la famille par défaut. */
  '/assets/trades.js?v=9',
  '/assets/plan-catalog.js?v=1',
  '/assets/interactive/helpers.js?v=1',
  '/assets/interactive/handlers.js?v=2',
  '/assets/interactive.js?v=73',
  '/assets/view-link.js?v=2',
  '/assets/loyalty-product-links.js?v=1',
  '/assets/features.js?v=18',
  '/assets/invoicing.css?v=14',
  '/assets/invoicing.js?v=36',
  '/assets/order-qr.js?v=6',
  /* Ces deux-là sont estampillées ?v= dans dashboard.html. La chaîne doit être
     RIGOUREUSEMENT identique : c'est l'URL qui sert de clé de cache, et une
     entrée pré-cachée sans estampille ne répondrait jamais à la requête de la
     page (donc pas de hors-ligne), tandis qu'une estampille périmée ici
     re-servirait l'ancien fichier. Voir le commentaire dans dashboard.html. */
  '/assets/venues/data.js?v=2',
  '/assets/venues/helpers.js?v=2',
  '/assets/venues.js?v=70',
  '/assets/phone.js?v=1',
  '/assets/trade-workspace-schema.js?v=12',
  '/assets/trade-workspaces.js?v=17',
  '/assets/delivery-receivables.js?v=2',
  '/assets/reservations.js?v=37',
  '/assets/pressing-numbering.js?v=5',
  '/assets/pressing-ops.js?v=24',
  '/assets/pressing-catalog.js?v=10',
  '/assets/pressing-dashboard.js?v=26',
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
  '/assets/demoClock.js?v=5',
  '/assets/sales-history.js?v=7',
  '/assets/dateRange.js?v=124',
  '/assets/daterange/renderers.js?v=23',
  '/assets/agent/ui.js?v=3',
  '/assets/mobile-nav.js?v=9',
  '/assets/kit/motion.js?v=1',
  '/assets/kit/lens.js?v=1',
  '/assets/liquid-lens.js?v=11',
  '/assets/pages/tables.js?v=4',
  '/assets/pages/tables-data.js?v=1',
  '/assets/pages/tables-drawing.js?v=3',
  '/assets/pages/tables-operations.js?v=2',
  '/assets/pages.js?v=13',
  '/assets/help-centre.js?v=7',
  '/assets/account.js?v=33',
  '/assets/production-action-guard.js?v=6',
  // Shared floor-plan vocabulary · the dashboard designer AND the caisse both
  // read it, so leaving it out of the shell meant the till could come up
  // offline with no table geometry at all.
  '/assets/floorplan-core.js?v=2061',
  // The Plan de salle's live-room poller (fail-soft without network).
  '/assets/floorplan-live.js?v=8',
  '/assets/oppo-cards.js?v=9',
  '/assets/merchant-health.js?v=5',
  '/assets/merchant-health.css?v=3',
  '/assets/dashboard-pwa.js?v=614',
  '/assets/dashboard-native.js?v=4',
  '/assets/pwa-update.js?v=368',
  '/assets/caisse-skin.css?v=4',
  '/assets/pos-mobile.css?v=9',
  '/assets/caisse-motion.js?v=8',
  '/assets/caisse-pwa.js?v=631',
  '/assets/vendor/dexie.min.js?v=1',
  '/assets/offline-db.js?v=11',
  '/assets/platform-kernel.js?v=6',
  '/assets/platform-ops.js?v=5',
  '/assets/platform-ops.css?v=1',
  '/assets/operations.js?v=18',
  '/assets/operations-ui.js?v=30',
  '/assets/live-link/queue-store.js?v=3',
  '/assets/live-link/sale-identity.js?v=1',
  '/assets/live-link.js?v=92',
  '/assets/channel-sales.js?v=8',
  /* Le rapport journalier. Dans la coquille hors-ligne parce qu'une clôture ne
     peut pas dépendre du réseau : un commerçant ferme sa caisse le soir, parfois
     dans un sous-sol sans wifi, et c'est précisément le moment où le Z doit
     s'écrire et s'imprimer. La remontée serveur, elle, retentera plus tard. */
  '/assets/day-report.js?v=39',
  '/assets/report.js?v=10',
  '/assets/day-report-dash.js?v=46',
  '/assets/day-report-export.js?v=19',
  '/assets/month-report.js?v=16',
  /* Les horaires d'ouverture. Dans la coquille hors-ligne parce que la caisse
     s'en sert au moment le plus hors-ligne qui soit : l'ouverture du service.
     Sans eux le contrôle « ouvre-t-on maintenant ? » ne peut pas se faire, et
     un contrôle qui ne peut pas se faire doit laisser passer · donc autant
     qu'il puisse se faire. */
  '/assets/hours.js?v=6',
  '/assets/hours-ui.js?v=4',
  /* Le reçu de caisse. Dans la coquille hors-ligne pour la même raison que le
     rapport journalier : un ticket s'imprime au comptoir, parfois sans réseau,
     et un client qui repart sans reçu ne revient pas le chercher. */
  '/assets/receipt.js?v=13',
  '/assets/receipt-ui.js?v=2',
  '/assets/invoice.js?v=24',
  '/assets/merchant-config.js?v=285',
  '/assets/entitlements.css?v=7',
  '/assets/entitlements-v2.js?v=5',
  '/assets/staff-roles.js?v=2',
  /* Ce qui appartient à un commerçant. Dans la coquille parce que la purge se
     déclenche au ré-appairage, et qu'un ré-appairage se fait souvent dans un
     réseau douteux : absente, la caisse s'ouvrirait chez B avec les ventes de A. */
  '/assets/tenant-purge.js?v=6',
  /* La porte du dashboard hors ligne : des lignes salées que le serveur a prouvées,
     jamais un code. Absent de la coquille, un patron hors ligne ne rentrerait plus. */
  '/assets/dashboard-pin-vault.js?v=4',
  /* Le geste qui pose un appairage · et qui déclenche la purge ci-dessus. La
     caisse ET l'écran cuisine passent par lui : absent, l'un des deux lierait un
     nouveau commerçant par-dessus les données de l'ancien. */
  '/assets/pairing-commit.js?v=4',
  /* Le verrou d'une caisse dépairée ou réappairée en plein service. Sans lui
     hors ligne, rien ne retiendrait le service d'origine au retour du réseau. */
  '/assets/till-tenant.js?v=6',
  '/assets/identity.js?v=12',
  '/assets/caisse-link.js?v=22',
  '/assets/operator-access.js?v=1',
  '/assets/auth-guard.js?v=2',
  '/assets/serveur-lang.js?v=6',
  '/assets/idle-lock.js?v=2',
  '/assets/caisse-hardware.js?v=9',
  '/assets/live-socket.js?v=5',
  '/assets/escpos.js?v=19',
  '/assets/printer/transports.js?v=2',
  '/assets/printer-bridge.js?v=50',
  '/assets/printer/pairing-ui.js?v=13',
  '/assets/barcode.js?v=2',
  '/assets/scan-wedge.js?v=1',
  '/assets/color-palette.js?v=7',
  '/assets/boutique-catalog-parts.js?v=15',
  '/assets/boutique-catalog.js?v=27',
  '/assets/store-templates.js?v=4',
  /* Les promotions. Dans la coquille avec le catalogue : hors ligne, une caisse
     qui a perdu ses promotions vend au prix plein pendant que la vitrine
     annonce −30 % · et c'est la caissière qui doit s'en expliquer. */
  '/assets/promo-rules.js?v=7',
  '/assets/promos.js?v=15',
  '/assets/boutique-promos-dashboard.js?v=23',
  /* La langue du comptoir. Dans la coquille : une caissière arabophone hors
     ligne ne doit pas retrouver son écran en français au premier creux réseau. */
  '/assets/caisse-lang.js?v=91',
  '/assets/venue-store.js?v=4',
  '/assets/discount-policy.js?v=4',
  '/assets/menu-promos.js?v=8',
  '/assets/retail-balances.js?v=4',
  '/assets/retail-sale-hold.js?v=6',
  '/assets/repeat-sale-guard.js?v=3',
  '/assets/delivery-collect.js?v=3',
  /* One stock across owner dashboard and till. Catalog metadata is a cloud
     document; quantities are append-only movements, both usable offline. */
  '/assets/inventory-ledger.js?v=18',
  '/assets/maison-stock-movements.js?v=9',
  '/assets/caisse-stock-sync.js?v=10',
  '/assets/pos-inventory-count.js?v=15',
  '/assets/stock/strings.js?v=10',
  '/assets/stock.js?v=101',
  '/assets/stock/loss.js?v=1',
  '/assets/stock/counts.js?v=9',
  '/assets/stock/purchasing.js?v=2',
  '/assets/stock/intake.js?v=13',
  '/assets/stock/catalog.js?v=4',
  /* Le coût de revient. Dans la coquille parce que les tuiles Marge brute,
     Bénéfice brut et Coût matière du tableau de bord passent toutes par lui :
     sans lui hors ligne, elles retomberaient sur un tiret alors que le
     commerçant a bel et bien saisi ses coûts. */
  '/assets/cost.js?v=11',
  '/assets/charges-engine.js?v=3',
  '/assets/charges.js?v=4',
  '/assets/clients-store.js?v=38',
  '/assets/clients-book.js?v=58',
  '/assets/clients-directory.js?v=30',
  '/assets/customer-retention.js?v=18',
  '/assets/menu-catalog.js?v=41',
  '/assets/stock-identity.js?v=3',
  '/assets/restaurant-recipes.js?v=14',
  '/assets/restaurant-units.js?v=2',
  '/assets/employee-live.js?v=623',
  '/assets/employee-planning.js?v=21',
  '/assets/employee-trade-shell.css?v=2',
  '/assets/employee-trade-shell.js?v=9',
  '/assets/planning-core.js?v=13',
  '/assets/planning-ui.css?v=13',
  '/assets/team/catalog.js?v=2',
  '/assets/team/merge.js?v=2',
  '/assets/field-merge.js?v=1',
  '/assets/team.js?v=344',
  '/assets/team/profile-ui.js?v=15',
  '/assets/team-hours.js?v=17',
  '/assets/menu-i18n.js?v=6',
  '/assets/restaurant-menu/strings.js?v=2',
  '/assets/restaurant-menu/recipes.js?v=3',
  '/assets/restaurant-menu/styles.js?v=2',
  '/assets/restaurant-menu-workspace.js?v=125',
  '/assets/menu-promos-dashboard.js?v=6',
  // Reprise du fichier d'articles de l'ancienne caisse (inventaire + carte).
  '/assets/catalog-import.js?v=16',
  // Scanner un menu · photo / PDF / lien → Kiwi AI → revue d'import.
  '/assets/ai-image-import.js?v=1',
  '/assets/menu-scan-reader.js?v=1',
  '/assets/menu-scan.js?v=8',
  '/assets/salle-scan.js?v=7',
  // OrderPro · publisher + NFC panel (dashboard), inbox (caisse).
  '/assets/orderpro-publish.js?v=9',
  '/assets/orderpro-panel.js?v=5',
  '/assets/orderpro-inbox.js?v=39',
  '/assets/service-requests.js?v=2',
  /* Le relais cuisine · la caisse pose ses bons, la tablette du passe les lit.
     Dans la coquille pour les deux pages : c'est lui qui porte la file de
     secours hors ligne, donc il doit exister QUAND le réseau n'existe pas. */
  '/assets/kitchen-relay.js?v=16',
  /* File locale durable et dédupliquée des bons cuisine. Sans ce module hors
     ligne, une commande prise pendant une coupure pourrait atteindre la
     cuisine à l'écran sans jamais sortir sur la thermique. */
  '/assets/kitchen-print-queue.js?v=24',
  '/assets/food-production-print.js?v=2',
  '/assets/pos-sale.js?v=22',
  '/assets/pos-dispatch.js?v=295',
  '/assets/retail-scan.css?v=10',
  '/assets/retail-balances.css?v=3',
  '/assets/vendor/zxing-browser.min.js?v=1',
  '/assets/kit/haptics.js?v=7',
  /* Design 2027, stage 3a: the till's code doors on the kit's pad, loaded
     only when kiwiSkin2027:till is on; precached so that till works offline. */
  '/assets/icons/material/sprite.till.svg?v=15',
  '/assets/kit/tokens-2027.css?v=2',
  '/assets/kit/kit.css?v=68',
  '/assets/pos-boutique-2027.css?v=25',
  '/assets/pos-maison-2027.css?v=1',
  '/assets/pos-maison/kit-2027.js?v=3',
  '/assets/kit/strings/kit.fr.js?v=2',
  '/assets/kit/strings/kit.en.js?v=2',
  '/assets/kit/strings/kit.ar.js?v=2',
  '/assets/kit/strings/till.fr.js?v=14',
  '/assets/kit/strings/till.en.js?v=14',
  '/assets/kit/strings/till.ar.js?v=14',
  '/assets/kit/strings.js?v=2',
  '/assets/kit/format.js?v=3',
  '/assets/kit/business-day.js?v=4',
  '/assets/kit/core.js?v=2',
  '/assets/kit/overlays.js?v=2',
  '/assets/kit/pin.js?v=6',
  '/assets/kit/pin-flow.js?v=7',
  '/assets/kit/till-pin.js?v=9',
  /* and forgot and reset password, behind kiwiSkin2027:access. */
  '/assets/icons/material/sprite.access.svg?v=1',
  '/assets/kit/strings/onboarding.fr.js?v=1',
  '/assets/kit/strings/onboarding.en.js?v=1',
  '/assets/kit/strings/onboarding.ar.js?v=1',
  '/assets/kit/access-reset.js?v=1',
  /* and the team app's sign-in and clock-in, behind kiwiSkin2027:team. */
  '/assets/icons/material/sprite.team.svg?v=1',
  '/assets/kit/strings/team.fr.js?v=1',
  '/assets/kit/strings/team.en.js?v=1',
  '/assets/kit/strings/team.ar.js?v=1',
  '/assets/kit/team-pin.js?v=5',
  '/assets/kit/team-split.js?v=2',
  /* and the kitchen board's lanes, behind kiwiSkin2027:kds. */
  '/assets/icons/material/sprite.kds.svg?v=2',
  '/assets/kit/strings/kds.fr.js?v=3',
  '/assets/kit/strings/kds.en.js?v=3',
  '/assets/kit/strings/kds.ar.js?v=3',
  '/assets/kit/controls/button.js?v=1',
  '/assets/kit/kds.js?v=9',
  '/assets/kit/kds-board.js?v=2',
  /* and the till's menu and bill on the kit, behind kiwiSkin2027:till (stage 4). */
  '/assets/kit/controls/chip.js?v=1',
  '/assets/kit/controls/keypad.js?v=3',
  '/assets/kit/controls/stepper.js?v=1',
  '/assets/kit/controls/switch.js?v=1',
  '/assets/kit/elements.js?v=4',
  '/assets/kit/layout.js?v=1',
  '/assets/kit/nav.js?v=9',
  '/assets/kit/till.js?v=30',
  '/assets/kit/till-frame.js?v=14',
  '/assets/kit/till-attendance.js?v=1',
  '/assets/kit/till-online.js?v=2',
  '/assets/kit/till-z.js?v=1',
  '/assets/retail-scan.js?v=12',
  '/assets/caisse-dna.css?v=10',
  '/assets/caisse-dna.js?v=3',
  '/assets/pos-mobile.js?v=9',
  '/assets/pos-workspaces.css?v=5',
  '/assets/pos-workspaces.js?v=9',
  /* La boutique est chargée après le code employé. La garder dans la coquille
     versionnée évite qu'une ancienne mise en page reste centrée/coupée après
     une mise à jour de la caisse. */
  '/assets/pos-boutique.css?v=218',
  '/assets/pos-boutique/sales.js?v=119',
  '/assets/retail-photos.js?v=4',
  '/assets/retail-icon-picker.js?v=3',
  '/assets/pos-boutique/ticket-owner.js?v=3',
  '/assets/pos-boutique/ticket-number.js?v=1',
  '/assets/pos-boutique/z-split.js?v=1',
  '/assets/pos-boutique/livraisons.js?v=3',
  '/assets/pos-boutique/delivery-card.js?v=1',
  '/assets/pos-boutique/ticket-remise.js?v=3',
  '/assets/pos-boutique/search.js?v=14',
  '/assets/pos-boutique/inv-tools.js?v=18',
  '/assets/pos-boutique/inv-moves.js?v=5',
  '/assets/pos-boutique/kit-2027.js?v=20',
  '/assets/pos-boutique/checkout.js?v=119',
  '/assets/pos-boutique/inventory.js?v=119',
  '/assets/pos-boutique.js?v=218',
  /* pos-dispatch lazy-loads these verticals only after a PIN is entered. If
     they are not pre-cached, an installed till that loses Wi-Fi before a
     particular métier has ever been opened cannot unlock that métier at all. */
  '/assets/pos-spa.css?v=13',
  '/assets/pos-spa.js?v=13',
  '/assets/pos-hotel.css?v=27',
  '/assets/pos-hotel.js?v=27',
  '/assets/pos-fastfood.css?v=15',
  '/assets/pos-fastfood.js?v=15',
  '/assets/pos-boulangerie.css?v=12',
  '/assets/pos-boulangerie.js?v=12',
  '/assets/pos-pizzeria.css?v=7',
  '/assets/pos-pizzeria.js?v=7',
  '/assets/pos-traiteur.css?v=13',
  '/assets/pos-traiteur.js?v=13',
  '/assets/pos-foodtruck.css?v=9',
  '/assets/pos-foodtruck.js?v=9',
  '/assets/pos-epicerie.css?v=29',
  '/assets/pos-epicerie.js?v=29',
  '/assets/pos-pharmacie.css?v=9',
  '/assets/pos-pharmacie.js?v=9',
  '/assets/pos-librairie.css?v=18',
  '/assets/pos-librairie.js?v=18',
  '/assets/pos-fleuriste.css?v=15',
  '/assets/pos-fleuriste.js?v=15',
  '/assets/pos-coiffure.css?v=10',
  '/assets/pos-coiffure.js?v=10',
  '/assets/pos-gym.css?v=9',
  '/assets/pos-gym.js?v=9',
  '/assets/pos-autre.css?v=9',
  '/assets/pos-autre.js?v=9',
  '/assets/pos-maison.css?v=117',
  '/assets/pos-maison/sales.js?v=37',
  '/assets/pos-maison/checkout.js?v=37',
  '/assets/pos-maison/delivery.js?v=1',
  '/assets/refund-split.js?v=2',
  '/assets/pos-maison/inventory.js?v=37',
  '/assets/pos-maison.js?v=117',
  '/assets/caisse-pairing.js?v=58',
  '/assets/caisse-doctor.js?v=1',
  /* Réimprimer un ticket. Dans la coquille hors-ligne parce que c'est un geste
     de panne : le rouleau bourre, le réseau est tombé, et c'est précisément là
     qu'il faut pouvoir ressortir le ticket. Un bouton de secours qui a besoin du
     réseau n'est pas un secours. */
  '/assets/pos-reprint.js?v=17',
  '/assets/pressing-caisse.js?v=78',
  '/assets/pressing-caisse.css?v=78',
  '/assets/material-icons.js?v=4',
  /* La déclaration de l'arabe de la caisse et du tableau de bord : IBM Plex Sans
     Arabic en auto-hébergé (étape 1 du design 2027, §6.1). Les trois fichiers
     woff2 qu'elle nomme ne sont pas listés ici : un fichier à ?v= du SHELL doit
     figurer dans une coquille (pwa-shell-test), et aucune ne le précharge ; ils
     se mettent en cache à la première utilisation (URL estampillée, donc
     immuable, voir le gestionnaire fetch). */
  '/assets/fonts/legacy-faces.css?v=1',
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
  /* Une page hors ligne, en trois langues, sans dépendance : elle doit
     s'afficher quand rien d'autre n'est joignable. Elle ne prétend rien
     savoir — elle dit ce qui se passe et propose de réessayer. */
  function offlineNotice(url) {
    var lang = (url && url.searchParams && url.searchParams.get('lang')) || 'fr';
    var copy = {
      fr: { t: 'Vous êtes hors ligne', p: 'Cette page a besoin d\'une connexion pour s\'afficher. Reconnectez-vous, puis réessayez.', b: 'Réessayer' },
      en: { t: 'You are offline', p: 'This page needs a connection to load. Reconnect, then try again.', b: 'Try again' },
      ar: { t: 'أنت غير متصل', p: 'تحتاج هذه الصفحة إلى اتصال لعرضها. أعد الاتصال ثم حاول مجدداً.', b: 'إعادة المحاولة' },
    };
    var c = copy[lang] || copy.fr;
    var rtl = lang === 'ar';
    var html = '<!doctype html><html lang="' + lang + '" dir="' + (rtl ? 'rtl' : 'ltr') + '"><meta charset="utf-8">'
      + '<meta name="viewport" content="width=device-width,initial-scale=1"><title>' + c.t + '</title>'
      + '<style>:root{color-scheme:light dark}body{margin:0;min-height:100vh;display:grid;place-items:center;'
      + 'background:#F7F5F0;color:#0A0F0D;font:400 16px/1.6 system-ui,-apple-system,"Segoe UI",sans-serif;padding:24px}'
      + '@media(prefers-color-scheme:dark){body{background:#0A0F0D;color:#F7F5F0}}'
      + 'main{max-width:30rem;text-align:center}h1{font-size:1.5rem;letter-spacing:-.02em;margin:0 0 .5rem}'
      + 'p{margin:0 0 1.5rem;opacity:.72}button{min-height:48px;padding:0 22px;border:0;border-radius:12px;'
      + 'background:#0B6E4F;color:#fff;font:600 15px system-ui,sans-serif;cursor:pointer}</style>'
      + '<main><h1>' + c.t + '</h1><p>' + c.p + '</p>'
      + '<button onclick="location.reload()">' + c.b + '</button></main></html>';
    return new Response(html, { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });
  }

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
          /* La page publique de réservation. Elle n'est pas « une page de
             l'application » : elle est ouverte par une cliente, et le repli
             lui servait la coquille du tableau de bord du PATRON — un écran
             d'authentification qu'elle ne peut ni comprendre ni franchir. */
          if (p.indexOf('/booking') === 0) {
            return caches.match('/booking.html').then(function (page) {
              return page || offlineNotice(url);
            });
          }
          /* Et le repli par défaut cesse d'être le tableau de bord pour
             N'IMPORTE QUELLE adresse. Une page publique inconnue, hors ligne,
             doit dire qu'elle est hors ligne — pas ouvrir la porte de service
             du commerçant devant un visiteur. */
          if (p === '/' || p.indexOf('/dashboard') === 0 || p.indexOf('/app') === 0) {
            return caches.match('/dashboard.html').then(function (page) {
              return page || offlineNotice(url);
            });
          }
          return caches.match(req).then(function (page) { return page || offlineNotice(url); });
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
