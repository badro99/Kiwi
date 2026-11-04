/* Durable department submissions. A lost response replays the same command key. */
import { post } from './hotel-economat-transport.js?v=16';
const prefix = 'kiwi:economat:outbox:';
const listeners = new Set(), running = new Map(), timers = new Map();
let dbPromise, fallback = false;
const merchants = new Set();
// A row replays only under the account that queued it, never under whoever signs in next.
function account() { try { return String(localStorage.getItem('kiwiAccountKey') || '').trim().toLowerCase(); } catch (_) { return ''; } }
function database() {
  if (!dbPromise) dbPromise = new Promise((resolve, reject) => {
    const r = indexedDB.open('kiwi-economat-outbox', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('merchants');
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
  return dbPromise;
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
    return await new Promise((resolve, reject) => {
      const tx = db.transaction('merchants', value ? 'readwrite' : 'readonly');
      const r = value ? tx.objectStore('merchants').put(value, key) : tx.objectStore('merchants').get(key);
      tx.oncomplete = () => resolve(value || r.result || []);
      tx.onerror = tx.onabort = () => reject(tx.error || Error('storage-failed'));
    });
  } catch (_) {
    fallback = true;
    if (value) localStorage.setItem(key, JSON.stringify(value));
    return value || JSON.parse(localStorage.getItem(key) || '[]');
  }
}
function notify(merchant, rows) { listeners.forEach(fn => fn(merchant, rows)); }
export function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }
export async function snapshot(merchant) { return stored(merchant); }
async function save(merchant, rows) {
  // Sent rows only confirm the hand-off; the server list carries them after that.
  const sent = rows.filter(row => row.state === 'sent');
  if (sent.length > 5) rows.splice(0, rows.length, ...rows.filter(row => row.state !== 'sent' || sent.indexOf(row) >= sent.length - 5));
  await stored(merchant, rows); notify(merchant, rows);
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
    const rows = await stored(merchant);
    if (!rows.some(row => row.body.idempotencyKey === body.idempotencyKey)) {
      rows.push({ body:JSON.parse(JSON.stringify(body)), account:account(), state:'pending', phase:'create', attempts:0, next:0 });
      await save(merchant, rows);
    }
  });
  void replay(merchant).catch(() => {});
}
// A refused request blocks the ones behind it until staff remove it.
export async function discard(merchant, key) {
  await serial(merchant, async () => {
    const rows = await stored(merchant);
    const kept = rows.filter(row => !(row.state === 'refused' && row.body.idempotencyKey === key));
    if (kept.length !== rows.length) await save(merchant, kept);
  });
  return replay(merchant, true);
}
export function replay(merchant, reconnect = false) {
  if (!merchant) return Promise.resolve();
  return serial(merchant, async () => {
    clearTimeout(timers.get(merchant));
    const rows = await stored(merchant);
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
          await save(merchant, rows);
        }
        await post(row.submit, merchant);
        row.state = 'sent'; row.error = ''; row.next = 0;
        await save(merchant, rows);
      } catch (e) {
        row.error = String(e.message || 'offline');
        /* 401 (session expirée), 408 et 429 sont transitoires : la demande reste
           en file avec son attente, sans bloquer par un refus définitif. */
        if (e.status >= 400 && e.status < 500 && ![401, 408, 429].includes(e.status)) row.state = 'refused';
        else { row.attempts++; row.next = Date.now() + Math.min(60000, 1000 * 2 ** Math.min(row.attempts - 1, 6)); }
        await save(merchant, rows);
        if (row.state === 'pending') schedule(merchant, row.next - Date.now());
        break;
      }
    }
    notify(merchant, rows);
  });
}
function schedule(merchant, delay) {
  const timer = setTimeout(() => { void replay(merchant).catch(() => {}); }, delay);
  timer.unref?.(); timers.set(merchant, timer);
}
if (globalThis.addEventListener) globalThis.addEventListener('online', () => {
  merchants.forEach(merchant => { clearTimeout(timers.get(merchant)); void replay(merchant, true).catch(() => {}); });
});

export async function cached(url, load) {
  if (!/[?&]merchant=/.test(url)) return load();
  try {
    const value = await load();
    try { await stored(url, { value }, true); } catch (_) { /* Reads still work when storage is full. */ }
    return value;
  } catch (e) {
    if (e.status >= 400 && e.status < 500) throw e;
    const entry = await stored(url, undefined, true);
    if (entry && entry.value) return entry.value;
    throw e;
  }
}
