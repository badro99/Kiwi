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
  var params = new URLSearchParams(location.search);
  var wantChoice = params.has('choose') || params.has('home');

  function remembered() {
    try { var r = localStorage.getItem(KEY); return ROLES[r] ? r : ''; } catch (_) { return ''; }
  }
  function remember(role) {
    try { if (ROLES[role]) localStorage.setItem(KEY, role); } catch (_) {}
  }
  function go(role) {
    remember(role);
    location.href = ROLES[role];
  }

  // Lancement : un appareil qui connaît son rôle y va tout de suite.
  var last = remembered();
  if (last && !wantChoice) { location.replace(ROLES[last]); return; }

  var $ = function (sel) { return document.querySelector(sel); };
  var shell = $('#shell');
  var acctState = $('#acct-state'), acctText = $('#acct-text'), acctUnknown = $('#acct-unknown');
  var login = $('#login'), loginErr = $('#login-err'), loginBtn = $('#login-btn');

  function showLogin(err) {
    login.hidden = false; acctState.hidden = true; acctUnknown.hidden = true;
    if (err) { loginErr.textContent = err; loginErr.hidden = false; } else { loginErr.hidden = true; }
  }
  function showAccount(me) {
    var label = (me && (me.business || me.name || me.email)) || 'Compte marchand';
    acctText.textContent = 'Connecté · ' + label;
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
    'bad-creds': 'E-mail ou mot de passe incorrect.',
    'bad-json': 'Requête invalide.',
    'not-configured': 'Service momentanément indisponible.',
    'too-many': 'Trop de tentatives. Réessayez dans quelques minutes.',
    network: 'Réseau injoignable. Vérifiez le Wi-Fi de l’appareil.'
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
        showLogin(ERRORS[code] || 'Une erreur est survenue. Réessayez.');
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

  shell.hidden = false;
  refreshAccount();
})();
