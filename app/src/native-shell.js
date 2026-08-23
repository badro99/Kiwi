/* Kiwi Pro — écran d'accueil natif (semaine 1 du plan, §4).
 *
 * Trois responsabilités, pas une de plus :
 *  1. orienter l'appareil vers SA surface (Caisse / KiwiÉquipe / Cuisine /
 *     Tableau de bord) dans la même WebView, et s'en souvenir
 *     (localStorage.kiwiAppRole) — au prochain lancement on y va directement ;
 *     `index.html?choose=1` ramène l'écran de choix ;
 *  2. porter la connexion marchande que le gate HTML de kiwi-os.com assure sur
 *     le web : POST /auth/login {email, password} → cookie de session posé dans
 *     le pot natif (CapacitorHttp) ; GET /api/me pour afficher l'état ;
 *  3. rien d'autre — les plugins natifs (impression, push, biométrie) arrivent
 *     en semaines 2–3 derrière window.KiwiHardware, pas ici.
 *
 * Toutes les URL sont relatives (/api/…, /auth/…) : assets/api-base.js, injecté
 * en tête par tools/build-app-www.mjs, les préfixe. Jamais de code, de PIN ni
 * de mot de passe en dur ici — ce fichier est dans le dépôt public. */
(function () {
  'use strict';

  var ROLES = {
    caisse: 'kiwi-caisse.html',
    equipe: 'kiwi-serveur.html',
    cuisine: 'kiwi-cuisine.html',
    dashboard: 'dashboard.html'
  };
  var KEY = 'kiwiAppRole';
  var lang = String((navigator.languages && navigator.languages[0]) || navigator.language || 'fr').toLowerCase().split('-')[0];
  if (lang !== 'ar' && lang !== 'en') lang = 'fr';
  var COPY = {
    fr: { shellSub:"Choisissez le rôle de cet appareil. Il s'en souviendra.",logout:'Se déconnecter',merchantAccount:'Compte marchand',email:'E-mail',password:'Mot de passe',login:'Se connecter',loginHint:'Caisse appairée ou compte équipe ? Pas besoin de compte marchand : choisissez directement le rôle ci-dessous.',serverOffline:'Serveur injoignable. La caisse démarre quand même hors ligne.',roles:"Rôle de l'appareil",caisse:'Caisse',caisseSub:'Encaissement, tickets, imprimante',team:'KiwiÉquipe',teamSub:'Salle, planning, pointage',kitchen:'Cuisine',kitchenSub:'Écran de production (KDS)',dashboard:'Tableau de bord',dashboardSub:'Propriétaire, lecture et actions rapides',connected:'Connecté',merchant:'Compte marchand',badCreds:'E-mail ou mot de passe incorrect.',badJson:'Requête invalide.',notConfigured:'Service momentanément indisponible.',tooMany:'Trop de tentatives. Réessayez dans quelques minutes.',network:"Réseau injoignable. Vérifiez le Wi-Fi de l'appareil.",unknown:'Une erreur est survenue. Réessayez.'},
    en: { shellSub:'Choose the role of this device. Kiwi will remember it.',logout:'Sign out',merchantAccount:'Merchant account',email:'Email',password:'Password',login:'Sign in',loginHint:'Paired till or team account? No merchant account is needed. Choose the role below.',serverOffline:'Server unavailable. The till can still start offline.',roles:'Device role',caisse:'Till',caisseSub:'Payments, receipts, printer',team:'Kiwi Team',teamSub:'Floor, schedule, attendance',kitchen:'Kitchen',kitchenSub:'Production screen (KDS)',dashboard:'Dashboard',dashboardSub:'Owner view and quick actions',connected:'Connected',merchant:'Merchant account',badCreds:'Incorrect email or password.',badJson:'Invalid request.',notConfigured:'Service temporarily unavailable.',tooMany:'Too many attempts. Try again in a few minutes.',network:"Network unavailable. Check the device's Wi-Fi.",unknown:'Something went wrong. Try again.'},
    ar: { shellSub:'اختر دور هذا الجهاز. سيحفظ التطبيق اختيارك.',logout:'تسجيل الخروج',merchantAccount:'حساب التاجر',email:'البريد الإلكتروني',password:'كلمة المرور',login:'تسجيل الدخول',loginHint:'صندوق مقترن أو حساب فريق؟ لا تحتاج إلى حساب تاجر. اختر الدور أدناه.',serverOffline:'الخادم غير متاح. يمكن للصندوق العمل دون اتصال.',roles:'دور الجهاز',caisse:'الصندوق',caisseSub:'الدفع والإيصالات والطابعة',team:'فريق Kiwi',teamSub:'الصالة والتخطيط والحضور',kitchen:'المطبخ',kitchenSub:'شاشة الإنتاج',dashboard:'لوحة التحكم',dashboardSub:'عرض المالك والإجراءات السريعة',connected:'متصل',merchant:'حساب التاجر',badCreds:'البريد الإلكتروني أو كلمة المرور غير صحيحة.',badJson:'الطلب غير صالح.',notConfigured:'الخدمة غير متاحة مؤقتا.',tooMany:'محاولات كثيرة. أعد المحاولة بعد بضع دقائق.',network:'الشبكة غير متاحة. تحقق من اتصال الجهاز بالواي فاي.',unknown:'حدث خطأ. أعد المحاولة.'}
  };
  function tr(key) { return (COPY[lang] && COPY[lang][key]) || COPY.fr[key] || key; }
  document.documentElement.lang = lang;
  document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
  var params = new URLSearchParams(location.search);
  var wantChoice = params.has('choose') || params.has('home');

  function remembered() {
    try { var r = localStorage.getItem(KEY); return ROLES[r] ? r : ''; } catch (_) { return ''; }
  }
  function securePlugin() {
    try { return window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.KiwiPrinterSocket; } catch (_) { return null; }
  }
  function rememberedSecure() {
    var local = remembered(), plugin = securePlugin();
    if (!plugin || typeof plugin.secureGet !== 'function') return Promise.resolve(local);
    return Promise.resolve(plugin.secureGet({ key: 'app-role' })).then(function (result) {
      var role = result && ROLES[result.value] ? result.value : '';
      if (role) {
        try { localStorage.setItem(KEY, role); } catch (_) {}
        return role;
      }
      if (local && typeof plugin.secureSet === 'function') plugin.secureSet({ key: 'app-role', value: local }).catch(function () {});
      return local;
    }).catch(function () { return local; });
  }
  function remember(role) {
    try { if (ROLES[role]) localStorage.setItem(KEY, role); } catch (_) {}
    var plugin = securePlugin();
    if (ROLES[role] && plugin && typeof plugin.secureSet === 'function') plugin.secureSet({ key: 'app-role', value: role }).catch(function () {});
  }
  function go(role) {
    remember(role);
    location.href = ROLES[role];
  }

  // Lancement : la Keychain gagne sur le stockage Web, qui peut être purgé par iOS.
  var last = remembered();

  var $ = function (sel) { return document.querySelector(sel); };
  var shell = $('#shell');
  var acctState = $('#acct-state'), acctText = $('#acct-text'), acctUnknown = $('#acct-unknown');
  var login = $('#login'), loginErr = $('#login-err'), loginBtn = $('#login-btn');
  Array.prototype.forEach.call(document.querySelectorAll('[data-native-i18n]'), function (node) { node.textContent = tr(node.getAttribute('data-native-i18n')); });
  Array.prototype.forEach.call(document.querySelectorAll('[data-native-i18n-aria]'), function (node) { node.setAttribute('aria-label', tr(node.getAttribute('data-native-i18n-aria'))); });

  function showLogin(err) {
    login.hidden = false; acctState.hidden = true; acctUnknown.hidden = true;
    if (err) { loginErr.textContent = err; loginErr.hidden = false; } else { loginErr.hidden = true; }
  }
  function showAccount(me) {
    var label = (me && (me.business || me.name || me.email)) || tr('merchant');
    acctText.textContent = tr('connected') + ' · ' + label;
    acctState.hidden = false; login.hidden = true; acctUnknown.hidden = true;
  }
  function showUnknown() {
    acctUnknown.hidden = false; login.hidden = true; acctState.hidden = true;
  }

  // État du compte. 401 = pas de session (la porte répond sa page HTML) ;
  // réseau coupé = on ne sait pas, et la caisse doit pouvoir démarrer quand même.
  function refreshAccount() {
    return fetch('/api/me', { headers: { Accept: 'application/json' }, cache: 'no-store' })
      .then(function (r) {
        if (r.ok) return r.json().then(function (me) { me && me.authenticated !== false ? showAccount(me) : showLogin(); });
        showLogin();
      })
      .catch(function () { showUnknown(); });
  }

  var ERRORS = {
    'bad-creds': tr('badCreds'),
    'bad-json': tr('badJson'),
    'not-configured': tr('notConfigured'),
    'too-many': tr('tooMany'),
    network: tr('network')
  };

  login.addEventListener('submit', function (e) {
    e.preventDefault();
    var email = login.email.value.trim(), password = login.password.value;
    if (!email || !password) return;
    loginBtn.disabled = true; loginErr.hidden = true;
    fetch('/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ email: email, password: password })
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (b) {
        if (r.ok && b && b.ok) { login.password.value = ''; return refreshAccount(); }
        var code = (b && b.error) || (r.status === 429 ? 'too-many' : '');
        showLogin(ERRORS[code] || tr('unknown'));
      });
    }).catch(function () { showLogin(ERRORS.network); })
      .then(function () { loginBtn.disabled = false; });
  });

  $('#logout').addEventListener('click', function () {
    var done = function () { showLogin(); };
    fetch('/auth/logout', { credentials: 'include', redirect: 'manual' }).then(done, done);
  });

  // Tuiles de rôle.
  var tiles = document.querySelectorAll('.tile[data-role]');
  Array.prototype.forEach.call(tiles, function (t) {
    if (t.getAttribute('data-role') === last) t.classList.add('remembered');
    t.addEventListener('click', function () { go(t.getAttribute('data-role')); });
  });

  // Pied : plateforme + empreinte du bundle (écrite par le build).
  try {
    var cap = window.Capacitor;
    var platform = cap && typeof cap.getPlatform === 'function' ? cap.getPlatform() : 'web';
    $('#platform').textContent = 'Kiwi Pro · ' + ({ ios: 'iOS', android: 'Android', web: 'navigateur' }[platform] || platform);
    var meta = document.querySelector('meta[name="kiwi-bundle"]');
    $('#bundle').textContent = meta && meta.content ? 'bundle ' + meta.content.slice(0, 12) : 'bundle local';
  } catch (_) {}

  rememberedSecure().then(function (role) {
    last = role;
    if (last && !wantChoice) { location.replace(ROLES[last]); return; }
    Array.prototype.forEach.call(tiles, function (t) {
      t.classList.toggle('remembered', t.getAttribute('data-role') === last);
    });
    shell.hidden = false;
    refreshAccount();
  });
})();
