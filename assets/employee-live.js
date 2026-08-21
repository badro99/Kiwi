/* Kiwi Employee/Service app — small same-origin client for /api/employee. */
(function () {
  'use strict';
  var lastData = null;
  function remember(data) {
    if (data && data.employee) {
      lastData = data;
      try { document.dispatchEvent(new CustomEvent('kiwi-employee-data', { detail: data })); } catch (_) {}
    }
    return data;
  }
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
      return call('POST', { action: 'login', email: email, pin: pin }).then(function () { return call('GET'); }).then(remember);
    },
    refresh: function () { return call('GET').then(remember); },
    clockIn: function (attendanceCode) { return call('POST', { action: 'clock-in', attendanceCode: attendanceCode || '' }).then(remember); },
    clockOut: function (progress, attendanceCode) { return call('POST', { action: 'clock-out', progress: progress || null, attendanceCode: attendanceCode || '' }).then(remember); },
    requestPlanning: function (request) { return call('POST', Object.assign({ action: 'planning-request' }, request || {})); },
    cancelPlanningRequest: function (requestId) { return call('POST', { action: 'planning-request-cancel', requestId: requestId }); },
    claimOpenShift: function (shiftId) { return call('POST', { action: 'planning-open-shift-claim', shiftId: shiftId }); },
    requestShiftSwap: function (day) { return call('POST', { action: 'planning-swap-request', day: day }); },
    claimShiftSwap: function (requestId, offeredDay) { return call('POST', { action: 'planning-swap-claim', requestId: requestId, offeredDay: offeredDay }); },
    cancelPlanningOpportunity: function (id) { return call('POST', { action: 'planning-opportunity-cancel', requestId: id, shiftId: id }); },
    logout: function () { return call('POST', { action: 'logout' }); },
    data: function () { return lastData; },
  };
  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('/kiwi-sw.js?v=458').then(function (reg) {
        try { reg.update(); } catch (_) {}
        if (window.KiwiPWAUpdate) window.KiwiPWAUpdate.watch(reg);
      }).catch(function () {});
    });
  }
})();
