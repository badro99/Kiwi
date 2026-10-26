/* Kiwi · lien de vue — « Marges, 30 jours » dans l'adresse.
 *
 * Le tableau de bord ne gardait rien dans son adresse : recharger ramenait à
 * l'accueil, et « regarde les marges du mois » ne pouvait pas s'envoyer.
 * L'adresse porte maintenant la page ouverte et la période :
 *
 *     dashboard.html#/finance?r=trenteJours
 *
 * Règles :
 *   · des identifiants seulement, jamais un chiffre, un nom ou une donnée du
 *     commerce ; l'établissement n'y est PAS (le lien s'ouvre sur celui de la
 *     personne connectée : un changement d'établissement par l'adresse
 *     croiserait la portée opérateur et l'appairage des caisses) ;
 *   · le lien s'ouvre derrière la connexion, comme le tableau de bord ;
 *   · une page inconnue ou une période hors liste est ignorée, pas devinée ;
 *   · history.replaceState, pas pushState : la touche Retour du navigateur
 *     garde son sens (quitter le tableau de bord), on ne la remplit pas de
 *     chaque clic de la barre latérale.
 *
 * La page vient de Kiwi.setActivePage (assets/interactive.js), qui émet
 * `kiwi:page` ; la période de KiwiDateRange. Idée reprise de gods-eye-view
 * (MIT), qui met caméra et calques dans l'adresse ; rien n'est copié. */
(function () {
  'use strict';

  const RANGES = ['aujourdhui', 'hier', 'septJours', 'trenteJours', 'moisDernier', 'trimestre', 'annee'];
  const PAGE = /^[a-z][a-z0-9-]{1,30}$/;
  const T = {
    fr: { copy: 'Copier le lien de cette vue', done: 'Lien copié', desc: 'Il ouvre cette page et cette période, après connexion. Aucun chiffre ne voyage dans le lien.', fail: 'Copie impossible ici. Le lien est dans la barre d’adresse.' },
    en: { copy: 'Copy a link to this view', done: 'Link copied', desc: 'It opens this page and this period, after signing in. No figures travel in the link.', fail: 'Could not copy here. The link is in the address bar.' },
    ar: { copy: 'نسخ رابط هذه الصفحة', done: 'تم نسخ الرابط', desc: 'يفتح هذه الصفحة وهذه الفترة بعد تسجيل الدخول. لا تنتقل أي أرقام في الرابط.', fail: 'تعذر النسخ هنا. الرابط موجود في شريط العنوان.' },
  };
  const lang = () => { const l = (document.documentElement.lang || 'fr').slice(0, 2); return T[l] ? l : 'fr'; };
  const tr = (k) => T[lang()][k];

  function parse(hash) {
    const m = /^#\/([^?]*)(?:\?(.*))?$/.exec(String(hash || ''));
    if (!m || !PAGE.test(m[1]) || m[1] === 'accueil') return null;
    const r = new URLSearchParams(m[2] || '').get('r');
    return { page: m[1], range: RANGES.includes(r) ? r : null };
  }
  function build(page, range) {
    if (!page || page === 'accueil' || !PAGE.test(page)) return '';
    return '#/' + page + (RANGES.includes(range) ? '?r=' + range : '');
  }
  const current = () => build(window.Kiwi && window.Kiwi.activePage, window.KiwiDateRange && window.KiwiDateRange.getDateRange && window.KiwiDateRange.getDateRange());
  const urlFor = (hash) => location.origin + location.pathname + location.search + hash;

  /* Pendant la restauration, l'accueil qui se peint au démarrage appelle
   * setActivePage('accueil') : sans ce verrou il effacerait l'adresse qu'on
   * est en train de lire. */
  /* L'adresse est lue DÈS l'exécution du script : le démarrage du tableau de
   * bord annonce l'accueil (kiwi:page) avant l'événement load. */
  const initial = parse(location.hash);
  let restoring = !!initial;
  function sync() {
    if (restoring) return;
    const h = current();
    if (h === location.hash || (!h && !location.hash)) return;
    try { history.replaceState(history.state, '', urlFor(h)); } catch (_) {}
    paintButton();
  }

  function ready(page) {
    const K = window.Kiwi;
    if (!K || !K.handlers || document.readyState !== 'complete') return false;
    const overlay = [...document.querySelectorAll('.kob-root, [data-kiwi-skip]')].some((n) => n.offsetParent !== null);
    if (overlay) return false;
    return !!(K.handlers['nav-' + page] || document.querySelector('.sidebar nav a[data-nav="' + page + '"]'));
  }
  function restore(target) {
    if (!target) return;
    if (!['home', 'accueil'].includes(target.page)) {
      return Promise.resolve().then(() => window.KiwiDashboardLoader?.load('workspace'))
        .then(() => restoreReady(target), () => {});
    }
    return restoreReady(target);
  }
  function restoreReady(target) {
    restoring = true;
    /* Une page que ce tableau de bord ne connaît pas n'arrivera jamais :
     * on abandonne trois secondes après le chargement complet (12 s au plus),
     * sans quoi l'adresse cesserait de suivre les clics pendant ce temps. */
    const started = Date.now();
    let loadedAt = 0;
    (function attempt() {
      if (!ready(target.page)) {
        if (document.readyState === 'complete' && !loadedAt) loadedAt = Date.now();
        const waited = loadedAt ? Date.now() - loadedAt : 0;
        if (Date.now() - started < 12000 && waited < 3000) return void setTimeout(attempt, 200);
        restoring = false;
        return void sync();
      }
      try { if (target.range && window.KiwiDateRange) window.KiwiDateRange.setDateRange(target.range); } catch (_) {}
      const link = document.querySelector('.sidebar nav a[data-nav="' + target.page + '"]');
      try {
        if (link && link.offsetParent !== null) link.click();
        else window.Kiwi.handlers['nav-' + target.page]();
      } catch (_) {}
      setTimeout(() => { restoring = false; sync(); }, 400);
    })();
  }

  function copy() {
    const url = urlFor(current());
    const done = () => window.Kiwi && window.Kiwi.toast && window.Kiwi.toast(tr('done'), { type: 'success', desc: tr('desc') });
    const fail = () => window.Kiwi && window.Kiwi.toast && window.Kiwi.toast(tr('fail'), { type: 'info' });
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(done, fail);
    else fail();
  }

  let button = null;
  function paintButton() {
    const crumb = document.querySelector('.topbar .breadcrumb');
    if (!crumb) return;
    if (!button) {
      button = document.createElement('button');
      button.type = 'button';
      button.className = 'view-link-btn';
      button.addEventListener('click', copy);
      crumb.insertAdjacentElement('afterend', button);
      const st = document.createElement('style');
      st.textContent = '.view-link-btn{display:inline-flex;align-items:center;justify-content:center;width:32px;height:32px;margin-inline-start:6px;border:0;border-radius:10px;background:transparent;color:var(--n-500,#6b7570);cursor:pointer;flex:0 0 auto}.view-link-btn:hover{background:var(--n-100,rgba(10,15,13,.06));color:var(--ink,#0A0F0D)}.view-link-btn:focus-visible{outline:2px solid var(--atlas,#0B6E4F);outline-offset:2px}.view-link-btn svg{width:18px;height:18px}.view-link-btn[hidden]{display:none}';
      document.head.appendChild(st);
    }
    const label = tr('copy');
    button.setAttribute('aria-label', label);
    button.title = label;
    if (!button.firstChild && window.KiwiIcon && window.KiwiIcon.svg) button.innerHTML = window.KiwiIcon.svg('link', 18);
    button.hidden = !current();
  }

  document.addEventListener('kiwi:page', sync);
  window.addEventListener('kiwi:langchange', paintButton);
  window.addEventListener('hashchange', () => { const t = parse(location.hash); if (t && build(t.page, t.range) !== current()) restore(t); });
  function boot() {
    try { if (window.KiwiDateRange && window.KiwiDateRange.subscribe) window.KiwiDateRange.subscribe(() => sync()); } catch (_) {}
    paintButton();
    restore(initial);
  }
  if (document.readyState === 'complete') boot();
  else window.addEventListener('load', boot, { once: true });

  window.KiwiViewLink = { parse, build, current, copy };
})();
