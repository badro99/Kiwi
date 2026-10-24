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
  var copies = {};
  var saving = Promise.resolve();
  function saveTask(fn) {
    var task = saving.then(fn, fn);
    saving = task.catch(function () {});
    return task;
  }
  function valid(items) {
    return Array.isArray(items) ? items.filter(function (i) { return i && i.opId && (i.done || i.kind === 'clock-in' || i.kind === 'clock-out'); }) : [];
  }
  function merge(a, b) {
    var byId = new Map();
    valid(a).concat(valid(b)).forEach(function (i) {
      var old = byId.get(i.opId);
      if (!old || i.done) byId.set(i.opId, i);
    });
    return Array.from(byId.values()).sort(function (a, b) { return a.at - b.at; });
  }
  // Une transaction terminée, pas seulement une requête réussie, confirme la copie.
  function idb(owner, items) {
    return new Promise(function (resolve) {
      var request;
      try { request = window.indexedDB.open('kiwiEmployeePunchQueue', 1); } catch (_) { resolve(null); return; }
      request.onerror = request.onblocked = function () { resolve(null); };
      request.onupgradeneeded = function () { request.result.createObjectStore('queues'); };
      request.onsuccess = function () {
        var db = request.result, tx, read;
        try {
          tx = db.transaction('queues', items ? 'readwrite' : 'readonly');
          var bucket = tx.objectStore('queues');
          if (items) bucket.put(items, QUEUE_PREFIX + owner);
          else read = bucket.get(QUEUE_PREFIX + owner);
          tx.oncomplete = function () { db.close(); resolve(items ? true : valid(read.result)); };
          tx.onerror = tx.onabort = function () { db.close(); resolve(null); };
        } catch (_) { db.close(); resolve(null); }
      };
    });
  }
  function records(owner) {
    var local = [];
    try { local = JSON.parse((store() && store().getItem(QUEUE_PREFIX + owner)) || '[]'); } catch (_) {}
    return merge(local, copies[owner] || []);
  }
  function readQueue(owner) { return records(owner).filter(function (i) { return !i.done; }); }
  function loadQueue(owner) {
    return idb(owner).then(function (items) { copies[owner] = merge(records(owner), items || []); });
  }
  function writeQueue(owner, items) {
    var saved = false;
    // Les accusés empêchent une ancienne copie de ressusciter un geste déjà envoyé.
    items = merge(items, records(owner).filter(function (i) { return i.done; }));
    // Un accusé de plus de 24 h ne protège plus rien (le serveur refuse au-delà de 12 h).
    var horizon = Date.now() - 86400000;
    items = items.filter(function (i) { return !i.done || Number(i.at) > horizon; });
    var pending = items.filter(function (i) { return !i.done; });
    try {
      if (pending.length) store().setItem(QUEUE_PREFIX + owner, JSON.stringify(pending));
      else store().removeItem(QUEUE_PREFIX + owner);
      saved = true;
    } catch (_) {}
    return idb(owner, items).then(function (stored) {
      if (saved || stored) copies[owner] = items;
      return saved || !!stored;
    });
  }
  function dropItem(owner, opId) {
    var items = records(owner).map(function (i) { return i.opId === opId ? { opId: opId, at: i.at, done: true } : i; });
    return writeQueue(owner, items).then(function () { copies[owner] = items; });
  }
  function bodyFor(item) {
    var deviceId = item.deviceId || '';
    if (!deviceId) {
      try { deviceId = store().getItem('kiwiAttendanceDevice') || newOpId(); store().setItem('kiwiAttendanceDevice', deviceId); } catch (_) { deviceId = 'legacy-device'; }
    }
    return { capturedAt: Number(item.at) || 0, deviceId: deviceId, action: item.kind, attendanceCode: item.code || '', opId: item.opId, progress: item.progress || null,
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
    var sent = 0, approvals = 0, rejected = [];
    function step() {
      if (queueOwner !== owner) return Promise.resolve();
      var item = readQueue(owner)[0];
      if (!item) { lastBlock = null; return Promise.resolve(); }
      return call('POST', bodyFor(item)).then(function (data) {
        return dropItem(owner, item.opId).then(function () {
          outcomes[item.opId] = { data: data };
          if (data.pendingApproval) approvals++;
          sent++;
          return step();
        });
      }, function (err) {
        if (keeps(err)) { lastBlock = err; return; }
        // Refus définitif (code faux, pointage trop ancien) : retiré et signalé.
        return dropItem(owner, item.opId).then(function () {
          outcomes[item.opId] = { error: err };
          rejected.push({ action: item.kind, error: err.code || 'employee-request-failed', at: item.at });
          return step();
        });
      });
    }
    return loadQueue(owner).then(step).then(function () {
      var pending = readQueue(owner).length;
      if (pending && lastBlock && lastBlock.status !== 401) {
        retryDelay = Math.min(300000, retryDelay ? retryDelay * 2 : 15000);
        schedule(retryDelay);
      } else if (!pending) retryDelay = 0;
      if (approvals && typeof window.toast === 'function') {
        var lang = document.documentElement.lang;
        window.toast(lang === 'ar' ? 'تم حفظ تسجيل الحضور لموافقة المسؤول' : lang === 'en' ? 'Punch kept for manager approval' : 'Pointage conservé pour validation du responsable', 4200);
      }
      if (sent || rejected.length) notify({ pending: pending, sent: approvals ? 0 : sent, approvals: approvals, rejected: rejected });
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
    if (!owner) return call('POST', bodyFor(item)).then(remember);
    return saveTask(function () {
      return loadQueue(owner).then(function () {
        return writeQueue(owner, readQueue(owner).concat([item]));
      });
    }).then(function (saved) {
      if (!saved) return call('POST', bodyFor(item)).then(remember);
      return flush().then(function () {
        var out = outcomes[item.opId];
        delete outcomes[item.opId];
        if (out && out.error) throw out.error;
        if (out) return remember(out.data);
        var err = lastBlock;
        // Session perdue ou essais épuisés : ce geste-ci est refusé à l'écran, comme avant.
        if (err && !transient(err)) return dropItem(owner, item.opId).then(function () { throw err; });
        notify({ pending: readQueue(owner).length, queued: kind });
        var open = lastData && lastData.attendance && lastData.attendance.open;
        return { ok: true, queued: true, action: kind,
          entry: kind === 'clock-in' ? { inTs: item.at, outTs: 0, pending: true } : Object.assign({}, open || {}, { outTs: item.at, pending: true }) };
      });
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
      navigator.serviceWorker.register('/kiwi-sw.js?v=665').then(function (reg) {
        try { reg.update(); } catch (_) {}
        if (window.KiwiPWAUpdate) window.KiwiPWAUpdate.watch(reg);
      }).catch(function () {});
    });
  }
})();
