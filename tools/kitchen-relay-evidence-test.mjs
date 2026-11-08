#!/usr/bin/env node
/* tools/kitchen-relay-evidence-test.mjs · the order-relay queue never erases evidence that a dish
 * did not reach the kitchen (r21 kitchen#B0/B1/B2, serveur#B0, tables#B0).
 *
 * Runs the shipped assets/kitchen-relay.js in a VM:
 *   · a 2xx whose body cannot be read keeps the ticket queued, as uncertain;
 *   · a readable {ok:true} removes it;
 *   · corrupt queue storage is set aside with its raw bytes, announced, exportable, acknowledgeable;
 *   · a ticket older than six hours leaves the retry queue but lands in the expired list, intact.
 *
 *   node tools/kitchen-relay-evidence-test.mjs
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../assets/kitchen-relay.js', import.meta.url), 'utf8');
let checks = 0;
const ok = (cond, label, detail) => { assert.ok(cond, label + (detail ? ' · ' + JSON.stringify(detail) : '')); checks++; };

function relay({ respond }) {
  const store = new Map([['kiwiPaired', '1'], ['kiwiPairedVenue', JSON.stringify({ merchant: 'relay-fixture' })]]);
  const events = []; const intervals = [];
  let clock = Date.UTC(2026, 10, 8, 10, 0, 0);
  class FakeDate extends Date { constructor(...a) { super(...(a.length ? a : [clock])); } static now() { return clock; } }
  const ctx = {
    JSON, Math, Array, Object, String, Number, Promise, Uint8Array, crypto, AbortController, Date: FakeDate,
    localStorage: {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => { store.set(k, String(v)); },
      removeItem: (k) => store.delete(k),
      get length() { return store.size; }, key: (i) => [...store.keys()][i] ?? null,
    },
    setTimeout: () => 1, clearTimeout() {},
    setInterval: (fn) => { intervals.push(fn); return intervals.length; }, clearInterval() {},
    addEventListener() {}, dispatchEvent: (e) => { events.push(e); }, CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init && init.detail; } },
    fetch: (url, init) => respond(init),
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(source, ctx, { filename: 'assets/kitchen-relay.js' });
  const queued = () => JSON.parse(store.get('kiwiKitchenQueue') || '[]').map((row) => row.create.id);
  return { R: ctx.KiwiKitchenRelay, store, events, queued, tick: () => intervals.forEach((fn) => fn()), advance: (ms) => { clock += ms; } };
}
const raw = (status, text) => () => Promise.resolve(new Response(text, { status }));
const ticket = (R) => ({ id: R.newId(), mode: 'table', table: '4', lines: [{ name: 'Tajine', qty: 1, unitPrice: 80 }] });

// 1 · 2xx with an unreadable body: not acknowledged, stays queued, replay-safe.
for (const [label, text] of [['an HTML portal page', '<html>login</html>'], ['an empty body', ''], ['a truncated JSON', '{"ok":tr'], ['JSON without ok', '{"number":7}'], ['JSON ok:false', '{"ok":false}']]) {
  const h = relay({ respond: raw(200, text) });
  const t = ticket(h.R);
  const r = await h.R.send(t);
  ok(r.ok === false && r.uncertain === true && r.queued === true, `${label} on a 2xx: reported uncertain, not confirmed`, r);
  ok(h.queued().includes(t.id), `${label} on a 2xx: the ticket stays in the retry queue`, h.queued());
}

// 2 · A readable acknowledgement removes it, and a later readable retry also clears an uncertain one.
{
  let body = 'garbage';
  const h = relay({ respond: () => Promise.resolve(new Response(body, { status: 200 })) });
  const t = ticket(h.R);
  await h.R.send(t);
  ok(h.queued().includes(t.id), 'uncertain first');
  body = JSON.stringify({ ok: true, number: 12, session: 's1' });
  h.tick(); await new Promise((r) => setTimeout(r, 20));
  ok(!h.queued().includes(t.id), 'the retry that reads {ok:true} dequeues it', h.queued());
  const g = relay({ respond: raw(200, JSON.stringify({ ok: true, number: 3 })) });
  const u = ticket(g.R);
  const r = await g.R.send(u);
  ok(r.ok === true && r.number === 3 && !g.queued().includes(u.id), 'a readable ack is confirmed with its number', r);
}

// 3 · Corrupt storage is quarantined with its raw bytes before anything overwrites it.
{
  const h = relay({ respond: () => Promise.reject(new TypeError('offline')) });
  const bad = '[{"merchant":"relay-fixture","create":{"id":"ord-aaa';   // cut mid-write
  h.store.set('kiwiKitchenQueue', bad);
  const t = ticket(h.R);
  await h.R.send(t);                                  // enqueue reads the queue, then writes over it
  const copies = h.R.recoveryCopies();
  ok(copies.length === 1 && /kitchen-relay-corrupt/.test(copies[0].key), 'the unreadable queue is set aside', copies);
  ok(h.R.recoveryCopies(copies[0].key) === bad, 'the raw bytes are exportable verbatim');
  ok(h.events.some((e) => e.type === 'kiwi:kitchen-relay-evidence'), 'the page is told');
  ok(h.queued().includes(t.id), 'the new ticket is queued normally');
  h.R.recoveryCopies(copies[0].key, true);
  ok(h.R.recoveryCopies().length === 0, 'acknowledging removes the copy');
}
{
  const h = relay({ respond: () => Promise.reject(new TypeError('offline')) });
  h.store.set('kiwiKitchenQueue', '{"not":"an array"}');
  h.R.pending();
  ok(h.R.recoveryCopies().length === 1, 'a valid JSON that is not a queue is also kept');
}

// 4 · Six hours: leaves the retry queue, never silently.
{
  const h = relay({ respond: () => Promise.reject(new TypeError('offline')) });
  const old = ticket(h.R); await h.R.send(old);
  h.advance(5 * 3600e3);
  const mid = ticket(h.R); await h.R.send(mid);
  h.advance(1.5 * 3600e3);                            // old: 6.5 h, mid: 1.5 h
  h.tick();
  ok(h.queued().includes(mid.id) && !h.queued().includes(old.id), 'only the stale ticket leaves the queue', h.queued());
  ok(h.R.expired() === 1, 'it is on the expired list', h.R.recoveryCopies());
  const key = h.R.recoveryCopies()[0].key;
  const kept = JSON.parse(h.R.recoveryCopies(key));
  ok(kept.length === 1 && kept[0].create.id === old.id && kept[0].create.lines[0].name === 'Tajine', 'the expired ticket is kept intact', kept);
  ok(h.events.some((e) => e.type === 'kiwi:kitchen-relay-evidence' && e.detail.key === key), 'the page is told');
  h.R.recoveryCopies(key, true);
  ok(h.R.expired() === 0, 'acknowledged: gone');
}

console.log(`kitchen-relay-evidence-test: ${checks} checks passed`);
