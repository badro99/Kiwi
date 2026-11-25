/* Caisse · l'état de la file d'impression se lit depuis le serveur.
 *
 * Browse, 25 nov. 2026 : de 13:03 à la fin du service, la caisse n'a plus
 * déposé un seul bon ni reçu sur le relais, pendant que les tickets test et la
 * réimpression directe sortaient. Le serveur voyait les commandes arriver et
 * rien partir ; ce qui bloquait vivait dans la file de l'iPad, et personne ne
 * pouvait la lire sans être au comptoir.
 *
 * Toutes les minutes, tant que la caisse est à l'écran, l'état de la file
 * (KiwiKitchenPrint.diag : bons en attente, erreurs, derniers passages, rien du
 * contenu des bons) part au document « printdiag » du commerce, une entrée par
 * appareil. Rien ne part si rien n'a changé, sauf un signe de vie toutes les
 * 5 min. Une entrée de plus de 12 h est retirée à l'écriture suivante.
 */
(function () {
  'use strict';
  if (typeof window === 'undefined' || typeof document === 'undefined' || window.KiwiPrintDiag) return;
  var FEATURE = 'printdiag', EVERY_MS = 60000, HEARTBEAT_MS = 5 * 60000, KEEP_MS = 12 * 3600000;
  var lastKey = '', lastAt = 0, busy = false;

  function ls(k) { try { return localStorage.getItem(k); } catch (_) { return null; } }
  /* La même clé que printer-bridge.js › currentMerchantKey. */
  function merchant() {
    var m = '';
    try {
      var R = window.KiwiKitchenRelay;
      if (R && typeof R.merchant === 'function') m = R.merchant() || '';
      if (!m) { var pv = JSON.parse(ls('kiwiPairedVenue') || 'null'); if (pv && (pv.merchant || pv.venueId)) m = pv.merchant || pv.venueId; }
      if (!m && ls('kiwiPaired') === '1') m = ls('kiwiLiveMerchant') || '';
    } catch (_) {}
    return m && m !== 'unpaired' ? String(m) : '';
  }
  function device() {
    try {
      if (window.KiwiNative && window.KiwiNative.deviceId) return String(window.KiwiNative.deviceId).slice(0, 60);
      return String(ls('kiwi:caisse:terminal-id:v1') || 'web').slice(0, 60);
    } catch (_) { return 'unknown'; }
  }
  function native() {
    try { var c = window.Capacitor; return !!(c && c.isNativePlatform && c.isNativePlatform()); } catch (_) { return false; }
  }
  /* Les versions réellement chargées : une caisse restée sur un vieux fichier se voit ici. */
  function stamps() {
    var out = {};
    try {
      Array.prototype.forEach.call(document.scripts || [], function (s) {
        var m = /\/(kitchen-print-queue|printer-bridge|transports|kitchen-relay|caisse-kitchen|receipt)\.js\?v=(\d+)/.exec(s.src || '');
        if (m) out[m[1]] = +m[2];
      });
    } catch (_) {}
    return out;
  }
  function routing() {
    try {
      var c = window.KiwiPrinter && window.KiwiPrinter.getStationConfig ? window.KiwiPrinter.getStationConfig() : null;
      return { profiles: c && c.profiles ? c.profiles.length : 0, bindings: c && c.bindings ? Object.keys(c.bindings).slice(0, 20) : [] };
    } catch (_) { return null; }
  }
  function snapshot() {
    var K = window.KiwiKitchenPrint;
    if (!K || typeof K.diag !== 'function') return null;
    var d;
    try { d = K.diag(); } catch (e) { d = { error: String(e && e.message || e).slice(0, 120) }; }
    d.native = native();
    d.routing = routing();
    d.stamps = stamps();
    d.name = String((window.KiwiNative && window.KiwiNative.deviceName) || document.title || '').slice(0, 60);
    return d;
  }
  /* Ce qui compte pour dire « ça a changé » : pas l'horloge des bons. */
  function keyOf(d) {
    return JSON.stringify([d.hub, d.running, d.lastError, d.recoverable, d.routing, d.stamps,
      (d.jobs || []).map(function (j) { return [j.id, j.tries, j.err, j.uncertain, j.relay]; }),
      (d.log || []).slice(-1)]);
  }

  function read(m) {
    return fetch('/api/store?feature=' + FEATURE + '&merchant=' + encodeURIComponent(m), { credentials: 'same-origin', cache: 'no-store' })
      .then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; });
  }
  function write(m, devices, baseRev) {
    return fetch('/api/store', {
      method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ feature: FEATURE, merchant: m, baseRev: Number(baseRev) || 0, data: { diag: devices } }),
    }).then(function (r) { return r.json().catch(function () { return null; }); }).catch(function () { return null; });
  }
  function merged(doc, id, snap) {
    var now = Date.now(), prev = doc && doc.data && doc.data.diag && typeof doc.data.diag === 'object' ? doc.data.diag : {}, out = {};
    Object.keys(prev).slice(0, 8).forEach(function (k) { if (k !== id && prev[k] && now - Number(prev[k].at || 0) < KEEP_MS) out[k] = prev[k]; });
    out[id] = snap;
    return out;
  }
  function upload(m, snap) {
    var id = device();
    return read(m).then(function (doc) {
      return write(m, merged(doc, id, snap), doc && doc.rev).then(function (res) {
        if (res && res.error === 'stale') return read(m).then(function (again) { return write(m, merged(again, id, snap), again && again.rev); });
        return res;
      });
    });
  }

  function tick(force) {
    try { if (document.hidden && !force) return; } catch (_) {}
    var m = merchant();
    if (busy || !m || typeof fetch !== 'function') return;
    var snap = snapshot();
    if (!snap) return;
    var key = keyOf(snap), now = Date.now();
    if (!force && key === lastKey && now - lastAt < HEARTBEAT_MS) return;
    snap.at = now;
    busy = true;
    upload(m, snap).then(function (res) {
      if (res && res.ok !== false) { lastKey = key; lastAt = now; }
    }, function () {}).then(function () { busy = false; });
  }

  window.KiwiPrintDiag = { tick: tick, snapshot: snapshot };
  setTimeout(function () { tick(true); }, 3000);
  setInterval(tick, EVERY_MS);
})();
