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
 *   3. an ATTENTION-AWARE POLL — 2.5 s on screen, 20 s hidden, and an immediate
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
      if (v === '0') return false;
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
    } catch (_) {}
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
      // restaurant's "Encaissé aujourd'hui". Slug the current store's own name,
      // exactly as caisse-link.js currentBiz() does when it issues the pairing
      // code — the two must agree or the till posts where the dashboard isn't
      // listening. Falls through on the caisse (no KiwiVenue) and on demo venues.
      var vd = null;
      try {
        var KV = window.KiwiVenue;
        if (KV && KV.isCustom && KV.isCustom() && KV.getCurrentVenueData) vd = KV.getCurrentVenueData();
      } catch (_) {}
      if (vd && vd.name) {
        var vs = slugify(vd.name);
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
        var pv = JSON.parse(localStorage.getItem('kiwiPairedVenue') || 'null');
        if (pv && pv.merchant) return pv.merchant;
      } catch (_) {}
      var real = false;
      try { real = !!(window.KiwiEnv && window.KiwiEnv.isReal && window.KiwiEnv.isReal()); } catch (_) {}
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

  var METHOD_LABEL = { cash: 'Espèces', card: 'Carte', tap: 'Kiwi Tap', qr: 'QR', wallet: 'Kiwi Wallet', split: 'Partagée', delivery: 'Livraison · à recevoir' };
  function fmtMAD(n) { try { return (Math.round(n) || 0).toLocaleString('fr-FR'); } catch (_) { return String(Math.round(n) || 0); } }

  // Tiny DOM helper — no innerHTML anywhere (safe by construction).
  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  /* ─── the instant local channel (same browser, cross-tab) ───
   * A till and a dashboard open in the SAME browser must not wait for a poll. The
   * client book already felt instant because KiwiStore fires a `storage` event on
   * every write; a sale only ever travelled through the timed poll, which is
   * exactly why a new client appeared at once and the sale that created it did
   * not. So ringing a sale now also drops a ping every other tab hears
   * immediately — BroadcastChannel where it exists, a localStorage key everywhere
   * else — and the receiving dashboard polls AT ONCE.
   *
   * The ping carries NO sale data on purpose: the server stays the single source
   * of truth, the ping only says "look now". So a tab can never inject a sale
   * into another tab's totals, and nothing can be double-counted. */
  var PING_KEY = 'kiwiSalePing';
  var chan = null;
  try { if (window.BroadcastChannel) chan = new BroadcastChannel('kiwi-live'); } catch (_) {}
  function pingLocal() {
    try { localStorage.setItem(PING_KEY, Date.now() + ':' + Math.random().toString(36).slice(2)); } catch (_) {}
    try { if (chan) chan.postMessage('sale'); } catch (_) {}
  }

  /* ─── caisse → server, with an offline queue ───
   * WiFi in a boutique drops. A sale that failed to reach D1 used to be lost for
   * good ("best-effort; offline queue is a later phase") and the owner's
   * dashboard silently under-counted the day. Every sale now carries a stable id
   * and waits in localStorage until the server confirms it, then retries on
   * reconnect and on every feed poll. That id is the row's PRIMARY KEY and
   * /api/sale does INSERT OR IGNORE, so retrying after a lost response can never
   * write the same sale twice. */
  var Q_KEY = 'kiwiSaleQueue';
  function qRead() {
    try { var a = JSON.parse(localStorage.getItem(Q_KEY) || '[]'); return Array.isArray(a) ? a : []; }
    catch (_) { return []; }
  }
  function queueSignal() {
    try { window.dispatchEvent(new CustomEvent('kiwi:sale-queue', { detail: queueStatus() })); } catch (_) {}
  }
  /* Never trim this array. The previous `slice(-200)` silently erased the
   * OLDEST takings during a long outage — exactly the sales least likely to
   * exist anywhere else. If storage itself is full, report failure and leave
   * the previous queue intact; the cashier UI turns that into a blocking red
   * support state instead of pretending synchronization is healthy. */
  function qWrite(a) {
    try {
      localStorage.setItem(Q_KEY, JSON.stringify(a));
      queueStorageError = false;
      queueSignal();
      return true;
    } catch (_) {
      queueStorageError = true;
      queueSignal();
      return false;
    }
  }
  function queueStatus() {
    var q = qRead();
    var active = merchant();
    var current = active ? q.filter(function (x) { return x && x.merchant === active; }) : q;
    return {
      pending: current.length,
      blocked: current.filter(function (x) { return x && x._blocked; }).length,
      foreign: q.length - current.length,
      total: q.length,
      storageError: !!queueStorageError,
    };
  }
  function uid() {
    try {
      var c = window.crypto || window.msCrypto;
      if (c && c.randomUUID) return 'sale-' + c.randomUUID();
    } catch (_) {}
    return 'sale-' + Date.now() + '-' + Math.random().toString(36).slice(2, 10);
  }
  function stableId(merchantId, entry) {
    var source = String((entry && (entry.id || entry.ref)) || '');
    if (!source) return uid();
    /* FNV-1a: deterministic across reloads, short enough for the 64-char DB
       key, and includes the tenant so two shops may both own ticket #42. */
    var s = String(merchantId || '') + '|' + source, h = 2166136261;
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return 'sale-ref-' + (h >>> 0).toString(16) + '-' + source.replace(/[^a-zA-Z0-9_-]/g, '').slice(-32);
  }

  var flushing = false, queueStorageError = false;
  function flushQueue() {
    if (flushing) return;
    var q = qRead();
    if (!q.length) return;
    var active = merchant();
    if (!active) { queueSignal(); return; }
    /* A rejected record stays available for support but cannot hold every valid
       sale behind it hostage. A queue can also survive a terminal re-pairing:
       retain the former merchant's debt for support, but never submit it with
       the new merchant's till cookie or let it block the new store's sales. */
    var body = q.find(function (x) { return x && !x._blocked && x.merchant === active; });
    if (!body) { queueSignal(); return; }
    flushing = true;
    function done(settled, blocked, status) {
      flushing = false;
      var current = qRead();
      if (settled) {
        var rest = current.filter(function (x) { return x && x.id !== body.id; });
        qWrite(rest);
        pingLocal();                           // the row exists now — tell the dashboards
        if (rest.some(function (x) { return x && !x._blocked; })) flushQueue();
        return;
      }
      if (blocked) {
        current.forEach(function (x) {
          if (x && x.id === body.id) { x._blocked = true; x._status = status || 0; x._blockedAt = Date.now(); }
        });
        qWrite(current);                       // retained, visible, skipped on the next send
        if (current.some(function (x) { return x && !x._blocked; })) flushQueue();
      } else queueSignal();                    // offline/transient → unchanged and retryable
    }
    try {
      fetch('/api/sale', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        keepalive: true,
      }).then(function (r) {
        /* Only 2xx proves D1 accepted the sale. A structurally rejected body is
           quarantined for support, never deleted. Auth failures remain retryable:
           pairing/session repair can make the exact same sale valid later. */
        var BLOCK = { 400: 1, 409: 1, 422: 1 };
        done(!!(r && r.ok), !!(r && BLOCK[r.status]), r && r.status);
      }).catch(function () { done(false, false, 0); });
    } catch (_) { done(false, false, 0); }
  }

  function postSale(entry) {
    if (!on() || !entry) return;
    var amt = Math.round(entry.amount || 0);
    if (amt <= 0) return;
    // No resolved tenant ⇒ don't post. The server refuses an unattributed sale
    // (it used to file it under a shared 'default' bucket other stores read), so
    // this just skips a guaranteed 400 rather than changing behaviour.
    var m = merchant();
    if (!m) return;
    var q = qRead();
    /* The basket, compacted. {n,q,t} rather than {name,qty,total} because this
     * queue lives in localStorage and is replayed after an outage — a busy
     * lunch service can hold a few hundred queued sales, and the short keys are
     * roughly a third of the bytes for the same information. Capped at 40 lines
     * and 60 chars per name, the same limits the till itself applies. */
    var lines = null;
    try {
      if (Array.isArray(entry.lines) && entry.lines.length) {
        lines = entry.lines.slice(0, 40).map(function (l) {
          var o = { n: String((l && l.name) || 'Article').slice(0, 60), q: +(l && l.qty) || 1, t: Math.round((l && +l.total) || 0) };
          /* `c` — la catégorie du produit telle qu'elle était au moment de la
           * vente. Elle n'est ajoutée que si la caisse la connaît : une clé
           * vide sur chacune des 40 lignes d'un panier alourdirait la file
           * hors-ligne pour ne rien dire de plus. */
          var c = String((l && (l.cat || l.category)) || '').slice(0, 40);
          if (c) o.c = c;
          return o;
        });
      }
    } catch (_) { lines = null; }
    var body = {
      id: stableId(m, entry),                                 // stable receipt key = row PK
      merchant: m,
      amount: amt,                                            // MAD, integer
      method: entry.method || 'cash',                         // cash|card|tap|qr|wallet
      label: entry.label || 'Vente',
      ref: entry.ref || '',
      ts: (entry.time && entry.time.getTime) ? entry.time.getTime() : Date.now(),
      lines: lines,                                           // null ⇒ unknown, never "empty basket"
    };
    /* The same completed receipt can be observed by two local persistence
       paths. Stable IDs plus this local check prevent it entering the queue
       twice; INSERT OR IGNORE remains the server-side second lock. */
    if (q.some(function (x) { return x && x.id === body.id; })) return { ok: true, queued: true, duplicate: true, id: body.id };
    q.push(body);
    if (!qWrite(q)) return { ok: false, reason: 'queue-storage-full', id: body.id };
    pingLocal();     // a dashboard in this browser starts polling before the POST lands
    flushQueue();
    return { ok: true, queued: true, id: body.id };
  }

  /* ─── dashboard ← server (poll) ───
   * Two things turn this from "reload to see your sale" into live:
   *  • the interval follows attention — 2.5 s while the dashboard is on screen,
   *    20 s once it is hidden. A hidden tab is throttled by the browser anyway
   *    (Chrome clamps background timer chains hard, down to about once a minute
   *    after a few minutes hidden), so the old fixed 3.5 s chain simply stalled
   *    while the owner was ringing the sale on the till tab — and the sale only
   *    turned up on the next manual reload. That was the bug.
   *  • every wake-up polls AT ONCE: returning to the tab, refocusing the window,
   *    a bfcache restore, the network coming back, or a ping from a till in this
   *    same browser. Whatever happened while we were away lands immediately. */
  var FAST_MS = 2500, SLOW_MS = 20000;
  function watchFeed(onSales, intervalMs) {
    if (!on()) return function () {};
    var since = 0, stopped = false, timer = null, busy = false, again = false, backfill = true;
    var lastTenant = null;
    var bound = [];
    function delay() {
      if (intervalMs) return intervalMs;
      try { return document.hidden ? SLOW_MS : FAST_MS; } catch (_) { return FAST_MS; }
    }
    function arm(ms) {
      if (timer) { clearTimeout(timer); timer = null; }
      if (!stopped) timer = setTimeout(tick, ms == null ? delay() : ms);
    }
    function tick() {
      if (stopped) return;
      if (busy) { again = true; return; }      // coalesce: one poll in flight at a time
      busy = true; again = false;
      flushQueue();                            // this device may still owe the server a sale
      /* `since` is a per-tenant cursor. Switching store switches tenant, so a
       * cursor carried over from the previous one would skip the new store's
       * whole history — it starts again from the beginning of its own feed. */
      var tenant = merchant();
      if (tenant !== lastTenant) { lastTenant = tenant; since = 0; backfill = true; }
      fetch('/api/feed?merchant=' + encodeURIComponent(tenant) + '&since=' + since, { headers: { Accept: 'application/json' } })
        .then(function (r) { return (r && r.ok) ? r.json() : null; })
        .then(function (data) {
          if (!data) return;                   // network/gate failure → still the first batch
          lastSync = Date.now();
          /* Les ventes RETIRÉES des livres, avant celles qui arrivent. Le flux
             ne repasse jamais sur un curseur déjà servi, donc c'est le seul
             chemin par lequel une annulation atteint un navigateur qui avait
             déjà recopié la vente. Appliqué à chaque sondage, quel que soit le
             curseur : idempotent, et un appareil neuf se retrouve d'aplomb au
             premier passage. */
          if (Array.isArray(data.voided)) applyVoids(data.voided, tenant);
          if (Array.isArray(data.sales) && data.sales.length) {
            since = data.cursor || since;
            try { onSales(data.sales, backfill, tenant); } catch (_) {}
          }
          // Only a real answer retires "backfill": the first successful poll
          // replays everything already banked today, which must not be announced
          // as if it just happened.
          backfill = false;
        })
        .catch(function () {})
        .then(function () {
          busy = false;
          if (stopped) return;
          if (again) { again = false; arm(0); } else arm();
        });
    }
    function poke() { if (stopped) return; if (busy) { again = true; return; } arm(0); }
    function listen(target, type, fn) {
      try { target.addEventListener(type, fn); bound.push([target, type, fn]); } catch (_) {}
    }
    listen(document, 'visibilitychange', function () {
      try { if (document.hidden) { arm(); return; } } catch (_) {}
      poke();
    });
    listen(window, 'focus', poke);
    listen(window, 'pageshow', poke);
    listen(window, 'online', function () { flushQueue(); poke(); });
    listen(window, 'storage', function (e) { if (e && e.key === PING_KEY) poke(); });
    if (chan) listen(chan, 'message', poke);

    tick();
    return function () {
      stopped = true;
      if (timer) clearTimeout(timer);
      bound.forEach(function (b) { try { b[0].removeEventListener(b[1], b[2]); } catch (_) {} });
      bound = [];
    };
  }

  /* ─── announce a sale that just landed ───
   * All this module paints now. It used to own a green "En direct · ventes" card
   * pinned above the hero, which said the same thing twice: the hero already
   * reads "Encaissé aujourd'hui" off the same total, and the transactions feed
   * already lists the same rows off the same store. The card is gone; the toast
   * stays, because a sale rung on a till in the next room should announce itself
   * on the owner's screen. Backfill never toasts — see `backfill` in watchFeed. */
  function notifySale(s) {
    if (!s || !window.Kiwi || typeof window.Kiwi.toast !== 'function') return;
    var mlabel = METHOD_LABEL[s.method] || (s.method || 'Vente');
    try {
      window.Kiwi.toast('Vente encaissée · ' + fmtMAD(s.amount) + ' MAD', {
        desc: mlabel + ' · ' + (s.label || 'en direct'), type: 'success',
      });
    } catch (_) {}
  }

  /* ─── bridge: real feed sales → the dashboard's sales store ───
   * Every dashboard surface —
   * "Encaissé aujourd'hui", the objectif bar, "Net après Kiwi", the vs-hier/
   * semaine/mois deltas, the sidebar order/revenue counts, the revenue chart —
   * recomputes from window.KiwiSales (see dateRange.js). So a Live-Link sale must
   * land in that store or it reaches no surface at all — which was exactly the bug
   * (a real cashier sale, dashboard numbers frozen at zero).
   * Only custom (onboarded, real) venues read KiwiSales for their KPIs, so gate on
   * that — mirrors the local-caisse quick-sale path in interactive.js.
   * Dedup against the sales ALREADY in the store, keyed by the feed's monotonic
   * rowid cursor (persisted on each entry), NOT a standalone counter: watchFeed
   * replays from since=0 on every load, so we must skip sales the store already
   * holds — but reading that fact FROM the store means a cleared or re-keyed store
   * re-ingests, and the dashboard total can never silently fall behind the feed.
   *
   * Self-healing against a venue-resolution RACE: the real venue id settles
   * ASYNCHRONOUSLY after boot — operator scoped view via applyScopedVenue() and a
   * real signed-in merchant via ensureOwnEmptyVenue() are both wired by identity.js
   * only after a server round-trip, i.e. AFTER the first feed poll has already
   * advanced its cursor. If we bridged only at poll time, that first batch would
   * land in whatever venue was current then (a demo venue ⇒ isCustom() false ⇒
   * dropped, or a stale/other id) and never reach the venue the dashboard reads.
   * So we accumulate every feed sale for the session and re-run the (idempotent,
   * cursor-deduped) bridge BOTH on each poll AND on every KiwiVenue change — the
   * moment the venue becomes the real one, the whole backlog lands in its store.
   *
   * The backlog is TENANT-STAMPED. On a multi-store account the merchant slug
   * changes when the owner switches store, and this accumulator outlives the
   * switch — replaying it blind poured the boutique's whole day into the
   * restaurant's store the moment the restaurant was opened. Each entry now
   * carries the merchant it was polled from, and only matching entries bridge. */
  var lastSync = 0;     // when the server last answered a poll (0 = never)
  var feedSales = [];   // every sale the feed has returned this session
  var feedSeen = {};    // merchant + '#' + cursor -> 1 (dedup across polls)

  /* ─── une vente sortie des livres s'en va d'ici aussi ───
   * Trois endroits gardent une copie d'une vente sur cet appareil, et les trois
   * doivent la lâcher, sinon elle revient :
   *
   *  1. window.KiwiSales — le magasin que TOUTES les surfaces du tableau de bord
   *     relisent (hero, bande KPI, graphique, journal des ventes, rapport
   *     journalier d'une journée ouverte, Kiwi AI). C'est celui qui change les
   *     chiffres à l'écran.
   *  2. `feedSales`, l'accumulateur du pont. Il rejoue TOUT le lot à chaque
   *     changement de venue ; le nettoyer est ce qui empêche la vente retirée de
   *     se réinstaller à la première résolution d'identité. Sans lui, le point 1
   *     serait défait deux secondes plus tard, et le bogue serait insaisissable.
   *  3. `kiwi:posDay:<métier>`, le journal local de la CAISSE. La caisse ne lit
   *     pas le flux mais elle exécute ce module, et son compteur du jour est ce
   *     que le commerçant a sous les yeux au comptoir. Une vente d'essai faite
   *     pendant l'installation resterait sinon dans « encaissé aujourd'hui »
   *     jusqu'à minuit, sur l'écran même où l'opérateur vient de promettre
   *     qu'elle était retirée. Elle s'y retrouve par sa RÉFÉRENCE de ticket : la
   *     caisse ne connaît pas les curseurs du flux.
   *
   * Le serveur renvoie les deux clés pour cette raison — { c: curseur, r: réf }. */
  /* La liste COMPLÈTE des références sorties des livres, telle que le serveur
     vient de la donner. Publiée (et non « les nouvelles depuis la dernière
     fois ») parce que c'est un ÉTAT, pas un événement : un métier qui la reçoit
     doit pouvoir remettre son journal d'accord avec elle dans les deux sens —
     une vente sortie des livres, mais aussi une vente REMISE dedans, qui se
     signale justement par sa disparition de cette liste. Un delta ne dirait
     jamais la seconde. */
  var voidedRefs = [];
  function voided() { return voidedRefs.slice(); }

  function applyVoids(list, tenant) {
    if (!list) return;
    var cursors = [], refs = [];
    list.forEach(function (v) {
      if (!v) return;
      var c = Number(v.c) || 0;
      if (c) { cursors.push(c); if (tenant) delete feedSeen[tenant + '#' + c]; }
      if (v.r) refs.push(String(v.r));
    });
    voidedRefs = refs;
    /* Annoncé À CHAQUE passage, même quand la liste est vide ou inchangée. Le
       module métier qui écoute est idempotent par construction (il compare son
       journal à cette liste), et c'est ce passage-là qui lui apprend qu'une
       vente est revenue. */
    try {
      document.dispatchEvent(new CustomEvent('kiwi-sales-voided', {
        detail: { refs: refs.slice(), merchant: tenant || '' },
      }));
    } catch (_) {}
    if (!list.length) return;
    if (cursors.length) {
      var kill = {};
      cursors.forEach(function (c) { kill[c] = 1; });
      feedSales = feedSales.filter(function (row) {
        return !(row && row.tenant === tenant && kill[Number(row.s && row.s.cursor) || 0]);
      });
      try {
        if (window.KiwiSales && window.KiwiSales.remove) {
          var vid = null;
          try { vid = (window.KiwiVenue && window.KiwiVenue.getVenue && window.KiwiVenue.getVenue()) || null; } catch (_) {}
          window.KiwiSales.remove(vid, cursors);
        }
      } catch (_) {}
    }
    if (refs.length) {
      try { if (window.KiwiPosSale && window.KiwiPosSale.dropRefs) window.KiwiPosSale.dropRefs(refs); } catch (_) {}
    }
  }
  function accumulateFeed(sales, tenant) {
    (sales || []).forEach(function (s) {
      var cur = Number(s && s.cursor) || 0;
      if (!cur) return;
      var k = tenant + '#' + cur;
      if (feedSeen[k]) return;
      feedSeen[k] = 1;
      feedSales.push({ s: s, tenant: tenant });
    });
  }
  function bridgeToStore() {
    var KV = window.KiwiVenue;
    if (!window.KiwiSales || !window.KiwiSales.add) return;
    /* Real session OR user-created venue. isCustom() alone dropped every sale
       of a hosted merchant sitting on a venue id that had not been flagged
       custom yet — the exact state a store is in for its first minutes, and
       after any venue-resolution hiccup. The sale reached the server, the
       toast fired, and the dashboard stayed at zero. */
    var own = false;
    try { own = !!(KV && KV.isCustom && KV.isCustom()) || !!(window.KiwiEnv && window.KiwiEnv.isReal && window.KiwiEnv.isReal()); } catch (_) { own = false; }
    if (!own) return;
    var vid = (KV.getVenue && KV.getVenue()) || null;
    var tenant = merchant();
    if (!tenant) return;                            // identity unresolved → bridge nothing
    var have = {};
    try { (window.KiwiSales.list(vid) || []).forEach(function (e) { if (e && e.cursor) have[e.cursor] = 1; }); } catch (_) {}
    feedSales.forEach(function (row) {
      if (row.tenant !== tenant) return;             // another store's money — never this one's
      var s = row.s;
      var cur = Number(s.cursor) || 0;
      if (!cur || have[cur]) return;                // no cursor, or already stored → skip
      var amt = Math.round(s.amount) || 0;
      if (amt <= 0) return;
      /* `lines` travels the last leg. Without it the dashboard's store held
         the money and the ticket summary only, so assets/agent-data.js fell back
         to its honest refusal on "quel est mon produit le plus vendu" for every
         merchant whose caisse is not in this same browser. */
      try { window.KiwiSales.add(vid, { amount: amt, method: s.method || 'cash', cursor: cur, ts: s.ts, label: s.label, lines: s.lines }); have[cur] = 1; } catch (_) {}
    });
  }

  /* The pump. Deliberately DOM-free: it no longer needs a host element to mount a
   * card into, so a layout the module doesn't recognise can never silently stop
   * the dashboard from receiving sales. */
  var pumping = false;
  function initPump() {
    if (!on() || pumping) return;
    pumping = true;
    flushQueue();             // a sale this device banked offline, still owed to the server
    watchFeed(function (sales, backfill, tenant) {
      accumulateFeed(sales, tenant);
      bridgeToStore();        // ← this is what moves the dashboard's real numbers
      if (!backfill) sales.forEach(notifySale);
    });
    // Re-run the bridge whenever the venue settles/changes — the operator scoped
    // venue and the real-merchant "own" venue both resolve AFTER this first poll,
    // so without this the pre-resolution sales would never reach the venue the
    // dashboard reads. Idempotent (cursor-deduped), so extra calls never double-count.
    try {
      if (window.KiwiVenue && window.KiwiVenue.subscribe) {
        window.KiwiVenue.subscribe(function () { bridgeToStore(); });
      }
    } catch (_) {}
  }

  /* ─── operator view banner ─── */
  // When the console opens a client with ?op=1, make it unmistakable that this is
  // the operator looking at THAT client (not the operator's own account), and
  // give a one-click way back. Read-only affordance; no client data is altered.
  function initOperatorBanner() {
    if (!opMode() || document.getElementById('kiwi-op-banner')) return;
    var bar = el('div');
    bar.id = 'kiwi-op-banner';
    bar.setAttribute('style', 'position:fixed;top:0;left:0;right:0;z-index:2147482000;display:flex;align-items:center;' +
      'justify-content:center;gap:10px;padding:7px 14px;background:linear-gradient(90deg,#053B2C,#0B6E4F);color:#eafff4;' +
      'font:600 12.5px/1.35 -apple-system,BlinkMacSystemFont,"Inter Tight",Inter,sans-serif;letter-spacing:.02em;' +
      'box-shadow:0 2px 14px -5px rgba(0,0,0,.55)');
    var dot = el('span');
    dot.setAttribute('style', 'width:7px;height:7px;border-radius:50%;background:#7DF2B0');
    bar.appendChild(dot);
    bar.appendChild(document.createTextNode('Vue opérateur · ' + merchant() + ' · données du client'));
    var back = el('a', null, 'Retour console ›');
    back.setAttribute('href', '/kiwi-admin.html');
    back.setAttribute('style', 'margin-inline-start:14px;color:#7DF2B0;text-decoration:none;font-weight:700');
    bar.appendChild(back);
    document.body.appendChild(bar);
    try {
      var pt = parseFloat(getComputedStyle(document.body).paddingTop) || 0;
      document.body.style.paddingTop = (pt + 34) + 'px';
    } catch (_) {}
  }

  // In operator view, skip the client's PIN lock — the operator is not the staff
  // and should land straight on the dashboard. Uses the app's own skip control so
  // the normal reveal (card entrance, etc.) still runs.
  function opSkipLock() {
    if (!opMode()) return;
    var tries = 0;
    (function attempt() {
      var lock = document.querySelector('[data-kiwi-lock]');
      // Done once the lock is gone or already unlocking. The skip button exists in
      // the static HTML before its click handler is wired, so keep clicking until
      // the lock actually reacts rather than clicking once into the void.
      if (!lock || lock.classList.contains('is-unlocking')) return;
      var skip = document.querySelector('[data-kiwi-skip]');
      if (skip) { try { skip.click(); } catch (_) {} }
      if (tries++ < 30) setTimeout(attempt, 120);
    })();
  }

  /* ─── le sondage des retraits, côté CAISSE ───
   * La caisse n'a pas de magasin de ventes à remplir, donc initPump() ne tourne
   * pas ici et rien ne lui apprendrait qu'une vente a été sortie des livres. Or
   * c'est l'écran du comptoir : une vente d'essai passée pendant l'installation
   * reste dans « encaissé aujourd'hui » sous les yeux du commerçant, alors que
   * l'opérateur vient de lui dire au téléphone qu'elle était retirée.
   *
   * Lent à dessein — 90 s, plus un passage immédiat au réveil de l'onglet. Ce
   * n'est pas de l'encaissement, c'est une correction d'après-coup : la faire
   * arriver dans la minute suffit, et une caisse en plein service a mieux à
   * faire que de sonder. Ne demande QUE la liste des retraits (voids=1), donc
   * une requête minuscule qui ne rejoue jamais la journée. */
  var VOID_MS = 90000;
  function watchVoids() {
    if (!on()) return;
    var timer = null;
    function tick() {
      var m = merchant();
      if (!m) { timer = setTimeout(tick, VOID_MS); return; }
      fetch('/api/feed?voids=1&merchant=' + encodeURIComponent(m), { headers: { Accept: 'application/json' } })
        .then(function (r) { return (r && r.ok) ? r.json() : null; })
        .then(function (d) { if (d && Array.isArray(d.voided)) applyVoids(d.voided, m); })
        .catch(function () {})
        .then(function () { timer = setTimeout(tick, VOID_MS); });
    }
    function poke() { if (timer) clearTimeout(timer); timer = setTimeout(tick, 0); }
    try {
      document.addEventListener('visibilitychange', function () { if (!document.hidden) poke(); });
      window.addEventListener('focus', poke);
      window.addEventListener('online', poke);
    } catch (_) {}
    tick();
  }

  function boot() {
    // The feed pump belongs to the DASHBOARD — it is the only page with a sales
    // store to fill (KiwiSales lives in venues.js, which the tills don't load).
    // A till still runs everything else here: postSale, the offline queue, the
    // ping that wakes the owner's dashboard. It used to mount the "En direct"
    // card and poll the feed on the caisse and the serveur too, purely because
    // those pages happen to have a <main> — a card the cashier had no use for
    // and a poll for data the page never read.
    if (window.KiwiSales) initPump();
    // Pas de magasin de ventes ⇒ nous sommes sur une caisse : elle n'a pas
    // besoin du flux, mais elle doit apprendre les retraits (voir watchVoids).
    else watchVoids();
    // Retry the queue whenever the network comes back, on every page (a till is
    // where the sales are, and it is the device most likely to be offline).
    try { window.addEventListener('online', flushQueue); } catch (_) {}
    flushQueue();
    initOperatorBanner();
    opSkipLock();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  window.KiwiLive = {
    isOn: on, merchant: merchant, postSale: postSale, watchFeed: watchFeed,
    flush: flushQueue, pending: function () { return qRead().length; },
    queueStatus: queueStatus,
    /* Le serveur a confirmé la portée opérateur : le slug de l'adresse peut
       enfin s'épingler. Seul identity.js appelle ceci, après /api/me. */
    confirmScope: function (slug) {
      scopeConfirmed = true;
      var s = String(slug || '').trim();
      if (s) pin(s);
      return true;
    },
    /* Ce que le serveur a sorti des livres, à la dernière réponse. Pour un
       module métier monté APRÈS le premier passage : l'événement lui a échappé,
       l'état, non. */
    voidedRefs: voided,
    /* What the assistant prints under an answer: which tenant it is reading,
       when the server last answered, how many rows it has bridged, and how
       many sales this device still owes the server. A number a merchant can
       trace is a number a merchant can argue with. */
    status: function () {
      return {
        on: on(), merchant: merchant(), lastSync: lastSync,
        bridged: feedSales.length, queued: qRead().length,
        queue: queueStatus(),
      };
    },
  };
})();
