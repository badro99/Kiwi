/* Kiwi Offline DB — durable, tenant-scoped command outbox.
 *
 * Dexie is deliberately hidden behind this small API. Feature modules enqueue
 * business commands; they never depend on IndexedDB tables or Dexie itself.
 * That keeps migrations possible and prevents one merchant, tab or vertical
 * from replaying another merchant's work.
 *
 * Invariants:
 *   - command ids are stable and unique (retrying cannot duplicate an action)
 *   - every row carries an explicit tenant and channel
 *   - one sender owns a short lease; another tab cannot send the same row
 *   - permanent rejections remain inspectable instead of blocking the queue
 *   - legacy localStorage queues are removed only after a committed migration
 */
(function () {
  'use strict';

  var Dexie = window.Dexie;
  var DB_NAME = 'kiwi-runtime-v1';
  var LEASE_MS = 30000;
  var MAX_ATTEMPTS = 1000;
  var db = null;
  var openError = null;
  var listeners = new Set();
  var instanceId = Math.random().toString(36).slice(2);
  var channel = null;
  try { if (window.BroadcastChannel) channel = new BroadcastChannel('kiwi-outbox-v1'); } catch (_) {}

  function cleanPart(value, max) {
    return String(value == null ? '' : value).trim().slice(0, max || 96);
  }
  function now() { return Date.now(); }
  function clone(value) {
    try { return structuredClone(value); }
    catch (_) { return JSON.parse(JSON.stringify(value)); }
  }
  function token() {
    try { return window.crypto.randomUUID(); }
    catch (_) { return now() + '-' + Math.random().toString(36).slice(2); }
  }
  function signal(detail, remote) {
    detail = detail || {};
    listeners.forEach(function (fn) { try { fn(detail); } catch (_) {} });
    try { window.dispatchEvent(new CustomEvent('kiwi:outbox', { detail: detail })); } catch (_) {}
    if (!remote) {
      try { if (channel) channel.postMessage({ source: instanceId, detail: detail }); } catch (_) {}
    }
  }
  if (channel) channel.onmessage = function (event) {
    var message = event && event.data;
    if (!message || message.source === instanceId) return;
    signal(message.detail || { type: 'change' }, true);
  };
  function assertScope(tenant, channel) {
    tenant = cleanPart(tenant, 96);
    channel = cleanPart(channel, 48);
    if (!tenant || !channel) throw new Error('KiwiOffline requires an explicit tenant and channel');
    return { tenant: tenant, channel: channel };
  }
  function assertId(id) {
    id = cleanPart(id, 128);
    if (!id) throw new Error('KiwiOffline requires a stable command id');
    return id;
  }

  if (Dexie) {
    db = new Dexie(DB_NAME);
    db.version(1).stores({
      outbox: '&id, tenant, channel, [tenant+channel], state, nextAt, createdAt, leaseUntil, updatedAt',
      meta: '&key, updatedAt',
    });
  } else {
    openError = new Error('Dexie is unavailable');
  }

  var readyPromise = db ? db.open().then(function () {
    /* Persistent storage is a best-effort durability improvement. Browsers may
       decline it; the outbox remains valid IndexedDB either way. */
    try {
      if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(function () {});
    } catch (_) {}
    return true;
  }).catch(function (err) {
    openError = err || new Error('IndexedDB could not be opened');
    return false;
  }) : Promise.resolve(false);

  function ready() { return readyPromise; }
  function available() { return !!db && !openError; }

  function enqueue(channel, tenant, payload, opts) {
    opts = opts || {};
    var scope;
    try { scope = assertScope(tenant, channel); }
    catch (err) { return Promise.reject(err); }
    var id;
    try { id = assertId(opts.id || (payload && payload.id)); }
    catch (err) { return Promise.reject(err); }
    return ready().then(function (ok) {
      if (!ok) throw openError || new Error('Offline database unavailable');
      return db.transaction('rw', db.outbox, function () {
        return db.outbox.get(id).then(function (existing) {
          if (existing) {
            /* The id is global by design. A collision across tenants is not a
               duplicate we can accept: it is an ownership error. */
            if (existing.tenant !== scope.tenant || existing.channel !== scope.channel) {
              throw new Error('Outbox id already belongs to another scope');
            }
            /* A refund approval is deliberately short-lived. If the till was
               offline past its expiry, the manager re-authorises the SAME
               immutable refund and we replace only that queued command's
               capability. The stable id, tenant and channel cannot change. */
            if (opts.replaceExisting) {
              var refreshedAt = now();
              return db.outbox.update(id, {
                payload: clone(payload), state: 'pending', attempts: 0,
                updatedAt: refreshedAt, nextAt: refreshedAt,
                leaseToken: '', leaseUntil: 0, lastStatus: 0, lastError: '',
              }).then(function () {
                signal({ type: 'replace', tenant: scope.tenant, channel: scope.channel, id: id });
                return { ok: true, duplicate: true, replaced: true, id: id };
              });
            }
            return { ok: true, duplicate: true, id: id };
          }
          var at = now();
          return db.outbox.add({
            id: id,
            tenant: scope.tenant,
            channel: scope.channel,
            payload: clone(payload),
            state: 'pending',
            attempts: 0,
            createdAt: Number(opts.createdAt) || at,
            updatedAt: at,
            nextAt: at,
            leaseToken: '',
            leaseUntil: 0,
            lastStatus: 0,
            lastError: '',
          }).then(function () {
            signal({ type: 'enqueue', tenant: scope.tenant, channel: scope.channel, id: id });
            return { ok: true, duplicate: false, id: id };
          });
        });
      });
    });
  }

  function claim(channel, tenant, opts) {
    opts = opts || {};
    var scope;
    try { scope = assertScope(tenant, channel); }
    catch (err) { return Promise.reject(err); }
    return ready().then(function (ok) {
      if (!ok) throw openError || new Error('Offline database unavailable');
      return db.transaction('rw', db.outbox, function () {
        var at = now();
        return db.outbox.where('[tenant+channel]').equals([scope.tenant, scope.channel]).toArray().then(function (rows) {
          rows = rows.filter(function (row) {
            return row && (row.state === 'pending' && (opts.force || (+row.nextAt || 0) <= at)
              || row.state === 'sending' && (+row.leaseUntil || 0) <= at);
          }).sort(function (a, b) { return (+a.createdAt || 0) - (+b.createdAt || 0); });
          var row = rows[0];
          if (!row) return null;
          var lease = token();
          return db.outbox.update(row.id, {
            state: 'sending', leaseToken: lease, leaseUntil: at + LEASE_MS, updatedAt: at,
          }).then(function () {
            row.state = 'sending';
            row.leaseToken = lease;
            row.leaseUntil = at + LEASE_MS;
            return row;
          });
        });
      });
    });
  }

  function acknowledge(id, leaseToken) {
    id = assertId(id);
    return ready().then(function (ok) {
      if (!ok) throw openError || new Error('Offline database unavailable');
      return db.transaction('rw', db.outbox, function () {
        return db.outbox.get(id).then(function (row) {
          if (!row) return false;
          if (leaseToken && row.leaseToken !== leaseToken) return false;
          return db.outbox.delete(id).then(function () {
            signal({ type: 'ack', tenant: row.tenant, channel: row.channel, id: id });
            return true;
          });
        });
      });
    });
  }

  function reject(id, leaseToken, opts) {
    id = assertId(id);
    opts = opts || {};
    return ready().then(function (ok) {
      if (!ok) throw openError || new Error('Offline database unavailable');
      return db.transaction('rw', db.outbox, function () {
        return db.outbox.get(id).then(function (row) {
          if (!row || leaseToken && row.leaseToken !== leaseToken) return false;
          var attempts = Math.min(MAX_ATTEMPTS, (+row.attempts || 0) + 1);
          var permanent = !!opts.permanent;
          /* 2s, 4s, 8s … capped at five minutes. The first successful online
             event still asks the transport to flush immediately. */
          var delay = Math.min(300000, 1000 * Math.pow(2, Math.min(8, attempts)));
          return db.outbox.update(id, {
            state: permanent ? 'blocked' : 'pending',
            attempts: attempts,
            nextAt: permanent ? Number.MAX_SAFE_INTEGER : now() + delay,
            updatedAt: now(),
            leaseToken: '',
            leaseUntil: 0,
            lastStatus: Math.max(0, Math.min(999, +opts.status || 0)),
            lastError: cleanPart(opts.error || '', 180),
          }).then(function () {
            signal({ type: permanent ? 'blocked' : 'retry', tenant: row.tenant, channel: row.channel, id: id });
            return true;
          });
        });
      });
    });
  }

  function list(channel, tenant) {
    var scope = assertScope(tenant, channel);
    return ready().then(function (ok) {
      if (!ok) throw openError || new Error('Offline database unavailable');
      return db.outbox.where('[tenant+channel]').equals([scope.tenant, scope.channel]).sortBy('createdAt');
    });
  }

  function stats(channel, tenant) {
    return list(channel, tenant).then(function (rows) {
      return rows.reduce(function (out, row) {
        out.total++;
        if (row.state === 'blocked') out.blocked++;
        else out.pending++;
        if (row.state === 'sending') out.sending++;
        return out;
      }, { pending: 0, blocked: 0, sending: 0, total: 0, storageError: false });
    }).catch(function () {
      return { pending: 0, blocked: 0, sending: 0, total: 0, storageError: true };
    });
  }

  function migrateLegacy(storageKey, channel, mapRow) {
    var rows;
    try { rows = JSON.parse(localStorage.getItem(storageKey) || '[]'); }
    catch (_) { rows = []; }
    if (!Array.isArray(rows) || !rows.length) return ready().then(function () { return 0; });
    return ready().then(function (ok) {
      if (!ok) throw openError || new Error('Offline database unavailable');
      var records = rows.map(function (row) {
        var mapped = mapRow ? mapRow(row) : row;
        /* A row we cannot identify must stay in the legacy queue for support;
           silently skipping it and then deleting the source would be loss. */
        if (!mapped) throw new Error('Legacy outbox contains an unscoped command');
        var scope = assertScope(mapped.tenant, channel);
        var payload = mapped.payload || mapped;
        return {
          id: assertId(mapped.id || (payload && payload.id)),
          tenant: scope.tenant,
          channel: scope.channel,
          payload: clone(payload),
          state: mapped.blocked || mapped._blocked ? 'blocked' : 'pending',
          attempts: 0,
          createdAt: +mapped.createdAt || +(payload && payload.ts) || now(),
          updatedAt: now(),
          nextAt: mapped.blocked || mapped._blocked ? Number.MAX_SAFE_INTEGER : now(),
          leaseToken: '', leaseUntil: 0,
          lastStatus: +(mapped.status || mapped._status) || 0,
          lastError: '',
        };
      });
      return db.transaction('rw', db.outbox, function () {
        return Promise.all(records.map(function (record) {
          return db.outbox.get(record.id).then(function (existing) {
            if (existing && (existing.tenant !== record.tenant || existing.channel !== record.channel)) {
              throw new Error('Legacy outbox id belongs to another scope');
            }
            return existing ? false : db.outbox.add(record).then(function () { return true; });
          });
        }));
      }).then(function (added) {
        /* This is the commit marker: only a completed transaction may retire
           the legacy queue. A crash before here leaves the original untouched. */
        localStorage.removeItem(storageKey);
        signal({ type: 'migrate', channel: channel, count: added.filter(Boolean).length });
        return added.filter(Boolean).length;
      });
    });
  }

  function subscribe(fn) {
    listeners.add(fn);
    return function () { listeners.delete(fn); };
  }

  window.KiwiOffline = {
    version: 1,
    ready: ready,
    available: available,
    error: function () { return openError; },
    enqueue: enqueue,
    claim: claim,
    acknowledge: acknowledge,
    reject: reject,
    list: list,
    stats: stats,
    migrateLegacy: migrateLegacy,
    subscribe: subscribe,
  };
})();
