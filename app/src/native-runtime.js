/* Kiwi Pro : comportements réservés au conteneur Capacitor. */
(function () {
  'use strict';
  var cap = window.Capacitor;
  if (!cap || typeof cap.isNativePlatform !== 'function' || !cap.isNativePlatform()) return;
  var root = document.documentElement, plugins = cap.Plugins || {};
  var socket = plugins.KiwiPrinterSocket, app = plugins.App, network = plugins.Network;
  var haptics = plugins.Haptics, statusBar = plugins.StatusBar, keepAwake = plugins.KeepAwake, splashScreen = plugins.SplashScreen;
  var appearance = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
  var pairingKeys = ['kiwiPaired', 'kiwiPairedVenue', 'kiwiLiveMerchant', 'kiwiLive'];
  var nativeIdentityKeys = pairingKeys.concat(['kiwiPairings']);
  var NATIVE_REVOKED_FLAG = 'kiwi:native:identity-revoked:v1';
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

  function call(plugin, method, args) {
    try {
      if (!plugin || typeof plugin[method] !== 'function') return Promise.resolve(null);
      return Promise.resolve(plugin[method](args || {})).catch(function () { return null; });
    } catch (_) { return Promise.resolve(null); }
  }
  function nativeHostPost(payload) {
    try {
      var ios = window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.kiwiShell;
      if (ios && typeof ios.postMessage === 'function') {
        ios.postMessage(payload);
        /* syncTabs observes body.class. Re-applying an existing class still
           produces an attribute mutation in WKWebView, which called syncTabs
           again until WebKit killed the runaway content process. */
        if (document.body && !document.body.classList.contains('kiwi-native-hosted')) document.body.classList.add('kiwi-native-hosted');
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
  var splashHidden = false;
  var splashFallback = setTimeout(hideLaunchSplash, 8000);
  function hideLaunchSplash() {
    if (splashHidden) return;
    splashHidden = true;
    clearTimeout(splashFallback);
    var hide = function () { call(splashScreen, 'hide'); };
    /* Two frames guarantee the parsed workspace has submitted one real paint
       before the native launch layer fades. The bounded fallback above means
       a broken page can never trap the merchant behind the splash forever. */
    if (typeof window.requestAnimationFrame === 'function') {
      window.requestAnimationFrame(function () { window.requestAnimationFrame(hide); });
    } else setTimeout(hide, 0);
  }
  function armLaunchHandoff() {
    var launcher = /(?:^|\/)index\.html$/.test(location.pathname) || location.pathname === '/';
    if (launcher) {
      window.addEventListener('kiwi:native-ready', hideLaunchSplash, { once: true });
    } else if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', hideLaunchSplash, { once: true });
    } else hideLaunchSplash();
  }
  armLaunchHandoff();
  function secureGet(key) { return call(socket, 'secureGet', { key: key }).then(function (r) { return r && typeof r.value === 'string' ? r.value : null; }); }
  function secureSet(key, value) { return value == null ? call(socket, 'secureRemove', { key: key }) : call(socket, 'secureSet', { key: key, value: String(value) }); }
  function pairingSnapshot() {
    var out = {};
    try { pairingKeys.forEach(function (key) { var value = localStorage.getItem(key); if (value != null) out[key] = value; }); } catch (_) {}
    return out.kiwiPaired === '1' && out.kiwiPairedVenue ? JSON.stringify(out) : '';
  }
  function savePairing() { var value = pairingSnapshot(); return secureSet('pairing-v1', value || null); }
  function clearLocalPairingIdentity() {
    try { nativeIdentityKeys.forEach(function (key) { localStorage.removeItem(key); }); } catch (_) {}
    try { sessionStorage.removeItem('kiwiNativePairingRestored'); } catch (_) {}
  }
  function clearRevocationFence() {
    try { localStorage.removeItem(NATIVE_REVOKED_FLAG); } catch (_) {}
    try { window.__kiwiAccountRevoked = false; } catch (_) {}
  }
  function revokeIdentity() {
    try { window.__kiwiAccountRevoked = true; } catch (_) {}
    try { localStorage.setItem(NATIVE_REVOKED_FLAG, '1'); } catch (_) {}
    clearLocalPairingIdentity();
    /* This is intentionally only the secure pairing blob. Sales, queues and
     * other offline evidence stay on-device for later recovery/export. */
    return secureSet('pairing-v1', null);
  }
  function restorePairing() {
    var fenced = false;
    try { fenced = window.__kiwiAccountRevoked === true || localStorage.getItem(NATIVE_REVOKED_FLAG) === '1'; } catch (_) {}
    if (fenced) return revokeIdentity().then(function () { return false; });
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
  function commitPairingFromSurface(event) {
    var snapshot = pairingSnapshot();
    if (!snapshot) return Promise.resolve(false);
    /* The shared pairing commit is the only production writer of these keys.
     * Match its event to the freshly written venue before releasing a native
     * revocation fence, then persist that exact snapshot first. A synthetic
     * event cannot resurrect the old secure blob because revokeIdentity removed
     * it and this path only clears the fence after secureSet succeeds. */
    try {
      var saved = JSON.parse(snapshot);
      var detail = event && event.detail;
      var venue = JSON.parse(saved.kiwiPairedVenue || 'null');
      if (detail && detail.merchant && (!venue || venue.merchant !== detail.merchant)) return Promise.resolve(false);
    } catch (_) { return Promise.resolve(false); }
    return savePairing().then(function () {
      clearRevocationFence();
      return true;
    });
  }
  function hapticLight() { return call(haptics, 'impact', { style: 'LIGHT' }); }
  function hapticNotice(kind) { return call(haptics, 'notification', { type: kind === 'danger' ? 'ERROR' : 'SUCCESS' }); }
  function nativeBlockingLayer() {
    if (openNativeLayers().length) return true;
    if (document.body && (document.body.classList.contains('nav-open') || document.body.classList.contains('kw-menu-open'))) return true;
    var onboarding = document.querySelector('.kob-root');
    if (onboarding && !onboarding.classList.contains('kob-out')) return true;
    var dashboardLock = document.querySelector('[data-kiwi-lock]');
    if (dashboardLock) {
      var paintedLock = getComputedStyle(dashboardLock);
      if (paintedLock.display !== 'none' && paintedLock.visibility !== 'hidden') return true;
    }
    return [document.getElementById('pin-screen'), document.getElementById('clockin-screen'), document.querySelector('[data-kiwi-greet]')].some(function (node) {
      if (!node || node.hidden) return false;
      if (node.id !== 'pin-screen' && !node.classList.contains('is-visible')) return false;
      var style = getComputedStyle(node);
      // Entrance animations start at opacity zero, but the gate is already
      // active. Do not flash navigation or dark status text during that frame.
      return style.display !== 'none' && style.visibility !== 'hidden';
    });
  }
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
  var lastStatusBarStyle = '';
  function paintStatusBar() {
    // SwiftUI setup has an ink background regardless of the web/system theme.
    var setup = document.body && document.body.classList.contains('native-shell-page');
    var kitchen = /kiwi-cuisine\.html$/i.test(location.pathname);
    var till = /kiwi-caisse\.html$/i.test(location.pathname);
    // The dashboard's lock and first-run questions follow its light/dark
    // theme; every other gate (clock-in, PIN, greeting) is always dark.
    var dark = setup || kitchen || (nativeBlockingLayer() && !themedDashboardGate()) || (till ? root.getAttribute('data-caisse-theme') === 'dark' : root.getAttribute('data-theme') === 'dark' || root.getAttribute('data-vexel-mode') === 'dark');
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
      '.modal-veil.is-open,.drawer-veil.is-open,.cloture-veil.is-open,.kds-screen.is-open,#stock-screen.is-open,#cp-pin-screen,.kiwi-native-account.is-open'
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
    if (lang.indexOf('ar') === 0) return { label: 'التنقل الرئيسي', salle: 'الصالة', vrap: 'طلبات خارجية', waitlist: 'الانتظار', more: 'المزيد', card: 'بطاقة', actions: 'إجراءات أخرى', less: 'إخفاء الإجراءات', close: 'طي الفاتورة', view: 'عرض الفاتورة', clear: 'إفراغ الطلب' };
    if (lang.indexOf('en') === 0) return { label: 'Primary navigation', salle: 'Floor', vrap: 'Takeaway', waitlist: 'Waiting', more: 'More', card: 'Card', actions: 'More actions', less: 'Hide actions', close: 'Collapse bill', view: 'View bill', clear: 'Clear order' };
    return { label: 'Navigation principale', salle: 'Salle', vrap: 'À emporter', waitlist: 'Attente', more: 'Plus', card: 'Carte', actions: 'Autres actions', less: 'Masquer les actions', close: 'Replier l’addition', view: 'Voir la note', clear: 'Vider la commande' };
  }

  function nativeAccountDeletion() {
    if (document.querySelector('.kiwi-native-account')) return;
    var lang = String(root.lang || 'fr').slice(0, 2);
    var words = lang === 'en'
      ? { title:'Delete my account', detail:'This requests deletion of your account and all its establishments. Export your data first. Kiwi handles requests within 30 days.', password:'Account password', submit:'Confirm request', close:'Close', checking:'Checking account…', signin:'Sign in with the owner account first.', failed:'The request could not be recorded.', received:'Request recorded', wrong:'Incorrect password.' }
      : lang === 'ar'
      ? { title:'حذف حسابي', detail:'يشمل الطلب حسابك وجميع مؤسساته. صدّر بياناتك أولاً. يعالج Kiwi الطلب خلال 30 يوماً.', password:'كلمة مرور الحساب', submit:'تأكيد الطلب', close:'إغلاق', checking:'جارٍ التحقق…', signin:'سجّل الدخول إلى حساب المالك أولاً.', failed:'تعذّر تسجيل الطلب.', received:'تم تسجيل الطلب', wrong:'كلمة المرور غير صحيحة.' }
      : { title:'Supprimer mon compte', detail:'Cette demande concerne votre compte et tous ses établissements. Exportez vos données avant de confirmer. Kiwi traite la demande sous 30 jours.', password:'Mot de passe du compte', submit:'Confirmer la demande', close:'Fermer', checking:'Vérification du compte…', signin:'Connectez-vous au compte propriétaire.', failed:'La demande n’a pas pu être enregistrée.', received:'Demande enregistrée', wrong:'Mot de passe incorrect.' };
    var overlay = document.createElement('div');
    overlay.className = 'kiwi-native-account is-open';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', words.title);
    overlay.innerHTML = '<div class="kiwi-native-account-card"><h2></h2><p></p><div class="kiwi-native-account-email"></div><label><span></span><input type="password" autocomplete="current-password"></label><div class="kiwi-native-account-status" role="status"></div><div class="kiwi-native-account-actions"><button type="button" data-close></button><button type="button" data-submit disabled></button></div></div>';
    var card = overlay.firstElementChild, password = card.querySelector('input');
    card.querySelector('h2').textContent = words.title;
    card.querySelector('p').textContent = words.detail;
    card.querySelector('label span').textContent = words.password;
    card.querySelector('[data-close]').textContent = words.close;
    var submit = card.querySelector('[data-submit]'); submit.textContent = words.submit;
    var status = card.querySelector('[role="status"]'); status.textContent = words.checking;
    card.querySelector('[data-close]').addEventListener('click', function () { password.value = ''; overlay.remove(); if (window.KiwiNativeHostRequestState) window.KiwiNativeHostRequestState(); });
    overlay.addEventListener('click', function (event) { if (event.target === overlay) card.querySelector('[data-close]').click(); });
    document.body.appendChild(overlay);
    if (window.KiwiNativeHostRequestState) window.KiwiNativeHostRequestState();
    fetch('/api/account/deletion-request', { credentials:'include', cache:'no-store' }).then(function (res) {
      return res.json().then(function (body) { if (!res.ok) throw new Error(body.error || 'unavailable'); return body; });
    }).then(function (body) {
      card.querySelector('.kiwi-native-account-email').textContent = body.account && body.account.email || '';
      if (body.request) { status.textContent = words.received + ' · ' + body.request.reference; return; }
      status.textContent = ''; submit.disabled = false;
    }).catch(function (error) { status.textContent = error.message === 'unauthenticated' ? words.signin : words.failed; });
    submit.addEventListener('click', function () {
      if (submit.disabled || !password.value) { password.focus(); return; }
      submit.disabled = true; status.textContent = words.checking;
      var body = JSON.stringify({ confirm:true, password:password.value }); password.value = '';
      fetch('/api/account/deletion-request', { method:'POST', credentials:'include', headers:{'Content-Type':'application/json'}, body:body }).then(function (res) {
        return res.json().then(function (result) { if (!res.ok) throw new Error(result.error || 'unavailable'); return result; });
      }).then(function (result) { status.textContent = words.received + ' · ' + result.request.reference; card.querySelector('label').hidden = true; submit.hidden = true; })
        .catch(function (error) { status.textContent = error.message === 'bad-creds' ? words.wrong : words.failed; submit.disabled = false; });
    });
  }

  function nativeWorkspaceAction(payload) {
    if (!payload) return false;
    if (payload.action === 'change-role') { location.href = 'index.html?choose=1'; return true; }
    if (payload.action === 'delete-account') { nativeAccountDeletion(); return true; }
    if (payload.action === 'open-tools') { if (document.body) document.body.classList.add('nav-open'); hapticLight(); if (window.KiwiNativeHostRequestState) window.KiwiNativeHostRequestState(); return true; }
    if (payload.action === 'sign-out') {
      fetch('/auth/logout', { credentials:'include', redirect:'manual' }).then(function () {
        localStorage.removeItem('kiwiAppRole');
        call(socket, 'secureRemove', { key:'app-role' }).then(function () { location.href = 'index.html?setup=1'; });
      }).catch(function () { window.alert(root.lang === 'fr' ? 'Déconnexion impossible hors ligne.' : 'Sign out needs a network connection.'); });
      return true;
    }
    return false;
  }


  /* Phones get the floor as a list first. The plan is held at 640px on purpose
     (caisse-skin.css: squeezing it puts the server chip on the table number), so
     on a 390px screen a third of the room sat off-screen with nothing saying it
     pans. Each row taps the real table node, so the till's own flow runs. */
  function initNativeFloorList() {
    var view = document.querySelector('.view-salle');
    if (!view || view.querySelector('.kiwi-native-floor')) return;
    var lang = String(root.lang || 'fr').slice(0, 2);
    var words = lang === 'en' ? { list: 'List', map: 'Map', view: 'Floor view', empty: 'No tables on this floor.' }
      : lang === 'ar' ? { list: 'قائمة', map: 'المخطط', view: 'عرض القاعة', empty: 'لا توجد طاولات في هذا الطابق.' }
      : { list: 'Liste', map: 'Plan', view: 'Affichage de la salle', empty: 'Aucune table à cet étage.' };
    var STATUS = { 'khawya': ['Libre', 'st-khawya'], 'a-commander': ['À commander', 'st-acmd'], 'ka-yaklo': ['En cours', 'st-yaklo'], 'bgha-ykhlass': ['Addition', 'st-bill'], 'khlass': ['Réglée', 'st-khlass'] };
    var tr = function (fr) { try { return window.KiwiCaisseLang ? window.KiwiCaisseLang.tr(fr) : fr; } catch (_) { return fr; } };
    var box = document.createElement('div');
    box.className = 'kiwi-native-floor';
    box.innerHTML = '<div class="kiwi-native-floor-switch" role="tablist"><button type="button" role="tab" data-floor-view="list"></button><button type="button" role="tab" data-floor-view="map"></button></div><div class="kiwi-native-table-list" role="list"></div>';
    box.setAttribute('data-nolang', '');
    box.firstChild.setAttribute('aria-label', words.view);
    box.querySelector('[data-floor-view="list"]').textContent = words.list;
    box.querySelector('[data-floor-view="map"]').textContent = words.map;
    var anchor = view.querySelector('.legend');
    if (anchor && anchor.parentNode) anchor.parentNode.insertBefore(box, anchor); else view.insertBefore(box, view.firstChild);
    var list = box.querySelector('.kiwi-native-table-list');
    var mode = 'list';
    try { mode = localStorage.getItem('kiwiNativeFloorView') === 'map' ? 'map' : 'list'; } catch (_) {}
    function tablesOnFloor() {
      return Array.prototype.filter.call(view.querySelectorAll('.cplan-tbl[data-table]'), function (node) {
        var canvas = node.closest('.plan-canvas');
        if (canvas && !canvas.classList.contains('is-active')) return false;
        var real = node.closest('.plan-real');
        return !(real && real.hidden);
      });
    }
    function paint() {
      var rows = tablesOnFloor().map(function (node) {
        var status = STATUS[node.getAttribute('data-status')] || STATUS.khawya;
        var parts = String(node.getAttribute('aria-label') || '').split(', ');
        var server = node.querySelector('.tbl-server, .cplan-server');
        return '<button type="button" role="listitem" class="kiwi-native-table-row" data-row-table="' + String(node.getAttribute('data-table')).replace(/"/g, '') + '">' +
          '<span class="kiwi-native-table-id"></span><span class="legend-swatch ' + status[1] + '" aria-hidden="true"></span>' +
          '<span class="kiwi-native-table-status"></span><span class="kiwi-native-table-covers"></span>' +
          (server && server.textContent.trim() ? '<span class="kiwi-native-table-server"></span>' : '') + '</button>';
      });
      list.innerHTML = rows.length ? rows.join('') : '<p class="kiwi-native-table-empty"></p>';
      var empty = list.querySelector('.kiwi-native-table-empty'); if (empty) empty.textContent = words.empty;
      tablesOnFloor().forEach(function (node, index) {
        var row = list.children[index]; if (!row) return;
        var status = STATUS[node.getAttribute('data-status')] || STATUS.khawya;
        var parts = String(node.getAttribute('aria-label') || '').split(', ');
        row.querySelector('.kiwi-native-table-id').textContent = node.getAttribute('data-table');
        row.querySelector('.kiwi-native-table-status').textContent = tr(status[0]);
        row.querySelector('.kiwi-native-table-covers').textContent = parts[2] ? tr(parts[2]) : '';
        var server = node.querySelector('.tbl-server, .cplan-server'), chip = row.querySelector('.kiwi-native-table-server');
        if (chip && server) chip.textContent = server.textContent.trim();
        row.setAttribute('aria-label', (node.getAttribute('data-table') || '') + ', ' + tr(status[0]) + (parts[2] ? ', ' + tr(parts[2]) : ''));
      });
    }
    function setMode(next) {
      mode = next;
      try { localStorage.setItem('kiwiNativeFloorView', next); } catch (_) {}
      document.body.classList.toggle('kiwi-native-floor-list', next === 'list');
      box.querySelectorAll('[data-floor-view]').forEach(function (button) {
        var on = button.getAttribute('data-floor-view') === next;
        button.classList.toggle('is-active', on); button.setAttribute('aria-selected', on ? 'true' : 'false');
      });
      if (next === 'list') paint();
    }
    box.addEventListener('click', function (event) {
      var toggle = event.target.closest('[data-floor-view]');
      if (toggle) { setMode(toggle.getAttribute('data-floor-view')); hapticLight(); return; }
      var row = event.target.closest('[data-row-table]');
      if (!row) return;
      var node = Array.prototype.filter.call(view.querySelectorAll('.cplan-tbl[data-table]'), function (n) { return n.getAttribute('data-table') === row.getAttribute('data-row-table'); })[0];
      if (node) { hapticLight(); node.click(); }
    });
    var pending = false;
    new MutationObserver(function (records) {
      if (mode !== 'list' || pending) return;
      if (records.every(function (r) { return box.contains(r.target); })) return;
      pending = true;
      setTimeout(function () { pending = false; paint(); }, 60);
    }).observe(view, { subtree: true, childList: true, attributes: true, attributeFilter: ['data-status', 'class', 'aria-label', 'hidden'] });
    setMode(mode);
  }

  function initNativeTillUx() {
    if (!/kiwi-caisse\.html$/i.test(location.pathname) || !document.body) return;
    document.body.classList.add('kiwi-native-till');
    if (window.innerWidth <= 600) { try { initNativeFloorList(); } catch (_) {} }
    var copy = nativeTillCopy();
    /* The card button is icon-only on the web till. On a phone it sits beside the
       labelled primary and read as an unexplained black block. */
    var cardButton = document.getElementById('pay-card');
    if (cardButton && !cardButton.querySelector('.kiwi-native-pay-label')) {
      var cardLabel = document.createElement('span');
      cardLabel.className = 'kiwi-native-pay-label';
      cardLabel.setAttribute('data-nolang', '');
      cardLabel.textContent = copy.card;
      cardButton.appendChild(cardLabel);
    }
    var nav = document.createElement('nav');
    nav.className = 'kiwi-native-tabbar';
    nav.setAttribute('aria-label', copy.label);
    nav.setAttribute('data-lens-demo', '');
    var tabItems = [
      ['salle', copy.salle, 'table_restaurant.svg'],
      ['vrap', copy.vrap, 'lunch_dining.svg'],
      ['waitlist', copy.waitlist, 'group.svg'],
      ['more', copy.more, 'category.svg']
    ];
    nav.innerHTML = tabItems.map(function (item) {
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
      var selected = drawerOpen ? 'more' : mode;
      nav.querySelectorAll('[data-native-tab]').forEach(function (button) {
        var tab = button.getAttribute('data-native-tab');
        var active = tab === selected;
        button.classList.toggle('on', active);
        button.setAttribute('aria-current', active ? 'page' : 'false');
      });
      nativeHostPost({
        version:1, screen:'workspace', role:'caisse', locale:String(root.lang || 'fr'), rtl:root.dir === 'rtl', selected:selected,
        tabs:nativeBlockingLayer() || window.innerWidth > 900 ? [] : tabItems.map(function (item) { return { id:item[0], label:item[1] }; })
      });
    }
    function activateNativeTab(mode) {
      if (nativeBlockingLayer()) return false;
      if (mode === 'more') {
        document.body.classList.add('nav-open');
        hapticLight();
        syncTabs();
        return true;
      }
      var source = document.querySelector('.mode-pill[data-mode="' + mode + '"]');
      if (source && !source.disabled && !source.hidden) source.click();
      document.body.classList.remove('nav-open');
      hapticLight();
      syncTabs();
      return true;
    }
    nav.addEventListener('click', function (event) {
      var button = event.target.closest('[data-native-tab]');
      if (!button) return;
      activateNativeTab(button.getAttribute('data-native-tab'));
    });
    window.KiwiNativeHostAction = function (payload) { if (nativeWorkspaceAction(payload)) return; if (payload && payload.action === 'navigate') activateNativeTab(String(payload.id || '')); };
    window.KiwiNativeHostRequestState = syncTabs;
    new MutationObserver(syncTabs).observe(document.body, { attributes: true, attributeFilter: ['data-mode', 'class'] });
    syncTabs();

    var cart = document.querySelector('.rightpanel');
    if (cart) {
      var peek = cart.querySelector('.rp-peek');
      var activeCart = cart.querySelector('.rp-active');
      var grabber = document.createElement('button');
      grabber.type = 'button';
      grabber.className = 'kiwi-native-sheet-grabber';
      grabber.setAttribute('aria-label', copy.close);
      grabber.setAttribute('aria-controls', 'rp-active');
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
      var more = null;
      if (meta) {
        more = document.createElement('button');
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

      /* On a phone the bill is a sheet, and the X at the top of a sheet means
         "put it away". In takeaway the caisse wired that X to clearCart(), so
         one tap meant to peek back at the menu threw the order away. Here the
         X only folds the sheet; emptying the order is an explicit, labelled
         action inside "More actions". */
      var clearing = false;
      var closeX = cart.querySelector('#rp-close');
      if (closeX) {
        document.addEventListener('click', function (event) {
          if (clearing || event.target.closest('#rp-close') !== closeX) return;
          if (document.body.getAttribute('data-mode') !== 'vrap' || !document.body.classList.contains('ticket-open')) return;
          event.preventDefault();
          event.stopPropagation();
          document.body.classList.remove('ticket-open');
        }, true);
        closeX.setAttribute('aria-label', copy.close);
        if (more) {
          var clear = document.createElement('button');
          clear.type = 'button';
          clear.className = 'kiwi-native-cart-clear';
          clear.textContent = copy.clear;
          clear.addEventListener('click', function () {
            clearing = true;
            try { closeX.click(); } finally { clearing = false; }
          });
          more.parentNode.insertBefore(clear, more.nextSibling);
        }
      }

      /* On phones the bill is a bottom sheet. Do not reserve a second bottom
         shelf when no table/cart is selected, and keep the sheet's expanded
         state truthful for VoiceOver as the existing caisse code opens/closes
         the panel. The observer watches state only; no money or cart data is
         duplicated here. */
      function syncCartSheet() {
        var empty = !activeCart || activeCart.hidden || activeCart.style.display === 'none';
        /* An empty takeaway has nothing to show: a "0 items · 0 MAD" shelf only hid products.
           A table with no lines keeps its sheet, which carries the table and its cancel action. */
        if (!empty && document.body.getAttribute('data-mode') === 'vrap' && !activeCart.querySelector('#rp-items .rp-item')) empty = true;
        var expanded = !empty && document.body.classList.contains('ticket-open');
        if (document.body.classList.contains('kiwi-native-cart-empty') !== empty) {
          document.body.classList.toggle('kiwi-native-cart-empty', empty);
        }
        if (empty || !expanded) {
          if (document.body.classList.contains('kiwi-native-cart-actions')) document.body.classList.remove('kiwi-native-cart-actions');
          if (more) {
            more.setAttribute('aria-expanded', 'false');
            if (more.textContent !== copy.actions) more.textContent = copy.actions;
          }
        }
        if (empty && document.body.classList.contains('ticket-open')) document.body.classList.remove('ticket-open');
        if (peek) {
          peek.setAttribute('aria-controls', 'rp-active');
          peek.setAttribute('aria-expanded', expanded ? 'true' : 'false');
          var rows = activeCart ? activeCart.querySelectorAll('#rp-items .rp-item:not(.rp-item--discount)') : [];
          var count = Array.prototype.reduce.call(rows, function (sum, row) {
            var quantity = row.querySelector('.qty-num,.rp-item-qty,.rp-sent-qty');
            return sum + (quantity ? (parseInt(quantity.textContent, 10) || 1) : 1);
          }, 0);
          var label = peek.firstElementChild;
          var total = peek.querySelector('#rp-peek-total');
          var liveTotal = activeCart && activeCart.querySelector('#rp-total');
          var nextLabel = nativeTillCopy().view;
          if (label && label.textContent !== nextLabel) label.textContent = nextLabel;
          if (label && label.getAttribute('data-count') !== String(count)) label.setAttribute('data-count', String(count));
          var spoken = count + ' ' + (root.lang === 'en' ? (count === 1 ? 'item' : 'items') : root.lang === 'ar' ? 'عناصر' : (count === 1 ? 'article' : 'articles'));
          if (peek.getAttribute('aria-description') !== spoken) peek.setAttribute('aria-description', spoken);
          if (total && liveTotal && total.textContent !== liveTotal.textContent) total.textContent = liveTotal.textContent;
        }
        grabber.setAttribute('aria-expanded', expanded ? 'true' : 'false');
      }
      if (activeCart) new MutationObserver(syncCartSheet).observe(activeCart, { attributes: true, childList: true, characterData: true, subtree: true, attributeFilter: ['hidden', 'style'] });
      new MutationObserver(syncCartSheet).observe(document.body, { attributes: true, attributeFilter: ['class', 'data-mode'] });
      syncCartSheet();
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

  function initNativeHostWorkspace() {
    if (/kiwi-caisse\.html$/i.test(location.pathname)) return;
    var role = /kiwi-serveur\.html$/i.test(location.pathname) ? 'equipe' : /kiwi-cuisine\.html$/i.test(location.pathname) ? 'cuisine' : /dashboard\.html$/i.test(location.pathname) ? 'dashboard' : '';
    if (!role) return;
    var owner = role === 'dashboard' ? initNativeOwnerUx() : null;
    var lastPushed = '';
    var push = function () {
      var tabs = nativeBlockingLayer() || window.innerWidth > 900 ? [] : owner ? owner.tabs() : [{ id:'more', label:nativeTillCopy().more }];
      var payload = { version:1, screen:'workspace', role:role, locale:String(root.lang || 'fr'), rtl:root.dir === 'rtl', selected:owner ? owner.selected() : '', tabs:tabs };
      var key = JSON.stringify(payload);
      if (key === lastPushed) return;
      lastPushed = key;
      nativeHostPost(payload);
    };
    window.KiwiNativeHostRequestState = function () { lastPushed = ''; push(); };
    window.KiwiNativeHostAction = function (payload) {
      if (owner && payload && payload.action === 'open-tools') { owner.openMenu(); return; }
      if (nativeWorkspaceAction(payload)) return;
      if (owner && payload && payload.action === 'navigate') owner.go(String(payload.id || ''));
    };
    if (owner) owner.onChange(push);
    push(); setTimeout(push, 300); setTimeout(push, 1200);
  }

  /* Owner home on a phone. The dashboard is the desktop page; on an iPhone the
     owner opens it to answer one question, "how is today going", so the
     revenue card leads, the period switch sits under it and the four pages an
     owner checks from a phone become native tabs. Every tab and quick action
     clicks the page's own control, so no figure is computed twice. */
  function nativeOwnerCopy() {
    var lang = String(root.lang || 'fr');
    if (lang.indexOf('ar') === 0) return { home:'الرئيسية', orders:'الطلبات', report:'التقرير', clients:'الزبناء', more:'المزيد', label:'التنقل', report2:'تقرير اليوم', invoice:'الفواتير', export:'تصدير', customize:'تخصيص' };
    if (lang.indexOf('en') === 0) return { home:'Home', orders:'Orders', report:'Report', clients:'Clients', more:'More', label:'Navigation', report2:'Day report', invoice:'Invoicing', export:'Export', customize:'Customize' };
    return { home:'Accueil', orders:'Commandes', report:'Rapport', clients:'Clients', more:'Plus', label:'Navigation', report2:'Rapport du jour', invoice:'Facturation', export:'Exporter', customize:'Personnaliser' };
  }
  function initNativeOwnerUx() {
    if (!document.body) return null;
    document.body.classList.add('kiwi-native-owner');
    var copy = nativeOwnerCopy();
    var listeners = [];
    var lastPage = 'accueil';
    var sidebar = function () { return document.getElementById('kw-sidebar'); };
    var navLink = function (id) { var s = sidebar(); return s && s.querySelector('[data-nav="' + id + '"]'); };
    var notify = function () { listeners.forEach(function (fn) { try { fn(); } catch (_) {} }); };
    var clientsOpen = function () {
      var layer = document.getElementById('cd-table');
      return !!(layer && layer.offsetParent !== null);
    };

    function selected() {
      if (document.body.classList.contains('kw-menu-open') || document.body.classList.contains('nav-open')) return 'more';
      if (clientsOpen()) return 'clients';
      var s = sidebar();
      var active = s && s.querySelector('[data-nav].active');
      if (active) lastPage = active.getAttribute('data-nav');
      return ({ accueil:'accueil', transactions:'transactions', rapport:'rapport' })[lastPage] || '';
    }
    function tabs() {
      return [
        { id:'accueil', label:copy.home },
        { id:'transactions', label:copy.orders },
        { id:'rapport', label:copy.report },
        { id:'clients', label:copy.clients },
        { id:'more', label:copy.more }
      ];
    }
    function openMenu() {
      var burger = document.querySelector('.kw-hamburger');
      if (burger) burger.click();
      hapticLight();
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
      hapticLight();
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
        if (target) { hapticLight(); target.click(); }
      });
      anchor.parentNode.insertBefore(row, anchor.nextSibling);
    }
    mountQuickActions();
    setTimeout(mountQuickActions, 1200);

    /* An iPhone app follows the system appearance until the owner picks one
       with the moon button. `kiwiNativeThemeAuto` marks a stored theme as
       ours, so a real choice is never overridden. */
    (function followSystemAppearance() {
      var theme = window.KiwiDashTheme, media = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)');
      if (!theme || !media) return;
      var applying = false;
      var auto = function () { try { return localStorage.getItem('kiwiDashTheme') === null || localStorage.getItem('kiwiNativeThemeAuto') === '1'; } catch (_) { return false; } };
      var apply = function () {
        if (!auto()) return;
        var next = media.matches ? 'dark' : 'light';
        try { localStorage.setItem('kiwiNativeThemeAuto', '1'); } catch (_) {}
        if (theme.get() === next && root.getAttribute('data-theme') === next) return;
        applying = true;
        try { theme.set(next); } finally { applying = false; }
      };
      window.addEventListener('kiwi:themechange', function () {
        if (!applying) { try { localStorage.removeItem('kiwiNativeThemeAuto'); } catch (_) {} }
        paintStatusBar();
      });
      if (typeof media.addEventListener === 'function') media.addEventListener('change', apply);
      apply();
    })();

    /* Inner pages get their name as the navigation title; home keeps the mark. */
    var titles = { accueil:'', transactions:copy.orders, rapport:copy.report, clients:copy.clients };
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
  window.addEventListener('kiwi:native-haptic', function (event) { if (!event.detail || event.detail.kind === 'light') hapticLight(); else hapticNotice(event.detail.kind); });
  window.addEventListener('kiwi:toast', function (event) { if (event.detail && event.detail.type === 'danger') hapticNotice('danger'); });
  document.addEventListener('kiwi-paired', commitPairingFromSurface);
  window.addEventListener('kiwi:account-revoked', revokeIdentity);
  document.addEventListener('focusin', revealFocused, true);
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', keyboardInsets);
    window.visualViewport.addEventListener('scroll', keyboardInsets);
    keyboardInsets();
  }
  new MutationObserver(paintStatusBar).observe(root, { attributes: true, attributeFilter: ['data-theme', 'data-vexel-mode', 'lang', 'dir'] });
  // These overlays are always dark, even in a light workspace. Observe only
  // their changes: native tab publication itself mutates unrelated body nodes.
  function syncBlockingLayer() {
    paintStatusBar();
    if (window.KiwiNativeHostRequestState) window.KiwiNativeHostRequestState();
  }
  function isBlockingNode(node) {
    return node && (node.id === 'pin-screen' || node.id === 'cp-pin-screen' || node.id === 'clockin-screen' || (node.hasAttribute && (node.hasAttribute('data-kiwi-greet') || node.hasAttribute('data-kiwi-lock'))) || (node.matches && node.matches('.modal-veil,.drawer-veil,.cloture-veil,.kds-screen,#stock-screen,.kiwi-native-account,.kob-root')) || node === document.body);
  }
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
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { initNativeTillUx(); initNativeHostWorkspace(); polishNativeWorkspaceCopy(); maybePromptBiometricUnlock(); });
  } else {
    initNativeTillUx();
    initNativeHostWorkspace();
    polishNativeWorkspaceCopy();
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
