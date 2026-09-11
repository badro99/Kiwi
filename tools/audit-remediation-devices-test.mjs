#!/usr/bin/env node
/* Focused regression coverage for audit findings D01-D03.
 *
 * D01 uses the shipped Node bridge as a real HTTP process and a real TCP sink.
 * D02 invokes the shipped Cloudflare handlers against node:sqlite, including
 * two bridge pollers and a stale claim. D03 executes the shipped auth guard and
 * native runtime in small browser/native harnesses; business evidence is kept
 * in both cases. No production endpoint, printer, provider or merchant data is
 * used.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let passed = 0;
function check(condition, label) { assert(condition, label); passed++; console.log('  + ' + label); }

function response(status, body) {
  return { status, ok: status >= 200 && status < 300, clone: () => response(status, body), json: async () => body };
}

async function bridgeBoundaryTest() {
  const sink = net.createServer((socket) => socket.on('data', () => {}));
  const sinkSockets = new Set();
  sink.on('connection', (socket) => { sinkSockets.add(socket); socket.on('close', () => sinkSockets.delete(socket)); });
  await new Promise((resolve) => sink.listen(0, '127.0.0.1', resolve));
  const printerPort = sink.address().port;
  const cfgPath = path.join(os.tmpdir(), 'kiwi-audit-device-' + process.pid + '.json');
  try { fs.unlinkSync(cfgPath); } catch (_) {}
  const bridgePort = 9300 + (process.pid % 100);
  const child = spawn(process.execPath, [path.join(ROOT, 'bridge/server.js')], {
    env: { ...process.env, KIWI_BRIDGE_PORT: String(bridgePort), KIWI_BRIDGE_CONFIG: cfgPath, KIWI_RELAY_URL: 'http://127.0.0.1:1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let log = '';
  child.stdout.on('data', (chunk) => { log += chunk; });
  child.stderr.on('data', (chunk) => { log += chunk; });
  const call = async (method, url, { origin, capability, body } = {}) => {
    const headers = {};
    if (origin) headers.Origin = origin;
    if (capability) headers['X-Kiwi-Bridge-Capability'] = capability;
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const res = await fetch('http://127.0.0.1:' + bridgePort + url, {
      method, headers, body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    let json = null; try { json = JSON.parse(text); } catch (_) {}
    return { status: res.status, json, text };
  };
  try {
    let ping = null;
    for (let i = 0; i < 50 && !ping; i++) {
      try { const r = await call('GET', '/kiwi/ping', { origin: 'https://kiwi-os.com' }); if (r.status === 200) ping = r.json; }
      catch (_) { await sleep(50); }
    }
    check(ping && /^kbc_[0-9a-f]{64}$/.test(ping.capability) && ping.capabilityRequired === true && ping.version === '1.4.5', 'D01 bridge advertises secure protocol and issues a capability only through a trusted origin');
    const capability = ping.capability;

    const foreign = await call('POST', '/kiwi/print', {
      origin: 'https://evil.example', capability,
      body: { printerIp: '127.0.0.1', port: printerPort, dataB64: 'S0lXSA==' },
    });
    check(foreign.status === 403 && foreign.json.error === 'origin-not-allowed', 'D01 foreign Origin is rejected before transport');

    const noCapability = await call('POST', '/kiwi/print', {
      origin: 'https://kiwi-os.com',
      body: { printerIp: '127.0.0.1', port: printerPort, dataB64: 'S0lXSA==' },
    });
    check(noCapability.status === 401 && noCapability.json.error === 'bridge-capability-required', 'D01 trusted origin without install capability cannot invoke commands');

    const unsaved = await call('POST', '/kiwi/print', {
      origin: 'https://kiwi-os.com', capability,
      body: { printerIp: '127.0.0.1', port: printerPort, dataB64: 'S0lXSA==' },
    });
    check(unsaved.status === 409 && unsaved.json.error === 'printer-target-not-saved', 'D01 capability alone cannot select an unsaved TCP destination');

    const saved = await call('POST', '/kiwi/targets', {
      origin: 'https://kiwi-os.com', capability,
      body: { action: 'save', target: { ip: '127.0.0.1', port: printerPort } },
    });
    check(saved.status === 200 && saved.json.ok, 'D01 explicit target enrollment succeeds for a local printer');
    const printed = await call('POST', '/kiwi/print', {
      origin: 'https://kiwi-os.com', capability,
      body: { printerIp: '127.0.0.1', port: printerPort, dataB64: 'S0lXSA==' },
    });
    check(printed.status === 200 && printed.json.ok && printed.json.via === 'tcp', 'D01 enrolled target still performs a real bridge print');
    check(!/kbc_[0-9a-f]{64}/.test(log), 'D01 capability is not logged by the bridge');
  } finally {
    await new Promise((resolve) => {
      if (child.exitCode !== null || child.signalCode) return resolve();
      child.once('exit', resolve);
      child.kill('SIGTERM');
    });
    for (const socket of sinkSockets) socket.destroy();
    await new Promise((resolve) => sink.close(resolve));
    try { fs.unlinkSync(cfgPath); } catch (_) {}
  }
}

async function bridgeRolloutTest() {
  const legacy = { ok: true, name: 'kiwi-printer-bridge', version: '1.4.4' };
  const secure = { ...legacy, version: '1.4.5', capabilityRequired: true, capability: 'kbc_' + 'b'.repeat(64) };
  const bytes = new Uint8Array([27, 64, 65]);
  const target = { ip: '192.168.1.55', port: 9100 };
  function harness(protocol = legacy, memory = new Map()) {
    const state = { protocol, calls: [], deny: false, port: 9110 };
    const context = {
      console, URL, AbortController, Uint8Array, setTimeout, clearTimeout,
      navigator: {}, document: { addEventListener() {} },
      localStorage: { getItem: key => memory.get(key) ?? null, setItem: (key, val) => memory.set(key, String(val)) },
      addEventListener() {}, dispatchEvent() {},
      KiwiEscPos: { toB64: data => Buffer.from(data).toString('base64') },
      fetch: async (url, options = {}) => {
        const u = new URL(url);
        if (u.hostname !== '127.0.0.1' || Number(u.port) !== state.port) throw new Error('synthetic-no-bridge');
        state.calls.push({ path: u.pathname, headers: options.headers || {}, body: options.body });
        if (u.pathname === '/kiwi/ping') return response(200, state.protocol);
        if (state.deny) return response(401, { ok: false, error: 'bridge-capability-required' });
        if (u.pathname === '/kiwi/targets') {
          assert.equal(options.headers['X-Kiwi-Bridge-Capability'], state.protocol.capability);
          return response(200, { ok: true });
        }
        return response(200, { ok: true, bytes: bytes.length });
      },
    };
    context.window = context;
    vm.runInNewContext(read('assets/printer-bridge.js'), context);
    return { state, api: context.KiwiPrinter, memory };
  }
  const old = harness();
  check((await old.api.printBytesToTarget(bytes, target)).ok, 'rollout: published legacy bridge still prints through the actual client');
  check(!old.state.calls.some(c => c.path === '/kiwi/targets' || c.headers['X-Kiwi-Bridge-Capability']), 'rollout: old bridge is not sent unsupported enrollment or capability headers');
  check((await old.api.wake(target)).ok, 'rollout: legacy printer wake still works');
  check((await old.api.relayPairLocal('000000')).ok, 'rollout: legacy local relay pairing keeps its protocol');
  old.state.protocol = secure;
  old.state.calls.length = 0;
  check((await old.api.printBytesToTarget(bytes, target)).ok, 'rollout: next print automatically adopts an upgraded bridge without refresh');
  const secureCommands = old.state.calls.filter(c => c.path !== '/kiwi/ping');
  check(secureCommands[0].path === '/kiwi/targets' && secureCommands[1].path === '/kiwi/print'
    && secureCommands.every(c => c.headers['X-Kiwi-Bridge-Capability'] === secure.capability), 'rollout: upgraded bridge enrolls then prints with the selected capability');
  check((await old.api.relayPairLocal('000000')).ok && old.state.calls.at(-1).headers['X-Kiwi-Bridge-Capability'] === secure.capability, 'rollout: local pairing sends the new command capability');
  old.state.deny = true;
  old.state.calls.length = 0;
  check(!(await old.api.printBytesToTarget(bytes, target)).ok && !old.state.calls.some(c => c.path === '/kiwi/print'), 'rollout: secure enrollment denial never retries through legacy printing');
  const downgraded = harness(legacy, old.memory);
  check(!(await downgraded.api.printBytesToTarget(bytes, target)).ok && !downgraded.state.calls.some(c => c.path === '/kiwi/print'), 'rollout: reload retains the secure-protocol fence against downgrade');
  const moved = harness(secure);
  await moved.api.ping();
  moved.state.port = 9111;
  moved.state.protocol = legacy;
  moved.state.calls.length = 0;
  await moved.api.ping();
  check(!(await moved.api.printBytesToTarget(bytes, target)).ok && !moved.state.calls.some(c => c.headers['X-Kiwi-Bridge-Capability']), 'rollout: port changes never carry an old capability to another bridge');
  for (const protocol of [
    { ...secure, capability: '' }, { ...secure, capability: 'invalid' },
    { ...legacy, version: '9.0.0' }, { ...legacy, name: 'unrecognized-service' },
    { ...legacy, capability: '' },
  ]) {
    const h = harness(protocol);
    check(!(await h.api.printBytesToTarget(bytes, target)).ok && !h.state.calls.some(c => c.path === '/kiwi/print'), 'rollout: absent/invalid modern credentials or unknown service cannot become legacy');
    check(!(await h.api.relayPairLocal('000000')).ok && !h.state.calls.some(c => c.path === '/kiwi/relay/pair'), 'rollout: local pairing cannot bypass missing modern credentials');
  }
}

function fakeD1(db) {
  const statement = (sql, args = []) => ({
    bind: (...next) => statement(sql, next),
    first: async () => db.prepare(sql).get(...args) ?? null,
    all: async () => ({ results: db.prepare(sql).all(...args) }),
    run: async () => { const result = db.prepare(sql).run(...args); return { meta: { changes: Number(result.changes) } }; },
  });
  return { prepare: (sql) => statement(sql), batch: async (items) => Promise.all(items.map((item) => item.run())) };
}

function request(method, url, { cookie, bearer, body } = {}) {
  const headers = new Headers();
  if (cookie) headers.set('Cookie', cookie);
  if (bearer) headers.set('Authorization', 'Bearer ' + bearer);
  if (body !== undefined) headers.set('Content-Type', 'application/json');
  return new Request('https://kiwi-os.com' + url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
}

async function routeCall(route, method, url, options, env) {
  const fn = route['onRequest' + method[0] + method.slice(1).toLowerCase()];
  const result = await fn({ request: request(method, url, options), env });
  let json = null; try { json = await result.json(); } catch (_) {}
  return { status: result.status, json };
}

async function relayRaceTest() {
  const lib = await import(pathToFileURL(path.join(ROOT, 'functions/auth/_lib.js')).href);
  const relay = await import(pathToFileURL(path.join(ROOT, 'functions/api/print/_relay.js')).href);
  const jobs = await import(pathToFileURL(path.join(ROOT, 'functions/api/print/jobs.js')).href);
  const db = new DatabaseSync(':memory:');
  db.exec(read('migrations/2026-08-21-print-relay.sql'));
  db.exec('CREATE TABLE IF NOT EXISTS pair_attempts (ip TEXT PRIMARY KEY, fails INTEGER NOT NULL, first_ts INTEGER NOT NULL, blocked_until INTEGER)');
  db.exec('CREATE TABLE IF NOT EXISTS merchant_config (merchant TEXT PRIMARY KEY, till_epoch INTEGER DEFAULT 0, status TEXT DEFAULT \'active\')');
  db.prepare('INSERT INTO merchant_config(merchant,till_epoch,status) VALUES(?,?,?)').run('audit-shop', 0, 'active');
  const env = { DB: fakeD1(db), AUTH_SECRET: 'audit-device-test-only' };
  const cookie = 'kiwi_till=' + await lib.tillToken(env.AUTH_SECRET, 'audit-shop');
  const tokenA = 'kpb_' + 'a'.repeat(64);
  const tokenB = 'kpb_' + 'b'.repeat(64);
  db.prepare('INSERT INTO print_bridges(id,merchant,name,token_hash,created_ts,last_seen_ts) VALUES(?,?,?,?,?,?)')
    .run('bridge-a', 'audit-shop', 'A', await relay.sha256Hex(tokenA), Date.now(), Date.now());
  db.prepare('INSERT INTO print_bridges(id,merchant,name,token_hash,created_ts,last_seen_ts) VALUES(?,?,?,?,?,?)')
    .run('bridge-b', 'audit-shop', 'B', await relay.sha256Hex(tokenB), Date.now(), Date.now());

  const enqueue = await routeCall(jobs, 'POST', '/api/print/jobs?merchant=audit-shop', {
    cookie, body: { target: { ip: '192.168.1.50', port: 9100 }, dataB64: 'S0lX', kind: 'receipt' },
  }, env);
  check(enqueue.status === 200 && enqueue.json && enqueue.json.ok, 'D02 real print route durably enqueues a job in SQLite (' + enqueue.status + ' ' + JSON.stringify(enqueue.json) + ')');
  const firstJobId = enqueue.json.id;
  const [pollA, pollB] = await Promise.all([
    routeCall(jobs, 'GET', '/api/print/jobs', { bearer: tokenA }, env),
    routeCall(jobs, 'GET', '/api/print/jobs', { bearer: tokenB }, env),
  ]);
  const claimed = [pollA, pollB].flatMap((r) => r.json && r.json.jobs || []);
  check(claimed.length === 1, 'D02 concurrent SQLite pollers claim a queued ticket exactly once');
  check(db.prepare("SELECT COUNT(*) AS n FROM print_jobs WHERE id=? AND status='claimed'").get(firstJobId).n === 1, 'D02 SQLite state has one authoritative claim');

  db.prepare('UPDATE print_jobs SET claimed_ts=? WHERE id=?').run(Date.now() - 60000, firstJobId);
  const recoveryPoll = await routeCall(jobs, 'GET', '/api/print/jobs', { bearer: tokenB }, env);
  const uncertain = db.prepare('SELECT status,error FROM print_jobs WHERE id=?').get(firstJobId);
  check(recoveryPoll.status === 200 && recoveryPoll.json.jobs.length === 0 && uncertain.status === 'uncertain', 'D02 stale claim is quarantined instead of being blindly re-served');
  const status = await routeCall(jobs, 'GET', '/api/print/jobs?merchant=audit-shop&id=' + firstJobId, { cookie }, env);
  check(status.json.job.status === 'uncertain' && status.json.job.error === 'output-unknown-ack-timeout', 'D02 caisse sees explicit uncertain output for reconciliation');
  const claimRow = db.prepare('SELECT bridge_id FROM print_jobs WHERE id=?').get(firstJobId);
  const claimToken = claimRow.bridge_id === 'bridge-a' ? tokenA : tokenB;
  const latePrinted = await routeCall(jobs, 'POST', '/api/print/jobs', {
    bearer: claimToken, body: { action: 'ack', id: firstJobId, ok: true, outcome: 'printed', bytes: 4 },
  }, env);
  const reconciled = db.prepare('SELECT status,error,bytes FROM print_jobs WHERE id=?').get(firstJobId);
  check(latePrinted.status === 200 && latePrinted.json.updated && reconciled.status === 'done' && reconciled.bytes === 4 && reconciled.error === null,
    'D02 late printed ACK from the claiming bridge reconciles a quarantined job without reprinting');

  const transient = await routeCall(jobs, 'POST', '/api/print/jobs?merchant=audit-shop', {
    cookie, body: { target: { ip: '192.168.1.51', port: 9100 }, dataB64: 'S0lX', kind: 'receipt' },
  }, env);
  const transientClaim = await routeCall(jobs, 'GET', '/api/print/jobs', { bearer: tokenA }, env);
  check(transientClaim.json.jobs.length === 1 && transientClaim.json.jobs[0].id === transient.json.id, 'D02 a known transient failure gets a real second claim candidate');
  const failedAck = await routeCall(jobs, 'POST', '/api/print/jobs', {
    bearer: tokenA, body: { action: 'ack', id: transient.json.id, ok: false, outcome: 'failed', error: 'printer-timeout' },
  }, env);
  const deferred = db.prepare('SELECT status,claimed_ts FROM print_jobs WHERE id=?').get(transient.json.id);
  check(failedAck.status === 200 && deferred.status === 'queued' && deferred.claimed_ts > Date.now(), 'D02 definitive transient failure is queued with a backoff, not quarantined');
  db.prepare('UPDATE print_jobs SET claimed_ts=? WHERE id=?').run(Date.now() - 1, transient.json.id);
  const transientRetry = await routeCall(jobs, 'GET', '/api/print/jobs', { bearer: tokenA }, env);
  const retried = db.prepare('SELECT status,bridge_id,claimed_ts,expires_ts FROM print_jobs WHERE id=?').get(transient.json.id);
  check(transientRetry.json.jobs.length === 1 && transientRetry.json.jobs[0].id === transient.json.id && retried.status === 'claimed',
    'D02 queued transient failure is reclaimed only after its retry time');
  await routeCall(jobs, 'POST', '/api/print/jobs', { bearer: tokenA, body: { action: 'ack', id: transient.json.id, ok: true, outcome: 'printed', bytes: 4 } }, env);
  check(db.prepare('SELECT status FROM print_jobs WHERE id=?').get(transient.json.id).status === 'done', 'D02 retried transient failure closes on a printed ACK');

  const explicit = await routeCall(jobs, 'POST', '/api/print/jobs?merchant=audit-shop', {
    cookie, body: { target: { ip: '192.168.1.52', port: 9100 }, dataB64: 'S0lX', kind: 'receipt' },
  }, env);
  const explicitClaim = await routeCall(jobs, 'GET', '/api/print/jobs', { bearer: tokenA }, env);
  check(explicitClaim.json.jobs.length === 1 && explicitClaim.json.jobs[0].id === explicit.json.id, 'D02 another claim is available for explicit recovery coverage');
  db.prepare('UPDATE print_jobs SET claimed_ts=? WHERE id=?').run(Date.now() - 60000, explicit.json.id);
  await routeCall(jobs, 'GET', '/api/print/jobs', { bearer: tokenB }, env);
  const oldBridge = db.prepare('SELECT bridge_id FROM print_jobs WHERE id=?').get(explicit.json.id).bridge_id;
  const requeue = await routeCall(jobs, 'POST', '/api/print/jobs?merchant=audit-shop', { cookie, body: { action: 'requeue-uncertain', id: explicit.json.id } }, env);
  const oldToken = oldBridge === 'bridge-a' ? tokenA : tokenB;
  const staleAck = await routeCall(jobs, 'POST', '/api/print/jobs', {
    bearer: oldToken, body: { action: 'ack', id: explicit.json.id, ok: true, outcome: 'printed', bytes: 4 },
  }, env);
  const afterExplicit = db.prepare('SELECT status,bridge_id FROM print_jobs WHERE id=?').get(explicit.json.id);
  check(requeue.json.requeued && staleAck.json.updated === false && afterExplicit.status === 'queued' && afterExplicit.bridge_id === null,
    'D02 explicit requeue severs the old claim so a late ACK cannot close a new attempt');
}

function memoryStorage(seed = {}) {
  const values = new Map(Object.entries(seed));
  return { getItem: (k) => values.has(k) ? values.get(k) : null, setItem: (k, v) => values.set(k, String(v)), removeItem: (k) => values.delete(k), has: (k) => values.has(k) };
}

async function nativeRevocationTest() {
  const nativeSource = read('app/src/native-runtime.js');
  const localStorage = memoryStorage({
    kiwiPaired: '1', kiwiPairedVenue: JSON.stringify({ merchant: 'old-shop' }), kiwiLiveMerchant: 'old-shop', kiwiLive: '1',
    'kiwi:native:identity-revoked:v1': '1', 'kiwiSales:unsynced': JSON.stringify([{ id: 'sale-1' }]),
  });
  const secure = new Map([['pairing-v1', JSON.stringify({ kiwiPaired: '1', kiwiPairedVenue: JSON.stringify({ merchant: 'old-shop' }) })]]);
  const sessionStorage = memoryStorage();
  let secureRemoves = 0;
  const listeners = {};
  const documentListeners = {};
  const el = () => ({ classList: { add() {}, contains() { return false; }, toggle() {} }, style: { setProperty() {}, removeProperty() {} }, className: '', hidden: false, addEventListener() {}, appendChild() {}, setAttribute() {}, querySelector() { return null; } });
  const root = el(), body = el(); root.getAttribute = () => null;
  const socket = {
    secureGet: async ({ key }) => ({ value: secure.get(key) || null }),
    secureSet: async ({ key, value }) => secure.set(key, value),
    secureRemove: async ({ key }) => { secureRemoves++; secure.delete(key); },
    deviceIdentity: async () => ({ id: 'kid_test' }),
  };
  const document = {
    documentElement: root, body, readyState: 'complete', hidden: false,
    querySelector: () => null, querySelectorAll: () => [], createElement: el, getElementById: () => null,
    addEventListener(name, fn) { (documentListeners[name] ||= []).push(fn); },
    dispatchEvent(event) { (documentListeners[event.type] || []).forEach((fn) => fn(event)); },
  };
  const window = {
    Capacitor: { isNativePlatform: () => true, getPlatform: () => 'ios', Plugins: { KiwiPrinterSocket: socket, App: { getInfo: async () => ({}), addListener() {} }, Network: { getStatus: async () => ({ connected: true }), addListener() {} } } },
    document, localStorage, sessionStorage, location: { pathname: '/dashboard.html', reload() {} }, matchMedia: () => ({ matches: false }),
    addEventListener(name, fn) { (listeners[name] ||= []).push(fn); },
  };
  window.window = window;
  const context = vm.createContext({ window, document, localStorage, sessionStorage, location: window.location, Promise, Date, JSON, Math, String, Number, Error, MutationObserver: class { observe() {} }, setTimeout, clearTimeout, CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init && init.detail; } }, getComputedStyle: () => ({ display: 'block', visibility: 'visible' }) });
  new vm.Script(nativeSource, { filename: 'app/src/native-runtime.js' }).runInContext(context);
  await sleep(0);
  check(secureRemoves >= 1 && secure.get('pairing-v1') === undefined, 'D03 native revocation removes secure pairing-v1');
  check(localStorage.getItem('kiwiPaired') === null && localStorage.getItem('kiwiPairedVenue') === null && localStorage.getItem('kiwiSales:unsynced'), 'D03 native revocation clears venue identity but preserves unsynced evidence');
  localStorage.setItem('kiwiPaired', '1');
  localStorage.setItem('kiwiPairedVenue', JSON.stringify({ merchant: 'new-shop' }));
  localStorage.setItem('kiwiLiveMerchant', 'new-shop');
  localStorage.setItem('kiwiLive', '1');
  document.dispatchEvent(new CustomEvent('kiwi-paired', { detail: { merchant: 'new-shop' } }));
  await sleep(0);
  check(localStorage.getItem('kiwi:native:identity-revoked:v1') === null && JSON.parse(secure.get('pairing-v1')).kiwiPairedVenue.includes('new-shop'), 'D03 successful ordinary pairing persists the new identity before clearing the native revocation fence');
}

async function authGuardRevocationTest() {
  const localStorage = memoryStorage({ kiwiPaired: '1', kiwiPairedVenue: '{}', kiwiLiveMerchant: 'old-shop', kiwiLive: '1', kiwiPairings: '{}', 'kiwiSales:unsynced': 'evidence' });
  let replaced = '';
  const window = {
    localStorage, location: { origin: 'https://kiwi-os.com', href: 'https://kiwi-os.com/dashboard.html', replace: (url) => { replaced = url; } },
    fetch: async () => response(401, { error: 'account-revoked' }),
    caches: { keys: async () => [], delete: async () => true },
    navigator: { serviceWorker: { getRegistrations: async () => [] } },
    addEventListener() {},
  };
  window.window = window;
  const context = vm.createContext({ window, localStorage, location: window.location, navigator: window.navigator, caches: window.caches, URL, Promise, CustomEvent: class { constructor(type) { this.type = type; } }, setTimeout, clearTimeout });
  new vm.Script(read('assets/auth-guard.js'), { filename: 'assets/auth-guard.js' }).runInContext(context);
  await window.fetch('/api/me');
  await sleep(5);
  check(replaced === '/auth/logout' && localStorage.getItem('kiwiPaired') === null && localStorage.getItem('kiwiPairedVenue') === null, 'D03 account-revoked guard clears local native venue identity before redirect');
  check(localStorage.getItem('kiwiSales:unsynced') === 'evidence' && localStorage.getItem('kiwi:native:identity-revoked:v1') === '1', 'D03 auth cleanup preserves unsynced business evidence and leaves a native revocation fence');
}

await bridgeBoundaryTest();
await bridgeRolloutTest();
await relayRaceTest();
await nativeRevocationTest();
await authGuardRevocationTest();
console.log(`\naudit-remediation-devices-test: ${passed} checks green\n`);
