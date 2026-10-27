
  window.KiwiCaissePairing = {
    verifyReply: verifyReply, noteApproval: noteApproval,
    offlineRow: function (code, opts) { var v = activeVenue(); return (v && v.merchant ? verifyOfflinePin(v.merchant, code) : Promise.resolve(null)).then(function (who) { return who && opts && opts.manager && Date.now() - who.provenAt >= 24 * 3600000 ? null : who; }); },
    lastRequestFailed: function () { return lastFailed; },
    isPaired: isPaired, pairedVenue: pairedVenue, showPad: showPad, redeem: redeem,
    repair: repair, recoverFromTerminal: recoverFromTerminal, terminalId: terminalId,
    repairFromAccount: pairFromAccount, repairWithCode: repairWithCode,
    unpair: unpair, bootVertical: bootVertical,
    // Who unlocked this till, for any surface that needs to name them.
    refreshRoster: pinsFor,
    staff: function () { return window.KiwiStaff || null; }, setStaff: setStaff,
    /* ── Autoriser une opération protégée (remise, annulation, retrait) ──────
     * Ces deux fonctions comparaient le code frappé à `pinList`, ce qui n'était
     * possible que parce que /api/config expédiait les codes. Elles interrogent
     * maintenant le même vérificateur que le pavé d'ouverture, et rendent donc
     * une PROMESSE — l'appelant (kiwi-caisse.html › managerCodeValid) l'attend.
     * En cas de panne on répond false : une autorisation qu'on ne peut pas
     * prouver n'est pas une autorisation. */
    authorizeTill: function (code, opts) {
      var roles = window.KiwiRoles;
      if (!roles || typeof roles.opensTill !== 'function') return Promise.resolve(false);
      return verifyCode(code, undefined, opts && opts.needsServer ? { needsServer: true } : undefined).then(function (who) {
        if (!who || !roles.opensTill(who.role || '')) return false;
        lastOperator = { id: String(who.id || '').slice(0, 80), name: String(who.name || '').trim() || 'Caissier', role: String(who.role || '').trim(), actorProof: who.actorProof || '' };
        return true;
      });
    },
    authorizeManager: function (code, action) {
      return verifyCode(code, action).then(function (who) {
        if (who && who.offline && Date.now() - who.provenAt >= 24 * 60 * 60 * 1000) return false;
        var role = String((who && who.role) || '').toLowerCase();
        if (!who || !/owner|propri|manager|g[eé]rant|responsable|admin/.test(role)) return false;
        /* Une autorisation qui ne dit pas QUI a autorisé ne vaut rien le jour où
         * on la relit : le code prouve une personne, on garde donc son nom
         * (jamais le code) pour que la surface qui a demandé l'accord puisse
         * l'écrire dans sa vente. */
        if (action && action.kind === 'refund' && !who.approval) return false;
        lastManager = { id: String(who.id || '').slice(0, 80), name: String(who.name || '').trim() || 'Responsable', role: String(who.role || '').trim(), approval: String(who.approval || '') };
        lastOperator = lastManager;
        return true;
      });
    },
    // Le dernier responsable ayant validé un code, pour l'écrire dans un journal.
    lastManager: function () { return lastManager; },
    lastOperator: function () { return lastOperator; },
    /* How the last code check ended: `offline` is true when it could not reach
       the server and the act needed the server's own answer. */
    lastVerifyState: function () { return { status: lastVerify.status, wait: lastVerify.wait, offline: !!lastVerify.offline }; },
  };

  /* Back online. A cashier unlocked against a cached verifier proves the code
     to the server once more, whatever the roster says. A cashier the server
     already proved keeps working mid-sale unless the fresh roster no longer
     holds them. */
  if (window.addEventListener) window.addEventListener('online', function () {
    var venue = activeVenue();
    if (!venue || !venue.merchant) return;
    var who = window.KiwiStaff;
    if (who && who.offline) { setStaff(null); askStaff(venue); return; }
    pinsFor(venue.merchant).then(function (gate) {
      who = window.KiwiStaff;
      var R = window.KiwiRoles;
      if (who && gate && gate.pins && !(R && R.rosterHolds && R.rosterHolds(gate.pins, who))) { setStaff(null); askStaff(venue); }
    }).catch(function () {});
  });
  if (pairedVenue()) offlinePinRows(pairedVenue().merchant); // Purge obsolete verifiers before any unlock.
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
