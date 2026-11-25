#!/usr/bin/env node
/* Browse, 25 nov. 2026 : l'imprimante cuisine (192.168.11.87) ne répondait qu'au
 * premier bon après une longue pause, et le bon de 12:21 a expiré sans sortir.
 * La caisse teste désormais ses imprimantes à l'ouverture et toutes les 30 min.
 *  1. Serveur : un « probe » n'écrit que ESC @ (rien d'autre, quoi que dise la
 *     caisse), vit une minute, échoue au premier refus, n'entre jamais dans la
 *     liste des tickets à réimprimer, et deux caisses partagent la même ligne.
 *  2. Caisse : une imprimante qui ne répond pas deux fois de suite est nommée
 *     dans une alerte ; une imprimante qui se réveille au second essai, ou un pont
 *     absent, ne déclenchent rien ; l'alerte part dès qu'elle répond. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { randomInt } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
const settle = async (n = 8) => { for (let i = 0; i < n; i++) await new Promise((r) => setImmediate(r)); };

/* ── 1. le serveur ─────────────────────────────────────────────────────────── */
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
const AUTH_SECRET = 'test-secret-printer-health';
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
db.prepare('INSERT OR IGNORE INTO merchant_config (merchant, till_epoch, status) VALUES (?, 0, ?)').run('browse', 'active');
const env = { DB: fakeD1(db), AUTH_SECRET };
const till = 'kiwi_till=' + (await lib.tillToken(AUTH_SECRET, 'browse'));
const pc = await call(bridgesRoute, 'POST', '/api/print/bridges?merchant=browse', { body: { action: 'pair-code' }, cookie: till }, env);
const red = await call(bridgesRoute, 'POST', '/api/print/bridges', { body: { action: 'redeem', code: pc.j.code, name: 'samsung SM-X236B', platform: 'android', version: '1.0.5' }, ip: '10.0.0.' + randomInt(2, 250) }, env);
const token = red.j.token;
assert.ok(token, 'the Browse bridge is paired');

const KITCHEN = { ip: '192.168.11.87', port: 9100 };
const DEAD = 'failed to connect to /192.168.11.87 (port 9100) from /192.168.11.124 (port 38268) after 8000ms';
const deposit = (body) => call(jobsRoute, 'POST', '/api/print/jobs?merchant=browse', { body, cookie: till }, env);
const poll = () => call(jobsRoute, 'GET', '/api/print/jobs', { bearer: token }, env);
const ack = (id, okFlag, error) => call(jobsRoute, 'POST', '/api/print/jobs', { bearer: token, body: { action: 'ack', id, ok: okFlag, bytes: okFlag ? 2 : 0, error } }, env);
const status = (id) => call(jobsRoute, 'GET', '/api/print/jobs?merchant=browse&id=' + id, { cookie: till }, env);

const smuggled = Buffer.from('VOLE 500 MAD\n').toString('base64');
const p1 = await deposit({ target: KITCHEN, kind: 'probe', dataB64: smuggled, clientRef: 'probe:192.168.11.87:9100:scheduled:1' });
assert.equal(p1.status, 200);
const row = db.prepare('SELECT data_b64, expires_ts - created_ts AS ttl FROM print_jobs WHERE id = ?').get(p1.j.id);
assert.equal(row.data_b64, 'G0A=', 'a probe only ever carries ESC @, never what the caller sent');
assert.equal(row.ttl, 60000, 'a probe lives one minute');
const p1again = await deposit({ target: KITCHEN, kind: 'probe', clientRef: 'probe:192.168.11.87:9100:scheduled:1' });
assert.equal(p1again.j.id, p1.j.id, 'two tills in the same slot share one probe');
assert.equal(db.prepare("SELECT COUNT(*) AS n FROM print_jobs WHERE kind = 'probe'").get().n, 1);

const claimed = await poll();
const job = claimed.j.jobs.find((j) => j.id === p1.j.id);
assert.ok(job, 'the bridge picks the probe up like any job, so it really opens the connection');
assert.equal(job.dataB64, 'G0A=');
await ack(p1.j.id, false, DEAD);
let st = await status(p1.j.id);
assert.equal(st.j.job.status, 'failed', 'a refused probe fails at once instead of being retried for ten minutes');
assert.equal(st.j.job.error, DEAD);
const list = await call(jobsRoute, 'GET', '/api/print/jobs?merchant=browse', { cookie: till }, env);
assert.equal(list.j.jobs.length, 0, 'a probe is never offered as an unprinted ticket');
const again = await deposit({ action: 'reprint-expired', id: p1.j.id });
assert.equal(again.status, 404, 'a probe cannot be reprinted');

const p2 = await deposit({ target: KITCHEN, kind: 'probe', clientRef: 'probe:192.168.11.87:9100:confirm:2' });
await poll();
await ack(p2.j.id, true);
st = await status(p2.j.id);
assert.equal(st.j.job.status, 'done', 'a printer that answered marks the probe done');

/* A real ticket is still retried as before. */
const real = await deposit({ target: KITCHEN, kind: 'other', dataB64: Buffer.from([0x1b, 0x40, 0x48, 0x69]).toString('base64') });
await poll();
await ack(real.j.id, false, DEAD);
st = await status(real.j.id);
assert.equal(st.j.job.status, 'queued', 'a kitchen ticket that failed stays queued for its retries');
console.log('✓ relay: probes write ESC @ only, fail fast, stay out of the reprint list, are shared between tills');

/* ── 2. la caisse ─────────────────────────────────────────────────────────── */
function fakeEl(onRemove) {
  return { style: {}, attrs: {}, kids: [], hidden: false, disabled: false, textContent: '',
    setAttribute(k, v) { this.attrs[k] = v; },
    appendChild(child) { this.kids.push(child); return child; },
    addEventListener(name, fn) { this[name] = fn; },
    querySelector(sel) {
      const want = sel.slice(1, -1);
      for (const k of this.kids) { if (want in k.attrs) return k; const deep = k.querySelector(sel); if (deep) return deep; }
      return null;
    },
    remove() { if (onRemove) onRemove(this); } };
}
function till2({ verdicts, depositAnswer, merchant = 'amira-cafe' }) {
  let clock = 1_800_000_000_000, seq = 0;
  const timers = [], posts = [], nodes = new Map(), jobs = new Map(), intervals = [];
  const stack = { appendChild(el) { nodes.set(el.id, el); } };
  const document = { hidden: false, body: stack, addEventListener() {}, getElementById: (id) => (id === 'toast-stack' ? stack : nodes.get(id)), createElement: () => fakeEl((el) => nodes.delete(el.id)) };
  const fetch = async (url, init) => {
    if (init && init.method === 'POST') {
      const body = JSON.parse(init.body);
      posts.push(body);
      if (depositAnswer) return { json: async () => depositAnswer };
      const id = 'pj_' + (++seq);
      const next = (verdicts[body.target.ip] || ['done']).shift() || 'done';
      jobs.set(id, next);
      return { json: async () => ({ ok: true, id }) };
    }
    const id = new URL('https://x' + url).searchParams.get('id');
    const s = jobs.get(id);
    const failed = s === 'failed' || s === 'not-saved';
    return { json: async () => ({ ok: true, job: { id, status: failed ? 'failed' : s, error: s === 'failed' ? DEAD : s === 'not-saved' ? 'printer-target-not-saved' : null } }) };
  };
  const window = {
    KiwiCaisseLang: { tr: (s) => s },
    KiwiKitchenRelay: { merchant: () => merchant },
    KiwiPrinter: {
      getStationConfig: () => ({ profiles: [{ id: 'a', name: 'Suivi', ip: '192.168.11.87', port: 9100 }, { id: 'b', name: 'Bar', ip: '192.168.11.100' }] }),
      getConfig: () => ({ ip: '192.168.11.199', port: 9100 }),
    },
  };
  const context = vm.createContext({
    window, document, fetch, Promise, JSON, String, Number, Math, Infinity, encodeURIComponent, Object,
    Date: { now: () => clock },
    setTimeout: (fn, ms) => { timers.push({ due: clock + ms, fn }); return timers.length; },
    setInterval: (fn, ms) => { intervals.push(ms); return 0; },
  });
  vm.runInContext(read('assets/printer-health.js'), context);
  async function advance(ms) {
    clock += ms;
    for (;;) {
      timers.sort((a, b) => a.due - b.due);
      if (!timers.length || timers[0].due > clock) break;
      timers.shift().fn();
      await settle();
    }
    await settle();
  }
  return { window, posts, nodes, advance, intervals };
}

{
  /* The kitchen printer is off at opening: it fails, fails again 30 s later, and is named. */
  const t = till2({ verdicts: { '192.168.11.87': ['failed', 'failed', 'done'] } });
  await settle();
  assert.equal(t.posts.length, 3, 'every network printer is tested at opening');
  assert.ok(t.posts.every((p) => p.kind === 'probe' && /^[A-Za-z0-9_:.-]{8,80}$/.test(p.clientRef)), 'probes, with a key the relay accepts');
  assert.equal(t.nodes.has('caisse-printer-health'), false, 'one failure is not enough: a sleeping printer can miss the first connection');
  await t.advance(30000);
  const alert = t.nodes.get('caisse-printer-health');
  assert.ok(alert, 'two failures in a row raise the alert');
  assert.equal(alert.className, 'toast is-warn');
  assert.equal(alert.attrs.role, 'alert');
  assert.equal(alert.style.pointerEvents, 'auto', 'its buttons can be tapped inside the toast stack');
  const msg = alert.querySelector('[data-msg]').textContent;
  assert.match(msg, /^Imprimante Suivi \(192\.168\.11\.87\) ne répond pas\. Allumez-la/, msg);
  assert.doesNotMatch(msg, /199|100/, 'the printers that answered are not named');
  /* Somebody switches it on and taps « Tester à nouveau ». */
  alert.querySelector('[data-test]').click();
  await settle();
  assert.equal(t.nodes.has('caisse-printer-health'), false, 'the alert goes as soon as the printer answers');
}
{
  /* A printer that wakes up on the second try never raises anything. */
  const t = till2({ verdicts: { '192.168.11.87': ['failed', 'done'] } });
  await settle();
  await t.advance(30000);
  assert.equal(t.nodes.has('caisse-printer-health'), false);
  assert.equal(t.posts.length, 4, 'one confirmation probe, no more');
}
{
  /* No bridge online: no verdict about the printer, nothing on screen, no retry storm. */
  const t = till2({ verdicts: {}, depositAnswer: { ok: false, error: 'relay-offline' } });
  await settle();
  await t.advance(30000);
  assert.equal(t.nodes.has('caisse-printer-health'), false);
  assert.equal(t.posts.length, 3);
}
{
  /* A printer still down is checked again every two minutes and clears on its own. */
  const t = till2({ verdicts: { '192.168.11.87': ['failed', 'failed', 'failed', 'done'] } });
  await settle();
  await t.advance(30000);
  assert.ok(t.nodes.has('caisse-printer-health'));
  t.window.KiwiPrinterHealth.tick();
  await settle();
  assert.equal(t.posts.length, 4, 'not before two minutes');
  await t.advance(2 * 60000);
  t.window.KiwiPrinterHealth.tick();
  await settle();
  assert.ok(t.nodes.has('caisse-printer-health'), 'still down, still shown');
  await t.advance(2 * 60000);
  t.window.KiwiPrinterHealth.tick();
  await settle();
  assert.equal(t.nodes.has('caisse-printer-health'), false, 'back on: the alert leaves without anyone touching it');
}
{
  /* A desktop bridge that does not know this printer refuses it: that is not the printer being off. */
  const t = till2({ verdicts: { '192.168.11.87': ['not-saved', 'not-saved'] } });
  await settle();
  await t.advance(30000);
  assert.equal(t.nodes.has('caisse-printer-health'), false, 'a bridge refusing an unknown target says nothing about the printer');
}
{
  /* Browse, 25 nov. 2026 : its printers fall asleep between tickets. The owner
   * asked not to save requests for this shop: every printer is probed (so woken)
   * every minute. One that stays silent keeps the 2-minute recheck: each try
   * holds the bridge ~16 s, and the server retries it on its own back-off. */
  const t = till2({ verdicts: { '192.168.11.87': ['failed', 'failed', 'done'] }, merchant: 'browse' });
  assert.ok(t.intervals.length && t.intervals.every((ms) => ms <= 60000), 'the till looks at its printers at least once a minute');
  await settle();
  assert.equal(t.posts.length, 3);
  await t.advance(30000);
  assert.ok(t.nodes.has('caisse-printer-health'));
  const before = t.posts.length;
  await t.advance(60000);
  t.window.KiwiPrinterHealth.tick();
  await settle();
  const fresh = t.posts.slice(before);
  assert.equal(fresh.length, 2, 'a minute later the two answering printers are probed again');
  assert.ok(fresh.every((p) => p.kind === 'probe' && p.target.ip !== '192.168.11.87' && /^[A-Za-z0-9_:.-]{8,80}$/.test(p.clientRef)));
  assert.ok(t.nodes.has('caisse-printer-health'), 'the silent one is not hammered every minute');
  await t.advance(60000);
  t.window.KiwiPrinterHealth.tick();
  await settle();
  assert.ok(t.posts.slice(before + 2).some((p) => p.target.ip === '192.168.11.87'), 'it is rechecked at two minutes');
  assert.equal(t.nodes.has('caisse-printer-health'), false, 'the kitchen printer answered this time: the alert leaves');
}
{
  /* Another shop keeps the quiet rhythm: nothing new within the half hour. */
  const t = till2({ verdicts: {}, merchant: 'amira-cafe' });
  await settle();
  await t.advance(60000);
  t.window.KiwiPrinterHealth.tick();
  await settle();
  assert.equal(t.posts.length, 3, 'thirty minutes between checks for everyone else');
}
const kq = read('assets/kitchen-print-queue.js');
assert.match(kq, /\/assets\/printer-health\.js\?v=\d+/, 'the till loads the check without a new script slot');
assert.match(read('kiwi-sw.js'), /\/assets\/printer-health\.js\?v=\d+/, 'and it is precached for offline starts');
console.log('✓ till: an unreachable printer is named after two failures, a waking printer or a missing bridge says nothing, the alert clears itself; Browse is probed every minute');
