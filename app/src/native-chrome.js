/* Kiwi Pro · habillage système. Barre d'état, clavier, bandeau hors ligne,
 * mise en veille, taille du texte, thème du système.
 * Partie du runtime natif (native-runtime.js). */
(function () {
  'use strict';
  var N = window.__kiwiNativeRuntime;
  if (!N) return;
  var cap = N.cap, root = N.root, plugins = N.plugins, statusBar = N.statusBar,
      keepAwake = N.keepAwake, call = N.call, nativeBlockingLayer = N.nativeBlockingLayer,
      openNativeLayers = N.openNativeLayers;
  function themedDashboardGate() {
    if (!/dashboard\.html$/i.test(location.pathname)) return false;
    var visible = function (node) {
      if (!node || node.hidden) return false;
      var style = getComputedStyle(node);
      return style.display !== 'none' && style.visibility !== 'hidden';
    };
    var onboarding = document.querySelector('.kob-root');
    if (onboarding && !onboarding.classList.contains('kob-out')) return true;
    return visible(document.querySelector('[data-kiwi-lock]'));
  }
  /* What is painted under the clock decides the status bar text. Overlays were
   * assumed dark, so the full-page Kiwi AI sheet in a light workspace (white)
   * got white clock, signal and battery on white. Composite the backgrounds
   * under a point next to the clock until one is opaque; null means nothing
   * conclusive (gradients, images), and the caller keeps its old answer. */
  function paintedDarkAt(x, y) {
    var stack;
    try { stack = document.elementsFromPoint(x, y); } catch (_) { return null; }
    var layers = [];
    for (var i = 0; i < stack.length; i++) {
      var m = /^rgba?\(([^)]+)\)$/.exec(getComputedStyle(stack[i]).backgroundColor || '');
      if (!m) continue;
      var v = m[1].split(',').map(parseFloat);
      var a = v.length > 3 ? v[3] : 1;
      if (!(a > 0)) continue;
      layers.push({ r: v[0], g: v[1], b: v[2], a: a });
      if (a >= 0.98) break;
    }
    if (!layers.length || layers[layers.length - 1].a < 0.98) return null;
    var base = layers.pop(), r = base.r, g = base.g, b = base.b;
    while (layers.length) {
      var top = layers.pop();
      r = top.r * top.a + r * (1 - top.a); g = top.g * top.a + g * (1 - top.a); b = top.b * top.a + b * (1 - top.a);
    }
    function lin(c) { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
    return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b) < 0.179;
  }
  var lastStatusBarStyle = '';
  function paintStatusBar() {
    // SwiftUI setup has an ink background regardless of the web/system theme.
    var setup = document.body && document.body.classList.contains('native-shell-page');
    var till = /kiwi-caisse\.html$/i.test(location.pathname);
    // Owner and Team follow the painted appearance. Till code/clock-in and
    // Kitchen pairing are ink gates, but Kitchen production can be light.
    var gateActive = !!document.querySelector('.screen-pin.is-active,.screen-clockin.is-active,.screen-table.is-active');
    var blocking = nativeBlockingLayer() && !themedDashboardGate() && !gateActive;
    if (blocking && !setup && openNativeLayers().length) {
      var painted = paintedDarkAt(72, 32);
      if (painted !== null) blocking = painted;
    }
    // The invariant launch/lock canvas stays ink even in a light workspace.
    var lockCanvas = document.querySelector('[data-kiwi-lock],.screen-pin.is-active');
    var inkLock = !!(lockCanvas && !lockCanvas.hidden && getComputedStyle(lockCanvas).display !== 'none');
    var dark = setup || inkLock || !!document.querySelector('#pair.on') || blocking || (till ? root.getAttribute('data-caisse-theme') === 'dark' : root.getAttribute('data-theme') === 'dark' || root.getAttribute('data-vexel-mode') === 'dark');
    var nextStyle = dark ? 'DARK' : 'LIGHT';
    if (nextStyle === lastStatusBarStyle) return;
    lastStatusBarStyle = nextStyle;
    call(statusBar, 'setStyle', { style: nextStyle });
    if (cap.getPlatform && cap.getPlatform() === 'android') call(statusBar, 'setBackgroundColor', { color: dark ? '#0A0F0D' : '#F7F5F0' });
  }
  function keyboardInsets() {
    if (!window.visualViewport) return;
    var viewport = window.visualViewport;
    var keyboard = Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop);
    root.style.setProperty('--kiwi-keyboard', keyboard > 80 ? keyboard + 'px' : '0px');
    // The keyboard already covers the home indicator: its height must not be
    // added on top of the bottom safe area.
    root.classList.toggle('kiwi-keyboard-open', keyboard > 80);
  }
  function revealFocused(event) {
    var target = event.target;
    if (!target || !target.matches || !target.matches('input,textarea,[contenteditable="true"]')) return;
    setTimeout(function () { try { target.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'smooth' }); } catch (_) {} }, 180);
  }
  /* Each screen says what being offline actually does to it. Only the till
     keeps an outbox; the waiter's order is refused (and says so), the kitchen
     receives nothing new, and the dashboard shows its last figures. */
  function offlineCopy() {
    var lang = String(root.lang || 'fr').toLowerCase();
    var page = location.pathname.split('/').pop();
    var lines = {
      'kiwi-caisse.html': ['Hors ligne. Les ventes restent sur cette caisse et partent au retour du réseau.', 'Offline. Sales stay on this till and send when the network returns.', 'لا يوجد اتصال. تبقى المبيعات على هذا الصندوق وتُرسل عند عودة الشبكة.'],
      'kiwi-serveur.html': ['Hors ligne. Les commandes ne partent pas en cuisine : renvoyez-les au retour du réseau.', 'Offline. Orders do not reach the kitchen: send them again when the network returns.', 'لا يوجد اتصال. لا تصل الطلبات إلى المطبخ: أعد إرسالها عند عودة الشبكة.'],
      'kiwi-cuisine.html': ['Hors ligne. Les nouveaux bons arriveront au retour du réseau.', 'Offline. New tickets will arrive when the network returns.', 'لا يوجد اتصال. ستصل الطلبات الجديدة عند عودة الشبكة.'],
      'dashboard.html': ['Hors ligne. Les chiffres affichés datent de la dernière connexion.', 'Offline. Figures shown are from the last connection.', 'لا يوجد اتصال. الأرقام المعروضة من آخر اتصال.']
    };
    var line = lines[page] || ['Hors ligne. Vérifiez la connexion de cet appareil.', 'Offline. Check this device’s connection.', 'لا يوجد اتصال. تحقق من اتصال هذا الجهاز.'];
    return lang.indexOf('ar') === 0 ? line[2] : lang.indexOf('en') === 0 ? line[1] : line[0];
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
    var text = offlineCopy();
    if (banner.textContent !== text) banner.textContent = text;
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
    /* --type-scale only reached the native chrome; the pages themselves stayed
       at their fixed sizes whatever the phone's text setting. On iPhone, WebKit
       scales the whole page's text through text-size-adjust, so the chrome then
       keeps scale 1 (both would double it). iPad has no text autosizing and
       keeps the chrome-only scale. */
    var iphone = /iPhone|iPod/.test(navigator.userAgent || '');
    var ownerPage = location.pathname.split('/').pop() === 'dashboard.html';
    function applyScale(scale, result) {
      if (typeof scale !== 'number' || isNaN(scale)) return;
      /* Android reports hostTextZoom: the WebView already zooms every font size
         from the same setting, so a CSS scale on top would count it twice. */
      if (result && typeof result.hostTextZoom === 'number') scale = 1;
      /* iPhone text-size-adjust scales every font in the page. The owner
         dashboard follows Apple's accessibility sizes up to 200 % and reflows
         through the .kiwi-large-type rules in native-runtime.css. The till,
         waiter and kitchen screens are used at arm's length and keep their
         135 % ceiling, and so does any host that only scales the chrome
         through --type-scale (iPad: no reflow work there). */
      var ceiling = iphone && ownerPage ? 2 : 1.35;
      var capped = Math.min(ceiling, Math.max(0.85, scale));
      var neutral = Math.abs(capped - 1) < 0.005;
      root.classList.toggle('kiwi-large-type', ceiling > 1.35 && capped > 1.35);
      if (iphone) {
        var percent = neutral ? '' : Math.round(capped * 100) + '%';
        [root, document.body].forEach(function (node) {
          if (!node) return;
          if (percent) { node.style.setProperty('-webkit-text-size-adjust', percent, 'important'); node.style.setProperty('text-size-adjust', percent, 'important'); }
          else { node.style.removeProperty('-webkit-text-size-adjust'); node.style.removeProperty('text-size-adjust'); }
        });
        root.style.removeProperty('--type-scale');
        return;
      }
      if (neutral) root.style.removeProperty('--type-scale');
      else root.style.setProperty('--type-scale', String(capped));
    }
    if (typeof dynamicType.getDynamicTypeScale === 'function') {
      try {
        Promise.race([
          dynamicType.getDynamicTypeScale(),
          new Promise(function (_, reject) { setTimeout(function () { reject(new Error('timeout')); }, 1000); })
        ]).then(function (result) { if (result) applyScale(result.scale, result); }).catch(function () {});
      } catch (_) {}
    }
    if (typeof dynamicType.addListener === 'function') {
      try { dynamicType.addListener('dynamicTypeChange', function (result) { if (result) applyScale(result.scale, result); }); } catch (_) {}
    }
  }

  /* Light and dark follow the phone in every role. Each surface keeps its own
     switch on the web; inside the app the system decides and the switches
     are hidden (native-runtime.css). */
  function followSystemTheme(role) {
    var media = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)');
    if (!media) return;
    var apply = function () {
      var next = media.matches ? 'dark' : 'light';
      if (role === 'caisse') {
        var till = window.KiwiCaisseTheme;
        if (till && till.current() !== next) till.set(next);
      } else if (role === 'dashboard') {
        var dash = window.KiwiDashTheme;
        if (dash && (dash.get() !== next || root.getAttribute('data-theme') !== next)) dash.set(next);
      } else {
        try { localStorage.removeItem('kiwiTheme'); } catch (_) {}
        if (typeof window.__kiwiApplyTheme === 'function') window.__kiwiApplyTheme();
      }
      if (typeof paintStatusBar === 'function') paintStatusBar();
    };
    if (typeof media.addEventListener === 'function') media.addEventListener('change', apply);
    apply();
  }
  // These overlays are always dark, even in a light workspace. Observe only
  // their changes: native tab publication itself mutates unrelated body nodes.
  function syncBlockingLayer() {
    paintStatusBar();
    // Sheets and drawers slide in; the first paint samples the page under them.
    setTimeout(paintStatusBar, 420);
    if (window.KiwiNativeHostRequestState) window.KiwiNativeHostRequestState();
  }
  function isBlockingNode(node) {
    if (node && node.matches && node.matches('.kiwi-backdrop,.kiwi-drawer-backdrop')) return true;
    // Full-page dialogs (invoicing, compliance) declare themselves modal.
    if (node && node.matches && (node.matches('[aria-modal="true"]') || (node.querySelector && node.querySelector('[aria-modal="true"]')))) return true;
    if (node && (node.id === 'pair' || node.id === 'screen-pin' || node.id === 'screen-clockin' || node.id === 'screen-table')) return true;
    return node && (node.id === 'pin-screen' || node.id === 'cp-pin-screen' || node.id === 'clockin-screen' || (node.hasAttribute && (node.hasAttribute('data-kiwi-greet') || node.hasAttribute('data-kiwi-lock'))) || (node.matches && node.matches('.modal-veil,.drawer-veil,.cloture-veil,.kds-screen,#stock-screen,.kiwi-native-account,.kob-root')) || node === document.body);
  }
  /* Partagé avec les morceaux suivants du runtime natif. */
  N.paintStatusBar = paintStatusBar; N.keyboardInsets = keyboardInsets;
  N.revealFocused = revealFocused; N.paintNetwork = paintNetwork;
  N.configureKeepAwake = configureKeepAwake;
  N.applyDynamicTypeToWorkspace = applyDynamicTypeToWorkspace;
  N.followSystemTheme = followSystemTheme; N.syncBlockingLayer = syncBlockingLayer;
  N.isBlockingNode = isBlockingNode;
})();
