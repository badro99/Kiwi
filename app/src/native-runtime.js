/* Kiwi Pro : comportements réservés au conteneur Capacitor. */
(function () {
  'use strict';
  var cap = window.Capacitor;
  if (!cap || typeof cap.isNativePlatform !== 'function' || !cap.isNativePlatform()) return;
  var root = document.documentElement, plugins = cap.Plugins || {};
  var socket = plugins.KiwiPrinterSocket, app = plugins.App, network = plugins.Network;
  var haptics = plugins.Haptics, statusBar = plugins.StatusBar, keepAwake = plugins.KeepAwake;
  var pairingKeys = ['kiwiPaired', 'kiwiPairedVenue', 'kiwiLiveMerchant', 'kiwiLive'];
  root.classList.add('kiwi-native');

  /* Les rapports d'erreur (assets/err-reporter.js → POST /api/error) portent la
     version de l'app et la plateforme, pas seulement l'empreinte du bundle web :
     « pro/ios/1.0.0 (12) · b3c9e1 ». Lu au moment du rapport, donc l'écriture
     asynchrone suffit ; avant la réponse de App.getInfo on a déjà la plateforme. */
  var bundleMeta = document.querySelector('meta[name="kiwi-bundle"]');
  var bundleTag = bundleMeta && bundleMeta.content ? ' · ' + String(bundleMeta.content).slice(0, 8) : '';
  var platform = cap.getPlatform ? cap.getPlatform() : 'native';
  window.__KIWI_APP_VERSION = 'pro/' + platform + bundleTag;
  call(app, 'getInfo').then(function (info) {
    if (!info || !info.version) return;
    window.__KIWI_APP_VERSION = 'pro/' + platform + '/' + info.version + (info.build ? ' (' + info.build + ')' : '') + bundleTag;
  });

  function call(plugin, method, args) {
    try {
      if (!plugin || typeof plugin[method] !== 'function') return Promise.resolve(null);
      return Promise.resolve(plugin[method](args || {})).catch(function () { return null; });
    } catch (_) { return Promise.resolve(null); }
  }
  function secureGet(key) { return call(socket, 'secureGet', { key: key }).then(function (r) { return r && typeof r.value === 'string' ? r.value : null; }); }
  function secureSet(key, value) { return value == null ? call(socket, 'secureRemove', { key: key }) : call(socket, 'secureSet', { key: key, value: String(value) }); }
  function pairingSnapshot() {
    var out = {};
    try { pairingKeys.forEach(function (key) { var value = localStorage.getItem(key); if (value != null) out[key] = value; }); } catch (_) {}
    return out.kiwiPaired === '1' && out.kiwiPairedVenue ? JSON.stringify(out) : '';
  }
  function savePairing() { var value = pairingSnapshot(); return secureSet('pairing-v1', value || null); }
  function restorePairing() {
    return secureGet('pairing-v1').then(function (raw) {
      if (!raw || pairingSnapshot()) return false;
      try {
        var saved = JSON.parse(raw);
        if (!saved || saved.kiwiPaired !== '1' || !saved.kiwiPairedVenue) return false;
        pairingKeys.forEach(function (key) { if (typeof saved[key] === 'string') localStorage.setItem(key, saved[key]); });
        sessionStorage.setItem('kiwiNativePairingRestored', '1');
        location.reload();
        return true;
      } catch (_) { return false; }
    });
  }
  function hapticLight() { return call(haptics, 'impact', { style: 'LIGHT' }); }
  function hapticNotice(kind) { return call(haptics, 'notification', { type: kind === 'danger' ? 'ERROR' : 'SUCCESS' }); }
  function paintStatusBar() {
    var dark = root.getAttribute('data-theme') === 'dark' || root.getAttribute('data-vexel-mode') === 'dark' || (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches && !root.getAttribute('data-theme'));
    call(statusBar, 'setStyle', { style: dark ? 'DARK' : 'LIGHT' });
    if (cap.getPlatform && cap.getPlatform() === 'android') call(statusBar, 'setBackgroundColor', { color: dark ? '#0A0F0D' : '#F7F5F0' });
  }
  function keyboardInsets() {
    if (!window.visualViewport) return;
    var viewport = window.visualViewport;
    var keyboard = Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop);
    root.style.setProperty('--kiwi-keyboard', keyboard > 80 ? keyboard + 'px' : '0px');
  }
  function revealFocused(event) {
    var target = event.target;
    if (!target || !target.matches || !target.matches('input,textarea,[contenteditable="true"]')) return;
    setTimeout(function () { try { target.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'smooth' }); } catch (_) {} }, 180);
  }
  function offlineCopy() {
    var lang = String(root.lang || 'fr').toLowerCase();
    if (lang.indexOf('ar') === 0) return 'لا يوجد اتصال. ستتم مزامنة العمليات عند عودة الشبكة.';
    if (lang.indexOf('en') === 0) return 'Offline. Operations will sync when the network returns.';
    return 'Hors ligne. Les opérations seront synchronisées au retour du réseau.';
  }
  function ensureOfflineBanner() {
    var banner = document.querySelector('.kiwi-native-offline');
    if (banner) return banner;
    banner = document.createElement('div');
    banner.className = 'kiwi-native-offline';
    banner.setAttribute('role', 'status');
    banner.setAttribute('aria-live', 'polite');
    banner.textContent = offlineCopy();
    document.body.appendChild(banner);
    return banner;
  }
  function paintNetwork(status) {
    var banner = ensureOfflineBanner();
    banner.classList.toggle('is-visible', !!status && status.connected === false);
    root.classList.toggle('kiwi-native-is-offline', !!status && status.connected === false);
  }
  function configureKeepAwake() {
    var page = location.pathname.split('/').pop();
    call(keepAwake, page === 'kiwi-caisse.html' || page === 'kiwi-cuisine.html' ? 'keepAwake' : 'allowSleep');
  }

  function applyDynamicTypeToWorkspace() {
    if (document.body && document.body.classList.contains('native-shell-page')) return;
    var dynamicType = plugins.KiwiDynamicType;
    if (!dynamicType) return;
    function applyScale(scale) {
      if (typeof scale !== 'number' || isNaN(scale)) return;
      var capped = Math.min(1.35, Math.max(0.85, scale));
      if (Math.abs(capped - 1) < 0.005) root.style.removeProperty('--type-scale');
      else root.style.setProperty('--type-scale', String(capped));
    }
    if (typeof dynamicType.getDynamicTypeScale === 'function') {
      try {
        Promise.race([
          dynamicType.getDynamicTypeScale(),
          new Promise(function (_, reject) { setTimeout(function () { reject(new Error('timeout')); }, 1000); })
        ]).then(function (result) { if (result) applyScale(result.scale); }).catch(function () {});
      } catch (_) {}
    }
    if (typeof dynamicType.addListener === 'function') {
      try { dynamicType.addListener('dynamicTypeChange', function (result) { if (result) applyScale(result.scale); }); } catch (_) {}
    }
  }

  function openNativeLayers() {
    return Array.prototype.slice.call(document.querySelectorAll(
      '.modal-veil.is-open,.drawer-veil.is-open,.cloture-veil.is-open,.kds-screen.is-open,#stock-screen.is-open'
    )).filter(function (node) {
      try { return getComputedStyle(node).display !== 'none' && getComputedStyle(node).visibility !== 'hidden'; }
      catch (_) { return true; }
    });
  }

  function dismissNativeLayer(layer) {
    if (!layer) return false;
    if (layer.matches && layer.matches('.modal-veil,.drawer-veil,.cloture-veil')) {
      try { layer.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })); } catch (_) {}
      if (layer.classList.contains('is-open')) {
        var close = layer.querySelector('[data-modal-action="close"],.modal-close,.drawer-close,[aria-label="Fermer"],[aria-label="Close"]');
        if (close) close.click();
      }
    } else {
      var button = layer.querySelector('.kds-close,[data-action="close"],[aria-label="Fermer"],[aria-label="Close"]');
      if (button) button.click(); else layer.classList.remove('is-open');
    }
    return true;
  }

  function nativeExitCopy() {
    var lang = String(root.lang || 'fr').toLowerCase();
    if (lang.indexOf('ar') === 0) return 'هل تريد إغلاق Kiwi Pro؟';
    if (lang.indexOf('en') === 0) return 'Close Kiwi Pro?';
    return 'Fermer Kiwi Pro ?';
  }

  function handleNativeBack(event) {
    var layers = openNativeLayers();
    if (layers.length) return dismissNativeLayer(layers[layers.length - 1]);
    if (document.body.classList.contains('ticket-open')) {
      document.body.classList.remove('ticket-open');
      return true;
    }
    if (document.body.classList.contains('nav-open')) {
      document.body.classList.remove('nav-open');
      return true;
    }
    var builder = document.getElementById('vrap-builder');
    var builderBack = document.getElementById('vrap-back-board');
    if (builder && !builder.hidden && builderBack) {
      builderBack.click();
      return true;
    }
    if (event && event.canGoBack && window.history && history.length > 1) {
      history.back();
      return true;
    }
    if (/kiwi-caisse\.html$/i.test(location.pathname) && !window.confirm(nativeExitCopy())) return true;
    call(app, 'exitApp');
    return true;
  }

  function nativeTillCopy() {
    var lang = String(root.lang || 'fr').toLowerCase();
    if (lang.indexOf('ar') === 0) return { label: 'التنقل الرئيسي', salle: 'الصالة', vrap: 'طلبات خارجية', waitlist: 'الانتظار', more: 'المزيد', actions: 'إجراءات أخرى', less: 'إخفاء الإجراءات', close: 'طي الفاتورة' };
    if (lang.indexOf('en') === 0) return { label: 'Primary navigation', salle: 'Floor', vrap: 'Takeaway', waitlist: 'Waiting', more: 'More', actions: 'More actions', less: 'Hide actions', close: 'Collapse bill' };
    return { label: 'Navigation principale', salle: 'Salle', vrap: 'À emporter', waitlist: 'Attente', more: 'Plus', actions: 'Autres actions', less: 'Masquer les actions', close: 'Replier l’addition' };
  }

  function initNativeTillUx() {
    if (!/kiwi-caisse\.html$/i.test(location.pathname) || !document.body) return;
    document.body.classList.add('kiwi-native-till');
    var copy = nativeTillCopy();
    var nav = document.createElement('nav');
    nav.className = 'kiwi-native-tabbar';
    nav.setAttribute('aria-label', copy.label);
    nav.setAttribute('data-lens-demo', '');
    nav.innerHTML = [
      ['salle', copy.salle, 'table_restaurant.svg'],
      ['vrap', copy.vrap, 'lunch_dining.svg'],
      ['waitlist', copy.waitlist, 'group.svg'],
      ['more', copy.more, 'category.svg']
    ].map(function (item) {
      return '<button type="button" data-lens-item data-native-tab="' + item[0] + '"><i style="--native-tab-icon:url(assets/icons/material/' + item[2] + ')" aria-hidden="true"></i><span>' + item[1] + '</span></button>';
    }).join('');
    document.body.appendChild(nav);
    if (window.KiwiLens && typeof window.KiwiLens.rescan === 'function') {
      window.KiwiLens.rescan();
      window.KiwiLens.refresh();
    }

    function syncTabs() {
      var mode = document.body.dataset.mode || 'salle';
      var drawerOpen = document.body.classList.contains('nav-open');
      nav.querySelectorAll('[data-native-tab]').forEach(function (button) {
        var tab = button.getAttribute('data-native-tab');
        var active = drawerOpen ? tab === 'more' : tab === mode;
        button.classList.toggle('on', active);
        button.setAttribute('aria-current', active ? 'page' : 'false');
      });
    }
    nav.addEventListener('click', function (event) {
      var button = event.target.closest('[data-native-tab]');
      if (!button) return;
      var mode = button.getAttribute('data-native-tab');
      if (mode === 'more') {
        document.body.classList.add('nav-open');
        hapticLight();
        return;
      }
      var source = document.querySelector('.mode-pill[data-mode="' + mode + '"]');
      if (source && !source.disabled && !source.hidden) source.click();
      document.body.classList.remove('nav-open');
      hapticLight();
      syncTabs();
    });
    new MutationObserver(syncTabs).observe(document.body, { attributes: true, attributeFilter: ['data-mode', 'class'] });
    syncTabs();

    var cart = document.querySelector('.rightpanel');
    if (cart) {
      var grabber = document.createElement('button');
      grabber.type = 'button';
      grabber.className = 'kiwi-native-sheet-grabber';
      grabber.setAttribute('aria-label', copy.close);
      grabber.addEventListener('click', function () { document.body.classList.remove('ticket-open'); });
      cart.insertBefore(grabber, cart.firstChild);
      var startY = 0, dragY = 0;
      grabber.addEventListener('touchstart', function (event) {
        startY = event.touches && event.touches[0] ? event.touches[0].clientY : 0;
        dragY = 0;
      }, { passive: true });
      grabber.addEventListener('touchmove', function (event) {
        if (!startY || !event.touches || !event.touches[0]) return;
        dragY = Math.max(0, event.touches[0].clientY - startY);
        cart.style.transform = 'translateY(' + dragY + 'px)';
      }, { passive: true });
      grabber.addEventListener('touchend', function () {
        cart.style.removeProperty('transform');
        if (dragY > 72) document.body.classList.remove('ticket-open');
        startY = dragY = 0;
      }, { passive: true });

      var meta = cart.querySelector('.rp-meta');
      if (meta) {
        var more = document.createElement('button');
        more.type = 'button';
        more.className = 'kiwi-native-cart-more';
        more.setAttribute('aria-expanded', 'false');
        more.textContent = copy.actions;
        more.addEventListener('click', function () {
          var expanded = document.body.classList.toggle('kiwi-native-cart-actions');
          more.setAttribute('aria-expanded', expanded ? 'true' : 'false');
          more.textContent = expanded ? copy.less : copy.actions;
        });
        meta.parentNode.insertBefore(more, meta);
      }
    }

    function syncCategory() {
      var active = document.querySelector('.cat-pill.is-active[data-cat]');
      document.body.classList.toggle('kiwi-native-category-filtered', !!active && active.getAttribute('data-cat') !== 'all');
    }
    var categories = document.getElementById('cat-pills');
    if (categories) new MutationObserver(syncCategory).observe(categories, { attributes: true, childList: true, subtree: true, attributeFilter: ['class'] });
    syncCategory();

    var welcome = document.getElementById('welcome-banner');
    if (welcome) {
      function syncWelcome() {
        var visible = !welcome.hidden && welcome.classList.contains('is-visible');
        welcome.inert = !visible;
        welcome.setAttribute('aria-hidden', visible ? 'false' : 'true');
      }
      new MutationObserver(syncWelcome).observe(welcome, { attributes: true, attributeFilter: ['class', 'hidden'] });
      welcome.addEventListener('animationend', function () {
        welcome.inert = true;
        welcome.setAttribute('aria-hidden', 'true');
      });
      syncWelcome();
    }
  }

  function checkBiometrics() {
    return call(socket, 'checkBiometrics').then(function (r) {
      return r || { isAvailable: false, biometryType: 'none' };
    });
  }

  function authenticateBiometric(reason) {
    return call(socket, 'authenticateBiometric', { reason: reason || 'Déverrouiller Kiwi Pro' }).then(function (r) {
      return r || { authenticated: false, fallback: true };
    });
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
      return authenticateBiometric('Déverrouiller Kiwi Pro').then(function (res) {
        try {
          sessionStorage.removeItem('kiwi:native:biometric-pending');
          sessionStorage.removeItem('kiwiIdleLockReason');
        } catch (_) {}
        if (res && res.authenticated) {
          if (window.__kiwiLock && typeof window.__kiwiLock.reveal === 'function') {
            window.__kiwiLock.reveal();
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

  function registerPushToken(token, role) {
    if (!token) return Promise.resolve(null);
    var merchant = '';
    try {
      var venue = JSON.parse(localStorage.getItem('kiwiPairedVenue') || '{}');
      merchant = (venue && venue.merchant) || localStorage.getItem('kiwiLiveMerchant') || '';
    } catch (_) {}
    if (!merchant) return Promise.resolve(null);
    var body = {
      merchant: merchant,
      token: token,
      role: role || 'caisse',
      platform: cap.getPlatform ? cap.getPlatform() : 'ios',
      deviceId: (window.KiwiNative && window.KiwiNative.deviceId) ? window.KiwiNative.deviceId : null
    };
    return fetch('/api/push/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    }).then(function (res) {
      return res.ok ? res.json() : null;
    }).catch(function () { return null; });
  }

  window.KiwiNative = {
    secureGet: secureGet,
    secureSet: secureSet,
    savePairing: savePairing,
    hapticLight: hapticLight,
    checkBiometrics: checkBiometrics,
    authenticateBiometric: authenticateBiometric,
    handleNativeAppState: handleNativeAppState,
    maybePromptBiometricUnlock: maybePromptBiometricUnlock,
    registerPushToken: registerPushToken,
    handleBackButton: handleNativeBack,
    deviceIdentity: function () { return call(socket, 'deviceIdentity').then(function (r) { return r && r.id || ''; }); }
  };
  restorePairing();
  call(socket, 'deviceIdentity').then(function (r) {
    if (!r || !r.id) return;
    window.KiwiNative.deviceId = r.id;
    try { localStorage.setItem('kiwi:caisse:terminal-id:v1', r.id); } catch (_) {}
  });
  window.addEventListener('kiwi:native-haptic', function (event) { if (!event.detail || event.detail.kind === 'light') hapticLight(); else hapticNotice(event.detail.kind); });
  window.addEventListener('kiwi:toast', function (event) { if (event.detail && event.detail.type === 'danger') hapticNotice('danger'); });
  document.addEventListener('kiwi-paired', savePairing);
  document.addEventListener('focusin', revealFocused, true);
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', keyboardInsets);
    window.visualViewport.addEventListener('scroll', keyboardInsets);
    keyboardInsets();
  }
  new MutationObserver(paintStatusBar).observe(root, { attributes: true, attributeFilter: ['data-theme', 'data-vexel-mode', 'lang', 'dir'] });
  paintStatusBar();
  configureKeepAwake();
  applyDynamicTypeToWorkspace();
  call(network, 'getStatus').then(paintNetwork);
  if (network && typeof network.addListener === 'function') network.addListener('networkStatusChange', paintNetwork);
  if (app && typeof app.addListener === 'function') {
    app.addListener('appStateChange', function (state) {
      handleNativeAppState(state);
    });
    app.addListener('backButton', handleNativeBack);
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { initNativeTillUx(); maybePromptBiometricUnlock(); });
  } else {
    initNativeTillUx();
    maybePromptBiometricUnlock();
  }
})();

/* Native lifecycle telemetry. The shared err-reporter owns redaction, rate
 * limiting and transport; this layer only turns native lifecycle signals into
 * small operational errors. A process killed while backgrounded is normal and
 * is deliberately not reported as a crash. */
(function () {
  'use strict';
  if (!window.Capacitor || !window.Capacitor.isNativePlatform || !window.Capacitor.isNativePlatform()) return;

  var KEY = 'kiwi:native-session:v1';
  var App = window.Capacitor.Plugins && window.Capacitor.Plugins.App;

  function read() {
    try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (_) { return null; }
  }
  function write(state) {
    try { localStorage.setItem(KEY, JSON.stringify({ state: state, at: Date.now() })); } catch (_) {}
  }
  function report(message, detail) {
    window.setTimeout(function () {
      if (typeof window.KiwiReportError !== 'function') return;
      window.KiwiReportError(new Error(String(detail || message || 'native-lifecycle').slice(0, 240)), message);
    }, 0);
  }

  var previous = read();
  if (previous && previous.state === 'active' && Date.now() - Number(previous.at || 0) < 7 * 86400000) {
    report('native-active-session-ended', 'Kiwi Pro restarted after an unclean active session');
  }
  write('active');

  if (App && typeof App.addListener === 'function') {
    App.addListener('appStateChange', function (event) {
      write(event && event.isActive ? 'active' : 'background');
    });
    App.addListener('appRestoredResult', function (event) {
      if (event && event.success === false) report('native-restored-result-failed', event.pluginId || event.methodName || 'unknown-plugin');
    });
  }
  window.addEventListener('pagehide', function () { write('clean'); });
})();
