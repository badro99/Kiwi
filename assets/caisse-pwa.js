/* Kiwi Caisse — PWA registration, install affordance, offline reflection. */
(function () {
  'use strict';
  // App native (Capacitor) : pas de service worker ni de bouton « Installer » —
  // le bundle embarqué est versionné par la release (docs/roadmaps/KIWI_APP_PLAN.md §1.4).
  if (window.Capacitor && typeof window.Capacitor.isNativePlatform === 'function' && window.Capacitor.isNativePlatform()) return;
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('/kiwi-sw.js?v=468').then(function (reg) {
        try { reg.update(); } catch (_) {}
        if (window.KiwiPWAUpdate) window.KiwiPWAUpdate.watch(reg);
      }).catch(function () {});
    });
  }

  var deferred = null;
  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault(); deferred = e;
    showInstall();
  });

  /* Les deux pastilles de ce fichier flottaient dans les coins bas et se
     posaient sur du contenu : « Installer la caisse » (right:16/bottom:16)
     atterrissait pile sur le chip carnet de clients (#kcb-chip, right:18/
     bottom:18) et l'état réseau (left:12/bottom:12) recouvrait la ligne
     « Sortir » du pied de rail. Elles vivent maintenant DANS ce pied
     (.quick-actions) : elles prennent leur propre place au lieu de flotter
     au-dessus de quelque chose. Repli flottant seulement si le pied n'existe
     pas — et alors au-dessus de la pile de chips établie (18 / 82 / 146). */
  function railFoot() { return document.querySelector('.quick-actions'); }

  function showInstall() {
    if (document.getElementById('kiwi-install')) return;
    var foot = railFoot();
    var b = document.createElement('button');
    b.id = 'kiwi-install';
    b.type = 'button';
    b.title = 'Installer la caisse sur cet appareil';
    if (foot) {
      b.className = 'qa-btn ghost';
      b.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
        'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
        '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/>' +
        '<line x1="12" y1="15" x2="12" y2="3"/></svg><span>Installer la caisse</span>';
    } else {
      b.textContent = 'Installer la caisse';
      b.style.cssText = 'position:fixed;right:18px;bottom:146px;z-index:9998;padding:12px 18px;' +
        'border:0;border-radius:12px;background:#0B6E4F;color:#F7F5F0;font:600 14px/1 "Inter Tight",system-ui;' +
        'box-shadow:0 8px 24px -8px rgba(11,110,79,.5);cursor:pointer';
    }
    b.addEventListener('click', function () {
      if (!deferred) return;
      deferred.prompt();
      deferred.userChoice.finally(function () { deferred = null; b.remove(); });
    });
    /* En tête du pied : c'est un réglage d'appareil, comme « Mode nuit » et
       « Plein écran » — et jamais entre « Fin d'service » et « Sortir ». */
    if (foot) foot.insertBefore(b, foot.firstChild); else document.body.appendChild(b);
  }
  window.addEventListener('appinstalled', function () {
    var b = document.getElementById('kiwi-install'); if (b) b.remove();
  });

  // Offline/online + real server queue reflection — visible enough to act on.
  var refreshingStatus = false;
  function status() {
    try {
      if (!refreshingStatus && window.KiwiLive?.refreshQueue) {
        refreshingStatus = true;
        Promise.resolve(window.KiwiLive.refreshQueue()).finally(function () { refreshingStatus = false; });
      }
    } catch (_) { refreshingStatus = false; }
    var d = document.getElementById('kiwi-net') || (function () {
      var s = document.createElement('button'); s.id = 'kiwi-net'; s.type = 'button';
      s.setAttribute('aria-live', 'polite');
      var host = railFoot();
      if (host) {
        /* Dernière ligne du pied, sous « Sortir » : une ligne d'état, pas une
           pastille posée par-dessus. Pastille de couleur + libellé. */
        s.style.cssText = 'width:100%;display:grid;grid-template-columns:8px minmax(0,1fr);align-items:center;' +
          'gap:10px;padding:10px 12px;border:1px solid transparent;border-radius:14px;text-align:left;' +
          'font-family:"Inter Tight",system-ui;background:transparent;transition:background .24s,border-color .24s,opacity .2s;cursor:pointer';
        s.innerHTML = '<i class="kn-dot" style="width:8px;height:8px;flex:0 0 8px;border-radius:50%"></i>' +
          '<span style="min-width:0"><b class="kn-txt" style="display:block;font-size:12px;line-height:1.2"></b>' +
          '<small class="kn-detail" style="display:block;margin-top:3px;font-size:10px;line-height:1.25;font-weight:500;opacity:.7"></small></span>';
        host.appendChild(s);
      } else {
        s.style.cssText = 'position:fixed;right:18px;bottom:210px;z-index:9998;padding:7px 10px;border-radius:999px;' +
          'font:600 11px/1.2 system-ui;color:white;box-shadow:0 4px 14px rgba(0,0,0,.18);pointer-events:none';
        document.body.appendChild(s);
      }
      return s;
    })();
    var q = { pending: 0, blocked: 0, storageError: false };
    try { if (window.KiwiLive?.queueStatus) q = window.KiwiLive.queueStatus(); } catch (_) {}
    var tone, label, detail;
    if (q.storageError || q.blocked) {
      tone = '#9F3028';
      label = q.storageError ? 'Protection locale à vérifier' : q.blocked + ' vente' + (q.blocked > 1 ? 's' : '') + ' conservée' + (q.blocked > 1 ? 's' : '');
      detail = 'Touchez pour relancer · rien n’est supprimé';
    } else if (!navigator.onLine) {
      tone = '#B85245';
      label = 'Hors ligne' + (q.pending ? ' · ' + q.pending + ' en attente' : '');
      detail = q.pending ? 'Ventes protégées sur cet appareil' : 'La caisse continue normalement';
    } else if (q.pending) {
      tone = '#A56A16';
      label = q.pending + ' vente' + (q.pending > 1 ? 's' : '') + ' à synchroniser';
      detail = q.sending ? 'Envoi sécurisé en cours' : 'Touchez pour envoyer maintenant';
    } else {
      tone = '#287B55';
      label = 'Synchronisé';
      detail = q.engine === 'indexeddb' ? 'Ventes protégées hors ligne' : 'En ligne';
    }
    var dot = d.querySelector('.kn-dot'), txt = d.querySelector('.kn-txt'), sub = d.querySelector('.kn-detail');
    if (dot && txt) {
      /* Nominal : le pied reste calme — pastille verte, libellé discret. Les
         trois états anormaux réclament une action, donc la ligne se peint. */
      var nominal = tone === '#287B55';
      dot.style.background = tone;
      d.style.background = nominal ? 'transparent' : tone;
      d.style.borderColor = nominal ? 'transparent' : 'rgba(255,255,255,.14)';
      d.style.color = nominal ? '#6a6e6c' : '#F7F5F0';
      d.style.opacity = nominal ? '.78' : '1';
      txt.textContent = label;
      if (sub) sub.textContent = detail;
    } else {
      d.style.background = tone;
      d.textContent = label;
    }
    d.title = label + ' · ' + detail;
    d.onclick = function () {
      try { if (window.KiwiLive && window.KiwiLive.flush) window.KiwiLive.flush(true); } catch (_) {}
      status();
    };
  }
  window.addEventListener('online', status);
  window.addEventListener('offline', status);
  window.addEventListener('kiwi:sale-queue', status);
  window.addEventListener('kiwi:outbox', status);
  window.setInterval(status, 5000);

  /* The 14 vertical POS screens originally shipped a clickable "simulate
     outage" control backed by an in-memory boolean. In production that boolean
     did not follow navigator.onLine, so a real Wi-Fi loss still looked online
     to payment guards. Keep manual simulation for localhost demos only; on a
     real/paired till, drive every mounted vertical from the browser signal. */
  function realTill() {
    try {
      return !!window.KiwiEnv?.isReal?.() || !!window.KiwiPlatform?.isPaired?.() || !!JSON.parse(localStorage.getItem('kiwiPairedVenue') || 'null');
    } catch (_) { return false; }
  }
  function netButtons() {
    return Array.prototype.slice.call(document.querySelectorAll('button[title="Simuler une coupure réseau"], button[data-kiwi-real-net]'));
  }
  function syncVerticalNetwork() {
    if (!realTill()) return;
    var shouldBeOffline = !navigator.onLine;
    netButtons().forEach(function (b) {
      b.dataset.kiwiRealNet = '1';
      b.title = shouldBeOffline ? 'Connexion indisponible' : 'Connexion active';
      b.setAttribute('aria-label', b.title);
      b.style.cursor = 'default';
      if (b.classList.contains('is-off') === shouldBeOffline) return;
      b.dataset.kiwiNetworkSync = '1';
      try { b.click(); } catch (_) {}
      delete b.dataset.kiwiNetworkSync;
    });
  }
  document.addEventListener('click', function (e) {
    var b = e.target && e.target.closest && e.target.closest('button[title="Simuler une coupure réseau"], button[data-kiwi-real-net]');
    if (!b || !realTill() || b.dataset.kiwiNetworkSync === '1') return;
    e.preventDefault();
    e.stopImmediatePropagation();
    syncVerticalNetwork();
  }, true);
  window.addEventListener('online', syncVerticalNetwork);
  window.addEventListener('offline', syncVerticalNetwork);
  function watchVerticals() {
    syncVerticalNetwork();
    try { new MutationObserver(syncVerticalNetwork).observe(document.body, { childList: true, subtree: true }); } catch (_) {}
  }
  if (document.readyState !== 'loading') watchVerticals();
  else document.addEventListener('DOMContentLoaded', watchVerticals);

  window.KiwiNetworkState = { sync: syncVerticalNetwork, isRealTill: realTill };
  if (document.readyState !== 'loading') status();
  else document.addEventListener('DOMContentLoaded', status);
})();
