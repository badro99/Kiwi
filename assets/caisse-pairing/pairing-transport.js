
  /* ── redeem: backend first, fail-soft to the same-browser map ──────────── */
  function applyPairing(code, d) {
    /* Poser l'appairage est un geste PARTAGÉ : la caisse n'est pas le seul
     * appareil qui s'appaire (kiwi-cuisine.html le fait aussi, sur la même
     * route). Il vit donc une fois, dans assets/pairing-commit.js, et ce qui
     * reste ici est ce qui n'appartient qu'à la caisse : le caissier et la
     * boutique appairée. Le module manque ⇒ on REFUSE d'appairer plutôt que de
     * lier un nouveau commerçant par-dessus les données de l'ancien. */
    var commit = window.KiwiPairingCommit && window.KiwiPairingCommit.commit;
    if (!commit) {
      var err = new Error('pairing-commit-unavailable');
      if (window.KiwiReportError) window.KiwiReportError(err, 'tenant:pairing_commit_missing');
      return { ok: false, error: 'commit-unavailable' };
    }
    var previousVenue = pairedVenue();
    return commit(code, d, {
      // Re-binding to a DIFFERENT store: the cashier who unlocked the old till is
      // not standing at this one, and their code belongs to the other store's
      // roster. Forget them so the staff pad asks again.
      onTenantSwitch: function () {
        /* AVANT la purge : le service ouvert de l'ancien commerce est mis de
           côté sous une clé qu'elle ne touche pas. Réappairer à ce commerce le
           rend (assets/till-tenant.js), au lieu de le perdre avec le reste. */
        quarantineService(previousVenue);
        if (previousVenue && previousVenue.merchant) del(offlinePinKey(previousVenue.merchant));
        resetPinState();
        setStaff(null);
        window.__kiwiPairedBoutiqueVenue = null;
        /* Le SERVICE de l'autre commerce, le JOURNAL DES VENTES, le catalogue,
           le carnet de clientes — tout cela part aussi, mais dans
           pairing-commit.js : ce n'est pas propre à la caisse. Historique de
           cette purge, pour qui la remettrait en cause : une caisse ré-appairée
           d'une enseigne à une autre affichait, chez un client en production le
           30/07/2026, les ventes d'un AUTRE commerce dans « Échanges & avoirs »,
           leurs tickets dans « Réimprimer », et l'une d'elles dans la recette du
           jour. Le tableau de bord fermait déjà cette porte-là (identity.js, au
           changement de COMPTE) ; une caisse, elle, ne se connecte pas — elle
           s'appaire, et cette seconde porte n'avait pas de serrure. */
      },
    });
  }
  function localRedeem(code) {
    var map = readMap();
    var e = map[code];
    if (!e) return { ok: false, error: 'invalid' };
    if (e.exp && e.exp < Date.now()) return { ok: false, error: 'expired' };
    return applyPairing(code, e);
  }
  function redeem(code) {
    code = String(code || '').replace(/\D/g, '').slice(0, 6);
    if (code.length !== 6) return Promise.resolve({ ok: false, error: 'bad-code' });
    return fetch('/api/pair/redeem', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: code, terminalId: terminalId() }),
    }).then(function (r) {
      if (r.status === 404 || r.status === 405) return localRedeem(code); // backend absent → same-browser
      return r.json().then(function (j) {
        if (j && j.ok) {
          var committed = applyPairing(code, j);
          if (!committed || !committed.ok) return committed;
          return confirmTillProof(committed.venue || j, committed);
        }
        return { ok: false, error: (j && j.error) || 'invalid' };        // 422 etc — real rejection
      });
    }).catch(function () { return localRedeem(code); });                 // network → same-browser
  }

  /* ── repair a local-only/stale pairing without touching the outbox ─────────
   * A same-browser dashboard hand-off used to write only localStorage. The till
   * therefore looked connected, but never received the httpOnly `kiwi_till`
   * cookie that /api/sale requires. Every receipt was correctly retained by the
   * durable outbox, then rejected forever with 403.
   *
   * The signed-in owner/operator session may mint a short-lived server code.
   * Redeeming it immediately gives this physical terminal a fresh epoch-bound
   * cookie. applyPairing() is deliberately called for the SAME merchant: the
   * shared commit sees `switched === false`, so sales, the active shift and the
   * queued receipts are never purged. A terminal without an owner/operator
   * session simply gets a typed 401/403 error and keeps every receipt locally. */
  var repairPromise = null;
  function pairError(message, status) {
    var err = new Error(message || 'pairing-repair-failed');
    err.status = Number(status) || 0;
    return err;
  }
  function jsonOrEmpty(response) {
    return response.json().catch(function () { return {}; });
  }
  function pairState(venue) {
    /* terminalId : le serveur renouvelle un ancien jeton en jeton à NOTRE nom,
       que le propriétaire pourra retirer sans toucher aux autres caisses. */
    return fetch('/api/pair/state?merchant=' + encodeURIComponent(venue.merchant) + '&terminalId=' + encodeURIComponent(terminalId()), {
      credentials: 'same-origin', cache: 'no-store', headers: { Accept: 'application/json' },
    }).then(function (r) {
      return jsonOrEmpty(r).then(function (j) {
        if (!r.ok) throw pairError((j && j.error) || 'pair-state-failed', r.status);
        return j || {};
      });
    });
  }
  /* The stable terminal cookie is separate from the revocable till cookie.
     Recover from it before minting a new one-time pairing: this is the path a
     kiosk needs when its browser retained only one Set-Cookie value. The route
     emits only kiwi_till, so the renewed proof cannot be hidden behind another
     cookie in the same response. */
  function recoverFromTerminal(venue) {
    venue = venue || pairedVenue();
    if (!venue || !venue.merchant) return Promise.reject(pairError('merchant-missing', 0));
    return fetch('/api/pair/recover', {
      method: 'POST', credentials: 'same-origin', cache: 'no-store',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ merchant: venue.merchant, terminalId: terminalId() }),
    }).then(function (r) {
      return jsonOrEmpty(r).then(function (j) {
        if (!r.ok || !j || !j.ok || String(j.merchant || '') !== String(venue.merchant)) {
          throw pairError((j && j.error) || 'terminal-recovery-failed', r.status);
        }
        try { document.dispatchEvent(new CustomEvent('kiwi-paired', { detail: { merchant: venue.merchant } })); } catch (_) {}
        return { ok: true, recovered: true, venue: venue };
      });
    });
  }
  function confirmTillProof(venue, committed) {
    /* After a fresh redeem, force a one-cookie recovery response when the
       terminal proof survived. If that proof was the cookie a legacy kiosk
       dropped, the till cookie may already be valid; the state probe proves it
       before we accept the repair. */
    return recoverFromTerminal(venue).then(function () { return committed; }, function (recoverError) {
      return pairState(venue).then(function (state) {
        if (state && state.paired === true) return committed;
        throw recoverError;
      });
    });
  }
  function pairFromAccount(venue) {
    venue = venue || pairedVenue();
    if (!venue || !venue.merchant) return Promise.reject(pairError('merchant-missing', 0));
    if (repairPromise) return repairPromise;

    repairPromise = fetch('/api/pair/create', {
      method: 'POST',
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        merchant: venue.merchant, type: venue.type || '', subtype: venue.subtype || '',
        name: venue.name || '', location: venue.location || '',
      }),
    }).then(function (r) {
      return jsonOrEmpty(r).then(function (j) {
        if (!r.ok || !j || !j.ok || !/^\d{6}$/.test(String(j.code || ''))) {
          throw pairError((j && j.error) || 'pair-create-failed', r.status);
        }
        return String(j.code);
      });
    }).then(function (code) {
      return fetch('/api/pair/redeem', {
        method: 'POST',
        credentials: 'same-origin',
        cache: 'no-store',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ code: code, terminalId: terminalId() }),
      }).then(function (r) {
        return jsonOrEmpty(r).then(function (j) {
          if (!r.ok || !j || !j.ok) throw pairError((j && j.error) || 'pair-redeem-failed', r.status);
          if (String(j.merchant || '') !== String(venue.merchant)) throw pairError('pair-merchant-mismatch', 409);
          /* /api/pair/redeem owns merchant/type/name; the hand-off owns the
             display-only venueId/location, which the API intentionally omits. */
          var committed = applyPairing(code, Object.assign({}, venue, j));
          if (!committed || !committed.ok) throw pairError((committed && committed.error) || 'pair-commit-failed', 0);
          return confirmTillProof(committed.venue || venue, committed);
        });
      });
    }).finally(function () { repairPromise = null; });
    return repairPromise;
  }

  function quarantineService(venue) {
    try {
      if (venue && venue.merchant && window.KiwiTillTenant) window.KiwiTillTenant.quarantine(venue.merchant, venue.name);
    } catch (err) {
      if (window.KiwiReportError) window.KiwiReportError(err, 'tenant:quarantine_failed');
    }
  }

  function unpair() {
    /* Unpairing used to delete only four binding keys. Pairing a different
       merchant afterwards then saw no `was` venue and skipped the cross-tenant
       purge, exposing the previous sales/menu/customers on the new till. */
    var oldVenue = pairedVenue();
    quarantineService(oldVenue);
    purgeTenantData();
    if (oldVenue && oldVenue.merchant) del(offlinePinKey(oldVenue.merchant));
    window.__kiwiPairedBoutiqueVenue = null;
    resetPinState();
    setStaff(null);                     // this device is nobody's till any more
    try {
      if (window.KiwiPosDispatch && window.KiwiPosDispatch.lock) window.KiwiPosDispatch.lock();
    } catch (err) {
      if (window.KiwiReportError) window.KiwiReportError(err, 'tenant:unpair_sale_lock_failed');
    }
    showPad();
  }
