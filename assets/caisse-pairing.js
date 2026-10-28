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
 * Client-first + fail-soft: redeem tries POST /api/pair/redeem and falls back to the
 * same-browser localStorage pairing map (kiwiPairings) the dashboard writes. A 404/405/
 * network error means "backend absent" → localStorage; a 422 is a real bad/expired code.
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

  var TERMINAL_KEY = 'kiwi:caisse:terminal-id:v1';
  var OFFLINE_PIN_KEY = 'kiwi:caisse:offline-pins:v1:';
  var OFFLINE_PIN_TTL = 72 * 60 * 60 * 1000;
  function terminalId() {
    var current = '';
    try { current = localStorage.getItem(TERMINAL_KEY) || ''; } catch (_) {}
    if (/^[A-Za-z0-9_-]{12,80}$/.test(current)) return current;
    try { current = 'term_' + crypto.randomUUID().replace(/-/g, ''); }
    catch (_) { current = 'term_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 18); }
    set(TERMINAL_KEY, current);
    return current;
  }

  function env() { return window.KiwiEnv || { demosAllowed: true }; }
  function hosted() { return env().demosAllowed === false; }
  function ls(k) { try { return localStorage.getItem(k); } catch (_) { return null; } }
  function set(k, v) { try { localStorage.setItem(k, v); return true; } catch (_) { console.warn("[pairing] offline identity storage unavailable"); toast((window.KiwiCaisseLang || { tr: function (s) { return s; } }).tr("Accès hors ligne non enregistré. Une connexion sera nécessaire au prochain déverrouillage.")); return false; } }
  function del(k) { try { localStorage.removeItem(k); } catch (_) {} }
  function readMap() { try { return JSON.parse(ls('kiwiPairings') || '{}') || {}; } catch (_) { return {}; } }

  /* A real till must keep authorizations usable during a network outage, but
   * never bank the four-digit code itself. After the server proves a code, keep
   * a tenant-scoped PBKDF2-SHA-256 verifier plus the proven identity for 72
   * hours. A candidate typed offline is hashed again and compared locally. The
   * short TTL limits a revoked code's offline lifetime; the next successful
   * online verification refreshes it. */
  function offlinePinKey(merchant) { return OFFLINE_PIN_KEY + encodeURIComponent(String(merchant || '')); }
  /* `keep`, when given, drops the rows it refuses as well (a roster that no
     longer holds them, a code the server just refused); any such drop also
     cancels verifiers being written in flight. */
  function offlinePinRows(merchant, keep) {
    try {
      var rows = JSON.parse(ls(offlinePinKey(merchant)) || '[]');
      var at = (window.KiwiTrustedClock || Date).now(); /* horloge ancrée sur le serveur (pairing-commit.js) */
      var kept = Array.isArray(rows) ? rows.filter(function (row) {
        return row && (row.v === 2 && row.hash) && Number(row.expiresAt || 0) > at && at - Number(row.provenAt || (Number(row.expiresAt) - 7 * 86400000)) < OFFLINE_PIN_TTL;
      }) : [];
      if (keep) {
        var held = kept.filter(function (row) { try { return !!keep(row); } catch (_) { return false; } });
        if (held.length !== kept.length) offlinePinEpoch++;
        kept = held;
      }
      if (JSON.stringify(kept) !== JSON.stringify(rows)) set(offlinePinKey(merchant), JSON.stringify(kept));
      return kept;
    } catch (_) { return []; }
  }
  function bytesHex(bytes) {
    return Array.from(new Uint8Array(bytes)).map(function (b) { return b.toString(16).padStart(2, '0'); }).join('');
  }
  /* 1M PBKDF2-SHA-256 rounds: about 85 ms on a recent Mac, a few hundred ms on
     a cheap tablet. A four-digit code cannot be made unguessable offline; this
     moves enumerating a copied cache from milliseconds to many minutes. Every
     row of one till shares one salt, so an unlock costs ONE derivation however
     many staff are cached (twelve rows used to mean twelve). */
  var PIN_ITERATIONS = 1000000;
  function hasSubtle() { return !!(window.crypto && window.crypto.subtle && window.TextEncoder); }
  function pinDigest(merchant, salt, code, iterations) {
    if (!hasSubtle()) return Promise.resolve('');
    var subtle = window.crypto.subtle;
    var bytes = new Uint8Array(salt.match(/../g).map(function (h) { return parseInt(h, 16); }));
    return subtle.importKey('raw', new TextEncoder().encode(String(merchant) + ':' + code),
      'PBKDF2', false, ['deriveBits']).then(function (key) {
      return subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: bytes, iterations: iterations }, key, 256);
    }).then(bytesHex);
  }
  function sameDigest(a, b) {
    if (!/^[a-f0-9]{64}$/.test(a) || !/^[a-f0-9]{64}$/.test(b)) return false;
    var diff = 0;
    for (var i = 0; i < 64; i += 2) diff |= parseInt(a.slice(i, i + 2), 16) ^ parseInt(b.slice(i, i + 2), 16);
    return diff === 0;
  }
  var offlinePinEpoch = 0;
  function rememberOfflinePin(merchant, code, staff, expiresAt) {
    var epoch = offlinePinEpoch, provenAt = (window.KiwiTrustedClock || Date).now();
    if (!staff || !/^\d{4}$/.test(String(code || ''))) return Promise.resolve(staff);
    // In an insecure context subtle is absent: retain the existing behaviour
    // (no local verification or new cache entry), never a JS PBKDF2 fallback.
    if (!hasSubtle()) return Promise.resolve(staff);
    return Promise.resolve().then(function () {
      var shared = offlinePinRows(merchant).find(function (row) {
        return row.v === 2 && row.it === PIN_ITERATIONS && /^[a-f0-9]{32}$/.test(row.salt);
      });
      var salt = shared ? shared.salt : bytesHex(window.crypto.getRandomValues(new Uint8Array(16)));
      return pinDigest(merchant, salt, code, PIN_ITERATIONS).then(function (hash) {
        /* The derivation ran behind the unlock: if the till was unpaired or
           moved to another store meanwhile, this store's verifier must not
           come back after its purge. */
        var still = activeVenue();
        if (epoch !== offlinePinEpoch || !still || String(still.merchant || '') !== String(merchant)) return staff;
        var rows = offlinePinRows(merchant).filter(function (row) {
          return String(row.staff && row.staff.id || '') !== String(staff.id || '');
        });
        rows.push({ v: 2, kdf: 'pbkdf2-sha256', it: PIN_ITERATIONS, salt: salt, hash: hash,
          provenAt: provenAt, expiresAt: expiresAt || provenAt + OFFLINE_PIN_TTL,
          staff: { id: String(staff.id || '').slice(0, 80), name: String(staff.name || '').slice(0, 80),
            role: String(staff.role || '').slice(0, 80) } });
        set(offlinePinKey(merchant), JSON.stringify(rows.slice(-12))); // Bounded: each cached verifier is one more offline guess target.
        return staff;
      });
    }).catch(function () { return staff; }); // Cache failure cannot reject a server-proven unlock.
  }
  function verifyOfflinePin(merchant, code) {
    var epoch = offlinePinEpoch;
    if (!hasSubtle()) return Promise.resolve(null);
    if (window.KiwiTrustedClock && window.KiwiTrustedClock.rolledBack()) return Promise.resolve(null); /* clock moved back: wait for the server */
    var rows = offlinePinRows(merchant);
    /* One derivation per (salt, rounds) pair, not per row. */
    var derived = {};
    function derive(row) {
      var k = row.it + ':' + row.salt;
      if (!derived[k]) derived[k] = pinDigest(merchant, row.salt, code, row.it);
      return derived[k];
    }
    return Promise.all(rows.map(function (row) {
      if (row.v !== 2 || row.kdf !== 'pbkdf2-sha256' || !Number.isSafeInteger(row.it) || row.it < PIN_ITERATIONS ||
          row.it > 2000000 || !/^[a-f0-9]{32}$/.test(row.salt)) return null;
      return derive(row).then(function (digest) {
        var nowMs = (window.KiwiTrustedClock || Date).now(); if (epoch !== offlinePinEpoch || !sameDigest(digest, row.hash) || nowMs >= row.expiresAt ||
            nowMs - Number(row.provenAt || (row.expiresAt - 7 * 86400000)) >= OFFLINE_PIN_TTL) return null;
        var who = Object.assign({}, row.staff, { provenAt: Number(row.provenAt || (Number(row.expiresAt) - 7 * 86400000)), offline: true });
        return who;
      }).catch(function () { return null; });
    })).then(function (matches) { return matches.find(Boolean) || null; });
  }

  function isPaired() { return ls('kiwiPaired') === '1'; }
  function pairedVenue() { try { return JSON.parse(ls('kiwiPairedVenue') || 'null'); } catch (_) { return null; } }

  /* Tenant data leaves with the pairing; hardware identity stays with the
     physical till. Implemented once in assets/pairing-commit.js — the kitchen
     screen pairs through the same door and must purge the same way. */
  function purgeTenantData() {
    var commit = window.KiwiPairingCommit;
    if (commit && commit.purgeTenantData) commit.purgeTenantData();
  }

  // Same-device hand-off: the dashboard opens kiwi-caisse.html?pair=1 in this
  // browser, having named the store in kiwiPairHandoff (caisse-link.js handOff).
  function wantsPair() { try { return /[?&]pair=1\b/.test(location.search || ''); } catch (_) { return false; } }
  function wantsOperatorAccess() { try { return /[?&]op=1\b/.test(location.search || ''); } catch (_) { return false; } }
  /* Read and CONSUME the hand-off. Consuming it matters: it is a one-shot
   * instruction from a specific click, and leaving it behind would re-bind the
   * device on some later unrelated visit. Stale ones are ignored — a record older
   * than a few minutes is a leftover, not an intent. */
  var HANDOFF = 'kiwiPairHandoff';
  function takeHandoff() {
    var raw = ls(HANDOFF);
    if (!raw) return null;
    del(HANDOFF);
    try {
      var h = JSON.parse(raw);
      if (!h || !h.merchant) return null;
      if (h.ts && (Date.now() - h.ts) > 10 * 60 * 1000) return null;
      return h;
    } catch (_) { return null; }
  }
  /* The register freezes "demo or real" when it mounts (kiwi-caisse.html
   * IS_DEMO, pos-boutique.js likewise) — on purpose, so a pairing mid-service
   * never rewrites a half-served menu. But the same-device hand-off pairs
   * DURING boot, after that freeze: a real café's till opened on the 35-dish
   * demo menu at invented prices, and would ring them up. Nothing has been
   * served yet at this point, so put the hand-off back and reload once; the
   * second boot mounts as the real store and runs the hand-off normally
   * (operator mode and the till-cookie repair included). The session flag
   * makes a loop impossible even if pairing somehow failed to stick. */
  var HANDOFF_RELOAD = 'kiwiHandoffReload';
  function reloadAsPaired(h) {
    if (window.__kiwiCaisseBootedAsDemo !== true || !isPaired()) return false;
    try {
      if (sessionStorage.getItem(HANDOFF_RELOAD) === '1') return false;
      sessionStorage.setItem(HANDOFF_RELOAD, '1');
    } catch (_) { return false; }
    set(HANDOFF, JSON.stringify(Object.assign({}, h, { ts: Date.now() })));
    try { location.reload(); } catch (_) { return false; }
    return true;
  }
  function newestPending() {
    var m = readMap(), now = Date.now(), best = null, bestT = -1;
    for (var c in m) { var e = m[c]; if (e && e.status === 'pending' && (!e.exp || e.exp > now)) { var t = e.createdAt || 0; if (t >= bestT) { bestT = t; best = c; } } }
    return best;
  }

  /* ── type/subtype → caisse vertical ─────────────────────────────────────
   * The onboarding trade id (subtype) maps 1:1 to a dispatcher vertical for
   * most trades; a couple are aliased. Operator and server hand-offs carry the
   * exact trade in `type` (and often no `subtype`), so both fields must pass
   * through the same registry lookup before the four base-type fallbacks.
   * restaurant/cafe → the main restaurant caisse (unlockApp), not a vertical. */
  var SUB_ALIAS = { bakery: 'boulangerie', sport: 'gym' };
  function registryIds() {
    var reg = (window.KiwiPosDispatch && window.KiwiPosDispatch.registry) || {};
    var ids = {};
    Object.keys(reg).forEach(function (pin) { ids[reg[pin].id] = true; });
    return ids;
  }
  function routeFor(v) {
    if (!v) return { kind: 'app' };
    var ids = registryIds();
    var sub = String(v.subtype || '').toLowerCase();
    sub = SUB_ALIAS[sub] || sub;
    if (sub && ids[sub]) return { kind: 'vertical', id: sub };
    var t = String(v.type || '').toLowerCase();
    t = SUB_ALIAS[t] || t;
    if (t && ids[t]) return { kind: 'vertical', id: t };
    if (t === 'boutique' && ids.boutique) return { kind: 'vertical', id: 'boutique' };
    if (t === 'spa' && ids.spa) return { kind: 'vertical', id: 'spa' };
    if (t === 'hotel' && ids.hotel) return { kind: 'vertical', id: 'hotel' };
    return { kind: 'app' };
  }

  function bootVertical(v) {
    var gate = document.getElementById('till-boot-gate');
    if (gate) gate.remove();
    hidePad();
    hideNativePin();
    var lockScr = document.getElementById('cp-pin-screen');
    if (lockScr) lockScr.style.display = 'none';
    var route = routeFor(v);
    if (route.kind === 'vertical' && window.KiwiPosDispatch && window.KiwiPosDispatch.unlockById) {
      /* Ticket #0022 · the boutique venue key must not outlive a boutique
       * pairing: any other vertical clears it, or maison keeps reading and
       * writing the wrong store's stock through the stale key. */
      window.__kiwiPairedBoutiqueVenue = route.id === 'boutique' ? ((v && v.venueId) || null) : null;
      window.KiwiPosDispatch.unlockById(route.id);
    } else if (typeof window.__kiwiUnlockApp === 'function') {
      window.__kiwiUnlockApp();
    }
  }

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

  /* ── the 6-digit pairing pad (reuses .pin-screen / .pin-pad CSS) ────────── */
  var buf = '';
  var pairSubmitting = false;
  function hideNativePin() { var n = document.getElementById('pin-screen'); if (n) n.style.display = 'none'; }
  function dotsHtml() {
    var out = '';
    for (var i = 0; i < 6; i++) out += '<span class="pin-dot' + (i < buf.length ? ' is-filled' : '') + '"></span>';
    return out;
  }
  function renderDots() { var d = document.getElementById('cp-dots'); if (d) d.innerHTML = dotsHtml(); }
  function key(n) { return '<button class="pin-key" data-cp="' + n + '">' + n + '</button>'; }

  function injectCss() {
    if (document.getElementById('cp-style')) return;
    var s = document.createElement('style'); s.id = 'cp-style';
    s.textContent =
      '.pin-screen{position:fixed;inset:0;background-color:#04120D;background-image:radial-gradient(65% 50% at 50% 8%,rgba(0,255,174,0.14),transparent 60%),radial-gradient(70% 60% at 85% 92%,rgba(12,107,78,0.32),transparent 60%),radial-gradient(60% 55% at 12% 88%,rgba(4,36,26,0.88),transparent 60%),linear-gradient(165deg,#051811 0%,#020C08 100%);z-index:500;display:flex;align-items:center;justify-content:center;padding:24px;color:#fff;animation:pin-fade-in 400ms cubic-bezier(0.16,1,0.3,1);}' +
      '.pin-card{display:flex;flex-direction:column;align-items:center;width:100%;max-width:440px;padding:38px 36px 32px;background:rgba(14,30,23,0.82);border:1px solid rgba(255,255,255,0.14);border-radius:28px;box-shadow:0 0 0 1px rgba(0,255,174,0.08),0 28px 72px -16px rgba(0,0,0,0.75),0 0 90px -25px rgba(0,255,174,0.16);backdrop-filter:blur(32px) saturate(1.4);-webkit-backdrop-filter:blur(32px) saturate(1.4);box-sizing:border-box;transition:transform 300ms ease,box-shadow 300ms ease;}' +
      '.pin-brand{display:inline-flex;align-items:center;margin-bottom:20px;}' +
      '.pin-brand img{height:36px;width:auto;}' +
      '.pin-greet{font-family:var(--sans,-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif);font-size:24px;font-weight:700;letter-spacing:-0.03em;color:#F5FAF7;margin-bottom:6px;text-align:center;}' +
      '.pin-prompt{font-family:var(--mono,ui-monospace,SFMono-Regular,Menlo,monospace);font-size:11px;font-weight:600;letter-spacing:0.14em;text-transform:uppercase;color:#00FFAE;margin-bottom:22px;text-align:center;}' +
      '.pin-dots{display:flex;gap:16px;margin-bottom:26px;}' +
      '.pin-dot{width:18px;height:18px;border-radius:50%;border:2px solid rgba(255,255,255,0.18);background:rgba(255,255,255,0.04);transition:all 200ms cubic-bezier(0.16,1,0.3,1);}' +
      '.pin-dot.is-filled{background:#00FFAE;border-color:#00FFAE;box-shadow:0 0 0 4px rgba(0,255,174,0.22),0 0 16px rgba(0,255,174,0.55);transform:scale(1.15);}' +
      '.pin-dot.is-success{animation:pin-success-pop 360ms cubic-bezier(0.32,0.72,0,1) both;}' +
      '@keyframes pin-success-pop{0%{transform:scale(1.15);background:#00FFAE;border-color:#00FFAE;box-shadow:0 0 0 0 rgba(0,255,174,0.6)}45%{transform:scale(1.6);background:#00FFAE;border-color:#00FFAE;box-shadow:0 0 0 12px rgba(0,255,174,0.4)}100%{transform:scale(1.2);background:#00FFAE;border-color:#00FFAE;box-shadow:0 0 0 0 rgba(0,255,174,0)}}' +
      '.pin-pad{display:grid;grid-template-columns:repeat(3,72px);gap:14px;}' +
      '.pin-key{width:72px;height:72px;border-radius:50%;background:rgba(255,255,255,0.06);border:1.5px solid rgba(255,255,255,0.12);color:#F5FAF7;font-family:var(--sans,-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif);font-size:26px;font-weight:600;display:inline-flex;align-items:center;justify-content:center;transition:all 160ms cubic-bezier(0.16,1,0.3,1);font-feature-settings:"tnum" 1;box-shadow:0 4px 12px rgba(0,0,0,0.25);cursor:pointer;}' +
      '.pin-key:hover{background:rgba(255,255,255,0.12);border-color:rgba(0,255,174,0.35);transform:translateY(-2px);box-shadow:0 8px 20px rgba(0,0,0,0.35);}' +
      '.pin-key:active{transform:scale(0.92);background:rgba(0,255,174,0.22);border-color:#00FFAE;box-shadow:0 0 20px rgba(0,255,174,0.45);}' +
      '.pin-key.is-action{background:transparent;border-color:transparent;box-shadow:none;font-size:15px;font-weight:600;letter-spacing:0.02em;color:rgba(255,255,255,0.65);}' +
      '.pin-key.is-action svg{width:22px;height:22px;}' +
      '.pin-key.is-action:hover{color:#00FFAE;background:rgba(0,255,174,0.10);border-color:rgba(0,255,174,0.25);}' +
      '#cp-resume{margin:18px auto 0;display:inline-block;background:rgba(0,255,174,0.12);border:1px solid rgba(0,255,174,0.25);border-radius:999px;padding:8px 20px;cursor:pointer;color:#00FFAE;font:inherit;font-size:.9rem;font-weight:600;text-decoration:none;transition:all 160ms cubic-bezier(0.16,1,0.3,1);box-shadow:0 4px 16px -4px rgba(0,255,174,0.3);}' +
      '#cp-resume:hover{background:rgba(0,255,174,0.22);transform:translateY(-2px);box-shadow:0 6px 20px -2px rgba(0,255,174,0.45);}' +
      '.pin-foot{margin-top:22px;font-family:var(--mono,ui-monospace,SFMono-Regular,Menlo,monospace);font-size:10.5px;color:rgba(255,255,255,0.45);letter-spacing:0.10em;text-transform:uppercase;text-align:center;line-height:1.5;}' +
      '.pin-screen.is-error .pin-card{animation:cp-shake .4s;}' +
      '@keyframes cp-shake{10%,90%{transform:translateX(-3px)}30%,70%{transform:translateX(6px)}50%{transform:translateX(-8px)}}' +
      '@keyframes pin-fade-in{from{opacity:0;transform:scale(1.02);filter:blur(4px)}to{opacity:1;transform:scale(1);filter:blur(0)}}';
    document.head.appendChild(s);
  }

  /* ── LE PAVÉ D'APPAIRAGE, QUE PLUS RIEN NE DESSINAIT ─────────────────────
   * `feed`, `submit`, `dotsHtml`, `injectCss` et les deux gestionnaires
   * délégués (#cp-pad [data-cp]) attendaient tous un écran `#cp-screen` que
   * AUCUNE fonction de ce fichier ne construisait plus. pairFromAccount()
   * ci-dessus répare la caisse SANS geste — mais seulement quand ce navigateur
   * porte encore la session propriétaire du tableau de bord. Sur un comptoir,
   * il ne la porte typiquement pas : c'est une caisse, pas un bureau. Ce
   * terminal-là recevait un 401/403 et le conseil d'aller ouvrir un tableau de
   * bord ailleurs, pendant que ses ventes s'empilaient. On lui redonne le seul
   * geste qu'il puisse faire sur place : taper un code à six chiffres. */
  function renderPairPad(opts) {
    opts = opts || {};
    /* Design 2027 (kiwiSkin2027:till): the same door on the kit's pad, through
       KiwiPinFlow's pair and store rows (assets/kit/till-pin.js). A code that
       got no answer is never sent again by itself; the store lock's pad has a
       Back that returns to the lock's screen (§10.26). */
    if (window.KiwiTillPin && window.KiwiTillPin.pair) {
      window.KiwiTillPin.pair({
        use: opts.store ? 'store' : 'pair',
        venue: opts.venue || null,
        prompt: opts.store ? opts.prompt : '',
        foot: opts.store ? opts.foot : '',
        request: redeemReply,
        commit: commitRedeem,
        done: pairDone,
        back: hidePad,
      });
      return;
    }
    injectCss();
    var scr = document.getElementById('cp-screen');
    if (!scr) {
      scr = document.createElement('div');
      scr.className = 'pin-screen';
      scr.id = 'cp-screen';
      scr.setAttribute('role', 'dialog');
      scr.setAttribute('aria-modal', 'true');
      scr.setAttribute('aria-label', 'Appairage de la caisse');
      document.body.appendChild(scr);
    }
    scr.style.display = '';
    buf = '';
    var known = opts.venue && opts.venue.name;
    scr.innerHTML =
      '<div class="pin-card">' +
        '<div class="pin-brand" aria-label="Kiwi"><img src="assets/kiwi-newlogo-inverse.svg" alt="" draggable="false"></div>' +
        '<div class="pin-greet">' + esc(known ? opts.venue.name : 'Appairer cette caisse') + '</div>' +
        '<div class="pin-prompt">' + esc(opts.prompt || 'CODE D\u2019APPAIRAGE · 6 CHIFFRES') + '</div>' +
        '<div class="pin-dots" id="cp-dots" aria-hidden="true">' + dotsHtml() + '</div>' +
        '<div class="pin-pad" id="cp-pad">' +
          key(1) + key(2) + key(3) + key(4) + key(5) + key(6) + key(7) + key(8) + key(9) +
          '<button class="pin-key is-action" data-cp="clear" aria-label="Effacer tout">C</button>' + key(0) +
          '<button class="pin-key is-action" data-cp="back" aria-label="Effacer">' +
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 5H7l-5 7 5 7h14a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2z"/><line x1="18" y1="9" x2="12" y2="15"/><line x1="12" y1="9" x2="18" y2="15"/></svg>' +
          '</button>' +
        '</div>' +
        '<div class="pin-foot">' + esc(opts.foot || 'G\u00e9n\u00e9rez un code depuis Tableau de bord \u203a Caisse') + '</div>' +
      '</div>';
    renderDots();
  }

  /* Réappairer n'est PAS dépairer. La tablette est toujours celle de ce
   * magasin ; c'est sa preuve qui a disparu, pas son affectation. unpair()
   * aurait purgé le locataire — service en cours, additions, journal — pour
   * réparer un cookie. Les ventes déjà encaissées ne vivent pas dans les clés
   * du locataire : elles restent en file et repartent seules. */
  /* `opts` : l'écran de verrouillage (assets/till-tenant.js) ouvre ce pavé
   * pour ramener la caisse à son commerce d'ORIGINE ; il nomme ce commerce,
   * pas celui auquel la caisse est appairée par erreur. */
  function repairWithCode(opts) {
    opts = opts || {};
    var pv = opts.venue || pairedVenue();
    renderPairPad({
      /* The store lock names the store it pairs back to (till-tenant.js). */
      store: !!opts.venue,
      venue: pv,
      prompt: opts.prompt || 'R\u00c9APPAIRER · CODE \u00c0 6 CHIFFRES',
      foot: opts.foot || (pv && pv.name
        ? 'Cet appareil a perdu sa preuve d\u2019appairage. Les ventes en attente sont conserv\u00e9es et repartiront seules.'
        : 'G\u00e9n\u00e9rez un code depuis Tableau de bord \u203a Caisse'),
    });
  }

  /* Les deux chemins, dans l'ordre où ils coûtent au commerçant. Silencieux
   * d'abord : si ce navigateur porte encore la session du tableau de bord,
   * personne n'a rien à faire. Sinon — le cas d'un vrai comptoir — on ne rend
   * la main sur un cul-de-sac QUE si le geste a été demandé : un pavé qui
   * s'ouvrirait tout seul par-dessus la caisse en plein service serait pire
   * que le problème qu'il répare. */
  function repair(opts) {
    return Promise.resolve()
      .then(function () { return recoverFromTerminal(); })
      .catch(function () { return pairFromAccount(); })
      .catch(function (err) {
        if (!opts || !opts.interactive) throw err;
        repairWithCode();
        return { ok: true, pad: true };
      });
  }

  function showPad(force) {
    hidePad();
    var pv = isPaired() ? pairedVenue() : null;
    /* Hébergé seulement. En local (démos autorisées) un pavé d'appairage
       n'est satisfaisable par personne : dépairer y rendait la main à
       l'application, et doit continuer de le faire. */
    if (!pv && hosted()) { renderPairPad({}); return; }
    bootWithPin(pv);
  }
  function hidePad() { var s = document.getElementById('cp-screen'); if (s) s.style.display = 'none'; }
  function esc(x) { return String(x == null ? '' : x).replace(/[&<>"']/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]; }); }

  function feed(d) {
    if (pairSubmitting) return;
    if (d === 'clear') { buf = ''; }
    else if (d === 'back') { buf = buf.slice(0, -1); }
    else if (/^[0-9]$/.test(d) && buf.length < 6) { buf += d; }
    renderDots();
    if (buf.length === 6) submit();
  }
  /* The till is paired (either pad). */
  function pairDone(res) {
    hidePad();
    /* Le jeton est reposé : les ventes retenues par un 403 n'ont plus de
       raison d'attendre le prochain battement. `true` lève le recul
       d'authentification de soixante secondes. */
    try { if (window.KiwiLive && window.KiwiLive.flush) window.KiwiLive.flush(true); } catch (_) {}
    bootWithPin(res.venue);
  }
  /* The kit's pad (kiwiSkin2027:till) asks through KiwiPinFlow: one request,
     8 s, a reply it reads from its table. The shipped fail-soft stays: no
     backend (404, 405) reads the same-browser map; no answer reads it too, and
     only a match there counts, else the pad says no answer. */
  var lastPairCode = '';
  function localReply(code) {
    var e = readMap()[code];
    if (!e || (e.exp && e.exp < Date.now())) return { kind: 'answer', status: 422, json: true, body: { error: 'invalid_or_expired' } };
    return { kind: 'answer', status: 200, json: true, body: Object.assign({}, e, { ok: true, local: true }) };
  }
  function redeemReply(code) {
    code = lastPairCode = String(code || '').replace(/\D/g, '').slice(0, 6);
    return window.KiwiPinFlow.send('/api/pair/redeem', { code: code, terminalId: terminalId() }).then(function (reply) {
      if (reply.kind === 'answer' && (reply.status === 404 || reply.status === 405)) return localReply(code);
      if (reply.kind !== 'answer') { var l = localReply(code); return l.status === 200 ? l : reply; }
      return reply;
    });
  }
  function commitRedeem(body) {
    var code = lastPairCode;
    if (body && body.local) {
      var d = Object.assign({}, body); delete d.ok; delete d.local;
      return applyPairing(code, d);
    }
    var committed = applyPairing(code, body);
    if (!committed || !committed.ok) return committed;
    return confirmTillProof(committed.venue || body, committed);
  }
  function submit() {
    if (pairSubmitting) return;
    pairSubmitting = true;
    var code = buf;
    redeem(code).then(function (res) {
      if (res && res.ok) {
        pairSubmitting = false;
        pairDone(res); return;
      }
      var scr = document.getElementById('cp-screen');
      if (scr) { scr.classList.add('is-error'); setTimeout(function () { scr.classList.remove('is-error'); }, 420); }
      /* "too_many_attempts" is the server's brute-force cap (429). Say so
       * plainly: a shop that mistyped its way into the lockout must know to
       * wait, not keep retrying a code it thinks is wrong. */
      toast(res && res.error === 'too_many_attempts'
              ? (globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr('Trop de tentatives. Réessayez dans quelques minutes.')
          : res && res.error === 'expired' ? (globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr('Code expiré, régénérez-en un.')
          : (globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr('Code invalide.'));
      buf = ''; renderDots();
      pairSubmitting = false;
    }).catch(function () {
      pairSubmitting = false;
      buf = ''; renderDots();
      toast((globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr('Connexion impossible. Réessayez.'));
    });
  }
  function toast(msg) {
    try {
      var stack = document.getElementById('toast-stack');
      if (stack) { var el = document.createElement('div'); el.className = 'toast'; el.textContent = msg; stack.appendChild(el); setTimeout(function () { el.classList.add('fade'); }, 2200); setTimeout(function () { el.remove(); }, 2480); return; }
    } catch (_) {}
    try {
      if (document.body) {
        var fb = document.createElement('div');
        fb.setAttribute('role', 'alert');
        fb.style.cssText = 'position:fixed;bottom:16px;left:50%;transform:translateX(-50%);background:#1f2937;color:#fff;padding:8px 16px;border-radius:8px;z-index:99999;font-size:14px;';
        fb.textContent = msg;
        document.body.appendChild(fb);
        setTimeout(function () { fb.remove(); }, 2500);
      }
    } catch (_) {}
  }

  /* ── staff PIN gate (F8) ─────────────────────────────────────────────────
   * Pairing binds the DEVICE to a store; it must not also authenticate the
   * PERSON. Before the register becomes usable, require one of the store's staff
   * PINs. /api/config?merchant=slug says WHETHER a gate is configured and WHO is
   * on the roster; it no longer says what the codes are, so the code typed on the
   * pad is checked by POST /api/pin/verify — rate-limited, server-side, and the
   * only place a four-digit code is ever compared. An explicitly empty roster
   * with no gate may open without a PIN, but an unreachable or malformed response
   * is UNKNOWN, not "no PINs": the till stays locked and offers a retry. */
  var pinBuf = '';
  var pinVenue = null;
  var pinList = null;   // [{name,role}] once fetched — the roster, never the codes
  /* Which store a code is judged against. The PAIRING is the authority, not the
   * pad: `pinVenue` is only what the staff pad last asked about, and nothing
   * guarantees it is still where this till is bound (an idle re-pair while
   * offline, a pair-back that skips the pad, an unpair). Trusting it let another
   * store's manager approve a discount here, through the server. So the paired
   * store always wins; `pinVenue` is used only when it IS that store, and an
   * unpaired till has no store to judge against. Resetting the state on switch
   * and unpair (resetPinState) is the second lock, not the first. */
  function activeVenue() {
    var paired = pairedVenue();
    if (!paired || !paired.merchant) return null;
    return pinVenue && pinVenue.merchant === paired.merchant ? pinVenue : paired;
  }
  function resetPinState() { pinVenue = null; pinList = null; pinBuf = ''; }

  /* ── who is at the till right now ─────────────────────────────────────────
   * A staff code is a PERSON, not just a door code: /api/pin/verify answers with
   * the {id, name, role} the code proved, so unlocking says exactly who opened
   * the register. That was thrown away — submitPin only asked "is this code in
   * the list?" — and every surface downstream fell back to pins[0]. So the
   * register greeted the first name on the roster, printed it on tickets and
   * filed every sale under it, whoever had actually unlocked it.
   *
   * Published as window.KiwiStaff (+ a `kiwi-staff` event for surfaces already
   * painted by the time the code is entered). Session-scoped: a reload re-asks
   * for the code anyway. The code itself is never stored — only the identity it
   * proved. */
  var STAFF_KEY = 'kiwiTillStaff';
  var lastManager = null;   // { id, name, role, approval } du dernier code responsable validé
  var lastOperator = null;  // { id, name, role } du dernier code caisse validé
  function firstNameOf(n) { return String(n || '').trim().split(/\s+/)[0] || ''; }
  function setStaff(p) {
    var s = null;
    if (p) {
      var name = String(p.name || '').trim() || 'Caissier';
      s = { id: String(p.id || '').slice(0, 80), name: name, role: String(p.role || '').trim() || 'Caissier', first: firstNameOf(name) || name };
      if (p.offline) s.offline = true;   // proven against a cached verifier, not the server
    }
    window.KiwiStaff = s;
    try {
      if (s) sessionStorage.setItem(STAFF_KEY, JSON.stringify(s));
      else sessionStorage.removeItem(STAFF_KEY);
    } catch (_) {}
    try { document.dispatchEvent(new CustomEvent('kiwi-staff', { detail: s })); } catch (_) {}
    return s;
  }
  // Survive a re-render inside the same tab (the boot sequence repaints a lot).
  try { window.KiwiStaff = JSON.parse(sessionStorage.getItem(STAFF_KEY) || 'null') || null; }
  catch (_) { window.KiwiStaff = null; }
  function keyP(n) { return '<button class="pin-key" data-cpp="' + n + '">' + n + '</button>'; }
  function pinsFor(merchant) {
    if (!merchant) return Promise.reject(new Error('merchant-missing'));
    var controller = new AbortController(), timer;
    var deadline = new Promise(function (_, reject) {
      timer = setTimeout(function () { reject(new Error('pin-config-timeout')); controller.abort(); }, 12000);
    });
    var loading = fetch('/api/config?merchant=' + encodeURIComponent(merchant), { signal: controller.signal, headers: { Accept: 'application/json' } })
      .then(function (r) {
        if (!r || !r.ok) throw new Error('pin-config-unavailable');
        return r.json();
      })
      .then(function (d) {
        if (controller.signal.aborted) throw new Error('pin-config-timeout');
        if (!d || !Array.isArray(d.pins)) throw new Error('pin-config-invalid');
        /* The roster replaces cached identities: a verifier whose person left
           the roster is dropped now. Wiping them all here left an outage with
           only the last cashier able to unlock; a changed code stays bounded
           by the 72-hour verifier lifetime. */
        offlinePinRows(merchant, function (row) {
          var R = window.KiwiRoles;
          return !!(R && R.rosterHolds && R.rosterHolds(d.pins, row.staff));   // no role module: fail closed
        });
        return { pins: d.pins, required: !!d.pinGateConfigured };
      });
    return Promise.race([loading, deadline]).finally(function () { clearTimeout(timer); });
  }
  // Gate a fresh register entry behind a staff PIN, then bootVertical. The single
  // choke point every entry path (redeem, ?pair=1, resume, already-paired boot)
  // routes through so the hosted caisse always asks who is opening the till.
  function askStaff(venue, onNoPins) {
    var merchant = (venue && venue.merchant) || '';
    /* Design 2027: the lock is up from the first frame. The till used to paint
       for the length of the roster fetch before the pad covered it (owner saw
       it flash, 2026-10-24). The pad checks codes on the server, so it needs
       no roster; a store with no codes just sees the door open. */
    if (merchant && window.KiwiTillPin && typeof window.KiwiTillPin.lock === 'function') showPinPad(venue);
    if (!merchant) {
      if (onNoPins) onNoPins();
      else bootVertical(venue);
      return;
    }
    pinsFor(merchant).then(function (gate) {
      var pins = (gate && gate.pins) || [];
      if (!pins.length && !(gate && gate.required)) {
        if (onNoPins) onNoPins();
        else bootVertical(venue);
        return;
      }
      pinVenue = venue; pinList = pins; pinBuf = '';
      showPinPad(venue);
    }).catch(function () {
      /* No network must not turn a configured register into an unlocked till.
       * A previously verified operator can still enter through the normal pad. */
      if (offlinePinRows(merchant).length) {
        pinVenue = venue; pinList = []; pinBuf = '';
        showPinPad(venue);
      } else if (onNoPins) onNoPins();
      else bootVertical(venue);
    });
  }
  function bootWithPin(venue) {
    askStaff(venue, function () { bootVertical(venue); });          // none configured → fail-soft
  }

  /* God mode may inspect a selected store's till without borrowing an employee
   * PIN. Never trust ?op=1 or the hand-off by themselves: /api/me validates the
   * httpOnly named-operator session and confirms that it is scoped to THIS slug.
   * If that proof fails, the normal staff gate remains intact. */
  function bootForOperator(venue) {
    var merchant = String((venue && venue.merchant) || '');
    if (!wantsOperatorAccess() || !merchant) { bootWithPin(venue); return; }
    fetch('/api/me?merchant=' + encodeURIComponent(merchant), { headers: { Accept: 'application/json' } })
      .then(function (r) { return r && r.ok ? r.json() : null; })
      .then(function (d) {
        if (!d || d.operator !== true || d.scoped !== true || String(d.slug || '') !== merchant) {
          bootWithPin(venue); return;
        }
        setStaff({ name: 'Kiwi Support', role: 'owner' });
        bootVertical(venue);
      })
      .catch(function () { bootWithPin(venue); });
  }

  /* A locked terminal must re-ask WHO is taking over, not just "a code".
   * KiwiPosDispatch.lock() calls __kiwiPinReset(), which restores the NATIVE pad
   * — the one that accepts any four digits and identifies nobody — so a shift
   * change on a real store dropped back to an anonymous till and the greeting
   * lost the name it had. On a paired store, resetting now means: forget the
   * cashier who just left, and show the staff pad again. A store with no codes
   * configured keeps the native pad exactly as before. */
  function hookPinReset() {
    var native = window.__kiwiPinReset;
    window.__kiwiPinReset = function () {
      var pv = pairedVenue();
      if (typeof native === 'function') { try { native.apply(this, arguments); } catch (_) {} }
      if (!pv) return;
      setStaff(null);
      askStaff(pv, null);
    };
  }
  function pinDotsHtml() {
    var out = '';
    for (var i = 0; i < 4; i++) out += '<span class="pin-dot' + (i < pinBuf.length ? ' is-filled' : '') + '"></span>';
    return out;
  }
  function renderPinDots() { var d = document.getElementById('cp-pin-dots'); if (d) d.innerHTML = pinDotsHtml(); }
  function showPinPad(venue) {
    injectCss(); hidePad(); hideNativePin();
    import('./offline-pin-coverage.js').then(function (coverage) {
      var current = activeVenue();
      if (!current || current.merchant !== venue.merchant) return;
      var rows = hasSubtle() ? offlinePinRows(venue.merchant) : [];
      var end = rows.length ? Math.min.apply(null, rows.map(function (r) { return Math.min(r.expiresAt, Number(r.provenAt || (r.expiresAt - 7 * 86400000)) + OFFLINE_PIN_TTL); })) : null;
      coverage.showCoverage(document.getElementById('cp-pin-screen'),
        (hasSubtle() ? offlinePinRows(venue.merchant) : []).map(function (row) { return row.staff && row.staff.name || ''; }).filter(Boolean),
        function (text) { return (window.KiwiCaisseLang || {tr:function (s) {return s;}}).tr(text); }, hasSubtle(), end);
    }).catch(function () {});
    try { document.documentElement.setAttribute('data-till-paired', ''); } catch (_) {}
    /* Design 2027 (kiwiSkin2027:till): the same door on the kit's pad, through
       assets/kit/till-pin.js. Loaded only with the flag; otherwise absent. */
    if (window.KiwiTillPin && typeof window.KiwiTillPin.lock === 'function') {
      window.KiwiTillPin.lock(venue, {
        verify: function (code) { return verifyReply(code); },
        row: function (code) { var v = activeVenue(); return v && v.merchant ? verifyOfflinePin(v.merchant, code) : Promise.resolve(null); },
        accept: function (who) {
          setStaff(who);
          var scr2 = document.getElementById('cp-pin-screen');
          if (scr2) scr2.style.display = 'none';
          bootVertical(activeVenue() || venue);
        },
        pair: function () { showPad(true); }
      });
      return;
    }
    var scr = document.getElementById('cp-pin-screen');
    if (!scr) {
      scr = document.createElement('div');
      scr.className = 'pin-screen';
      scr.id = 'cp-pin-screen';
      scr.setAttribute('role', 'dialog');
      scr.setAttribute('aria-modal', 'true');
      scr.setAttribute('aria-label', 'Code personnel');
      document.body.appendChild(scr);
    }
    scr.style.display = '';
    var noCashier = !pinList || !pinList.length;
    scr.innerHTML =
      '<div class="pin-card">' +
        '<div class="pin-brand" aria-label="Kiwi"><img src="assets/kiwi-newlogo-inverse.svg" alt="" draggable="false"></div>' +
        '<div class="pin-greet">' + esc((venue && venue.name) || 'Votre magasin') + '</div>' +
        '<div class="pin-prompt">CODE PERSONNEL · 4 CHIFFRES</div>' +
        '<div class="pin-dots" id="cp-pin-dots" aria-hidden="true">' + pinDotsHtml() + '</div>' +
        '<div class="pin-pad" id="cp-pin-pad">' +
          keyP(1) + keyP(2) + keyP(3) + keyP(4) + keyP(5) + keyP(6) + keyP(7) + keyP(8) + keyP(9) +
          '<button class="pin-key is-action" data-cpp="clear" aria-label="Effacer tout">C</button>' + keyP(0) +
          '<button class="pin-key is-action" data-cpp="back" aria-label="Effacer">' +
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 5H7l-5 7 5 7h14a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2z"/><line x1="18" y1="9" x2="12" y2="15"/><line x1="12" y1="9" x2="18" y2="15"/></svg>' +
          '</button>' +
        '</div>' +
        '<div class="pin-foot">' + (noCashier
          ? 'Aucun caissier configuré. Utilisez votre code Propriétaire ou Manager pour ouvrir la caisse.'
          : 'Code personnel géré depuis votre tableau de bord Kiwi') + '</div>' +
      '</div>';
    renderPinDots();
  }
  function showPinLoadError(venue) {
    var scr = document.getElementById('cp-pin-screen');
    if (scr) scr.style.display = 'none';
    bootVertical(venue);
  }
  var pinSubmitting = false;
  function feedPin(d) {
    if (pinSubmitting) return;
    if (d === 'clear') { pinBuf = ''; }
    else if (d === 'back') { pinBuf = pinBuf.slice(0, -1); }
    else if (/^[0-9]$/.test(d) && pinBuf.length < 4) { pinBuf += d; }
    renderPinDots();
    if (pinBuf.length === 4) submitPin();
  }
  function submitPin() {
    if (pinSubmitting) return;
    var code = pinBuf;
    var venue = activeVenue();
    var merchant = (venue && venue.merchant) || '';
    var scr = document.getElementById('cp-pin-screen');
    function refuse(msg) {
      if (scr) { scr.classList.add('is-error'); setTimeout(function () { scr.classList.remove('is-error'); }, 420); }
      toast(msg);
      pinBuf = ''; renderPinDots();
    }
    function acceptStaff(who) {
      /* A code that EXISTS is still not automatically a till code. The staff list
       * is the whole payroll — servers and kitchen staff carry one to clock in,
       * but only cashier/manager/owner assignments open money operations.
       * assets/staff-roles.js holds the same allow-list as the server. Name the
       * employee in the message: the code is right, the
       * person simply is not a cashier, and "Code incorrect" would send them
       * hunting for a typo that isn't there. */
      var R = window.KiwiRoles;
      if (R && R.opensTill && !R.opensTill(who.role)) {
        var f = firstNameOf(who.name);
        return refuse((f ? f + ', ce' : 'Ce') + ' code n’ouvre pas la caisse.');
      }
      setStaff(who);                                  // the till now knows whose shift this is
      if (scr) scr.style.display = 'none';
      bootVertical(venue);
    }
    /* Online, the server remains the judge. A successful verdict also refreshes
     * the short-lived local verifier used when this physical till loses Wi-Fi. */
    if (!merchant) { refuse('Caisse non appairée.'); return; }
    pinSubmitting = true;
    verifyCode(code).then(function (who) {
      if (who) { acceptStaff(who); return; }
      if (lastVerify.status === 429) {
        var mins = lastVerify.wait > 0 ? Math.max(1, Math.ceil(lastVerify.wait / 60)) : 0;
        refuse(mins ? 'Trop d’essais. Réessayez dans ' + mins + ' min.' : 'Trop d’essais. Réessayez dans quelques minutes.');
        return;
      }
      refuse(navigator.onLine === false
        ? 'Code non disponible hors ligne. Connectez-vous une fois avec ce code.'
        : 'Code incorrect ou impossible à vérifier.');
    }).finally(function () { pinSubmitting = false; });
  }

  // Delegated pad handling (survives re-renders of #cp-screen / #cp-pin-screen).
  document.addEventListener('click', function (e) {
    if (e.target && e.target.id === 'cp-pin-retry') { askStaff(activeVenue(), null); return; }
    var k = e.target.closest && e.target.closest('#cp-pad [data-cp]');
    if (k) { feed(k.getAttribute('data-cp')); return; }
    var kp = e.target.closest && e.target.closest('#cp-pin-pad [data-cpp]');
    if (kp) { feedPin(kp.getAttribute('data-cpp')); return; }
    if (e.target.closest && e.target.closest('#cp-resume')) { var pv = pairedVenue(); if (pv) { hidePad(); bootWithPin(pv); } }
  });
  document.addEventListener('keydown', function (e) {
    var pinScr = document.getElementById('cp-pin-screen');
    /* The 2027 lock's pad takes its own keys (assets/kit/till-pin.js). */
    if (pinScr && pinScr.classList.contains('k-till-lock')) return;
    if (pinScr && pinScr.style.display !== 'none') {
      if (/^[0-9]$/.test(e.key)) { feedPin(e.key); e.preventDefault(); }
      else if (e.key === 'Backspace') { feedPin('back'); e.preventDefault(); }
      return;
    }
    var scr = document.getElementById('cp-screen');
    if (!scr || scr.style.display === 'none') return;
    if (scr.classList.contains('k-till-lock')) return;
    if (/^[0-9]$/.test(e.key)) { feed(e.key); e.preventDefault(); }
    else if (e.key === 'Backspace') { feed('back'); e.preventDefault(); }
  });

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
  var lastVerify = { status: 0, wait: 0, offline: false };
  /* `opts.needsServer`: the act this code approves is a server write with no
     outbox (cancel a live order, reject an online order, cancel a table with a
     visit). The salted offline verifier must not approve it: the act would fail
     right after the approval. The attempt then ends with `lastVerify.offline`
     set and no identity, and the pad shows its needs-a-connection state. */
  function verifyCode(code, action, opts) {
    code = String(code || '');
    var venue = activeVenue();
    var merchant = (venue && venue.merchant) || '';
    if (!/^\d{4}$/.test(code) || !merchant) return Promise.resolve(null);
    var controller = new AbortController();
    var timer = setTimeout(function () { controller.abort(); }, 12000);
    lastVerify = { status: 0, wait: 0, offline: false };
    return fetch('/api/pin/verify', {
      method: 'POST',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ merchant: merchant, pin: code, ...(action ? { action: action } : {}) }),
    })
      .then(function (r) {
        try { if (window.KiwiTrustedClock) window.KiwiTrustedClock.observe(r); } catch (_) {}
        if (r && r.status === 429) {
          lastVerify.status = 429;
          return r.json().catch(function () { return {}; }).then(function (d) {
            lastVerify.wait = Math.max(0, Number(d && d.retry_after) || Number(r.headers.get('Retry-After')) || 0);
            return null;
          });
        }
        /* A code the server has just refused is revoked or changed: its offline
           verifier goes now. A mistyped code matches no verifier, drops nothing. */
        if (r && (r.status === 401 || r.status === 403)) return verifyOfflinePin(merchant, code).then(function (gone) {
          if (gone) offlinePinRows(merchant, function (row) { return String(row.staff && row.staff.id || '') !== String(gone.id || ''); });
          return null;
        }, function () { return null; });
        return r && r.ok ? r.json() : null;
      })
      .then(function (d) {
        if (!(d && d.ok && d.staff)) return null;
        var staff = Object.assign({}, d.staff, d.approval ? { approval: String(d.approval) } : {}, d.actorProof ? { actorProof: String(d.actorProof) } : {});
        /* The server said yes: unlock now, refresh the offline verifier behind. */
        rememberOfflinePin(merchant, code, staff);
        return staff;
      })
      .catch(function () {
        if (opts && opts.needsServer) { lastVerify.offline = true; return null; }
        return verifyOfflinePin(merchant, code);
      })
      .finally(function () { clearTimeout(timer); });
  }

  /* The 2027 pad's request (assets/kit/pin-flow.js): the server's answer as
     it came, status and body, so every row of §10.2's response table can be
     told apart. A proven code refreshes its salted row, as verifyCode does.
     `lastFailed` remembers that the till's last request threw, which is
     how the needs-connection state is known when a pad opens. */
  var lastFailed = false;
  function verifyReply(code, action) {
    var venue = activeVenue();
    var merchant = (venue && venue.merchant) || '';
    var F = window.KiwiPinFlow;
    if (!merchant) return Promise.resolve({ kind: 'answer', status: 403, json: true, body: { error: 'forbidden-till' } });
    if (!F || typeof F.send !== 'function') return Promise.resolve({ kind: 'network' });
    var body = { merchant: merchant, pin: String(code || '') };
    if (action) body.action = action;
    return F.send('/api/pin/verify', body).then(function (reply) {
      lastFailed = reply.kind !== 'answer';
      var d = reply.body;
      if (reply.kind === 'answer' && reply.status === 200 && d && d.ok && d.staff) {
        var staff = Object.assign({}, d.staff, d.approval ? { approval: String(d.approval) } : {}, d.actorProof ? { actorProof: String(d.actorProof) } : {});
        return rememberOfflinePin(merchant, code, staff).then(function () { return reply; }, function () { return reply; });
      }
      if (reply.kind === 'answer' && (reply.status === 401 || reply.status === 403)) return verifyOfflinePin(merchant, code).then(function (gone) {
        if (gone) offlinePinRows(merchant, function (row) { return String(row.staff && row.staff.id || '') !== String(gone.id || ''); });
        return reply;
      }, function () { return reply; });
      return reply;
    });
  }
  function noteApproval(who, level) {
    if (!who) return;
    var id = String(who.id || '').slice(0, 80), role = String(who.role || '').trim();
    lastOperator = { id: id, name: String(who.name || '').trim() || 'Caissier', role: role, actorProof: who.actorProof || '', verdict: who.verdict || 'online', provenAt: who.provenAt || null };
    if (level === 'manager') {
      lastManager = { id: id, name: String(who.name || '').trim() || 'Responsable', role: role, approval: String(who.approval || ''), verdict: who.verdict || 'online', provenAt: who.provenAt || null };
      lastOperator = lastManager;
    }
  }

  window.KiwiCaissePairing = {
    verifyReply: verifyReply, noteApproval: noteApproval,
    offlineRow: function (code, opts) { var v = activeVenue(); return (v && v.merchant ? verifyOfflinePin(v.merchant, code) : Promise.resolve(null)).then(function (who) { return who && opts && opts.manager && (window.KiwiTrustedClock || Date).now() - who.provenAt >= 24 * 3600000 ? null : who; }); },
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
        if (who && who.offline && (window.KiwiTrustedClock || Date).now() - who.provenAt >= 24 * 60 * 60 * 1000) return false;
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
