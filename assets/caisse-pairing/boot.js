
  /* ── LA PREUVE DE CAISSE, VÉRIFIÉE À CHAQUE LANCEMENT ──────────────────────
   * Une tablette appairée dans son localStorage peut très bien n'avoir jamais
   * reçu, ou avoir perdu, son cookie `kiwi_till`. Tant que la session du patron
   * est ouverte sur l'appareil, rien ne le montre : tout passe par la session.
   * Le jour où elle se ferme (un « Sortir », un mot de passe changé), la page de
   * la caisse ne s'ouvre plus et le comptoir tombe sur l'écran de connexion du
   * patron. On demande donc au serveur, une fois par lancement, si l'appareil
   * est bien la caisse de ce magasin ; s'il dit non, on répare en silence
   * (preuve terminal, sinon la session encore ouverte). Sans réseau, sans
   * session ni preuve terminal, rien ne s'affiche : la caisse sert comme avant.
   * Un jeton renouvelé revient seul dans sa réponse ; le second appel apporte
   * le cookie du magasin (functions/api/pair/state.js). */
  var tillProofChecked = false;
  function ensureTillProof(venue) {
    if (tillProofChecked || !hosted() || !venue || !venue.merchant) return;
    tillProofChecked = true;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
    pairState(venue).then(function (state) {
      if (state && state.paired === true) {
        if (state.renewed) return pairState(venue).catch(function () {});
        return null;
      }
      if (state && state.paired === false) return repair({ interactive: false });
      return null;
    }, function (err) {
      /* Sans preuve de caisse ni session, la porte du site refuse même cette
         question (401/403). C'est justement le cas à réparer : la preuve
         terminal peut avoir survécu. 503 et réseau ne prouvent rien. */
      var s = err && err.status;
      if (s === 401 || s === 403) return repair({ interactive: false });
      return null;
    }).catch(function () { /* réparation impossible sans réseau ni preuve */ });
  }

  /* ── boot ───────────────────────────────────────────────────────────────
   * Local (demos allowed): no-op — native demo pad as before.
   * Hosted + paired: boot straight into the bound store.
   * Hosted + unpaired: show the pairing pad. */
  function boot() {
    hookPinReset();
    // A terminal that locks its store returns to the pairing pad (which offers a
    // one-tap "reprendre" when still bound). Hosted always; local only once bound.
    try {
      if (window.KiwiPosDispatch && window.KiwiPosDispatch.lock && !window.KiwiPosDispatch.__cpWrapped) {
        var origLock = window.KiwiPosDispatch.lock;
        window.KiwiPosDispatch.lock = function () {
          try { origLock.apply(this, arguments); } catch (_) {}
          if (isPaired()) setTimeout(function () { bootWithPin(pairedVenue()); }, 60);
          else setTimeout(function () { bootWithPin(null); }, 60);
        };
        window.KiwiPosDispatch.__cpWrapped = true;
      }
    } catch (err) {
      if (window.KiwiReportError) window.KiwiReportError(err, 'tenant:sale_lock_wrapper_failed');
    }

    if (window.__kiwiCaisseBootedAsDemo === false) {
      try { sessionStorage.removeItem(HANDOFF_RELOAD); } catch (_) {}
    }

    if (wantsPair()) {
      var h = takeHandoff();
      if (h) {
        var handed = applyPairing('', h).venue;
        if (reloadAsPaired(h)) return;
        if (h.operator === true) bootForOperator(handed);
        else {
          /* Boot immediately so a slow network never blocks the register. The
             secure cookie is repaired in parallel; KiwiLive listens for the
             resulting `kiwi-paired` event and drains the existing outbox. */
          bootWithPin(handed);
          pairFromAccount(handed).catch(function () {});
        }
        return;
      }
      var code = newestPending();
      if (code) {
        redeem(code).then(function (res) {
          if (res && res.ok) bootWithPin(res.venue);
          else if (isPaired()) bootWithPin(pairedVenue());
          else bootWithPin(null);
        });
        return;
      }
    }

    if (isPaired()) { bootWithPin(pairedVenue()); ensureTillProof(pairedVenue()); return; }

    var h2 = takeHandoff();
    if (h2) {
      var handed2 = applyPairing('', h2).venue;
      if (reloadAsPaired(h2)) return;
      if (h2.operator === true) bootForOperator(handed2);
      else {
        bootWithPin(handed2);
        pairFromAccount(handed2).catch(function () {});
      }
      return;
    }

    bootWithPin(null);
  }

  /* Le code frappé, soumis au serveur, contre l'identité qu'il prouve — ou null.
   * Un seul chemin pour toutes les portes de la caisse, et aucune comparaison
   * de code dans le navigateur. */
  /* What the last verification ran into, for the pad's message: 429 is the
     attempt limiter. The pad said « Code incorrect ou impossible à vérifier »
     to someone typing the right code during a lockout. */
