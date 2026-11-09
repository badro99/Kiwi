#!/usr/bin/env node
'use strict';

/* B14 (9 Nov 2026, hotel test account): a walk-in checkout wrote the « rooms »
 * document, the POST came back 503, and nothing retried. The server kept the
 * room occupied for minutes on every other device until the NEXT edit flushed
 * it; the reservations document stayed « dirty » with no edit to carry it.
 * After three 409 merges in a session, every later conflict was dropped too.
 * Here the real assets/cloud-doc.js runs on a fake clock: a dirty document is
 * retried on its own with growing delays, a stale revision is merged and
 * retried again, a business conflict is not retried, the page is told when the
 * copy keeps failing, and « Réessayer », a returning tab and a pull that finds
 * the server already holding our edit all end the episode. */

const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const SOURCE = fs.readFileSync(path.join(ROOT, 'assets', 'cloud-doc.js'), 'utf8');

let pass = 0;
let fail = 0;
function ok(condition, message) {
  if (condition) pass++;
  else { fail++; console.log('  ✗ ' + message); }
}

function clock() {
  let now = 0, seq = 0;
  const timers = new Map();
  return {
    setTimeout(fn, ms) { const id = ++seq; timers.set(id, { at: now + Math.max(0, +ms || 0), fn }); return id; },
    clearTimeout(id) { timers.delete(id); },
    pending() { return [...timers.values()].map((t) => t.at - now); },
    async advance(ms) {
      const end = now + ms;
      for (;;) {
        await flush();
        const next = [...timers.entries()].filter(([, t]) => t.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
        if (!next) break;
        timers.delete(next[0]);
        now = next[1].at;
        next[1].fn();
      }
      now = end;
      await flush();
    },
  };
}
async function flush() { for (let i = 0; i < 20; i++) await new Promise((r) => setImmediate(r)); }

function browser(store, fetchImpl, t) {
  const listeners = Object.create(null);
  const on = (type, fn) => { (listeners[type] || (listeners[type] = [])).push(fn); };
  const localStorage = {
    getItem(k) { return store.has(k) ? store.get(k) : null; },
    setItem(k, v) { store.set(k, String(v)); },
    removeItem(k) { store.delete(k); },
    key(i) { return Array.from(store.keys())[i] || null; },
    get length() { return store.size; },
  };
  const events = [];
  const document = { visibilityState: 'visible', addEventListener: on };
  const window = {
    document, localStorage, KiwiEnv: { isReal: () => true }, addEventListener: on,
    dispatchEvent(e) { events.push(e); (listeners[e.type] || []).forEach((fn) => fn(e)); return true; },
  };
  window.window = window;
  const load = new Function('window', 'document', 'localStorage', 'fetch', 'setTimeout', 'clearTimeout', SOURCE);
  load(window, document, localStorage, fetchImpl, t.setTimeout, t.clearTimeout);
  const fire = (type) => (listeners[type] || []).forEach((fn) => fn({ type }));
  const unsaved = () => events.filter((e) => e.type === 'kiwi:doc-unsaved').map((e) => e.detail.unsaved);
  return { window, fire, unsaved };
}
const reply = (status, body) => Promise.resolve({ ok: status >= 200 && status < 300, status, json: () => Promise.resolve(body) });
const DIRTY = 'kiwiDocDirty:v1:rooms:hotel';

function setup(answer) {
  const t = clock(), store = new Map();
  let doc = { rooms: [{ id: 'r110', status: 'libre' }] };
  const posts = [];
  const net = (url, opts) => {
    if (opts && opts.method === 'POST') { const body = JSON.parse(opts.body); posts.push(body); return answer(posts.length, body); }
    return reply(200, { rev: 69, data: { rooms: [{ id: 'r110', status: 'occ' }] } });
  };
  const b = browser(store, net, t);
  const h = b.window.KiwiCloudDoc.attach({
    feature: 'rooms', slug: () => 'hotel', read: () => doc, write: (next) => { doc = next; },
    merge: (mine) => mine,
  });
  return { t, store, posts, b, h, set(next) { doc = next; } };
}

(async function () {
  /* 1 · one 503, then the server answers: the copy leaves on its own. */
  {
    const s = setup((n) => (n === 1 ? reply(503, { error: 'unmigrated' }) : reply(200, { ok: true, rev: 70 })));
    await s.h.pull(true);
    s.set({ rooms: [{ id: 'r110', status: 'sale' }] });
    s.h.push(0);
    await s.t.advance(10);
    ok(s.posts.length === 1 && s.store.has(DIRTY), 'the first POST fails with 503 and the copy stays dirty');
    await s.t.advance(2100);
    ok(s.posts.length === 2, 'retried on its own about 2 s later, without a new edit (got ' + s.posts.length + ')');
    ok(!s.store.has(DIRTY), 'the dirty mark is cleared once the server accepts');
    ok(s.posts[1]?.baseRev === 69, 'the retry still carries its base revision');
    ok(s.b.unsaved().length === 0, 'a single failure does not alarm the page');
  }

  /* 2 · it keeps failing: bounded retries, the page is told, « Réessayer » and recovery. */
  {
    let up = false;
    const s = setup(() => (up ? reply(200, { ok: true, rev: 70 }) : reply(503, { error: 'unmigrated' })));
    await s.h.pull(true);
    s.set({ rooms: [{ id: 'r110', status: 'sale' }] });
    s.h.push(0);
    await s.t.advance(30 * 60 * 1000);
    ok(s.posts.length === 7, 'one POST plus six spaced retries, then it stops (got ' + s.posts.length + ')');
    ok(JSON.stringify(s.b.unsaved()) === '[true]', 'the page is told once that the copy is not saved');
    ok(s.h.unsaved() === true && s.store.has(DIRTY), 'the copy stays dirty and flagged');
    up = true;
    s.b.window.dispatchEvent({ type: 'kiwi:doc-retry' });
    await s.t.advance(10);
    ok(s.posts.length === 8 && !s.store.has(DIRTY), '« Réessayer » sends it at once and it lands');
    ok(JSON.stringify(s.b.unsaved()) === '[true,false]' && s.h.unsaved() === false, 'the page is told it is saved again');
  }

  /* 3 · a stale revision more than three times: merged and retried until it lands. */
  {
    const s = setup((n) => (n <= 5 ? reply(409, { error: 'stale', rev: 69 + n, data: { rooms: [{ id: 'r110', status: 'occ' }] } }) : reply(200, { ok: true, rev: 80 })));
    await s.h.pull(true);
    s.set({ rooms: [{ id: 'r110', status: 'sale' }] });
    s.h.push(0);
    await s.t.advance(5 * 60 * 1000);
    ok(s.posts.length === 6 && !s.store.has(DIRTY), 'five conflicts in a row are merged and retried until the write lands (got ' + s.posts.length + ')');
    ok(s.posts[5]?.baseRev === 74, 'the last attempt is based on the latest server revision');
  }

  /* 4 · a business conflict is not « passager »: no automatic retry. */
  {
    const s = setup(() => reply(409, { error: 'room-conflict', rev: 69 }));
    await s.h.pull(true);
    s.set({ rooms: [{ id: 'r110', status: 'sale' }] });
    s.h.push(0);
    await s.t.advance(10 * 60 * 1000);
    ok(s.posts.length === 1, 'a room conflict is not retried on its own (got ' + s.posts.length + ')');
  }

  /* 5 · returning to the tab sends a dirty copy at once, cooldown or not. */
  {
    let up = false;
    const s = setup(() => (up ? reply(200, { ok: true, rev: 70 }) : Promise.reject(new Error('offline'))));
    await s.h.pull(true);
    s.set({ rooms: [{ id: 'r110', status: 'sale' }] });
    s.h.push(0);
    await s.t.advance(10);
    up = true;
    s.b.fire('visibilitychange');
    await s.t.advance(10);
    ok(s.posts.length === 2 && !s.store.has(DIRTY), 'a returning tab sends the dirty copy immediately');
  }

  /* 6 · a pull that finds the server already holding our edit ends the episode. */
  {
    const t = clock(), store = new Map();
    let doc = { name: 'saved' };
    const b = browser(store, (url, opts) => {
      if (opts && opts.method === 'POST') return reply(503, { error: 'unmigrated' });
      return reply(200, { rev: 9, data: { name: 'saved' } });
    }, t);
    const h = b.window.KiwiCloudDoc.attach({ feature: 'reservations', slug: () => 'hotel', read: () => doc, write: (next) => { doc = next; } });
    store.set('kiwiDocRev:v1:reservations:hotel', '8');
    store.set('kiwiDocDirty:v1:reservations:hotel', 'old-token');
    await h.pull(false);
    ok(!store.has('kiwiDocDirty:v1:reservations:hotel'), 'a dirty mark whose content the server already holds is cleared');
  }

  console.log(fail ? `✗ cloud-doc retry: ${fail} failure(s), ${pass} passed` : `✓ cloud-doc retry: ${pass} checks · a failed save retries on its own with backoff, merges past repeated 409s, tells the page when it keeps failing, and stops when the server has it`);
  process.exit(fail ? 1 : 0);
})();
