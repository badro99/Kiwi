/* KiwiLive — la socket qui remplace l'attente, pas le sondage.
 *
 * Ce que ce fichier NE fait PAS, et c'est le point le plus important : il ne
 * transporte aucune donnée et ne met à jour aucun écran. Il reçoit « ça a
 * bougé » et appelle la fonction de rafraîchissement que la page utilisait
 * déjà — pollEmployeeFloor() sur la caisse, pollServiceSync() sur le serveur.
 * Le chemin des données, ses droits et ses garde-fous restent identiques. On
 * n'a supprimé que le temps mort entre le changement et la relecture.
 *
 * D'où le repli, qui est gratuit : sans socket, les setInterval d'origine
 * tournent comme avant. La socket ne fait qu'AJOUTER des relectures plus tôt.
 * Binding absent, réseau coupé, proxy d'entreprise qui mange le WebSocket : la
 * caisse continue de fonctionner exactement comme aujourd'hui.
 *
 * KiwiLiveSocket.live() dit si une socket est réellement ouverte. La caisse s'en sert
 * pour espacer son sondage d'une seconde — et seulement tant que la socket
 * tient. À la première coupure, elle revient à la seconde toute seule, sans
 * qu'on ait rien à défaire.
 */
(function () {
  'use strict';

  /* On regroupe les pokes. Une caisse qui publie l'état de six tables déclenche
   * six écritures et donc six pokes ; il n'en faut qu'une relecture. */
  var COALESCE_MS = 400;

  /* Trois ouvertures ratées d'affilée et on abandonne DÉFINITIVEMENT pour la
   * durée de la page. Un WebSocket ne peut pas lire le code HTTP du refus :
   * binding absent (503), droits refusés (403) et proxy hostile se présentent
   * tous comme une fermeture immédiate. Sans ce compteur, une caisse chez un
   * commerçant où la fonctionnalité n'est pas déployée réessaierait toute la
   * journée. */
  var MAX_COLD_FAILURES = 3;

  /* Reconnexion — seulement après une socket qui avait bien vécu. */
  var BACKOFF = [2000, 5000, 15000, 30000];

  /* Cloudflare coupe une socket inactive. On envoie un battement bien avant. */
  var PING_MS = 50000;

  var sock = null;
  var opened = false;      // socket effectivement ouverte à l'instant
  var everOpened = false;  // au moins une ouverture réussie depuis le début
  var coldFailures = 0;
  var gaveUp = false;
  var attempt = 0;
  var subs = [];
  var coalesceTimer = null;
  var pingTimer = null;
  var retryTimer = null;
  var cfg = null;

  function notify() {
    coalesceTimer = null;
    for (var i = 0; i < subs.length; i++) {
      try { subs[i](); } catch (_) { /* un abonné qui casse n'en bloque pas d'autres */ }
    }
  }

  function schedule() {
    if (coalesceTimer) return;
    coalesceTimer = setTimeout(notify, COALESCE_MS);
  }

  function cleanup() {
    if (pingTimer) { clearInterval(pingTimer); pingTimer = null; }
    opened = false;
    sock = null;
  }

  function retry() {
    if (gaveUp || retryTimer || !cfg) return;
    var wait = BACKOFF[Math.min(attempt, BACKOFF.length - 1)];
    attempt++;
    retryTimer = setTimeout(function () { retryTimer = null; open(); }, wait);
  }

  function open() {
    if (gaveUp || sock || !cfg) return;
    if (typeof WebSocket === 'undefined') { gaveUp = true; return; }

    var proto = location.protocol === 'https:' ? 'wss://' : 'ws://';
    var url = proto + location.host + '/api/live/socket'
      + '?merchant=' + encodeURIComponent(cfg.merchant)
      + '&role=' + encodeURIComponent(cfg.role);

    var ws;
    try { ws = new WebSocket(url); } catch (_) { gaveUp = true; return; }
    sock = ws;

    ws.onopen = function () {
      opened = true;
      everOpened = true;
      coldFailures = 0;
      attempt = 0;
      pingTimer = setInterval(function () {
        try { ws.send('ping'); } catch (_) {}
      }, PING_MS);
      /* Une socket qui vient de s'ouvrir a pu manquer des changements pendant
       * qu'elle était absente. On relit une fois, tout de suite. */
      schedule();
    };

    ws.onmessage = function (ev) {
      if (ev.data === 'pong') return;
      schedule();
    };

    ws.onclose = function () {
      var wasOpen = opened;
      cleanup();
      if (wasOpen || everOpened) { retry(); return; }
      /* Fermée sans jamais s'être ouverte : refus, pas panne. */
      coldFailures++;
      if (coldFailures >= MAX_COLD_FAILURES) { gaveUp = true; return; }
      retry();
    };

    ws.onerror = function () { /* onclose suit toujours */ };
  }

  /* Keep the wake-up socket separate from assets/live-link.js. That module
   * deliberately owns `window.KiwiLive` for the durable sales ledger. Sharing
   * the same name made whichever deferred script ran last erase the other's
   * API; in caisse that killed the repeating table poll after its first tick. */
  window.KiwiLiveSocket = {
    /* Abonne fn aux changements du commerçant. Le premier appel ouvre la
     * socket ; les suivants ne font qu'ajouter un abonné. Un changement de
     * commerçant (caisse ré-appairée) rouvre proprement. */
    on: function (merchant, role, fn) {
      if (!merchant || typeof fn !== 'function') return;
      var next = { merchant: String(merchant), role: String(role || '') };
      if (cfg && (cfg.merchant !== next.merchant || cfg.role !== next.role)) this.stop();
      cfg = next;
      if (subs.indexOf(fn) === -1) subs.push(fn);
      open();
    },

    /* true seulement tant qu'une socket est réellement ouverte. Sert aux pages
     * qui veulent espacer leur sondage — et le reprendre dès la coupure. */
    live: function () { return !!opened; },

    stop: function () {
      if (retryTimer) { clearTimeout(retryTimer); retryTimer = null; }
      if (coalesceTimer) { clearTimeout(coalesceTimer); coalesceTimer = null; }
      if (sock) { try { sock.close(1000); } catch (_) {} }
      cleanup();
      subs = [];
      cfg = null;
      attempt = 0;
      coldFailures = 0;
      everOpened = false;
      gaveUp = false;
    },
  };
})();
