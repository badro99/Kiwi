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
  function needed(domain, action) {
    if (domain === 'device' && action === 'heartbeat') return ['read', 'device'];
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
    if (domain === 'ai' && action === 'reprint') return ['action', 'reprint'];
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
      body: JSON.stringify({ merchant: K.tenant(), commandId: clean(commandId, 128), transition: clean(state, 32), confirmed: opts.confirmed === true }),
    }));
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
          var permanent = !!(error && error.status && error.status >= 400 && error.status < 500);
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
    create('device', 'heartbeat', {
      app: location.pathname.indexOf('kiwi-caisse') >= 0 ? 'caisse' : location.pathname.indexOf('serveur') >= 0 ? 'serveur' : 'dashboard',
      online: navigator.onLine !== false, standalone: !!navigator.standalone,
      printerConfigured: !!(window.KiwiPrinter && window.KiwiPrinter.isConfigured && window.KiwiPrinter.isConfigured()),
      printerConnected: !!(window.KiwiPrinter && window.KiwiPrinter.isConnected && window.KiwiPrinter.isConnected()),
    }, { idempotencyKey: 'heartbeat:' + K.tenant() + ':' + Math.floor(Date.now() / 300000) }).catch(function () {});
  }, 1800);

  window.KiwiOperations = {
    version: 1, create: create, list: list, purchaseOrders: purchaseOrders, payslips: payslips, payments: payments, transition: transition, flush: flush,
    allowed: allowed, subscribe: function (fn) { listeners.add(fn); return function () { listeners.delete(fn); }; },
  };
})();
