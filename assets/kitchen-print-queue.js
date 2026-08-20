/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · FILE D'IMPRESSION CUISINE
 * ---------------------------------------------------------------------------
 * A kitchen ticket is not a toast and not a best-effort side effect. It is an
 * operational job: it must print once, survive a refresh, retry a temporarily
 * unavailable bridge, and never come out twice because the order poll returned
 * the same row again.
 *
 * The shared order queue remains the source of truth. One explicitly selected
 * caisse can become the restaurant's PRINT HUB and print accepted orders that
 * were entered on another till, the server app or OrderPro. Local orders keep
 * printing on the till that created them for backwards compatibility. Selecting
 * a single hub is deliberate: browser storage cannot arbitrate two physical
 * printers, so silently enabling every till would manufacture duplicates.
 * ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var HUB_KEY = 'kiwiKitchenPrintHubV1';
  var QUEUE_PREFIX = 'kiwiKitchenPrintQueueV1:';
  var DONE_PREFIX = 'kiwiKitchenPrintDoneV1:';
  var MAX_JOBS = 120;
  var MAX_DONE = 500;
  var MAX_AGE = 30 * 60 * 1000;
  var RETRY_MS = 10000;
  var running = false;
  var timer = null;
  var lastSuccess = null;
  var lastError = '';
  var lastWarnAt = 0;

  function get(k) { try { return localStorage.getItem(k); } catch (_) { return null; } }
  function put(k, v) { try { localStorage.setItem(k, v); return true; } catch (_) { return false; } }
  function json(k, fallback) {
    try { var value = JSON.parse(get(k) || 'null'); return value == null ? fallback : value; }
    catch (_) { return fallback; }
  }
  function merchant() {
    try {
      if (window.KiwiKitchenRelay && KiwiKitchenRelay.merchant) return KiwiKitchenRelay.merchant() || '';
      return get('kiwiPaired') === '1' ? (get('kiwiLiveMerchant') || '') : '';
    } catch (_) { return ''; }
  }
  function qKey() { return QUEUE_PREFIX + (merchant() || 'unpaired'); }
  function dKey() { return DONE_PREFIX + (merchant() || 'unpaired'); }
  function hubConfig() { return json(HUB_KEY, {}) || {}; }
  function isHub() {
    var c = hubConfig(), m = merchant();
    return !!(m && c.enabled === true && c.merchant === m);
  }
  function setHub(enabled) {
    var m = merchant();
    put(HUB_KEY, JSON.stringify({ enabled: !!enabled, merchant: m, updatedAt: Date.now() }));
    emit();
    if (enabled) flush();
    return isHub();
  }
  function readQueue() {
    var q = json(qKey(), []);
    if (!Array.isArray(q)) q = [];
    var now = Date.now();
    var fresh = q.filter(function (job) {
      return job && job.id && job.payload && now - Number(job.createdAt || 0) < MAX_AGE;
    }).slice(-MAX_JOBS);
    if (fresh.length !== q.length) writeQueue(fresh);
    return fresh;
  }
  function writeQueue(q) { put(qKey(), JSON.stringify((q || []).slice(-MAX_JOBS))); }
  function readDone() {
    var d = json(dKey(), []);
    return Array.isArray(d) ? d : [];
  }
  function markDone(id) {
    var d = readDone().filter(function (x) { return x && x.id !== id; });
    d.push({ id: id, at: Date.now() });
    put(dKey(), JSON.stringify(d.slice(-MAX_DONE)));
  }
  function alreadyDone(id) { return readDone().some(function (x) { return x && x.id === id; }); }
  function cleanId(value) { return String(value || '').replace(/[^a-zA-Z0-9:_-]/g, '-').slice(0, 140); }
  function printerReady() {
    try {
      var p = window.KiwiPrinter;
      if (!p || !p.printKitchen) return false;
      if (p.hasStationBindings && p.hasStationBindings()) return true;
      return !!(p.isConnected ? p.isConnected() : (p.isConfigured && p.isConfigured()));
    } catch (_) { return false; }
  }
  function status() {
    var q = readQueue();
    return {
      hub: isHub(), pending: q.length, printerReady: printerReady(), running: running,
      lastSuccess: lastSuccess, lastError: lastError || (q[0] && q[0].lastError) || '',
    };
  }
  function emit() {
    var s = status();
    try { window.dispatchEvent(new CustomEvent('kiwi:kitchen-print-status', { detail: s })); } catch (_) {}
    var badge = document.getElementById('kitchen-print-count');
    if (badge) {
      badge.textContent = s.pending ? String(s.pending) : (s.hub && s.printerReady ? '✓' : '—');
      badge.setAttribute('aria-label', s.pending ? s.pending + ' ticket(s) en attente' : (s.hub ? 'Impression automatique prête' : 'Hub non activé'));
    }
  }
  function notifyWaiting(reason) {
    var now = Date.now();
    if (now - lastWarnAt < 60000) return;
    lastWarnAt = now;
    try {
      if (window.KiwiCaisseToast) window.KiwiCaisseToast(
        'Ticket cuisine en attente', 5200, 'warn',
        reason === 'printer-not-configured'
          ? 'Connectez l’imprimante : Kiwi réessaiera automatiquement.'
          : 'Imprimante indisponible : le ticket reste dans la file et sera réessayé.'
      );
    } catch (_) {
      var b = document.getElementById('kitchen-print-count');
      if (b) b.classList.add('warn');
    }
  }
  function schedule() {
    if (timer || !readQueue().length) return;
    timer = setInterval(function () {
      if (!readQueue().length) { clearInterval(timer); timer = null; return; }
      flush();
    }, RETRY_MS);
  }
  function retry(job, reason) {
    var q = readQueue();
    var hit = q.find(function (x) { return x.id === job.id; });
    if (hit) {
      hit.attempts = Number(hit.attempts || 0) + 1;
      hit.lastError = reason || 'print-failed';
      hit.nextAt = Date.now() + Math.min(60000, RETRY_MS * Math.max(1, hit.attempts));
      writeQueue(q);
    }
    lastError = reason || 'print-failed';
    notifyWaiting(lastError);
    emit(); schedule();
  }
  function complete(job, result) {
    writeQueue(readQueue().filter(function (x) { return x.id !== job.id; }));
    markDone(job.id);
    lastSuccess = { id: job.id, at: Date.now(), via: result && result.via || '' };
    lastError = '';
    emit();
  }
  function flush() {
    if (running) return Promise.resolve(status());
    var q = readQueue();
    if (!q.length) { emit(); return Promise.resolve(status()); }
    if (!printerReady()) {
      lastError = 'printer-not-configured';
      notifyWaiting(lastError); emit(); schedule();
      return Promise.resolve(status());
    }
    var now = Date.now();
    var job = q.find(function (x) { return !x.nextAt || Number(x.nextAt) <= now; });
    if (!job) { schedule(); return Promise.resolve(status()); }
    running = true; emit();
    var station = job.station || (job.payload && job.payload.station) || '';
    return Promise.resolve(window.KiwiPrinter.printKitchen(job.payload, { station: station })).then(function (result) {
      running = false;
      if (result && result.ok) complete(job, result);
      else retry(job, result && result.reason || 'print-failed');
      if (readQueue().length) setTimeout(flush, 120);
      return result || { ok: false };
    }, function (error) {
      running = false;
      retry(job, error && error.message || 'print-failed');
      return { ok: false, reason: lastError };
    });
  }
  function retryNow() {
    var q = readQueue();
    q.forEach(function (job) { job.nextAt = 0; });
    writeQueue(q);
    return flush();
  }

  /* plan = [{id, payload, station}]. Remote jobs are accepted only by the selected hub;
     local jobs always retain the pre-existing "this till prints its own order"
     behaviour. Both paths use the same durable, idempotent queue. */
  function enqueue(plan, options) {
    options = options || {};
    if (options.remote === true && !isHub()) return { accepted: 0, skipped: 'not-print-hub' };
    /* Turning a till into the hub during service must not empty the last half
       hour of the server queue onto paper.  The polling API intentionally
       replays recent rows after a refresh; the done ledger handles refreshes,
       while this activation boundary handles the very first opt-in. */
    var activatedAt = options.remote === true ? Number(hubConfig().updatedAt || 0) : 0;
    var q = readQueue(), done = readDone(), accepted = 0;
    var doneIds = Object.create(null), queuedIds = Object.create(null);
    done.forEach(function (x) { if (x && x.id) doneIds[x.id] = 1; });
    q.forEach(function (x) { if (x && x.id) queuedIds[x.id] = 1; });
    (Array.isArray(plan) ? plan : []).forEach(function (raw) {
      if (!raw || !raw.payload) return;
      var createdAt = Number(raw.createdAt) || Date.now();
      if (activatedAt && createdAt < activatedAt - 5000) return;
      var id = cleanId(raw.id);
      if (!id || doneIds[id] || queuedIds[id]) return;
      q.push({
        id: id,
        payload: raw.payload,
        station: raw.station || (raw.payload && raw.payload.station) || '',
        createdAt: createdAt,
        remote: options.remote === true,
        attempts: 0,
        nextAt: 0,
        lastError: ''
      });
      queuedIds[id] = 1; accepted++;
    });
    writeQueue(q); emit();
    if (accepted) { schedule(); flush(); }
    return { accepted: accepted, pending: readQueue().length };
  }

  window.addEventListener('online', retryNow);
  window.addEventListener('kiwi:printer-config', retryNow);
  window.addEventListener('kiwi:station-printers-config', retryNow);
  window.addEventListener('storage', function (e) {
    if (e.key === HUB_KEY || (e.key && e.key.indexOf(QUEUE_PREFIX) === 0)) { emit(); flush(); }
  });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { emit(); if (readQueue().length) { schedule(); flush(); } });
  else { emit(); if (readQueue().length) { schedule(); flush(); } }

  window.KiwiKitchenPrint = {
    enqueue: enqueue, flush: flush, retryNow: retryNow, status: status,
    isHub: isHub, setHub: setHub, pending: function () { return readQueue().length; },
    maxAge: MAX_AGE,
    /* Test seams: intentionally read-only outside the automated test harness. */
    _readQueue: readQueue, _alreadyDone: alreadyDone,
  };
})();
