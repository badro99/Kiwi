/* Durable fallback for refused client queue writes. No queue keys belong here. */
(function () {
  'use strict';
  var mirror = Object.create(null), pending = Object.create(null), db = null, loading;
  function copy(list) { return JSON.parse(JSON.stringify(list)); }
  function union(first, second) {
    var seen = new Set();
    return first.concat(second).filter(function (item) {
      var token = typeof item === 'string' ? 's:' + item : 'r:' + item.ref;
      if (seen.has(token)) return false;
      seen.add(token); return true;
    });
  }
  function write(key, list) {
    return new Promise(function (resolve) {
      if (!db) { resolve(false); return; }
      try {
        var tx = db.transaction('queues', 'readwrite'), store = tx.objectStore('queues');
        if (list === null) store.delete(key); else store.put(copy(list), key);
        tx.oncomplete = function () { resolve(true); };
        tx.onerror = tx.onabort = function () { resolve(false); };
      } catch (_) { resolve(false); }
    });
  }
  var vault = window.KiwiOutboxVault = {
    loaded: false,
    get: function (key) { return copy(mirror[key] || []); },
    save: function (key, list) {
      mirror[key] = copy(list);
      if (!vault.loaded) { pending[key] = true; return vault.load().then(function () { return false; }); }
      return write(key, mirror[key]);
    },
    drop: function (key) {
      if (!vault.loaded) return Promise.resolve(false);
      delete mirror[key]; return write(key, null);
    },
    load: function () {
      if (loading) return loading;
      loading = new Promise(function (resolve) {
        var finished = false, timer;
        function finish() {
          if (finished) return;
          finished = true;
          if (timer && typeof clearTimeout === 'function') clearTimeout(timer);
          vault.loaded = true;
          Object.keys(pending).forEach(function (key) { write(key, mirror[key]); });
          pending = Object.create(null);
          resolve();
        }
        try {
          if (typeof indexedDB === 'undefined') { finish(); return; }
          var request = indexedDB.open('kiwi-clients-outbox-vault', 1);
          request.onupgradeneeded = function () { request.result.createObjectStore('queues'); };
          request.onerror = request.onblocked = finish;
          request.onsuccess = function () {
            if (finished) { request.result.close(); return; }
            db = request.result;
            db.onversionchange = function () { db.close(); db = null; };
            try {
              var tx = db.transaction('queues', 'readonly'), cursor = tx.objectStore('queues').openCursor();
              cursor.onsuccess = function () {
                var row = cursor.result;
                if (!row || finished) return;
                if (Array.isArray(row.value)) mirror[row.key] = union(mirror[row.key] || [], row.value);
                row.continue();
              };
              tx.oncomplete = tx.onerror = tx.onabort = finish;
            } catch (_) { finish(); }
          };
          if (typeof setTimeout === 'function') timer = setTimeout(finish, 3000);
        } catch (_) { finish(); }
      });
      return loading;
    },
  };
  function attach() { if (window.KiwiClients && typeof window.KiwiClients.attachOutboxVault === 'function') window.KiwiClients.attachOutboxVault(vault); }
  if (window.addEventListener) window.addEventListener('load', function () { attach(); if (vault.loaded && window.KiwiClients) window.KiwiClients.sync(); });
  vault.load().then(function () {
    try { if (window.KiwiClients) { attach(); window.KiwiClients.sync(); } } catch (_) {}
  });
})();
