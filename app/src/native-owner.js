/* Kiwi Pro · tableau de bord du propriétaire. Pavé du verrou, écran
 * d'ouverture et Face ID, en-tête natif, déverrouillage biométrique.
 * Partie du runtime natif (native-runtime.js). */
(function () {
  'use strict';
  var N = window.__kiwiNativeRuntime;
  if (!N) return;
  var root = N.root, socket = N.socket, call = N.call, secureGet = N.secureGet,
      secureSet = N.secureSet, nativeSheetAvailable = N.nativeSheetAvailable,
      nativeSheet = N.nativeSheet, khPlay = N.khPlay, hapticLight = N.hapticLight,
      hapticFailed = N.hapticFailed, nativeBlockingLayer = N.nativeBlockingLayer,
      paintStatusBar = N.paintStatusBar, mountNativeAccountGroup = N.mountNativeAccountGroup;
  /* Presentation only: keep the dashboard's original input event and server
     verification intact. Never copy, store or publish the code to the host. */
  /* The lock is static French HTML until i18n runs, and the web keypad until
     ours mounts: for about a second an English phone read "Bienvenue" over
     four empty boxes. Keep its content hidden until both are in place. */
  function revealOwnerLockWhenReady() {
    return function () {
      // i18n is loaded before this deferred runtime. Explicit font loads include
      // the hidden lock so its Arabic metrics cannot arrive after it appears.
      var fonts = document.fonts;
      var ready = fonts ? Promise.all([
        fonts.load('400 16px "Inter Tight"'), fonts.load('600 30px "Inter Tight"'),
        fonts.load('400 16px "IBM Plex Sans Arabic"'), fonts.load('600 30px "IBM Plex Sans Arabic"')
      ]) : Promise.resolve();
      ready.catch(function () {}).then(function () { root.classList.add('kiwi-lock-ready'); });
    };
  }
  function initNativeOwnerKeypad() {
    var padMounted = revealOwnerLockWhenReady();
    var lock = document.querySelector('[data-kiwi-lock]');
    var input = document.querySelector('[data-kiwi-pin-input]');
    if (!lock || !input || !window.matchMedia) { padMounted(); return; }
    var media = window.matchMedia('(max-width:600px)');
    var pad = document.createElement('div');
    pad.className = 'kiwi-native-owner-keypad';
    pad.setAttribute('role', 'group');
    var ar = String(root.lang).startsWith('ar'), en = String(root.lang).startsWith('en');
    pad.setAttribute('aria-label', ar ? 'رمز الدخول' : en ? 'Passcode keypad' : 'Clavier du code');
    var back = ar ? 'حذف آخر رقم' : en ? 'Delete last digit' : 'Effacer le dernier chiffre';
    pad.innerHTML = ['1','2','3','4','5','6','7','8','9','', '0','back'].map(function (key) {
      if (!key) return '<span aria-hidden="true"></span>';
      return '<button type="button" data-key="' + key + '"' + (key === 'back' ? ' aria-label="' + back + '"' : '') + '>' + (key === 'back' ? '<i class="kiwi-native-backspace" aria-hidden="true"></i>' : key) + '</button>';
    }).join('');
    var help = lock.querySelector('.kiwi-lock-help');
    (help || input).insertAdjacentElement('afterend', pad);
    var progress = document.createElement('span');
    progress.className = 'kiwi-native-code-progress';
    progress.setAttribute('role', 'status');
    progress.setAttribute('aria-live', 'polite');
    pad.appendChild(progress);
    var pinRow = lock.querySelector('[data-kiwi-pin]');
    if (pinRow) pinRow.setAttribute('aria-hidden', 'true');
    function announce() {
      var count = input.value.length;
      progress.textContent = ar ? 'تم إدخال ' + count + ' من 4 أرقام' : en ? count + ' of 4 digits entered' : count + ' chiffres saisis sur 4';
    }
    input.addEventListener('input', announce);
    announce();
    if (pinRow) new MutationObserver(function () {
      announce();
      /* Same gesture id as the Team shake: a wrong code buzzes once. */
      if (pinRow.classList.contains('is-wrong')) hapticFailed('pin-wrong:' + Math.round(N.lastPressAt));
    }).observe(pinRow, { attributes:true, attributeFilter:['class'] });
    var original = { readOnly:input.readOnly, inputMode:input.inputMode, tab:input.getAttribute('tabindex'), aria:input.getAttribute('aria-hidden') };
    function apply() {
      pad.hidden = !media.matches;
      input.readOnly = media.matches || original.readOnly;
      input.inputMode = media.matches ? 'none' : original.inputMode;
      ['tabindex','aria-hidden'].forEach(function (attr) {
        var value = media.matches ? (attr === 'tabindex' ? '-1' : 'true') : original[attr === 'tabindex' ? 'tab' : 'aria'];
        if (value == null) input.removeAttribute(attr); else input.setAttribute(attr, value);
      });
      lock.classList.toggle('kiwi-native-keypad-lock', media.matches);
      if (media.matches) input.blur();
    }
    function enter(key) {
      if (!media.matches || !lock.isConnected || getComputedStyle(lock).display === 'none' || input.disabled) return;
      if (key === 'back') input.value = input.value.slice(0, -1);
      else if (/^\d$/.test(key) && input.value.length < input.maxLength) input.value += key;
      else return;
      input.dispatchEvent(new Event('input', { bubbles:true }));
    }
    /* Choose at the press, as iOS keyboards do, for every key but the final
       digit: that one buzzes only through its verdict (§15.1, §15.3). */
    pad.addEventListener('pointerdown', function (event) {
      var key = event.target.closest && event.target.closest('[data-key]');
      if (!key || !media.matches || !lock.isConnected || input.disabled) return;
      var final = /^\d$/.test(key.dataset.key) && input.value.length + 1 >= input.maxLength;
      if (!final) khPlay('Choose', 'pad-key', { trigger: 'pointerdown', eventTimeStamp: event.timeStamp });
    }, { passive: true });
    pad.addEventListener('click', function (event) {
      var button = event.target.closest('[data-key]');
      if (!button) return;
      event.stopPropagation();
      enter(button.dataset.key);
    });
    lock.addEventListener('keydown', function (event) {
      if (!media.matches) return;
      if (/^\d$/.test(event.key) || event.key === 'Backspace') {
        event.preventDefault(); event.stopPropagation(); enter(event.key === 'Backspace' ? 'back' : event.key);
      } else if (event.target.closest('.kiwi-native-owner-keypad') && ['Enter',' '].includes(event.key)) event.stopPropagation();
    }, true);
    if (media.addEventListener) media.addEventListener('change', apply);
    apply();
    padMounted();
  }

  /* ── Opening screen and Face ID · owner dashboard ─────────────────────────
     The lock is the first thing an owner sees every morning, so it reads like
     the best banking apps: a personal greeting, quiet passcode dots, a
     borderless keypad, and Face ID that asks by itself. Presentation and
     convenience only. A code is still verified by the dashboard and the
     server; Face ID never sees, stores or replays it. The device keeps the
     access tier a real code granted, for this account, plus a server-issued
     mark over the account's code list (never a code). Every unlock asks the
     server again, and a change to the codes, a refusal, or an offline record
     older than seven days drops it. Signing out forgets it. */
  var FACE_KEY = 'face-unlock-v1', FACE_DECLINED = 'kiwi:native:face-declined';
  /* A Face ID record is only as good as the server's last word on it. Each unlock
     asks POST /api/pin/face (session-bound, no code) with the record's `mark`, a
     keyed digest of the account's whole code list. The server answers 403 when any
     code changed, so the record is dropped. Offline, the record is honoured only
     while its last online confirmation is younger than the dashboard vault's TTL
     (assets/dashboard-pin-vault.js, same 7 days). */
  var FACE_CONFIRM_PATH = '/api/pin/face', FACE_TTL = 7 * 24 * 60 * 60 * 1000, FACE_TIMEOUT_MS = 8000;
  var FACE_ICON = '<svg viewBox="0 -960 960 960" fill="currentColor" aria-hidden="true"><path d="M480-160q-134 0-227-93t-93-227q0-134 93-227t227-93q134 0 227 93t93 227q0 134-93 227t-227 93Zm0-80q100 0 170-70t70-170q0-17-2.5-33.5T710-546q-15 3-30 4.5t-30 1.5q-63 0-120-24t-102-70q-28 57-77 99t-111 61q3 98 72.5 166T480-240ZM256-566q44-23 67-53.5t45-72.5q-38 20-67 52.5T256-566Zm95.5 154.5Q340-423 340-440t11.5-28.5Q363-480 380-480t28.5 11.5Q420-457 420-440t-11.5 28.5Q397-400 380-400t-28.5-11.5ZM650-620h12q6 0 12-1-33-45-83.5-72T480-720h-12q-6 0-11 1 39 45 82.5 72T650-620Zm-98.5 208.5Q540-423 540-440t11.5-28.5Q563-480 580-480t28.5 11.5Q620-457 620-440t-11.5 28.5Q597-400 580-400t-28.5-11.5ZM40-720v-120q0-33 23.5-56.5T120-920h120v80H120v120H40ZM240-40H120q-33 0-56.5-23.5T40-120v-120h80v120h120v80Zm480 0v-80h120v-120h80v120q0 33-23.5 56.5T840-40H720Zm120-680v-120H720v-80h120q33 0 56.5 23.5T920-840v120h-80Zm-383 1Zm-89 27Z"/></svg>';
  function entryCopy(kind) {
    var lang = String(root.lang || 'fr'), ar = lang.indexOf('ar') === 0, en = lang.indexOf('en') === 0;
    var bio = kind === 'touchId' ? 'Touch ID' : 'Face ID';
    var h = new Date().getHours();
    var greet = ar ? (h >= 5 && h < 12 ? 'صباح الخير' : 'مساء الخير')
      : en ? (h >= 5 && h < 12 ? 'Good morning' : h < 18 && h >= 12 ? 'Good afternoon' : 'Good evening')
      : (h >= 5 && h < 12 ? 'Bonjour' : h < 18 && h >= 12 ? 'Bon après-midi' : 'Bonsoir');
    return {
      greet: greet,
      back: ar ? 'مرحبا بعودتك' : en ? 'Welcome back' : 'Bon retour',
      bio: bio,
      key: ar ? 'الفتح بـ ' + bio : en ? 'Unlock with ' + bio : 'Ouvrir avec ' + bio,
      reason: ar ? 'فتح Kiwi Pro' : en ? 'Unlock Kiwi Pro' : 'Ouvrir Kiwi Pro',
      offerTitle: ar ? 'فتح Kiwi بـ ' + bio + '؟' : en ? 'Open Kiwi with ' + bio + '?' : 'Ouvrir Kiwi avec ' + bio + ' ?',
      offerBody: ar ? 'في المرة القادمة تكفي نظرة واحدة، ويبقى رمزك صالحا دائما.'
        : en ? 'Next time, a glance is enough. Your code always works too.'
        : 'La prochaine fois, un regard suffit. Votre code reste toujours valable.',
      enable: ar ? 'تفعيل ' + bio : en ? 'Turn on ' + bio : 'Activer ' + bio,
      later: ar ? 'لاحقا' : en ? 'Not now' : 'Plus tard',
      done: ar ? 'تم تفعيل ' + bio : en ? bio + ' is on' : bio + ' activé',
    };
  }
  function entryAccount() { try { return localStorage.getItem('kiwiAccountKey') || ''; } catch (_) { return ''; } }
  function readFaceUnlock() {
    var account = entryAccount();
    if (!account) return Promise.resolve(null);
    return secureGet(FACE_KEY).then(function (raw) {
      try {
        var r = JSON.parse(raw || 'null');
        /* A record without a server mark predates the server check: it is inert,
           never honoured, and the next code unlock offers Face ID again. */
        return r && r.account === account && /^(owner|manager)$/.test(r.access)
          && typeof r.mark === 'string' && r.mark ? r : null;
      } catch (_) { return null; }
    }, function () { return null; });
  }
  function forgetFaceUnlock() { return secureSet(FACE_KEY, null); }
  /* POST /api/pin/face. Resolves 'no' when the server refuses (401/403, or an
     answer without ok), the server's JSON when it confirms, null when it cannot be
     reached (offline, timeout, 5xx, a build without the route). No code is sent. */
  function askFace(body) {
    if (navigator.onLine === false) return Promise.resolve(null);
    var ctl = typeof AbortController === 'function' ? new AbortController() : null;
    var timer = ctl ? setTimeout(function () { ctl.abort(); }, FACE_TIMEOUT_MS) : 0;
    return fetch(FACE_CONFIRM_PATH, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body),
      signal: ctl ? ctl.signal : undefined,
    }).then(function (r) {
      clearTimeout(timer);
      if (r.status === 401 || r.status === 403) return 'no';
      if (!r.ok) return null;
      return r.json().then(function (d) {
        if (!d || d.ok !== true || (d.access !== 'owner' && d.access !== 'manager')) return 'no';
        return d;
      }, function () { return null; });
    }).catch(function () { clearTimeout(timer); return null; });
  }
  /* Resolves { state: 'ok', access } when the server confirms, { state: 'refused' }
     when it says no, { state: 'offline' } when it cannot be reached and the record
     is within the vault's TTL, { state: 'expired' } when it cannot be reached and
     the record is older (or its clock is in the future). */
  function confirmFace(record) {
    if (!record.mark) return Promise.resolve({ state: 'refused' });
    return askFace({ access: record.access, mark: record.mark }).then(function (d) {
      if (d === 'no') return { state: 'refused' };
      if (d) return { state: 'ok', access: d.access };
      var age = Date.now() - Number(record.at);
      return isFinite(age) && age >= 0 && age <= FACE_TTL ? { state: 'offline' } : { state: 'expired' };
    });
  }
  /* The server just confirmed: the record's clock restarts, so the offline window
     always counts from the last online proof. */
  function renewFace(record, access) {
    return secureSet(FACE_KEY, JSON.stringify({
      account: record.account, access: access, name: record.name || '', at: Date.now(), mark: record.mark,
    })).catch(function () {});
  }
  /* Dashboard idle relock: a biometric success proves the device holder, not the
     account. The stored Face ID record must still stand (the server online, the
     TTL offline) before the lock opens. A refusal clears the record and tells the
     lock to drop its key. Resolves the confirmFace state; 'refused' when no record. */
  function confirmStoredFace() {
    return readFaceUnlock().then(function (record) {
      if (!record) return { state: 'refused' };
      return confirmFace(record).then(function (c) {
        if (c.state === 'ok') return renewFace(record, c.access).then(function () { return c; });
        if (c.state === 'refused' || c.state === 'expired') {
          return forgetFaceUnlock().catch(function () {}).then(function () {
            try { window.dispatchEvent(new Event('kiwi:face-unlock-dropped')); } catch (_) {}
            return c;
          });
        }
        return c;
      });
    });
  }
  /* identity.js may load after this file; wait for its gate to exist and
     settle, never longer than four seconds. */
  function identitySettled() {
    return new Promise(function (resolve) {
      var started = Date.now();
      (function wait() {
        var gate = null;
        try { gate = window.KiwiIdentity && window.KiwiIdentity.ready; } catch (_) {}
        if (gate && typeof gate.then === 'function') { gate.then(function () { setTimeout(resolve, 0); }, resolve); return; }
        if (Date.now() - started > 4000) { resolve(); return; }
        setTimeout(wait, 100);
      })();
    });
  }
  function initNativeEntry() {
    var lock = document.querySelector('[data-kiwi-lock]');
    if (!lock || !window.matchMedia) return;
    root.classList.add('kiwi-entry-v2');
    var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var title = lock.querySelector('.kiwi-lock-title');
    var sub = lock.querySelector('.kiwi-lock-sub');
    var biometry = 'none', faceRecord = null, prompting = false;

    function personalise() {
      var c = entryCopy(biometry), me = window.KiwiMe || {};
      var name = '', biz = '';
      try { name = String(me.name || localStorage.getItem('kiwiOwnerName') || '').trim().split(/\s+/)[0] || ''; } catch (_) {}
      try { biz = String(me.business || localStorage.getItem('kiwiBizName') || '').trim(); } catch (_) {}
      if (faceRecord && faceRecord.name) name = String(faceRecord.name).trim().split(/\s+/)[0];
      if (title) { title.removeAttribute('data-i18n'); title.textContent = name ? c.greet + ', ' + name : c.back; }
      if (sub && biz) { sub.removeAttribute('data-i18n'); sub.textContent = biz; }
    }
    personalise();
    [600, 1600, 3500].forEach(function (ms) { setTimeout(personalise, ms); });
    document.addEventListener('kiwi-account-pins-ready', personalise);

    /* The launch splash shows the mark centred and cross-fades away; the lock
       then settles in (CSS, .kiwi-entry-in). It waits for the splash to be
       gone so the motion is seen, and never measures layout to do it. */
    function enter() {
      if (lock.classList.contains('kiwi-entry-in')) return;
      requestAnimationFrame(function () { lock.classList.add('kiwi-entry-in'); });
    }
    function whenLaunched() {
      if (root.classList.contains('kiwi-launch-ready')) return enter();
      var obs = new MutationObserver(function () {
        if (!root.classList.contains('kiwi-launch-ready')) return;
        obs.disconnect(); enter();
      });
      obs.observe(root, { attributes: true, attributeFilter: ['class'] });
      setTimeout(function () { obs.disconnect(); enter(); }, 9000);
    }
    whenLaunched();

    function lockVisible() {
      if (!lock.isConnected || getComputedStyle(lock).display === 'none' || lock.classList.contains('is-unlocking')) return false;
      var top = document.elementFromPoint(window.innerWidth / 2, window.innerHeight / 2);
      return !top || lock.contains(top);
    }
    function tryFace() {
      if (!faceRecord || prompting || !lockVisible()) return;
      /* The idle relock asks on its own (maybePromptBiometricUnlock). */
      try { if (sessionStorage.getItem('kiwi:native:biometric-pending') === '1') return; } catch (_) {}
      prompting = true;
      authenticateBiometric(entryCopy(biometry).reason).then(function (res) {
        if (!res || !res.authenticated) { prompting = false; return; }
        var record = faceRecord;
        /* The face is a proof of the device holder, not of the account: the server
           still decides whether this record stands before the tier is granted. */
        return confirmFace(record).then(function (c) {
          prompting = false;
          if (c.state === 'refused' || c.state === 'expired') { dropFace(); return; }
          if (!lockVisible()) return;
          var access = c.state === 'ok' ? c.access : record.access;
          if (c.state === 'ok') renewFace(record, access);
          if (window.__kiwiLock && typeof window.__kiwiLock.unlockAs === 'function') {
            window.__kiwiLock.unlockAs({ access: access, name: record.name || '' });
          }
        });
      }).catch(function () { prompting = false; });
    }
    /* Face ID is gone for this device: the record, the key on the keypad, and the
       greeting that was built from it. */
    function dropFace() {
      faceRecord = null;
      var key = lock.querySelector('[data-face-unlock]');
      if (key) key.remove();
      forgetFaceUnlock();
      personalise();
    }
    function mountFaceKey() {
      var pad = lock.querySelector('.kiwi-native-owner-keypad');
      if (!pad || pad.querySelector('[data-face-unlock]')) return;
      var slot = pad.querySelector('span[aria-hidden="true"]');
      var button = document.createElement('button');
      button.type = 'button';
      button.className = 'kiwi-face-key';
      button.setAttribute('data-face-unlock', '');
      button.setAttribute('aria-label', entryCopy(biometry).key);
      button.innerHTML = FACE_ICON;
      button.addEventListener('pointerdown', function (event) { khPlay('Choose', 'face-key', { trigger: 'pointerdown', eventTimeStamp: event.timeStamp }); }, { passive: true });
      button.addEventListener('click', function (event) { event.stopPropagation(); tryFace(); });
      if (slot) slot.replaceWith(button); else pad.insertBefore(button, pad.firstChild);
    }
    checkBiometrics().then(function (info) {
      if (!info || !info.isAvailable) return null;
      biometry = info.biometryType || 'faceId';
      return readFaceUnlock();
    }).then(function (record) {
      if (!record) return;
      faceRecord = record;
      personalise();
      mountFaceKey();
      /* Ask after the identity gate has settled, so the onboarding, when it
         opens, is already over the lock and lockVisible() sees it. */
      identitySettled().then(function () { setTimeout(tryFace, reduce ? 300 : 700); });
    }).catch(function () {});

    /* Signing out, or switching account, forgets Face ID for this device. */
    lock.addEventListener('click', function (event) {
      if (event.target.closest('a[href="/auth/logout"]')) forgetFaceUnlock();
    }, true);

    /* The dashboard's vault had proven a code that the server now refuses: that
       code was changed or removed, so the Face ID record enrolled with it goes too. */
    window.addEventListener('kiwi:dashboard-code-revoked', dropFace);
    /* The idle relock refused the stored record (see confirmStoredFace). */
    window.addEventListener('kiwi:face-unlock-dropped', dropFace);

    /* A real code just opened the dashboard: offer Face ID once, after the
       greeting, never in the demo and never twice for the same account. */
    window.addEventListener('kiwi:code-unlocked', function (event) {
      var who = event && event.detail;
      var env = window.KiwiEnv, account = entryAccount();
      if (!who || !account || !(env && env.isReal && env.isReal())) return;
      /* Only a code the server proved online carries a Face ID mark, and only at
         owner or manager tier: nothing else is offered Face ID. */
      if (typeof who.faceMark !== 'string' || !who.faceMark || (who.access !== 'owner' && who.access !== 'manager')) return;
      try { if (localStorage.getItem(FACE_DECLINED) === account) return; } catch (_) {}
      checkBiometrics().then(function (info) {
        if (!info || !info.isAvailable) return;
        biometry = info.biometryType || 'faceId';
        return readFaceUnlock().then(function (record) {
          /* Already enrolled at this tier: the code just proven carries the
             current mark, so the record follows it (after a code change the
             owner keeps Face ID by typing the new code once). */
          if (record && record.access === who.access) {
            if (record.mark !== who.faceMark) {
              secureSet(FACE_KEY, JSON.stringify({ account: account, access: who.access, name: record.name || who.name || '', at: Date.now(), mark: who.faceMark })).catch(function () {});
            }
            return;
          }
          setTimeout(function () { offerFaceUnlock(who, account, biometry); }, 1900);
        });
      }).catch(function () {});
    });
  }
  function offerFaceUnlock(who, account, kind) {
    if (document.querySelector('.kiwi-face-offer')) return;
    var c = entryCopy(kind);
    function decline() { try { localStorage.setItem(FACE_DECLINED, account); } catch (_) {} }
    function enable() {
      return authenticateBiometric(c.reason).then(function (res) {
        if (!res || !res.authenticated) return false;
        /* The mark came with the code the server just proved (POST /api/pin/verify,
           for that code's tier). Without one, nothing is enrolled. */
        if (typeof who.faceMark !== 'string' || !who.faceMark) return false;
        return Promise.resolve().then(function () {
          return secureSet(FACE_KEY, JSON.stringify({
            account: account, access: who.access, name: who.name || '', at: Date.now(), mark: who.faceMark,
          })).then(function () {
            hapticLight();
            try { localStorage.removeItem(FACE_DECLINED); } catch (_) {}
            try { if (window.Kiwi && window.Kiwi.toast) window.Kiwi.toast(c.done, { type: 'success', duration: 1800 }); } catch (_) {}
            return true;
          });
        });
      }).catch(function () { return false; });
    }
    /* Swiping the native sheet away counts as "Later": asking again at every
       sign-in would nag. */
    if (nativeSheetAvailable()) {
      nativeSheet({ title: c.offerTitle, message: c.offerBody, icon: 'faceid', actions: [{ id: 'enable', label: c.enable, style: 'primary' }, { id: 'later', label: c.later }] })
        .then(function (choice) { if (choice === 'enable') enable(); else decline(); });
      return;
    }
    var sheet = document.createElement('div');
    sheet.className = 'kiwi-face-offer';
    sheet.setAttribute('role', 'dialog');
    sheet.setAttribute('aria-modal', 'true');
    sheet.setAttribute('aria-labelledby', 'kiwi-face-offer-title');
    sheet.innerHTML = '<div class="kiwi-face-offer-panel">'
      + '<span class="kiwi-face-offer-icon">' + FACE_ICON + '</span>'
      + '<h2 id="kiwi-face-offer-title"></h2><p></p>'
      + '<button type="button" class="kiwi-face-offer-yes"></button>'
      + '<button type="button" class="kiwi-face-offer-no"></button></div>';
    sheet.querySelector('h2').textContent = c.offerTitle;
    sheet.querySelector('p').textContent = c.offerBody;
    sheet.querySelector('.kiwi-face-offer-yes').textContent = c.enable;
    sheet.querySelector('.kiwi-face-offer-no').textContent = c.later;
    function close() {
      sheet.classList.remove('is-open');
      setTimeout(function () { sheet.remove(); }, 320);
    }
    sheet.querySelector('.kiwi-face-offer-no').addEventListener('click', function () {
      decline();
      close();
    });
    sheet.querySelector('.kiwi-face-offer-yes').addEventListener('click', function () {
      enable().then(function (ok) { if (ok) close(); });
    });
    document.body.appendChild(sheet);
    requestAnimationFrame(function () { sheet.classList.add('is-open'); });
    setTimeout(function () { try { sheet.querySelector('.kiwi-face-offer-yes').focus(); } catch (_) {} }, 340);
  }

  /* Owner home on a phone. The dashboard is the desktop page; on an iPhone the
     owner opens it to answer one question, "how is today going", so the
     revenue card leads, the period switch sits under it and the four pages an
     owner checks from a phone become native tabs. Every tab and quick action
     clicks the page's own control, so no figure is computed twice. */
  function nativeOwnerCopy() {
    var lang = String(root.lang || 'fr');
    if (lang.indexOf('ar') === 0) return { home:'الرئيسية', orders:'الطلبات', report:'التقرير', clients:'الزبناء', more:'المزيد', label:'التنقل', report2:'تقرير اليوم', invoice:'الفواتير', export:'تصدير', customize:'تخصيص' };
    if (lang.indexOf('en') === 0) return { home:'Home', orders:'Orders', report:'Report', clients:'Customers', more:'More', label:'Navigation', report2:'Day report', invoice:'Invoicing', export:'Export', customize:'Customize' };
    return { home:'Accueil', orders:'Commandes', report:'Rapport', clients:'Clients', more:'Plus', label:'Navigation', report2:'Rapport du jour', invoice:'Facturation', export:'Exporter', customize:'Personnaliser' };
  }
  function initNativeOwnerUx() {
    if (!document.body) return null;
    document.body.classList.add('kiwi-native-owner');
    var copy = nativeOwnerCopy();
    var listeners = [];
    var sidebar = function () { return document.getElementById('kw-sidebar'); };
    var navLink = function (id) { var s = sidebar(); return s && s.querySelector('[data-nav="' + id + '"]'); };
    var notify = function () { listeners.forEach(function (fn) { try { fn(); } catch (_) {} }); };
    var clientsOpen = function () {
      var layer = document.getElementById('cd-table');
      return !!(layer && layer.offsetParent !== null);
    };

    /* The tab follows the page that is open: Kiwi.activePage, the dashboard's
       own record, set by every page on entry. The sidebar link is only a
       fallback, because a page without a sidebar link (Customer retention,
       Campaigns) leaves no link active, and the tab used to stay on the page
       visited before: « Orders » over Customer retention. Customers is a
       section, not one page: the directory, retention and campaigns all
       belong to its tab. */
    var CLIENT_PAGES = { crm:1, retention:1, clients:1 };
    function currentPage() {
      var page = window.Kiwi && window.Kiwi.activePage;
      if (typeof page === 'string' && page) return page;
      var s = sidebar();
      var active = s && s.querySelector('[data-nav].active');
      return active ? active.getAttribute('data-nav') : 'accueil';
    }
    function selected() {
      if (document.body.classList.contains('kw-menu-open') || document.body.classList.contains('nav-open')) return 'more';
      if (clientsOpen()) return 'clients';
      var page = currentPage();
      if (CLIENT_PAGES[page]) return 'clients';
      return ({ accueil:'accueil', transactions:'transactions', rapport:'rapport' })[page] || '';
    }
    function tabs() {
      return [
        { id:'accueil', label:copy.home },
        { id:'transactions', label:copy.orders },
        { id:'rapport', label:copy.report },
        { id:'clients', label:copy.clients }
      ];
    }
    function openMenu() {
      var burger = document.querySelector('.kw-hamburger');
      if (burger) burger.click();
      setTimeout(notify, 60);
    }
    function go(id) {
      if (nativeBlockingLayer() && id !== 'more') return;
      if (id === 'more') { openMenu(); return; }
      if (id === 'clients') {
        var directory = document.querySelector('#kw-sidebar [data-action="clients-directory"]') || document.querySelector('[data-action="clients-directory"]');
        if (directory) directory.click();
      } else {
        var link = navLink(id);
        if (link) link.click();
        try { window.scrollTo({ top:0, behavior:'smooth' }); } catch (_) { window.scrollTo(0, 0); }
      }
      khPlay('Choose', 'native-tab', { trigger: 'tap' });
      setTimeout(notify, 60);
      setTimeout(notify, 400);
    }

    /* Quick actions, Revolut-style: one row of round buttons under the
       revenue, each forwarding to the dashboard's existing control. */
    function mountQuickActions() {
      var anchor = document.querySelector('.vexel-compose .dash-date-range');
      if (!anchor || document.querySelector('.kiwi-native-owner-actions')) return;
      var items = [
        ['report', copy.report2, 'description.svg', '.vexel-report-btn'],
        ['invoice', copy.invoice, 'receipt_long.svg', '.kpi-customize.invoice-pill'],
        ['export', copy.export, 'download.svg', '.page-head [data-action="export"]'],
        ['customize', copy.customize, 'tune.svg', '.kpi-customize:not(.invoice-pill)']
      ].filter(function (item) { return document.querySelector(item[3]); });
      if (!items.length) return;
      var row = document.createElement('div');
      row.className = 'kiwi-native-owner-actions';
      row.setAttribute('role', 'group');
      row.innerHTML = items.map(function (item) {
        return '<button type="button" data-owner-action="' + item[0] + '"><span class="kno-ico" aria-hidden="true"><i style="--kno-icon:url(assets/icons/material/' + item[2] + ')"></i></span><span class="kno-lbl">' + item[1] + '</span></button>';
      }).join('');
      row.addEventListener('click', function (event) {
        var button = event.target.closest('[data-owner-action]');
        if (!button) return;
        var item = items.filter(function (entry) { return entry[0] === button.getAttribute('data-owner-action'); })[0];
        var target = item && document.querySelector(item[3]);
        if (target) target.click();
      });
      anchor.parentNode.insertBefore(row, anchor.nextSibling);
    }
    mountQuickActions();
    setTimeout(mountQuickActions, 1200);
    // Locale/layout hydration may replace the compose tree after the first
    // frame (notably Arabic). Restore actions without polling or duplicates.
    var main = document.querySelector('main.main');
    if (main) new MutationObserver(mountQuickActions).observe(main, { childList:true, subtree:true });

    /* The status bar follows every theme change; the theme itself follows
       the phone (followSystemTheme). */
    window.addEventListener('kiwi:themechange', function () { paintStatusBar(); });

    /* The drawer is the one menu: the full dashboard, then the account. */
    var mountAccountMenu = function () { var s = sidebar(); mountNativeAccountGroup(s, s && s.querySelector('.merchant-logout'), 'owner'); };
    mountAccountMenu();
    setTimeout(mountAccountMenu, 1200);
    new MutationObserver(mountAccountMenu).observe(root, { attributes:true, attributeFilter:['lang'] });

    /* Inner pages get their name as the navigation title; home keeps the mark. */
    var titles = { accueil:'', transactions:copy.orders, rapport:copy.report, clients:copy.clients };
    new MutationObserver(function () {
      copy = nativeOwnerCopy();
      titles = { accueil:'', transactions:copy.orders, rapport:copy.report, clients:copy.clients };
      var actions = document.querySelector('.kiwi-native-owner-actions');
      if (actions) actions.remove();
      mountQuickActions();
      notify();
    }).observe(root, { attributes:true, attributeFilter:['lang'] });
    function syncTitle() {
      var inner = document.querySelector('.topbar-inner');
      if (!inner) return;
      var title = inner.querySelector('.kno-title');
      if (!title) {
        title = document.createElement('span');
        title.className = 'kno-title';
        title.setAttribute('role', 'heading');
        title.setAttribute('aria-level', '1');
        var brand = inner.querySelector('.kw-topbar-brand');
        inner.insertBefore(title, brand ? brand.nextSibling : inner.firstChild);
      }
      var page = selected();
      /* The bar names a tab's own page only. Retention and Campaigns sit
         under the Customers tab but keep their in-page heading: titled
         « Customers », the bar would hide that heading and name the wrong page. */
      if (page === 'clients' && !clientsOpen()) page = '';
      var text = titles[page] || '';
      if (title.textContent !== text) title.textContent = text;
      var key = text ? 'page' : 'home';
      if (document.body.getAttribute('data-kno-page') !== key) document.body.setAttribute('data-kno-page', key);
    }
    listeners.push(syncTitle);
    syncTitle();

    var s = sidebar();
    if (s) new MutationObserver(notify).observe(s, { attributes:true, subtree:true, attributeFilter:['class'] });
    new MutationObserver(notify).observe(document.body, { attributes:true, attributeFilter:['class'] });
    return { tabs:tabs, selected:selected, go:go, openMenu:openMenu, onChange:function (fn) { listeners.push(fn); } };
  }

  function polishNativeWorkspaceCopy() {
    if (!/dashboard\.html$/i.test(location.pathname) || !String(root.lang || 'fr').startsWith('fr')) return;
    var help = document.querySelector('.kiwi-lock-help[data-i18n="dash.lock.help"]');
    if (help) help.innerHTML = 'Entrez votre <b>code à 4 chiffres</b> pour ouvrir le tableau de bord';
  }

  function checkBiometrics() {
    return call(socket, 'checkBiometrics').then(function (r) {
      return r || { isAvailable: false, biometryType: 'none' };
    });
  }

  function authenticateBiometric(reason) {
    return call(socket, 'authenticateBiometric', { reason: reason || (root.lang === 'ar' ? 'فتح Kiwi Pro' : root.lang === 'en' ? 'Unlock Kiwi Pro' : 'Déverrouiller Kiwi Pro') }).then(function (r) {
      return r || { authenticated: false, fallback: true };
    });
  }

  function maybePromptBiometricUnlock() {
    var isPending = false;
    try {
      isPending = sessionStorage.getItem('kiwi:native:biometric-pending') === '1' || !!sessionStorage.getItem('kiwiIdleLockReason');
    } catch (_) {}
    if (!isPending) return Promise.resolve(false);

    return checkBiometrics().then(function (info) {
      if (!info || !info.isAvailable) {
        try { sessionStorage.removeItem('kiwi:native:biometric-pending'); } catch (_) {}
        return false;
      }
      return authenticateBiometric().then(function (res) {
        try {
          sessionStorage.removeItem('kiwi:native:biometric-pending');
          sessionStorage.removeItem('kiwiIdleLockReason');
        } catch (_) {}
        if (res && res.authenticated) {
          if (window.__kiwiLock && typeof window.__kiwiLock.reveal === 'function') {
            /* Dashboard: the lock opens only once the server has confirmed the
               stored Face ID record (or it is inside the offline TTL). */
            return confirmStoredFace().then(function (c) {
              if (c.state !== 'ok' && c.state !== 'offline') return false;
              window.__kiwiLock.reveal();
              return true;
            });
          } else if (typeof window.__kiwiUnlockApp === 'function') {
            window.__kiwiUnlockApp();
          } else {
            var pin = document.getElementById('pin-screen');
            if (pin) pin.style.display = 'none';
            document.body.classList.add('is-unlocked');
          }
          return true;
        }
        return false;
      });
    });
  }
  /* Partagé avec les morceaux suivants du runtime natif. */
  N.initNativeOwnerKeypad = initNativeOwnerKeypad; N.initNativeEntry = initNativeEntry;
  N.initNativeOwnerUx = initNativeOwnerUx; N.polishNativeWorkspaceCopy = polishNativeWorkspaceCopy;
  N.checkBiometrics = checkBiometrics; N.authenticateBiometric = authenticateBiometric;
  N.maybePromptBiometricUnlock = maybePromptBiometricUnlock;
})();
