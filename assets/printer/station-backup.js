/* Caisse · le routage des imprimantes par poste a une copie au serveur.
 *
 * Browse, 25 nov. 2026 : le routage par poste (quelle imprimante pour la
 * cuisine, le bar, les reçus) n'existait que dans le localStorage de la
 * caisse (assets/printer-bridge.js › kiwiStationPrinters:<commerce>). Perdu
 * sur l'appareil, il était perdu tout court, et la caisse cessait d'envoyer
 * ses tickets sans que personne ne le voie.
 *
 * Chaque enregistrement (setStationConfig annonce « kiwi:station-printers-config »)
 * part aussi au document « printstations » du commerce (functions/api/store.js,
 * qui refuse déjà qu'un document vide en écrase un plein et garde l'historique).
 * Au démarrage, une caisse dont la clé de routage a DISPARU reprend la copie du
 * serveur. Une caisse où quelqu'un a vidé le routage exprès garde son choix : la
 * clé existe alors, vide. La première fois, une caisse qui a un routage et dont
 * le serveur n'a rien le dépose, pour que la copie existe tout de suite.
 */
(function () {
  'use strict';
  if (typeof window === 'undefined' || typeof document === 'undefined' || window.KiwiStationBackup) return;
  var FEATURE = 'printstations', PREFIX = 'kiwiStationPrinters:';
  var restoring = false;

  function ls(k) { try { return localStorage.getItem(k); } catch (_) { return null; } }
  function tr(s) { try { var L = window.KiwiCaisseLang; return L && L.tr ? L.tr(s) : s; } catch (_) { return s; } }
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
  function clean(cfg) {
    var c = cfg && typeof cfg === 'object' ? cfg : {};
    return { profiles: Array.isArray(c.profiles) ? c.profiles.slice(0, 40) : [],
      bindings: c.bindings && typeof c.bindings === 'object' && !Array.isArray(c.bindings) ? c.bindings : {} };
  }
  function full(cfg) { return !!(cfg && cfg.profiles && cfg.profiles.length); }
  function toast(msg) {
    var stack = document.getElementById('toast-stack');
    if (!stack) return;
    var el = document.createElement('div');
    el.className = 'toast is-info';
    el.textContent = msg;
    stack.appendChild(el);
    setTimeout(function () { try { el.remove(); } catch (_) {} }, 6000);
  }

  function read(m) {
    return fetch('/api/store?feature=' + FEATURE + '&merchant=' + encodeURIComponent(m), { credentials: 'same-origin', cache: 'no-store' })
      .then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; });
  }
  function write(m, cfg, baseRev) {
    return fetch('/api/store', {
      method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ feature: FEATURE, merchant: m, baseRev: Number(baseRev) || 0, data: clean(cfg) }),
    }).then(function (r) { return r.json().catch(function () { return null; }); }).catch(function () { return null; });
  }
  /* Une écriture à partir de la dernière révision ; une course perdue se relit une fois. */
  function upload(m, cfg) {
    if (!m || typeof fetch !== 'function') return Promise.resolve(null);
    return read(m).then(function (doc) {
      return write(m, cfg, doc && doc.rev).then(function (res) {
        if (res && res.error === 'stale') return read(m).then(function (again) { return write(m, cfg, again && again.rev); });
        return res;
      });
    });
  }

  function onSaved(ev) {
    if (restoring) return;
    var m = merchant();
    if (!m) return;
    var cfg = clean(ev && ev.detail);
    if (!full(cfg)) return;   // un routage vidé reste local : la copie du serveur reste là pour le retrouver
    upload(m, cfg);
  }

  function boot() {
    var m = merchant(), P = window.KiwiPrinter;
    if (!m || !P || typeof P.getStationConfig !== 'function' || typeof fetch !== 'function') return;
    var missing = ls(PREFIX + m) == null && ls('kiwiStationPrinters') == null;
    read(m).then(function (doc) {
      var saved = doc && doc.data ? clean(doc.data) : null;
      if (missing && full(saved) && typeof P.setStationConfig === 'function') {
        restoring = true;
        try { P.setStationConfig(saved); } finally { restoring = false; }
        toast(tr('Routage des imprimantes restauré depuis le serveur'));
        return;
      }
      var local = clean(P.getStationConfig());
      if (!full(saved) && full(local)) upload(m, local);
    });
  }

  window.addEventListener('kiwi:station-printers-config', onSaved);
  window.KiwiStationBackup = { boot: boot, upload: upload };
  setTimeout(boot, 1500);
})();
