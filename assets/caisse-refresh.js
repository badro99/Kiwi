/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · RAFRAÎCHIR — un bouton, toutes les caisses.
 * ---------------------------------------------------------------------------
 * Une caisse de comptoir reste ouverte des jours. Entre-temps le tableau de
 * bord a importé un inventaire, l'autre poste a vendu, l'opérateur a allumé un
 * module, une commande en ligne est tombée. La page, elle, montre encore ce
 * qu'elle avait lu à l'ouverture. Les modules se relisent bien tout seuls — au
 * retour sur l'onglet, avec 20 s de délai de garde — mais un plein écran de
 * caisse ne « revient » jamais sur son onglet : il n'en a pas quitté. D'où ce
 * bouton, et d'où le fait qu'il pose la question TOUT DE SUITE, sans délai.
 *
 * Ce qu'il relit vraiment, quand le magasin est réel :
 *   · l'inventaire            KiwiBoutiqueCatalog.sync()   → /api/catalog
 *   · les documents magasin   KiwiCloudDoc.pullAll()       → /api/store
 *     (plan de salle, classeur du jour… selon le métier)
 *   · les commandes en ligne  KiwiOrderInbox.refresh()     → /api/order/queue
 *   · les modules et les PIN  KiwiConfig.reload()          → /api/config
 * Chaque module absent de ce métier est simplement sauté.
 *
 * Le bouton recharge maintenant la page comme le bouton du navigateur. La
 * caisse sauvegarde déjà le service sur `beforeunload`, donc le rechargement
 * bénéficie du même filet que Chrome sans exiger sa barre d'outils.
 *
 * Et il ne ment pas. « Déjà à jour » n'est affiché que si au moins un appel a
 * VRAIMENT eu une réponse : sinon le message dit que le serveur n'a pas
 * répondu, et que ce qui est à l'écran reste ce que sait cette tablette. Un
 * commerçant qui lit « à jour » alors que le réseau est tombé prend une
 * décision sur une information fausse — c'est précisément ce qu'un bouton de
 * synchronisation doit rendre impossible.
 * ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"'
    + ' stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
    + '<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/>'
    + '<path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/></svg>';

  function css() {
    if (document.getElementById('kx-refresh-css')) return;
    var st = document.createElement('style');
    st.id = 'kx-refresh-css';
    /* Le bouton emprunte la classe de son voisin « Verrouiller » : il vit dans
     * le même pied de rail, sur seize métiers dont chacun a son propre préfixe.
     * Copier la classe est ce qui le fait ressembler EXACTEMENT au bouton d'à
     * côté partout, sans une ligne de CSS par métier. Ne reste ici que ce qui
     * lui est propre : le tour qui tourne, et l'état occupé. */
    st.textContent = [
      '.kx-refresh { cursor: pointer; }',
      '.kx-refresh[disabled] { cursor: default; opacity: 0.6; }',
      '.kx-refresh.is-busy svg { animation: kx-spin 900ms linear infinite; transform-origin: 50% 50%; }',
      '@keyframes kx-spin { to { transform: rotate(360deg); } }',
      '@media (prefers-reduced-motion: reduce) { .kx-refresh.is-busy svg { animation: none; } }',
    ].join('\n');
    document.head.appendChild(st);
  }

  function toast(msg) {
    var stack = document.getElementById('toast-stack');
    if (!stack) return;
    var el = document.createElement('div');
    el.className = 'toast';
    el.textContent = msg;
    stack.appendChild(el);
    setTimeout(function () { el.classList.add('fade'); }, 3000);
    setTimeout(function () { el.remove(); }, 3300);
  }

  /* Une caisse APPAIRÉE est un vrai commerce, par définition : le code à six
   * chiffres l'a liée à un établissement nommé. KiwiEnv.isReal() ne connaît que
   * le domaine et la session marchande — il ignore l'appairage, et c'est le seul
   * module de la caisse à s'en contenter. Résultat : une caisse liée à sa
   * boutique mais sans session ouverte répondait « rien à synchroniser » à
   * chaque appui sur « Rafraîchir ». Même prédicat que partout ailleurs. */
  function real() {
    try {
      if (window.KiwiEnv && window.KiwiEnv.isReal && window.KiwiEnv.isReal()) return true;
      return !!JSON.parse(localStorage.getItem('kiwiPairedVenue') || 'null');
    } catch (_) { return false; }
  }

  /* ── la synchro ───────────────────────────────────────────────────────────
   * Tout en parallèle : ces quatre appels ne dépendent pas les uns des autres,
   * et le commerçant attend devant l'écran. Aucun ne peut faire échouer le
   * bouton — chacun se rabat sur « je n'ai rien appris ». */
  var busy = null;

  function run() {
    if (busy) return busy;                     // double tap = un seul aller-retour
    if (!real()) {
      return Promise.resolve({ real: false, reached: false, changed: [], orders: -1 });
    }

    var changed = [];
    /* `label` nul = l'appel compte pour joindre le serveur, mais n'a rien à
     * annoncer. La config répond « oui je t'ai répondu », pas « quelque chose a
     * changé » : l'afficher ferait dire « modules à jour » à chaque appui, ce
     * qui ne veut plus rien dire au bout de trois fois. */
    function task(label, fn) {
      var p;
      try { p = fn(); } catch (_) { return Promise.resolve(null); }
      if (!p || typeof p.then !== 'function') return Promise.resolve(null);
      return p.then(function (v) { if (v === true && label) changed.push(label); return v; })
        .catch(function () { return null; });
    }

    var cat = window.KiwiBoutiqueCatalog;
    var doc = window.KiwiCloudDoc;
    var box = window.KiwiOrderInbox;
    var cfg = window.KiwiConfig;
    /* La carte du restaurant/café. Elle ne passe pas par KiwiCloudDoc — elle se
     * lit sur /api/menu, publique — donc pullAll() ne la ramène pas et
     * « Rafraîchir » la laissait derrière. C'est pourtant le geste exact du
     * serveur à qui le patron vient de dire « j'ai changé le prix du tajine ». */
    var carte = window.KiwiCaisseCarte;

    busy = Promise.all([
      cat && cat.sync ? task('inventaire', function () { return cat.sync(); }) : null,
      doc && doc.pullAll ? task('documents', function () { return doc.pullAll(); }) : null,
      carte && carte.fetch ? task('carte', function () { return carte.fetch(); }) : null,
      cfg && cfg.reload ? task(null, function () { return cfg.reload(); }) : null,
      box && box.refresh
        ? Promise.resolve().then(function () { return box.refresh(); }).catch(function () { return -1; })
        : Promise.resolve(-1),
    ]).then(function (r) {
      /* Les rangs suivent l'ordre du tableau ci-dessus : inventaire, documents,
       * carte, config, commandes. Toute insertion les décale — c'est pour ça
       * qu'ils sont nommés ici plutôt que lus à la volée plus bas. */
      var configOk = r[3] === true;
      var orders = typeof r[4] === 'number' ? r[4] : -1;
      /* « Joint » veut dire : une réponse est revenue du serveur. /api/config
       * répond à toute caisse appairée, la file de commandes seulement si le
       * module est allumé — d'où les deux, plus toute donnée qui a bougé. */
      var reached = configOk || orders >= 0 || changed.length > 0;
      repaint();
      return { real: true, reached: reached, changed: changed, orders: orders };
    }).then(function (out) { busy = null; return out; },
      function () { busy = null; return { real: true, reached: false, changed: [], orders: -1 }; });

    return busy;
  }

  /* Le métier ouvert se redessine avec ce qui vient d'arriver. onShow() est
   * déjà le geste « on revient sur cet écran » que chaque module sait faire ;
   * le catalogue, lui, prévient ses abonnés tout seul en fusionnant. */
  function repaint() {
    try {
      var d = window.KiwiPosDispatch;
      if (d && d.repaint) d.repaint();
    } catch (_) {}
  }

  /* La phrase, séparée de son affichage : c'est LA règle d'honnêteté du bouton,
   * et une fonction pure se laisse vérifier (tools/caisse-refresh-test.js).
   * « Déjà à jour » est la seule sortie qui affirme quelque chose sur le monde ;
   * elle ne doit sortir d'ici que derrière `reached`. */
  function message(out) {
    if (!out || !out.real) return "Démo locale, il n'y a pas de serveur à interroger";
    if (!out.reached) return "Serveur injoignable, l'écran garde ce que sait cette tablette";
    var bits = [];
    var ch = out.changed || [];
    if (ch.length) bits.push(ch.join(', ') + ' à jour');
    if (out.orders > 0) bits.push(out.orders + (out.orders > 1 ? ' nouvelles commandes' : ' nouvelle commande'));
    return bits.length ? 'Rafraîchi · ' + bits.join(' · ') : 'Déjà à jour';
  }

  /* ── le bouton ──────────────────────────────────────────────────────────── */
  function reloadPage() {
    window.location.reload();
  }

  function click(btn) {
    if (btn.disabled) return;
    btn.disabled = true;
    btn.classList.add('is-busy');
    reloadPage();
  }

  function make(className, label) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = (className ? className + ' ' : '') + 'kx-refresh';
    b.title = 'Recharger la caisse';
    b.setAttribute('aria-label', 'Recharger la page de la caisse');
    b.innerHTML = ICON + '<span>' + label + '</span>';
    b.addEventListener('click', function () { click(b); });
    return b;
  }

  /* Monte le bouton dans un écran de caisse. Deux formes rencontrées :
   *   · les métiers (pos-*.js) et le pressing : un pied de rail où vit
   *     « Verrouiller » (#xx-lock). On se pose juste avant, en copiant sa
   *     classe — donc au même format, quel que soit le préfixe du métier.
   *   · le restaurant : .quick-actions et ses .qa-btn.
   * Idempotent : rappeler mount() sur un écran déjà servi ne fait rien. */
  function mount(root) {
    if (!root || root.querySelector('.kx-refresh')) return null;
    css();

    var lock = root.querySelector('button[id$="-lock"]');
    if (lock && lock.parentNode) {
      var cls = (lock.className || '').replace(/\bkx-refresh\b/g, '').trim();
      var b = make(cls, 'Rafraîchir');
      lock.parentNode.insertBefore(b, lock);
      return b;
    }

    var qa = root.querySelector('.quick-actions');
    if (qa) {
      var q = make('qa-btn ghost', 'Rafraîchir');
      qa.insertBefore(q, qa.firstChild);
      return q;
    }
    return null;
  }

  window.KiwiCaisseRefresh = { run: run, mount: mount, message: message, reload: reloadPage };
})();
