/* Propriétaire de la file des ventes. La fabrique ne lit aucun stockage avant create().
 * API : enqueue(ticket), peek() legacy ou peek(tenant) durable, ack(id, bail),
 * migrateLegacy() et count(). Les méthodes de reprise/quarantaine gardent leurs
 * contrats historiques ; enqueueCommand reçoit les remboursements déjà validés.
 * KiwiOffline reste le moteur générique transactionnel ; ce module seul choisit le canal sale. */
(function () {
  'use strict';
  function create(ctx) {
/* <<queue:state:0>> */
  var Q_KEY = 'kiwiSaleQueue';
/* <</queue:state:0>> */
/* <<queue:state:1>> */
  var OUTBOX_CHANNEL = 'sale';
/* <</queue:state:1>> */
/* <<queue:state:2>> */
  var outboxUsing = false;
/* <</queue:state:2>> */
/* <<queue:state:3>> */
  var outboxStatus = { pending: 0, blocked: 0, sending: 0, total: 0, storageError: false, lastStatus: 0, lastError: '', lastAttemptAt: 0 };
/* <</queue:state:3>> */
/* <<queue:state:4>> */
  var outboxInitPromise = null, outboxSubscribed = false;
/* <</queue:state:4>> */
/* <<queue:state:5>> */
  var flushing = false, queueStorageError = false, queueRecoveryError = false, queueBlocked = false;
/* <</queue:state:5>> */
/* <<queue:state:6>> */
  var flushStartedAt = 0;
/* <</queue:state:6>> */
/* <<queue:state:7>> */
  var lastSyncStatus = 0, lastSyncError = '';
/* <</queue:state:7>> */
/* <<queue:state:8>> */
  var authRetryAt = 0, authRetryMerchant = '';
/* <</queue:state:8>> */
/* <<queue:state:9>> */
  var idbOwned = Object.create(null), idbInFlight = Object.create(null);
/* <</queue:state:9>> */
/* <<queue:qRead>> */
function qRead() {
    var raw;
    try { raw = localStorage.getItem(Q_KEY); } catch (_) { return []; }   // unreadable storage: writes report it
    if (raw === null) return [];
    try {
      var a = JSON.parse(raw);
      if (!Array.isArray(a)) throw new Error('queue-shape');
      return a;
    } catch (_) {
      /* Corrupt bytes may hold unsent money: they are moved aside, never
         overwritten, and the till keeps queuing new sales. The quarantine key
         keeps « recovery required » visible until support has read it. */
      try {
        localStorage.setItem(Q_KEY + ':quarantine:' + Date.now(), raw);
        localStorage.removeItem(Q_KEY);
        queueRecoveryError = true;
        return [];
      } catch (_) {
        // No room to move them: leave them in place and refuse to overwrite.
        queueRecoveryError = true;
        queueBlocked = true;
        return [];
      }
    }
  }
  function quarantined() {
    try { for (var i = 0; i < localStorage.length; i++) { if (String(localStorage.key(i)).indexOf(Q_KEY + ':quarantine:') === 0) return true; } } catch (_) {}
    return false;
  }
/* <</queue:qRead>> */
/* <<queue:queueSignal>> */
function queueSignal() {
    try { window.dispatchEvent(new CustomEvent('kiwi:sale-queue', { detail: queueStatus() })); } catch (_) {}
  }
/* <</queue:queueSignal>> */
/* <<queue:qWrite>> */
function qWrite(a) {
    qRead();
    if (queueBlocked) { queueSignal(); return false; }
    try {
      localStorage.setItem(Q_KEY, JSON.stringify(a));
      queueStorageError = false;
      queueSignal();
      return true;
    } catch (_) {
      queueStorageError = true;
      queueSignal();
      return false;
    }
  }
/* <</queue:qWrite>> */
/* <<queue:quarantineRows>> */
function quarantineRows() {
    var active = ctx.merchant(), O = window.KiwiOffline;
    var legacy = qRead().filter(function (r) { return r && r.merchant === active && r._blocked; });
    var read = O && O.available() && O.list ? O.list(OUTBOX_CHANNEL, active) : Promise.resolve([]);
    return read.then(function (rows) {
      return legacy.concat(rows.filter(function (r) { return r.state === 'blocked'; }).map(function (r) {
        return Object.assign({}, r.payload, { _error: r.lastError, _status: r.lastStatus });
      }));
    });
  }
/* <</queue:quarantineRows>> */
/* <<queue:quarantineUpdate>> */
function quarantineUpdate(id, tenant, settled) {
    var O = window.KiwiOffline;
    var update = O && O.available() && O.quarantineState
      ? O.quarantineState(OUTBOX_CHANNEL, tenant, id, settled) : Promise.resolve(false);
    return update.then(function () {
      var rows = qRead();
      if (settled) rows = rows.filter(function (r) { return !(r.id === id && r.merchant === tenant && r._blocked); });
      else rows.forEach(function (r) { if (r.id === id && r.merchant === tenant && r._blocked) r._serverHeld = true; });
      qWrite(rows);
      return refreshOutboxStatus();
    });
  }
/* <</queue:quarantineUpdate>> */
/* <<queue:blockedDetails>> */
function blockedDetails(rows) {
    return rows.filter(function (r) { return r && r._blocked; }).map(function (r) {
      return { id: r.id, amountCents: Number(r.amountCents) || Math.round(Number(r.amount)*100) || 0,
        method: String(r.method || ''), ts: Number(r.ts) || 0, reason: r._error || 'unknown', status: r._status || 0 };
    });
  }
/* <</queue:blockedDetails>> */
/* <<queue:queueStatus>> */
function queueStatus() {
    var ackAt = 0;
    try { ackAt = Number(localStorage.getItem('kiwi:sale-ack:' + ctx.merchant())) || 0; } catch (_) {}
    if (outboxUsing) {
      // IndexedDB can be available while an individual enqueue fails. The
      // synchronous write-ahead/fallback queue remains debt, not an empty till.
      var fallback = qRead();
      var activeTenant = ctx.merchant();
      var localDebt = fallback.filter(function (row) { return row && row.merchant === activeTenant; });
      var localBlocked = localDebt.filter(function (row) { return row._blocked && !row._serverHeld; }).length;
      var oldest = Math.min(outboxStatus.oldestPendingAt || Infinity,
        localDebt.reduce(function (at, row) { return Math.min(at, Number(row.ts) || Infinity); }, Infinity));
      return {
        blockedEntries: (outboxStatus.blockedEntries || []).concat(blockedDetails(localDebt)),
        pending: (outboxStatus.pending || 0) + localDebt.filter(function (row) { return !row._blocked; }).length,
        held: (outboxStatus.held || 0) + localDebt.filter(function (row) { return row._blocked && row._serverHeld; }).length,
        blocked: (outboxStatus.blocked || 0) + localBlocked,
        sending: outboxStatus.sending,
        foreign: fallback.length - localDebt.length,
        total: (outboxStatus.total || 0) + localDebt.length,
        storageError: !!(outboxStatus.storageError || queueStorageError || queueRecoveryError || quarantined()),
        engine: 'indexeddb',
        lastStatus: outboxStatus.lastStatus || lastSyncStatus || 0,
        lastError: (queueRecoveryError || quarantined()) ? 'queue-recovery-required' : queueStorageError ? 'queue-storage-full' : (outboxStatus.lastError || lastSyncError || ''),
        lastAttemptAt: outboxStatus.lastAttemptAt || 0,
        oldestPendingAt: oldest === Infinity ? 0 : oldest,
        lastAcknowledgedAt: ackAt,
      };
    }
    var q = qRead();
    var active = ctx.merchant();
    var current = active ? q.filter(function (x) { return x && x.merchant === active; }) : q;
    return {
      blockedEntries: blockedDetails(current),
      pending: current.filter(function (r) { return !r._blocked; }).length,
      blocked: current.filter(function (x) { return x && x._blocked && !x._serverHeld; }).length,
      held: current.filter(function (x) { return x && x._blocked && x._serverHeld; }).length,
      foreign: q.length - current.length,
      total: current.length,
      storageError: !!(queueStorageError || queueRecoveryError || quarantined()),
      engine: 'localstorage',
      lastStatus: lastSyncStatus || 0,
      lastError: (queueRecoveryError || quarantined()) ? 'queue-recovery-required' : (lastSyncError || ''),
      lastAttemptAt: current.reduce(function (latest, row) { return Math.max(latest, +(row && row._lastAttemptAt) || 0); }, 0),
      oldestPendingAt: (function () {
        var oldest = current.reduce(function (at, row) { return Math.min(at, Number(row && row.ts) || Infinity); }, Infinity);
        return oldest === Infinity ? 0 : oldest;
      })(),
      lastAcknowledgedAt: ackAt,
    };
  }
/* <</queue:queueStatus>> */
/* <<queue:refreshOutboxStatus>> */
function refreshOutboxStatus() {
    var O = window.KiwiOffline;
    var active = ctx.merchant();
    if (!O || !O.available() || !active) return Promise.resolve(outboxStatus);
    return O.stats(OUTBOX_CHANNEL, active).then(function (status) {
      outboxStatus = status;
      outboxUsing = true;
      queueSignal();
      return status;
    });
  }
/* <</queue:refreshOutboxStatus>> */
/* <<queue:initOutbox>> */
function initOutbox() {
    qRead();
    if (queueBlocked) return Promise.resolve(false);
    if (outboxUsing) return Promise.resolve(true);
    if (outboxInitPromise) return outboxInitPromise;
    var O = window.KiwiOffline;
    if (!O) return Promise.resolve(false);
    try {
      if (!outboxSubscribed) O.subscribe(function (event) {
        if (!event || !event.channel || event.channel === OUTBOX_CHANNEL) refreshOutboxStatus();
      });
      outboxSubscribed = true;
    } catch (_) {}
    outboxInitPromise = O.migrateLegacy(Q_KEY, OUTBOX_CHANNEL, function (row) {
      if (!row || !row.id || !row.merchant) return null;
      return {
        id: row.id,
        tenant: row.merchant,
        payload: row,
        blocked: !!row._blocked,
        status: row._status, error: row._error, lastReactivatedComparison: row._lastReactivatedComparison, lastReactivatedAt: row._lastReactivatedAt,
        createdAt: row.ts,
      };
    }).then(function () {
      outboxUsing = true;
      queueStorageError = false;
      return refreshOutboxStatus().then(function () { return true; });
    }).catch(function () {
      outboxUsing = false;
      return false;
    }).finally(function () { outboxInitPromise = null; });
    return outboxInitPromise;
  }
/* <</queue:initOutbox>> */
/* <<queue:flushLegacyQueue>> */
function flushLegacyQueue() {
    if (flushing || (typeof navigator !== 'undefined' && navigator.onLine === false)) return Promise.resolve(queueStatus());
    if (authRetryMerchant === ctx.merchant() && authRetryAt > Date.now()) { ctx.scheduleRecovery(); return Promise.resolve(queueStatus()); }
    var q = qRead();
    if (!q.length) return Promise.resolve(queueStatus());
    var active = ctx.merchant();
    if (!active) { queueSignal(); return Promise.resolve(queueStatus()); }
    /* A rejected record stays available for support but cannot hold every valid
       sale behind it hostage. A queue can also survive a terminal re-pairing:
       retain the former merchant's debt for support, but never submit it with
       the new merchant's till cookie or let it block the new store's sales. */
    var body = q.find(function (x) { return x && !x._blocked && x.merchant === active && !(x._retryAfter > Date.now()); });
    if (!body) {
      if (q.some(function (x) { return x && !x._blocked && x.merchant === active; })) ctx.scheduleRecovery();
      queueSignal(); return Promise.resolve(queueStatus());
    }
    flushing = true;
    var attemptedAt = Date.now();
    return new Promise(function (resolve) {
      function done(settled, blocked, status, pending, error, serverId) {
        flushing = false;
        lastSyncStatus = status || 0;
        lastSyncError = settled ? '' : (error || (pending ? 'settlement-pending' : (status ? 'HTTP ' + status : 'server-unreachable')));
        if ((status === 401 || status === 403) && !ctx.refundApprovalRefused(body, status, error)) { authRetryAt = Date.now() + 60000; authRetryMerchant = body.merchant; ctx.recoverTillProof(status, lastSyncError); }
        else if (settled) authRetryAt = 0;
        var current = qRead();
        current.forEach(function (x) { if (x && x.id === body.id) x._lastAttemptAt = attemptedAt; });
        if (settled) {
          var rest = current.filter(function (x) { return x && x.id !== body.id; });
          qWrite(rest);
          ctx.moneySignal(body, 'accepted', status, serverId);
          ctx.pingLocal();                           // the row exists now — tell the dashboards
          if (rest.some(function (x) { return x && !x._blocked; })) return resolve(flushLegacyQueue());
          return resolve(queueStatus());
        }
        if (pending) {
          current.forEach(function (x) { if (x && x.id === body.id) { x._retryAfter = Date.now() + 3000; x._settlementPending = true; } });
          qWrite(current);
          ctx.moneySignal(body, 'retry', status);
          ctx.pingLocal();
          ctx.scheduleRecovery();
          return resolve(flushLegacyQueue());
        }
        if (blocked) {
          current.forEach(function (x) {
            if (x && x.id === body.id) { x._blocked = true; x._error = lastSyncError || 'unknown'; x._status = status || 0; x._blockedAt = Date.now(); }
          });
          qWrite(current);                       // retained, visible, skipped on the next send
          ctx.moneySignal(body, 'blocked', status);
          if (current.some(function (x) { return x && !x._blocked; })) return resolve(flushLegacyQueue());
          return resolve(queueStatus());
        } else {
          current.forEach(function (x) {
            if (x && x.id === body.id) {
              x._attempts = (Number(x._attempts) || 0) + 1;
              x._retryAfter = Date.now() + Math.min(300000, 3000 * Math.pow(2, Math.min(x._attempts - 1, 7)));
            }
          });
          qWrite(current);
          ctx.moneySignal(body, 'retry', status);
          ctx.scheduleRecovery();
          queueSignal();                          // offline/transient → unchanged and retryable
          return resolve(queueStatus());
        }
      }
      try {
        var controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
        var timeoutId = controller ? setTimeout(function () { controller.abort(); }, 12000) : null;
        ctx.moneyRequest(body, controller).then(function (r) {
          /* Only 2xx proves D1 accepted the sale. A structurally rejected body is
             quarantined for support, never deleted. Auth failures remain retryable:
             pairing/session repair can make the exact same sale valid later.
             409 conflicts (open-service-session-required, etc.) are reconcilable
             after table/session synchronization and must remain retryable. */
          /* A refund conflict is canonical rejection (the original is already
             fully refunded, voided, or the id is bound elsewhere), not a
             transient sale-session race. Sales retain their existing 409
             retry behavior for session synchronization. */
          var BLOCK = { 400: 1, 422: 1 };
          return ctx.paymentCompletion(r).then(function (result) {
            if (timeoutId) clearTimeout(timeoutId);
            done(result.complete, !!(r && (BLOCK[r.status] || r.status === 409
              && (body.kind === 'refund' || result.error === 'sale-conflict')
              || ctx.refundApprovalRefused(body, r.status, result.error))), r && r.status, result.pending, result.error, result.id);
          });
        }).catch(function (err) {
          if (timeoutId) clearTimeout(timeoutId);
          done(false, false, 0, false, err && (err.name === 'AbortError' ? 'timeout' : err.message) || 'server-unreachable');
        });
      } catch (_) { done(false, false, 0, false, 'server-unreachable'); }
    });
  }
/* <</queue:flushLegacyQueue>> */
/* <<queue:flushOutbox>> */
function flushOutbox(force) {
    // A retry can advance due work, never steal an in-flight sender's lock.
    if (flushing || !navigator.onLine) return Promise.resolve(outboxStatus);
    if (authRetryMerchant === ctx.merchant() && authRetryAt > Date.now()) { ctx.scheduleRecovery(); return Promise.resolve(outboxStatus); }
    var O = window.KiwiOffline;
    var active = ctx.merchant();
    if (!O || !active) { queueSignal(); return Promise.resolve(outboxStatus); }
    flushing = true;
    flushStartedAt = Date.now();
    return O.claim(OUTBOX_CHANNEL, active, { force: !!force }).then(function (row) {
      if (!row) {
        flushing = false;
        flushStartedAt = 0;
        return refreshOutboxStatus().then(function (state) {
          if (state && state.pending > 0) ctx.scheduleRecovery();
          return state;
        });
      }
      var body = row.payload;
      function settle(ok, permanent, status, error, serverId) {
        lastSyncStatus = status || 0;
        lastSyncError = ok ? '' : (error || (status ? 'HTTP ' + status : 'network'));
        if ((status === 401 || status === 403) && !ctx.refundApprovalRefused(body, status, error)) { authRetryAt = Date.now() + 60000; authRetryMerchant = body.merchant; ctx.recoverTillProof(status, lastSyncError); }
        else if (ok) authRetryAt = 0;
        var action = ok
          ? ack(row.id, row.leaseToken)
          : O.reject(row.id, row.leaseToken, { permanent: permanent, status: status, error: error });
        return action.then(function () {
          flushing = false;
          flushStartedAt = 0;
          if (ok) { ctx.moneySignal(body, 'accepted', status, serverId); ctx.pingLocal(); }
          else {
            ctx.moneySignal(body, permanent ? 'blocked' : 'retry', status);
            if (!permanent) ctx.scheduleRecovery();
            if (error === 'settlement-pending') ctx.pingLocal();
          }
          return refreshOutboxStatus();
        }).then(function (state) {
          if (state && state.pending > 0 && navigator.onLine) return flushOutbox(false);
          return state;
        });
      }
      var controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
      var timeoutId = controller ? setTimeout(function () { controller.abort(); }, 12000) : null;
      return ctx.moneyRequest(body, controller).then(function (response) {
        var BLOCK = { 400: 1, 422: 1 };
        return ctx.paymentCompletion(response).then(function (result) {
          if (timeoutId) clearTimeout(timeoutId);
          return settle(result.complete, !!(BLOCK[response.status] || response.status === 409
            && (body.kind === 'refund' || result.error === 'sale-conflict')
            || ctx.refundApprovalRefused(body, response.status, result.error)), response.status,
            result.pending ? 'settlement-pending' : (result.error || (response.ok ? 'unverified-response' : 'HTTP ' + response.status)), result.id);
        });
      }).catch(function (err) {
        if (timeoutId) clearTimeout(timeoutId);
        var errMsg = err && (err.name === 'AbortError' ? 'timeout' : err.message) || 'network';
        return settle(false, false, 0, errMsg);
      });
    }).catch(function () {
      flushing = false;
      flushStartedAt = 0;
      lastSyncStatus = 0;
      lastSyncError = 'storage-error';
      outboxStatus.storageError = true;
      queueSignal();
      return outboxStatus;
    });
  }
/* <</queue:flushOutbox>> */
/* <<queue:flushQueueNow>> */
function flushQueueNow(force) {
    if (force === true && !flushing) {
      authRetryAt = 0;
      const pending = qRead();
      pending.forEach(function (row) { if (row && row.merchant === ctx.merchant()) delete row._retryAfter; });
      if (pending.length) qWrite(pending);
    }
    if (outboxUsing && window.KiwiOffline && window.KiwiOffline.available()) {
      // A failed IDB enqueue is retained in localStorage. Do not abandon that
      // exact command merely because the IDB engine later becomes usable.
      // Stable receipt IDs make a simultaneous write-ahead replay idempotent.
      var active = ctx.merchant();
      if (qRead().some(function (row) { return row && row.merchant === active; })) {
        return flushLegacyQueue().then(function () { return flushOutbox(force === true); });
      }
      return flushOutbox(force === true);
    }
    return flushLegacyQueue();
  }
/* <</queue:flushQueueNow>> */
/* <<queue:retrySale>> */
function retrySale(entry, permit) {
    var active = ctx.merchant();
    if (!active || !entry) return Promise.resolve(false);
    var id = ctx.stableId(active, entry), rows = qRead();
    var row = rows.find(function (r) { return r.id === id && r.merchant === active; });
    if (row && row._blocked) {
      if (!permit || permit.id !== id || permit.merchant !== active || !permit.comparisonId
        || permit.changed !== 'visit-rule-relaxed' || permit.reason !== row._error
        || Number(permit.status) !== Number(row._status)
        || !['table-session-missing','service-session-table-mismatch','open-service-session-required','send-order-before-payment'].includes(permit.reason)
        || ![404,409].includes(Number(permit.status))
        || row._lastReactivatedComparison === permit.comparisonId
        || !Number.isSafeInteger(permit.comparedAt) || permit.comparedAt <= (row._lastReactivatedAt || 0)) return Promise.resolve(false);

    }
    var O = window.KiwiOffline;
    var ready = !O || !O.available() || !O.list ? Promise.resolve(true)
      : O.list(OUTBOX_CHANNEL, active).then(function (all) {
        var blocked = all.find(function (r) { return r.id === id && r.state === 'blocked'; });
        return blocked ? O.reactivate(OUTBOX_CHANNEL, active, id, permit) : true;
      });
    return ready.then(function (allowed) {
      if (!allowed) return false;
      // Do not unblock the fallback before the durable copy has validated the
      // same permit. Otherwise one copy could bypass the other's quarantine.
      if (row && row._blocked) {
        var fresh = qRead(), current = fresh.find(function(r) { return r.id === id && r.merchant === active; });
        if (!current || !current._blocked) return true;
        if (current._error !== row._error || current._status !== row._status
          || permit.comparedAt <= (current._lastReactivatedAt || 0)) return false;
        current._lastReactivatedComparison = permit.comparisonId; current._lastReactivatedAt = permit.comparedAt;
        delete current._blocked; delete current._status; delete current._blockedAt; delete current._retryAfter;
        return qWrite(fresh);
      }
      return true;
    });
  }
/* <</queue:retrySale>> */
/* <<queue:retryBlockedSales>> */
function retryBlockedSales() { return Promise.resolve(0); }
/* <</queue:retryBlockedSales>> */
/* <<queue:enqueueIndexedDbOnly>> */
function enqueueIndexedDbOnly(body, m, opts) {
    if (!idbInFlight[body.id]) {
      idbInFlight[body.id] = true;
      window.KiwiOffline.enqueue(OUTBOX_CHANNEL, m, body, {
        id: body.id, createdAt: body.ts, replaceExisting: !!opts.replaceExisting,
      }).then(function () {
        idbOwned[body.id] = m;
        return refreshOutboxStatus();
      }).then(function () {
        try { window.dispatchEvent(new CustomEvent('kiwi:money-enqueued', { detail: { id: body.id, merchant: m } })); } catch (_) {}
        ctx.pingLocal();
        ctx.flushQueue();
      }).catch(function () {
        outboxStatus.storageError = true;
        queueSignal();
      }).then(function () { delete idbInFlight[body.id]; });
    }
    return { ok: false, reason: 'queue-storage-full', id: body.id };
  }
/* <</queue:enqueueIndexedDbOnly>> */
/* <<queue:enqueueMoneyBody>> */
function enqueueMoneyBody(body, m, opts) {
    opts = opts || {};
    var q = outboxUsing ? [] : qRead();
    /* The same completed receipt can be observed by two local persistence
       paths. Stable IDs plus this local check prevent it entering the queue
       twice; the server-side primary key remains the second lock. */
    if (outboxUsing && window.KiwiOffline && window.KiwiOffline.available()) {
      if (idbOwned[body.id] === m && !opts.replaceExisting) {
        return { ok: true, queued: true, duplicate: true, durable: 'indexeddb', id: body.id };
      }
      /* WRITE-AHEAD COPY — enqueue() is asynchronous. Keep the exact command
         synchronously until IndexedDB owns it; this applies equally to a sale
         and its refund, whose financial ordering must survive a reload. */
      var writeAhead = qRead();
      var writeAheadAt = writeAhead.findIndex(function (x) { return x && x.id === body.id; });
      if (writeAheadAt < 0) {
        writeAhead.push(body);
        if (!qWrite(writeAhead)) return enqueueIndexedDbOnly(body, m, opts);
      } else if (opts.replaceExisting && writeAhead[writeAheadAt].merchant === m) {
        writeAhead[writeAheadAt] = body;
        if (!qWrite(writeAhead)) return enqueueIndexedDbOnly(body, m, opts);
      }
      window.KiwiOffline.enqueue(OUTBOX_CHANNEL, m, body, {
        id: body.id, createdAt: body.ts, replaceExisting: !!opts.replaceExisting,
      }).then(function () {
        qWrite(qRead().filter(function (x) { return x && x.id !== body.id; }));
        return refreshOutboxStatus();
      }).then(function () {
        ctx.pingLocal();
        ctx.flushQueue();
      }).catch(function () {
        var fallback = qRead();
        if (!fallback.some(function (x) { return x && x.id === body.id; })) fallback.push(body);
        qWrite(fallback);
        outboxStatus.storageError = true;
        queueSignal();
        flushLegacyQueue();
      });
      return { ok: true, queued: true, durable: 'indexeddb', id: body.id };
    }
    var existingAt = q.findIndex(function (x) { return x && x.id === body.id; });
    if (existingAt >= 0) {
      if (!opts.replaceExisting || q[existingAt].merchant !== m) {
        return { ok: true, queued: true, duplicate: true, id: body.id };
      }
      q[existingAt] = body;
      if (!qWrite(q)) return { ok: false, reason: 'queue-storage-full', id: body.id };
      ctx.pingLocal();
      ctx.flushQueue();
      return { ok: true, queued: true, duplicate: true, replaced: true, id: body.id };
    }
    q.push(body);
    if (!qWrite(q)) return { ok: false, reason: 'queue-storage-full', id: body.id };
    ctx.pingLocal();
    ctx.flushQueue();
    return { ok: true, queued: true, id: body.id };
  }
/* <</queue:enqueueMoneyBody>> */
/* <<queue:postSale>> */
function postSale(entry) {
    if (!ctx.on() || !entry) return;
    var rawAmt = entry.amountCents != null
      ? (Number(entry.amountCents) / 100)
      : Number(entry.amount || 0);
    var amountCents = entry.amountCents != null
      ? Math.round(Number(entry.amountCents))
      : Math.round(rawAmt * 100);
    var complimentary = entry.settlementKind === 'complimentary'
      && amountCents === 0
      && Number(entry.grossAmountCents) > 0
      && Number(entry.grossAmountCents) === Number(entry.discountAmountCents)
      && Array.isArray(entry.lines) && entry.lines.length > 0;
    /* Une vente réglée ENTIÈREMENT en avoir ne fait entrer aucun argent — la
       recette a été comptée à l'émission du bon — mais la marchandise est bien
       sortie. Un montant nul la faisait taire ici : le serveur n'apprenait
       jamais le panier, et le tableau de bord ne pouvait pas dire quels
       articles étaient partis. Elle passe si elle dit ce qui l'a réglée. */
    var storeCredit = entry.settlementKind === 'store-credit'
      && amountCents === 0
      && Number(entry.creditAmountCents) > 0
      && Array.isArray(entry.lines) && entry.lines.length > 0;
    var consignment = entry.settlementKind === 'consignment'
      && amountCents === 0
      && Number(entry.ticketAmountCents) > 0
      && Number(entry.consignedAmountCents) === Number(entry.ticketAmountCents)
      && Array.isArray(entry.lines) && entry.lines.length > 0;
    var receivable = entry.settlementKind === 'receivable'
      && amountCents === 0
      && Number(entry.ticketAmountCents) > 0
      && Array.isArray(entry.lines) && entry.lines.length > 0;
    if (!Number.isFinite(amountCents) || amountCents < 0
      || (amountCents === 0 && !complimentary && !storeCredit && !consignment && !receivable)) return;
    var amt = Math.round(amountCents / 100);
    // No resolved tenant ⇒ don't post. The server refuses an unattributed sale
    // (it used to file it under a shared 'default' bucket other stores read), so
    // this just skips a guaranteed 400 rather than changing behaviour.
    var m = ctx.merchant();
    if (!m) return;
    var held = ctx.tenantHold(m, [entry]);
    if (held) return held;
    /* The basket, compacted. {n,q,t} rather than {name,qty,total} because this
     * payload is replayed after an outage and also has to fit the emergency
     * localStorage fallback — a busy lunch service can hold a few hundred queued
     * sales, and the short keys are roughly a third of the bytes. Capped at 40 lines
     * and 60 chars per name, the same limits the till itself applies. */
    var lines = null;
    try {
      if (Array.isArray(entry.lines) && entry.lines.length) {
        // Une reprise du journal peut encore porter plus de 40 lignes.
        var boundedLines = window.KiwiPosSale?.foldLines ? window.KiwiPosSale.foldLines(entry.lines) : entry.lines;
        lines = boundedLines.slice(0, 40).map(function (l) {
          l = l || {};
          var o = {
            n: String(l.name || 'Article').slice(0, 60),
            q: Math.round(Math.max(0, +(l.qty ?? l.quantity) || 0) * 1000) / 1000 || 1,
            t: Math.round(Math.max(0, +l.total || 0) * 100) / 100,
          };
          /* `c` — la catégorie du produit telle qu'elle était au moment de la
           * vente. Elle n'est ajoutée que si la caisse la connaît : une clé
           * vide sur chacune des 40 lignes d'un panier alourdirait la file
           * hors-ligne pour ne rien dire de plus. */
          var c = String(l.cat || l.category || '').slice(0, 40);
          if (c) o.c = c;
          var baseName = String(l.baseName || '').slice(0, 60);
          if (baseName) o.bn = baseName;
          var i = String(l.itemId || l.item_id || '').slice(0, 80);
          var v = String(l.variantId || l.variant_id || '').slice(0, 80);
          var u = String(l.unit || '').slice(0, 24);
          var kd = String(l.kind || '').slice(0, 24);
          var r = String(l.recipeVersionId || l.recipe_version_id || '').slice(0, 80);
          if (i) o.i = i;
          if (v) o.v = v;
          if (u) o.u = u;
          if (kd) o.kd = kd;
          if (r) o.r = r;
          if (Array.isArray(l.formulaChoices)) {
            var formulaChoices = l.formulaChoices.slice(0, 30).map(function (choice) {
              return {
                n: String((choice && choice.name) || 'Choix').slice(0, 60),
                q: Math.round(Math.max(0, +(choice && choice.qty) || 1) * 1000) / 1000 || 1,
                t: Math.round(Math.max(0, +(choice && choice.total) || 0) * 100) / 100,
              };
            });
            if (formulaChoices.length) o.fc = formulaChoices;
          }
          var cost = +(l.unitCost ?? l.unit_cost);
          if (Number.isFinite(cost) && cost >= 0) o.k = Math.round(cost * 100) / 100;
          if (Array.isArray(l.options)) {
            var opts = l.options.slice(0, 16).map(function (x) {
              if (typeof x === 'string') return { i: x.slice(0, 80), q: 1 };
              var id = String((x && (x.id || x.i || x.itemId)) || '').slice(0, 80);
              var qty = Math.round((+(x && (x.qty ?? x.q)) || 1) * 1000) / 1000;
              return id ? { i: id, q: qty } : null;
            }).filter(Boolean);
            if (opts.length) o.o = opts;
          }
          /* La promotion de la carte qui a fixé le prix (assets/menu-promos.js) :
           * id, nom, et le total au prix normal, pour le rapport. */
          if (l.promo && l.promo.id) {
            o.pm = { i: String(l.promo.id).slice(0, 40), n: String(l.promo.name || '').slice(0, 60),
              f: Math.round(Math.max(0, +l.promo.full || 0) * 100) / 100 };
          }
          return o;
        });
      }
    } catch (_) { lines = null; }
    var body = {
      id: ctx.stableId(m, entry),                                 // stable receipt key = row PK
      merchant: m,
      amount: amt,                                            // MAD, legacy integer
      amountCents: amountCents,                               // MAD centimes, authoritative
      method: entry.method || 'cash',                         // cash|card|tap|qr|wallet
      label: entry.label || 'Vente',
      ref: entry.ref || '',
      // A Z job survives reload through IndexedDB, where Date becomes an ISO
      // string on older browsers. Preserve the original business day on replay.
      ts: (function () {
        var value = entry.time && entry.time.getTime ? entry.time.getTime()
          : (typeof entry.time === 'string' ? Date.parse(entry.time) : Number(entry.time));
        return Number.isFinite(value) && value > 0 ? value : Date.now();
      })(),
      lines: lines,                                           // null ⇒ unknown, never "empty basket"
    };
    if (complimentary) body.settlementKind = 'complimentary';
    if (storeCredit) {
      body.settlementKind = 'store-credit';
      body.creditAmountCents = Math.round(Number(entry.creditAmountCents));
    }
    if (consignment) body.settlementKind = 'consignment';
    if (receivable) body.settlementKind = 'receivable';
    if (entry.ticketAmountCents != null) {
      body.ticketAmountCents = Math.round(Number(entry.ticketAmountCents));
      body.consignedAmountCents = Math.round(Number(entry.consignedAmountCents || 0));
    }
    if (entry.retailBalance && typeof entry.retailBalance === 'object') {
      var rb = entry.retailBalance;
      body.retailBalance = {
        id: String(rb.id || '').slice(0, 64),
        customerId: String(rb.customerId || '').slice(0, 64),
        ticketRef: String(rb.ticketRef || '').slice(0, 64),
        totalCents: Math.round(Number(rb.totalCents)),
        stage: rb.stage === 'open' ? 'open' : 'payment',
      };
    }
    if (Array.isArray(entry.paymentParts) && entry.paymentParts.length) {
      body.paymentParts = entry.paymentParts.slice(0, 8).map(function (part) {
        return { method: String(part.method || '').slice(0, 16), amountCents: Math.round(Number(part.amountCents)) };
      });
    }
    if (entry.channel) body.channel = String(entry.channel).slice(0, 24);
    /* La fiche du destinataire d'une livraison (functions/api/_delivery-card.js). */
    if (entry.deliveryCard && typeof entry.deliveryCard === 'object') {
      var dc = entry.deliveryCard;
      body.deliveryCard = { name: String(dc.name || '').slice(0, 80), phone: String(dc.phone || '').slice(0, 24),
        city: String(dc.city || '').slice(0, 60), address: String(dc.address || '').slice(0, 200), note: String(dc.note || '').slice(0, 300) };
    }
    /* Le pourboire, hors du montant (recordSale le garde à part). */
    if (+entry.tip > 0) body.tipCents = Math.round(+entry.tip * 100);
    if (entry.orderId) body.orderId = String(entry.orderId).slice(0, 64);
    var session = ctx.serverSession(entry);
    if (session) body.session = session.slice(0, 64);
    if (entry.table) body.table = String(entry.table).slice(0, 32);
    if (entry.split && Number.isInteger(Number(entry.split.index)) && Number.isInteger(Number(entry.split.count))) {
      body.split = { index: Number(entry.split.index), count: Number(entry.split.count) };
      if (entry.split.flowId) body.split.flowId = String(entry.split.flowId).slice(0, 64);
    }
    if (entry.discountAmountCents != null) {
      body.grossAmountCents = Math.round(Number(entry.grossAmountCents));
      body.discountAmountCents = Math.round(Number(entry.discountAmountCents));
      body.discountReason = String(entry.discountReason || '').slice(0, 32);
      body.actorId = String(entry.actorId || '').slice(0, 96);
      body.discountKind = String(entry.discountKind || '').slice(0, 12);
      if (entry.discountPercent != null) body.discountPercent = Number(entry.discountPercent);
    }
    if (Array.isArray(entry.discountPercents)) body.discountPercents = entry.discountPercents.slice(0, 8).map(Number);
    return enqueueMoneyBody(body, m);
  }
/* <</queue:postSale>> */
    function ack(id, leaseToken) { return window.KiwiOffline.acknowledge(id, leaseToken); }
    function peek(tenant) {
      return tenant === undefined ? qRead() : peekDurable(tenant);
    }
    return { peek: peek, migrateLegacy: initOutbox, enqueueCommand: enqueueMoneyBody, enqueue: postSale, status: queueStatus, refresh: refreshOutboxStatus, flush: flushQueueNow, quarantineRows: quarantineRows, quarantineUpdate: quarantineUpdate, retry: retrySale, retryBlocked: retryBlockedSales, ack: ack, count: function () { return queueStatus().total; } };
  }
  function peekDurable(tenant) {
    return window.KiwiOffline.list('sale', tenant);
  }
  window.KiwiSaleQueueStore = { create: create, peek: peekDurable };
})();
