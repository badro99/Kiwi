/* Durable fallback for refused client queue writes. No queue keys belong here.
 * Also the evidence desk of the client book: it says whether refused writes are held in memory only or confirmed in
 * IndexedDB (status), sets aside the raw bytes of an unreadable queue before a write can replace them (quarantine /
 * recoveryCopies, listed by queue-recovery.js), and caps a purchase event's lines without losing the stamp-bearing ones. */
(function () {
  'use strict';
  var mirror = Object.create(null), pending = Object.create(null), db = null, loading;
  var state = Object.create(null), kept = Object.create(null), QPREFIX = 'kiwi:clients-quarantine:v1:';
  function notify(name) { try { if (window.dispatchEvent && typeof Event === 'function') window.dispatchEvent(new Event(name)); } catch (_) {} }
  function mark(key, saved) { if (saved && state[key]) state[key] = 'vault'; notify('kiwi:clients-outbox'); return saved; }
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
      mirror[key] = copy(list); state[key] = 'memory'; notify('kiwi:clients-outbox');
      if (!vault.loaded) { pending[key] = true; return vault.load().then(function () { return false; }); }
      return write(key, mirror[key]).then(function (saved) { return mark(key, saved); });
    },
    drop: function (key) {
      if (!vault.loaded) return Promise.resolve(false);
      delete mirror[key]; delete state[key]; return write(key, null);
    },
    /* memoryOnly: queues whose last write was refused by localStorage and not (yet) confirmed in IndexedDB. */
    status: function () {
      var memoryOnly = [], vaulted = [];
      Object.keys(state).forEach(function (k) { (state[k] === 'vault' ? vaulted : memoryOnly).push(k); });
      return { memoryOnly: memoryOnly, vaulted: vaulted, quarantined: Object.keys(kept).length };
    },
    quarantine: function (key, raw) {
      if (!raw) return;
      var sum = 0; for (var i = 0; i < raw.length; i++) sum = (sum * 31 + raw.charCodeAt(i)) | 0;
      var id = QPREFIX + (sum >>> 0) + ':' + key;
      if (kept[id] !== undefined) return;
      kept[id] = raw;
      try { localStorage.setItem(id, raw); } catch (_) {}
      notify('kiwi:clients-quarantine');
    },
    /* recoveryCopies() lists, (key) reads, (key, true) acknowledges and removes. Same shape as the sale queue's. */
    recoveryCopies: function (key, acknowledge) {
      var keys = Object.keys(kept);
      try { for (var i = 0; i < localStorage.length; i++) { var k = String(localStorage.key(i)); if (k.indexOf(QPREFIX) === 0 && keys.indexOf(k) < 0) keys.push(k); } } catch (_) {}
      if (key === undefined) return keys.map(function (k) { var raw = kept[k] !== undefined ? kept[k] : (localStorage.getItem(k) || ''); return { key: k, bytes: 2 * (k.length + raw.length) }; });
      if (keys.indexOf(key) < 0) return null;
      var value = kept[key] !== undefined ? kept[key] : localStorage.getItem(key);
      if (acknowledge) { delete kept[key]; try { localStorage.removeItem(key); } catch (_) {} notify('kiwi:clients-quarantine'); }
      return value;
    },
    /* Lines of one purchase/refund event: at most 100; the ones for which hit(line) is true are kept first. */
    capLines: function (items, hit) {
      var list = Array.isArray(items) ? items : [];
      if (list.length <= 100) return { rows: list, dropped: 0 };
      var first = [], rest = [];
      list.forEach(function (it) { var yes = false; try { yes = !!hit(it); } catch (_) {} (yes ? first : rest).push(it); });
      return { rows: first.concat(rest).slice(0, 100), dropped: list.length - 100 };
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
          Object.keys(pending).forEach(function (key) { write(key, mirror[key]).then(function (saved) { mark(key, saved); }); });
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
  window.addEventListener('kiwi:clients-queue-corrupt', function (event) { var d = event && event.detail; if (d) vault.quarantine(d.key, d.raw); });
  function attach() { if (window.KiwiClients && typeof window.KiwiClients.attachOutboxVault === 'function') window.KiwiClients.attachOutboxVault(vault); }
  if (window.addEventListener) window.addEventListener('load', function () { attach(); if (vault.loaded && window.KiwiClients) window.KiwiClients.sync(); });
  vault.load().then(function () {
    try { if (window.KiwiClients) { attach(); window.KiwiClients.sync(); } } catch (_) {}
  });
})();
