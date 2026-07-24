/* Kiwi — global auth guard.
 *
 * The site gate (functions/_middleware.js) revokes a session the moment its
 * account row is deleted or its status flips to 'suspended': it clears the
 * kiwi_sess cookie and answers with 401 { error:"account-revoked" } for API
 * calls, or the auth page HTML for document navigations. That server-side work
 * is correct on its own, but the client apps were silently swallowing the 401
 * — identity.js / merchant-config.js both do `r.ok ? r.json() : null`, so a
 * revoked merchant kept seeing a half-broken dashboard (demo identity + every
 * /api/* call 401ing) with no way out, since there is no visible logout link
 * on dashboard.html or kiwi-caisse.html and the SW's cached shell hid the
 * middleware's auth-page response on every "network hiccup" retry.
 *
 * This module fixes that: wrap fetch() so any 401 body of exactly
 * { error:"account-revoked" } from /api/* or /auth/* purges the SW cache,
 * unregisters the SW, and lands the user on the real auth page via
 * /auth/logout (which server-clears the dead cookie and redirects to /).
 *
 * Kept surgical:
 *   · triggers ONLY on the account-revoked signal — a login form's own 401
 *     bad-creds, an operator's bad-code 401, etc. keep their own error UX.
 *   · fires once per pageload (redirecting flag).
 *   · no-op if the endpoint's response isn't parseable JSON, so a transient
 *     network hiccup never kicks a real merchant out.
 *   · runs on all app shells (dashboard, caisse, serveur) — the guard is idle
 *     for authenticated users; it only ever redirects on the server's own
 *     "your account is gone" signal.
 */
(function () {
  'use strict';
  if (window.__kiwiAuthGuardOn) return;
  window.__kiwiAuthGuardOn = true;
  if (typeof window.fetch !== 'function') return;

  var GUARDED = /^\/(api|auth)\//;
  var LOGOUT = '/auth/logout';
  var origFetch = window.fetch.bind(window);
  var redirecting = false;

  function isGuardedUrl(input) {
    try {
      var raw = typeof input === 'string' ? input
              : (input && typeof input.url === 'string') ? input.url : '';
      if (!raw) return false;
      if (raw.charAt(0) === '/') return GUARDED.test(raw);
      var u = new URL(raw, location.href);
      return u.origin === location.origin && GUARDED.test(u.pathname);
    } catch (_) { return false; }
  }

  // Merchant-scoped identity + venue + pairing keys. When the server confirms
  // the account is gone, these leftover values are what drive the "deleted
  // account still logs in" and "operator God-mode opens Client B, sees dead
  // Client A" symptoms — the app reads them at boot before /api/me answers,
  // paints the dead identity, and never fully recovers. Business data (menu,
  // catalog, sales) is deliberately NOT wiped: a suspended-then-reactivated
  // merchant keeps their working state; only the identity spine is nuked.
  var REVOKED_KEYS = [
    'kiwiOnboarded',
    'kiwiVenue', 'kiwiCustomVenues',
    'kiwiOwnerName', 'kiwiBizName',
    'kiwiSet:ownerName', 'kiwiSet:ownerEmail', 'kiwiOwnerEmail',
    'kiwiBizType', 'kiwiCity',
    'kiwiLiveMerchant', 'kiwiLive', 'kiwiPairings'
  ];

  function purgeLocalIdentity() {
    try {
      for (var i = 0; i < REVOKED_KEYS.length; i++) {
        try { localStorage.removeItem(REVOKED_KEYS[i]); } catch (_) {}
      }
    } catch (_) {}
  }

  function purgeAndRedirect() {
    if (redirecting) return;
    redirecting = true;
    // Wipe local identity SYNCHRONOUSLY so a race between the async purges and
    // the navigation can't leave the auth page reading stale kiwiBizName /
    // kiwiVenue and re-painting the dead account.
    purgeLocalIdentity();
    var done = false;
    var finish = function () {
      if (done) return;
      done = true;
      // Belt + suspenders: preserve nothing account-scoped in the local shell
      // so the auth page loads clean even if the cookie clear races the nav.
      try { location.replace(LOGOUT); } catch (_) { location.href = LOGOUT; }
    };
    var jobs = [];
    try {
      if (window.caches && typeof caches.keys === 'function') {
        jobs.push(caches.keys().then(function (ks) {
          return Promise.all((ks || []).map(function (k) {
            try { return caches.delete(k); } catch (_) { return null; }
          }));
        }).catch(function () {}));
      }
    } catch (_) {}
    try {
      if (navigator.serviceWorker && typeof navigator.serviceWorker.getRegistrations === 'function') {
        jobs.push(navigator.serviceWorker.getRegistrations().then(function (rs) {
          return Promise.all((rs || []).map(function (r) {
            try { return r.unregister(); } catch (_) { return null; }
          }));
        }).catch(function () {}));
      }
    } catch (_) {}
    // Never let a stuck cache/SW promise pin the user in the broken state.
    var safety = setTimeout(finish, 400);
    Promise.all(jobs).then(function () { clearTimeout(safety); finish(); },
                          function () { clearTimeout(safety); finish(); });
  }

  window.fetch = function (input, init) {
    var guarded = isGuardedUrl(input);
    return origFetch(input, init).then(function (res) {
      if (!guarded || !res || res.status !== 401) return res;
      // Clone so the caller still gets a fully readable body/stream.
      try {
        var probe = res.clone();
        probe.json().then(function (j) {
          if (j && j.error === 'account-revoked') purgeAndRedirect();
        }, function () { /* non-JSON 401 → not our signal */ });
      } catch (_) { /* clone failed on some old runtime → leave it */ }
      return res;
    });
  };
})();
