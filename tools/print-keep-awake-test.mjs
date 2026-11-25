#!/usr/bin/env node
/* Browse, 25 nov. 2026 : ses imprimantes s'endorment entre deux bons (EHOSTUNREACH,
 * bons cuisine attendus 2 à 3 min). Le patron ne veut pas économiser les requêtes
 * pour ce commerce. Le SERVEUR garde donc ses imprimantes éveillées, même quand
 * l'écran de la caisse dort : à chaque tour vide du pont, au plus un « probe »
 * (ESC @, rien ne sort) vers l'imprimante la plus anciennement touchée, si elle
 * ne l'a pas été depuis une minute. Une imprimante qui ne répond pas bloque le
 * pont 16 s par essai : on la laisse 2, puis 5, puis 10 min avant de réessayer.
 * Les autres commerces ne reçoivent rien. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { randomInt } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

let clock = 1_800_000_000_000;
const realNow = Date.now;
Date.now = () => clock;

const { DatabaseSync } = await import('node:sqlite');
function fakeD1(db) {
  const stmt = (sql, args) => ({
    bind: (...a) => stmt(sql, a),
    first: async () => { const r = db.prepare(sql).get(...(args || [])); return r === undefined ? null : r; },
    all: async () => ({ results: db.prepare(sql).all(...(args || [])) }),
    run: async () => { const r = db.prepare(sql).run(...(args || [])); return { meta: { changes: Number(r.changes) } }; },
  });
  return { prepare: (sql) => stmt(sql, []), batch: async (s) => { const out = []; for (const x of s) out.push(await x.run()); return out; } };
}
const AUTH_SECRET = 'test-secret-keep-awake';
const lib = await import(pathToFileURL(path.join(root, 'functions/auth/_lib.js')).href);
const bridgesRoute = await import(pathToFileURL(path.join(root, 'functions/api/print/bridges.js')).href);
const jobsRoute = await import(pathToFileURL(path.join(root, 'functions/api/print/jobs.js')).href);
function req(method, url, { body, cookie, bearer, ip } = {}) {
  const h = new Headers();
  if (body !== undefined) h.set('Content-Type', 'application/json');
  if (cookie) h.set('Cookie', cookie);
  if (bearer) h.set('Authorization', 'Bearer ' + bearer);
  if (ip) h.set('CF-Connecting-IP', ip);
  return new Request('https://kiwi-os.com' + url, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) });
}
async function call(route, method, url, opts, env) {
  const fn = route['onRequest' + method[0] + method.slice(1).toLowerCase()];
  const res = await fn({ request: req(method, url, opts), env });
  let j = null; try { j = await res.json(); } catch (_) {}
  return { status: res.status, j };
}
const db = new DatabaseSync(':memory:');
db.exec(read('migrations/legacy/2026-08-21-print-relay.sql'));
db.exec(`CREATE TABLE IF NOT EXISTS pair_attempts (ip TEXT PRIMARY KEY, fails INTEGER NOT NULL, first_ts INTEGER NOT NULL, blocked_until INTEGER);`);
db.exec(`CREATE TABLE IF NOT EXISTS merchant_config (merchant TEXT PRIMARY KEY, till_epoch INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT 'active');`);
for (const m of ['browse', 'amira-cafe']) db.prepare('INSERT OR IGNORE INTO merchant_config (merchant, till_epoch, status) VALUES (?, 0, ?)').run(m, 'active');
const env = { DB: fakeD1(db), AUTH_SECRET, PRINT_PROBES: 'on' };   // coupés en production (functions/api/print/jobs.js › probesOn)

async function shop(merchant) {
  const till = 'kiwi_till=' + (await lib.tillToken(AUTH_SECRET, merchant));
  const pc = await call(bridgesRoute, 'POST', '/api/print/bridges?merchant=' + merchant, { body: { action: 'pair-code' }, cookie: till }, env);
  const red = await call(bridgesRoute, 'POST', '/api/print/bridges', { body: { action: 'redeem', code: pc.j.code, name: 'samsung SM-X236B', platform: 'android', version: '1.0.4' }, ip: '10.0.0.' + randomInt(2, 250) }, env);
  assert.ok(red.j && red.j.token, merchant + ' bridge paired');
  const token = red.j.token;
  return {
    print: (target) => call(jobsRoute, 'POST', '/api/print/jobs?merchant=' + merchant, { body: { target, kind: 'other', dataB64: Buffer.from('Hi').toString('base64') }, cookie: till }, env),
    poll: () => call(jobsRoute, 'GET', '/api/print/jobs', { bearer: token }, env),
    ack: (id, okFlag, error) => call(jobsRoute, 'POST', '/api/print/jobs', { bearer: token, body: { action: 'ack', id, ok: okFlag, bytes: okFlag ? 2 : 0, error } }, env),
    list: () => call(jobsRoute, 'GET', '/api/print/jobs?merchant=' + merchant, { cookie: till }, env),
  };
}
const KITCHEN = { ip: '192.168.11.87', port: 9100 }, RECEIPT = { ip: '192.168.11.199', port: 9100 };
const OFF = 'failed to connect to /192.168.11.199 (port 9100) from /192.168.11.208 (port 41944) after 8000ms: isConnected failed: EHOSTUNREACH (No route to host)';
const probesOf = (r) => ((r.j && r.j.jobs) || []).filter((j) => j.kind === 'probe');
const tick = (ms) => { clock += ms; };

const browse = await shop('browse');
const amira = await shop('amira-cafe');

/* A normal evening: one kitchen ticket and one receipt, both printed. */
for (const target of [KITCHEN, RECEIPT]) {
  const dep = await browse.print(target);
  assert.equal(dep.status, 200);
  tick(1000);
  const got = await browse.poll();
  const job = got.j.jobs.find((j) => j.id === dep.j.id);
  assert.ok(job, 'the ticket is handed out');
  assert.equal(probesOf(got).length, 0, 'a poll that carries a ticket never adds a probe');
  await browse.ack(job.id, true);
}
tick(10000);
assert.equal(probesOf(await browse.poll()).length, 0, 'nothing to wake: both printers were touched seconds ago');

/* A minute later the printers have gone quiet: one probe per poll, oldest first. */
tick(60000);
const first = await browse.poll();
const p1 = probesOf(first);
assert.equal(p1.length, 1, 'one probe per idle poll, never a burst that would hold the bridge');
assert.deepEqual(p1[0].target, KITCHEN, 'the printer touched longest ago goes first');
assert.equal(p1[0].dataB64, 'G0A=', 'a probe only writes ESC @, which prints nothing');
assert.equal(first.j.poll, 1000, 'Browse never drops to the slow idle pace');
await browse.ack(p1[0].id, true);
tick(6000);
const second = probesOf(await browse.poll());
assert.equal(second.length, 1);
assert.deepEqual(second[0].target, RECEIPT, 'then the next one');

/* The receipt printer has dropped off the network. */
await browse.ack(second[0].id, false, OFF);
const offeredAgain = (await browse.list()).j.jobs;
assert.equal(offeredAgain.length, 0, 'a failed probe is never offered as an unprinted ticket');
const receiptProbesAfter = async (ms) => {
  tick(ms);
  const got = probesOf(await browse.poll());
  for (const p of got) if (p.target.ip !== RECEIPT.ip) await browse.ack(p.id, true);
  return got.filter((p) => p.target.ip === RECEIPT.ip);
};
/* each failed try holds the bridge ~16 s: back off 2, then 5, then 10 minutes */
let r = [];
for (let i = 0; i < 10 && !r.length; i++) r = await receiptProbesAfter(10000);
assert.equal(r.length, 0, 'not retried within the first 100 s');
for (let i = 0; i < 4 && !r.length; i++) r = await receiptProbesAfter(10000);
assert.equal(r.length, 1, 'retried after about two minutes');
await browse.ack(r[0].id, false, OFF);
r = [];
for (let i = 0; i < 28 && !r.length; i++) r = await receiptProbesAfter(10000);
assert.equal(r.length, 0, 'second failure: left alone for close to five minutes');
for (let i = 0; i < 4 && !r.length; i++) r = await receiptProbesAfter(10000);
assert.equal(r.length, 1, 'then tried again');
await browse.ack(r[0].id, false, OFF);
r = [];
for (let i = 0; i < 58 && !r.length; i++) r = await receiptProbesAfter(10000);
assert.equal(r.length, 0, 'third failure: close to ten minutes');
for (let i = 0; i < 4 && !r.length; i++) r = await receiptProbesAfter(10000);
assert.equal(r.length, 1, 'and it is never forgotten: someone may switch it back on');
await browse.ack(r[0].id, true);
r = [];
for (let i = 0; i < 4 && !r.length; i++) r = await receiptProbesAfter(10000);
assert.equal(r.length, 0, 'back on: the next probe waits its normal minute');
for (let i = 0; i < 4 && !r.length; i++) r = await receiptProbesAfter(10000);
assert.equal(r.length, 1, 'and the minute rhythm resumes');
await browse.ack(r[0].id, true);

/* A real ticket for a printer counts as touching it. */
tick(30000);
const dep = await browse.print(KITCHEN);
assert.equal(dep.status, 200, 'the bridge is online, the ticket is accepted');
tick(1000);
const withTicket = await browse.poll();
assert.ok(withTicket.j.jobs.some((j) => j.id === dep.j.id));
await browse.ack(dep.j.id, true);
tick(10000);
assert.ok(!probesOf(await browse.poll()).some((p) => p.target.ip === KITCHEN.ip), 'a printed ticket resets the minute for that printer');

/* Every other shop keeps its quiet relay. */
await amira.poll();
const a = await amira.print(KITCHEN);
assert.equal(a.status, 200);
tick(1000);
const ag = await amira.poll();
await amira.ack(ag.j.jobs[0].id, true);
tick(5 * 60000);
const quiet = await amira.poll();
assert.equal(probesOf(quiet).length, 0, 'no probe for a shop that did not ask for it');
assert.equal(quiet.j.poll, 5000, 'and its idle pace stays at 5 s');
assert.ok(a.j.id);

/* The operator workspace lists tickets, not hundreds of probes. */
assert.match(read('functions/api/admin/_workspace.js'), /FROM print_jobs WHERE created_ts>=\?[^`]*NOT IN \('probe','wake'\)/, 'probes stay out of the operator print list');

Date.now = realNow;
console.log('✓ keep-awake: Browse gets one probe per idle poll for a printer quiet for a minute, oldest first, 2/5/10 min back-off for a printer that is off, nothing for other shops');
