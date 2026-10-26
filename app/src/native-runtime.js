/* Kiwi Pro : comportements réservés au conteneur Capacitor.
 *
 * Point d'entrée du runtime natif. Il ne tourne que dans l'app (garde
 * isNativePlatform) et pose ce que les autres morceaux partagent : les plugins,
 * call(), la version de l'app dans les rapports d'erreur, la feuille native et
 * les haptiques. Les morceaux suivent dans l'ordre de
 * tools/app-bundle-manifest.json › runtimeScripts, chacun dans sa propre
 * fonction, et lisent ce partage dans window.__kiwiNativeRuntime ;
 * native-boot.js le branche puis le retire de window. */
(function () {
  'use strict';
  var cap = window.Capacitor;
  if (!cap || typeof cap.isNativePlatform !== 'function' || !cap.isNativePlatform()) return;
  var N = window.__kiwiNativeRuntime = {};
  var root = document.documentElement, plugins = cap.Plugins || {};
  var socket = plugins.KiwiPrinterSocket, app = plugins.App, network = plugins.Network;
  var statusBar = plugins.StatusBar, keepAwake = plugins.KeepAwake, splashScreen = plugins.SplashScreen;
  var appearance = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
  root.classList.add('kiwi-native');

  /* Les rapports d'erreur (assets/err-reporter.js → POST /api/error) portent la
     version de l'app et la plateforme, pas seulement l'empreinte du bundle web :
     « pro/ios/1.0.0 (12) · b3c9e1 ». Lu au moment du rapport, donc l'écriture
     asynchrone suffit ; avant la réponse de App.getInfo on a déjà la plateforme. */
  var bundleMeta = document.querySelector('meta[name="kiwi-bundle"]');
  var bundleTag = bundleMeta && bundleMeta.content ? ' · ' + String(bundleMeta.content).slice(0, 8) : '';
  var platform = cap.getPlatform ? cap.getPlatform() : 'native';
  root.classList.add('kiwi-native-' + platform);
  window.__KIWI_APP_VERSION = 'pro/' + platform + bundleTag;
  call(app, 'getInfo').then(function (info) {
    if (!info || !info.version) return;
    window.__KIWI_APP_VERSION = 'pro/' + platform + '/' + info.version + (info.build ? ' (' + info.build + ')' : '') + bundleTag;
    if (!document.querySelectorAll) return;
    document.querySelectorAll('[data-footer-line]').forEach(function (line) {
      Array.prototype.forEach.call(line.childNodes, function (child) {
        if (child.nodeType === 3) child.nodeValue = child.nodeValue.replace(/Kiwi v\d+(?:\.\d+)*/g, 'Kiwi Pro ' + info.version + (info.build ? ' (' + info.build + ')' : ''));
      });
    });
  });

  function callResult(plugin, method, args) {
    if (!plugin || typeof plugin[method] !== 'function') return Promise.resolve({ ok: false, reason: 'unsupported' });
    /* The plugin is called synchronously, as before: a terminal Back must
       reach the native layer in the same tick. Only its answer is awaited. */
    var pending;
    try { pending = Promise.resolve(plugin[method](args || {})); } catch (error) { pending = Promise.reject(error); }
    return pending.then(function (value) {
      return { ok: true, value: value };
    }, function (error) {
      var code = String(error && error.code || '');
      return { ok: false, reason: /cancel/i.test(code) || error && error.name === 'AbortError' ? 'cancelled' : /unimplemented|unavailable|unsupported/i.test(code) ? 'unsupported' : 'failure' };
    });
  }
  function call(plugin, method, args) {
    return callResult(plugin, method, args).then(function (result) {
      if (!result.ok) {
        try { window.dispatchEvent(new CustomEvent('kiwi:native-call-error', { detail: { method: method, reason: result.reason } })); } catch (_) {}
      }
      return result.ok ? result.value : null;
    });
  }
  /* Native sheet (KiwiNativeShell.swift › presentNativeSheet). The host
     announces it with window.__kiwiHostCaps before any page script runs; a
     page without it, or a browser test, keeps its web sheet. One promise per
     sheet, resolved with the chosen action id or "dismiss". */
  var sheetSeq = 0, sheetWaiters = {};
  function nativeSheetAvailable() {
    return !!(window.__kiwiHostCaps && window.__kiwiHostCaps.sheet && window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.kiwiShell);
  }
  window.KiwiNativeSheetResult = function (result) {
    var done = result && sheetWaiters[result.id];
    if (!done) return;
    delete sheetWaiters[result.id];
    done(String(result.action || 'dismiss'));
  };
  function nativeSheet(spec) {
    return new Promise(function (resolve) {
      var id = 'sheet-' + (++sheetSeq);
      sheetWaiters[id] = resolve;
      var dark = root.getAttribute('data-theme') === 'dark' || root.getAttribute('data-vexel-mode') === 'dark' || root.getAttribute('data-caisse-theme') === 'dark';
      try {
        window.webkit.messageHandlers.kiwiShell.postMessage({ sheet: {
          id: id, title: String(spec.title || ''), message: String(spec.message || ''), icon: String(spec.icon || ''),
          dark: dark, rtl: root.getAttribute('dir') === 'rtl',
          actions: (spec.actions || []).map(function (a) { return { id: String(a.id), label: String(a.label), style: String(a.style || 'plain') }; })
        } });
      } catch (_) { delete sheetWaiters[id]; resolve('dismiss'); }
    });
  }
  /* Every haptic in the native runtime goes through KiwiHaptics (assets/kit/haptics.js,
     design 2027 §15 and §20.3), which owns the class map, one gesture one
     haptic, the throttles, the 600 ms rule and the never-buzz list. Where the
     module is not loaded (the kitchen screen, which never buzzes) nothing plays.
     lastPressAt is the last finger-down: the moment a code's final digit went in,
     so a verdict answered later than 600 ms buzzes nothing. */
  var lastPressAt = 0;
  document.addEventListener('pointerdown', function () { lastPressAt = performance.now(); }, { passive: true, capture: true });
  function khPlay(cls, prefix, meta) {
    try { var k = window.KiwiHaptics; if (k) k.play(cls, k.gid(prefix), meta || { trigger: 'tap' }); } catch (_) {}
  }
  function hapticLight() { khPlay('Adjust', 'native', { trigger: 'tap' }); }
  /* A refused code is a Failed, on the response, inside 600 ms of the last press. */
  function hapticFailed(id) {
    try { var k = window.KiwiHaptics; if (k) k.play('Failed', id, { trigger: 'response', gestureAt: lastPressAt }); } catch (_) {}
  }
  /* The shipped kiwi:native-haptic event, kept as an adapter until stage 7 (§20.3):
     light is an Adjust, success is a Paid only when the dispatcher names its
     gesture and says it is a local record, danger is a Failed on the response
     (until the PIN pad of stage 3 calls Failed itself), within 600 ms of the
     last finger-down. */
  window.addEventListener('kiwi:native-haptic', function (event) {
    try {
      var k = window.KiwiHaptics;
      if (!k) return;
      var d = Object.assign({}, event.detail || {});
      if (d.kind === 'danger' && typeof d.gestureAt !== 'number') d.gestureAt = lastPressAt;
      k.fromNativeEvent(d);
    } catch (_) {}
  });
  /* Partagé avec les morceaux suivants du runtime natif. */
  N.cap = cap; N.root = root; N.plugins = plugins; N.socket = socket; N.app = app;
  N.network = network; N.splashScreen = splashScreen; N.statusBar = statusBar;
  N.keepAwake = keepAwake; N.appearance = appearance; N.call = call; N.callResult = callResult;
  N.nativeSheetAvailable = nativeSheetAvailable; N.nativeSheet = nativeSheet; N.khPlay = khPlay;
  N.hapticLight = hapticLight; N.hapticFailed = hapticFailed;
  Object.defineProperty(N, 'lastPressAt', { get: function () { return lastPressAt; } });
})();
