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

  window.KiwiNative = {
    secureGet: secureGet, secureSet: secureSet, savePairing: savePairing, hapticLight: hapticLight,
    deviceIdentity: function () { return call(socket, 'deviceIdentity').then(function (r) { return r && r.id || ''; }); }
  };
  restorePairing();
  call(socket, 'deviceIdentity').then(function (r) {
    if (!r || !r.id) return;
    window.KiwiNative.deviceId = r.id;
    try { localStorage.setItem('kiwi:caisse:terminal-id:v1', r.id); } catch (_) {}
  });
  window.addEventListener('kiwi:native-haptic', function (event) { if (!event.detail || event.detail.kind === 'light') hapticLight(); });
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
  call(network, 'getStatus').then(paintNetwork);
  if (network && typeof network.addListener === 'function') network.addListener('networkStatusChange', paintNetwork);
  if (app && typeof app.addListener === 'function') app.addListener('appStateChange', function (state) { if (!state || state.isActive === false) savePairing(); });
})();
