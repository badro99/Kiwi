/* Durable department submissions. A lost response replays the same command key. Storage and the read cache live in hotel-economat-store.js. */
import { post } from './hotel-economat-transport.js?v=24';
import { account, merchants, mutate, prefix, stored } from './hotel-economat-store.js?v=2';
const listeners = new Set(), running = new Map(), timers = new Map();
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
