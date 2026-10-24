#!/usr/bin/env node
// Native bridge gate. All listeners belong to this test and bind to loopback.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import http from 'node:http';
import { randomBytes } from 'node:crypto';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cargo = spawnSync('cargo', ['--version'], { stdio: 'ignore' });
if (cargo.error?.code === 'ENOENT') { console.log('○ skip · cargo absent'); process.exit(0); }
function run(cmd, args, env = process.env) {
  const r = spawnSync(cmd, args, { cwd: root, env, stdio: 'inherit' });
  assert.equal(r.status, 0, cmd + ' ' + args.join(' '));
}
run('cargo', ['build', '--release', '--manifest-path', 'bridge/rust/Cargo.toml']);
const binary = path.join(root, 'bridge/rust/target/release/kiwi-printer-bridge' + (process.platform === 'win32' ? '.exe' : ''));
for (const suite of ['print-relay-test.mjs', 'audit-remediation-devices-test.mjs']) {
  run(process.execPath, ['tools/' + suite], { ...process.env, KIWI_BRIDGE_BIN: binary });
}
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kiwi-rust-parity-'));
const port = 9400 + process.pid % 100;
let child = spawn(binary, [], {
  env: { ...process.env, KIWI_BRIDGE_PORT: String(port), KIWI_BRIDGE_CONFIG: path.join(dir, 'config.json'), KIWI_RELAY_URL: 'http://127.0.0.1:1' },
  stdio: 'ignore',
});
const stop = async () => {
  await new Promise(resolve => { if (child.exitCode !== null || child.signalCode) return resolve(); child.once('exit', resolve); child.kill(); });
};
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
let fake;
try {
  let page;
  for (let i = 0; i < 60; i++) {
    try { page = await (await fetch(`http://127.0.0.1:${port}/`)).text(); break; }
    catch { await new Promise(r => setTimeout(r, 50)); }
  }
  const source = fs.readFileSync(path.join(root, 'bridge/server.js'), 'utf8');
  const literal = source.match(/const LOCAL_PAGE = (`[^]*?`);/)[1];
  assert.equal(page, vm.runInNewContext(literal), 'LOCAL_PAGE bytes equal the Node template');
  const request = (url, options = {}) => fetch(`http://127.0.0.1:${port}` + url, options);
  let r = await request('/kiwi/ping');
  assert.equal((await r.json()).capability, '', 'untrusted CLI cannot obtain capability');
  r = await request('/kiwi/ping', { headers: { Origin: 'https://kiwi-os.com' } });
  const ping = await r.json();
  assert.equal(r.headers.get('Access-Control-Allow-Private-Network'), 'true');
  assert.equal(ping.version, '1.5.0');
  const headers = { Origin: 'https://kiwi-os.com', 'X-Kiwi-Bridge-Capability': ping.capability, 'Content-Type': 'application/json' };
  for (const endpoint of ['/kiwi/relay', '/kiwi/printers', '/kiwi/scan', '/kiwi/print', '/kiwi/wake', '/kiwi/targets']) {
    r = await request(endpoint, { headers: { ...headers, 'X-Kiwi-Bridge-Capability': 'wrong' } });
    assert.equal(r.status, 401, endpoint);
  }
  r = await request('/kiwi/print', { method: 'POST', headers, body: '{' });
  assert.deepEqual(await r.json(), { ok: false, error: 'bad-json' });
  r = await request('/kiwi/targets', { method: 'POST', headers, body: JSON.stringify({ target: { ip: '8.8.8.8' } }) });
  assert.equal(r.status, 422);
  r = await request('/kiwi/print', { method: 'OPTIONS', headers });
  assert.equal(r.status, 204);
  await stop();
  // Crash recovery: pending acknowledgements are retried; in-flight output is
  // reported uncertain, and never sent to a printer for a second time.
  const token = 'kpb_' + randomBytes(32).toString('hex');
  const acks = [];
  let refuse = false;
  let refusals = 0;
  fake = http.createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    assert.equal(req.headers.authorization === 'Bearer ' + token, true, 'relay authentication retained');
    if (refuse) { refusals++; res.writeHead(401); res.end('{"ok":false}'); return; }
    if (req.method === 'POST') acks.push(JSON.parse(Buffer.concat(chunks).toString()));
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(req.method === 'POST' ? { ok: true } : { ok: true, poll: 200, jobs: [] }));
  });
  await new Promise(resolve => fake.listen(0, '127.0.0.1', resolve));
  const cfgPath = path.join(dir, 'config.json');
  const cfg = JSON.parse(fs.readFileSync(cfgPath));
  cfg.relay = { token, merchant: 'fake-shop', name: 'fake-bridge', bridgeId: 'fake-id',
    pendingAcks: [{ action: 'ack', id: 'already-printed', ok: true, outcome: 'printed', bytes: 3 }],
    inFlight: [{ id: 'unknown-output', at: Date.now() }] };
  fs.writeFileSync(cfgPath, JSON.stringify(cfg), { mode: 0o600 });
  child = spawn(binary, [], { env: { ...process.env, KIWI_BRIDGE_PORT: String(port), KIWI_BRIDGE_CONFIG: cfgPath,
    KIWI_RELAY_URL: 'http://127.0.0.1:' + fake.address().port }, stdio: 'ignore' });
  for (let i = 0; i < 100 && acks.length < 2; i++) await sleep(30);
  assert.equal(acks.length, 2, 'both recovery acknowledgements delivered');
  assert.equal(acks.find(a => a.id === 'already-printed').outcome, 'printed');
  assert.equal(acks.find(a => a.id === 'unknown-output').outcome, 'uncertain');
  assert.equal(acks.find(a => a.id === 'unknown-output').error, 'output-unknown-after-bridge-restart');
  for (let i = 0; i < 50; i++) {
    if (!JSON.parse(fs.readFileSync(cfgPath)).relay.pendingAcks.length) break;
    await sleep(10);
  }
  const recovered = JSON.parse(fs.readFileSync(cfgPath));
  assert.equal(recovered.relay.pendingAcks.length, 0);
  assert.equal(recovered.relay.inFlight.length, 0);
  assert.equal(recovered.capability === cfg.capability, true, 'upgrade retains install capability');
  refuse = true;
  for (let i = 0; i < 180 && JSON.parse(fs.readFileSync(cfgPath)).relay; i++) await sleep(30);
  assert.equal(refusals, 3, 'exactly three refusals before forgetting token');
  assert.equal(JSON.parse(fs.readFileSync(cfgPath)).relay, undefined);
  console.log('bridge-rust-parity-test: page bytes, HTTP boundary, crash recovery and three-refusal revocation ✓');
} finally {
  await stop();
  if (fake) await new Promise(resolve => fake.close(resolve));
  fs.rmSync(dir, { recursive: true, force: true });
}
