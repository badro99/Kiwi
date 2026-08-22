/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · verrouillage par inactivité du tableau de bord
 * ---------------------------------------------------------------------------
 * LE PROBLÈME, tel qu'il se produit chez un client : un iPad tient la caisse.
 * Un jour, le patron ouvre AUSSI le tableau de bord dans Safari pour regarder
 * ses chiffres, puis repasse à l'application de caisse et n'y revient jamais.
 * L'onglet reste ouvert des semaines. La session ne demande plus rien, la porte
 * à code a été franchie une fois pour toutes, et n'importe quel employé qui
 * ouvre Safari trouve la marge, la paie et les comptes grands ouverts.
 *
 * CE QUI EST FAIT ICI : au-delà d'un temps d'inactivité, la page se recharge.
 * Le rechargement n'est pas un pis-aller, c'est le geste juste — la porte à
 * code REJOUE à chaque chargement (voir dashboard.html : « No persistence — the
 * lock + greeting flow ALWAYS replays on reload »), donc recharger, c'est
 * reverrouiller. En prime les chiffres repartent frais et auth-guard.js
 * revérifie que le compte n'a pas été suspendu entre-temps.
 *
 * POURQUOI PAS window.__kiwiLock.show() : l'écran de code est RETIRÉ du DOM une
 * fois l'intro terminée (trois `lock.remove()` dans dashboard.html). Appeler
 * show() après coup pose un style sur un nœud détaché : rien ne se passe, en
 * silence. C'est le genre de correctif qui passe la relecture et ne protège
 * personne.
 *
 * ── LE PIÈGE PRINCIPAL ──────────────────────────────────────────────────────
 * Un minuteur ne suffit PAS. Sur iPadOS, un onglet en arrière-plan est gelé :
 * setInterval ne s'exécute plus du tout. Le scénario même que ce fichier existe
 * pour couvrir — l'onglet abandonné derrière l'application de caisse — est
 * précisément celui où aucun minuteur ne se déclenchera jamais. Alors on ne
 * décide pas au tic d'une horloge : on COMPARE DES HORODATAGES aux seuls
 * instants où la page peut encore observer quelque chose — retour à la
 * visibilité, reprise du cache arrière/avant (bfcache), reprise du focus. Le
 * minuteur ne sert qu'au cas facile, celui de l'onglet resté au premier plan.
 *
 * ── DEUX SEUILS, PARCE QU'IL Y A DEUX ABSENCES ──────────────────────────────
 *   · visible et sans un geste depuis 10 min  → on prévient 45 s, puis on
 *     verrouille. Quelqu'un est peut-être devant l'écran en train de lire.
 *   · onglet caché depuis 3 min               → on verrouille au retour, sans
 *     préavis : la personne n'était pas là pour le lire.
 * Le seuil « caché » est le plus court des deux à dessein. C'est celui du
 * scénario client, et un onglet en arrière-plan ne montre rien à personne tant
 * qu'il y reste : le verrouiller tôt ne coûte rien et ferme la porte.
 *
 * ── CE QUI EST VOLONTAIREMENT EXCLU ─────────────────────────────────────────
 *   · La vue portée (?op=1 / ?merchant=) : le support n'a pas le code du
 *     commerçant. Verrouiller enfermerait l'opérateur dehors.
 *   · La caisse : elle est faite pour rester allumée en service, elle a sa
 *     propre passation, et une caisse qui se verrouille pendant un coup de feu
 *     est un incident, pas une sécurité.
 * ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  /* Réglages. Exposés sur l'objet public pour que le test les lise plutôt que
     de les recopier — une constante recopiée dans un test finit toujours par
     mentir sur ce que fait le code. */
  var IDLE_MS = 10 * 60 * 1000;   /* visible, sans geste */
  var AWAY_MS = 3 * 60 * 1000;    /* onglet caché */
  var WARN_MS = 45 * 1000;        /* préavis avant verrouillage, au premier plan */
  var TICK_MS = 5 * 1000;

  var last = Date.now();          /* dernier geste observé */
  var hiddenAt = 0;               /* instant où l'onglet est passé caché */
  var warned = false;
  var locking = false;

  function scopedView() {
    try {
      var p = new URLSearchParams(location.search || '');
      return p.has('op') || p.has('merchant');
    } catch (_) { return false; }
  }

  /* Tant que la porte à code est encore à l'écran (intro d'ouverture), il n'y a
     rien à verrouiller — et recharger renverrait la personne au même endroit en
     lui faisant perdre ce qu'elle vient de taper. */
  function gateUp() {
    try {
      var el = document.querySelector('[data-kiwi-lock]');
      return !!(el && el.isConnected && el.style.display !== 'none');
    } catch (_) { return false; }
  }

  /* L'assistant d'installation possède l'écran quand il tourne. Le couper au
     milieu ferait perdre une configuration à moitié saisie — et il ouvre son
     écran en APPELANT __kiwiLock.hide(), donc gateUp() ci-dessus le voit
     « fermé » alors que quelqu'un est bel et bien en train de taper.
     `.kob-root.kob-in` est la racine réelle de l'assistant (assets/onboarding.js
     › build/open) ; la classe a été vérifiée sur la page, pas devinée. */
  function wizardUp() {
    try {
      return !!document.querySelector('.kob-root.kob-in, .onb-veil.is-open, [data-onboarding].is-open');
    } catch (_) { return false; }
  }

  function lang() {
    try { return localStorage.getItem('kiwiLang') || 'fr'; } catch (_) { return 'fr'; }
  }

  var T = {
    fr: { title: 'Verrouillage dans', unit: 's', stay: 'Je suis là', why: 'Le tableau de bord se verrouille après une absence.' },
    en: { title: 'Locking in', unit: 's', stay: 'I am here', why: 'The dashboard locks itself after a period away.' },
    ar: { title: 'قفل بعد', unit: 'ث', stay: 'أنا هنا', why: 'تُقفل لوحة التحكم بعد فترة غياب.' },
  };
  function t() { return T[lang()] || T.fr; }

  /* ── Le préavis ────────────────────────────────────────────────────────────
     Une barre discrète, pas un modal : elle ne doit pas voler le clavier ni
     couvrir un chiffre que la personne est en train de lire. Elle porte son
     propre compte à rebours, ce qui répond d'avance à « pourquoi ma page a
     bougé toute seule ». */
  var bar = null, count = null, tickHandle = 0;
  function showWarning(secondsLeft) {
    if (!bar) {
      bar = document.createElement('div');
      bar.setAttribute('role', 'status');
      bar.setAttribute('data-kiwi-idle-warn', '');
      bar.style.cssText = [
        'position:fixed', 'left:50%', 'bottom:22px', 'transform:translateX(-50%)',
        'z-index:2147483000', 'display:flex', 'align-items:center', 'gap:14px',
        'padding:12px 14px 12px 18px', 'border-radius:14px',
        'background:#0A0F0D', 'color:#F7F5F0',
        'border:1px solid rgba(247,245,240,0.14)',
        'box-shadow:0 18px 50px -22px rgba(0,0,0,0.7)',
        'font:500 13.5px/1.35 "Inter Tight",system-ui,sans-serif',
        'letter-spacing:-0.01em', 'max-width:calc(100vw - 32px)',
      ].join(';');

      var text = document.createElement('span');
      text.style.cssText = 'display:flex;flex-direction:column;gap:2px';
      var line1 = document.createElement('span');
      count = document.createElement('b');
      count.style.cssText = 'font-variant-numeric:tabular-nums';
      line1.appendChild(document.createTextNode(t().title + ' '));
      line1.appendChild(count);
      line1.appendChild(document.createTextNode(' ' + t().unit));
      var line2 = document.createElement('small');
      line2.textContent = t().why;
      line2.style.cssText = 'color:rgba(247,245,240,0.55);font-size:11.5px;font-weight:400';
      text.appendChild(line1);
      text.appendChild(line2);

      var btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = t().stay;
      btn.style.cssText = [
        'flex:0 0 auto', 'min-height:38px', 'padding:0 16px', 'border-radius:10px',
        'border:0', 'cursor:pointer', 'background:#7DF2B0', 'color:#0A0F0D',
        'font:600 13px/1 "Inter Tight",system-ui,sans-serif', 'letter-spacing:-0.01em',
      ].join(';');
      btn.addEventListener('click', function () { bump(); });

      bar.appendChild(text);
      bar.appendChild(btn);
      document.body.appendChild(bar);
    }
    if (count) count.textContent = String(Math.max(0, secondsLeft));
    bar.style.display = '';
  }
  function hideWarning() {
    warned = false;
    if (bar) bar.style.display = 'none';
  }

  /* Un geste. Volontairement bon marché : on ne fait qu'écrire une date, et le
     mousemove est le seul à passer par un filtre — il arrive par centaines. */
  function bump() {
    last = Date.now();
    if (warned) hideWarning();
  }
  var lastMove = 0;
  function onMove() {
    var now = Date.now();
    if (now - lastMove < 1000) return;
    lastMove = now;
    bump();
  }

  function lockNow(reason) {
    if (locking) return;
    if (gateUp() || wizardUp()) return;
    locking = true;
    try { sessionStorage.setItem('kiwiIdleLockReason', String(reason || 'idle')); } catch (_) {}
    /* `location.reload()` et non une navigation : on revient exactement sur la
       même URL, donc la même boutique portée, le même onglet, et la porte à
       code se remet en place d'elle-même. */
    try { location.reload(); } catch (_) { try { location.href = location.href; } catch (__) {} }
  }

  function tick() {
    if (locking) return;
    if (document.hidden) return;              /* l'absence cachée se juge au retour */
    if (gateUp() || wizardUp()) { bump(); return; }
    var idle = Date.now() - last;
    if (idle >= IDLE_MS) { lockNow('idle'); return; }
    if (idle >= IDLE_MS - WARN_MS) {
      warned = true;
      showWarning(Math.ceil((IDLE_MS - idle) / 1000));
    } else if (warned) {
      hideWarning();
    }
  }

  /* Le retour d'absence — le seul chemin qui compte vraiment sur un iPad, parce
     que c'est le seul qui s'exécute après un gel d'arrière-plan. */
  function onReturn() {
    if (locking) return;
    var awayFor = hiddenAt ? (Date.now() - hiddenAt) : 0;
    hiddenAt = 0;
    if (awayFor >= AWAY_MS) { lockNow('away'); return; }
    /* Une absence courte ne verrouille pas, mais elle ne prolonge pas non plus
       la session en douce : on repart du retour, pas d'avant le départ. */
    bump();
  }

  function start() {
    if (scopedView()) return;                 /* vue support : voir l'en-tête */

    ['pointerdown', 'keydown', 'wheel', 'touchstart', 'scroll'].forEach(function (ev) {
      window.addEventListener(ev, bump, { passive: true, capture: true });
    });
    window.addEventListener('mousemove', onMove, { passive: true, capture: true });

    document.addEventListener('visibilitychange', function () {
      if (document.hidden) { hiddenAt = Date.now(); hideWarning(); }
      else onReturn();
    });
    /* Reprise depuis le cache arrière/avant : `persisted` signale une page
       ressortie du congélateur, dont les minuteurs n'ont pas tourné. */
    window.addEventListener('pageshow', function (e) {
      if (e && e.persisted) { if (!hiddenAt) hiddenAt = last; onReturn(); }
    });
    window.addEventListener('focus', function () { if (hiddenAt) onReturn(); });

    setInterval(tick, TICK_MS);
  }

  window.KiwiIdleLock = {
    IDLE_MS: IDLE_MS,
    AWAY_MS: AWAY_MS,
    WARN_MS: WARN_MS,
    /* Pour les tests et pour une console : forcer le verrouillage, ou repousser
       l'échéance comme le ferait un geste. */
    lockNow: lockNow,
    bump: bump,
    /* Combien de temps depuis le dernier geste — lecture seule. */
    idleMs: function () { return Date.now() - last; },
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
