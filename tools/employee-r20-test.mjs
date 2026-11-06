// r20 employee: an HTTP 408 keeps the punch, the server clock is a median that ignores slow round trips,
// and the planning card says when an action or a refresh went wrong instead of silently re-enabling.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { deadlineVmSource, deadlineVmContext } from './deadline-vm-source.mjs';
const live = fs.readFileSync(new URL('../assets/employee-live.js', import.meta.url), 'utf8');
const planning = fs.readFileSync(new URL('../assets/employee-planning.js', import.meta.url), 'utf8');

function bootLive(handler) {
  const local = new Map();
  let now = Date.UTC(2026, 10, 5, 12, 0, 0);
  class FakeDate extends Date { constructor(...a) { super(...(a.length ? a : [now])); } static now() { return now; } }
  const posts = [];
  const window = { addEventListener() {}, localStorage:{ getItem:k => local.get(k) ?? null, setItem:(k, v) => local.set(k, v), removeItem:k => local.delete(k) } };
  const context = deadlineVmContext({ window, Date:FakeDate, navigator:{}, location:{ protocol:'file:' },
    document:{ documentElement:{ lang:'fr' }, addEventListener() {}, dispatchEvent() {}, getElementById: () => null },
    setTimeout: () => 1, clearTimeout() {}, console,
    fetch: async (url, opts) => {
      const body = opts.body ? JSON.parse(opts.body) : null;
      if (body && body.action !== 'logout') posts.push({ ...body, clientNow: now });
      return handler({ body, advance: ms => { now += ms; }, now: () => now });
    } });
  vm.runInNewContext(deadlineVmSource(live), context);
  return { api: window.KiwiEmployeeLive, posts, tick: ms => { now += ms; }, now: () => now };
}
const session = { merchant:'m', employee:{ id:'e1' } };
const reply = (status, body, date) => ({ ok:status < 300, status, headers:{ get:name => name === 'Date' ? date : null }, json:async () => body });
const httpDate = ms => new Date(Math.floor(ms / 1000) * 1000).toUTCString();

// A0: an HTTP 408 is a transient failure, never a definitive refusal.
for (const [status, kept] of [[408, true], [400, false]]) {
  const h = bootLive(async ({ body }) => !body ? reply(200, session) : reply(status, { error: status === 408 ? 'request-timeout' : 'attendance-code-invalid' }));
  await h.api.refresh();
  await h.api.clockIn('1234', 'op-' + status).catch(() => {});
  if (kept) {
    assert.equal(h.api.pendingPunches(), 1, '408 keeps the punch queued for its opId');
    assert.ok(!h.api.punchOutcomes().some(o => o.outcome.result === 'rejected'), '408 is not recorded as a refusal');
  } else {
    assert.equal(h.api.pendingPunches(), 0, 'a real refusal still ends the punch');
    assert.ok(h.api.punchOutcomes().some(o => o.outcome.result === 'rejected'));
  }
}

// A1/B1: the clock offset ignores a delayed reply and follows the median of good samples.
{
  const TRUE_OFFSET = 60000;                 // the server is a minute ahead of this phone
  let nextDelay = 100, stampEarly = false;
  const h = bootLive(async ({ body, advance, now }) => {
    const serverAtSend = now() + TRUE_OFFSET;
    advance(nextDelay);
    // A slow reply carries the Date stamped when the server started, not when it arrived.
    const date = httpDate(stampEarly ? serverAtSend : serverAtSend + nextDelay / 2);
    return reply(200, body ? { ...session, ok:true } : session, date);
  });
  await h.api.refresh(); await h.api.refresh(); await h.api.refresh();
  nextDelay = 6000; stampEarly = true;
  await h.api.refresh();                                   // a 6 s round trip: must not move the clock
  nextDelay = 100; stampEarly = false;
  await h.api.clockIn('1234', 'clock-check');
  const sent = h.posts.find(p => p.opId === 'clock-check');
  assert.ok(Math.abs(sent.capturedAt - (sent.clientNow + TRUE_OFFSET)) <= 1500, 'capturedAt follows the true server time, not the delayed reply (off by ' + (sent.capturedAt - sent.clientNow - TRUE_OFFSET) + ' ms)');
  // A merely slowish reply (1.5 s, accepted) is outvoted by the median.
  nextDelay = 1500; stampEarly = true;
  await h.api.refresh();
  nextDelay = 100; stampEarly = false;
  await h.api.clockIn('1234', 'clock-check-2');
  const again = h.posts.find(p => p.opId === 'clock-check-2');
  assert.ok(Math.abs(again.capturedAt - (again.clientNow + TRUE_OFFSET)) <= 1500, 'one moderately slow sample does not move the median');
}

// B0: the planning card never re-enables a button in silence.
async function bootPlanning({ api }) {
  const listeners = {}, winListeners = {};
  let card = null;
  const make = () => ({ id:'', className:'', innerHTML:'', addEventListener:(type, fn) => { listeners[type] = fn; }, querySelector: () => null });
  const document = { documentElement:{ lang:'fr' }, getElementById: id => id === 'kep-card' ? card : id === 'kg-sched-card' ? { insertAdjacentElement: (_, el) => { card = el; } } : null,
    addEventListener() {}, createElement: make, head:{ appendChild() {} }, visibilityState:'visible' };
  const window = { KiwiEmployeeLive:api, addEventListener:(type, fn) => { winListeners[type] = fn; }, KiwiEnv:{ isReal: () => true } };
  vm.runInNewContext(planning, { window, document, console, Intl, Date, Promise, setInterval: () => 1, setTimeout: () => 1, clearTimeout() {}, MutationObserver: undefined });
  await winListeners.load();
  const click = async selector => {
    const button = { disabled:false, dataset:{ kepCancel:'req-1' } };
    await listeners.click({ target:{ closest: sel => sel === selector ? button : null } });
    return button;
  };
  return { get card() { return card; }, click };
}
const planningData = { employee:{ id:'e1' }, schedule:{}, planning:{ requests:[{ id:'req-1', type:'leave', startDate:'2026-12-01', endDate:'2026-12-02', status:'pending' }] } };
for (const [label, failure, expected] of [
  ['lost reply', Object.assign(new Error('timeout'), { code:'timeout' }), 'uncertain'],
  ['refusal', Object.assign(new Error('nope'), { status:409, code:'planning-request-closed' }), 'failed'],
]) {
  let refreshes = 0;
  const api = { refresh: async () => { refreshes++; return planningData; }, cancelPlanningRequest: async () => { throw failure; } };
  const ui = await bootPlanning({ api });
  const button = await ui.click('[data-kep-cancel]');
  assert.equal(button.disabled, false, label + ': the button comes back');
  assert.match(ui.card.innerHTML, new RegExp('data-kep-status="' + expected + '"'), label + ': the employee is told (' + expected + ')');
  if (expected === 'uncertain') assert.ok(refreshes >= 1, 'a lost reply is followed by a re-read to learn the outcome');
}
// A failed refresh keeps the last schedule and says it may be out of date, with a retry.
{
  let fail = false;
  const api = { refresh: async () => { if (fail) throw Object.assign(new Error('offline'), { code:'timeout' }); return planningData; }, cancelPlanningRequest: async () => ({ ok:true }) };
  const ui = await bootPlanning({ api });
  fail = true;
  await ui.click('[data-kep-cancel]');
  assert.match(ui.card.innerHTML, /data-kep-status="stale"/, 'a stale refresh is announced');
  assert.match(ui.card.innerHTML, /data-kep-retry/, 'with a retry control');
  fail = false;
  await ui.click('[data-kep-retry]');
  assert.doesNotMatch(ui.card.innerHTML, /data-kep-status/, 'a successful refresh clears the notice');
}
console.log('PASS employee r20: 408 keeps the punch, median server clock, planning outcome and stale states');
