/* Kiwi Pro — native launcher and first-device setup.
 * Existing devices with a remembered role still open it immediately. A fresh
 * install gets one contextual flow: account → role → establishment → printer → ready.
 * The signed-in account creates and consumes its own short-lived pairing proof,
 * committed only through assets/pairing-commit.js. Printer tests use the native
 * TCP plugin and never create a sale or payment. */
(function () {
  'use strict';

  var ROLES = { caisse: 'kiwi-caisse.html', equipe: 'kiwi-serveur.html', cuisine: 'kiwi-cuisine.html', dashboard: 'dashboard.html' };
  var ROLE_KEY = 'kiwiAppRole';
  var TERMINAL_KEY = 'kiwi:caisse:terminal-id:v1';
  var PRINTER_KEY = 'kiwiPrinterCfg';
  var lang = String((navigator.languages && navigator.languages[0]) || navigator.language || 'fr').toLowerCase().split('-')[0];
  if (lang !== 'ar' && lang !== 'en') lang = 'fr';
  var COPY = {
    fr: {
      brandKicker:'Le système d’exploitation du commerçant marocain.',localSetup:'Configuration sécurisée sur cet appareil',deviceSetup:'Configuration de l’appareil',guided:'Guidée',welcomeSub:'Configurons cet appareil. Cela prend environ deux minutes.',launcherSub:'Choisissez le rôle de cet appareil. Kiwi s’en souviendra.',stageAccount:'Votre espace et vos droits restent liés au bon établissement.',stageRole:'Un appareil, un rôle clair — Kiwi ouvrira directement le bon espace.',stageConnect:'La liaison sécurisée empêche tout mélange entre établissements.',stagePrinter:'Vérifiez le matériel maintenant pour être prêt au premier encaissement.',stageReady:'La configuration est enregistrée sur cet appareil.',progress:'Progression de la configuration',accountStep:'Compte',roleStep:'Rôle',connectStep:'Connexion',printerStep:'Imprimante',readyStep:'Prêt',
      stepOne:'Étape 1',stepTwo:'Étape 2',stepThree:'Étape 3',stepFour:'Étape 4',stepFive:'Étape 5',accountTitle:'Connectez le compte marchand',accountIntro:'Le tableau de bord, la caisse et la cuisine utilisent le compte marchand. KiwiÉquipe peut continuer avec le code de l’employé.',merchantAccount:'Compte marchand',email:'E-mail',password:'Mot de passe',login:'Se connecter',logout:'Se déconnecter',serverOffline:'Serveur injoignable. Vous pourrez réessayer dans votre espace.',continue:'Continuer',manual:'Choisir un rôle sans assistant',back:'Retour',
      roleTitle:'À quoi servira cet appareil ?',roleIntro:'Kiwi ouvrira ce rôle automatiquement aux prochains lancements.',roles:'Rôle de l’appareil',caisse:'Caisse',caisseSub:'Encaissement, tickets, imprimante',team:'KiwiÉquipe',teamSub:'Salle, planning, pointage',kitchen:'Cuisine',kitchenSub:'Écran de production (KDS)',dashboard:'Tableau de bord',dashboardSub:'Propriétaire, lecture et actions rapides',chooseRole:'Choisissez un rôle pour continuer.',dashboardNeedsAccount:'Ce rôle exige un compte marchand connecté. Revenez à l’étape 1.',
      connectTitle:'Reliez l’appareil à l’établissement',pairIntro:'Choisissez l’établissement auquel cet appareil doit envoyer ses ventes et ses commandes.',stores:'Établissements du compte',chooseStore:'Choisissez un établissement.',store:'Établissement',pair:'Relier cet appareil',pairing:'Connexion…',paired:'Appareil relié',alreadyPaired:'Déjà relié',pairRate:'Trop de tentatives. Réessayez dans quelques minutes.',pairNetwork:'Impossible de joindre Kiwi. Vérifiez le Wi-Fi.',pairUnavailable:'La liaison est momentanément indisponible.',dashboardConnect:'Le tableau de bord utilise le compte marchand connecté à l’étape 1.',accountConnected:'Compte marchand connecté',teamConnect:'Chaque membre se connectera avec son code équipe sur l’écran suivant. Aucun appairage marchand n’est nécessaire ici.',teamReady:'Connexion par code équipe',
      printerTitle:'Testez l’imprimante thermique',printerIntro:'L’iPad et l’imprimante doivent être sur le même Wi-Fi. Le port standard est 9100.',printerIp:'Adresse IP',printerPort:'Port',paper:'Papier',scan:'Rechercher sur le réseau',scanning:'Recherche…',testPrinter:'Tester et enregistrer',testing:'Test en cours…',printerLater:'Configurer plus tard',printerRequired:'Saisissez une adresse et un port valides.',printerNativeOnly:'La recherche réseau est disponible dans l’app Kiwi Pro.',printerNone:'Aucune imprimante trouvée. Vérifiez le Wi-Fi et l’alimentation.',printerMany:'Imprimantes trouvées — choisissez-en une :',printerFound:'Imprimante trouvée',printerOk:'Ticket test envoyé et imprimante enregistrée.',printerFail:'Imprimante injoignable. Vérifiez son IP, son port et le Wi-Fi local.',printerDenied:'Autorisez l’accès au réseau local dans Réglages > Kiwi Pro.',printerSkipped:'À configurer dans Kiwi',
      readyTitle:'Cet appareil est prêt',readyIntro:'Cette vérification n’a créé aucune vente, aucun paiement et aucun ticket client.',checkRole:'Rôle choisi',checkConnect:'Établissement',checkPrinter:'Imprimante',openKiwi:'Ouvrir Kiwi',notRequired:'Non requise',connected:'Connecté',merchant:'Compte marchand',badCreds:'E-mail ou mot de passe incorrect.',badJson:'Requête invalide.',notConfigured:'Service momentanément indisponible.',tooMany:'Trop de tentatives. Réessayez dans quelques minutes.',network:'Réseau injoignable. Vérifiez le Wi-Fi de l’appareil.',unknown:'Une erreur est survenue. Réessayez.'
    },
    en: {
      brandKicker:'The operating system for Moroccan merchants.',localSetup:'Secure setup on this device',deviceSetup:'Device setup',guided:'Guided',welcomeSub:'Let’s set up this device. It takes about two minutes.',launcherSub:'Choose this device’s role. Kiwi will remember it.',stageAccount:'Your workspace and permissions stay tied to the right establishment.',stageRole:'One device, one clear role — Kiwi opens the right workspace directly.',stageConnect:'Secure device binding keeps establishments from ever mixing.',stagePrinter:'Check the hardware now so the first checkout is ready.',stageReady:'This setup is saved on this device.',progress:'Setup progress',accountStep:'Account',roleStep:'Role',connectStep:'Connect',printerStep:'Printer',readyStep:'Ready',
      stepOne:'Step 1',stepTwo:'Step 2',stepThree:'Step 3',stepFour:'Step 4',stepFive:'Step 5',accountTitle:'Sign in to the merchant account',accountIntro:'The dashboard, till, and kitchen use the merchant account. Kiwi Team can continue with the employee code.',merchantAccount:'Merchant account',email:'Email',password:'Password',login:'Sign in',logout:'Sign out',serverOffline:'Server unavailable. You can retry inside your workspace.',continue:'Continue',manual:'Choose a role without setup',back:'Back',
      roleTitle:'What will this device be used for?',roleIntro:'Kiwi will open this role automatically on future launches.',roles:'Device role',caisse:'Till',caisseSub:'Payments, receipts, printer',team:'Kiwi Team',teamSub:'Floor, schedule, attendance',kitchen:'Kitchen',kitchenSub:'Production screen (KDS)',dashboard:'Dashboard',dashboardSub:'Owner view and quick actions',chooseRole:'Choose a role to continue.',dashboardNeedsAccount:'This role requires a signed-in merchant account. Return to step 1.',
      connectTitle:'Connect the device to the establishment',pairIntro:'Choose the establishment that should receive this device’s sales and orders.',stores:'Account establishments',chooseStore:'Choose an establishment.',store:'Establishment',pair:'Connect this device',pairing:'Connecting…',paired:'Device connected',alreadyPaired:'Already connected',pairRate:'Too many attempts. Try again in a few minutes.',pairNetwork:'Could not reach Kiwi. Check Wi-Fi.',pairUnavailable:'Device connection is temporarily unavailable.',dashboardConnect:'The dashboard uses the merchant account signed in at step 1.',accountConnected:'Merchant account connected',teamConnect:'Each team member signs in with their team code on the next screen. No merchant pairing is needed here.',teamReady:'Team code sign-in',
      printerTitle:'Test the thermal printer',printerIntro:'The iPad and printer must be on the same Wi-Fi. The standard port is 9100.',printerIp:'IP address',printerPort:'Port',paper:'Paper',scan:'Search the network',scanning:'Searching…',testPrinter:'Test and save',testing:'Testing…',printerLater:'Set up later',printerRequired:'Enter a valid address and port.',printerNativeOnly:'Network discovery is available in the Kiwi Pro app.',printerNone:'No printer found. Check Wi-Fi and printer power.',printerMany:'Printers found — choose one:',printerFound:'Printer found',printerOk:'Test slip sent and printer saved.',printerFail:'Printer unreachable. Check its IP, port, and local Wi-Fi.',printerDenied:'Allow Local Network access in Settings > Kiwi Pro.',printerSkipped:'Set up inside Kiwi',
      readyTitle:'This device is ready',readyIntro:'This check created no sale, payment, or customer receipt.',checkRole:'Selected role',checkConnect:'Establishment',checkPrinter:'Printer',openKiwi:'Open Kiwi',notRequired:'Not required',connected:'Connected',merchant:'Merchant account',badCreds:'Incorrect email or password.',badJson:'Invalid request.',notConfigured:'Service temporarily unavailable.',tooMany:'Too many attempts. Try again in a few minutes.',network:'Network unavailable. Check this device’s Wi-Fi.',unknown:'Something went wrong. Try again.'
    },
    ar: {
      brandKicker:'نظام التشغيل للتجار المغاربة.',localSetup:'إعداد آمن على هذا الجهاز',deviceSetup:'إعداد الجهاز',guided:'إعداد موجّه',welcomeSub:'لنقم بإعداد هذا الجهاز. يستغرق الأمر حوالي دقيقتين.',launcherSub:'اختر دور هذا الجهاز. سيتذكر Kiwi اختيارك.',stageAccount:'تبقى مساحتك وصلاحياتك مرتبطة بالمؤسسة الصحيحة.',stageRole:'جهاز واحد ودور واضح — يفتح Kiwi المساحة المناسبة مباشرة.',stageConnect:'الربط الآمن يمنع اختلاط بيانات المؤسسات.',stagePrinter:'تحقق من المعدات الآن ليكون أول بيع جاهزا.',stageReady:'تم حفظ هذا الإعداد على الجهاز.',progress:'تقدم الإعداد',accountStep:'الحساب',roleStep:'الدور',connectStep:'الربط',printerStep:'الطابعة',readyStep:'جاهز',
      stepOne:'الخطوة 1',stepTwo:'الخطوة 2',stepThree:'الخطوة 3',stepFour:'الخطوة 4',stepFive:'الخطوة 5',accountTitle:'سجّل الدخول إلى حساب التاجر',accountIntro:'تستخدم لوحة التحكم والصندوق والمطبخ حساب التاجر. يمكن لفريق Kiwi المتابعة برمز الموظف.',merchantAccount:'حساب التاجر',email:'البريد الإلكتروني',password:'كلمة المرور',login:'تسجيل الدخول',logout:'تسجيل الخروج',serverOffline:'الخادم غير متاح. يمكنك المحاولة من داخل مساحتك.',continue:'متابعة',manual:'اختيار الدور بدون المساعد',back:'رجوع',
      roleTitle:'ما استخدام هذا الجهاز؟',roleIntro:'سيفتح Kiwi هذا الدور تلقائيا في المرات القادمة.',roles:'دور الجهاز',caisse:'الصندوق',caisseSub:'الدفع والإيصالات والطابعة',team:'فريق Kiwi',teamSub:'الصالة والتخطيط والحضور',kitchen:'المطبخ',kitchenSub:'شاشة الإنتاج',dashboard:'لوحة التحكم',dashboardSub:'عرض المالك والإجراءات السريعة',chooseRole:'اختر دورا للمتابعة.',dashboardNeedsAccount:'يتطلب هذا الدور حساب تاجر متصلا. ارجع إلى الخطوة 1.',
      connectTitle:'اربط الجهاز بالمؤسسة',pairIntro:'اختر المؤسسة التي ستستقبل مبيعات وطلبات هذا الجهاز.',stores:'مؤسسات الحساب',chooseStore:'اختر مؤسسة.',store:'المؤسسة',pair:'ربط هذا الجهاز',pairing:'جارٍ الربط…',paired:'تم ربط الجهاز',alreadyPaired:'مرتبط مسبقا',pairRate:'محاولات كثيرة. أعد المحاولة بعد بضع دقائق.',pairNetwork:'تعذر الاتصال بـ Kiwi. تحقق من الواي فاي.',pairUnavailable:'ربط الجهاز غير متاح مؤقتا.',dashboardConnect:'تستخدم لوحة التحكم حساب التاجر المتصل في الخطوة 1.',accountConnected:'حساب التاجر متصل',teamConnect:'يسجل كل عضو دخوله برمز الفريق في الشاشة التالية. لا يلزم إقران حساب التاجر هنا.',teamReady:'الدخول برمز الفريق',
      printerTitle:'اختبر الطابعة الحرارية',printerIntro:'يجب أن يكون الآيباد والطابعة على نفس شبكة الواي فاي. المنفذ المعتاد 9100.',printerIp:'عنوان IP',printerPort:'المنفذ',paper:'الورق',scan:'البحث في الشبكة',scanning:'جارٍ البحث…',testPrinter:'اختبار وحفظ',testing:'جارٍ الاختبار…',printerLater:'الإعداد لاحقا',printerRequired:'أدخل عنوانا ومنفذا صالحين.',printerNativeOnly:'البحث في الشبكة متاح داخل تطبيق Kiwi Pro.',printerNone:'لم يتم العثور على طابعة. تحقق من الشبكة والطاقة.',printerMany:'تم العثور على طابعات — اختر واحدة:',printerFound:'تم العثور على الطابعة',printerOk:'أُرسل إيصال الاختبار وحُفظت الطابعة.',printerFail:'تعذر الوصول إلى الطابعة. تحقق من العنوان والمنفذ والشبكة.',printerDenied:'اسمح بالوصول إلى الشبكة المحلية من الإعدادات > Kiwi Pro.',printerSkipped:'تُضبط من داخل Kiwi',
      readyTitle:'هذا الجهاز جاهز',readyIntro:'لم ينشئ هذا الفحص أي بيع أو دفع أو إيصال عميل.',checkRole:'الدور المختار',checkConnect:'المؤسسة',checkPrinter:'الطابعة',openKiwi:'فتح Kiwi',notRequired:'غير مطلوبة',connected:'متصل',merchant:'حساب التاجر',badCreds:'البريد الإلكتروني أو كلمة المرور غير صحيحة.',badJson:'الطلب غير صالح.',notConfigured:'الخدمة غير متاحة مؤقتا.',tooMany:'محاولات كثيرة. أعد المحاولة لاحقا.',network:'الشبكة غير متاحة. تحقق من الواي فاي.',unknown:'حدث خطأ. أعد المحاولة.'
    }
  };
  function tr(key) { return (COPY[lang] && COPY[lang][key]) || COPY.fr[key] || key; }
  function $(sel) { return document.querySelector(sel); }
  function all(sel) { return Array.prototype.slice.call(document.querySelectorAll(sel)); }
  function ls(key) { try { return localStorage.getItem(key); } catch (_) { return null; } }
  function setLs(key, value) { try { localStorage.setItem(key, value); } catch (_) {} }
  function plugin() { try { return window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.KiwiPrinterSocket; } catch (_) { return null; } }
  function remembered() { var role = ls(ROLE_KEY); return ROLES[role] ? role : ''; }
  function pairedVenue() { try { return JSON.parse(ls('kiwiPairedVenue') || 'null'); } catch (_) { return null; } }

  document.documentElement.lang = lang;
  document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
  all('[data-native-i18n]').forEach(function (node) { node.textContent = tr(node.getAttribute('data-native-i18n')); });
  all('[data-native-i18n-aria]').forEach(function (node) { node.setAttribute('aria-label', tr(node.getAttribute('data-native-i18n-aria'))); });

  var params = new URLSearchParams(location.search);
  var manual = params.has('choose') || params.has('home');
  var forceSetup = params.has('setup');
  var state = { step: 'account', role: '', account: 'pending', accountLabel: '', stores: [], selectedStore: null, paired: false, venue: null, printer: false, printerSkipped: false };
  var shell = $('#shell'), login = $('#login'), loginErr = $('#login-err'), loginBtn = $('#login-btn');
  var acctState = $('#acct-state'), acctText = $('#acct-text'), acctUnknown = $('#acct-unknown');

  function rememberSecure(role) {
    if (!ROLES[role]) return;
    setLs(ROLE_KEY, role);
    var p = plugin();
    if (p && typeof p.secureSet === 'function') p.secureSet({ key: 'app-role', value: role }).catch(function () {});
  }
  function rememberedSecure() {
    var local = remembered(), p = plugin();
    if (!p || typeof p.secureGet !== 'function') return Promise.resolve(local);
    return Promise.resolve(p.secureGet({ key: 'app-role' })).then(function (result) {
      var role = result && ROLES[result.value] ? result.value : '';
      if (role) { setLs(ROLE_KEY, role); return role; }
      if (local && typeof p.secureSet === 'function') p.secureSet({ key: 'app-role', value: local }).catch(function () {});
      return local;
    }).catch(function () { return local; });
  }
  function go(role) { rememberSecure(role); location.href = ROLES[role]; }

  function showLogin(err) {
    state.account = 'signedout'; state.accountLabel = ''; state.stores = []; state.selectedStore = null;
    login.hidden = false; acctState.hidden = true; acctUnknown.hidden = true;
    loginErr.hidden = !err; loginErr.textContent = err || '';
  }
  function showAccount(me) {
    state.account = 'connected';
    state.accountLabel = (me && (me.business || me.name || me.email)) || tr('merchant');
    state.stores = Array.isArray(me && me.stores) ? me.stores.map(function (item) {
      return { merchant:String((item && item.merchant) || ''), name:String((item && item.name) || (item && item.merchant) || state.accountLabel), type:String((item && item.type) || '') };
    }).filter(function (item) { return !!(item.merchant || item.name); }) : [];
    if (!state.stores.length) state.stores.push({ merchant:'', name:state.accountLabel, type:String((me && me.type) || '') });
    state.selectedStore = state.stores.length === 1 ? state.stores[0] : null;
    acctText.textContent = tr('connected') + ' · ' + state.accountLabel;
    acctState.hidden = false; login.hidden = true; acctUnknown.hidden = true;
  }
  function showUnknown() {
    state.account = 'offline'; state.accountLabel = ''; state.stores = []; state.selectedStore = null;
    acctUnknown.hidden = false; login.hidden = true; acctState.hidden = true;
  }
  function refreshAccount() {
    return fetch('/api/me', { headers: { Accept: 'application/json' }, cache: 'no-store' }).then(function (r) {
      if (!r.ok) { showLogin(); return null; }
      return r.json().then(function (me) { if (me && me.authenticated !== false) showAccount(me); else showLogin(); return me; });
    }).catch(function () { showUnknown(); return null; });
  }

  var ERRORS = { 'bad-creds':tr('badCreds'),'bad-json':tr('badJson'),'not-configured':tr('notConfigured'),'too-many':tr('tooMany'),network:tr('network') };
  login.addEventListener('submit', function (e) {
    e.preventDefault();
    var email = login.email.value.trim(), password = login.password.value;
    if (!email || !password) return;
    loginBtn.disabled = true; loginErr.hidden = true;
    fetch('/auth/login', { method:'POST', headers:{'Content-Type':'application/json',Accept:'application/json'}, body:JSON.stringify({email:email,password:password}) })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (body) {
        if (r.ok && body && body.ok) { login.password.value = ''; return refreshAccount(); }
        showLogin(ERRORS[(body && body.error) || (r.status === 429 ? 'too-many' : '')] || tr('unknown'));
      }); })
      .catch(function () { showLogin(ERRORS.network); })
      .then(function () { loginBtn.disabled = false; });
  });
  $('#logout').addEventListener('click', function () { var done = function () { showLogin(); }; fetch('/auth/logout', { credentials:'include', redirect:'manual' }).then(done, done); });

  var ORDER = ['account', 'role', 'connect', 'printer', 'ready'];
  function showStep(name) {
    state.step = name;
    all('.setup-step').forEach(function (node) { node.hidden = node.getAttribute('data-step') !== name; });
    all('[data-progress]').forEach(function (node) {
      var index = ORDER.indexOf(node.getAttribute('data-progress')), current = ORDER.indexOf(name);
      var skipped = node.getAttribute('data-progress') === 'printer' && current === ORDER.indexOf('ready') && (state.role === 'equipe' || state.role === 'dashboard');
      node.classList.toggle('active', index === current); node.classList.toggle('done', index < current && !skipped); node.classList.toggle('skipped', skipped);
      var marker = node.querySelector('span'); if (marker) marker.textContent = skipped ? '—' : String(index + 1);
      if (index === current) node.setAttribute('aria-current', 'step'); else node.removeAttribute('aria-current');
    });
    var stage = { account:'stageAccount', role:'stageRole', connect:'stageConnect', printer:'stagePrinter', ready:'stageReady' };
    $('#shell-sub').textContent = manual ? tr('launcherSub') : tr(stage[name] || 'welcomeSub');
    var heading = $('[data-step="' + name + '"] h1');
    if (heading) { heading.setAttribute('tabindex', '-1'); heading.focus({ preventScroll:true }); }
  }
  function enterManual() {
    manual = true; shell.classList.add('manual'); $('#setup-progress').hidden = true; $('#shell-sub').textContent = tr('launcherSub'); showStep('role');
  }
  function selectRole(role) {
    state.role = ROLES[role] ? role : '';
    state.printer = false; state.printerSkipped = false;
    all('.tile[data-role]').forEach(function (tile) { var on = tile.getAttribute('data-role') === state.role; tile.classList.toggle('selected', on); tile.setAttribute('aria-pressed', on ? 'true' : 'false'); });
    $('#role-next').disabled = !state.role; $('#role-err').hidden = true;
  }
  all('.tile[data-role]').forEach(function (tile) {
    tile.addEventListener('click', function () { var role = tile.getAttribute('data-role'); if (manual) go(role); else selectRole(role); });
  });
  $('#manual-mode').addEventListener('click', enterManual);
  $('#account-next').addEventListener('click', function () { showStep('role'); });
  all('[data-back]').forEach(function (button) { button.addEventListener('click', function () { showStep(button.getAttribute('data-back')); }); });

  function terminalId() {
    var current = ls(TERMINAL_KEY) || '';
    if (/^[A-Za-z0-9_-]{12,80}$/.test(current)) return current;
    try { current = 'term_' + crypto.randomUUID().replace(/-/g, ''); }
    catch (_) { current = 'term_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 18); }
    setLs(TERMINAL_KEY, current); return current;
  }
  function setConnectUi() {
    $('#pair-box').hidden = !(state.role === 'caisse' || state.role === 'cuisine');
    $('#dashboard-box').hidden = state.role !== 'dashboard';
    $('#team-box').hidden = state.role !== 'equipe';
    var next = $('#connect-next'); next.disabled = true;
    if (state.role === 'equipe') { next.disabled = false; return; }
    if (state.role === 'dashboard') {
      $('#dashboard-status').textContent = state.account === 'connected' ? tr('accountConnected') : tr('dashboardNeedsAccount');
      $('#dashboard-status').className = 'status ' + (state.account === 'connected' ? 'ok' : 'bad'); next.disabled = state.account !== 'connected'; return;
    }
    var venue = pairedVenue();
    state.paired = ls('kiwiPaired') === '1' && !!(venue && venue.merchant); state.venue = state.paired ? venue : null;
    if (state.paired) { $('#pair-status').textContent = tr('alreadyPaired') + ' · ' + (venue.name || venue.merchant); $('#pair-status').className = 'status ok'; next.disabled = false; }
    else { $('#pair-status').textContent = ''; $('#pair-status').className = 'status'; }
    renderStores();
  }
  $('#role-next').addEventListener('click', function () {
    if (!state.role) { $('#role-err').textContent = tr('chooseRole'); $('#role-err').hidden = false; return; }
    if (state.role !== 'equipe' && state.account !== 'connected') { $('#role-err').textContent = tr('dashboardNeedsAccount'); $('#role-err').hidden = false; return; }
    showStep('connect'); setConnectUi();
  });
  function sameStore(store, venue) { return !!(store && venue && store.merchant && venue.merchant === store.merchant); }
  function syncPairButton() {
    var button = $('#pair-btn'), same = sameStore(state.selectedStore, state.venue), next = $('#connect-next');
    button.disabled = !state.selectedStore || same;
    button.textContent = same ? tr('alreadyPaired') : tr('pair');
    if (state.role === 'caisse' || state.role === 'cuisine') next.disabled = !state.paired || !same;
  }
  function selectStore(index) {
    state.selectedStore = state.stores[index] || null;
    all('.store-choice').forEach(function (button, i) { var on = i === index; button.classList.toggle('selected', on); button.setAttribute('aria-pressed', on ? 'true' : 'false'); });
    if (!sameStore(state.selectedStore, state.venue)) { $('#pair-status').textContent = ''; $('#pair-status').className = 'status'; }
    syncPairButton();
  }
  function renderStores() {
    var out = $('#store-list'); out.textContent = '';
    state.stores.forEach(function (store, index) {
      var button = document.createElement('button'), mark = document.createElement('span'), copy = document.createElement('span'), name = document.createElement('strong'), type = document.createElement('small');
      button.type = 'button'; button.className = 'store-choice'; button.setAttribute('aria-pressed', 'false');
      mark.className = 'store-mark'; mark.textContent = String(index + 1); copy.className = 'store-copy'; name.textContent = store.name; type.textContent = store.type || tr('store');
      copy.appendChild(name); copy.appendChild(type); button.appendChild(mark); button.appendChild(copy); button.addEventListener('click', function () { selectStore(index); }); out.appendChild(button);
    });
    var selected = state.selectedStore ? state.stores.indexOf(state.selectedStore) : -1;
    if (state.paired && state.venue) { var matched = state.stores.findIndex(function (store) { return sameStore(store, state.venue); }); if (matched >= 0) selected = matched; }
    if (selected >= 0) selectStore(selected); else syncPairButton();
  }
  $('#pair-btn').addEventListener('click', function () {
    var store = state.selectedStore, button = this, status = $('#pair-status');
    if (!store) { status.textContent = tr('chooseStore'); status.className = 'status bad'; return; }
    var device = terminalId(); button.disabled = true; button.textContent = tr('pairing'); status.textContent = '';
    fetch('/api/pair/create', { method:'POST', headers:{'Content-Type':'application/json',Accept:'application/json'}, body:JSON.stringify({merchant:store.merchant,name:store.name,type:store.type}) })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (body) { if (!r.ok || !body || !body.ok || !body.code) throw new Error(r.status === 429 ? 'pairRate' : 'pairUnavailable'); return body.code; }); })
      .then(function (code) { return fetch('/api/pair/redeem', { method:'POST', headers:{'Content-Type':'application/json',Accept:'application/json'}, body:JSON.stringify({code:code,terminalId:device}) }).then(function (r) { return r.json().catch(function () { return {}; }).then(function (body) { if (!r.ok || !body || !body.ok) throw new Error(r.status === 429 ? 'pairRate' : 'pairUnavailable'); return { code:code, body:body }; }); }); })
      .then(function (pairing) {
        var commit = window.KiwiPairingCommit && window.KiwiPairingCommit.commit;
        if (!commit) throw new Error('pairUnavailable');
        var result = commit(pairing.code, pairing.body); setLs(TERMINAL_KEY, device);
        if (state.selectedStore && !state.selectedStore.merchant) state.selectedStore.merchant = result.venue.merchant;
        state.paired = true; state.venue = result.venue; status.textContent = tr('paired') + ' · ' + (result.venue.name || result.venue.merchant); status.className = 'status ok'; $('#connect-next').disabled = false;
      })
      .catch(function (err) { var key = err && /^pair/.test(err.message) ? err.message : 'pairNetwork'; status.textContent = tr(key); status.className = 'status bad'; })
      .then(syncPairButton);
  });

  function printerPlugin() { var p = plugin(); return p && typeof p.probe === 'function' && typeof p.send === 'function' ? p : null; }
  function printerValues() {
    var host = $('#printer-ip').value.trim(), port = Number($('#printer-port').value), paper = $('#printer-paper').value;
    return { host:host, port:port, paper:paper, valid:!!host && !/\s/.test(host) && port >= 1 && port <= 65535 };
  }
  function printerReason(code) { return code === 'local-network-denied' ? tr('printerDenied') : tr('printerFail'); }
  function loadPrinterConfig() {
    try { var cfg = JSON.parse(ls(PRINTER_KEY) || '{}') || {}; if (cfg.ip) $('#printer-ip').value = cfg.ip; if (cfg.port) $('#printer-port').value = cfg.port; if (cfg.paper === '58' || cfg.paper === '80') $('#printer-paper').value = cfg.paper; } catch (_) {}
  }
  function savePrinter(v) { setLs(PRINTER_KEY, JSON.stringify({ ip:v.host, port:v.port, osPrinter:'', model:'escpos', paper:v.paper, label:{w:50,h:20} })); }
  function enterPrinterOrReady() { if (state.role === 'caisse' || state.role === 'cuisine') { loadPrinterConfig(); showStep('printer'); } else { state.printerSkipped = true; renderReady(); showStep('ready'); } }
  $('#connect-next').addEventListener('click', enterPrinterOrReady);
  $('#printer-form').addEventListener('submit', function (e) {
    e.preventDefault();
    var values = printerValues(), p = printerPlugin(), status = $('#printer-status'), button = $('#printer-test');
    if (!values.valid) { status.textContent = tr('printerRequired'); status.className = 'status bad'; return; }
    if (!p || !window.KiwiEscPos) { status.textContent = tr('printerNativeOnly'); status.className = 'status bad'; return; }
    button.disabled = true; button.textContent = tr('testing'); status.textContent = '';
    p.probe({host:values.host,port:values.port,timeoutMs:4000}).then(function (probe) {
      if (!probe || !probe.ok) throw new Error((probe && probe.code) || 'unreachable');
      var bytes = window.KiwiEscPos.testSlip({ip:values.host,paper:values.paper});
      return p.send({host:values.host,port:values.port,data:window.KiwiEscPos.toB64(bytes),timeoutMs:4000});
    }).then(function (sent) {
      if (!sent || !sent.ok) throw new Error((sent && sent.code) || 'unreachable');
      savePrinter(values); state.printer = true; state.printerSkipped = false; status.textContent = tr('printerOk'); status.className = 'status ok'; $('#printer-next').disabled = false;
    }).catch(function (err) { status.textContent = printerReason(err && err.message); status.className = 'status bad'; })
      .then(function () { button.disabled = false; button.textContent = tr('testPrinter'); });
  });
  $('#printer-scan').addEventListener('click', function () {
    var p = printerPlugin(), button = this, out = $('#scan-results'), port = Number($('#printer-port').value) || 9100;
    out.textContent = '';
    if (!p || typeof p.scan !== 'function') { out.textContent = tr('printerNativeOnly'); return; }
    button.disabled = true; button.textContent = tr('scanning');
    p.scan({port:port,timeoutMs:600}).then(function (result) {
      var hosts = result && result.ok && Array.isArray(result.hosts) ? result.hosts : [];
      if (!hosts.length) { out.textContent = tr('printerNone'); return; }
      var label = document.createElement('p'); label.textContent = hosts.length > 1 ? tr('printerMany') : tr('printerFound'); out.appendChild(label);
      hosts.forEach(function (item) { var pick = document.createElement('button'); pick.type = 'button'; pick.className = 'printer-choice'; pick.textContent = item.host; pick.addEventListener('click', function () { $('#printer-ip').value = item.host; out.textContent = tr('printerFound') + ' · ' + item.host; }); out.appendChild(pick); });
    }).catch(function (err) { out.textContent = printerReason(err && err.message); })
      .then(function () { button.disabled = false; button.textContent = tr('scan'); });
  });
  $('#printer-skip').addEventListener('click', function () { state.printer = false; state.printerSkipped = true; renderReady(); showStep('ready'); });
  $('#printer-next').addEventListener('click', function () { renderReady(); showStep('ready'); });

  function roleName(role) { return tr(role === 'equipe' ? 'team' : role === 'cuisine' ? 'kitchen' : role); }
  function detail(id, value, muted) { var item = $(id), small = item.querySelector('small'), marker = item.querySelector('span'); small.textContent = value; item.classList.toggle('muted', !!muted); if (marker) marker.textContent = muted ? '—' : '✓'; }
  function renderReady() {
    detail('#check-role', roleName(state.role), false);
    if (state.role === 'dashboard') detail('#check-connect', state.accountLabel || tr('accountConnected'), false);
    else if (state.role === 'equipe') detail('#check-connect', tr('teamReady'), false);
    else detail('#check-connect', (state.venue && (state.venue.name || state.venue.merchant)) || tr('paired'), false);
    if (state.role === 'caisse' || state.role === 'cuisine') detail('#check-printer', state.printer ? tr('connected') : tr('printerSkipped'), !state.printer);
    else detail('#check-printer', tr('notRequired'), true);
  }
  $('#ready-back').addEventListener('click', function () { showStep((state.role === 'caisse' || state.role === 'cuisine') ? 'printer' : 'connect'); });
  $('#finish').addEventListener('click', function () { go(state.role); });

  try {
    var cap = window.Capacitor, platform = cap && typeof cap.getPlatform === 'function' ? cap.getPlatform() : 'web';
    $('#platform').textContent = 'Kiwi Pro · ' + ({ios:'iOS',android:'Android',web:'navigateur'}[platform] || platform);
    var meta = document.querySelector('meta[name="kiwi-bundle"]'); $('#bundle').textContent = meta && meta.content ? 'bundle ' + meta.content.slice(0, 12) : 'bundle local';
  } catch (_) {}

  rememberedSecure().then(function (role) {
    if (role && !manual && !forceSetup) { location.replace(ROLES[role]); return; }
    shell.hidden = false;
    if (manual) enterManual(); else { $('#setup-progress').hidden = false; showStep('account'); }
    refreshAccount();
  });
})();
