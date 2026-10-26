import assert from 'node:assert/strict';
import nativeFs from 'node:fs';
import queueCoreSource from './core-test-source.cjs';
const fs = { ...nativeFs, readFileSync: queueCoreSource.readFileSync };
import vm from 'node:vm';
const read = p => fs.readFileSync(new URL('../' + p, import.meta.url), 'utf8');
function harness(extra = {}) {
  let now = 0, id = 0, calls = 0;
  const timers = new Map(), listeners = new Map();
  const target = name => ({
    addEventListener(type, fn) { const key = name + type; listeners.set(key, [...(listeners.get(key) || []), fn]); },
    removeEventListener() {}, dispatchEvent(e) { this.fire(e.type); },
    fire(type) { for (const fn of listeners.get(name + type) || []) fn({}); }
  });
  const document = Object.assign(target('d'), { hidden: false, visibilityState: 'visible', querySelector: () => null, getElementById: () => null });
  const window = target('w');
  const ctx = vm.createContext({ window, document, console, URL, Date, Promise, CustomEvent: class { constructor(type) { this.type = type; } },
    setTimeout(fn, ms) { timers.set(++id, { fn, at: now + ms }); return id; }, clearTimeout(i) { timers.delete(i); },
    ...extra });
  const settle = async () => { for (let i = 0; i < 60; i++) await Promise.resolve(); };
  return { ctx, window, document, timers, count: () => calls, hit: () => { calls++; }, settle,
    run: src => vm.runInContext(src, ctx),
    async advance(ms) { const end = now + ms; for (;;) { const next = [...timers].sort((a,b) => a[1].at - b[1].at)[0]; if (!next || next[1].at > end) break; now = next[1].at; timers.delete(next[0]); next[1].fn(); await settle(); } now = end; await settle(); },
    async hide(hidden) { document.hidden = hidden; document.visibilityState = hidden ? 'hidden' : 'visible'; document.fire('visibilitychange'); await settle(); }
  };
}
async function pacing(name, h, start, { cap = 120000, first = true, quietCap = 600000 } = {}) {
  start(); await h.settle();
  if (first) assert.ok(h.count() > 0, name + ' initial request');
  await h.advance(600000);
  const before = h.count();
  await h.advance(cap - 1);
  assert.ok(h.count() - before <= 1, name + ' reaches idle cap');
  await h.hide(true); const hidden = h.count();
  await h.advance(600000);
  assert.equal(h.count(), hidden, name + ' no hidden requests');
  await h.hide(false); await h.advance(0);
  assert.equal(h.count(), hidden + 1, name + ' resumes immediately');
  const wake = h.count(); h.document.fire('kiwi:request-wake'); await h.settle(); await h.advance(0);
  assert.equal(h.count(), wake + 1, name + ' push signal resumes immediately');
  const focus = h.count(); h.window.fire('focus'); await h.settle(); await h.advance(0);
  assert.equal(h.count(), focus + 1, name + ' focus resumes immediately');
  let quiet = true;
  h.window.KiwiPoll = { delay: ms => quiet ? Math.max(600000, ms) : ms };
  h.document.fire('kiwi:request-wake'); await h.settle(); await h.advance(0);
  const quietStart = h.count();
  await h.advance(quietCap - 1); assert.equal(h.count(), quietStart, name + ' quiet minimum delay');
  await h.advance(1); assert.equal(h.count(), quietStart + 1, name + ' quiet tick');
  await h.hide(true); const quietHidden = h.count();
  await h.advance(3600000); assert.equal(h.count(), quietHidden, name + ' quiet hidden hour');
  quiet = false; await h.hide(false); await h.advance(0);
  assert.equal(h.count(), quietHidden + 1, name + ' local wake restores live');
  console.log('✓ ' + name + ': idle backoff, hidden pause, visibility/focus/push resume');
}
{
  const h = harness();
  Object.assign(h.window, { KiwiCloudDoc: { currentSlug: () => 'test' }, KiwiEnv: { isReal: () => true } });
  h.ctx.fetch = async () => { h.hit(); return { ok: true, json: async () => ({ ok: true, tables: {}, stats: {}, now: Date.now() }) }; };
  h.run(read('assets/floorplan-live.js'));
  await pacing('floor live', h, () => h.window.KiwiFloorLive.watch(() => {}), { cap: 15000, quietCap: 15000 });
}
{
  const h = harness({ on: () => true, merchant: () => 'test', FAST_MS: 2500, SLOW_MS: 60000,
    flushQueue() {}, feedComplete: {}, feedSeen: {}, voidedEvents: [], applyVoids() {}, publishTill() {}, PING_KEY: 'ping', chan: null });
  h.ctx.readFeed = async () => { h.hit(); return { merchant: 'test', sales: [], voided: [], cursor: 0, changeFence: 0 }; };
  const src = read('assets/live-link.js');
  h.run(src.slice(src.indexOf('  function watchFeed('), src.indexOf('  /* ─── announce a sale')));
  await pacing('sales feed', h, () => h.ctx.watchFeed(() => {}), { cap: 60000 });
  h.document.querySelector = () => ({ isConnected: true, style: { display: '' } });
  h.document.fire('kiwi:request-wake'); await h.advance(0);
  assert.ok([...h.timers.values()].some(t => t.at > 0), 'locked feed keeps a recovery timer');
  const before = h.count(); await h.advance(299999); assert.equal(h.count(), before, 'locked feed waits five minutes');
  await h.advance(1); assert.equal(h.count(), before + 1);

}
{
  const h = harness({ on: () => true, merchant: () => 'test', VOID_MS: 15000, applyVoids() {} });
  h.ctx.fetch = async () => { h.hit(); return { ok: true, json: async () => ({ voided: [] }) }; };
  const src = read('assets/live-link.js');
  h.run(src.slice(src.indexOf('  function watchVoids()'), src.indexOf('  function boot()', src.indexOf('  function watchVoids()'))));
  await pacing('till void feed', h, () => h.ctx.watchVoids());
}
{
  const h = harness({ POLL_MS: 6000, state: { orders: {}, sessions: [], closedSessions: [], expired: [] }, merchant: () => 'test', chip() {} });
  h.ctx.pull = async () => { h.hit(); return 0; };
  const src = read('assets/orderpro-inbox.js');
  h.run(src.slice(src.indexOf('  /* Request pacing:'), src.indexOf("  if (document.readyState", src.indexOf('  /* Request pacing:'))));
  await pacing('OrderPro inbox', h, () => h.ctx.start());
  h.ctx.state.orders.a = { status: 'pending' }; h.document.fire('kiwi:request-wake'); await h.settle();
  const before = h.count(); await h.advance(6000); assert.equal(h.count(), before + 1, 'pending order stays fast');
  h.ctx.state.orders = {};
  h.document.getElementById = () => ({ style: { display: '' } });
  h.ctx.wakeInbox(); await h.settle();
  const locked = h.count(); await h.advance(299999); assert.equal(h.count(), locked, 'locked empty inbox waits five minutes');
  await h.advance(1); assert.equal(h.count(), locked + 1);

}
{
  const h = harness({ liveTeamBusy: false, isCustomVenue: () => true, teamSlug: () => 'test',
    liveTeamSignature: JSON.stringify(['test', [], {}, {}, []]), pageActive: true, applyLiveTeam() {} });
  h.ctx.fetch = async () => { h.hit(); return { ok: true, json: async () => ({ ok: true, merchant: 'test' }) }; };
  const src = read('assets/team.js');
  h.run(src.slice(src.indexOf('  function fetchDeadline('),src.indexOf('\n  }',src.indexOf('  function fetchDeadline(')))+'\n  }');
  h.run(src.slice(src.indexOf('  let teamReadFailed'),src.indexOf('  function hydrateCodes()')));
  h.run(src.slice(src.indexOf('  function pollLiveTeam()'), src.indexOf('  /* ═══════════════ HELPERS')));
  await pacing('team live', h, () => {}, { first: false });
}
{
  const h = harness({ S: { orders: {}, fails: 0, cfgAt: Date.now(), stationsOk: true }, paired: () => true,
    POLL_MS: 5000, POLL_MAX_MS: 30000, CONFIG_POLL_MS: 60000, PULL_STALL_MS: 15000,
    boardSig: () => 'same', checkKdsFeature() {}, loadStations() {} });
  h.ctx.pull = async () => { h.hit(); };
  const src = read('kiwi-cuisine.html');
  h.run(src.slice(src.indexOf('  function nextPollDelay('), src.indexOf('  /* ── Démarrage', src.indexOf('  function nextPollDelay('))));
  h.document.addEventListener('visibilitychange', () => h.document.hidden ? h.ctx.cancelTick() : h.ctx.wakePoll());
  await pacing('kitchen board', h, () => h.ctx.tick());
  h.ctx.S.orders.a = { status: 'pending' }; h.ctx.wakePoll(); await h.settle();
  const before = h.count(); await h.advance(5000); assert.equal(h.count(), before + 1, 'kitchen work stays fast');
  h.ctx.S.orders.a.status = 'cooking'; h.ctx.wakePoll(); await h.settle();
  const cooking = h.count(); await h.advance(5000); assert.equal(h.count(), cooking + 1, 'cooking work also stays fast');

}

{
  const h = harness({ navigator: { onLine: true }, location: { search: '' }, URLSearchParams });
  h.ctx.run = async () => { h.hit(); return { changed: [], orders: 0, reached: true }; };
  const src = read('assets/caisse-refresh.js');
  h.run(src.slice(src.indexOf('  var autoTimer = null'), src.indexOf('})(); } catch')));
  await pacing('till shared refresh', h, () => h.ctx.autoRefresh());
  h.window.KiwiTillServiceReady = false;
  h.ctx.wakeAutoRefresh(); await h.settle();
  const closed = h.count(); await h.advance(299999); assert.equal(h.count(), closed, 'closed till refresh waits five minutes');
  await h.advance(1); assert.equal(h.count(), closed + 1);

}

{
  const h = harness();
  let message;
  h.window.BroadcastChannel = true;
  h.ctx.BroadcastChannel = class { addEventListener(type, fn) { if (type === 'message') message = fn; } };
  let wakes = 0;
  h.document.addEventListener('kiwi:request-wake', () => wakes++);
  const src = read('assets/live-link.js');
  h.run(src.slice(src.indexOf('  var PING_KEY ='), src.indexOf('  function pingLocal()')));
  message();
  assert.equal(wakes, 1, 'real BroadcastChannel fans out to schedulers');
  console.log('✓ BroadcastChannel wakes the shared request schedulers');
}
