/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · RELAIS CUISINE  (assets/kitchen-relay.js)
 * ---------------------------------------------------------------------------
 * Le bon de commande quitte enfin l'appareil.
 *
 * Jusqu'ici « Envoyer en cuisine » poussait le bon dans un tableau JavaScript
 * de la page de la caisse et l'imprimait. Deux conséquences que le comptoir a
 * fini par remonter mot pour mot :
 *   · une tablette posée en cuisine ne recevait RIEN de ce qu'un serveur venait
 *     de saisir — l'écran cuisine de la caisse et celui de la cuisine sont deux
 *     pages, dans deux navigateurs, sur deux appareils, qui ne partagent ni
 *     mémoire ni stockage ;
 *   · sans imprimante thermique, il n'existait aucun chemin du tout. Or on ne
 *     vend PAS d'imprimante en cuisine : la tablette EST le passe.
 *
 * Ce fichier est le transport, et rien d'autre. Il ne dessine pas, il ne décide
 * pas : il pose un bon sur le serveur, relit la file, et fait avancer un état.
 * Les deux pages qui l'utilisent — kiwi-caisse.html (elle écrit) et
 * kiwi-cuisine.html (elle lit et bumpe) — parlent donc exactement le même
 * protocole, sur le même endpoint gardé que le reste du site.
 *
 * ── Fail-soft, sérieusement ────────────────────────────────────────────────
 * Une cuisine tourne dans un sous-sol, derrière un mur porteur, sur le wifi du
 * voisin. Un bon qui se perd parce que le réseau a hoqueté trois secondes est
 * un plat qui ne sort pas. Tout envoi qui échoue est donc mis en file dans
 * localStorage et rejoué — avec le MÊME identifiant, que la caisse mint
 * elle-même avant d'appeler, pour que le rejeu ne puisse jamais faire sortir le
 * plat deux fois (le serveur est idempotent sur cet identifiant).
 *
 * Sans backend déployé du tout, rien ne casse : la caisse se comporte
 * exactement comme avant, ses bons vivent dans sa page, et la file d'envoi
 * s'écoulera au premier déploiement.
 *
 * Load order : après caisse-pairing.js (il lit le magasin appairé).
 * ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var QKEY = 'kiwiKitchenQueue';
  var MAX_QUEUED = 60;
  var STALE_MS = 6 * 60 * 60 * 1000;   // un bon de ce matin ne part plus ce soir
  var RETRY_MS = 15000;
  var retryTimer = null;
  /* Le serveur n'est pas déployé (404/405 sur la route) : on garde les bons —
   * un déploiement peut arriver dans l'heure — mais on cesse de marteler. */
  var backendAbsent = false;

  function ls(k) { try { return localStorage.getItem(k); } catch (_) { return null; } }
  function put(k, v) { try { localStorage.setItem(k, v); } catch (_) {} }

  function paired() {
    try { return !!(window.KiwiCaissePairing && KiwiCaissePairing.isPaired && KiwiCaissePairing.isPaired()); }
    catch (_) { return false; }
  }
  /* Le commerçant de CET appareil. La caisse le tient de son appairage ; la
   * tablette cuisine, du sien. Jamais d'un paramètre d'URL : le serveur le
   * re-dérive de toute façon du cookie de caisse, et le lire ici ne servirait
   * qu'à interroger la file d'un autre commerce et à se faire refuser. */
  function merchant() {
    var m = ls('kiwiLiveMerchant') || '';
    if (!m) return '';
    /* `kiwiPaired` lu directement, et pas seulement via KiwiCaissePairing : la
     * tablette cuisine (kiwi-cuisine.html) ne charge PAS le module d'appairage
     * de la caisse — elle rachète son code toute seule et écrit les mêmes clés.
     * Passer par le module aurait rendu ce fichier inutilisable sur la seule
     * page pour laquelle il a été écrit. */
    return (ls('kiwiPaired') === '1' || paired()) ? m : '';
  }

  /* L'identifiant du bon, décidé PAR L'APPELANT et avant l'appel. C'est ce qui
   * rend le rejeu sûr : deux tentatives du même envoi portent le même
   * identifiant, donc la seconde est reconnue comme un renvoi et non comme une
   * deuxième commande. Forme imposée par le serveur : ord- puis 6 à 48
   * caractères parmi [a-z0-9-]. */
  var ALPHA = 'abcdefghijklmnopqrstuvwxyz0123456789';
  function newId() {
    var r = '';
    try {
      var b = new Uint8Array(8);
      crypto.getRandomValues(b);
      for (var i = 0; i < b.length; i++) r += ALPHA[b[i] % ALPHA.length];
    } catch (_) {
      for (var j = 0; j < 8; j++) r += ALPHA[Math.floor(Math.random() * ALPHA.length)];
    }
    return 'ord-' + Date.now().toString(36) + '-' + r;
  }

  /* ── La file de secours ─────────────────────────────────────────────────── */
  function readQ() {
    try { var q = JSON.parse(ls(QKEY) || '[]'); return Array.isArray(q) ? q : []; }
    catch (_) { return []; }
  }
  function writeQ(q) { put(QKEY, JSON.stringify(q.slice(-MAX_QUEUED))); }
  function enqueue(body) {
    var q = readQ().filter(function (x) { return x && x.create && x.create.id !== body.create.id; });
    q.push({ merchant: body.merchant, create: body.create, at: Date.now() });
    writeQ(q);
    schedule();
  }
  function dequeue(id) {
    writeQ(readQ().filter(function (x) { return !(x && x.create && x.create.id === id); }));
  }
  function pending() { return readQ().length; }

  function schedule() {
    if (retryTimer) return;
    retryTimer = setInterval(function () {
      var q = readQ();
      if (!q.length) { clearInterval(retryTimer); retryTimer = null; return; }
      var now = Date.now();
      /* Un bon vieux de six heures ne sert plus personne : le service est fini,
         le plat a été fait à la voix ou pas du tout. Le garder ferait sortir un
         tajine du matin au milieu du service du soir. */
      var fresh = q.filter(function (x) { return x && (now - (x.at || 0)) < STALE_MS; });
      if (fresh.length !== q.length) writeQ(fresh);
      if (!fresh.length) return;
      post(fresh[0], true);
    }, RETRY_MS);
  }

  /* ── L'envoi ────────────────────────────────────────────────────────────── */
  function post(body, isRetry) {
    return fetch('/api/order/queue', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ merchant: body.merchant, create: body.create }),
      cache: 'no-store',
    }).then(function (r) {
      if (r.status === 404 || r.status === 405 || r.status === 503) {
        backendAbsent = true;
        if (!isRetry) enqueue(body);
        return { ok: false, offline: true };
      }
      /* Un refus de FOND (bon vide, identifiant malformé, magasin interdit) ne
         se répare pas en réessayant. Le garder en file ferait cogner la caisse
         contre le même mur toutes les quinze secondes jusqu'à la fermeture. */
      if (r.status >= 400 && r.status < 500 && r.status !== 408 && r.status !== 429) {
        dequeue(body.create.id);
        return r.json().catch(function () { return { ok: false }; });
      }
      if (!r.ok) { if (!isRetry) enqueue(body); return { ok: false, retryLater: true }; }
      backendAbsent = false;
      dequeue(body.create.id);
      return r.json().catch(function () { return { ok: true }; });
    }).catch(function () {
      if (!isRetry) enqueue(body);
      return { ok: false, offline: true };
    });
  }

  /* Poser un bon. `ticket` = { id, mode, table, server, lines }.
   * Rend une promesse, mais l'appelant n'a AUCUNE raison de l'attendre : la
   * caisse doit rendre la main au serveur immédiatement — c'est la file de
   * secours, pas l'utilisateur, qui porte le réseau. */
  function send(ticket) {
    var m = merchant();
    if (!m || !ticket || !ticket.id) return Promise.resolve({ ok: false, skipped: true });
    var lines = (ticket.lines || []).filter(function (l) { return l && l.name; });
    if (!lines.length) return Promise.resolve({ ok: false, skipped: true });
    return post({
      merchant: m,
      create: {
        id: ticket.id,
        mode: ticket.mode === 'takeout' ? 'takeout' : 'table',
        table: ticket.table || '',
        server: ticket.server || '',
        lines: lines,
      },
    }, false);
  }

  /* Faire avancer un bon (prête, servie). Même route, même garde. */
  function bump(id, status) {
    var m = merchant();
    if (!m || !id) return Promise.resolve(null);
    return fetch('/api/order/queue', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ merchant: m, id: id, status: status }),
      cache: 'no-store',
    }).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; });
  }

  /* Relever la file. `role: 'kitchen'` dit au serveur de NE PAS compter ce
     sondage comme une preuve que le comptoir est allumé — voir queue.js. */
  function pull(since, role) {
    var m = merchant();
    if (!m) return Promise.resolve(null);
    var u = '/api/order/queue?merchant=' + encodeURIComponent(m) + '&since=' + (since || 0)
      + (role ? '&role=' + encodeURIComponent(role) : '');
    return fetch(u, { headers: { Accept: 'application/json' }, cache: 'no-store' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .catch(function () { return null; });
  }

  // Le réseau revient : on vide la file sans attendre le prochain quart d'heure.
  window.addEventListener('online', function () {
    backendAbsent = false;
    var q = readQ();
    if (q.length) post(q[0], true);
  });
  if (readQ().length) schedule();

  window.KiwiKitchenRelay = {
    merchant: merchant,
    newId: newId,
    send: send,
    bump: bump,
    pull: pull,
    pending: pending,
    reachable: function () { return !backendAbsent; },
  };
})();
