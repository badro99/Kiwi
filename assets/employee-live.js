/* Kiwi Employee/Service app — small same-origin client for /api/employee. */
(function () {
  'use strict';
  function call(method, body) {
    return fetch('/api/employee', {
      method: method,
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    }).then(async function (r) {
      let data = {};
      try { data = await r.json(); } catch (_) {}
      if (!r.ok) { var e = new Error(data.error || 'employee-request-failed'); e.code = data.error || ''; e.status = r.status; throw e; }
      return data;
    });
  }
  window.KiwiEmployeeLive = {
    login: function (email, pin) {
      return call('POST', { action: 'login', email: email, pin: pin }).then(function () { return call('GET'); });
    },
    refresh: function () { return call('GET'); },
    clockIn: function (nfcToken) { return call('POST', { action: 'clock-in', nfcToken: nfcToken || '' }); },
    clockOut: function (progress, nfcToken) { return call('POST', { action: 'clock-out', progress: progress || null, nfcToken: nfcToken || '' }); },
    logout: function () { return call('POST', { action: 'logout' }); },
  };
  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
    window.addEventListener('load', function () { navigator.serviceWorker.register('/kiwi-sw.js').catch(function () {}); });
  }
})();
