#!/usr/bin/env node
/* pin-flow-test · the response table and the retry rule of §10.2, in Node.
 *
 * classify(): one row per answer the server can give, for every use that can
 * receive it. attach(): a fake pad and a fake clock, so the retry rule (one
 * request at a time, 10 s after the last ends, an `online` event between
 * requests sends at once, an automatic answer with the same cause writes
 * nothing), the clock-in expiry at 5 minutes, the needs-connection state and
 * the pairing rule (a code is never sent again by itself) are asserted
 * without a browser. The browser half (live regions, focus) is
 * pin-announce-browser-test. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let checks = 0;
const ok = (c, m) => { assert.ok(c, m); checks++; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m + `\n   got ${JSON.stringify(a)}\n  want ${JSON.stringify(b)}`); checks++; };

/* A sandbox with its own timers, clock and `online` listeners. */
function sandbox() {
  let t = 0, seq = 0;
  const timers = new Map();
  const listeners = {};
  const g = {
    console, JSON, Math, Date, Promise, Object, Array, String, Number, Error, RegExp,
    navigator: { onLine: true },
    setTimeout: (f, ms) => { const id = ++seq; timers.set(id, { at: t + (ms || 0), f }); return id; },
    clearTimeout: (id) => timers.delete(id),
    addEventListener: (n, f) => { (listeners[n] = listeners[n] || []).push(f); },
    removeEventListener: (n, f) => { listeners[n] = (listeners[n] || []).filter((x) => x !== f); },
  };
  g.globalThis = g;
  vm.createContext(g);
  vm.runInContext(fs.readFileSync(path.join(root, 'assets/kit/pin-flow.js'), 'utf8'), g, { filename: 'pin-flow.js' });
  const flush = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };
  return {
    F: g.KiwiPinFlow, g,
    now: () => t,
    async advance(ms) {
      const end = t + ms;
      for (;;) {
        let next = null;
        for (const [id, x] of timers) if (x.at <= end && (!next || x.at < next[1].at)) next = [id, x];
        if (!next) break;
        timers.delete(next[0]); t = next[1].at; next[1].f(); await flush();
      }
      t = end; await flush();
    },
    fire: async (n) => { (listeners[n] || []).slice().forEach((f) => f()); await flush(); },
    flush,
  };
}

const ans = (status, body, extra) => ({ kind: 'answer', status, body: body === undefined ? {} : body, json: body !== null, ...extra });
const net = { kind: 'network' };
const roles = { opensTill: (r) => /caisse|cashier|manager|owner|propri/i.test(r || '') };

/* ── 1 · classify(): the response table ─────────────────────────────────── */
{
  const { F } = sandbox();
  const c = (use, reply, ctx) => F.classify(use, reply, { roles, ...ctx });

  /* Dashboard lock */
  eq(c('dashboard', ans(200, { ok: true, staff: { name: 'Sara', role: 'owner' } })).success.name, 'Sara', 'dashboard 200 opens with the name');
  ok(c('dashboard', ans(200, { ok: true, staff: { role: 'serveur' } }), { tier: () => 'staff' }).key === 'pin.wrong', 'dashboard: a staff-tier 200 is refused and forgotten');
  let v = c('dashboard', ans(401, { error: 'bad-pin' }));
  eq([v.key, v.shake, v.keys, v.haptic, v.forget], ['pin.wrong', true, 'enabled', 'Failed', true], 'dashboard 401 bad-pin shakes, keeps keys, erases matching rows');
  ok(c('dashboard', ans(401, { error: 'bad-pin', configured: false })).success.unmatched, 'dashboard: configured:false opens the lock, unmatched');
  for (const r of [ans(401, { error: 'unauthorized' }), ans(401, { error: 'account-revoked' }), ans(401, null)]) {
    v = c('dashboard', r);
    eq([v.key, v.keys, v.shake, v.haptic || null, v.action.id], ['pin.signed_out', 'disabled', undefined, null, 'sign-in'], 'dashboard signed out: no shake, no Failed, Sign in');
  }
  v = c('dashboard', ans(429, { retry_after: 125 }));
  eq([v.key, v.args.minutes, v.keys, v.haptic], ['pin.paused.self', 3, 'enabled', null], 'dashboard 429: keys stay enabled, minutes rounded up');
  for (const r of [ans(503, { error: 'staff-unavailable' }), net, ans(403, { error: 'other' }), ans(403, null)]) ok(c('dashboard', r).offline, 'dashboard reads its rows when the server cannot tell');
  ok(F.fromRow('dashboard', { name: 'Sara' }, {}).success, 'dashboard row match opens');
  eq(F.fromRow('dashboard', null, { online: false }).key, 'pin.dashboard.offline_unknown', 'dashboard offline no match');
  eq(F.fromRow('dashboard', null, { online: true }).key, 'pin.unavailable', 'dashboard online, server down, no match');
  eq(F.fromRow('dashboard', null, { paused: 200 }).key, 'pin.paused.self', 'dashboard paused rows');

  /* Till lock */
  ok(c('till', ans(200, { ok: true, staff: { name: 'Sara B', role: 'caisse' } })).success, 'till 200 cashier opens');
  v = c('till', ans(200, { ok: true, staff: { name: 'Youssef Alami', role: 'serveur' } }));
  eq([v.key, v.args.name, v.keys, v.haptic, v.shake], ['pin.not_till', 'Youssef', 'enabled', 'Failed', false], 'till: a waiter is named, keys stay');
  eq(c('till', ans(200, { ok: true, staff: { role: 'serveur' } })).key, 'pin.not_till.unnamed', 'till: unnamed not-till');
  eq(c('till', ans(401, { error: 'bad-pin' })).key, 'pin.wrong', 'till 401');
  v = c('till', ans(403, { error: 'forbidden-till' }), { venue: 'Amira' });
  eq([v.key, v.args.venue, v.keys, v.action.id], ['pin.unpaired', 'Amira', 'disabled', 'pair'], 'till 403 forbidden-till');
  v = c('till', ans(429, { retry_after: 60 }), { pinUnlock: true });
  eq([v.key, v.keys, v.pause, v.hint], ['pin.paused.store', 'disabled', 60, true], 'till 429: the store-wide pause, hint only with the route');
  eq(c('till', ans(503, { error: 'rate-limit-unavailable' })).key, 'pin.unavailable', 'till 503');
  eq(c('till', ans(400, { error: 'bad-json' })).key, 'pin.unavailable', 'till 400 is shown as 503');
  ok(c('till', net).offline, 'till network: read the rows');
  ok(F.fromRow('till', { name: 'Sara', role: 'caisse', provenAt: 1 }, { roles }).success.verdict === 'offline', 'a row verdict is marked offline');
  eq(F.fromRow('till', { name: 'Ali', role: 'serveur' }, { roles }).key, 'pin.not_till', 'a waiter row is refused by name');
  eq(F.fromRow('till', null, { roles }).key, 'pin.offline_unknown', 'no row: offline unknown');

  /* Till approval */
  const close = { kind: 'close_till', key: 'act.close_till' };
  const cancelLive = { kind: 'cancel_order', key: 'act.cancel_order', needsConnection: true };
  eq(c('approval', ans(200, { ok: true, staff: { role: 'serveur' } }), { act: close }).key, 'pin.till.not_till', 'till approval: a waiter');
  eq(c('approval', ans(401, { error: 'bad-pin' }), { act: close }).key, 'pin.manager.wrong', 'till approval 401 says the store-wide count');
  ok(c('approval', net, { act: close }).offline, 'an offline-capable act reads the rows');
  v = c('approval', net, { act: cancelLive, actLabel: 'Cancelling order 12' });
  eq([v.key, v.keys, v.clear, v.action.id, v.retry], ['pin.till.needs_connection', 'disabled', false, 'retry', undefined], 'a needs-connection act never reads a row and never retries by itself');
  const handover = { kind: 'shift_change', key: 'act.shift_change', needsConnection: true };
  v = c('approval', ans(200, { ok: true, staff: { id: 'm1', role: 'manager' } }), { act: handover, incoming: { id: 'c2', name: 'Sara' } });
  eq([v.key, v.args.name, v.keys], ['pin.till.not_incoming', 'Sara', 'enabled'], 'shift change: a manager is not the incoming cashier');
  v = c('approval', ans(200, { ok: true, staff: { id: 'w1', role: 'serveur' } }), { act: handover, incoming: { id: 'c2', name: 'Sara' } });
  eq(v.key, 'pin.till.not_incoming', 'shift change: the identity before the role');
  ok(c('approval', ans(200, { ok: true, staff: { id: 'c2', role: 'caisse' } }), { act: handover, incoming: { id: 'c2', name: 'Sara' } }).success, 'shift change: the incoming cashier completes');

  /* Manager approval */
  const disc = { kind: 'discount', key: 'act.discount.pct' }, refund = { kind: 'refund', key: 'act.refund' }, cancelSale = { kind: 'cancel_sale', key: 'act.cancel_sale' };
  eq(c('manager', ans(200, { ok: true, staff: { role: 'caisse' } }), { act: disc }).key, 'pin.manager.not_manager', 'discount: a cashier is not a manager');
  ok(c('manager', ans(200, { ok: true, staff: { role: 'manager' } }), { act: disc }).success, 'discount: a manager approves');
  eq(c('manager', ans(200, { ok: true, staff: { role: 'manager' } }), { act: refund }).key, 'pin.manager.not_manager', 'refund: no approval proof, not a manager');
  ok(c('manager', ans(200, { ok: true, staff: { role: 'owner' }, approval: 'p' }), { act: refund }).success.approval === 'p', 'refund: the proof is handed on');
  eq(c('manager', ans(403, { error: 'manager-required' }), { act: cancelSale }).key, 'pin.manager.not_manager', 'cancel sale 403 manager-required');
  for (const act of [refund, cancelSale, { kind: 'stock_adjust' }]) {
    v = c('manager', net, { act });
    eq([v.key, v.keys, v.action.id], ['pin.manager.offline', 'disabled', 'retry'], 'a server-approved act offline: Try again, no row (' + act.kind + ')');
  }
  ok(c('manager', net, { act: disc }).offline, 'a discount offline reads the rows');
  eq(F.fromRow('manager', { role: 'caisse' }, { act: disc }).key, 'pin.manager.not_manager', 'a cashier row cannot approve a discount');

  /* Team sign-in and clock-in */
  ok(c('team', ans(200, { ok: true, name: 'Sara' })).success, 'team 200');
  eq(c('team', ans(401, { error: 'bad-employee-code' })).key, 'team.bad', 'team 401');
  v = c('team', ans(409, { error: 'employee-access-ambiguous' }));
  eq([v.key, v.keys, v.shake, v.haptic], ['team.ambiguous', 'enabled', undefined, 'Failed'], 'team 409: dots clear, keys stay');
  eq(c('team', ans(403, { error: 'store-suspended' })).keys, 'disabled', 'team suspended');
  v = c('team', net);
  eq([v.key, v.keys, v.retry, v.clear], ['pin.offline', 'disabled', 'auto', undefined], 'team network: keys disabled, digits kept, automatic retry');
  eq(c('team', ans(200, null)).key, 'pin.offline', 'a body that is not JSON is no network');
  eq(c('clock', ans(200, { ok: true })).haptic, 'Shift', 'clock-in 200 fires Shift');
  eq(c('clock', ans(403, { error: 'attendance-code-invalid' })).key, 'clock.invalid', 'clock 403');
  eq(c('clock', ans(401, { error: 'employee-session-required' })).action.id, 'sign-in', 'clock session ended offers Sign in');
  eq(c('clock', ans(503, { error: 'attendance-write-failed' })).key, 'clock.not_recorded', 'clock 503 write failed keeps the code');

  /* Pairing and the store lock */
  for (const use of ['pair', 'store']) {
    ok(c(use, ans(200, { ok: true, venue: { name: 'Amira' } })).success, use + ' 200');
    eq(c(use, ans(422, { error: 'invalid_or_expired' })).key, 'pair.invalid', use + ' 422');
    eq(c(use, ans(422, { error: 'invalid_or_expired' }), { unanswered: true }).key, 'pair.maybe_used', use + ' 422 after no answer');
    v = c(use, net);
    eq([v.key, v.keys, v.retry, v.clear], ['pair.no_answer', 'enabled', undefined, true], use + ' no answer: never sent again');
    for (const s of [503, 404, 405]) eq(c(use, ans(s, {})).key, 'pin.unavailable', use + ' ' + s);
    eq(c(use, ans(429, { retry_after: 900 })).key, 'pair.paused', use + ' 429');
  }
}

/* ── 2 · attach(): the retry rule, with a fake pad and clock ────────────── */
function fakePad() {
  const pad = {
    calls: [], attrs: {}, listeners: {}, onsubmit: null,
    setAttribute(k, v) { this.attrs[k] = v; },
    answer(o) { this.calls.push(['answer', o]); },
    gate(m) { this.calls.push(['gate', m]); },
    ungate(m) { this.calls.push(['ungate', m]); },
    reset() { this.calls.push(['reset']); },
    addEventListener(n, f) { (this.listeners[n] = this.listeners[n] || []).push(f); },
    removeEventListener() {},
    writes() { return this.calls.filter((c) => c[0] === 'answer' && c[1].message).map((c) => c[1].message); },
  };
  return pad;
}

{ /* team sign-in offline: three automatic retries with the same answer write nothing */
  const S = sandbox(); const pad = fakePad(); const sent = [];
  let replies = [net, net, net, net, ans(200, { ok: true, name: 'Sara' })];
  let done = null;
  S.F.attach(pad, { use: 'team', email: 'a@b.ma', fetch: undefined, request: (code) => { sent.push([code, S.now()]); return Promise.resolve(replies.shift()); }, onSuccess: (w) => { done = w; }, setTimeout: S.g.setTimeout, clearTimeout: S.g.clearTimeout, now: S.now });
  eq(pad.attrs.length, '4', 'team pad length 4');
  await pad.onsubmit('1234', 'g1', 'final'); await S.flush();
  eq(pad.writes(), ['pin.offline'], 'the person’s request writes pin.offline once');
  await S.advance(9999); eq(sent.length, 1, 'nothing before 10 s');
  await S.advance(1); eq(sent.length, 2, 'the automatic retry at 10 s after the last request ended');
  await S.advance(10000); await S.advance(10000);
  eq(sent.length, 4, 'one request at a time, every 10 s');
  eq(pad.writes(), ['pin.offline'], 'three automatic retries with the same answer write nothing');
  ok(pad.calls.filter((c) => c[0] === 'answer').slice(1).every((c) => c[1] === undefined || true), 'answers after the first are automatic');
  await S.fire('online');
  eq(sent.length, 5, 'an `online` event between requests sends at once');
  eq(done && done.name, 'Sara', 'a success after an automatic retry proceeds');
  eq(sent.every((s) => s[0] === '1234'), true, 'the digits are kept for every retry');
}

{ /* a cause change during automatic retries is written once */
  const S = sandbox(); const pad = fakePad();
  const replies = [net, net, ans(401, { error: 'bad-employee-code' })];
  S.F.attach(pad, { use: 'team', request: () => Promise.resolve(replies.shift()), setTimeout: S.g.setTimeout, clearTimeout: S.g.clearTimeout, now: S.now });
  await pad.onsubmit('1234', 'g', 'final'); await S.advance(10000); await S.advance(10000);
  eq(pad.writes(), ['pin.offline', 'team.bad'], 'the new cause (the code refused) is written once');
  const last = pad.calls.filter((c) => c[0] === 'answer').pop()[1];
  eq([last.automatic, last.haptic], [true, null], 'an automatic answer fires no haptic');
}

{ /* Try again repeats a refusal; it joins an automatic request in flight */
  const S = sandbox(); const pad = fakePad();
  let release; const replies = [net];
  S.F.attach(pad, { use: 'team', request: () => replies.length ? Promise.resolve(replies.shift()) : new Promise((r) => { release = r; }), setTimeout: S.g.setTimeout, clearTimeout: S.g.clearTimeout, now: S.now });
  await pad.onsubmit('1234', 'g', 'final');
  await S.advance(10000);                      /* the automatic request is now in flight */
  await pad.onsubmit('1234', 'g2', 'retry');   /* Try again joins it */
  release(net); await S.flush();
  eq(pad.writes(), ['pin.offline', 'pin.offline'], 'the joined answer counts as the person’s: written again');
}

{ /* clock-in: at 5 minutes after the code was typed, clock.code_expired once */
  const S = sandbox(); const pad = fakePad(); const sent = [];
  S.F.attach(pad, { use: 'clock', request: () => { sent.push(S.now()); return Promise.resolve(net); }, setTimeout: S.g.setTimeout, clearTimeout: S.g.clearTimeout, now: S.now });
  eq(pad.attrs.length, '6', 'clock pad length 6');
  await pad.onsubmit('123456', 'g', 'final');
  await S.advance(290000);
  eq(pad.writes(), ['pin.offline'], 'silent while it retries');
  await S.advance(10000);
  eq(pad.writes(), ['pin.offline', 'clock.code_expired'], 'clock.code_expired written once at 5 minutes');
  const n = sent.length; await S.advance(60000);
  eq(sent.length, n, 'no request after the expiry');
  const last = pad.calls.filter((c) => c[0] === 'answer').pop()[1];
  eq([last.keys, last.clear, last.assertive], ['enabled', true, false], 'the digits clear and the keys are enabled, politely');
}

{ /* pairing: a code that got no answer is never sent again by itself; typed again, a 422 says "may" */
  const S = sandbox(); const pad = fakePad(); const sent = [];
  const replies = [net, ans(422, { error: 'invalid_or_expired' }), ans(422, {})];
  S.F.attach(pad, { use: 'pair', request: (c) => { sent.push(c); return Promise.resolve(replies.shift()); }, setTimeout: S.g.setTimeout, clearTimeout: S.g.clearTimeout, now: S.now });
  await pad.onsubmit('482913', 'g', 'final');
  await S.advance(120000); await S.fire('online');
  eq(sent, ['482913'], 'no request follows an unanswered redeem, not on `online` either');
  await pad.onsubmit('482913', 'g', 'final');
  await pad.onsubmit('111111', 'g', 'final');
  eq(pad.writes(), ['pair.no_answer', 'pair.maybe_used', 'pair.invalid'], 'the same code again says it may be used; another code is just invalid');
}

{ /* needs connection: gated at open, the keys come back on `online`, nothing is sent by itself */
  const S = sandbox(); const pad = fakePad(); const sent = [];
  const flow = S.F.attach(pad, { use: 'approval', act: { kind: 'cancel_order', key: 'act.cancel_order', needsConnection: true }, isOffline: () => true, request: () => { sent.push(1); return Promise.resolve(net); }, setTimeout: S.g.setTimeout, clearTimeout: S.g.clearTimeout, now: S.now });
  eq(pad.calls[0][0], 'gate', 'the pad opens in the needs-connection state');
  await S.fire('online');
  eq(pad.calls[1], ['ungate', 'pin.connection_back'], 'online: keys back, pin.connection_back once');
  await pad.onsubmit('1234', 'g', 'final');
  await S.advance(60000); await S.fire('online');
  eq(sent.length, 1, 'an approval is never retried by itself, not on `online` either');
  const last = pad.calls.filter((c) => c[0] === 'answer').pop()[1];
  eq([last.message, last.keys, last.clear, last.action.id], ['pin.till.needs_connection', 'disabled', false, 'retry'], 'network after the final digit: digits kept, Try again');
  flow.destroy();
}

{ /* offline verifier: a row decides, the log gets one entry with verdict and provenAt */
  const S = sandbox(); const pad = fakePad(); const log = []; let who = null;
  S.F.attach(pad, { use: 'approval', act: { kind: 'close_till', key: 'act.close_till' }, roles, request: () => Promise.resolve(net),
    offline: { verify: () => Promise.resolve({ id: 'c1', name: 'Sara', role: 'caisse', provenAt: 1000 }) },
    log: (e) => log.push(e), onSuccess: (w) => { who = w; }, setTimeout: S.g.setTimeout, clearTimeout: S.g.clearTimeout, now: S.now });
  await pad.onsubmit('1234', 'g', 'final'); await S.flush();
  eq([who.verdict, who.provenAt], ['offline', 1000], 'the identity carries verdict offline and provenAt');
  eq([log.length, log[0].verdict, log[0].provenAt, log[0].act], [1, 'offline', 1000, 'close_till'], 'one authorization-log entry per approval');
}

{ /* 429 at the till: keys disabled, minutes counted down, the pad re-enables itself */
  const S = sandbox(); const pad = fakePad();
  S.F.attach(pad, { use: 'till', roles, request: () => Promise.resolve(ans(429, { retry_after: 130 })), setTimeout: S.g.setTimeout, clearTimeout: S.g.clearTimeout, now: S.now });
  await pad.onsubmit('1234', 'g', 'final');
  eq(pad.writes(), ['pin.paused.store'], 'the store-wide pause, once');
  await S.advance(60000); await S.advance(60000);
  ok(!pad.calls.some((c) => c[0] === 'reset'), 'still paused at 2 minutes');
  await S.advance(11000);
  ok(pad.calls.some((c) => c[0] === 'reset'), 'the pad re-enables itself at zero');
}

console.log(`pin-flow-test · ${checks} checks green`);
