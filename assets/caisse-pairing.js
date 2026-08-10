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

  function env() { return window.KiwiEnv || { demosAllowed: true }; }
  function hosted() { return env().demosAllowed === false; }
  function ls(k) { try { return localStorage.getItem(k); } catch (_) { return null; } }
  function set(k, v) { try { localStorage.setItem(k, v); } catch (_) {} }
  function del(k) { try { localStorage.removeItem(k); } catch (_) {} }
  function readMap() { try { return JSON.parse(ls('kiwiPairings') || '{}') || {}; } catch (_) { return {}; } }

  function isPaired() { return ls('kiwiPaired') === '1'; }
  function pairedVenue() { try { return JSON.parse(ls('kiwiPairedVenue') || 'null'); } catch (_) { return null; } }

  /* Tenant data leaves with the pairing; hardware identity stays with the
     physical till. KiwiTenantPurge quite correctly removes every `kiwi:` key,
     so preserve the POS device suffix explicitly around that shared purge. */
  function purgeTenantData() {
    var deviceTag = ls('kiwi:posDevice');
    try {
      if (window.KiwiTenantPurge && window.KiwiTenantPurge.purge) window.KiwiTenantPurge.purge();
    } catch (_) {}
    if (deviceTag) set('kiwi:posDevice', deviceTag);
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
    hidePad();
    hideNativePin();
    var route = routeFor(v);
    if (route.kind === 'vertical' && window.KiwiPosDispatch && window.KiwiPosDispatch.unlockById) {
      if (route.id === 'boutique') window.__kiwiPairedBoutiqueVenue = (v && v.venueId) || null;
      window.KiwiPosDispatch.unlockById(route.id);
    } else if (typeof window.__kiwiUnlockApp === 'function') {
      window.__kiwiUnlockApp();
    }
  }

  /* ── redeem: backend first, fail-soft to the same-browser map ──────────── */
  function applyPairing(code, d) {
    var venue = {
      merchant: d.merchant || '', venueId: d.venueId || '', type: d.type || '',
      subtype: d.subtype || '', name: d.name || '', location: d.location || '',
    };
    // Re-binding to a DIFFERENT store: the cashier who unlocked the old till is
    // not standing at this one, and their code belongs to the other store's
    // roster. Forget them so the staff pad asks again.
    try {
      var was = pairedVenue();
      if (was && was.merchant && was.merchant !== venue.merchant) {
        setStaff(null);
        window.__kiwiPairedBoutiqueVenue = null;
        /* …et le SERVICE de l'autre commerce avec le caissier. Oublier la
           personne sans oublier sa caisse ne suffisait pas : le service ouvert
           chez A — journal, additions, tickets cuisine, mouvements d'espèces —
           restait en place, et le rapport de journée suivant le poussait sous
           le nom de B, jusque sur le serveur. Le raisonnement est le même que
           trois lignes plus haut : ce qui appartenait à l'autre commerce n'a
           rien à faire ici.

           Effacé MAINTENANT, et pas seulement contrôlé au rechargement : la
           caisse garde son journal en mémoire, et le prochain autosave (toutes
           les 5 s) le réécrirait estampillé du nouveau commerçant — un blob
           qui dit B en contenant A passe alors tous les contrôles au
           rechargement. La garde à la relecture rattrape les appareils déjà
           dans cet état ; celle-ci empêche d'y entrer. */
        try { localStorage.removeItem('kiwi-caisse-shift'); } catch (_) {}

        /* ── ET TOUT LE RESTE DE L'AUTRE COMMERCE ────────────────────────────
           Le caissier et le service partaient ; le JOURNAL DES VENTES restait.
           Une caisse ré-appairée d'une enseigne à une autre gardait donc, sous
           le nom du nouveau commerçant : ses ventes de la semaine (kiwi:bqDay),
           son catalogue, son carnet de clientes, ses réglages par établissement.
           Concrètement, chez un client : l'écran « Échanges & avoirs » listait
           les ventes d'un AUTRE commerce, « Réimprimer » proposait leurs
           tickets, et l'en-tête comptait l'une d'elles dans la recette du jour.
           Constaté le 30/07/2026 sur une caisse en production.

           Le tableau de bord connaît déjà cette porte-là : identity.js purge
           l'état du locataire quand un AUTRE COMPTE se connecte. Mais une caisse
           ne se connecte pas — elle s'appaire. La deuxième porte n'avait pas de
           serrure. On appelle donc exactement la même purge, plutôt que d'en
           écrire une seconde qui divergera au premier ajout de clé.

           Purge AVANT d'écrire kiwiLiveMerchant : la règle balaye tout ce qui
           commence par « kiwi: », et l'ordre inverse effacerait l'appairage
           qu'on vient de poser. */
        purgeTenantData();
      }
    } catch (_) {}
    set('kiwiLiveMerchant', venue.merchant);
    set('kiwiLive', '1');
    set('kiwiPaired', '1');
    set('kiwiPairedVenue', JSON.stringify(venue));
    /* Surfaces paint their store name at DOMContentLoaded, which is BEFORE redeem()
     * has answered — so on a re-pair they kept the previous store's name (the till
     * said "Caissier · Amira Boutique" while bound to the restaurant). Announce the
     * binding so they can repaint. */
    try { document.dispatchEvent(new CustomEvent('kiwi-paired', { detail: venue })); } catch (_) {}
    // Reflect "connected" back into the map so the dashboard tab's storage
    // listener flips its status pill to "Caisse connectée" (same-browser). The
    // hand-off path carries no code, so record one against the store itself —
    // connectedCodeFor() only looks at merchant + status, and without a row the
    // panel would sit on "En attente de la caisse…" next to a working till.
    try {
      var map = readMap();
      var key = code || ('dev:' + venue.merchant);
      map[key] = map[key] || { merchant: venue.merchant, venueId: venue.venueId, type: venue.type,
        subtype: venue.subtype, name: venue.name, location: venue.location, createdAt: Date.now() };
      map[key].status = 'connected';
      map[key].connectedAt = Date.now();
      set('kiwiPairings', JSON.stringify(map));
    } catch (_) {}
    return { ok: true, venue: venue };
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
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: code }),
    }).then(function (r) {
      if (r.status === 404 || r.status === 405) return localRedeem(code); // backend absent → same-browser
      return r.json().then(function (j) {
        if (j && j.ok) return applyPairing(code, j);
        return { ok: false, error: (j && j.error) || 'invalid' };        // 422 etc — real rejection
      });
    }).catch(function () { return localRedeem(code); });                 // network → same-browser
  }

  function unpair() {
    /* Unpairing used to delete only four binding keys. Pairing a different
       merchant afterwards then saw no `was` venue and skipped the cross-tenant
       purge, exposing the previous sales/menu/customers on the new till. */
    purgeTenantData();
    window.__kiwiPairedBoutiqueVenue = null;
    setStaff(null);                     // this device is nobody's till any more
    try { if (window.KiwiPosDispatch && window.KiwiPosDispatch.lock) window.KiwiPosDispatch.lock(); } catch (_) {}
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
      '#cp-screen .pin-dot.is-filled{background:var(--mint,#7DF2B0);border-color:var(--mint,#7DF2B0);}' +
      '#cp-screen .pin-prompt{letter-spacing:.14em;}' +
      '#cp-resume{margin:14px auto 0;display:block;background:none;border:0;cursor:pointer;color:var(--mint,#7DF2B0);' +
      'font:inherit;font-size:.9rem;font-weight:600;text-decoration:underline;text-underline-offset:3px;}' +
      '#cp-screen.is-error{animation:cp-shake .4s;}' +
      '@keyframes cp-shake{10%,90%{transform:translateX(-2px)}30%,70%{transform:translateX(5px)}50%{transform:translateX(-7px)}}';
    document.head.appendChild(s);
  }

  function showPad(force) {
    if (!hosted() && !force) return;
    injectCss();
    hideNativePin();
    buf = '';
    var pv = isPaired() ? pairedVenue() : null;
    var scr = document.getElementById('cp-screen');
    if (!scr) {
      scr = document.createElement('div');
      scr.className = 'pin-screen';
      scr.id = 'cp-screen';
      scr.setAttribute('role', 'dialog');
      scr.setAttribute('aria-modal', 'true');
      scr.setAttribute('aria-label', "Code d'appairage");
      document.body.appendChild(scr);
    }
    scr.style.display = '';
    scr.innerHTML =
      '<div class="pin-brand" aria-label="Kiwi"><img src="assets/kiwi-newlogo-inverse.svg" alt="" draggable="false"></div>' +
      '<div class="pin-greet">' + (pv ? 'Reprendre ' + esc(pv.name || 'votre magasin') : 'Connectez cette caisse') + '</div>' +
      '<div class="pin-prompt">CODE D\'APPAIRAGE · 6 CHIFFRES</div>' +
      '<div class="pin-dots" id="cp-dots" aria-hidden="true">' + dotsHtml() + '</div>' +
      '<div class="pin-pad" id="cp-pad">' +
        key(1) + key(2) + key(3) + key(4) + key(5) + key(6) + key(7) + key(8) + key(9) +
        '<button class="pin-key is-action" data-cp="clear" aria-label="Effacer tout">C</button>' + key(0) +
        '<button class="pin-key is-action" data-cp="back" aria-label="Effacer">' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 5H7l-5 7 5 7h14a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2z"/><line x1="18" y1="9" x2="12" y2="15"/><line x1="12" y1="9" x2="18" y2="15"/></svg>' +
        '</button>' +
      '</div>' +
      (pv ? '<button id="cp-resume" type="button">Ouvrir ' + esc(pv.name || 'le magasin') + ' →</button>' : '') +
      '<div class="pin-foot">Entrez le code affiché sur votre tableau de bord Kiwi</div>';
    renderDots();
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
  function submit() {
    if (pairSubmitting) return;
    pairSubmitting = true;
    var code = buf;
    redeem(code).then(function (res) {
      if (res && res.ok) { pairSubmitting = false; hidePad(); bootWithPin(res.venue); return; }
      var scr = document.getElementById('cp-screen');
      if (scr) { scr.classList.add('is-error'); setTimeout(function () { scr.classList.remove('is-error'); }, 420); }
      /* "too_many_attempts" is the server's brute-force cap (429). Say so
       * plainly: a shop that mistyped its way into the lockout must know to
       * wait, not keep retrying a code it thinks is wrong. */
      toast(res && res.error === 'too_many_attempts'
              ? 'Trop de tentatives. Réessayez dans quelques minutes.'
          : res && res.error === 'expired' ? 'Code expiré, régénérez-en un.'
          : 'Code invalide.');
      buf = ''; renderDots();
      pairSubmitting = false;
    }).catch(function () {
      pairSubmitting = false;
      buf = ''; renderDots();
      toast('Connexion impossible. Réessayez.');
    });
  }
  function toast(msg) {
    try {
      var stack = document.getElementById('toast-stack');
      if (stack) { var el = document.createElement('div'); el.className = 'toast'; el.textContent = msg; stack.appendChild(el); setTimeout(function () { el.classList.add('fade'); }, 2200); setTimeout(function () { el.remove(); }, 2480); return; }
    } catch (_) {}
  }

  /* ── staff PIN gate (F8) ─────────────────────────────────────────────────
   * Pairing binds the DEVICE to a store; it must not also authenticate the
   * PERSON. Before the register becomes usable, require one of the store's staff
   * PINs — the same PINs the dashboard lock validates, served by
   * /api/config?merchant=slug. An explicitly empty list may open without a PIN,
   * but an unreachable or malformed response is UNKNOWN, not "no PINs": the till
   * stays locked and offers a retry. */
  var pinBuf = '';
  var pinVenue = null;
  var pinList = null;   // [{pin,name,role}] once fetched

  /* ── who is at the till right now ─────────────────────────────────────────
   * A staff code is a PERSON, not just a door code: the list /api/config serves
   * carries {pin, name, role}, so matching one says exactly who opened the
   * register. That was thrown away — submitPin only asked "is this code in the
   * list?" — and every surface downstream fell back to pins[0]. So the register
   * greeted the first name on the roster, printed it on tickets and filed every
   * sale under it, whoever had actually unlocked it.
   *
   * Published as window.KiwiStaff (+ a `kiwi-staff` event for surfaces already
   * painted by the time the code is entered). Session-scoped: a reload re-asks
   * for the code anyway. The code itself is never stored — only the identity it
   * proved. */
  var STAFF_KEY = 'kiwiTillStaff';
  var lastManager = null;   // { name, role } du dernier code responsable validé
  function firstNameOf(n) { return String(n || '').trim().split(/\s+/)[0] || ''; }
  function setStaff(p) {
    var s = null;
    if (p) {
      var name = String(p.name || '').trim() || 'Caissier';
      s = { name: name, role: String(p.role || '').trim() || 'Caissier', first: firstNameOf(name) || name };
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
    return fetch('/api/config?merchant=' + encodeURIComponent(merchant), { headers: { Accept: 'application/json' } })
      .then(function (r) {
        if (!r || !r.ok) throw new Error('pin-config-unavailable');
        return r.json();
      })
      .then(function (d) {
        if (!d || !Array.isArray(d.pins)) throw new Error('pin-config-invalid');
        return { pins: d.pins, required: !!d.pinGateConfigured };
      });
  }
  // Gate a fresh register entry behind a staff PIN, then bootVertical. The single
  // choke point every entry path (redeem, ?pair=1, resume, already-paired boot)
  // routes through so the hosted caisse always asks who is opening the till.
  function askStaff(venue, onNoPins) {
    var merchant = (venue && venue.merchant) || '';
    pinsFor(merchant).then(function (gate) {
      var pins = (gate && gate.pins) || [];
      if (!pins.length && !(gate && gate.required)) { if (onNoPins) onNoPins(); return; }
      pinVenue = venue; pinList = pins; pinBuf = '';
      showPinPad(venue);
    }).catch(function () {
      pinVenue = venue; pinList = null; pinBuf = '';
      showPinLoadError(venue);
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
        ? 'Aucun caissier autorisé. Assignez un rôle Caisse, Manager ou Propriétaire depuis Équipe.'
        : 'Code personnel géré depuis votre tableau de bord Kiwi') + '</div>';
    renderPinDots();
  }
  function showPinLoadError(venue) {
    injectCss(); hidePad(); hideNativePin();
    var scr = document.getElementById('cp-pin-screen');
    if (!scr) {
      scr = document.createElement('div');
      scr.className = 'pin-screen';
      scr.id = 'cp-pin-screen';
      scr.setAttribute('role', 'alertdialog');
      scr.setAttribute('aria-modal', 'true');
      document.body.appendChild(scr);
    }
    scr.style.display = '';
    scr.innerHTML =
      '<div class="pin-brand" aria-label="Kiwi">kiwi<i aria-hidden="true"></i></div>' +
      '<div class="pin-greet">' + esc((venue && venue.name) || 'Votre magasin') + '</div>' +
      '<div class="pin-prompt">VÉRIFICATION INDISPONIBLE</div>' +
      '<p style="max-width:360px;text-align:center;color:rgba(247,245,240,.72);line-height:1.55;margin:0 auto 18px">Impossible de vérifier les codes de l’équipe. La caisse reste verrouillée pour protéger votre établissement.</p>' +
      '<button class="pin-key" id="cp-pin-retry" style="width:auto;padding:0 24px">Réessayer</button>' +
      '<div class="pin-foot">Vérifiez la connexion, puis réessayez.</div>';
  }
  function feedPin(d) {
    if (d === 'clear') { pinBuf = ''; }
    else if (d === 'back') { pinBuf = pinBuf.slice(0, -1); }
    else if (/^[0-9]$/.test(d) && pinBuf.length < 4) { pinBuf += d; }
    renderPinDots();
    if (pinBuf.length === 4) submitPin();
  }
  function submitPin() {
    var code = pinBuf;
    var who = null;
    (pinList || []).forEach(function (p) {
      if (!who && String((p && (p.pin || p.code)) || '') === code) who = p;
    });
    var scr = document.getElementById('cp-pin-screen');
    function refuse(msg) {
      if (scr) { scr.classList.add('is-error'); setTimeout(function () { scr.classList.remove('is-error'); }, 420); }
      toast(msg);
      pinBuf = ''; renderPinDots();
    }
    if (who) {
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
      bootVertical(pinVenue);
      return;
    }
    refuse('Code incorrect.');
  }

  // Delegated pad handling (survives re-renders of #cp-screen / #cp-pin-screen).
  document.addEventListener('click', function (e) {
    if (e.target && e.target.id === 'cp-pin-retry') { askStaff(pinVenue || pairedVenue(), null); return; }
    var k = e.target.closest && e.target.closest('#cp-pad [data-cp]');
    if (k) { feed(k.getAttribute('data-cp')); return; }
    var kp = e.target.closest && e.target.closest('#cp-pin-pad [data-cpp]');
    if (kp) { feedPin(kp.getAttribute('data-cpp')); return; }
    if (e.target.closest && e.target.closest('#cp-resume')) { var pv = pairedVenue(); if (pv) { hidePad(); bootWithPin(pv); } }
  });
  document.addEventListener('keydown', function (e) {
    var pinScr = document.getElementById('cp-pin-screen');
    if (pinScr && pinScr.style.display !== 'none') {
      if (/^[0-9]$/.test(e.key)) { feedPin(e.key); e.preventDefault(); }
      else if (e.key === 'Backspace') { feedPin('back'); e.preventDefault(); }
      return;
    }
    var scr = document.getElementById('cp-screen');
    if (!scr || scr.style.display === 'none') return;
    if (/^[0-9]$/.test(e.key)) { feed(e.key); e.preventDefault(); }
    else if (e.key === 'Backspace') { feed('back'); e.preventDefault(); }
  });

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
          if (hosted()) setTimeout(function () { showPad(); }, 60);
          else if (isPaired()) setTimeout(function () { showPad(true); }, 60);
        };
        window.KiwiPosDispatch.__cpWrapped = true;
      }
    } catch (_) {}

    /* Explicit same-device hand-off from the dashboard ("Ouvrir la caisse sur cet
     * appareil"): redeem the freshly-issued code with no typing, on any env.
     *
     * This is checked BEFORE an existing pairing. A device is one till at a time,
     * but an owner sitting on their SECOND store's dashboard and clicking "open
     * the caisse here" is asking for exactly one thing: re-bind this device to
     * THIS store. Letting the old pairing win meant the restaurant's dashboard
     * opened the boutique's till — two businesses, one register, sales landing in
     * the wrong books. A fresh pending code is the owner's explicit intent; with
     * no code pending there is nothing to hand off, so we fall through and the
     * existing pairing still resumes as before. */
    if (wantsPair()) {
      // The dashboard named the store on its way here — no server round-trip is
      // needed or wanted for a hand-off inside one browser.
      var h = takeHandoff();
      if (h) {
        var handed = applyPairing('', h).venue;
        if (h.operator === true) bootForOperator(handed); else bootWithPin(handed);
        return;
      }
      // Older path: a 6-digit code still pending in this browser.
      var code = newestPending();
      if (code) {
        redeem(code).then(function (res) {
          if (res && res.ok) bootWithPin(res.venue);
          else if (isPaired()) bootWithPin(pairedVenue());   // redeem failed → keep the till we had
          else showPad(true);
        });
        return;
      }
    }

    // Once a device is bound to a store, it stays that store — on ANY environment,
    // so the owner's real caisse works when they test on their Mac too. A staff PIN
    // is still required each session on hosted (fail-soft where no backend/PINs).
    if (isPaired()) { bootWithPin(pairedVenue()); return; }

    if (wantsPair()) { showPad(true); return; }   // asked to pair, nothing pending → type a code

    if (!hosted()) return;   // local + unpaired + no hand-off → native demo pad, unchanged
    showPad();               // hosted + unpaired → pairing pad
  }

  window.KiwiCaissePairing = {
    isPaired: isPaired, pairedVenue: pairedVenue, showPad: showPad, redeem: redeem,
    unpair: unpair, bootVertical: bootVertical,
    // Who unlocked this till, for any surface that needs to name them.
    staff: function () { return window.KiwiStaff || null; }, setStaff: setStaff,
    authorizeManager: function (code) {
      code = String(code || '');
      if (!/^\d{4}$/.test(code) || !Array.isArray(pinList)) return false;
      var hit = null;
      pinList.some(function (p) {
        var same = String((p && (p.pin || p.code)) || '') === code;
        var role = String((p && p.role) || '').toLowerCase();
        if (same && /owner|propri|manager|g[eé]rant|responsable|admin/.test(role)) { hit = p; return true; }
        return false;
      });
      /* Une autorisation qui ne dit pas QUI a autorisé ne vaut rien le jour où on
       * la relit : le code prouve une personne, on garde donc son nom (jamais le
       * code) pour que la surface qui a demandé l'accord puisse l'écrire dans sa
       * vente. Le code lui-même ne quitte pas cette fonction. */
      if (hit) lastManager = { name: String(hit.name || '').trim() || 'Responsable', role: String(hit.role || '').trim() };
      return !!hit;
    },
    // Le dernier responsable ayant validé un code, pour l'écrire dans un journal.
    lastManager: function () { return lastManager; },
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
