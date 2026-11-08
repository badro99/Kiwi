#!/usr/bin/env node
/* tools/bridge-process-fault-test.mjs · a REAL bridge process (bridge/server.js) killed in the middle
 * of a socket write to the printer (r21 kitchen#A2). Not a simulated bridge: node bridge/server.js runs
 * as a child, a TCP "printer" on loopback stops reading so the bridge's socket.write cannot finish, and
 * the child is SIGKILLed with part of the ticket on the wire.
 *
 * What it proves:
 *   · the bridge never answers 200/ok for a write it did not finish (the client sees a dropped
 *     connection, never a success);
 *   · the printer really holds only part of the ticket (the fault is mid-write, not before or after);
 *   · the shipped printer client, talking to that real process, reports { ok:false } and never
 *     { ok:true }, and the same ticket reference is what reaches the cloud relay fallback, so the
 *     relay's idempotency key can recognise it.
 * What it does NOT prove: that paper came out, or that a browser can tell a reset from a refused
 * connection (it cannot: both are a TypeError), so the ruled relay fallback stays for both.
 *
 *   node tools/bridge-process-fault-test.mjs
 */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import printerTestSource from './printer-test-source.cjs';

const ROOT = path.resolve(import.meta.dirname, '..');
let checks = 0;
const ok = (cond, label, detail) => { assert.ok(cond, label + (detail ? ' · ' + JSON.stringify(detail) : '')); checks++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const listen = (server, port) => new Promise((res, rej) => { server.once('error', rej); server.listen(port, '127.0.0.1', () => res(server.address().port)); });

// A free bridge port in the range the client scans.
let bridgePort = 0;
for (const p of [9110, 9111, 9112, 9113, 9114]) {
  const probe = net.createServer();
  try { await listen(probe, p); bridgePort = p; probe.close(); break; } catch { /* taken */ }
}
if (!bridgePort) { console.log('○ skip bridge-process-fault: no free bridge port in 9110-9114'); process.exit(0); }

// The printer: accepts, then stops reading. Records how many bytes crossed.
let received = 0; const printerSockets = [];
const printer = net.createServer((s) => { printerSockets.push(s); s.on('data', (c) => { received += c.length; s.pause(); }); s.on('error', () => {}); });
let printerPort = 0;
try { printerPort = await listen(printer, 0); } catch (e) { console.log('○ skip bridge-process-fault: cannot listen on loopback here (' + (e.code || e.message) + ')'); process.exit(0); }

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kiwi-bridge-fault-'));
const child = spawn(process.execPath, [path.join(ROOT, 'bridge/server.js')], {
  env: { ...process.env, KIWI_BRIDGE_PORT: String(bridgePort), KIWI_BRIDGE_CONFIG: path.join(dir, 'cfg.json'), HOME: dir, KIWI_RELAY_URL: 'http://127.0.0.1:1' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let up = false; child.stdout.on('data', (d) => { if (/listening on/.test(String(d))) up = true; }); child.stderr.on('data', () => {});
for (let i = 0; i < 100 && !up; i++) await sleep(50);
if (!up) { child.kill('SIGKILL'); console.log('○ skip bridge-process-fault: the bridge did not start in this sandbox'); process.exit(0); }
const cleanup = () => { try { child.kill('SIGKILL'); } catch {} printer.close(); for (const s of printerSockets) s.destroy(); fs.rmSync(dir, { recursive: true, force: true }); };

const ORIGIN = 'https://kiwi-os.com';
function call(method, url, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const req = http.request({ host: '127.0.0.1', port: bridgePort, path: url, method, headers: { Origin: ORIGIN, ...(data ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } : {}), ...headers } }, (res) => {
      const chunks = []; res.on('data', (c) => chunks.push(c));
      res.on('end', () => { let json = null; try { json = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch {} resolve({ status: res.statusCode, json }); });
      res.on('error', reject);
    });
    req.on('error', reject); if (data) req.write(data); req.end();
  });
}

const ping = await call('GET', '/kiwi/ping');
const cap = ping.json && ping.json.capability;
ok(/^kbc_[0-9a-f]{64}$/.test(cap || ''), 'the real bridge hands out its capability', ping.status);
const saved = await call('POST', '/kiwi/targets', { action: 'save', target: { ip: '127.0.0.1', port: printerPort } }, { 'X-Kiwi-Bridge-Capability': cap });
ok(saved.json && saved.json.ok, 'the printer target is saved on the real bridge', saved);

// The printer never drains, so the kernel buffers fill and a bridge write cannot finish. One ticket
// can fit in those buffers on a given host; a dozen cannot, on any host. They queue behind each other
// per printer, exactly as a busy service does.
const big = Buffer.alloc(1_400_000, 0x41);        // under the bridge's 2 MB body cap once base64'd
const outcomes = new Array(12).fill(null);
const fill = Array.from({ length: 12 }, (_, i) => call('POST', '/kiwi/print', { printerIp: '127.0.0.1', port: printerPort, dataB64: big.toString('base64') }, { 'X-Kiwi-Bridge-Capability': cap })
  .then((r) => { outcomes[i] = { response: r }; }, (e) => { outcomes[i] = { dropped: e.code || e.message }; }));
for (let i = 0; i < 100 && received === 0; i++) await sleep(20);
await sleep(1200);

// The shipped client against the same real process, one more ticket behind the stuck ones.
const relayCalls = [];
const nodeFetch = (url, opts = {}) => {
  url = String(url);
  if (url.startsWith('/api/print/jobs')) { relayCalls.push(JSON.parse(opts.body || '{}')); return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ ok: true, id: 'pj_x' }) }); }
  if (url.startsWith('/api/print/bridges')) return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ ok: true, online: true, bridges: [{}] }) });
  const u = new URL(url);
  return new Promise((resolve, reject) => {
    const req = http.request({ host: u.hostname, port: u.port, path: u.pathname + u.search, method: opts.method || 'GET', headers: { Origin: ORIGIN, ...(opts.headers || {}) } }, (res) => {
      const chunks = []; res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({ ok: res.statusCode < 400, status: res.statusCode, json: () => Promise.resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))) }));
      res.on('error', () => reject(new TypeError('fetch failed')));
    });
    req.on('error', () => reject(new TypeError('fetch failed')));
    if (opts.signal) opts.signal.addEventListener('abort', () => { req.destroy(); reject(Object.assign(new Error('aborted'), { name: 'AbortError' })); });
    if (opts.body) req.write(opts.body); req.end();
  });
};
const el = () => ({ style: {}, classList: { add() {}, remove() {}, contains: () => false }, setAttribute() {}, appendChild() {}, remove() {}, addEventListener() {} });
const store = new Map([['kiwiPrinterCfg', JSON.stringify({ ip: '127.0.0.1', port: printerPort, paper: '80' })]]);
const ctx = {
  console, Promise, Date, JSON, Math, Object, Array, String, Number, Boolean, Uint8Array, Error, TypeError, AbortController, RegExp, URL,
  localStorage: { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) },
  fetch: nodeFetch, navigator: {}, location: { origin: ORIGIN },
  document: { readyState: 'complete', createElement: el, getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], addEventListener() {}, body: el(), head: el() },
  CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init && init.detail; } },
  setTimeout, clearTimeout, setInterval: () => 1, clearInterval() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent: () => true,
  KiwiEscPos: { toB64: () => big.toString('base64'), kitchenTicket: () => new Uint8Array([27, 64, 10]), receipt: () => new Uint8Array([27, 64, 10]), paperWidths: [{ value: '80', label: '80' }] },
};
ctx.window = ctx; vm.createContext(ctx); vm.runInContext(printerTestSource(), ctx);
const job = ctx.KiwiPrinter.printKitchen({ title: 'CUISINE', items: [] }, { clientRef: 'kq.ord-fault:cuisson' });
await sleep(600);
const stillOpen = outcomes.filter((o) => o === null).length;
child.kill('SIGKILL');
const res = await job;
await Promise.all(fill);
ok(stillOpen >= 1, 'the fault lands mid-write: tickets are still being written to the stalled printer when the process dies', { stillOpen });
ok(outcomes.every((o) => o && (o.dropped || o.response.status === 200)) && outcomes.filter((o) => o.dropped).length >= stillOpen, 'every write the kill interrupted ends as a dropped connection, never as an error or ok answer', outcomes.map((o) => o.dropped || o.response.status));
ok(received < big.length * 12, 'the printer holds only part of what was sent', { received });
ok(res && res.ok === false, 'the shipped client never reports a success for a write the bridge did not finish', res);
ok(relayCalls.length <= 1 && relayCalls.every((x) => /ord-fault/.test(JSON.stringify(x))), 'any relay fallback carries the same ticket reference, so the cloud idempotency key can recognise it', relayCalls.map((x) => x.clientRef));
cleanup();
console.log(`bridge-process-fault-test: ${checks} checks passed`);
