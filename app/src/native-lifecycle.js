/* Kiwi Pro · cycle de vie. Les messages vers la coque native (onglets),
 * la sortie de l'écran de lancement, et le retour au premier plan après une
 * longue absence. Partie du runtime natif (native-runtime.js). */
(function () {
  'use strict';
  var N = window.__kiwiNativeRuntime;
  if (!N) return;
  var root = N.root, splashScreen = N.splashScreen, call = N.call, savePairing = N.savePairing;
  var launchReady = false, pendingHostPayload = null;
  function nativeHostPost(payload) {
    if (payload.screen === 'workspace' && !launchReady) { pendingHostPayload = payload; return true; }
    try {
      var ios = window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.kiwiShell;
      if (ios && typeof ios.postMessage === 'function') {
        ios.postMessage(payload);
        /* syncTabs observes body.class. Re-applying an existing class still
           produces an attribute mutation in WKWebView, which called syncTabs
           again until WebKit killed the runaway content process. */
        if (document.body && !document.body.classList.contains('kiwi-native-hosted')) document.body.classList.add('kiwi-native-hosted');
        syncNativeTouchShield(payload);
        return true;
      }
      if (window.KiwiShellHost && typeof window.KiwiShellHost.postMessage === 'function') {
        window.KiwiShellHost.postMessage(JSON.stringify(payload));
        if (document.body && !document.body.classList.contains('kiwi-native-hosted')) document.body.classList.add('kiwi-native-hosted');
        return true;
      }
    } catch (_) {}
    return false;
  }
  // The native capsule is above WKWebView. Absorb any synthesized web click
  // beneath its bounds instead of opening a KPI/client sheet under a tab tap.
  function syncNativeTouchShield(payload) {
    if (!document.body || payload.screen !== 'workspace') return;
    var shield = document.querySelector('.kiwi-native-touch-shield');
    if (!shield) {
      shield = document.createElement('div'); shield.className = 'kiwi-native-touch-shield';
      shield.setAttribute('aria-hidden','true');
      ['click','pointerdown','pointerup','touchstart','touchend'].forEach(function (kind) {
        shield.addEventListener(kind, function (event) { event.preventDefault(); event.stopPropagation(); }, {passive:false});
      });
      document.body.appendChild(shield);
    }
    shield.hidden = !payload.tabs || !payload.tabs.length;
    shield.style.width = 'min(calc(100% - 24px), ' + ((payload.tabs || []).length * 74 + 12) + 'px)';
    // On an iPad the capsule is centred over the menu, beside the docked bill.
    var inset = Math.max(0, Number(payload.trailingInset) || 0);
    shield.style.marginLeft = inset ? ((payload.rtl ? 1 : -1) * inset / 2) + 'px' : '';
  }
  var splashHidden = false;
  var splashFallback = setTimeout(hideLaunchSplash, 8000);
  function hideLaunchSplash() {
    if (splashHidden) return;
    splashHidden = true;
    clearTimeout(splashFallback);
    // Layout is final before either native layer is removed. Two animation
    // frames let WebKit submit it to the compositor, including decoded imagery.
    requestAnimationFrame(function () { requestAnimationFrame(function () {
      launchReady = true;
      root.classList.add('kiwi-launch-ready');
      if (pendingHostPayload) nativeHostPost(pendingHostPayload);
      call(splashScreen, 'hide', { fadeOutDuration: 240 });
    }); });
  }
  function awaitLaunchPaint() {
    var lock = document.querySelector('[data-kiwi-lock]');
    if (lock && !root.classList.contains('kiwi-lock-ready')) {
      var observer = new MutationObserver(function () {
        if (root.classList.contains('kiwi-lock-ready')) { observer.disconnect(); awaitLaunchPaint(); }
      });
      observer.observe(root, { attributes:true, attributeFilter:['class'] });
      return;
    }
    var fonts = document.fonts ? document.fonts.ready : Promise.resolve();
    fonts.then(hideLaunchSplash);
  }
  function armLaunchHandoff() {
    var launcher = /(?:^|\/)index\.html$/.test(location.pathname) || location.pathname === '/';
    if (launcher) window.addEventListener('kiwi:native-ready', awaitLaunchPaint, { once:true });
    else if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', awaitLaunchPaint, { once:true });
    else awaitLaunchPaint();
  }

  var NATIVE_IDLE_TIMEOUT_MS = 20 * 60 * 1000; // 20 min per Acceptance Criterion #4

  function handleNativeAppState(state) {
    if (!state) return;
    if (state.isActive === false) {
      savePairing();
      try { localStorage.setItem('kiwi:native:last-active', String(Date.now())); } catch (_) {}
    } else if (state.isActive === true) {
      var lastActive = 0;
      try { lastActive = parseInt(localStorage.getItem('kiwi:native:last-active') || '0', 10); } catch (_) {}
      var awayFor = lastActive > 0 ? (Date.now() - lastActive) : 0;
      if (awayFor >= NATIVE_IDLE_TIMEOUT_MS) {
        try { sessionStorage.setItem('kiwi:native:biometric-pending', '1'); } catch (_) {}
        try { localStorage.setItem('kiwi:native:last-active', String(Date.now())); } catch (_) {}
        location.reload();
      }
    }
  }
  /* Partagé avec les morceaux suivants du runtime natif. */
  N.nativeHostPost = nativeHostPost; N.armLaunchHandoff = armLaunchHandoff;
  N.handleNativeAppState = handleNativeAppState;
})();
