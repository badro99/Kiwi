#!/usr/bin/env node
/* r21 cash: unreadable persisted cash-session evidence (opening, handover, close) is quarantined with its raw
   bytes before the next write can overwrite it, surfaced through queue-recovery.js, and exportable; and the
   export itself falls back to showing the text when the file download fails. Real code, in a vm. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { deadlineVmSource, deadlineVmContext } from './deadline-vm-source.mjs';
const read = (f) => fs.readFileSync(new URL('../' + f, import.meta.url), 'utf8');
const tick = () => new Promise((resolve) => setImmediate(resolve));
const OUTBOX = 'kiwi:cash-session-outbox:v1', REJECTED = 'kiwi:cash-session-rejected:v1';

function storage(seed = {}) {
  const map = new Map(Object.entries(seed));
  return { map, getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: (k, v) => { map.set(k, String(v)); }, removeItem: (k) => { map.delete(k); },
    get length() { return map.size; }, key: (i) => [...map.keys()][i] ?? null };
}
function bootCash(ls) {
  const events = [];
  const window = { KiwiEnv: { isReal: () => true }, KiwiCloudDoc: { currentSlug: () => 'r21-cash' }, KiwiCaissePairing: { isPaired: () => false },
    addEventListener() {}, dispatchEvent(e) { events.push(e.type); } };
  const context = deadlineVmContext({ window, localStorage: ls, document: { readyState: 'loading', addEventListener() {} }, crypto, Date, Math, JSON, Promise,
    CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init && init.detail; } }, setInterval() {}, fetch: () => new Promise(() => {}) });
  vm.runInNewContext(deadlineVmSource(read('assets/cash-sessions.js')), context, { filename: 'assets/cash-sessions.js' });
  return { api: window.KiwiCashSessions, events, window };
}

/* 1. A corrupt outbox is set aside byte for byte before the next emit overwrites the key. */
for (const [label, bad] of [['truncated JSON', '[{"id":"cash-open-1","sessionId":"s1","eventType":"open","merchant":"r21-cash","float'], ['valid JSON, not a list', '{"id":"cash-open-1"}']]) {
  const ls = storage({ [OUTBOX]: bad });
  const { api, events } = bootCash(ls);
  assert.equal(api._test.readOutbox().length, 0, label + ': nothing usable to replay');
  assert.ok(events.includes('kiwi:cash-sessions-corrupt'), label + ': the loss is announced');
  api.emit({ id: 'cash-new-1', sessionId: 's2', eventType: 'open', occurredAt: 1 });
  await tick();
  const copies = api.recoveryCopies();
  assert.equal(copies.length, 1, label + ': exactly one recovery copy');
  assert.equal(api.recoveryCopies(copies[0].key), bad, label + ': raw bytes preserved after the next write replaced the key');
  assert.equal(JSON.parse(ls.getItem(OUTBOX)).length, 1, label + ': the new event is stored');
  api._test.readOutbox(); api._test.readOutbox();
  assert.equal(api.recoveryCopies().length, 1, label + ': reading again does not multiply copies');
  assert.equal(api.recoveryCopies(copies[0].key, true), bad); assert.equal(api.recoveryCopies().length, 0, label + ': acknowledged copy is gone');
}
/* 2. The rejected-events list gets the same treatment. */
{
  const ls = storage({ [REJECTED]: '[{"id":' });
  const { api } = bootCash(ls);
  assert.equal(api._test.readRejected().length, 0);
  assert.equal(api.recoveryCopies().length, 1, 'rejected list quarantined too');
}
/* 3. Healthy and empty storage never raise a copy. */
{
  const { api, events } = bootCash(storage({ [OUTBOX]: JSON.stringify([{ id: 'a', merchant: 'r21-cash' }]) }));
  assert.equal(api._test.readOutbox().length, 1); assert.equal(bootCash(storage()).api._test.readOutbox().length, 0);
  assert.equal(api.recoveryCopies().length, 0); assert.ok(!events.includes('kiwi:cash-sessions-corrupt'));
}

/* 4. queue-recovery.js lists the cash copies, and a failing download falls back to the text. */
function node(tag) {
  const n = { tag, style: { cssText: '' }, children: [], attrs: {}, parent: null, textContent: '', value: '', readOnly: false,
    append(...kids) { kids.forEach((k) => { k.parent = n; n.children.push(k); }); }, remove() { if (n.parent) n.parent.children = n.parent.children.filter((c) => c !== n); n.parent = null; },
    setAttribute(k, v) { n.attrs[k] = v; }, focus() {}, select() { n.selected = true; }, click() { if (n.tag === 'a' && failing) throw new Error('download blocked'); } };
  return n;
}
const texts = (n) => [n.textContent].concat(n.children.flatMap(texts));
const find = (n, pred) => { if (pred(n)) return n; for (const c of n.children) { const h = find(c, pred); if (h) return h; } return null; };
let failing = false;
{
  const bad = '[{"id":"cash-close-9","eventType":"close"';
  const ls = storage({ [OUTBOX]: bad });
  const cash = bootCash(ls); cash.api._test.readOutbox();
  const doc = { readyState: 'complete', documentElement: { lang: 'fr' }, addEventListener() {}, createElement: node, body: node('body') };
  const clipboard = [];
  const context = { document: doc, URL: { createObjectURL() { if (failing === 'url') throw new Error('no blob url'); return 'blob:x'; }, revokeObjectURL() {} }, Blob: class {}, setTimeout,
    KiwiCashSessions: cash.api, navigator: { clipboard: { writeText: (t) => { clipboard.push(t); return Promise.resolve(); } } } };
  const host = node('div'); const listeners = [];
  context.window = Object.assign(context, { addEventListener: (n, f) => listeners.push([n, f]) });
  vm.runInNewContext(read('assets/queue-recovery.js'), context, { filename: 'assets/queue-recovery.js' });
  listeners.find(([n]) => n === 'kiwi:quarantine-review')[1]({ detail: host });
  const all = texts(host).join(' | ');
  assert.match(all, /Événements de caisse/, 'the cash copy is listed under a readable label: ' + all);
  assert.ok(!/kiwi:cash-session/.test(all), 'no storage key is shown');
  for (const mode of [true, 'url']) {
    failing = mode;
    const save = find(host, (n) => n.tag === 'button' && n.textContent === 'Exporter');
    save.onclick();
    const area = find(host, (n) => n.tag === 'textarea');
    assert.ok(area && area.value === bad && area.readOnly, 'when the download fails (' + mode + ') the raw copy is shown to copy');
    assert.ok(find(host, (n) => n.attrs.role === 'alert' && /Export impossible/.test(n.textContent)), 'and the failure is announced');
    await tick();
    assert.equal(clipboard.at(-1), bad, 'and the clipboard gets the raw copy');
    area.parent.remove();
  }
  failing = false;
  const before = find(host, (n) => n.tag === 'textarea');
  find(host, (n) => n.tag === 'button' && n.textContent === 'Exporter').onclick();
  assert.equal(before, null); assert.equal(find(host, (n) => n.tag === 'textarea'), null, 'a working download shows no fallback');
}
console.log('✓ cash outbox quarantine + export fallback');
