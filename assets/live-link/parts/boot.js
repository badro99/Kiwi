
  function boot() {
    // The feed pump belongs to the DASHBOARD — it is the only page with a sales
    // store to fill (KiwiSales lives in venues.js, which the tills don't load).
    // A till still runs everything else here: postSale, the offline queue, the
    // ping that wakes the owner's dashboard. It used to mount the "En direct"
    // card and poll the feed on the caisse and the serveur too, purely because
    // those pages happen to have a <main> — a card the cashier had no use for
    // and a poll for data the page never read.
    var tillPage = /\/kiwi-caisse(?:\.html)?\/?$/.test(location.pathname || '');
    if (opMode() && !tillPage) {
      /* Query parameters request a scope; /api/me authorizes it. A confirmed God
         Mode view receives the whole entitled ledger exactly once, then becomes
         a stable snapshot. Owners keep the normal live 2.5 s feed. */
      var identity = window.KiwiIdentity;
      function snapshotUnavailable(reason) {
        publishSnapshot({ phase: 'error', merchant: merchant(), pages: 0, rows: 0, completedAt: 0, error: reason });
      }
      if (identity && identity.ready && typeof identity.ready.then === 'function') {
        identity.ready.then(function (state) {
          var confirmed = !!(state && state.operator === true);
          if (!confirmed) { snapshotUnavailable('identity'); return; }
          /* The banner and PIN bypass do not depend on the sales store. Some
             dashboard bundles publish KiwiSales a beat after DOMContentLoaded;
             coupling all operator UI to its presence made an authenticated view
             look half-authorized. Give that store one short boot window, never a
             recurring data poll. */
          initOperatorBanner(true);
          publishSnapshot({ phase: 'loading', merchant: merchant(), pages: 0, rows: 0, completedAt: 0, error: null });
          opSkipLock(true);
          var tries = 0;
          (function startSnapshot() {
            if (window.KiwiSales) { initPump(true); return; }
            if (tries++ < 20) setTimeout(startSnapshot, 50);
            else snapshotUnavailable('ledger');
          })();
        }, function () { snapshotUnavailable('identity'); });
      }
      else snapshotUnavailable('identity');
    }
    else if (window.KiwiSales) initPump(false);
    // Pas de magasin de ventes ⇒ nous sommes sur une caisse : elle n'a pas
    // besoin du flux, mais elle doit apprendre les retraits (voir watchVoids).
    else watchVoids();
    // Retry the queue whenever the network comes back, on every page (a till is
    // where the sales are, and it is the device most likely to be offline).
    /* Opening IndexedDB and atomically importing the legacy queue is async.
       Flush only after that choice has settled, otherwise the old array and
       the new outbox could race to submit the same sale (the server would
       dedupe it, but the terminal would briefly report two debts). */
    var recoveryStarted = false, lastWake = 0;
    function startRecovery() {
      if (recoveryStarted) return;
      recoveryStarted = true;
      function wake(force) {
        if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
        var now = Date.now();
        if (!force && now - lastWake < 1000) return;
        lastWake = now;
        initOutbox().then(function () { return flushQueue(force === true); }).catch(function () { scheduleRecovery(); });
      }
      window.addEventListener('online', function () { wake(true); });
      window.addEventListener('focus', function () { wake(false); });
      document.addEventListener('visibilitychange', function () { if (!document.hidden) wake(false); });
      document.addEventListener('kiwi-paired', function () { lastWake = 0; wake(true); });
      document.addEventListener('kiwi-config', function () { wake(false); });
      // WebViews sometimes miss online/focus. Probe pending debt only; failed
      // requests retain their own backoff and never change identity or payload.
      function watchdog() {
        if (queueStatus().pending > 0) wake(false);
        setTimeout(watchdog, 30000);
      }
      setTimeout(watchdog, 30000);
      wake(false);
    }
    if (!opMode()) startRecovery();
    else if (tillPage) {
      // Inspecting a support till is still read-only. Explicitly opening or
      // resuming its service enables the same recovery as a paired till.
      document.addEventListener('kiwi:caisse-service-ready', startRecovery);
      if (window.KiwiTillServiceReady === merchant()) startRecovery();
    }
    /* Operator UI is mounted only in the signed-identity branch above. An URL
       containing `op=1` alone must show neither the banner nor the PIN bypass. */
  }
  function startBoot() {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
    else boot();
  }
  if (window.KiwiDashboardBoot?.whenUnlocked) window.KiwiDashboardBoot.whenUnlocked(startBoot);
  else startBoot();

  window.KiwiLive = {
    isOn: on, merchant: merchant, moneyStorageReady: moneyStorageReady, postSale: postSale, postRefund: postRefund,
    snapshotStatus: function () { return operatorSnapshot ? Object.assign({}, operatorSnapshot) : null; },
    moneyId: function (entry) { var m = merchant(); return m && entry ? stableId(m, entry) : ''; }, watchFeed: watchFeed,
    flush: flushQueue, retrySale: retrySale, retryBlockedSales: retryBlockedSales,
    pending: function () { return saleQueue.count(); },
    quarantineRows: quarantineRows,
    quarantineHeld: function (id, tenant) { return quarantineUpdate(id, tenant, false); },
    quarantineSettled: function (id, tenant) { return quarantineUpdate(id, tenant, true); },
    queueStatus: queueStatus, refreshQueue: refreshOutboxStatus,
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
    voidedSaleIds: voidedSaleIds,
    voidEvents: voidedEventList,
    /* What the assistant prints under an answer: which tenant it is reading,
       when the server last answered, how many rows it has bridged, and how
       many sales this device still owes the server. A number a merchant can
       trace is a number a merchant can argue with. */
    /* Unique identifier formula for sales rows in D1. Deterministic across all
       surfaces (dashboard, caisses, reprints) to guarantee 1 sale = 1 invoice. */
    saleIdFor: function (entry, m) { return stableId(m || merchant(), entry); },
    canonicalSaleId: canonicalSaleId,
    status: function () {
      return {
        on: on(), merchant: merchant(), lastSync: lastSync, feedError: lastFeedError,
        bridged: feedSales.length, backfillComplete: !!feedComplete[merchant()], queued: queueStatus().total,
        queue: queueStatus(),
        snapshot: operatorSnapshot ? Object.assign({}, operatorSnapshot) : null,
      };
    },
  };
  window.KiwiLiveLink = window.KiwiLive;
})();

/* Transfer custody without discarding an unresolved money operation. */
(function () {
  'use strict';
  var running = null;
  function clean(value) {
    if (Array.isArray(value)) return value.map(clean);
    if (!value || typeof value !== 'object') return value;
    var out = Object.create(null);
    Object.keys(value).forEach(function (key) {
      if (!key.startsWith('_') && !/approval|password|pin|token|secret|credential|pairing|staffcode/i.test(key)) out[key] = clean(value[key]);
    });
    return out;
  }
  function sync() {
    if (running) return running;
    var live = window.KiwiLive;
    if (!live || !live.quarantineRows) return Promise.resolve();
    running = live.quarantineRows().then(async function (rows) {
      for (var row of rows) {
        var controller = typeof AbortController === 'function' ? new AbortController() : null;
        var timer = controller ? setTimeout(function () { controller.abort(); }, 15000) : null;
        try {
          var body = row._serverHeld ? { action: 'status', merchant: row.merchant, id: row.id }
            : { action: 'upload', merchant: row.merchant, payload: clean(row), reason: row._error };
          var response = await fetch('/api/quarantine', { method: 'POST', credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: controller ? controller.signal : undefined });
          if (!response.ok) continue;
          var data = await response.json();
          if (!data.ok || data.id !== row.id) continue;
          if (['approved', 'declined'].includes(data.status)) await live.quarantineSettled(row.id, row.merchant);
          else if (['pending', 'approving'].includes(data.status)) await live.quarantineHeld(row.id, row.merchant);
        } catch (_) { /* Local custody remains intact until a verified response. */ }
        finally { if (timer != null) clearTimeout(timer); }
      }
    }).catch(function () {}).finally(function () { running = null; });
    return running;
  }
  // No timers of its own: the till's send cycle (boot, reconnect, every feed
  // poll) calls kick(), which syncs at most every 30 s.
  var lastKick = 0;
  function kick() {
    var now = Date.now();
    if (running || now - lastKick < 30000) return;
    lastKick = now;
    sync();
  }
  window.KiwiQuarantine = { sync: sync, kick: kick };
})();
