/* Durable department submissions. A lost response replays the same command key. */
import { post } from './hotel-economat-transport.js?v=20';
const prefix = 'kiwi:economat:outbox:';
const listeners = new Set(), running = new Map(), timers = new Map();
let dbPromise, fallback = false;
const merchants = new Set();
// A row replays only under the account that queued it, never under whoever signs in next.
function account() { try { return String(localStorage.getItem('kiwiAccountKey') || '').trim().toLowerCase(); } catch (_) { return ''; } }
// Storage never hangs the queue: a blocked open or a transaction that never settles
// ends in the localStorage fallback instead of an await that never returns.
export const storage = { deadline: 4000 };
function within(work, label) {
  let timer;
  const limit = new Promise((_, reject) => { timer = setTimeout(() => reject(Error(label)), storage.deadline); });
  return Promise.race([work, limit]).finally(() => clearTimeout(timer));
}
function database() {
  if (!dbPromise) dbPromise = within(new Promise((resolve, reject) => {
    const r = indexedDB.open('kiwi-economat-outbox', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('merchants');
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    r.onblocked = () => reject(Error('idb-blocked'));
  }), 'idb-open-timeout').catch(error => { dbPromise = undefined; throw error; });
  return dbPromise;
}
function readLocal(key) { try { return localStorage.getItem(key); } catch (_) { return null; } }
// One read-modify-write on one bucket. In IndexedDB it is a single readwrite
// transaction, so a tab without Web Locks cannot overwrite rows another tab added.
async function mutate(merchant, change) {
  const key = prefix + merchant;
  merchants.add(merchant);
  const viaLocal = () => {
    const next = change(JSON.parse(localStorage.getItem(key) || '[]'));
    localStorage.setItem(key, JSON.stringify(next));
    return next;
  };
  if (readLocal(key) !== null) return viaLocal();
  try {
    if (fallback) throw Error('fallback');
    const db = await database();
    return await within(new Promise((resolve, reject) => {
      const tx = db.transaction('merchants', 'readwrite');
      const store = tx.objectStore('merchants');
      let next;
      const read = store.get(key);
      read.onsuccess = () => {
        try { next = change(JSON.parse(JSON.stringify(read.result || []))); store.put(next, key); }
        catch (error) { reject(Object.assign(error, { fromChange: true })); try { tx.abort(); } catch (_) { /* already closed */ } }
      };
      tx.oncomplete = () => resolve(next);
      tx.onerror = tx.onabort = () => reject(tx.error || Error('storage-failed'));
    }), 'idb-transaction-timeout');
  } catch (error) {
    if (error && error.fromChange) throw error;
    fallback = true;
    return viaLocal();
  }
}
async function stored(merchant, value, cache = false) {
  const key = prefix + (cache ? 'cache:' : '') + merchant;
  if (!cache) merchants.add(merchant);
  // A bucket that fell back stays there across reloads, even if IDB recovers.
  try {
    const local = localStorage.getItem(key);
    if (local !== null) {
      if (value) localStorage.setItem(key, JSON.stringify(value));
      return value || JSON.parse(local);
    }
  } catch (_) { /* IDB remains available when localStorage is denied. */ }
  try {
    if (fallback) throw Error('fallback');
    const db = await database();
    return await within(new Promise((resolve, reject) => {
      const tx = db.transaction('merchants', value ? 'readwrite' : 'readonly');
      const r = value ? tx.objectStore('merchants').put(value, key) : tx.objectStore('merchants').get(key);
      tx.oncomplete = () => resolve(value || r.result || []);
      tx.onerror = tx.onabort = () => reject(tx.error || Error('storage-failed'));
    }), 'idb-transaction-timeout');
  } catch (_) {
    fallback = true;
    if (value) localStorage.setItem(key, JSON.stringify(value));
    return value || JSON.parse(localStorage.getItem(key) || '[]');
  }
}
function notify(merchant, rows) { listeners.forEach(fn => fn(merchant, rows)); }
export function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }
export async function snapshot(merchant) { return stored(merchant); }
// Sent rows only confirm the hand-off; the server list carries them after that.
function pruned(rows) {
  const sent = rows.filter(row => row.state === 'sent');
  return sent.length > 5 ? rows.filter(row => row.state !== 'sent' || sent.indexOf(row) >= sent.length - 5) : rows;
}
// Persists one row by its command key into the latest stored list, never the whole stale array.
async function persist(merchant, row) {
  return mutate(merchant, latest => {
    const at = latest.findIndex(other => other.body.idempotencyKey === row.body.idempotencyKey);
    if (at >= 0) latest[at] = row;
    return pruned(latest);
  });
}
function serial(merchant, fn) {
  const previous = running.get(merchant) || Promise.resolve();
  const next = previous.catch(() => {}).then(() => globalThis.navigator?.locks
    ? navigator.locks.request(prefix + merchant, fn) : fn());
  running.set(merchant, next);
  return next.finally(() => { if (running.get(merchant) === next) running.delete(merchant); });
}
export async function enqueueRequest(body, merchant) {
  if (!merchant || !body.idempotencyKey) throw Error('bad-request');
  await serial(merchant, async () => {
    const rows = await mutate(merchant, latest => {
      if (!latest.some(row => row.body.idempotencyKey === body.idempotencyKey)) {
        latest.push({ body:JSON.parse(JSON.stringify(body)), account:account(), state:'pending', phase:'create', attempts:0, next:0 });
      }
      return pruned(latest);
    });
    notify(merchant, rows);
  });
  void replay(merchant).catch(() => {});
}
// A refused request blocks the ones behind it until staff remove it.
export async function discard(merchant, key) {
  await serial(merchant, async () => {
    const rows = await mutate(merchant, latest => latest.filter(row => !(row.state === 'refused' && row.body.idempotencyKey === key)));
    notify(merchant, rows);
  });
  return replay(merchant, true);
}
export function replay(merchant, reconnect = false) {
  if (!merchant) return Promise.resolve();
  return serial(merchant, async () => {
    clearTimeout(timers.get(merchant));
    const rows = await stored(merchant);
    let view = rows;
    for (const row of rows) {
      if (row.state === 'sent') continue;
      if ((row.account || '') !== account()) continue;
      if (row.state === 'refused') break;
      if (globalThis.navigator?.onLine === false) break;
      if (!reconnect && row.next > Date.now()) { schedule(merchant, row.next - Date.now()); break; }
      try {
        if (row.phase === 'create') {
          const created = await post(row.body, merchant);
          row.submit = { action:'submit', id:row.body.id, revision:created.request.revision,
            idempotencyKey:'ui:' + row.body.id + ':submit:r' + created.request.revision };
          row.phase = 'submit';
          view = await persist(merchant, row);
        }
        await post(row.submit, merchant);
        row.state = 'sent'; row.error = ''; row.next = 0;
        view = await persist(merchant, row);
      } catch (e) {
        row.error = String(e.message || 'offline');
        /* 401 (session expirée), 408 et 429 sont transitoires : la demande reste
           en file avec son attente, sans bloquer par un refus définitif. */
        if (e.status >= 400 && e.status < 500 && ![401, 408, 429].includes(e.status)) row.state = 'refused';
        else { row.attempts++; row.next = Date.now() + Math.min(60000, 1000 * 2 ** Math.min(row.attempts - 1, 6)); }
        view = await persist(merchant, row);
        if (row.state === 'pending') schedule(merchant, row.next - Date.now());
        break;
      }
    }
    notify(merchant, view);
  });
}
function schedule(merchant, delay) {
  const timer = setTimeout(() => { void replay(merchant).catch(() => {}); }, delay);
  timer.unref?.(); timers.set(merchant, timer);
}
if (globalThis.addEventListener) globalThis.addEventListener('online', () => {
  merchants.forEach(merchant => { clearTimeout(timers.get(merchant)); void replay(merchant, true).catch(() => {}); });
});

// Reads are cached per account and role: a shared device never serves one user's
// projection to the next. A cached answer is returned marked stale, with its age.
function readScope() {
  let role = '';
  try { role = String(localStorage.getItem('kiwiRole') || '').trim().toLowerCase(); } catch (_) { /* no role stored */ }
  return account() + '|' + role + '|';
}
export async function cached(url, load) {
  if (!/[?&]merchant=/.test(url)) return load();
  const key = readScope() + url;
  try {
    const value = await load();
    try { await stored(key, { value, at: Date.now() }, true); } catch (_) { /* Reads still work when storage is full. */ }
    return value;
  } catch (e) {
    if (e.status >= 400 && e.status < 500) throw e;
    const entry = await stored(key, undefined, true);
    if (entry && entry.value && typeof entry.value === 'object' && !Array.isArray(entry.value)) {
      return Object.assign({}, entry.value, { _stale: { at: Number(entry.at) || 0 } });
    }
    throw e;
  }
}
