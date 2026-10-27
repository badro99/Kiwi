/* Console opérateur · le bandeau « urgentes sans alerte ».
 *
 * Quand aucun canal courriel n'est branché (SUPPORT_ALERT_EMAIL ou MAIL_WEBHOOK),
 * l'alerte d'une demande urgente n'est qu'« enregistrée comme non envoyée » :
 * un commerçant qui ne peut plus vendre attendait que quelqu'un ouvre le
 * Support. Ce module rend l'attente visible sans ouvrir quoi que ce soit : une
 * pastille à côté du bouton Support (« 2 urgentes sans alerte ») et le nombre
 * dans le titre de l'onglet, relus toutes les minutes tant que la console est
 * ouverte. La logique du compte est côté serveur (escalationOf, GET
 * /api/admin/support?escalation=1) ; ici on affiche. Passe par KiwiAdminApi,
 * comme tous les écrans de la console. */
(function () {
  'use strict';
  var launch = document.getElementById('support-console');
  if (!launch || !window.KiwiAdminApi) return;

  var EVERY_MS = 60 * 1000;
  var baseTitle = document.title;
  var pill = document.createElement('span');
  pill.className = 'ks-pill urgent ks-escalation';
  pill.setAttribute('role', 'status');
  pill.setAttribute('aria-live', 'polite');
  pill.tabIndex = 0;
  pill.hidden = true;
  launch.insertAdjacentElement('afterend', pill);

  /* La console s'ouvre en français ; les trois langues sont là pour qu'un
     opérateur qui change <html lang> lise la même chose. */
  var STR = {
    fr: { one: 'urgente sans alerte', many: 'urgentes sans alerte', hint: 'Aucune alerte par e-mail n’est partie (SUPPORT_ALERT_EMAIL ou MAIL_WEBHOOK absent, envoi échoué, ou demande non triée). ', oldest: 'La plus ancienne : ', open: 'Ouvrez le Support.' },
    en: { one: 'urgent without alert', many: 'urgent without alert', hint: 'No alert e-mail went out (SUPPORT_ALERT_EMAIL or MAIL_WEBHOOK missing, send failed, or ticket not triaged). ', oldest: 'Oldest: ', open: 'Open Support.' },
    ar: { one: 'عاجل بلا تنبيه', many: 'عاجلة بلا تنبيه', hint: 'لم يصل أي بريد تنبيه (SUPPORT_ALERT_EMAIL أو MAIL_WEBHOOK غير مضبوط، أو فشل الإرسال، أو الطلب غير مصنّف). ', oldest: 'الأقدم: ', open: 'افتح الدعم.' }
  };
  function L(key) {
    var lang = String(document.documentElement && document.documentElement.lang || 'fr').slice(0, 2);
    return (STR[lang] || STR.fr)[key];
  }

  function label(n) {
    return n + ' ' + L(n > 1 ? 'many' : 'one');
  }

  function show(escalation) {
    var n = escalation && Number(escalation.unalerted) || 0;
    pill.hidden = n < 1;
    if (n < 1) {
      pill.textContent = '';
      document.title = baseTitle;
      return;
    }
    pill.textContent = label(n);
    var first = escalation.tickets && escalation.tickets[0];
    pill.title = L('hint') + (first ? L('oldest') + first.reference + ' · ' + first.merchant + '. ' : '') + L('open');
    document.title = '(' + n + ') ' + baseTitle;
  }

  function refresh() {
    return window.KiwiAdminApi.request('/api/admin/support?escalation=1').then(function (j) {
      show(j && j.escalation);
    }, function () { /* hors ligne ou session expirée : on garde le dernier état connu */ });
  }

  function open() { launch.click(); }
  pill.addEventListener('click', open);
  pill.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); }
  });
  document.addEventListener('visibilitychange', function () { if (!document.hidden) refresh(); });
  window.addEventListener('focus', refresh);
  window.addEventListener('kiwi:support-changed', refresh);
  setInterval(function () { if (!document.hidden) refresh(); }, EVERY_MS);
  setTimeout(refresh, 1500);

  window.KiwiSupportEscalation = Object.freeze({ show: show, refresh: refresh, label: label });
})();
