#!/usr/bin/env node
/* tools/printer-transport-deadline-test.mjs · a bridge that sends its headers and then stalls its
 * body, or a GATT write that never settles, cannot strand discovery, pairing or a print job (r21 print#B0/B1).
 *
 * Runs the shipped assets/printer/transports.js in a VM. fetch answers with headers at once and a body
 * that only ends when the request's AbortSignal fires (as a real stalled socket does); timers are manual.
 *
 *   node tools/printer-transport-deadline-test.mjs
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import printerTestSource from './printer-test-source.cjs';

const source = fs.readFileSync(new URL('../assets/printer/transports.js', import.meta.url), 'utf8');
let checks = 0;
const ok = (cond, label, detail) => { assert.ok(cond, label + (detail ? ' · ' + JSON.stringify(detail) : '')); checks++; };

function harness() {
  const timers = new Map(); let nextTimer = 1; const stalled = new Set();
  const cap = 'kbc_' + 'a'.repeat(64);
  const response = (signal, body, stall) => ({
    ok: true, status: 200,
    json: () => stall
      ? new Promise((_, reject) => signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError'))))
      : Promise.resolve(body),
  });
  const ctx = {
    Promise, Uint8Array, Object, JSON, Error, AbortController, DOMException, Number, String, RegExp,
    navigator: {}, window: {},
    setTimeout: (fn, ms) => { const id = nextTimer++; timers.set(id, { fn, ms }); return id; },
    clearTimeout: (id) => { timers.delete(id); },
    fetch: (url, init) => {
      const path = new URL(url).pathname;
      const stall = stalled.has(path);
      if (path === '/kiwi/ping') return Promise.resolve(response(init.signal, { ok: true, name: 'kiwi-printer-bridge', version: '1.5.0', capability: cap }, stall));
      return Promise.resolve(response(init.signal, { ok: true }, stall));
    },
  };
  vm.createContext(ctx);
  vm.runInContext(source, ctx);
  let disconnects = 0;
  const T = ctx.window.__kiwiPrinterTransports({
    getConfig: () => ({}), setConfig() {}, currentMerchantKey: () => 'm', ls: () => null, set() {}, fallbackNotice() {}, noteBridgeState() {},
  });
  const fireAll = () => { for (const [id, t] of [...timers]) { timers.delete(id); t.fn(); } };
  /* Resolves 'hung' when the promise is still pending after the event loop drained and every timer fired. */
  const settle = async (p) => {
    let out = 'hung'; p.then((v) => { out = { value: v }; }, (e) => { out = { error: e }; });
    for (let i = 0; i < 6; i++) await new Promise((r) => setImmediate(r));
    fireAll();
    for (let i = 0; i < 6; i++) await new Promise((r) => setImmediate(r));
    return out;
  };
  return { T, stalled, settle, timers, ctx, onDisconnect: () => disconnects, bumpDisconnect: () => { disconnects++; } };
}

// pingPort: headers arrive, body stalls
{
  const h = harness(); h.stalled.add('/kiwi/ping');
  const r = await h.settle(h.T.pingPort(9110, 600));
  ok(r !== 'hung' && r.value === null, 'pingPort: a stalled body ends at its deadline instead of hanging', r);
}
// saveBridgeTarget and pairLocalBridge after a good handshake
{
  const h = harness();
  const hs = await h.settle(h.T.ping());
  ok(hs !== 'hung' && hs.value && hs.value.ok, 'handshake works with a healthy bridge', hs);
  h.stalled.add('/kiwi/targets');
  const s = await h.settle(h.T.saveBridgeTarget({ ip: '10.0.0.5' }));
  ok(s !== 'hung' && s.value && s.value.ok === false && s.value.error === 'bridge-unreachable', 'saveBridgeTarget: a stalled body ends as bridge-unreachable', s);
  h.stalled.add('/kiwi/relay/pair');
  const p = await h.settle(h.T.pairLocalBridge('123456'));
  ok(p !== 'hung' && p.value && p.value.ok === false && p.value.error === 'bridge-unreachable', 'pairLocalBridge: a stalled body ends as bridge-unreachable', p);
}
// btWrite: a GATT write that never settles
{
  const h = harness();
  let disconnected = 0;
  h.T.bt.device = { gatt: { connected: true, disconnect() { disconnected++; this.connected = false; } } };
  h.T.bt.chr = { properties: { writeWithoutResponse: true }, writeValueWithoutResponse: () => new Promise(() => {}) };
  const r = await h.settle(h.T.btWrite(new Uint8Array(300)));
  ok(r !== 'hung' && r.error && /bt-write-timeout/.test(r.error.message), 'btWrite: a write that never settles is refused at its deadline', r);
  ok(disconnected === 1, 'the link is cut so a late chunk cannot print after the fallback transport', disconnected);
}
// btWrite still works when writes settle
{
  const h = harness(); const sent = [];
  h.T.bt.device = { gatt: { connected: true, disconnect() {} } };
  h.T.bt.chr = { properties: { writeWithoutResponse: true }, writeValueWithoutResponse: (c) => { sent.push(c.length); return Promise.resolve(); } };
  const p = h.T.btWrite(new Uint8Array(400));
  for (let i = 0; i < 12; i++) { await new Promise((r) => setImmediate(r)); for (const [id, t] of [...h.timers]) { if (t.ms === 16) { h.timers.delete(id); t.fn(); } } }
  await p;
  ok(sent.join() === '180,180,40', 'btWrite: healthy writes are still chunked 180 B', sent);
}
// USB / Bluetooth success means the bytes were handed to the device, not that paper came out.
{
  const el = () => ({ style: {}, classList: { add() {}, remove() {}, contains: () => false }, setAttribute() {}, appendChild() {}, remove() {}, addEventListener() {} });
  const device = {
    opened: false, configuration: { interfaces: [{ interfaceNumber: 0, alternates: [{ interfaceClass: 7, endpoints: [{ direction: 'out', type: 'bulk', endpointNumber: 1 }] }] }] },
    open() { this.opened = true; return Promise.resolve(); }, claimInterface: () => Promise.resolve(), transferOut: () => Promise.resolve({ status: 'ok' }),
  };
  const ctx = {
    console, Promise, Date, JSON, Math, Object, Array, String, Number, Boolean, Uint8Array, Error, TypeError, AbortController, RegExp,
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} }, fetch: () => Promise.reject(new TypeError('offline')),
    navigator: { usb: { requestDevice: () => Promise.resolve(device) } }, location: { origin: 'https://kiwi-os.com' },
    document: { readyState: 'complete', createElement: el, getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], addEventListener() {}, body: el(), head: el() },
    CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init && init.detail; } },
    setTimeout, clearTimeout, setInterval: () => 1, clearInterval() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent: () => true,
    KiwiEscPos: { paperWidths: [{ value: '80', label: '80' }] },
  };
  ctx.window = ctx; vm.createContext(ctx); vm.runInContext(printerTestSource(), ctx);
  await ctx.KiwiPrinter.connectUsb();
  const res = await ctx.KiwiPrinter.printBytesToTarget(new Uint8Array([27, 64, 10]), { type: 'usb' });
  ok(res.ok === true && res.via === 'usb' && res.delivery === 'sent', 'a USB write is reported as sent, not as printed', res);
}
console.log(`printer-transport-deadline-test: ${checks} checks passed`);
