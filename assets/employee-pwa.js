/* Kiwi Employee portal — install the hosted web app on a phone home screen. */
(function () {
  'use strict';
  var deferred = null;
  var authenticated = false;
  function standalone() {
    return (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches)
      || window.navigator.standalone === true;
  }
  function show() {
    if (!authenticated || standalone() || document.getElementById('kiwi-employee-install')) return;
    var b = document.createElement('button');
    b.id = 'kiwi-employee-install'; b.type = 'button';
    b.textContent = 'Installer l’app';
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
        ? 'Sur iPhone : touchez Partager, puis « Sur l’écran d’accueil ». '
        : 'Dans le menu du navigateur, choisissez « Installer l’application » ou « Ajouter à l’écran d’accueil ».');
    });
    document.body.appendChild(b);
  }
  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault(); deferred = e; show();
  });
  document.addEventListener('kiwi-employee-authenticated', function () { authenticated = true; show(); });
  window.addEventListener('appinstalled', function () {
    var b = document.getElementById('kiwi-employee-install'); if (b) b.remove();
  });
})();
