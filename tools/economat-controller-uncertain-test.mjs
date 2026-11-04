#!/usr/bin/env node
/* Kiwi · economat-controller-uncertain-test.mjs · economat#2.
 *
 * The economat request controller (assets/hotel-economat-requests.js) turns a
 * tap into a command whose idempotency key is derived from the request id, the
 * action and the revision it read. A lost answer is the dangerous moment: the
 * server may or may not have applied the command, and the next tap, in the same
 * session or after a reload, must neither lose it nor write it twice.
 *
 * This runs the REAL controller (vm, minimal DOM) over the REAL transport and
 * the real internal-requests route on SQLite, loses the answer at each custody
 * stage (review, prepare, confirm) in both situations (server applied it /
 * server never got it), then taps again with and without a full reload of the
 * controller from the server, and checks the key sent each time and the effects
 * written (events, reservations, stock movements, custody balances).
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createHotelRequestHarness, MERCHANT } from './fixtures/hotel-request-db.mjs';
import { onRequestGet } from '../functions/api/inventory/internal-requests.js';

const store = new Map();
globalThis.addEventListener = () => {};
globalThis.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { onLine: true } });
const transport = await import('../assets/hotel-economat-transport.js');
const h = await createHotelRequestHarness();

/* the network: the real route behind it, with a switch that loses the answer */
const sent = [];
let loseNext = null;      /* 'applied' | 'never' */
globalThis.fetch = async (url, options = {}) => {
  const u = new URL(url, 'https://kiwi.test');
  if (options.method === 'POST') {
    const data = JSON.parse(options.body); sent.push(data);
    if (loseNext === 'never') { loseNext = null; throw Object.assign(new Error('request-timeout'), { code: 'request-timeout' }); }
    const response = await h.post(data);
    if (loseNext === 'applied') { loseNext = null; throw Object.assign(new Error('request-timeout'), { code: 'request-timeout' }); }
    return response;
  }
  if (u.pathname === '/api/inventory/internal-requests') return onRequestGet({ request: new Request('https://kiwi.test' + u.pathname + u.search, { headers: { cookie: h.ownerCookie } }), env: h.env });
  if (u.pathname === '/api/store') {
    const feature = u.searchParams.get('feature');
    const row = h.one('SELECT data FROM store_docs WHERE merchant = ? AND feature = ?', MERCHANT, feature);
    return new Response(JSON.stringify({ ok: true, data: row ? JSON.parse(row.data) : null }), { headers: { 'content-type': 'application/json' } });
  }
  return new Response('{}', { status: 404 });
};

/* a DOM that answers the few selectors the controller reads from its sheet */
const answers = { prepare: null, confirm: null };
function fakeEl(sheetState) {
  const el = {
    isConnected: true, innerHTML: '', disabled: false, value: '', classList: { add() {}, contains: () => true }, addEventListener() {},
    getAttribute: () => null, setAttribute() {}, removeAttribute() {}, matches: () => false, closest: () => null,
    querySelectorAll: () => [],
    querySelector(sel) {
      let m;
      if ((m = sel.match(/^\[data-pp-qty\]\[data-line="(\d+)"\]$/))) return { value: String(answers.prepare[+m[1]]) };
      if ((m = sel.match(/^\[data-rc-qty\]\[data-line="(\d+)"\]$/))) return { value: String(answers.confirm[+m[1]]) };
      if (sel === 'input[name="hx-req-method"]:checked') return { value: 'delivery' };
      if ((m = sel.match(/^\.hx-req-review\[data-line="(\d+)"\]$/))) return { querySelector: (s) => ({ value: /rv-res/.test(s) ? 'approved' : '' }) };
      return { ...el, querySelector: el.querySelector };
    },
  };
  return el;
}
const toasts = [];
function boot() {
  const host = { isConnected: true, innerHTML: '' };
  const document = { querySelector: (s) => (/data-eco-requests-host/.test(s) ? host : null) };
  const handlers = {};
  const sheetRef = fakeEl();
  const Kiwi = { handlers, toast: (m, o) => toasts.push([m, o && o.type]), modal: () => ({ el: sheetRef, close() {} }) };
  const window = { Kiwi, KiwiInventory: { merchant: () => MERCHANT, sync: async () => {} }, KiwiI18n: { getLang: () => 'fr' } };
  window.window = window;
  let src = fs.readFileSync(new URL('../assets/hotel-economat-requests.js', import.meta.url), 'utf8');
  const tail = "}(function () { return import('./hotel-economat-transport.js?v=13'); }));";
  assert.ok(src.includes(tail), 'transport import hook found');
  src = src.replace(tail, '}(function () { return Promise.resolve(__economatTransport); }));');
  vm.runInNewContext(src, { __economatTransport: transport, window, document, Kiwi, console, Intl, Promise, setTimeout, clearTimeout, Math, Date, Number, String, Object, Array, JSON, Error });
  const api = window.KiwiEconomatRequests;
  const tap = async (id) => { handlers['eco-req-open']({ getAttribute: () => id }); await Promise.resolve(handlers['eco-req-act']()); await new Promise((r) => setTimeout(r, 5)); };
  return { api, handlers, tap, host, state: () => api.state() };
}
const keys = (since) => sent.slice(since).map((b) => b.idempotencyKey);
const count = (sql, ...a) => Number(h.one(sql, ...a).n);
const events = (id, event) => count("SELECT COUNT(*) n FROM hotel_internal_request_events WHERE merchant = ? AND request_id = ? AND event = ?", MERCHANT, id, event);
const movements = () => count('SELECT COUNT(*) n FROM inventory_movements WHERE merchant = ?', MERCHANT);

console.log('■ Économat : réponse perdue à chaque étape de garde');

/* One stage: lose the answer (the server applied the command, or never got it),
   then tap again on the same screen, or after a full reload; return what was
   sent. Inputs the sheet would hold are derived from the request itself. */
let c;
async function stage(id, action, lose, between) {
  const r = c.state().requests.find((x) => x.request.id === id);
  answers.prepare = r.lines.map((l) => Number(l.qtyApproved));
  answers.confirm = r.lines.map((l) => Number(l.qtyPrepared));
  const at = sent.length; loseNext = lose;
  await c.tap(id);
  const afterFirst = { events: events(id, action), movements: movements() };
  if (between === 'reload') { c = boot(); await c.api.reload(); }
  if (between !== 'none') await c.tap(id);
  const k = keys(at);
  return { k, afterFirst, now: { events: events(id, action), movements: movements() } };
}
const fresh = async (id) => { await h.createSubmitted(id, 'cola', 2); c = boot(); await c.api.reload(); };

/* applied but answer lost, tap again on the same screen: same key, replay, one effect */
await fresh('r-a');
for (const action of ['review', 'prepare', 'confirm']) {
  const out = await stage('r-a', action, 'applied', 'retap');
  assert.equal(out.afterFirst.events, 1, `${action}: the server applied the first attempt`);
  assert.equal(out.k.length, 2, `${action}: two attempts reached the network`);
  assert.equal(out.k[0], out.k[1], `${action}: same key on the retap after a lost answer (${out.k})`);
  assert.match(out.k[0], new RegExp('^ui:r-a:' + action + ':r\\d+$'));
  assert.equal(out.now.events, 1, `${action}: written once`);
  assert.equal(out.now.movements, out.afterFirst.movements, `${action}: no second stock effect`);
  c = boot(); await c.api.reload();                       /* the screen after the answer finally arrives */
}
assert.equal(h.balance('cola', 'u-bar-rooftop'), 2, 'the department holds exactly what was handed over');
assert.equal(count('SELECT COUNT(*) n FROM inventory_request_reservations WHERE request_id = ?', 'r-a'), 0, 'no reservation left behind');

/* never reached the server, full reload, tap: same revision, same key, applied once */
await fresh('r-b');
for (const action of ['review', 'prepare', 'confirm']) {
  const out = await stage('r-b', action, 'never', 'reload');
  assert.equal(out.afterFirst.events, 0, `${action}: the server never saw the first attempt`);
  assert.equal(out.k.length, 2);
  assert.equal(out.k[0], out.k[1], `${action}: after a reload the same revision yields the same key (${out.k})`);
  assert.equal(out.now.events, 1, `${action}: written once after the retry`);
}
assert.equal(h.balance('cola', 'u-bar-rooftop'), 4, 'second request handed over once too');

/* applied but lost, then a full reload: the screen has moved on to the next
   stage and never re-sends the stage that already landed */
const reviewIt = (id) => h.post({ action: 'review', merchant: MERCHANT, id, revision: 2, idempotencyKey: 'seed:review:' + id, data: { lines: [{ itemId: 'cola', qtyApproved: 2, resolution: 'approved' }] } });
for (const [action, id] of [['review', 'r-c1'], ['prepare', 'r-c2'], ['confirm', 'r-c3']]) {
  if (action === 'confirm') { await h.ready(id, 'cola', 2); c = boot(); await c.api.reload(); }
  else { await h.createSubmitted(id, 'cola', 2); if (action === 'prepare') await reviewIt(id); c = boot(); await c.api.reload(); }
  const out = await stage(id, action, 'applied', 'none');
  assert.equal(out.afterFirst.events, 1, `${action}: applied once, answer lost`);
  c = boot(); await c.api.reload();
  assert.equal(events(id, action), 1, `${action}: still once after the reload`);
  const at = sent.length;
  if (action !== 'confirm') {
    await c.tap(id);
    const next = keys(at);
    assert.equal(next.length, 1);
    assert.ok(!next[0].startsWith('ui:' + id + ':' + action + ':'), `${action}: the reloaded screen offers the next stage, not this one again (${next})`);
  } else {
    const r = c.state().requests.find((x) => x.request.id === id);
    assert.ok(r.lines.every((l) => Number(l.qtyReceived) === Number(l.qtyPrepared)), 'confirm: the reloaded screen shows the receipt');
    assert.equal(keys(at).length, 0, 'confirm: nothing is re-sent by reloading');
  }
}
assert.equal(h.balance('cola', 'u-bar-rooftop'), 6, 'three requests, each confirmed once, hold exactly what was handed over');
console.log('  ✓ économat : même clé à chaque étape de garde après une réponse perdue, avec ou sans rechargement, et chaque effet écrit une seule fois');
process.exit(0);
