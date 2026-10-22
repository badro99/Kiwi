/* Kiwi Pro · appairage. L'appairage de la caisse est copié dans le
 * trousseau (KiwiPrinterSocket.secureSet) et restauré au lancement quand le
 * stockage web a été vidé ; une révocation de compte pose une barrière que
 * seul un nouvel appairage lève. Partie du runtime natif (native-runtime.js). */
(function () {
  'use strict';
  var N = window.__kiwiNativeRuntime;
  if (!N) return;
  var socket = N.socket, call = N.call;
  var pairingKeys = ['kiwiPaired', 'kiwiPairedVenue', 'kiwiLiveMerchant', 'kiwiLive'];
  var nativeIdentityKeys = pairingKeys.concat(['kiwiPairings']);
  var NATIVE_REVOKED_FLAG = 'kiwi:native:identity-revoked:v1';
  function secureGet(key) { return call(socket, 'secureGet', { key: key }).then(function (r) { return r && typeof r.value === 'string' ? r.value : null; }); }
  function secureSet(key, value) { return value == null ? call(socket, 'secureRemove', { key: key }) : call(socket, 'secureSet', { key: key, value: String(value) }); }
  function pairingSnapshot() {
    var out = {};
    try { pairingKeys.forEach(function (key) { var value = localStorage.getItem(key); if (value != null) out[key] = value; }); } catch (_) {}
    return out.kiwiPaired === '1' && out.kiwiPairedVenue ? JSON.stringify(out) : '';
  }
  function savePairing() { var value = pairingSnapshot(); return secureSet('pairing-v1', value || null); }
  function clearLocalPairingIdentity() {
    try { nativeIdentityKeys.forEach(function (key) { localStorage.removeItem(key); }); } catch (_) {}
    try { sessionStorage.removeItem('kiwiNativePairingRestored'); } catch (_) {}
  }
  function clearRevocationFence() {
    try { localStorage.removeItem(NATIVE_REVOKED_FLAG); } catch (_) {}
    try { window.__kiwiAccountRevoked = false; } catch (_) {}
  }
  function revokeIdentity() {
    try { window.__kiwiAccountRevoked = true; } catch (_) {}
    try { localStorage.setItem(NATIVE_REVOKED_FLAG, '1'); } catch (_) {}
    clearLocalPairingIdentity();
    secureSet('face-unlock-v1', null);
    /* This is intentionally only the secure pairing blob. Sales, queues and
     * other offline evidence stay on-device for later recovery/export. */
    return secureSet('pairing-v1', null);
  }
  function restorePairing() {
    var fenced = false;
    try { fenced = window.__kiwiAccountRevoked === true || localStorage.getItem(NATIVE_REVOKED_FLAG) === '1'; } catch (_) {}
    if (fenced) return revokeIdentity().then(function () { return false; });
    return secureGet('pairing-v1').then(function (raw) {
      if (!raw || pairingSnapshot()) return false;
      try {
        var saved = JSON.parse(raw);
        if (!saved || saved.kiwiPaired !== '1' || !saved.kiwiPairedVenue) return false;
        pairingKeys.forEach(function (key) { if (typeof saved[key] === 'string') localStorage.setItem(key, saved[key]); });
        sessionStorage.setItem('kiwiNativePairingRestored', '1');
        location.reload();
        return true;
      } catch (_) { return false; }
    });
  }
  function commitPairingFromSurface(event) {
    var snapshot = pairingSnapshot();
    if (!snapshot) return Promise.resolve(false);
    /* The shared pairing commit is the only production writer of these keys.
     * Match its event to the freshly written venue before releasing a native
     * revocation fence, then persist that exact snapshot first. A synthetic
     * event cannot resurrect the old secure blob because revokeIdentity removed
     * it and this path only clears the fence after secureSet succeeds. */
    try {
      var saved = JSON.parse(snapshot);
      var detail = event && event.detail;
      var venue = JSON.parse(saved.kiwiPairedVenue || 'null');
      if (detail && detail.merchant && (!venue || venue.merchant !== detail.merchant)) return Promise.resolve(false);
    } catch (_) { return Promise.resolve(false); }
    return savePairing().then(function () {
      clearRevocationFence();
      return true;
    });
  }
  /* Partagé avec les morceaux suivants du runtime natif. */
  N.secureGet = secureGet; N.secureSet = secureSet; N.savePairing = savePairing;
  N.revokeIdentity = revokeIdentity; N.restorePairing = restorePairing;
  N.commitPairingFromSurface = commitPairingFromSurface;
})();
