/* Kiwi Employee/Service app — small same-origin client for /api/employee. */
(function () {
  'use strict';
  var lastData = null;
  /* Employé dont le cookie de session porte les envois de la file. Vidé dès
     qu'une autre connexion commence : la file d'un employé ne part jamais
     sous la session d'un autre. */
  var queueOwner = '';
  function remember(data) {
    if (data && data.employee) {
      lastData = data;
      var owner = data.merchant && data.employee.id ? String(data.merchant) + ':' + String(data.employee.id) : '';
      if (owner) {
        // Une session (re)trouvée envoie la file ; un sondage ne devance pas la relance prévue.
        var changed = owner !== queueOwner;
        queueOwner = owner;
        if (changed || (!retryTimer && readQueue(owner).length)) schedule(0);
      }
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
  function newOpId() {
    try { if (window.crypto && typeof window.crypto.randomUUID === 'function') return window.crypto.randomUUID(); } catch (_) {}
    return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 12);
  }

  /* ---------- File durable des pointages ----------
     Un pointage (arrivée, départ) est d'abord écrit sur le téléphone, rangé
     par magasin et par employé, avec l'heure réelle du geste et son identité
     (opId), puis envoyé dans l'ordre. Réseau coupé ou serveur indisponible :
     il reste sur le téléphone et repart au retour du réseau ou à la
     réouverture de l'app. Le serveur reconnaît l'opId : un pointage renvoyé
     n'en fait jamais deux. */
  var QUEUE_PREFIX = 'kiwiEmployeePunchQueue:';
  var outcomes = {};
  var lastBlock = null;
  var flushing = Promise.resolve();
  var retryTimer = null;
  var retryDelay = 0;
  function store() { try { return window.localStorage || null; } catch (_) { return null; } }
  function readQueue(owner) {
    try {
      var list = JSON.parse((store() && store().getItem(QUEUE_PREFIX + owner)) || '[]');
      return Array.isArray(list) ? list.filter(function (i) { return i && i.opId && (i.kind === 'clock-in' || i.kind === 'clock-out'); }) : [];
    } catch (_) { return []; }
  }
  function writeQueue(owner, items) {
    try {
      if (items.length) store().setItem(QUEUE_PREFIX + owner, JSON.stringify(items));
      else store().removeItem(QUEUE_PREFIX + owner);
      return true;
    } catch (_) { return false; }
  }
  function dropItem(owner, opId) { writeQueue(owner, readQueue(owner).filter(function (i) { return i.opId !== opId; })); }
  function bodyFor(item) {
    return { action: item.kind, attendanceCode: item.code || '', opId: item.opId, progress: item.progress || null,
      capturedAgoMs: Math.max(0, Date.now() - (Number(item.at) || Date.now())) };
  }
  // Réseau absent, serveur indisponible : on garde et on retente.
  function transient(err) { return !err || !err.status || err.status >= 500; }
  // Session absente ou trop d'essais : on garde aussi, sans perdre le geste.
  function keeps(err) { return transient(err) || err.status === 401 || err.status === 429; }
  function notify(detail) {
    try { document.dispatchEvent(new CustomEvent('kiwi-employee-punch-queue', { detail: detail })); } catch (_) {}
  }
  function schedule(delay) {
    if (retryTimer) { clearTimeout(retryTimer); retryTimer = null; }
    retryTimer = setTimeout(function () { retryTimer = null; flush(); }, delay);
  }
  function runOnce() {
    var owner = queueOwner;
    if (!owner) return Promise.resolve();
    var sent = 0, rejected = [];
    function step() {
      if (queueOwner !== owner) return Promise.resolve();
      var item = readQueue(owner)[0];
      if (!item) { lastBlock = null; return Promise.resolve(); }
      return call('POST', bodyFor(item)).then(function (data) {
        dropItem(owner, item.opId);
        outcomes[item.opId] = { data: data };
        sent++;
        return step();
      }, function (err) {
        if (keeps(err)) { lastBlock = err; return; }
        // Refus définitif (code faux, pointage trop ancien) : retiré et signalé.
        dropItem(owner, item.opId);
        outcomes[item.opId] = { error: err };
        rejected.push({ action: item.kind, error: err.code || 'employee-request-failed', at: item.at });
        return step();
      });
    }
    return step().then(function () {
      var pending = readQueue(owner).length;
      if (pending && lastBlock && lastBlock.status !== 401) {
        retryDelay = Math.min(300000, retryDelay ? retryDelay * 2 : 15000);
        schedule(retryDelay);
      } else if (!pending) retryDelay = 0;
      if (sent || rejected.length) notify({ pending: pending, sent: sent, rejected: rejected });
      if (sent && queueOwner === owner) call('GET').then(remember).catch(function () {});
    });
  }
  function flush() {
    flushing = flushing.then(runOnce, runOnce).catch(function () {});
    return flushing;
  }
  function punch(kind, attendanceCode, progress, opId) {
    var item = { kind: kind, opId: opId || newOpId(), at: Date.now(), code: String(attendanceCode || ''), progress: progress || null };
    var owner = queueOwner;
    // Sans identité connue ni stockage durable : envoi direct, comme avant.
    if (!owner || !writeQueue(owner, readQueue(owner).concat([item]))) return call('POST', bodyFor(item)).then(remember);
    return flush().then(function () {
      var out = outcomes[item.opId];
      delete outcomes[item.opId];
      if (out && out.error) throw out.error;
      if (out) return remember(out.data);
      var err = lastBlock;
      // Session perdue ou essais épuisés : ce geste-ci est refusé à l'écran, comme avant.
      if (err && !transient(err)) { dropItem(owner, item.opId); throw err; }
      notify({ pending: readQueue(owner).length, queued: kind });
      var open = lastData && lastData.attendance && lastData.attendance.open;
      return { ok: true, queued: true, action: kind,
        entry: kind === 'clock-in' ? { inTs: item.at, outTs: 0, pending: true } : Object.assign({}, open || {}, { outTs: item.at, pending: true }) };
    });
  }
  try {
    window.addEventListener('online', function () { retryDelay = 0; schedule(0); });
    document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible' && queueOwner && readQueue(queueOwner).length) schedule(0); });
  } catch (_) {}

  window.KiwiEmployeeLive = {
    login: function (email, pin) {
      queueOwner = '';
      return call('POST', { action: 'login', email: email, pin: pin }).then(function () { return call('GET'); }).then(remember);
    },
    refresh: function () { return call('GET').then(remember); },
    // Un geste, une identité : une arrivée ou un départ rejoué en retard ne compte jamais deux fois.
    clockIn: function (attendanceCode, opId) { return punch('clock-in', attendanceCode, null, opId); },
    clockOut: function (progress, attendanceCode, opId) { return punch('clock-out', attendanceCode, progress, opId); },
    pendingPunches: function () { return queueOwner ? readQueue(queueOwner).length : 0; },
    flushPunches: function () { return flush(); },
    requestPlanning: function (request) { return call('POST', Object.assign({ action: 'planning-request' }, request || {})); },
    cancelPlanningRequest: function (requestId) { return call('POST', { action: 'planning-request-cancel', requestId: requestId }); },
    claimOpenShift: function (shiftId) { return call('POST', { action: 'planning-open-shift-claim', shiftId: shiftId }); },
    requestShiftSwap: function (day) { return call('POST', { action: 'planning-swap-request', day: day }); },
    claimShiftSwap: function (requestId, offeredDay) { return call('POST', { action: 'planning-swap-claim', requestId: requestId, offeredDay: offeredDay }); },
    cancelPlanningOpportunity: function (id) { return call('POST', { action: 'planning-opportunity-cancel', requestId: id, shiftId: id }); },
    /* Avant de fermer la session, on vide la file. Hors ligne avec des
       pointages en attente, la session reste ouverte côté serveur : c'est elle
       qui les enverra au retour du réseau. */
    logout: function () {
      var owner = queueOwner;
      return flush().then(function () {
        return call('POST', { action: 'logout' }).then(function (r) {
          if (queueOwner === owner) queueOwner = '';
          return r;
        }, function (err) {
          var pending = owner ? readQueue(owner).length : 0;
          if (pending && !err.status) return { ok: false, pending: pending };
          throw err;
        });
      });
    },
    data: function () { return lastData; },
  };
  // App native (Capacitor) : pas de service worker — le bundle embarqué est versionné par la release.
  var nativeApp = !!(window.Capacitor && typeof window.Capacitor.isNativePlatform === 'function' && window.Capacitor.isNativePlatform());
  if (!nativeApp && 'serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('/kiwi-sw.js?v=663').then(function (reg) {
        try { reg.update(); } catch (_) {}
        if (window.KiwiPWAUpdate) window.KiwiPWAUpdate.watch(reg);
      }).catch(function () {});
    });
  }
})();
