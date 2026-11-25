#!/usr/bin/env node
/* Browse, 25 nov. 2026 : « Fermeture de table non protégée · vérifiez le
 * stockage de cette caisse » restait à l'écran, revenait à chaque sondage, et
 * la fermeture refusée par la file locale n'était jamais envoyée.
 *  1. La file locale (offline-db.js) rouvre une base dont la connexion est
 *     perdue et rejoue l'opération ; une autre erreur n'est pas masquée.
 *  2. Une fermeture que la file refuse part tout de suite au serveur, sans
 *     alerte ; l'alerte ne sort que si l'envoi échoue aussi, une seule à la
 *     fois, en avertissement, et elle s'efface. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const read = (f) => fs.readFileSync(new URL('../' + f, import.meta.url), 'utf8');
const tick = () => new Promise((r) => setTimeout(r, 0));

/* ── 1. offline-db : la connexion perdue se reprend ─────────────────────── */
function loadOutbox({ failFirst }) {
  let opens = 0, closes = 0, txCalls = 0;
  const rows = new Map();
  class FakeDexie {
    constructor() { this.outbox = { get: async (id) => rows.get(id), add: async (row) => { rows.set(row.id, row); } }; this.meta = {}; }
    version() { return { stores() {} }; }
    open() { opens++; return Promise.resolve(this); }
    close() { closes++; }
    transaction(mode, table, fn) {
      txCalls++;
      if (txCalls <= failFirst.length) {
        const e = new Error(failFirst[txCalls - 1].message); e.name = failFirst[txCalls - 1].name;
        return Promise.reject(e);
      }
      return Promise.resolve().then(fn);
    }
  }
  const window = { Dexie: FakeDexie, dispatchEvent() {} };
  const ctx = vm.createContext({ window, navigator: {}, Promise, Date, Math, JSON, Error, Number, String, Set, Map, Object, Array, CustomEvent: class { constructor(t, o) { this.type = t; this.detail = o && o.detail; } }, structuredClone });
  vm.runInContext(read('assets/offline-db.js'), ctx);
  return { K: window.KiwiOffline, rows, stats: () => ({ opens, closes, txCalls }) };
}
{
  const { K, rows, stats } = loadOutbox({ failFirst: [{ name: 'UnknownError', message: 'Connection to Indexed Database server lost. Refresh the page to try again' }] });
  const r = await K.enqueue('restaurant-visit-close', 'browse', { closeSession: 'v1' }, { id: 'close:browse:s:v1' });
  assert.equal(r.ok, true, 'a lost IndexedDB connection is reopened and the close is stored');
  assert.ok(rows.has('close:browse:s:v1'));
  assert.deepEqual(stats(), { opens: 2, closes: 1, txCalls: 2 }, 'one reopen, one replay');
}
{
  const { K, stats } = loadOutbox({ failFirst: [{ name: 'DatabaseClosedError', message: 'Database has been closed' }, { name: 'DatabaseClosedError', message: 'Database has been closed' }] });
  await assert.rejects(K.enqueue('restaurant-visit-close', 'browse', {}, { id: 'close:x' }), /closed/, 'a base that stays broken still fails, after a single retry');
  assert.equal(stats().txCalls, 2, 'no retry loop');
}
{
  const { K, stats } = loadOutbox({ failFirst: [{ name: 'Error', message: 'Outbox id already belongs to another scope' }] });
  await assert.rejects(K.enqueue('restaurant-visit-close', 'browse', {}, { id: 'close:y' }), /another scope/, 'an ownership error is not hidden by a retry');
  assert.equal(stats().opens, 1, 'no reopen for an error that is not a lost connection');
}
console.log('✓ outbox reconnects a lost IndexedDB connection once, never masks other errors');

/* ── 2. orderpro-inbox : la fermeture part quand même ───────────────────── */
const source = read('assets/orderpro-inbox.js');
const start = source.indexOf('  var CLOSE_CHANNEL =');
const end = source.indexOf('  /* ── attention:', start);
assert.ok(start > 0 && end > start);
const closeCode = source.slice(start, end);
function inbox({ enqueueFails, fetchFails }) {
  const posts = [], reports = [], stackEls = [], timers = [];
  const nodes = new Map();
  const stack = { appendChild(el) { stackEls.push(el); if (el.id) nodes.set(el.id, el); } };
  const offline = {
    enqueue: () => (enqueueFails ? Promise.reject(Object.assign(new Error('Connection to Indexed Database server lost'), { name: 'UnknownError' })) : Promise.resolve()),
    claim: () => Promise.resolve(null), list: () => Promise.resolve([]),
  };
  const context = vm.createContext({
    state: { sessions: [{ id: 'visit-9', table: '9' }], since: 1, orders: {} }, Promise, Date, JSON, Error,
    navigator: { onLine: true },
    window: { KiwiOffline: offline, dispatchEvent() {}, KiwiReportError: (err, tag) => reports.push(tag + ' ' + err.message) },
    merchant: () => 'browse', CustomEvent: class {},
    setTimeout: (fn) => { timers.push(fn); return timers.length; },
    document: {
      getElementById: (id) => (id === 'toast-stack' ? stack : nodes.get(id) || null),
      createElement: () => ({ classList: { add() {} }, setAttribute(k, v) { this[k] = v; }, remove() { nodes.delete(this.id); } }),
    },
    fetch: async (url, init) => { posts.push({ url, body: JSON.parse(init.body) }); if (fetchFails) throw new Error('offline'); return { ok: true, json: async () => ({ ok: true }) }; },
    pull: async () => 0,
  });
  vm.runInContext(closeCode, context);
  return { context, posts, reports, stackEls, timers, nodes };
}
{
  const t = inbox({ enqueueFails: true, fetchFails: false });
  t.context.closeSession({ session: 'visit-9', why: 'settle' });
  await tick(); await tick(); await tick();
  assert.equal(t.posts.length, 1, 'the close the outbox refused is sent straight away');
  assert.equal(t.posts[0].url, '/api/order/queue');
  assert.equal(t.posts[0].body.closeSession, 'visit-9');
  assert.equal(t.stackEls.length, 0, 'a close that left needs no alert at the counter');
  assert.ok(t.reports.some((r) => /outbox:restaurant-visit-close .*Indexed Database/.test(r)), 'the real storage error is reported: ' + t.reports.join(' | '));
}
{
  const t = inbox({ enqueueFails: true, fetchFails: true });
  t.context.closeSession({ session: 'visit-9', why: 'settle' });
  await tick(); await tick(); await tick();
  assert.equal(t.stackEls.length, 1, 'neither stored nor sent: the counter is told');
  const el = t.stackEls[0];
  assert.equal(el.className, 'toast is-warn', 'a warning, not the green tick of a success');
  assert.equal(el.role, 'alert');
  assert.match(el.textContent, /Fermeture de table non envoyée/);
  t.context.closeSession({ session: 'visit-9', why: 'settle' });
  await tick(); await tick(); await tick();
  assert.equal(t.stackEls.length, 1, 'never a second copy on screen');
  t.timers.forEach((fn) => fn());
  assert.ok(!t.nodes.has('kop-close-warn'), 'the warning goes away on its own');
  assert.equal(t.reports.length, 1, 'the error report is rate-limited');
}
{
  /* Background retries (verify, flush) never alert: the close already left or is stored. */
  const t = inbox({ enqueueFails: false, fetchFails: false });
  t.context.window.KiwiOffline.list = () => Promise.reject(new Error('Connection to Indexed Database server lost'));
  t.context.verifyCloses();
  await tick(); await tick();
  assert.equal(t.stackEls.length, 0, 'a background check that fails stays off the counter');
  assert.equal(t.reports.length, 1, 'but it is reported');
}
console.log('✓ a close the outbox refuses is sent anyway; the counter is warned only when it could not leave');
