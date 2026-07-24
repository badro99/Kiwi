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
var CACHE = 'kiwi-app-v66';
var SHELL = [
  '/dashboard.html',
  '/kiwi-caisse.html',
  '/assets/kiwi-env.js',
  '/dashboard.webmanifest',
  '/manifest.webmanifest',
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
  '/assets/liquid-glass.css',
  '/assets/liquid-glass.js',
  '/assets/dashboard-native.css',
  '/assets/i18n.js',
  '/assets/interactive.js',
  '/assets/features.js',
  '/assets/venues.js',
  '/assets/demoClock.js',
  '/assets/dateRange.js',
  '/assets/mobile-nav.js',
  '/assets/liquid-lens.js',
  '/assets/pages.js',
  '/assets/oppo-cards.js',
  '/assets/dashboard-pwa.js',
  '/assets/dashboard-native.js',
  '/assets/pwa-update.js',
  '/assets/caisse-skin.css',
  '/assets/caisse-motion.js',
  '/assets/caisse-pwa.js',
  '/assets/live-link.js',
  '/assets/merchant-config.js',
  '/assets/identity.js',
  '/assets/caisse-link.js',
  '/assets/operator-access.js',
  '/assets/auth-guard.js',
  '/assets/caisse-hardware.js',
  '/assets/escpos.js',
  '/assets/printer-bridge.js',
  '/assets/barcode.js',
  '/assets/boutique-catalog.js',
  '/assets/venue-store.js',
  '/assets/clients-store.js',
  '/assets/clients-book.js',
  '/assets/clients-directory.js',
  '/assets/menu-catalog.js',
  '/assets/pos-dispatch.js',
  '/assets/caisse-pairing.js',
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
          return hit || caches.match(url.pathname.indexOf('/kiwi-caisse') === 0
            ? '/kiwi-caisse.html' : '/dashboard.html');
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
