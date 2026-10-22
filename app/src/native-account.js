/* Kiwi Pro · compte et menus. Changer de rôle, se déconnecter, supprimer
 * le compte, le tiroir de menu et la sortie de chaque écran d'entrée.
 * Partie du runtime natif (native-runtime.js). */
(function () {
  'use strict';
  var N = window.__kiwiNativeRuntime;
  if (!N) return;
  var root = N.root, socket = N.socket, call = N.call,
      nativeSheetAvailable = N.nativeSheetAvailable, nativeSheet = N.nativeSheet;
  // Every full-screen entry gate has its own escape route. The host capsule
  // is intentionally hidden here, so it must never be the only way out.
  function initNativeGateExits() {
    /* #cp-pin-screen / #cp-screen are the registers' own staff and pairing pads
       (assets/caisse-pairing.js), and their class is .pin-screen, not the
       .screen-pin the restaurant till uses: neither matched, so a boutique or
       pressing cashier who locked the till, or whose shift ended, met a keypad
       with no way to change role (ticket #0139). showPinPad() also rewrites the
       pad with innerHTML, which is why this observer re-adds the link rather
       than trusting a one-time insertion. */
    var gates = '#pair,.screen-pin,.screen-clockin,.screen-table,#pin-screen,#clockin-screen,#cp-pin-screen,#cp-screen,[data-kiwi-lock],[data-kiwi-greet]';
    function sync() {
      document.querySelectorAll(gates).forEach(function (gate) {
        var exit = gate.querySelector('.kiwi-native-role-back');
        if (!exit) {
          exit = document.createElement('a');
          exit.className = 'kiwi-native-role-back';
          exit.href = 'index.html?choose=1';
          exit.addEventListener('click', function (event) {
            event.preventDefault();
            nativeWorkspaceAction({action:'change-role'});
          });
          var content = gate.querySelector('.kiwi-lock-inner,.pin-card,.clockin-bottom,.ci-bottom') || gate;
          if (gate.id === 'screen-clockin') gate.insertBefore(exit, gate.firstChild);
          else content.appendChild(exit);
        }
        var label = root.lang === 'ar' ? 'تغيير الدور' : root.lang === 'en' ? 'Change role' : 'Changer de rôle';
        if (exit.textContent !== label) exit.textContent = label;
      });
    }
    sync();
    new MutationObserver(sync).observe(document.body, {childList:true,subtree:true});
    new MutationObserver(sync).observe(root, {attributes:true,attributeFilter:['lang']});
  }

  function nativeAccountDeletion() {
    if (document.querySelector('.kiwi-native-account')) return;
    var lang = String(root.lang || 'fr').slice(0, 2);
    var words = lang === 'en'
      ? { title:'Delete my account', detail:'This requests deletion of your account and all its establishments. Export your data first. Kiwi handles requests within 30 days.', password:'Account password', submit:'Confirm request', close:'Close', checking:'Checking account…', signin:'Sign in with the owner account to request deletion.', demo:'This is the demo, so there is no account to delete. Sign in with your Kiwi owner account to request deletion.', failed:'The request could not be recorded. Check your connection and try again. Nothing was deleted.', received:'Request recorded', wrong:'Incorrect password.' }
      : lang === 'ar'
      ? { title:'حذف حسابي', detail:'يشمل الطلب حسابك وجميع مؤسساته. صدّر بياناتك أولاً. يعالج Kiwi الطلب خلال 30 يوماً.', password:'كلمة مرور الحساب', submit:'تأكيد الطلب', close:'إغلاق', checking:'جارٍ التحقق…', signin:'سجّل الدخول إلى حساب المالك لطلب الحذف.', demo:'هذا هو العرض التجريبي، لا يوجد حساب لحذفه. سجّل الدخول بحساب المالك في Kiwi لطلب الحذف.', failed:'تعذّر تسجيل الطلب. تحقّق من الاتصال وحاول مجدداً. لم يُحذف أي شيء.', received:'تم تسجيل الطلب', wrong:'كلمة المرور غير صحيحة.' }
      : { title:'Supprimer mon compte', detail:'Cette demande concerne votre compte et tous ses établissements. Exportez vos données avant de confirmer. Kiwi traite la demande sous 30 jours.', password:'Mot de passe du compte', submit:'Confirmer la demande', close:'Fermer', checking:'Vérification du compte…', signin:'Connectez-vous au compte propriétaire pour demander la suppression.', demo:'Vous êtes dans la démo : il n’y a aucun compte à supprimer. Connectez-vous avec votre compte propriétaire Kiwi pour en faire la demande.', failed:'La demande n’a pas pu être enregistrée. Vérifiez la connexion et réessayez. Rien n’a été supprimé.', received:'Demande enregistrée', wrong:'Mot de passe incorrect.' };
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
      if (res.status === 401) throw new Error('unauthenticated');
      return res.json().then(function (body) { if (!res.ok) throw new Error(body.error || 'unavailable'); return body; });
    }).then(function (body) {
      card.querySelector('.kiwi-native-account-email').textContent = body.account && body.account.email || '';
      if (body.request) { status.textContent = words.received + ' · ' + body.request.reference; card.querySelector('label').hidden = true; submit.hidden = true; return; }
      status.textContent = ''; submit.disabled = false;
    }).catch(function (error) {
      var env = window.KiwiEnv, demo = !!(env && env.isReal && !env.isReal());
      var needsSignin = demo || error.message === 'unauthenticated';
      status.textContent = demo ? words.demo : needsSignin ? words.signin : words.failed;
      overlay.classList.toggle('is-demo', demo);
      card.querySelector('label').hidden = true; submit.hidden = true;
      if (needsSignin) {
        var signin = document.createElement('button'); signin.type = 'button'; signin.className = 'is-primary';
        signin.textContent = lang === 'ar' ? 'تسجيل الدخول' : lang === 'en' ? 'Sign in' : 'Se connecter';
        signin.onclick = function () { location.href = 'index.html?setup=1'; };
        card.querySelector('.kiwi-native-account-actions').appendChild(signin);
      }
    });
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
    // replace(): Android's back button must not walk back into the workspace just left.
    if (payload.action === 'change-role') { location.replace('index.html?choose=1'); return true; }
    if (payload.action === 'ai-privacy') { if (window.KiwiNativePrivacy) window.KiwiNativePrivacy.show(); return true; }
    if (payload.action === 'delete-account') { nativeAccountDeletion(); return true; }
    if (payload.action === 'open-tools') { if (document.body) document.body.classList.add('nav-open'); if (window.KiwiNativeHostRequestState) window.KiwiNativeHostRequestState(); return true; }
    if (payload.action === 'sign-out') {
      if (window.KiwiNativePrivacy) window.KiwiNativePrivacy.reset();
      fetch('/auth/logout', { credentials:'include', redirect:'manual' }).then(function () {
        localStorage.removeItem('kiwiAppRole');
        call(socket, 'secureRemove', { key:'app-role' }).then(function () { location.replace('index.html?setup=1'); });
      }).catch(function () { window.alert(root.lang === 'ar' ? 'يتطلب تسجيل الخروج اتصالاً بالشبكة.' : root.lang === 'en' ? 'Sign out needs a network connection.' : 'Déconnexion impossible hors ligne.'); });
      return true;
    }
    return false;
  }

  /* One menu in every role. A header ☰ opens a drawer, and the drawer ends
     with the account actions the native More sheet used to hold. The owner
     and the till reuse their own drawers; Team and Kitchen get this one. */
  function nativeMenuCopy() {
    var lang = String(root.lang || 'fr');
    if (lang.indexOf('ar') === 0) return { open:'فتح القائمة', close:'إغلاق القائمة', label:'الحساب', role:'تغيير الدور', out:'تسجيل الخروج', ai:'خصوصية Kiwi AI', del:'حذف حسابي', team:'فريق Kiwi', kitchen:'المطبخ' };
    if (lang.indexOf('en') === 0) return { open:'Open menu', close:'Close menu', label:'Account', role:'Change role', out:'Sign out', ai:'Kiwi AI privacy', del:'Delete my account', team:'Kiwi Team', kitchen:'Kitchen' };
    return { open:'Ouvrir le menu', close:'Fermer le menu', label:'Compte', role:'Changer de rôle', out:'Se déconnecter', ai:'Confidentialité Kiwi AI', del:'Supprimer mon compte', team:'Kiwi Équipe', kitchen:'Cuisine' };
  }
  /* The demo has no account: "Sign out" there only leaves the demo, so it says
     so and does not ask for a password it never had. Delete stays visible: its
     sheet explains there is nothing to delete and how to sign in. */
  function nativeDemoSession() {
    var env = window.KiwiEnv;
    try { return !!(env && typeof env.isReal === 'function' && !env.isReal()); } catch (_) { return false; }
  }
  function leaveDemoLabel() {
    var lang = String(root.lang || 'fr');
    return lang.indexOf('ar') === 0 ? 'الخروج من العرض التجريبي' : lang.indexOf('en') === 0 ? 'Leave the demo' : 'Quitter la démo';
  }
  function signOutCopy() {
    var lang = String(root.lang || 'fr');
    if (lang.indexOf('ar') === 0) return { title:'تسجيل الخروج من Kiwi Pro؟', message:'ستحتاج إلى بريدك الإلكتروني وكلمة المرور للعودة.', confirm:'تسجيل الخروج', cancel:'إلغاء' };
    if (lang.indexOf('en') === 0) return { title:'Sign out of Kiwi Pro?', message:'You will need your email and password to sign back in.', confirm:'Sign out', cancel:'Cancel' };
    return { title:'Se déconnecter de Kiwi Pro ?', message:'Il faudra votre e-mail et votre mot de passe pour revenir.', confirm:'Se déconnecter', cancel:'Annuler' };
  }
  function closeNativeMenus() {
    var burger = document.querySelector('.kw-hamburger');
    if (document.body.classList.contains('kw-menu-open') && burger) burger.click();
    document.body.classList.remove('nav-open', 'kiwi-native-menu-open');
  }
  /* Account-level actions (delete the account, Kiwi AI privacy, leave the demo)
     belong to the owner's dashboard only. The till and the team app run on a
     shared counter device that a cashier or a waiter picks up: they get the paths
     a cashier needs (change role, sign out) and nothing that can erase or
     reconfigure the owner's account. App Store 5.1.1(v) is met by the owner's
     drawer, which keeps the full group. */
  function mountNativeAccountGroup(container, before, scope) {
    if (!container) return;
    var words = nativeMenuCopy();
    var demo = nativeDemoSession();
    var owner = scope === 'owner';
    var key = (root.lang || '') + (demo ? ':demo' : '') + (owner ? ':owner' : ':device');
    var box = container.querySelector('.kno-account');
    if (box && box.getAttribute('data-lang') === key) return;
    if (box) box.remove();
    box = document.createElement('div');
    box.className = 'kno-account';
    box.setAttribute('role', 'group');
    box.setAttribute('aria-label', words.label);
    box.setAttribute('data-lang', key);
    var items = [['change-role', words.role, 'swap_horiz.svg', '']];
    /* In the demo "Sign out" only leaves the demo: an owner decision, so a
       shared device keeps Change role as its way out and nothing else. */
    if (owner || !demo) items.push(['sign-out', demo ? leaveDemoLabel() : words.out, 'logout.svg', '']);
    if (owner) items.push(['ai-privacy', words.ai, 'shield.svg', ''], ['delete-account', words.del, 'delete.svg', 'is-danger']);
    box.innerHTML = items.map(function (item) {
      return '<button type="button" data-kno-account="' + item[0] + '" class="' + item[3] + '"><i style="--kno-icon:url(assets/icons/material/' + item[2] + ')" aria-hidden="true"></i><span>' + item[1] + '</span></button>';
    }).join('');
    box.addEventListener('click', function (event) {
      var button = event.target.closest('[data-kno-account]');
      if (!button) return;
      closeNativeMenus();
      var action = button.getAttribute('data-kno-account');
      /* One stray tap used to sign the device out mid-service. With the native
         sheet, signing out asks first, the way iOS does. */
      if (action === 'sign-out' && !nativeDemoSession()) {
        var ask = signOutCopy();
        if (nativeSheetAvailable()) {
          nativeSheet({ title:ask.title, message:ask.message, actions:[{ id:'sign-out', label:ask.confirm, style:'destructive' }, { id:'cancel', label:ask.cancel }] })
            .then(function (choice) { if (choice === 'sign-out') nativeWorkspaceAction({ action:'sign-out' }); });
          return;
        }
        // Android has no native sheet: the system dialog still asks first.
        if (!window.confirm(ask.title + '\n\n' + ask.message)) return;
      }
      nativeWorkspaceAction({ action:action });
    });
    if (before && before.parentNode === container) container.insertBefore(box, before);
    else container.appendChild(box);
  }
  function nativeMenuButton(open) {
    var button = document.createElement('button');
    button.type = 'button';
    button.className = 'kiwi-native-burger';
    button.innerHTML = '<i aria-hidden="true"></i>';
    var label = function () { button.setAttribute('aria-label', nativeMenuCopy().open); };
    label();
    new MutationObserver(label).observe(root, { attributes:true, attributeFilter:['lang'] });
    button.addEventListener('click', function (event) { event.stopPropagation(); open(); });
    return button;
  }
  function nativeSideMenu(kind) {
    var menu = document.querySelector('.kiwi-native-menu');
    if (!menu) {
      var scrim = document.createElement('div');
      scrim.className = 'kiwi-native-menu-scrim';
      scrim.addEventListener('click', closeNativeMenus);
      menu = document.createElement('aside');
      menu.className = 'kiwi-native-menu';
      menu.id = 'kiwi-native-menu';
      menu.innerHTML = '<div class="kiwi-native-menu-head"><img src="assets/kiwi-newlogo-inverse.svg" alt="Kiwi"><span class="kiwi-native-menu-role"></span><button type="button" class="kiwi-native-menu-close"><i aria-hidden="true"></i></button></div>';
      menu.querySelector('.kiwi-native-menu-close').addEventListener('click', closeNativeMenus);
      document.body.appendChild(scrim);
      document.body.appendChild(menu);
    }
    var paint = function () {
      var words = nativeMenuCopy();
      menu.setAttribute('aria-label', words[kind] || 'Kiwi');
      menu.querySelector('.kiwi-native-menu-role').textContent = words[kind] || '';
      menu.querySelector('.kiwi-native-menu-close').setAttribute('aria-label', words.close);
      mountNativeAccountGroup(menu);
    };
    paint();
    new MutationObserver(paint).observe(root, { attributes:true, attributeFilter:['lang'] });
    return function () { paint(); document.body.classList.add('kiwi-native-menu-open'); if (window.KiwiNativeHostRequestState) window.KiwiNativeHostRequestState(); };
  }
  /* Partagé avec les morceaux suivants du runtime natif. */
  N.initNativeGateExits = initNativeGateExits; N.nativeWorkspaceAction = nativeWorkspaceAction;
  N.closeNativeMenus = closeNativeMenus; N.mountNativeAccountGroup = mountNativeAccountGroup;
  N.nativeMenuButton = nativeMenuButton; N.nativeSideMenu = nativeSideMenu;
})();
