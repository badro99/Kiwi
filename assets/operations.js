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
  function subject() {
    var role = K.access.role({});
    return { role: role, id: clean(window.__kiwiStaffId || '', 80) };
  }
  /* L'identité de l'appareil.  Sans jeton stable, un parc de six caisses
     s'effondre à trois lignes — une par type d'application — et « santé des
     appareils » ne veut plus rien dire.  Le jeton ne dit rien de la personne
     qui tient l'appareil : il ne sert qu'à reconnaître la machine. */
  function deviceId() {
    var stored = '';
    try { stored = clean(localStorage.getItem('kiwiDeviceId'), 80); } catch (_) {}
    if (stored) return stored;
    var minted = token('dev');
    try { localStorage.setItem('kiwiDeviceId', minted); } catch (_) {}
    return minted;
  }
  function appName() {
    if (location.pathname.indexOf('kiwi-caisse') >= 0) return 'caisse';
    if (location.pathname.indexOf('serveur') >= 0) return 'serveur';
    return 'dashboard';
  }
  function printerState() {
    var P = window.KiwiPrinter;
    return {
      configured: !!(P && P.isConfigured && P.isConfigured()),
      connected: !!(P && P.isConnected && P.isConnected()),
    };
  }
  function beat() {
    var printer = printerState();
    return create('device', 'heartbeat', {
      deviceId: deviceId(), app: appName(), at: Date.now(),
      online: navigator.onLine !== false, standalone: !!navigator.standalone,
      printerConfigured: printer.configured, printerConnected: printer.connected,
    }, { idempotencyKey: 'heartbeat:' + K.tenant() + ':' + deviceId() + ':' + Math.floor(Date.now() / 300000) });
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
    beat().catch(function () {});
    return { ok: true, command: command, printed: ok, via: clean(outcome && outcome.via, 24), reason: ok ? '' : clean(outcome && outcome.reason, 120) || 'print-failed' };
  }
  async function ackAlert(id) {
    return create('device', 'ack-alert', { deviceId: clean(id, 80) || deviceId() });
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
    devices: devices, testPrint: testPrint, ackAlert: ackAlert, deviceId: deviceId, heartbeat: beat,
    notifications: notifications, notify: notify, setNotifyPreferences: setNotifyPreferences,
    orders: orders, agentAllowed: agentAllowed, agentRun: agentRun,
    allowed: allowed, subscribe: function (fn) { listeners.add(fn); return function () { listeners.delete(fn); }; },
  };
})();
