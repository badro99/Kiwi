/* Kiwi operator console · the one client owner of /api/admin.
 *
 * Every console screen (kiwi-admin.html and its overlays, the follow-ups page,
 * the health page) reaches the privileged routes through this module, never
 * with its own fetch. The routes keep their server-side rules (named operator
 * code, audit log, version checks in functions/api/admin/*); this owner gives
 * the client side one place for them:
 *   - only /api/admin routes, same-origin cookies, JSON in and out;
 *   - one error shape: message = the server's error code (or "http-<status>"),
 *     plus status, code and body, so every screen can name what went wrong;
 *   - every successful write (any method but GET) is announced to onWrite()
 *     listeners, so a screen holding a cached list knows it is stale.
 * tools/admin-api-owner-test.mjs fails if a console file calls fetch itself. */
(function () {
  'use strict';
  var fetchDeadline = function (url, options, readBody, controller) {
    controller = controller || (typeof AbortController === 'function' ? new AbortController() : null);
    var timer;
    var request = new Promise(function (resolve, reject) {
      try { resolve(fetch(url, Object.assign({}, options, controller ? {signal: controller.signal} : {}))); }
      catch (error) { reject(error); }
    }).then(function (response) {
      if (readBody === false || !response || typeof response.json !== 'function') return response;
      return response.json().then(function (data) {
        response.json = function () { return Promise.resolve(data); }; return response;
      }, function (error) {
        response.json = function () { return Promise.reject(error); }; return response;
      });
    });
    var deadline = new Promise(function (_, reject) {
      timer = setTimeout(function () {
        var error = new Error('request-timeout'); error.code = 'timeout';
        reject(error);
        if (controller) controller.abort();
      }, 12000);
    });
    return Promise.race([request, deadline]).finally(function () { clearTimeout(timer); });
  };
  var writes = [];
  function route(path) {
    var p = String(path || '');
    if (p.indexOf('/api/admin') !== 0) p = '/api/admin' + (p.charAt(0) === '/' || p.charAt(0) === '?' || !p ? '' : '/') + p;
    if (!/^\/api\/admin(?:[/?]|$)/.test(p) || p.indexOf('..') !== -1) throw new Error('admin-route');
    return p;
  }
  async function request(path, opts) {
    var url = route(path);
    var o = Object.assign({ credentials: 'same-origin' }, opts || {});
    o.headers = Object.assign({ 'Content-Type': 'application/json' }, (opts && opts.headers) || {});
    var method = String(o.method || 'GET').toUpperCase();
    var r, body;
    try {
      r = await fetchDeadline(url, o);
      try { body = await r.json(); } catch (_) { throw Object.assign(new Error('bad-response'), { code: 'bad-response' }); }
    } catch (failure) {
      var kind = failure && failure.code === 'timeout' ? 'timeout' : failure && failure.code === 'bad-response' ? 'bad-response' : 'offline';
      throw Object.assign(new Error(kind), { status: 0, code: kind, body: undefined });
    }
    if (!r.ok) {
      var code = body && typeof body.error === 'string' ? body.error : '';
      var e = new Error(code || 'http-' + r.status);
      e.status = r.status; e.code = code || undefined; e.body = body || undefined;
      throw e;
    }
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw Object.assign(new Error('bad-response'), { status: 0, code: 'bad-response', body: undefined });
    if (method !== 'GET' && method !== 'HEAD') {
      writes.slice().forEach(function (fn) { try { fn({ path: url, method: method }); } catch (_) {} });
    }
    return body;
  }
  function onWrite(fn) {
    if (typeof fn !== 'function') return function () {};
    writes.push(fn);
    return function () { writes = writes.filter(function (x) { return x !== fn; }); };
  }
  window.KiwiAdminApi = Object.freeze({ request: request, onWrite: onWrite, route: route });
})();
