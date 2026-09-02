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
  var REPRINT_PREFIX = 'kiwiReceiptReprintsV1:';
  var MAX_JOBS = 120;
  var MAX_DONE = 500;
  var MAX_AGE = 30 * 60 * 1000;
  var RETRY_MS = 10000;
  var HUB_LEASE_MS = 45000;
  var HUB_RENEW_MS = 15000;
  var MAX_RECORDS = 120;
  var running = false;
  var timer = null;
  var lastSuccess = null;
  var lastError = '';
  var lastWarnAt = 0;
  var records = [];
  var nativeWriteTimer = null;

  function get(k) { try { return localStorage.getItem(k); } catch (_) { return null; } }
  function put(k, v) { try { localStorage.setItem(k, v); return true; } catch (_) { return false; } }
  function json(k, fallback) {
    try { var value = JSON.parse(get(k) || 'null'); return value == null ? fallback : value; }
    catch (_) { return fallback; }
  }
  function safeReason(value) { return String(value || '').toLowerCase().replace(/[^a-z0-9:_-]/g, '-').slice(0, 80); }
  function record(state, job, detail) {
    records.push({ at: Date.now(), state: safeReason(state), id: cleanId(job && job.id), type: safeReason(job && job.type || 'kitchen'), error: safeReason(detail && detail.error), via: safeReason(detail && detail.via) });
    records = records.slice(-MAX_RECORDS);
    persistNative();
  }
  function merchant() {
    try {
      if (window.KiwiKitchenRelay && KiwiKitchenRelay.merchant) return KiwiKitchenRelay.merchant() || '';
      return get('kiwiPaired') === '1' ? (get('kiwiLiveMerchant') || '') : '';
    } catch (_) { return ''; }
  }
  function qKey() { return QUEUE_PREFIX + (merchant() || 'unpaired'); }
  function dKey() { return DONE_PREFIX + (merchant() || 'unpaired'); }
  function rKey() { return REPRINT_PREFIX + (merchant() || 'unpaired'); }
  function hubConfig() { return json(HUB_KEY, {}) || {}; }
  function deviceId() {
    try {
      if (window.KiwiNative && window.KiwiNative.deviceId) return String(window.KiwiNative.deviceId);
      var key = 'kiwi:caisse:terminal-id:v1', value = get(key);
      if (value) return value;
      value = 'web_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
      put(key, value); return value;
    } catch (_) { return 'unknown-device'; }
  }
  function isHub() {
    var c = hubConfig(), m = merchant();
    return !!(m && c.enabled === true && c.merchant === m && c.deviceId === deviceId() && Number(c.expiresAt || 0) > Date.now());
  }
  function setHub(enabled) {
    var m = merchant(), now = Date.now(), current = hubConfig(), id = deviceId();
    if (enabled && current.enabled && current.merchant === m && current.deviceId !== id && Number(current.expiresAt || 0) > now) return false;
    var takeover = !!(enabled && current.deviceId && current.deviceId !== id && Number(current.expiresAt || 0) <= now);
    put(HUB_KEY, JSON.stringify({ enabled: !!enabled, merchant: m, deviceId: id, updatedAt: now, expiresAt: enabled ? now + HUB_LEASE_MS : 0 }));
    persistNative();
    if (takeover) try { if (window.KiwiCaisseToast) window.KiwiCaisseToast('Cette caisse imprime maintenant', 4200, 'success'); } catch (_) {}
    emit();
    if (enabled) flush();
    return isHub();
  }
  function renewHub() {
    if (!isHub()) return;
    var c = hubConfig(); c.updatedAt = Date.now(); c.expiresAt = c.updatedAt + HUB_LEASE_MS;
    put(HUB_KEY, JSON.stringify(c)); persistNative();
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
  function writeQueue(q) { put(qKey(), JSON.stringify((q || []).slice(-MAX_JOBS))); persistNative(); }
  function readDone() {
    var d = json(dKey(), []);
    return Array.isArray(d) ? d : [];
  }
  function markDone(id) {
    var d = readDone().filter(function (x) { return x && x.id !== id; });
    d.push({ id: id, at: Date.now() });
    put(dKey(), JSON.stringify(d.slice(-MAX_DONE)));
    persistNative();
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
      pendingReceipts: q.filter(function (job) { return job.type === 'receipt'; }).length,
      leaseExpiresAt: Number(hubConfig().expiresAt || 0),
      lastSuccess: lastSuccess, lastError: lastError || (q[0] && q[0].lastError) || '',
    };
  }
  function emit() {
    var s = status();
    try { window.dispatchEvent(new CustomEvent('kiwi:kitchen-print-status', { detail: s })); } catch (_) {}
    var badge = document.getElementById('kitchen-print-count');
    if (badge) {
      badge.textContent = s.pending ? String(s.pending) : (s.hub && s.printerReady ? '✓' : '·');
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
    record('retry-scheduled', job, { error: lastError });
    notifyWaiting(lastError);
    emit(); schedule();
  }
  function complete(job, result) {
    writeQueue(readQueue().filter(function (x) { return x.id !== job.id; }));
    markDone(job.id);
    lastSuccess = { id: job.id, at: Date.now(), via: result && result.via || '' };
    lastError = '';
    record('completed', job, { via: result && result.via });
    emit();
  }
  function flush() {
    if (running) return Promise.resolve(status());
    var q = readQueue();
    if (!q.length) { emit(); return Promise.resolve(status()); }
    var now = Date.now();
    var job = q.find(function (x) { return !x.nextAt || Number(x.nextAt) <= now; });
    if (!job) { schedule(); return Promise.resolve(status()); }
    running = true; emit();
    record('printing', job);
    var station = job.station || (job.payload && job.payload.station) || '';
    /* Receipt jobs carry the canonical KiwiReceipt document (shop is a block,
       prices live on line.total, and totals live under doc.totals). Feeding that
       document to KiwiPrinter.printReceipt invokes the legacy flat encoder,
       which stringifies shop as "[object Object]" and prints blank amounts.
       Keep the durable queue, but let the canonical renderer encode its own
       document before KiwiPrinter transports the resulting bytes. */
    var print = job.type === 'receipt'
      ? (window.KiwiReceipt && typeof window.KiwiReceipt.print === 'function'
          ? window.KiwiReceipt.print(job.payload)
          : Promise.resolve({ ok: false, reason: 'receipt-renderer-unavailable' }))
      : (window.KiwiPrinter && typeof window.KiwiPrinter.printKitchen === 'function'
          ? window.KiwiPrinter.printKitchen(job.payload, { station: station })
          : Promise.resolve({ ok: false, reason: 'printer-not-configured' }));
    return Promise.resolve(print).then(function (result) {
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

  /* plan = [{id, payload, station}]. Generic remote jobs are accepted only by
     the selected hub. Authenticated floor-service jobs use `remote: 'connected'`:
     the employee has already made the kitchen decision by tapping “Lancer la
     commande”, so a caisse with the kitchen printer physically ready must not
     wait for a second human confirmation or a hidden hub preference. Devices
     without a printer skip the job instead of accumulating a phantom queue.
     Every path still uses the same stable job id + done ledger. */
  function enqueue(plan, options) {
    options = options || {};
    if (options.remote === true && !isHub()) return { accepted: 0, skipped: 'not-print-hub' };
    if (options.remote === 'connected' && !isHub() && !printerReady()) {
      return { accepted: 0, skipped: 'printer-not-connected' };
    }
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
        type: raw.type === 'receipt' ? 'receipt' : 'kitchen',
        payload: raw.payload,
        station: raw.station || (raw.payload && raw.payload.station) || '',
        createdAt: createdAt,
        remote: options.remote === true || options.remote === 'connected',
        attempts: 0,
        nextAt: 0,
        lastError: ''
      });
      queuedIds[id] = 1; accepted++;
      record('queued', { id: id, type: raw.type });
    });
    writeQueue(q); emit();
    if (accepted) { schedule(); flush(); }
    return { accepted: accepted, pending: readQueue().length };
  }

  function enqueueReceipt(saleId, payload, intent) {
    var sale = cleanId(saleId), kind = intent === 'manual-reprint' ? 'manual-reprint' : 'original';
    if (!sale || !payload) return { accepted: 0, skipped: 'bad-receipt' };
    var counters = json(rKey(), {}) || {}, id = sale + ':original';
    if (kind === 'manual-reprint') {
      counters[sale] = Math.max(0, Number(counters[sale] || 0)) + 1;
      put(rKey(), JSON.stringify(counters)); persistNative();
      id = sale + ':manual-reprint:' + counters[sale];
    }
    return enqueue([{ id: id, type: 'receipt', payload: payload, createdAt: Date.now() }]);
  }

  function nativePlugin() {
    try { var c = window.Capacitor; return c && c.isNativePlatform && c.isNativePlatform() && c.Plugins && c.Plugins.KiwiPrinterSocket; } catch (_) { return null; }
  }
  function ledgerName() { return 'print-ledger-' + cleanId(merchant() || 'unpaired').toLowerCase().slice(0, 70); }
  function nativeSnapshot() {
    return JSON.stringify({ version: 1, merchant: merchant(), queue: json(qKey(), []), done: json(dKey(), []), reprints: json(rKey(), {}), hub: hubConfig(), records: records.slice(-MAX_RECORDS) });
  }
  function persistNative() {
    var plugin = nativePlugin(); if (!plugin || typeof plugin.ledgerWrite !== 'function') return;
    clearTimeout(nativeWriteTimer);
    nativeWriteTimer = setTimeout(function () { plugin.ledgerWrite({ name: ledgerName(), value: nativeSnapshot() }).catch(function () {}); }, 40);
  }
  function restoreNative() {
    var plugin = nativePlugin();
    if (!plugin || typeof plugin.ledgerRead !== 'function') return Promise.resolve(false);
    return plugin.ledgerRead({ name: ledgerName() }).then(function (result) {
      if (!result || !result.value) { persistNative(); return false; }
      var saved = JSON.parse(result.value);
      if (!saved || saved.merchant !== merchant()) return false;
      put(qKey(), JSON.stringify(Array.isArray(saved.queue) ? saved.queue : []));
      put(dKey(), JSON.stringify(Array.isArray(saved.done) ? saved.done : []));
      put(rKey(), JSON.stringify(saved.reprints && typeof saved.reprints === 'object' ? saved.reprints : {}));
      if (saved.hub && saved.hub.deviceId === deviceId()) put(HUB_KEY, JSON.stringify(saved.hub));
      records = Array.isArray(saved.records) ? saved.records.slice(-MAX_RECORDS) : [];
      record('native-restored', null);
      return true;
    }).catch(function () { record('native-restore-failed', null, { error: 'ledger-read' }); return false; });
  }
  function exportDiagnostics() {
    return JSON.stringify({ exportedAt: Date.now(), merchant: merchant(), status: status(), transitions: records.slice(-MAX_RECORDS) }, null, 2);
  }

  window.addEventListener('online', retryNow);
  window.addEventListener('kiwi:printer-config', retryNow);
  window.addEventListener('kiwi:station-printers-config', retryNow);
  window.addEventListener('storage', function (e) {
    if (e.key === HUB_KEY || (e.key && e.key.indexOf(QUEUE_PREFIX) === 0)) { emit(); flush(); }
  });
  setInterval(renewHub, HUB_RENEW_MS);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { emit(); if (readQueue().length) { schedule(); flush(); } });
  else { emit(); if (readQueue().length) { schedule(); flush(); } }

  window.KiwiKitchenPrint = {
    enqueue: enqueue, flush: flush, retryNow: retryNow, status: status,
    enqueueReceipt: enqueueReceipt, exportDiagnostics: exportDiagnostics,
    isHub: isHub, setHub: setHub, pending: function () { return readQueue().length; },
    maxAge: MAX_AGE,
    /* Test seams: intentionally read-only outside the automated test harness. */
    _readQueue: readQueue, _alreadyDone: alreadyDone,
  };
  window.KiwiKitchenPrint.ready = restoreNative().then(function () { emit(); if (readQueue().length) { schedule(); flush(); } });
})();
