/* Kiwi Operations — one honest browser contract for operational work.
 *
 * Server-confirmed commands are tenant scoped and idempotent.  Offline work is
 * retained in KiwiOffline and retried with its stable command ID.  Provider
 * absence is surfaced as `blocked`; a UI must never translate it to success.
 */
(function () {
  'use strict';
  var K = window.KiwiPlatform;
  if (!K || typeof fetch !== 'function') return;
  var CHANNEL = 'operations';
  var flushing = false;
  var listeners = new Set();

  function clean(value, max) { return String(value == null ? '' : value).trim().slice(0, max || 120); }
  function token(prefix) {
    try { return (prefix || 'op') + ':' + crypto.randomUUID(); }
    catch (_) { return (prefix || 'op') + ':' + Date.now().toString(36) + Math.random().toString(36).slice(2); }
  }
  /* LE RÔLE, DEMANDÉ AU SERVEUR.  K.access.role({}) ne lit que kiwiStaffRole,
     que rien n'écrit : le propriétaire lui-même était donc « employee » ici, et
     allowed() refusait bons de commande, paie, messages, actions de l'assistant
     et alarmes de parc avant tout appel.  Le serveur sait déjà qui appelle
     (session propriétaire, opérateur, employé, caisse) : on le lui demande une
     fois par établissement et on lit sa réponse.  Ce n'est qu'un confort
     d'affichage — chaque commande est rejugée côté Worker par mayCommand. */
  var actor = null;            /* { merchant, kind, role } confirmé par le serveur */
  var actorPending = null;
  var actorMiss = { merchant: '', at: 0 };   /* échec récent : pas de rafale sur une démo sans serveur */
  function actorFresh() { return !!(actor && actor.merchant === K.tenant()); }
  function whoami(force) {
    var merchant = K.tenant();
    if (!force && actorFresh()) return Promise.resolve(actor);
    if (!force && actorPending && actorPending.merchant === merchant) return actorPending.promise;
    if (!force && actorMiss.merchant === merchant && Date.now() - actorMiss.at < 60000) return Promise.resolve(null);
    var promise = fetch('/api/operations?view=whoami&merchant=' + encodeURIComponent(merchant), {
      credentials: 'same-origin', cache: 'no-store', headers: { Accept: 'application/json' },
    }).then(responseJson).then(function (data) {
      /* La réponse doit concerner l'établissement encore ouvert : une vue
         opérateur qui a changé de client entre-temps relancera sa question. */
      if (K.tenant() !== merchant) return null;
      /* Le serveur répond pour le magasin que la session lui prouve, pas
         forcément celui demandé : une réponse sur un autre magasin ne confère
         aucun rôle sur celui-ci (repli sur le rôle local, comme avant). */
      var same = clean(data.merchant, 120) === merchant;
      actor = { merchant: merchant, kind: same ? clean(data.kind, 20) : '', role: same ? clean(data.role, 40).toLowerCase() : '' };
      signal({ type: 'actor', actor: actor });
      return actor;
    }).catch(function () { actorMiss = { merchant: merchant, at: Date.now() }; return null; }).then(function (value) {
      if (actorPending && actorPending.promise === promise) actorPending = null;
      return value;
    });
    actorPending = { merchant: merchant, promise: promise };
    return promise;
  }
  function subject() {
    /* Magasin changé (vue opérateur, appairage) : on relance la question en
       arrière-plan ; d'ici là, l'ancien rôle ne vaut pas pour ce magasin-ci. */
    if (!actorFresh()) setTimeout(function () { whoami().catch(function () {}); }, 0);
    var role = actorFresh() && actor.role ? actor.role : K.access.role({});
    return { role: role, id: clean(window.__kiwiStaffId || '', 80) };
  }
  /* L'identité de l'appareil.  Sans jeton stable, un parc de six caisses
     s'effondre à trois lignes — une par type d'application — et « santé des
     appareils » ne veut plus rien dire.  Le jeton ne dit rien de la personne
     qui tient l'appareil : il ne sert qu'à reconnaître la machine. */
  function deviceBase() {
    var stored = '';
    try { stored = clean(localStorage.getItem('kiwiDeviceId'), 80); } catch (_) {}
    if (stored) return stored;
    var minted = token('dev');
    try { localStorage.setItem('kiwiDeviceId', minted); } catch (_) {}
    return minted;
  }
  /* UNE LIGNE PAR APPLICATION, PAS PAR NAVIGATEUR.  La caisse et le tableau de
     bord ouverts dans le même navigateur (le geste « Ouvrir la caisse sur cet
     appareil », celui de tout petit commerce) lisent le même localStorage, donc
     le même identifiant.  Résultat mesuré : une seule ligne dont `app` basculait
     à chaque battement, et la clé d'idempotence du battement (appareil + tranche
     de cinq minutes) faisait refuser celui de la caisse dès que le tableau de
     bord avait battu le premier — la caisse n'apparaissait jamais comme caisse.
     La caisse garde l'identifiant historique (sa ligne existe déjà côté
     serveur) ; le tableau de bord, qui est une console et non un équipement,
     prend un suffixe. */
  function deviceId() {
    var base = deviceBase();
    return appName() === 'dashboard' ? clean(base + ':web', 80) : base;
  }
  function appName() {
    if (location.pathname.indexOf('kiwi-caisse') >= 0) return 'caisse';
    if (location.pathname.indexOf('serveur') >= 0) return 'serveur';
    return 'dashboard';
  }
  /* Ce que l'appareil sait de lui-même, dit sans rien inventer : le système et le
     navigateur lus dans l'agent utilisateur, et pour une caisse les six derniers
     caractères de son identifiant de terminal, ceux que la caisse affiche en
     haut de l'écran (« ID · 3CC8E2 ») — c'est ce qui permet au patron de
     reconnaître la ligne.  Jamais l'identifiant technique de l'appareil. */
  function platformLabel() {
    var ua = '', touch = 0;
    try { ua = String(navigator.userAgent || ''); touch = Number(navigator.maxTouchPoints) || 0; } catch (_) {}
    var os = /iPad/.test(ua) || (/Macintosh/.test(ua) && touch > 1) ? 'iPad'
      : /iPhone/.test(ua) ? 'iPhone' : /Android/.test(ua) ? 'Android' : /Windows/.test(ua) ? 'Windows'
      : /Mac OS X|Macintosh/.test(ua) ? 'Mac' : /Linux/.test(ua) ? 'Linux' : '';
    var browser = /Edg\//.test(ua) ? 'Edge' : /Firefox\/|FxiOS/.test(ua) ? 'Firefox'
      : /Chrome\/|CriOS/.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : '';
    return [os, browser].filter(Boolean).join(' · ');
  }
  function deviceLabel() {
    var parts = [platformLabel()];
    if (appName() === 'caisse') {
      var terminal = '';
      try { terminal = clean(localStorage.getItem('kiwi:caisse:terminal-id:v1'), 96); } catch (_) {}
      if (terminal) parts.push('ID ' + terminal.slice(-6).toUpperCase());
    }
    return clean(parts.filter(Boolean).join(' · '), 80);
  }
  function printerState() {
    var P = window.KiwiPrinter;
    return {
      configured: !!(P && P.isConfigured && P.isConfigured()),
      connected: !!(P && P.isConnected && P.isConnected()),
    };
  }
  /* `force` : un battement qui rapporte un changement (le ticket d'essai vient
     de réussir ou d'échouer) ne doit pas partager la clé de la tranche de cinq
     minutes — le serveur le prendrait pour un doublon du battement du
     chargement et garderait l'ancien état de l'imprimante. */
  var lastBeat = new Map();
  function beat(force) {
    var poll = window.KiwiPoll;
    var mode = poll ? poll.mode() : 'live';
    var tenant = K.tenant(), now = Date.now();
    if (mode === 'off' || (poll && poll.retryAfter && poll.retryAfter() > 0) || (force !== true && (document.hidden
        || (mode === 'quiet' && lastBeat.has(tenant) && now - lastBeat.get(tenant) < 600000)))) {
      return Promise.resolve({ ok: true, skipped: 'poll-policy' });
    }
    lastBeat.set(tenant, now);
    var printer = printerState();
    var sync = null, stock = null;
    if (appName() === 'caisse') {
      try {
        var q = window.KiwiLive && KiwiLive.queueStatus && KiwiLive.queueStatus();
        if (q) sync = { blockedEntries: (q.blockedEntries || []).slice(0,200), pending: Number(q.pending) || 0, blocked: Number(q.blocked) || 0,
          total: Number(q.total) || 0, oldestPendingAt: Number(q.oldestPendingAt) || 0,
          lastStatus: Number(q.lastStatus) || 0, lastError: clean(q.lastError, 96),
          lastAttemptAt: Number(q.lastAttemptAt) || 0,
          lastAcknowledgedAt: Number(q.lastAcknowledgedAt) || 0,
          storageError: !!q.storageError };
      } catch (_) {}
      /* La file de stock a sa propre route (/api/inventory/movements) et peut
         bloquer sans que la file des ventes ne bouge : on la rapporte aussi. */
      try {
        var inv = window.KiwiInventory && KiwiInventory.status && KiwiInventory.isReal && KiwiInventory.isReal() && KiwiInventory.status();
        if (inv) stock = { pending: Number(inv.pending) || 0, refused: Number(inv.refused) || 0,
          oldestPendingAt: Number(inv.oldestPendingAt) || 0,
          refusedEntries: (inv.refusedEntries || []).slice(-10).map(function (r) {
            return { id: clean(r.id, 80), itemId: clean(r.itemId, 80), qty: Number(r.qty) || 0, reason: clean(r.reason, 32), why: clean(r.why, 40), ts: Number(r.ts) || 0 };
          }),
          lastStatus: Number(inv.lastStatus) || 0, lastError: clean(inv.lastError, 96),
          lastAttemptAt: Number(inv.lastAttemptAt) || 0, lastAcknowledgedAt: Number(inv.lastAcknowledgedAt) || 0,
          storageError: !!inv.storageError };
      } catch (_) {}
    }
    return create('device', 'heartbeat', {
      deviceId: deviceId(), app: appName(), label: deviceLabel(), at: Date.now(),
      online: navigator.onLine !== false, standalone: !!navigator.standalone,
      printerConfigured: printer.configured, printerConnected: printer.connected,
      sync: sync, stock: stock,
      /* Depuis quand cette page tourne, et depuis quand une mise à jour attend
         qu'on appuie sur l'avis : la console repère la caisse restée sur une
         ancienne version (Santos Store, 21 octobre). */
      loadedAt: pageLoadedAt(), updateReadyAt: updateReadyAt(),
    }, { idempotencyKey: 'heartbeat:' + (force === true ? 'now-' + Date.now() : Math.floor(Date.now() / 300000)) + ':' + deviceId() });
  }
  function pageLoadedAt() {
    try { var t = Math.round(performance.timeOrigin || 0); return t > 0 ? t : 0; } catch (_) { return 0; }
  }
  function updateReadyAt() {
    try { var U = window.KiwiPWAUpdate; return (U && U.readySince && Number(U.readySince())) || 0; } catch (_) { return 0; }
  }
  function needed(domain, action) {
    if (domain === 'device' && action === 'heartbeat') return ['read', 'device'];
    /* Imprimer un ticket d'essai, c'est réimprimer : une caissière teste sa
       propre imprimante.  Miroir du serveur — sans cette ligne le bouton se
       refuse ici alors que le Worker l'accepte. */
    if (domain === 'device' && action === 'test-print') return ['action', 'reprint'];
    /* Envoyer un message et régler par quel canal la maison écrit à ses
       clients sont deux droits distincts.  Miroir du serveur. */
    if (domain === 'notification' && action === 'set-preferences') return ['write', 'notification'];
    if (domain === 'notification') return ['action', 'message'];
    if (domain === 'procurement') return ['write', 'inventory'];
    /* Not write:planning — a manager plans shifts but is kept out of salary
       figures everywhere else in the product, and a payroll export is a list of
       salaries.  No role but owner/operator holds write:payroll. */
    if (domain === 'payroll') return ['write', 'payroll'];
    /* Rendre l'argent est un droit distinct d'émettre un lien ; relever l'état
       auprès du fournisseur reste une lecture.  Miroir du serveur. */
    if (domain === 'payment' && action === 'refund-link') return ['action', 'refund'];
    if (domain === 'payment' && action === 'settle-link') return ['read', 'payment'];
    /* Une action dictée à l'assistant coûte le droit que coûterait le même
       travail fait à la main. Miroir du serveur — `write:ai` n'appartient à
       aucun rôle, et le laisser en défaut cachait le bouton à tout le monde
       sauf au propriétaire. */
    if (domain === 'ai' && action === 'reprint') return ['action', 'reprint'];
    if (domain === 'ai' && action === 'stock-adjust') return ['write', 'inventory'];
    if (domain === 'ai' && action === 'message-customer') return ['action', 'message'];
    if (domain === 'ai' && action === 'create-po') return ['write', 'inventory'];
    if (domain === 'ai' && action === 'update-order-status') return ['write', 'orders'];
    return ['write', domain];
  }
  function allowed(domain, action) {
    /* A till or waiter may report only its own health. Receipt delivery keeps
       using Kiwi's receipt endpoint, which validates the sale; this generic
       command boundary must not let a paired device contact arbitrary people. */
    if (domain === 'device' && action === 'heartbeat') return true;
    var check = needed(domain, action);
    return K.access.can(subject(), check[0], check[1]);
  }
  async function responseJson(response) {
    var data = {}; try { data = await response.json(); } catch (_) {}
    if (!response.ok) {
      var error = new Error(data.error || 'operation-failed');
      error.code = data.error || ''; error.status = response.status; error.data = data;
      throw error;
    }
    return data;
  }
  async function send(command) {
    var span = K.telemetry.start('operation.send', { capability: command.domain, method: command.action, offline: navigator.onLine === false });
    try {
      var response = await fetch('/api/operations', {
        method: 'POST', credentials: 'same-origin', cache: 'no-store',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(command),
      });
      var data = await responseJson(response);
      span.end('success', { status: response.status });
      return data;
    } catch (error) {
      span.end(error && error.status ? 'http-error' : 'network-error', { status: error && error.status || 0 });
      throw error;
    }
  }
  async function enqueue(command) {
    var O = window.KiwiOffline;
    if (!O || !O.available || !O.available()) throw new Error('offline-storage-unavailable');
    await O.enqueue(CHANNEL, command.merchant, command, { id: command.id, createdAt: command.createdAt });
    signal({ type: 'queued', command: command });
    return { ok: true, offline: true, queued: true, command: { id: command.id, merchant: command.merchant, domain: command.domain, action: command.action, status: 'queued-offline' } };
  }
  function signal(detail) {
    listeners.forEach(function (fn) { try { fn(detail); } catch (_) {} });
    try { window.dispatchEvent(new CustomEvent('kiwi:operations', { detail: detail })); } catch (_) {}
  }
  async function create(domain, action, payload, opts) {
    opts = opts || {}; domain = clean(domain, 32).toLowerCase(); action = clean(action, 48).toLowerCase();
    if (!allowed(domain, action)) { var denied = new Error('permission-denied'); denied.code = 'permission-denied'; throw denied; }
    var id = clean(opts.id || token('op'), 128);
    var command = {
      id: id, idempotencyKey: clean(opts.idempotencyKey || id, 128), merchant: K.tenant(),
      domain: domain, action: action, payload: payload && typeof payload === 'object' ? payload : {},
      confirmed: opts.confirmed === true, requestedBy: clean(opts.requestedBy || subject().id || subject().role, 100),
      createdAt: Date.now(),
    };
    if (navigator.onLine === false) return enqueue(command);
    try {
      var result = await send(command); signal({ type: 'result', result: result }); return result;
    } catch (error) {
      if (!error.status || error.status >= 500) return enqueue(command);
      throw error;
    }
  }
  async function list(opts) {
    opts = opts || {};
    var query = new URLSearchParams({ merchant: K.tenant(), limit: String(Math.max(1, Math.min(200, +opts.limit || 50))) });
    if (opts.domain) query.set('domain', clean(opts.domain, 32));
    if (opts.status) query.set('status', clean(opts.status, 32));
    return responseJson(await fetch('/api/operations?' + query.toString(), { credentials: 'same-origin', cache: 'no-store', headers: { Accept: 'application/json' } }));
  }
  async function purchaseOrders(opts) {
    opts = opts || {};
    var query = new URLSearchParams({ merchant: K.tenant(), view: 'purchase-orders', limit: String(Math.max(1, Math.min(60, +opts.limit || 25))) });
    if (opts.open) query.set('state', 'open');
    return responseJson(await fetch('/api/operations?' + query.toString(), { credentials: 'same-origin', cache: 'no-store', headers: { Accept: 'application/json' } }));
  }
  /* Le livre des liens de paiement : encaissé, remboursé, remboursable.  La
     lecture est réservée au propriétaire côté serveur — le client ne recopie
     pas cette règle, il laisse le 403 remonter tel quel. */
  async function payments(opts) {
    opts = opts || {};
    var query = new URLSearchParams({ merchant: K.tenant(), view: 'payments' });
    if (opts.limit) query.set('limit', String(Math.max(1, Math.min(200, +opts.limit || 50))));
    return responseJson(await fetch('/api/operations?' + query.toString(), { credentials: 'same-origin', cache: 'no-store', headers: { Accept: 'application/json' } }));
  }
  /* Les préférences d'envoi et le journal des tentatives.  Même porte que le
     parc : propriétaire ou exploitant seulement. */
  async function notifications(opts) {
    opts = opts || {};
    var query = new URLSearchParams({ merchant: K.tenant(), view: 'notifications' });
    if (opts.limit) query.set('limit', String(Math.max(1, Math.min(200, +opts.limit || 40))));
    return responseJson(await fetch('/api/operations?' + query.toString(), { credentials: 'same-origin', cache: 'no-store', headers: { Accept: 'application/json' } }));
  }
  /* Une intention, pas un canal : « préviens ce client » descend l'ordre des
     préférences de la maison et s'arrête au premier canal qui aboutit.  Passer
     `channel` fige le canal et supprime le repli. */
  async function notify(kindAction, payload, opts) {
    return create('notification', kindAction, payload || {}, opts || {});
  }
  async function setNotifyPreferences(kind, channels, enabled) {
    return create('notification', 'set-preferences', {
      kind: kind, channels: channels, enabled: enabled !== false,
    }, { idempotencyKey: 'notify-prefs:' + K.tenant() + ':' + kind + ':' + Date.now() });
  }
  /* Les tickets en cours, en lecture seule : de quoi traduire « la 12 » en
     identifiant avant de proposer une action.  On ne passe pas par la file de
     la cuisine — son GET réveille le comptoir au passage. */
  async function orders(opts) {
    opts = opts || {};
    var query = new URLSearchParams({ merchant: K.tenant(), view: 'orders' });
    if (opts.open) query.set('state', 'open');
    if (opts.limit) query.set('limit', String(Math.max(1, Math.min(120, +opts.limit || 40))));
    return responseJson(await fetch('/api/operations?' + query.toString(), { credentials: 'same-origin', cache: 'no-store', headers: { Accept: 'application/json' } }));
  }
  /* Le parc.  La lecture est réservée au propriétaire côté serveur ; comme
     pour les paiements, le client laisse remonter le 403 tel quel. */
  async function devices(opts) {
    opts = opts || {};
    var query = new URLSearchParams({ merchant: K.tenant(), view: 'devices' });
    if (opts.limit) query.set('limit', String(Math.max(1, Math.min(200, +opts.limit || 50))));
    return responseJson(await fetch('/api/operations?' + query.toString(), { credentials: 'same-origin', cache: 'no-store', headers: { Accept: 'application/json' } }));
  }
  /* Les ponts d'impression appairés : ce que le relais sait d'eux (dernier signe,
     version, en ligne ou non).  Lecture réservée au commerce côté serveur. */
  async function printBridges() {
    return responseJson(await fetch('/api/print/bridges?merchant=' + encodeURIComponent(K.tenant()), { credentials: 'same-origin', cache: 'no-store', headers: { Accept: 'application/json' } }));
  }
  /* Un vrai ticket sur une vraie imprimante.  Le serveur ouvre la commande en
     « processing » ; c'est cet appareil-ci qui imprime et rapporte le
     résultat, réussite comme échec.  Rien n'est déclaré imprimé sans l'avoir
     été : si l'encodeur ou le pont manquent, la commande échoue et le dit. */
  async function testPrint() {
    var printer = printerState();
    var created = await create('device', 'test-print', { deviceId: deviceId(), app: appName(), printerConfigured: printer.configured });
    var command = created && created.command;
    if (!command || command.status !== 'processing') return created;
    var outcome;
    try {
      var P = window.KiwiPrinter;
      if (!P || !P.printBytes || !window.KiwiEscPos || !window.KiwiEscPos.testSlip) outcome = { ok: false, reason: 'no-printer-driver' };
      else outcome = await P.printBytes(window.KiwiEscPos.testSlip({ paper: (P.getConfig && P.getConfig().paper) || '80', ip: (P.getConfig && P.getConfig().ip) || '' }));
    } catch (error) { outcome = { ok: false, reason: clean(error && error.message, 120) || 'print-failed' }; }
    var ok = !!(outcome && outcome.ok);
    try { await transition(command.id, ok ? 'completed' : 'failed', { confirmed: true }); } catch (_) {}
    /* Un battement immédiat : l'état de l'imprimante vient de changer sous nos
       yeux, le parc doit le refléter sans attendre cinq minutes. */
    beat(true).catch(function () {});
    return { ok: true, command: command, printed: ok, via: clean(outcome && outcome.via, 24), reason: ok ? '' : clean(outcome && outcome.reason, 120) || 'print-failed' };
  }
  async function ackAlert(id) {
    return create('device', 'ack-alert', { deviceId: clean(id, 80) || deviceId() });
  }
  /* Un nom vide rend l'appareil à celui qu'il se donne lui-même. */
  async function renameDevice(id, name) {
    return create('device', 'rename', { deviceId: clean(id, 80), name: clean(name, 80) },
      { idempotencyKey: 'rename:' + Date.now() + ':' + clean(id, 80) });
  }
  async function payslips(opts) {
    opts = opts || {};
    var query = new URLSearchParams({ merchant: K.tenant(), view: 'payslips' });
    if (opts.period) query.set('period', clean(opts.period, 7));
    return responseJson(await fetch('/api/operations?' + query.toString(), { credentials: 'same-origin', cache: 'no-store', headers: { Accept: 'application/json' } }));
  }
  async function transition(commandId, state, opts) {
    opts = opts || {};
    return responseJson(await fetch('/api/operations', {
      method: 'POST', credentials: 'same-origin', cache: 'no-store',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ merchant: K.tenant(), commandId: clean(commandId, 128), transition: clean(state, 32), confirmed: opts.confirmed === true, reason: clean(opts.reason || '', 120) }),
    }));
  }
  /* Une action dictée à l'assistant franchit deux portes.  La première est le
     rôle : agentAllowed() recopie la règle du serveur pour qu'un bouton ne soit
     jamais proposé à quelqu'un que le Worker refusera.  La seconde est la
     confirmation : rien ne part tant que le commerçant n'a pas appuyé, et la
     phrase qu'il a dite voyage avec la commande — c'est elle qui répondra plus
     tard à « pourquoi ceci s'est-il produit ? ». */
  function agentAllowed(action) { return allowed('ai', clean(action, 48).toLowerCase()); }
  async function agentRun(action, payload, said) {
    var body = Object.assign({}, payload && typeof payload === 'object' ? payload : {}, { said: clean(said, 240) });
    return create('ai', action, body, { confirmed: true });
  }
  async function flush() {
    var O = window.KiwiOffline;
    if (flushing || navigator.onLine === false || !O || !O.available || !O.available()) return false;
    flushing = true;
    try {
      while (navigator.onLine !== false) {
        var row = await O.claim(CHANNEL, K.tenant(), { force: true });
        if (!row) break;
        try { await send(row.payload); await O.acknowledge(row.id, row.leaseToken); }
        catch (error) {
          /* 429 n'est pas un refus, c'est un « plus tard ».  La classer parmi
             les 4xx permanentes jetait une commande que le serveur promet
             d'accepter à la fenêtre suivante — et on s'arrête net plutôt que
             de brûler la file entière contre le même plafond. */
          var permanent = !!(error && error.status && error.status >= 400 && error.status < 500 && error.status !== 429);
          await O.reject(row.id, row.leaseToken, { permanent: permanent, status: error && error.status || 0, error: error && (error.code || error.message) || 'send-failed' });
          if (!permanent) break;
        }
      }
    } finally { flushing = false; signal({ type: 'flush' }); }
    return true;
  }
  function capability(domain) {
    var action = domain === 'device' ? 'heartbeat' : '';
    var isAllowed = allowed(domain, action);
    return { available: isAllowed, engine: 'Kiwi durable operations', reason: isAllowed ? '' : 'permission-denied' };
  }

  ['notifications', 'procurement', 'payroll', 'accounting', 'payment-links', 'devices', 'actions'].forEach(function (name) {
    var domain = name === 'notifications' ? 'notification' : name === 'payment-links' ? 'payment' : name === 'devices' ? 'device' : name === 'actions' ? 'ai' : name;
    K.register(name, { engine: 'Kiwi operational ledger', available: function () { return capability(domain).available; }, reason: function () { return capability(domain).reason; }, create: function (action, payload, opts) { return create(domain, action, payload, opts); }, list: function (opts) { return list(Object.assign({}, opts || {}, { domain: domain })); } });
  });

  window.addEventListener('online', flush);
  /* Le rôle se demande dès le chargement (le premier clic le trouve donc
     connu), puis à chaque changement de magasin : appairage d'une caisse,
     client ouvert en vue opérateur. */
  setTimeout(function () { whoami().catch(function () {}); }, 0);
  try { document.addEventListener('kiwi-paired', function () { whoami(true); }); } catch (_) {}
  setInterval(function () { if (navigator.onLine !== false) flush(); }, 60000);
  setTimeout(function () {
    flush();
    /* Heartbeat records capability, not customer or order data. Failure is
       silent and retryable; it never interrupts a cashier or merchant. */
    beat().catch(function () {});
  }, 1800);
  /* Le seuil « hors ligne » vaut trois battements manqués côté serveur ; un
     battement toutes les cinq minutes est donc ce qui rend ce seuil honnête. */
  setInterval(function () { if (navigator.onLine !== false) beat().catch(function () {}); }, 300000);

  window.KiwiOperations = {
    version: 1, create: create, list: list, purchaseOrders: purchaseOrders, payslips: payslips, payments: payments, transition: transition, flush: flush,
    devices: devices, printBridges: printBridges, testPrint: testPrint, ackAlert: ackAlert, renameDevice: renameDevice, deviceId: deviceId, heartbeat: beat,
    notifications: notifications, notify: notify, setNotifyPreferences: setNotifyPreferences,
    orders: orders, agentAllowed: agentAllowed, agentRun: agentRun,
    allowed: allowed, whoami: whoami, actor: function () { return actorFresh() ? Object.assign({}, actor) : null; }, subscribe: function (fn) { listeners.add(fn); return function () { listeners.delete(fn); }; },
  };
})();
