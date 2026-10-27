
  /* ─── caisse → server, with an offline queue ───
   * WiFi in a boutique drops. A sale that failed to reach D1 used to be lost for
   * good ("best-effort; offline queue is a later phase") and the owner's
   * dashboard silently under-counted the day. Every sale now carries a stable id
   * and waits in the IndexedDB outbox until the server confirms it, then retries
   * on reconnect and on every feed poll. Legacy browsers retain the original
   * localStorage fallback. That id is the row's PRIMARY KEY and
   * /api/sale does INSERT OR IGNORE, so retrying after a lost response can never
   * write the same sale twice. */
  /* <<queue-owner>> */
  var saleQueue = window.KiwiSaleQueueStore.create({ merchant: merchant, scheduleRecovery: scheduleRecovery, refundApprovalRefused: refundApprovalRefused, recoverTillProof: recoverTillProof, moneySignal: moneySignal, pingLocal: pingLocal, moneyRequest: moneyRequest, paymentCompletion: paymentCompletion, stableId: stableId, flushQueue: flushQueue, on: on, tenantHold: tenantHold, serverSession: serverSession });
  window.KiwiSaleQueue = saleQueue;
  /* <</queue-owner>> */
  /* <<queue:state:1>> */
  /* <<queue:state:2>> */
  /* <<queue:state:3>> */
  /* <<queue:qRead>> */
  /* <<queue:queueSignal>> */
  /* Never trim this array. The previous `slice(-200)` silently erased the
   * OLDEST takings during a long outage — exactly the sales least likely to
   * exist anywhere else. If storage itself is full, report failure and leave
   * the previous queue intact; the cashier UI turns that into a blocking red
   * support state instead of pretending synchronization is healthy. */
  /* <<queue:qWrite>> */
  function quarantineRows(...args) { return saleQueue.quarantineRows(...args); }
  function quarantineUpdate(...args) { return saleQueue.quarantineUpdate(...args); }
  /* <<queue:blockedDetails>> */
  function queueStatus(...args) { return saleQueue.status(...args); }

  function refreshOutboxStatus(...args) { return saleQueue.refresh(...args); }

  /* Move the old synchronous queue only after Dexie's transaction commits.
     Until then qRead/qWrite remain the fully working fallback, so an IndexedDB
     denial (private mode, storage policy, damaged profile) never loses a sale. */
  /* <<queue:state:4>> */
  function initOutbox(...args) { return saleQueue.migrateLegacy(...args); }
  function uid() {
    try {
      var c = window.crypto || window.msCrypto;
      if (c && c.randomUUID) return 'sale-' + c.randomUUID();
    } catch (_) {}
    return 'sale-' + Date.now() + '-' + Math.random().toString(36).slice(2, 10);
  }
  function stableId(merchantId, entry) {
    var source = String((entry && (entry.id || entry.ref)) || '');
    if (!source) return uid();
    if (!entry.id) return window.KiwiSaleIdentity(merchantId, entry);
    if (source.startsWith('visit-')) return source.slice(0, 64);
    /* FNV-1a: deterministic across reloads, short enough for the 64-char DB
       key, and includes the tenant so two shops may both own ticket #42. */
    /* A till whose ticket counter restarts every business day (nextSeq reads
       only today's journal) would hand tomorrow's ticket 1 the very id of
       today's ticket 1, and /api/sale would then replay (sale lost) or 409
       (sale refused) it. A ref-only entry therefore carries `idDay`, the
       business day stamped ONCE at ring-up (pos-sale.js), and it joins the
       seed. Entries without it (everything already stored or queued) keep the
       old formula, so their ids, and every retry of them, are unchanged. */
    var day = !entry.id && entry.idDay ? String(entry.idDay).replace(/[^0-9]/g, '').slice(0, 8) : '';
    var s = String(merchantId || '') + '|' + source + (day ? '|d' + day : ''), h = 2166136261;
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return 'sale-ref-' + (h >>> 0).toString(16) + '-' + source.replace(/[^a-zA-Z0-9_-]/g, '').slice(-32);
  }

  /* `flow-*` is a local split UI correlation token, not a D1 table visit.
     Keep every other session opaque: a genuine server session must still be
     checked by /api/sale and must never be silently invented or discarded. */
  function serverSession(entry) {
    var value = String((entry && entry.session) || '').trim();
    return /^flow-[a-z0-9-]+$/i.test(value) ? '' : value;
  }

  /* <<queue:state:5>> */
  /* <<queue:state:6>> */
  /* <<queue:state:7>> */
  var recoveryTimer = null;
  /* <<queue:state:8>> */
  /* #77 · A restaurant iPad kept its local pairing but lost the httpOnly
     kiwi_till cookie, so every queued sale came back 403 while the status pill
     waited for its own probe loop to notice. The device still carries its
     terminal proof: ask the server to reissue the till cookie the moment a sale
     is refused for it. Success fires `kiwi-paired`, which already re-flushes the
     same receipts; a refused recovery leaves the 60 s auth back-off in charge. */
  var terminalRecoveryAt = 0;
  function recoverTillProof(status, error) {
    if (status !== 401 && status !== 403) return;
    if (error && error !== 'forbidden-merchant' && error !== 'unauthorized' && !/^HTTP 40[13]$/.test(error)) return;
    var cp = window.KiwiCaissePairing;
    if (!cp || typeof cp.recoverFromTerminal !== 'function') return;
    if (terminalRecoveryAt && Date.now() - terminalRecoveryAt < 60000) return;
    terminalRecoveryAt = Date.now();
    try { Promise.resolve(cp.recoverFromTerminal()).catch(function () {}); } catch (_) {}
  }
  function scheduleRecovery() {
    if (recoveryTimer != null) return;
    recoveryTimer = setTimeout(function () { recoveryTimer = null; flushQueue(); }, 3000);
  }
  /* A refund carries a manager approval signed for ten minutes. Once a queued
     refund outlives it, /api/sale/refund answers 403 manager-required forever:
     no pairing repair can make that exact command valid again. Quarantine it
     (visible, never deleted) instead of retrying it every few seconds and
     pausing every real sale behind a 60-second auth back-off. */
  function refundApprovalRefused(body, status, error) {
    return !!(body && body.kind === 'refund' && status === 403 && error === 'manager-required');
  }
  function paymentCompletion(response) {
    if (!response) return Promise.resolve({ complete: false, pending: false, error: 'server-unreachable' });
    if (typeof response.json !== 'function') {
      return Promise.resolve({
        complete: false, pending: false,
        error: response.ok ? 'unverified-response' : ('HTTP ' + (response.status || 0)),
      });
    }
    /* Read the JSON on failures too. `/api/sale` distinguishes a lost till
       proof from a paused employee and an off-shift service account, but the
       client used to flatten every 403 into `HTTP 403`. That made the caisse
       mint and redeem another pairing every minute for errors pairing cannot
       repair. */
    return response.json().then(function (data) {
      if (!response.ok) return {
        complete: false, pending: false,
        error: String((data && data.error) || ('HTTP ' + response.status)).slice(0, 96),
      };
      // 2xx accepts the receipt, but only the body proves settlement completed.
      return { complete: !!(data && data.ok && !data.settlementPending), pending: !!(data && data.ok && data.settlementPending),
        error: '', id: String((data && data.id) || '') };
    }).catch(function () {
      // An unreadable acknowledgement stays retryable under the original ID.
      return { complete: false, pending: false, error: response.ok ? 'unverified-response' : ('HTTP ' + response.status) };
    });
  }

  /* A live queue flush is not an unload beacon. `keepalive:true` makes some
     tablet browsers reject an otherwise valid POST at the Fetch layer (most
     visibly as the useless "Failed to fetch"), especially once their global
     keepalive budget is occupied. The durable outbox already survives a page
     close, so use a normal credentialed request. If Fetch itself is broken on
     an older WebView, retry the SAME idempotent receipt through XHR. A response
     lost after the first POST is safe: /api/sale deduplicates that stable ID. */
  function xhrMoneyRequest(url, payload, signal) {
    if (typeof XMLHttpRequest === 'undefined') return Promise.reject(new Error('server-unreachable'));
    return new Promise(function (resolve, reject) {
      var xhr = new XMLHttpRequest();
      var settled = false;
      function cleanup() {
        if (signal && signal.removeEventListener) signal.removeEventListener('abort', abort);
      }
      function finish(fn, value) {
        if (settled) return;
        settled = true;
        cleanup();
        fn(value);
      }
      function abort() {
        try { xhr.abort(); } catch (_) {}
        finish(reject, Object.assign(new Error('timeout'), { name: 'AbortError' }));
      }
      try {
        xhr.open('POST', url, true);
        xhr.withCredentials = true;
        xhr.timeout = 12000;
        xhr.setRequestHeader('Content-Type', 'application/json');
        xhr.onload = function () {
          var text = String(xhr.responseText || '');
          finish(resolve, {
            ok: xhr.status >= 200 && xhr.status < 300,
            status: xhr.status,
            json: function () {
              try { return Promise.resolve(JSON.parse(text)); }
              catch (err) { return Promise.reject(err); }
            },
          });
        };
        xhr.onerror = function () { finish(reject, new Error('server-unreachable')); };
        xhr.ontimeout = function () { finish(reject, Object.assign(new Error('timeout'), { name: 'AbortError' })); };
        xhr.onabort = function () { finish(reject, Object.assign(new Error('timeout'), { name: 'AbortError' })); };
        if (signal && signal.addEventListener) signal.addEventListener('abort', abort, { once: true });
        if (signal && signal.aborted) return abort();
        xhr.send(payload);
      } catch (_) { finish(reject, new Error('server-unreachable')); }
    });
  }

  function moneyRequest(body, controller) {
    var url = body && body.kind === 'refund' ? '/api/sale/refund' : '/api/sale';
    var payload = JSON.stringify(body);
    var signal = controller ? controller.signal : undefined;
    return fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: payload,
      credentials: 'same-origin',
      cache: 'no-store',
      signal: signal,
    }).catch(function (err) {
      if (err && err.name === 'AbortError') throw err;
      return xhrMoneyRequest(url, payload, signal);
    });
  }

  /* <<queue:flushLegacyQueue>> */

  /* <<queue:flushOutbox>> */

  function flushQueue(force) {
    var sent = flushQueueNow(force);
    // Refused operations go to the owner's custody after each send attempt.
    var hand = function () { if (window.KiwiQuarantine) window.KiwiQuarantine.kick(); };
    if (sent && typeof sent.then === 'function') sent.then(hand, hand); else hand();
    return sent;
  }
  function flushQueueNow(...args) { return saleQueue.flush(...args); }

  // The comparison may authorise a retry ONLY after a known rule changed.
  // Missing remotely does not mean a conflicting/malformed receipt is valid.
  function retrySale(...args) { return saleQueue.retry(...args); }
  // Kept for old shells: a user clicking Retry is not new server evidence.
  function retryBlockedSales(...args) { return saleQueue.retryBlocked(...args); }

  /* localStorage full, IndexedDB still open. The write-ahead copy could not be
     written, so nothing is durable SYNCHRONOUSLY and the caller hears the
     truth: not queued. IndexedDB has its own, much larger quota, so the
     command is still handed to it; once it owns the stable id, the next
     postSale() for that id answers queued and the till releases its held
     copy (kiwi:money-enqueued says when, so it need not wait for a tick). */
  /* <<queue:state:9>> */
  /* <<queue:enqueueIndexedDbOnly>> */

  function enqueueMoneyBody(...args) { return saleQueue.enqueueCommand(...args); }

  /* Une caisse réappairée en plein service garde en mémoire le journal du
     commerce d'origine (assets/till-tenant.js). merchant() lit le commerce
     COURANT : sans ce garde, une vente de A partait chez B sous un nouvel
     identifiant. Une ligne qui dit où elle a été encaissée n'est postée que
     là. */
  function tenantHold(m, entries) {
    var locked = false;
    try { locked = !!(window.KiwiTillTenant && window.KiwiTillTenant.mismatch()); } catch (_) {}
    for (var i = 0; !locked && i < entries.length; i++) {
      var e = entries[i];
      if (e && e.merchant && String(e.merchant) !== m) locked = true;
    }
    return locked ? { ok: false, reason: 'tenant-mismatch' } : null;
  }

  // Check real writes before the counter takes money. Availability flags alone
  // do not prove storage works in private mode or after quota exhaustion.
  async function moneyStorageReady() {
    var key = 'kiwi:money-storage-probe';
    try {
      localStorage.setItem(key, '1');
      if (localStorage.getItem(key) === '1') {
        if (localStorage.removeItem) localStorage.removeItem(key);
        return true;
      }
    } catch (_) {}
    try {
      var offline = window.KiwiOffline;
      return !!(offline && offline.putMeta && await offline.putMeta(key, { checkedAt: Date.now() }));
    } catch (_) { return false; }
  }

  function postSale(...args) { return saleQueue.enqueue(...args); }

  function postRefund(entry, original, actor, opts) {
    if (!on() || !entry || !original) return;
    var m = merchant();
    if (!m) return;
    var held = tenantHold(m, [entry, original]);
    if (held) return held;
    /* Queue/reconcile the original first. Both commands share one ordered
       outbox, so an offline refund can never outrun a sale that was skipped
       while the till identity was still resolving. */
    var saleResult = postSale(original);
    var originalSaleId = String(original.serverSaleId || (saleResult && saleResult.id) || stableId(m, original));
    if (saleResult && saleResult.id) original.serverSaleId = saleResult.id;
    var amountCents = Math.abs(entry.amountCents != null
      ? Math.round(Number(entry.amountCents))
      : Math.round(Number(entry.amount || 0) * 100));
    if (!Number.isFinite(amountCents) || amountCents <= 0) return;
    actor = actor || entry.refundActor || {};
    if (!actor.approval) {
      return { ok: false, reason: 'manager-approval-required', id: stableId(m, entry) };
    }
    var body = {
      id: stableId(m, entry), merchant: m, kind: 'refund', originalSaleId: originalSaleId,
      amountCents: amountCents, method: entry.method || original.method || 'cash',
      label: entry.label || 'Remboursement', ref: entry.ref || '',
      reason: String(entry.reason || 'refund').slice(0, 80),
      actorId: String(actor.id || '').slice(0, 96), actor: String(actor.name || '').slice(0, 80),
      actorRole: String(actor.role || '').slice(0, 80),
      approval: String(actor.approval || '').slice(0, 1400),
      ts: (entry.time && entry.time.getTime) ? entry.time.getTime() : Date.now(),
    };
    return enqueueMoneyBody(body, m, { replaceExisting: !!(opts && opts.replaceExisting) });
  }
