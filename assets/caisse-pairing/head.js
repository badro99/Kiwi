/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · CAISSE PAIRING  (assets/caisse-pairing.js)
 * ---------------------------------------------------------------------------
 * Turns a hosted caisse into ONE specific store. On the local desktop copy it
 * is a no-op — the demo PIN pad (0000-0015) works exactly as before. On the
 * hosted app (KiwiEnv.demosAllowed === false) there are NO demo codes: the
 * terminal shows a 6-digit "code d'appairage" pad instead, and once a code is
 * redeemed the device becomes that store, of the right trade, and every sale it
 * rings tags to that merchant so the owner's dashboard reacts live.
 *
 * Client-first + fail-soft: redeem tries POST /api/pair/redeem (cross-device,
 * once the partner deploys it) and falls back to the same-browser localStorage
 * pairing map (kiwiPairings) that the dashboard writes — so the whole flow works
 * in one browser today with zero backend. A 404/405/network on the endpoint is
 * the "backend absent" signal → localStorage; a 422 is a real "bad/expired code".
 *
 * State (all localStorage, shared same-origin with the dashboard):
 *   kiwiPaired        '1' once this device is bound
 *   kiwiPairedVenue   {merchant,venueId,type,subtype,name,location}
 *   kiwiLiveMerchant  the merchant slug (consumed by live-link.js postSale/feed)
 *   kiwiLive          '1' so Live Link posts sales
 *   kiwiPairings      the dashboard-issued code map (fallback + connected mirror)
 *
 * Load order (kiwi-caisse.html): after kiwi-env.js, pos-dispatch.js, live-link.js
 * and boutique-catalog.js (all defer → document order). The big inline caisse
 * script runs at parse time, so window.__kiwiUnlockApp is already exposed.
 * ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  /* Tells the head's paired-till gate that the lock owner is here: from now on only
     the staff lock (bootVertical) may release it, never a timer. */
  try { document.documentElement.setAttribute('data-pairing-loaded', ''); } catch (_) {}
