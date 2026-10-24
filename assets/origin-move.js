/* Origin retirement. Loaded before boot modules can create Kiwi preferences.
 * Fail closed on storage errors; never delete or export the old origin's data. */
(function () {
  'use strict';
  var old = location.hostname === 'kiwi-maroc.pages.dev';
  var receiving = location.hostname === 'kiwi-os.com' && /^\/origin-move(?:\.html)?$/.test(location.pathname);
  if (!old && !receiving) return;
  var initialState = true;
  try { initialState = document.currentScript && document.currentScript.dataset.hadState !== undefined
    ? document.currentScript.dataset.hadState === 'true' : Object.keys(localStorage).some(function (k) { return /^kiwi/i.test(k); }); } catch (_) {}
  var COPY = {
    fr: { title: 'Kiwi déménage vers kiwi-os.com', move: 'Déplacer cet appareil', login: 'Se reconnecter', ready: 'Les files sont vides. Vous pouvez déplacer cet appareil.', waiting: 'En attente : {s} ventes, {p} impressions, {o} autres opérations.', unknown: 'Impossible de vérifier toutes les files. Réessayez avant de déplacer cet appareil.', error: 'Déplacement impossible. Réessayez sur cet appareil, ou reconnectez-vous sur kiwi-os.com.', owner: 'Votre compte propriétaire doit se reconnecter sur kiwi-os.com.', go: 'Ouvrir Kiwi', retry: 'Réessayer' },
    en: { title: 'Kiwi moves to kiwi-os.com', move: 'Move this device', login: 'Log in again', ready: 'The queues are empty. You can move this device.', waiting: 'Waiting: {s} sales, {p} print jobs, {o} other operations.', unknown: 'Unable to check every queue. Retry before moving this device.', error: 'Unable to move. Retry on this device, or log in again on kiwi-os.com.', owner: 'Your owner account needs to log in again on kiwi-os.com.', go: 'Open Kiwi', retry: 'Retry' },
    ar: { title: 'ينتقل Kiwi إلى kiwi-os.com', move: 'نقل هذا الجهاز', login: 'تسجيل الدخول مجدداً', ready: 'قوائم الانتظار فارغة. يمكنك نقل هذا الجهاز.', waiting: 'قيد الانتظار: {s} مبيعات، {p} مهام طباعة، {o} عمليات أخرى.', unknown: 'تعذّر التحقق من جميع القوائم. أعد المحاولة قبل نقل الجهاز.', error: 'تعذّر النقل. أعد المحاولة على هذا الجهاز أو سجل الدخول على kiwi-os.com.', owner: 'يجب تسجيل دخول حساب المالك مجدداً على kiwi-os.com.', go: 'فتح Kiwi', retry: 'إعادة المحاولة' }
  };
  function copy() {
    var lang = document.documentElement.lang || 'fr';
    try { lang = window.KiwiCaisseLang ? window.KiwiCaisseLang.get() : localStorage.getItem('kiwiLang') || lang; } catch (_) {}
    return COPY[lang] || COPY[lang.split('-')[0]] || COPY.fr;
  }
  function empty(q) { return !!q && ['sales', 'prints', 'other', 'unknown'].every(function (k) { return q[k] === 0; }); }
  function localQueues() {
    var q = { sales: 0, prints: 0, other: 0, unknown: 0 };
    try {
      Object.keys(localStorage).forEach(function (key) {
        if (!/^kiwi/i.test(key) || !/queue/i.test(key)) return;
        var rows = JSON.parse(localStorage.getItem(key));
        if (!Array.isArray(rows)) { if (rows && Object.keys(rows).length) q.unknown++; return; }
        var type = /sale/i.test(key) ? 'sales' : /print/i.test(key) ? 'prints' : 'other';
        q[type] += rows.length;
      });
      // Include in-memory write failures and in-flight print work as well.
      var sales = window.KiwiLive && window.KiwiLive.queueStatus && window.KiwiLive.queueStatus();
      if (sales) { q.sales = Math.max(q.sales, (sales.total || 0) + (sales.foreign || 0)); if (sales.storageError) q.unknown++; }
      if (window.KiwiKitchenRelay && window.KiwiKitchenRelay.pending) q.other = Math.max(q.other, window.KiwiKitchenRelay.pending());
      var printer = window.KiwiKitchenPrint;
      var print = printer && printer.status && printer.status();
      if (print) q.prints = Math.max(q.prints, print.pending || 0, print.running ? 1 : 0);
    } catch (_) { q.unknown++; }
    return q;
  }
  function readDatabase(name, q) {
    return new Promise(function (resolve) {
      var req, db, done = false;
      var timer = setTimeout(function () { finish(true); }, 3000);
      function finish(error) {
        if (done) return;
        done = true; clearTimeout(timer);
        if (error) q.unknown++;
        if (db) db.close();
        resolve();
      }
      try {
        req = indexedDB.open(name);
        req.onupgradeneeded = function () { req.transaction.abort(); finish(true); };
        req.onerror = req.onblocked = function () { finish(true); };
        req.onsuccess = function () {
          db = req.result;
          if (done) { db.close(); return; }
          var store = name === 'kiwi-runtime-v1' ? 'outbox' : 'queues';
          if (!db.objectStoreNames.contains(store)) { finish(true); return; }
          var tx = db.transaction(store, 'readonly');
          var cursor = tx.objectStore(store).openCursor();
          cursor.onsuccess = function () {
            var c = cursor.result;
            if (!c) return;
            if (store === 'outbox') q[c.value.channel === 'sale' ? 'sales' : 'other']++;
            else if (Array.isArray(c.value)) q.other += c.value.length;
            else q.unknown++;
            c.continue();
          };
          tx.oncomplete = function () { finish(false); };
          tx.onerror = tx.onabort = function () { finish(true); };
        };
      } catch (_) { finish(true); }
    });
  }
  async function queues() {
    var q = localQueues();
    try {
      if (!window.indexedDB || !indexedDB.databases) { q.unknown++; return q; }
      var databases = await indexedDB.databases();
      await Promise.all(databases.filter(function (db) { return db.name === 'kiwi-runtime-v1' || db.name === 'kiwiEmployeePunchQueue'; })
        .map(function (db) { return readDatabase(db.name, q); }));
    } catch (_) { q.unknown++; }
    return q;
  }
  // Exposed for the deterministic queue safety property, no data projection.
  window.KiwiOriginMove = { queues: queues, empty: empty };
  var panel, status, button, busy = false, serverPrints = 0, failure = false;
  var owner = /^\/dashboard(?:\.html)?$/.test(location.pathname);
  function terminalId() { try { return localStorage.getItem('kiwi:caisse:terminal-id:v1') || ''; } catch (_) { return ''; } }
  function role() { return /kiwi-cuisine/.test(location.pathname) ? 'kitchen' : /kiwi-serveur/.test(location.pathname) ? 'waiter' : 'till'; }
  function text(q) {
    var c = copy();
    if (failure) return c.error;
    if (q.unknown) return c.unknown;
    var p = Math.max(q.prints, serverPrints);
    if (q.sales || p || q.other) return c.waiting.replace('{s}', q.sales).replace('{p}', p).replace('{o}', q.other);
    return owner ? c.owner : c.ready;
  }
  async function refresh() {
    var q = await queues();
    if (old && !owner) {
      try {
        var remote = await post({ action: 'status', role: role(), terminalId: terminalId() });
        serverPrints = remote.prints || 0;
        owner = !!remote.login;
      } catch (_) { q.unknown++; }
    }
    if (!panel) return q;
    panel.querySelector('strong').textContent = copy().title;
    status.textContent = text(q);
    button.textContent = receiving ? copy().retry : owner ? copy().login : copy().move;
    button.disabled = busy || !empty(q) || serverPrints > 0;
    return q;
  }
  async function post(body) {
    var response = await fetch('/api/origin-move', { method: 'POST', credentials: 'same-origin', cache: 'no-store',
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    var data = await response.json();
    if (!response.ok) { serverPrints = data.prints || 0; throw new Error('move-refused'); }
    return data;
  }
  var incoming = receiving ? new URLSearchParams(location.hash.slice(1)).get('kiwi-move') : '';
  // Remove the bearer before any network request or other script can observe it.
  if (receiving) history.replaceState(null, '', location.pathname + location.search);
  function preferences() {
    var result = {};
    ['kiwiLang', 'kiwiCaisseLang', 'kiwiTheme', 'kiwiDashTheme', 'kiwiPrinterCfg', 'kiwi:posDevice'].forEach(function (key) {
      try { var value = localStorage.getItem(key); if (value !== null && value.length <= 1024) result[key] = value; } catch (_) {}
    });
    return result;
  }
  async function move() {
    if (busy) return;
    busy = true; failure = false; button.disabled = true;
    // Prevent new work in this tab while the handoff is being requested.
    panel.classList.add('origin-moving');
    try {
      var q = await queues();
      if (!empty(q)) return;
      if (receiving) {
        var previous = JSON.parse(localStorage.getItem('kiwiPairedVenue') || 'null');
        if (!window.KiwiPairingCommit) throw new Error('pairing-unavailable');
        var data = await post({ action: 'exchange', token: incoming, queues: q, merchant: previous && previous.merchant || '' });
        // Pairing fields only, never copy account sessions, staff credentials or offline books.
        if (!window.KiwiPairingCommit.commit('', data).ok) throw new Error('pairing-unavailable');
        Object.keys(data.preferences || {}).forEach(function (key) {
          if (localStorage.getItem(key) === null) localStorage.setItem(key, data.preferences[key]);
        });
        if (data.deviceId) localStorage.setItem('kiwi:caisse:terminal-id:v1', data.deviceId);
        incoming = '';
        location.replace(data.path);
      } else if (owner) {
        location.assign('https://kiwi-os.com' + location.pathname + location.search);
      } else {
        var result = await post({ action: 'issue', role: role(), terminalId: terminalId(), queues: q, preferences: preferences() });
        // A second tab may have enqueued work while the server answered.
        if (!empty(await queues())) return;
        location.assign('https://kiwi-os.com/origin-move#kiwi-move=' + result.token);
      }
    } catch (_) { failure = !serverPrints; }
    finally { busy = false; panel.classList.remove('origin-moving'); await refresh(); }
  }
  function mount() {
    var sheet = document.createElement('link'); sheet.rel = 'stylesheet'; sheet.href = '/assets/origin-move.css'; document.head.appendChild(sheet);
    panel = document.createElement('aside'); panel.className = 'origin-move'; panel.setAttribute('aria-label', copy().title);
    var icon = document.createElement('span'); icon.className = 'material-symbols-outlined'; icon.textContent = 'move_up'; icon.setAttribute('aria-hidden', 'true');
    var title = document.createElement('strong'); title.textContent = copy().title;
    status = document.createElement('p'); status.setAttribute('role', 'status');
    button = document.createElement('button'); button.type = 'button'; button.disabled = true; button.textContent = copy().move;
    button.addEventListener('click', move);
    panel.append(icon, title, status, button); document.body.appendChild(panel);
    if (window.KiwiCaisseLang) window.KiwiCaisseLang.subscribe(refresh);
    window.addEventListener('kiwi:langchange', refresh);
    refresh();
    setInterval(function () { if (!busy) { refresh(); } }, 5000);
    if (receiving && incoming) move();
  }
  var firstCheck = queues();
  function ready() {
    firstCheck.then(async function (q) {
      if (old && !initialState && empty(q) && empty(await queues())) { location.replace('https://kiwi-os.com' + location.pathname + location.search); return; }
      mount();
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ready, { once: true });
  else ready();
})();
