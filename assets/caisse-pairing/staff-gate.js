
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
