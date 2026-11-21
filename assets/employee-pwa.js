/* Kiwi Employee portal — install the hosted web app on a phone home screen. */
(function () {
  'use strict';
  // App native (Capacitor) : pas de service worker ni de bouton « Installer » —
  // le bundle embarqué est versionné par la release (docs/roadmaps/KIWI_APP_PLAN.md §1.4).
  if (window.Capacitor && typeof window.Capacitor.isNativePlatform === 'function' && window.Capacitor.isNativePlatform()) return;
  var deferred = null;
  /* L'app réglée en anglais ou en arabe pose <html lang> ; le bouton et la
     consigne d'installation la suivent (l'alerte du navigateur ne passe pas par
     le traducteur de la page). */
  function say(fr, en, ar) {
    var l = String(document.documentElement.lang || 'fr').slice(0, 2);
    return l === 'en' ? en : l === 'ar' ? ar : fr;
  }
  var authenticated = false;
  function standalone() {
    return (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches)
      || window.navigator.standalone === true;
  }
  function show() {
    if (!authenticated || standalone() || document.getElementById('kiwi-employee-install')) return;
    var b = document.createElement('button');
    b.id = 'kiwi-employee-install'; b.type = 'button';
    b.textContent = say('Installer l’app', 'Install the app', 'تثبيت التطبيق');
    b.style.cssText = 'position:fixed;right:16px;bottom:82px;z-index:9998;padding:12px 17px;' +
      'border:0;border-radius:12px;background:#0B6E4F;color:#F7F5F0;font:700 14px/1 "Inter Tight",system-ui;' +
      'box-shadow:0 8px 24px -8px rgba(11,110,79,.55);cursor:pointer';
    b.addEventListener('click', function () {
      if (deferred) {
        deferred.prompt();
        deferred.userChoice.finally(function () { deferred = null; b.remove(); });
        return;
      }
      var ios = /iphone|ipad|ipod/i.test(navigator.userAgent || '');
      alert(ios
        ? say('Sur iPhone : touchez Partager, puis « Sur l’écran d’accueil ». ',
              'On iPhone: tap Share, then “Add to Home Screen”.',
              'على iPhone: اضغط على مشاركة، ثم «إضافة إلى الشاشة الرئيسية».')
        : say('Dans le menu du navigateur, choisissez « Installer l’application » ou « Ajouter à l’écran d’accueil ».',
              'In the browser menu, choose “Install app” or “Add to Home screen”.',
              'من قائمة المتصفح، اختر «تثبيت التطبيق» أو «إضافة إلى الشاشة الرئيسية».'));
    });
    document.body.appendChild(b);
    fit();
  }
  /* Le bouton flotte en bas à droite, au-dessus de tout (z 9998). Sur la
     fiche d'une table, sur la carte et sous une feuille ouverte, il couvrait
     « Annuler toute la table », « Voir la commande » ou un bouton de la
     feuille, et le toucher du serveur ouvrait la consigne d'installation. Il
     ne se montre que sur le plan de salle et le profil, sans feuille ouverte. */
  function fit() {
    var b = document.getElementById('kiwi-employee-install');
    if (!b) return;
    var tab = document.querySelector('#screen-main.is-active .tab.is-active');
    var name = tab && tab.getAttribute('data-tab');
    var hide = !(name === 'tables' || name === 'profil') || !!document.querySelector('.modal-veil.is-open');
    if (b.hidden !== hide) b.hidden = hide;   // une écriture identique relancerait l'observateur à chaque image
  }
  var queued = false;
  function soon() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(function () { queued = false; fit(); });
  }
  if (window.MutationObserver) {
    new MutationObserver(soon).observe(document.documentElement, { subtree: true, attributes: true, attributeFilter: ['class', 'hidden'] });
  }
  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault(); deferred = e; show();
  });
  document.addEventListener('kiwi-employee-authenticated', function () { authenticated = true; show(); });
  window.addEventListener('appinstalled', function () {
    var b = document.getElementById('kiwi-employee-install'); if (b) b.remove();
  });
})();
