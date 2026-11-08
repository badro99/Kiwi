/* DOM-free economat storage. One owner for where the outbox rows and the read cache live
   (IndexedDB first, localStorage when IndexedDB hangs or is blocked). It imports nothing, so the
   transport, the outbox and the cache can all depend on it without depending on each other. */
export const prefix = 'kiwi:economat:outbox:';
export const merchants = new Set();
let dbPromise, fallback = false, drainRetryAt = 0;
// A row replays only under the account that queued it, never under whoever signs in next.
export function account() { try { return String(localStorage.getItem('kiwiAccountKey') || '').trim().toLowerCase(); } catch (_) { return ''; } }
// Storage never hangs the queue: a blocked open or a transaction that never settles
// ends in the localStorage fallback instead of an await that never returns.
export const storage = { deadline: 4000 };
function within(work, label) {
  let timer;
  const limit = new Promise((_, reject) => { timer = setTimeout(() => reject(Error(label)), storage.deadline); });
  return Promise.race([work, limit]).finally(() => clearTimeout(timer));
}
function openDatabase(version) {
  return new Promise((resolve, reject) => {
    const r = version ? indexedDB.open('kiwi-economat-outbox', version) : indexedDB.open('kiwi-economat-outbox');
    r.onupgradeneeded = () => { if (!r.result.objectStoreNames || !r.result.objectStoreNames.contains('merchants')) r.result.createObjectStore('merchants'); };
    r.onsuccess = () => {
      const db = r.result;
      // A newer build upgrading the same database must not wait on this tab: let go, reopen on the next use.
      db.onversionchange = () => { try { db.close(); } catch (_) { /* already closed */ } dbPromise = undefined; };
      resolve(db);
    };
    r.onerror = () => reject(r.error);
    r.onblocked = () => reject(Error('idb-blocked'));
  });
}
function database() {
  // An upgraded database (a newer build ran here) refuses version 1: open whatever version it is now.
  if (!dbPromise) dbPromise = within(openDatabase(1).catch(error => (error && error.name === 'VersionError' ? openDatabase() : Promise.reject(error))), 'idb-open-timeout').catch(error => { dbPromise = undefined; throw error; });
  return dbPromise;
}
function readLocal(key) { try { return localStorage.getItem(key); } catch (_) { return null; } }
// Rows that were queued in IndexedDB before it hung stay owed. Two lists merge by command key,
// older list first so the order of the queue holds; the newer copy of a row wins.
export function union(older, newer) {
  const out = (Array.isArray(older) ? older : []).slice();
  for (const row of Array.isArray(newer) ? newer : []) {
    const at = out.findIndex(other => other && row && other.body && row.body && other.body.idempotencyKey === row.body.idempotencyKey);
    if (at >= 0) out[at] = row; else out.push(row);
  }
  return out;
}
// What IndexedDB still holds for a bucket, or null when it cannot be read right now.
async function idbRows(key) {
  if (Date.now() < drainRetryAt) return null;
  try {
    const db = await database();
    const rows = await within(new Promise((resolve, reject) => {
      const tx = db.transaction('merchants', 'readonly');
      const r = tx.objectStore('merchants').get(key);
      tx.oncomplete = () => resolve(r.result);
      tx.onerror = tx.onabort = () => reject(tx.error || Error('storage-failed'));
    }), 'idb-transaction-timeout');
    return Array.isArray(rows) ? rows : [];
  } catch (_) { drainRetryAt = Date.now() + 30000; return null; }
}
// Once the local bucket holds the queue, move what IndexedDB still carries into it and empty the
// IndexedDB copy, so no older unsent request stays invisible behind the local bucket.
async function drain(key) {
  const rows = await idbRows(key);
  if (!rows || !rows.length) return;
  try {
    localStorage.setItem(key, JSON.stringify(union(rows, JSON.parse(localStorage.getItem(key) || '[]'))));
    const db = await database();
    await within(new Promise((resolve, reject) => {
      const tx = db.transaction('merchants', 'readwrite');
      tx.objectStore('merchants').put([], key);
      tx.oncomplete = () => resolve();
      tx.onerror = tx.onabort = () => reject(tx.error || Error('storage-failed'));
    }), 'idb-transaction-timeout');
  } catch (_) { /* the local bucket already holds the rows; IndexedDB is emptied on a later write */ }
}
// One read-modify-write on one bucket. In IndexedDB it is a single readwrite
// transaction, so a tab without Web Locks cannot overwrite rows another tab added.
export async function mutate(merchant, change) {
  const key = prefix + merchant;
  merchants.add(merchant);
  const viaLocal = () => {
    const next = change(JSON.parse(localStorage.getItem(key) || '[]'));
    localStorage.setItem(key, JSON.stringify(next));
    return next;
  };
  if (readLocal(key) !== null) { await drain(key); return viaLocal(); }
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
    fallback = true; drainRetryAt = Date.now() + 30000;
    return viaLocal();
  }
}
export async function stored(merchant, value, cache = false) {
  const key = prefix + (cache ? 'cache:' : '') + merchant;
  if (!cache) merchants.add(merchant);
  // A bucket that fell back stays there across reloads, even if IDB recovers; a queue bucket
  // still reads what IndexedDB holds underneath it until a write has drained it.
  try {
    const local = localStorage.getItem(key);
    if (local !== null) {
      if (value) localStorage.setItem(key, JSON.stringify(value));
      if (value || cache) return value || JSON.parse(local);
      return union(await idbRows(key), JSON.parse(local));
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
    fallback = true; drainRetryAt = Date.now() + 30000;
    if (value) localStorage.setItem(key, JSON.stringify(value));
    return value || JSON.parse(localStorage.getItem(key) || '[]');
  }
}

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
