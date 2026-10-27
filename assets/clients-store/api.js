  /* ── live updates (same-tab + cross-tab, via KiwiStore) ─────────────────── */
  function subscribe(fn) { return clientsStore.subscribe(function (vid) { try { fn(vid); } catch (_) {} }); }
  // The fidelity PROGRAM (model / targets / rewards) is its own record — the
  // dashboard configurator writes it and the caisse Carnet must re-read it live,
  // so a merchant who changes "10 cafés = 1 offert" on the laptop sees the till's
  // header update without a reload. Same-tab notify here; cross-tab via `storage`.
  function subscribeConfig(fn) { return fidelityStore.subscribe(function (vid) { try { fn(vid); } catch (_) {} }); }

  window.KiwiClients = {
    bookId: bookId,
    hasBook: function () { return !!bookId(); },
    // reads
    list: list, get: get, purchaseSyncStatus: purchaseSyncStatus, refusedRedemptions: refusedRedemptions, findByPhone: findByPhone, count: count,
    // writes
    upsert: upsert, recordPurchase: recordPurchase, recordRefund: recordRefund, redeem: redeem, redemptionRef: redemptionRef, reserveRedemption: reserveRedemption, remove: remove,
    // fidelity config
    config: config, setConfig: setConfig, defaultModel: defaultModel, loyaltyOn: loyaltyOn,
    // analytics
    segment: segment, segmentCounts: segmentCounts, progress: progress,
    // helpers
    normPhone: normPhone, samePhone: samePhone, daysSince: daysSince,
    subscribe: subscribe, subscribeConfig: subscribeConfig,
    // backend sync (fail-soft — no-op until /api/clients + D1 are deployed)
    pull: pull, sync: startSync, syncable: function (b) { return syncable(b || bookId()); },
  };

  // Kick the sync loop, and (re)start it the moment a device goes live / pairs.
  window.addEventListener('storage', function (e) {
    if (e && (e.key === 'kiwiLive' || e.key === 'kiwiLiveMerchant' || e.key === 'kiwiPaired' || e.key === 'kiwiPairedVenue')) startSync();
  });
  startSync();
})();
