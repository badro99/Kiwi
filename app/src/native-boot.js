/* Kiwi Pro · démarrage. Branche les morceaux du runtime natif dans l'ordre
 * d'origine : API window.KiwiNative, restauration de l'appairage, écouteurs,
 * puis les écrans. Dernier morceau de la fonction principale : il retire
 * window.__kiwiNativeRuntime une fois tout branché. */
(function () {
  'use strict';
  var N = window.__kiwiNativeRuntime;
  if (!N) return;
  var plugins = N.plugins, root = N.root, socket = N.socket, network = N.network, app = N.app,
      appearance = N.appearance, call = N.call, armLaunchHandoff = N.armLaunchHandoff,
      secureGet = N.secureGet, secureSet = N.secureSet, savePairing = N.savePairing,
      revokeIdentity = N.revokeIdentity, restorePairing = N.restorePairing,
      commitPairingFromSurface = N.commitPairingFromSurface, hapticLight = N.hapticLight,
      initNativeGateExits = N.initNativeGateExits, paintStatusBar = N.paintStatusBar,
      keyboardInsets = N.keyboardInsets, revealFocused = N.revealFocused,
      paintNetwork = N.paintNetwork, configureKeepAwake = N.configureKeepAwake,
      applyDynamicTypeToWorkspace = N.applyDynamicTypeToWorkspace,
      initPeriodSwipe = N.initPeriodSwipe, initChipRowFollow = N.initChipRowFollow,
      initPlanningDayView = N.initPlanningDayView, initNativeSwipeBack = N.initNativeSwipeBack,
      handleNativeBack = N.handleNativeBack, initNativeTillUx = N.initNativeTillUx,
      initNativeHostWorkspace = N.initNativeHostWorkspace,
      polishNativeWorkspaceCopy = N.polishNativeWorkspaceCopy, checkBiometrics = N.checkBiometrics,
      authenticateBiometric = N.authenticateBiometric,
      handleNativeAppState = N.handleNativeAppState,
      maybePromptBiometricUnlock = N.maybePromptBiometricUnlock,
      syncBlockingLayer = N.syncBlockingLayer, isBlockingNode = N.isBlockingNode,
      initSheetDrag = N.initSheetDrag;
  armLaunchHandoff();

  window.KiwiNative = {
    secureGet: secureGet,
    secureSet: secureSet,
    savePairing: savePairing,
    revokeIdentity: revokeIdentity,
    hapticLight: hapticLight,
    checkBiometrics: checkBiometrics,
    authenticateBiometric: authenticateBiometric,
    handleNativeAppState: handleNativeAppState,
    maybePromptBiometricUnlock: maybePromptBiometricUnlock,
    handleBackButton: handleNativeBack,
    deviceIdentity: function () { return call(socket, 'deviceIdentity').then(function (r) { return r && r.id || ''; }); }
  };
  restorePairing();
  call(socket, 'deviceIdentity').then(function (r) {
    if (!r || !r.id) return;
    window.KiwiNative.deviceId = r.id;
    try { localStorage.setItem('kiwi:caisse:terminal-id:v1', r.id); } catch (_) {}
  });
  /* A toast never buzzes (design 2027, §15.6): the listener that played Error or
     Success on every toast is gone. A haptic belongs to the gesture that earned
     it, through kiwi:native-haptic (native-runtime.js) or KiwiHaptics. */
  document.addEventListener('kiwi-paired', commitPairingFromSurface);
  window.addEventListener('kiwi:account-revoked', revokeIdentity);
  document.addEventListener('focusin', revealFocused, true);
  /* The WKWebView accessory bar (up, down, Done) read as a web form on every
     text field. Hide it app-wide; keep it only on numeric keypads, which have
     no Return key and would otherwise leave the keyboard with no way out. */
  var keyboardPlugin = plugins.Keyboard, accessoryShown = null;
  function syncAccessoryBar(event) {
    var el = event && event.target;
    var numeric = !!(el && el.matches && el.matches('input[inputmode="numeric"],input[inputmode="decimal"],input[type="number"],input[type="tel"]'));
    if (numeric === accessoryShown) return;
    accessoryShown = numeric;
    call(keyboardPlugin, 'setAccessoryBarVisible', { isVisible:numeric });
  }
  document.addEventListener('focusin', syncAccessoryBar, true);
  call(keyboardPlugin, 'setAccessoryBarVisible', { isVisible:false }).then(function () { accessoryShown = false; });
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', keyboardInsets);
    window.visualViewport.addEventListener('scroll', keyboardInsets);
    keyboardInsets();
  }
  new MutationObserver(paintStatusBar).observe(root, { attributes: true, attributeFilter: ['data-theme', 'data-vexel-mode', 'lang', 'dir'] });
  if (document.body) new MutationObserver(function (records) {
    if (records.some(function (record) {
      return isBlockingNode(record.target) || Array.from(record.removedNodes || []).some(isBlockingNode) || Array.from(record.addedNodes || []).some(isBlockingNode);
    })) syncBlockingLayer();
  }).observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['class', 'hidden', 'style'] });
  document.addEventListener('animationend', function (event) {
    if (isBlockingNode(event.target)) syncBlockingLayer();
  });
  if (appearance) {
    if (typeof appearance.addEventListener === 'function') appearance.addEventListener('change', paintStatusBar);
    else if (typeof appearance.addListener === 'function') appearance.addListener(paintStatusBar);
  }
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
  initSheetDrag();
  initNativeSwipeBack();
  initPeriodSwipe();
  initChipRowFollow();
  initPlanningDayView();
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { initNativeGateExits(); initNativeTillUx(); initNativeHostWorkspace(); polishNativeWorkspaceCopy(); maybePromptBiometricUnlock(); });
  } else {
    initNativeGateExits();
    initNativeTillUx();
    initNativeHostWorkspace();
    polishNativeWorkspaceCopy();
    maybePromptBiometricUnlock();
  }
  try { delete window.__kiwiNativeRuntime; } catch (_) { window.__kiwiNativeRuntime = undefined; }
})();
