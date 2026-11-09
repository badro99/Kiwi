/* Vue réception · le tableau de bord d'un·e réceptionniste d'hôtel.
 *
 * Owner, 9 Nov 2026 : la réception travaille dans le tableau de bord, la caisse
 * reste aux restaurants de l'hôtel. Le code d'une réceptionniste est reconnu par
 * le serveur (functions/auth/_lib.js › employeeRoleOpensReceptionView) au palier
 * « reception » ; dashboard.html pose alors body.role-reception. Ce fichier
 * réduit le tableau de bord aux pages du comptoir :
 *   Réception · Plan des chambres · Réservations & séjours · Ménage ·
 *   Notes clients (folios) · Hospitality+ (fiches clients) · Réservations & RDV.
 * Tout le reste disparaît de la barre latérale ET refuse de s'ouvrir par une
 * autre porte (handler appelé directement, lien dans une page, assistant) :
 * l'accueil chiffré, les encaissements, le rapport, l'équipe, la paie, les
 * tarifs, les canaux, l'économat, l'intelligence hôtel, les réglages.
 * La vue patron n'est pas touchée : rien ici ne s'exécute hors role-reception.
 *
 * Limite connue : comme la vue gérant, c'est une vue posée sur la session du
 * compte ouverte sur cet appareil ; le serveur ne découpe pas encore les données
 * par rôle. */
(function () {
  'use strict';

  var NAV_OK = { reception: 1, chambres: 1, sejours: 1, menage: 1, folios: 1, reservations: 1 };
  var ACTION_OK = { 'clients-directory': 1 };
  /* Actions hors « nav-* » qui mènent à de l'argent ou au marketing. */
  var ACTION_DENY = { 'customer-retention': 1, 'growth-crm': 1, 'open-assistant': 1,
    settings: 1, 'account-profile': 1, 'account-billing': 1 };
  var HOME = 'nav-reception';
  /* Barre du bas sur téléphone (.kw-capsule) : Accueil (ramène à la
   * Réception) et Menu restent ; Commandes, Nouvelle vente et l'assistant
   * partent. L'assistant lit les ventes : il reste au patron. */
  var TAB_DENY = { commandes: 1, vente: 1, ai: 1 };

  var TXT = {
    badge: { fr: 'Vue réception', en: 'Front desk view', ar: 'عرض الاستقبال' },
    denied: { fr: 'Cette page est réservée au propriétaire', en: 'This page is for the owner only', ar: 'هذه الصفحة خاصة بالمالك' },
  };
  function t(k) {
    var l = 'fr';
    try { l = (window.KiwiI18n && window.KiwiI18n.getLang && window.KiwiI18n.getLang()) || 'fr'; } catch (_) {}
    return TXT[k][l] || TXT[k].fr;
  }

  function on() { return document.body && document.body.classList.contains('role-reception'); }

  function allowedKey(key) {
    if (!key) return true;
    if (ACTION_DENY[key]) return false;
    if (key.indexOf('nav-') === 0) return !!NAV_OK[key.slice(4)] || key === 'nav-accueil';
    return true;
  }

  function deny() {
    try { window.Kiwi && window.Kiwi.toast && window.Kiwi.toast(t('denied'), { type: 'info' }); } catch (_) {}
  }

  /* La Réception d'un hôtel ; ailleurs (spa, salon, salle de sport), les
   * réservations. */
  function homeHandler() {
    var H = window.Kiwi && window.Kiwi.handlers;
    return H && (H[HOME] || H['nav-reservations']) || null;
  }
  function goHome() {
    var h = homeHandler();
    if (h) { try { h(); } catch (_) {} return true; }
    return false;
  }

  /* Chaque handler hors liste est enveloppé, y compris ceux qu'un module
   * enregistre plus tard (balayage répété). « Accueil » ramène à la Réception :
   * fermer une page ne doit jamais montrer le chiffre d'affaires. */
  function sweep() {
    if (!on()) return;
    var K = window.Kiwi;
    /* Le retour à l'accueil ne passe pas toujours par un handler : le
     * déverrouillage et le verrouillage remettent la page « accueil » à la main
     * (dashboard.html › resetToDashboard). On le rattrape ici. */
    if (K && typeof K.setActivePage === 'function' && !K.setActivePage.__kiwiReceptionGated) {
      var setPrev = K.setActivePage;
      var setGuarded = function (key) {
        var r = setPrev.apply(this, arguments);
        if (on() && (key === 'accueil' || key == null)) setTimeout(goHome, 0);
        return r;
      };
      setGuarded.__kiwiReceptionGated = true;
      K.setActivePage = setGuarded;
    }
    var H = K && K.handlers;
    if (!H) return;
    Object.keys(H).forEach(function (key) {
      var fn = H[key];
      if (typeof fn !== 'function' || fn.__kiwiReceptionGated || allowedKey(key) && key !== 'nav-accueil') return;
      var prev = fn;
      var guarded = key === 'nav-accueil'
        ? function () { if (!on()) return prev.apply(this, arguments); if (!goHome()) return undefined; }
        : function () { if (!on()) return prev.apply(this, arguments); deny(); return undefined; };
      guarded.__kiwiReceptionGated = true;
      H[key] = guarded;
    });
  }

  /* Un lien de la barre latérale passe par le routeur de pages.js (capture sur
   * document) ; on l'arrête avant lui, sur window. */
  window.addEventListener('click', function (e) {
    if (!on()) return;
    var tab = e.target && e.target.closest && e.target.closest('[data-kw-tab]');
    if (tab && TAB_DENY[tab.getAttribute('data-kw-tab')]) { e.preventDefault(); e.stopImmediatePropagation(); deny(); return; }
    if (e.target && e.target.closest && e.target.closest('#kcl-chip')) { e.preventDefault(); e.stopImmediatePropagation(); deny(); return; }
    var a = e.target && e.target.closest && e.target.closest('[data-nav],[data-action]');
    if (!a) return;
    var key = a.getAttribute('data-nav') ? 'nav-' + a.getAttribute('data-nav') : a.getAttribute('data-action');
    if (key === 'nav-accueil') { e.preventDefault(); e.stopImmediatePropagation(); goHome(); return; }
    if (allowedKey(key) || ACTION_OK[key]) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    deny();
  }, true);

  /* La barre latérale : on garde les pages du comptoir, on retire le reste et
   * les titres de section devenus vides. */
  function sidebar() {
    var nav = document.querySelector('.sidebar nav');
    if (!nav) return;
    nav.querySelectorAll('a').forEach(function (a) {
      var navKey = a.getAttribute('data-nav');
      var action = a.getAttribute('data-action');
      var keep = navKey ? !!NAV_OK[navKey] : !!ACTION_OK[action];
      a.toggleAttribute('data-reception-hidden', !keep);
    });
    nav.querySelectorAll('.nav-section, .sb-section, [data-nav-section]').forEach(function (sec) {
      var links = sec.querySelectorAll('a');
      if (!links.length) return;
      var visible = Array.prototype.some.call(links, function (a) { return !a.hasAttribute('data-reception-hidden'); });
      sec.toggleAttribute('data-reception-hidden', !visible);
    });
    var badge = document.querySelector('[data-role-badge] span');
    if (badge && badge.textContent !== t('badge')) { badge.textContent = t('badge'); badge.removeAttribute('data-i18n'); }
  }

  function clearSidebar() {
    document.querySelectorAll('[data-reception-hidden]').forEach(function (el) { el.removeAttribute('data-reception-hidden'); });
  }

  var style = document.createElement('style');
  style.textContent =
    'body.role-reception [data-reception-hidden]{display:none!important}' +
    /* L'accueil et les pages chiffrées restent fermés même si la Réception
     * n'a pas pu se charger : jamais le chiffre d'affaires par défaut. */
    'body.role-reception .container>.dash-standard,body.role-reception .container>.dash-fusion,' +
    'body.role-reception .container>.dash-equipe,body.role-reception .container>.dash-finance,' +
    'body.role-reception .container>.dash-menu,body.role-reception .container>.dash-stock,' +
    'body.role-reception .container>.dash-conformite{display:none!important}' +
    'body.role-reception .role-badge{display:inline-flex}' +
    /* 375 px : le badge passerait sous le logo centré. */
    '@media (max-width:600px){body.role-reception .role-badge{display:none}}' +
    /* Appairer une caisse et encaisser : affaires de la caisse, pas du comptoir. */
    'body.role-reception #kcl-chip,' +
    'body.role-reception .kw-capsule [data-kw-tab="commandes"],' +
    'body.role-reception .kw-capsule [data-kw-tab="vente"],' +
    'body.role-reception .kw-capsule [data-kw-tab="ai"],' +
    'body.role-reception [data-action="open-assistant"]{display:none!important}';
  (document.head || document.documentElement).appendChild(style);

  var landed = false;
  var timer = 0;
  function apply() {
    if (!on()) { clearSidebar(); landed = false; return; }
    sweep();
    sidebar();
    /* Première page : la Réception, jamais l'accueil chiffré. */
    if (!landed && homeHandler()) {
      landed = true;
      goHome();
    }
  }
  function schedule() { clearTimeout(timer); timer = setTimeout(apply, 60); }

  function start() {
    apply();
    /* Le rôle change au déverrouillage (classe sur body) ; la barre latérale se
     * redessine quand l'établissement change. */
    new MutationObserver(schedule).observe(document.body, { attributes: true, attributeFilter: ['class'] });
    var nav = document.querySelector('.sidebar nav');
    if (nav) new MutationObserver(schedule).observe(nav, { childList: true, subtree: true });
    /* Les modules chargés à la demande enregistrent leurs handlers plus tard. */
    setInterval(function () { if (on()) { sweep(); if (!landed) apply(); } }, 1500);
    window.addEventListener('kiwi:langchange', schedule);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
