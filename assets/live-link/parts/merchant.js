import {} from './live-link/queue-store.js?v=2';
import {} from './live-link/sale-identity.js?v=1';
/* Kiwi Live Link — le pont ventes ↔ serveur (Cloudflare Pages Functions + D1).
 *
 * ALLUMÉ dès qu'il s'agit d'un vrai commerçant (KiwiEnv.isReal()), comme le
 * stock, le carnet client et la carte. Éteint en démonstration locale, où les
 * ventes fabriquées ne doivent atteindre aucun serveur. `kiwiLive = '0'` refuse
 * explicitement, `'1'` et `?live=1` forcent. Quand c'est allumé :
 *   • the CAISSE POSTs every confirmed sale to  /api/sale
 *   • the SERVEUR POSTs every settled table (card · cash · split) to  /api/sale
 *   • the DASHBOARD polls  /api/feed  and pushes what it gets into KiwiSales, so
 *     a sale rung on a till appears in the owner's real numbers — hero, objectif,
 *     KPI band, revenue chart, transactions feed — on whatever device they are on.
 *
 * This module paints no surface of its own (beyond a toast). It is a pump: sales
 * out on the till, sales in on the dashboard.
 *
 * Getting there without a refresh takes three things, all here:
 *   1. an OFFLINE QUEUE on the till, so a sale survives a WiFi drop and is
 *      retried — idempotently — until D1 confirms it;
 *   2. a LOCAL PING (BroadcastChannel + a localStorage key) so a dashboard open
 *      in the same browser polls the instant a sale is rung, instead of waiting;
 *   3. an adaptive poll, 2.5..60 s on screen, paused hidden, and an immediate
 *      poll on every wake-up (tab focus, bfcache restore, network back, ping).
 *
 * Same-origin fetch carries the passcode-gate cookie, so it works behind the
 * Cloudflare edge gate. Vanilla, no dependencies. The simulated dashboard feed is
 * left untouched, so the demo still works with the flag off.
 */
(function () {
  'use strict';

  var LS = 'kiwiLive';

  // ?live=1 or ?op=1 (operator view) both turn the live feed on.
  function urlFlag() { try { return /[?&](?:live=1|op=1)(?:&|$)/.test(location.search); } catch (_) { return false; } }
  function opMode() { try { return /[?&]op=1(?:&|$)/.test(location.search); } catch (_) { return false; } }

  /* Le même verrou que partout ailleurs : hébergé ⇒ toujours vrai (les démos
     sont une facilité de localhost), en local ⇒ seulement avec une vraie
     session. C'est ce qui empêche une vente de démonstration de partir sous le
     locataire partagé « cafe-atlas ». */
  function realEnv() {
    try { return !!(window.KiwiEnv && window.KiwiEnv.isReal && window.KiwiEnv.isReal()); }
    catch (_) { return false; }
  }

  /* ALLUMÉ par défaut chez un vrai commerçant — et c'était le dernier endroit
   * où ça ne l'était pas.
   *
   * Le stock passe par /api/catalog, le carnet client par /api/clients, la
   * carte par /api/menu, les horaires et les rapports Z par /api/store. Tous
   * s'activent sur `isReal()`, sans rien demander. Les VENTES, elles,
   * attendaient un drapeau que personne ne pose : sans `?live=1`, le journal du
   * comptoir ne quittait jamais le navigateur.
   *
   * Ce que ça coûtait n'est pas une fonctionnalité en moins, c'est la seule
   * donnée irremplaçable du commerce posée dans le stockage d'un onglet. Un
   * iPad qu'on remplace, un « effacer les données du site » pour régler un
   * affichage, une fenêtre privée, iOS qui purge le stockage d'un site laissé
   * de côté sept jours : la caisse repart à zéro et le chiffre d'affaires n'est
   * nulle part ailleurs. Le stock, lui, revenait tout seul.
   *
   * Le refus explicite reste possible et prioritaire (`kiwiLive = '0'`) — on ne
   * retire pas l'interrupteur, on change ce que fait l'absence de choix. */
  function on() {
    try {
      if (urlFlag()) { localStorage.setItem(LS, '1'); return true; }
      var v = localStorage.getItem(LS);
      if (v === '1') return true;
      if (v === '0') {
        /* Un « 0 » resté dans le stockage ne doit jamais couper en silence les
         * ventes d'un vrai commerçant : ni la caisse ni le serveur n'en disent
         * rien, et le chiffre d'affaires reste dans l'onglet. Chez un vrai
         * commerçant (session réelle, ou caisse appairée à un magasin) le refus
         * est ignoré et effacé ; il ne vaut que pour une démonstration locale. */
        var pv = null;
        try { pv = JSON.parse(localStorage.getItem('kiwiPairedVenue') || 'null'); } catch (_) { console.warn("[live-link] on failed"); }
        if (realEnv() || (pv && pv.merchant)) {
          try { localStorage.removeItem(LS); } catch (_) { console.warn("[live-link] on failed"); }
          try {
            if (window.KiwiReportError) window.KiwiReportError(new Error('kiwiLive=0 ignoré chez un vrai commerçant'), 'live:stale_off_flag_ignored');
          } catch (_) { console.warn("[live-link] on failed"); }
          return true;
        }
        return false;
      }
      return realEnv();
    } catch (_) { return urlFlag(); }
  }
  // slugMerchant() twin (functions/auth/_lib.js): "MixMax Test" → "mixmax-test".
  // Lets a real dashboard derive its OWN live-feed tenant from the signed-in
  // identity instead of guessing.
  function slugify(s) {
    return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
      .toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  }
  /* Pin the active tenant, preserving whatever was pinned before it — ONCE, the
   * first time the value actually changes. Modules that need to find data filed
   * under the previous (account-derived) slug read kiwiLiveMerchantPrev; they
   * load after this one, so by the time they run the live value has already been
   * rewritten and snapshotting it themselves is too late. */
  /* Faux tant que /api/me n'a pas confirmé que ce navigateur a le droit de
     regarder le magasin nommé dans l'adresse. Voir merchant() ci-dessous. */
  var scopeConfirmed = false;
  function pin(v) {
    try {
      var cur = localStorage.getItem('kiwiLiveMerchant');
      if (cur && cur !== v && localStorage.getItem('kiwiLiveMerchantPrev') == null) {
        localStorage.setItem('kiwiLiveMerchantPrev', cur);
      }
      localStorage.setItem('kiwiLiveMerchant', v);
    } catch (_) { console.warn("[live-link] pin failed"); }
  }
  // Which tenant this dashboard is showing. Priority: an explicit ?merchant= (the
  // operator's "Ouvrir dashboard", pinned to localStorage) → the ACTIVE STORE's own
  // slug → the signed-in account's slug (from KiwiMe) → a paired till's store.
  // A REAL dashboard must NEVER fall back to the shared 'cafe-atlas' demo tenant —
  // that made a brand-new store poll another merchant's feed (P1). Unknown-yet real
  // session ⇒ '' (polls nothing until identity resolves); only the local demo keeps
  // 'cafe-atlas'.
  function merchant() {
    try {
      /* Le paramètre d'adresse répond pour CETTE page ; il ne s'ÉPINGLE qu'une
       * fois /api/me d'accord (confirmScope, appelé par identity.js). Épinglé
       * d'office, il faisait basculer kiwiLiveMerchant — donc le locataire sous
       * lequel les ventes remontent — au premier chargement d'une adresse
       * portant le slug d'un autre commerce, et durablement. Même raison
       * qu'assets/merchant-config.js, où c'est écrit en long. */
      var q = new URLSearchParams(location.search).get('merchant');
      if (q) { if (scopeConfirmed) pin(q); return q; }
      // The ACTIVE STORE owns the tenant, not the account. One account can hold
      // several stores (a boutique and a restaurant), and each has its own till,
      // its own feed and its own money — but KiwiMe.business is a single
      // account-level name, so deriving from it pointed every store on the account
      // at ONE feed: a sale rung up on the boutique till surfaced in the
      // restaurant's "Encaissé aujourd'hui". Use the venue's stable identity:
      // server-restored stores carry merchant_config.merchant as their slug,
      // and renaming a store must never move its feed or the shared tenant pin.
      // Falls through on the caisse (no KiwiVenue) and on demo venues.
      var vd = null;
      try {
        var KV = window.KiwiVenue;
        if (KV && KV.isCustom && KV.isCustom() && KV.getCurrentVenueData) vd = KV.getCurrentVenueData();
      } catch (_) { console.warn("[live-link] merchant failed"); }
      if (vd && vd.name) {
        var vs = realEnv() && !opMode()
          ? (vd.slug || (KV.slugOf && KV.slugOf()) || slugify(vd.name))
          : slugify(vd.name);
        if (vs) { pin(vs); return vs; }
      }
      // No store yet (fresh account, identity resolved but onboarding unfinished) —
      // the account name is the best answer, and heals a stale pin a previous
      // SAME-account test left behind (e.g. 'vix'), which F1's account-switch purge
      // can't reach. The caisse has no KiwiMe, so it falls through to the pinned
      // slug its pairing set.
      var me = window.KiwiMe;
      if (me && me.business) {
        var s = slugify(me.business);
        if (s) { pin(s); return s; }
      }
      // A PAIRED till owns its tenant: redeeming a code bound this device to that
      // store, and the caisse has no KiwiMe to derive from. This is the caisse's
      // real answer — and it is account-scoped (kiwiPairedVenue is purged on an
      // account switch), so it can never be another merchant's leftover.
      try {
        if (window.KiwiPlatform && typeof window.KiwiPlatform.pairedMerchant === 'function') {
          var pm = window.KiwiPlatform.pairedMerchant();
          if (pm) return pm;
        }
        var pv = JSON.parse(localStorage.getItem('kiwiPairedVenue') || 'null');
        if (pv && pv.merchant) return pv.merchant;
      } catch (_) { console.warn("[live-link] merchant failed"); }
      /* The employee portal has neither KiwiMe (owner identity) nor a paired
       * till. Its authenticated login pins the exact store here. This value is
       * only routing metadata: /api/sale independently verifies the signed
       * employee cookie, live Team membership, service role and open shift, so
       * changing localStorage cannot grant access to another merchant. */
      try {
        var employeeMerchant = String(localStorage.getItem('kiwiEmployeeMerchant') || '').trim();
        if (employeeMerchant) return employeeMerchant;
      } catch (_) { console.warn("[live-link] merchant failed"); }
      var real = false;
      try { real = !!(window.KiwiEnv && window.KiwiEnv.isReal && window.KiwiEnv.isReal()); } catch (_) { console.warn("[live-link] merchant failed"); }
      // A real session whose identity has NOT resolved yet polls NOTHING. The old
      // fallback to a bare kiwiLiveMerchant pin was a cross-tenant leak: the feed
      // poll starts at boot, before /api/me answers, so a pin left by a PREVIOUS
      // account in this browser made the new merchant ingest the previous
      // merchant's sales into its own KPIs (observed: a foreign 189 MAD sale in a
      // brand-new store). Identity resolves a tick later and the poll self-heals.
      if (real) return '';
      return localStorage.getItem('kiwiLiveMerchant') || 'cafe-atlas';
    } catch (_) { return 'cafe-atlas'; }
  }
