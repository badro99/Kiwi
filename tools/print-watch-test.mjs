#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · VEILLE DU RELAIS D'IMPRESSION (functions/api/print/_watch.js)
 * ---------------------------------------------------------------------------
 * Pasta Corner, 26 nov. 2026 : le pont Android est resté bloqué douze minutes
 * sur une imprimante qui n'avalait plus rien. Le serveur le voyait, personne
 * n'était prévenu. Ce test rejoue les trois signaux sur la vraie route
 * /api/print/jobs, branchée sur schema.sql complet (node:sqlite) :
 *   · un ticket réclamé plus de 15 s après son dépôt  → tâche « Impression lente »
 *   · un ticket pris sans accusé dans le bail de 30 s → « Impression bloquée »
 *   · un dépôt sans pont en ligne                     → « Pont hors ligne »
 * Une seule tâche par commerce et par journée de service, un seul courriel à
 * l'ouverture et à la réouverture, rien pour un wake. Plus : la version lue
 * dans le User-Agent du pont, l'offre de mise à jour Android, les mesures de
 * l'accusé, et le ré-appairage qui retire l'ancien pont de la même tablette.
 * ═══════════════════════════════════════════════════════════════════════════ */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
let pass = 0, fail = 0;
function ok(v, msg) { if (v) { pass++; } else { fail++; console.error('  ✗ ' + msg); } }

function fakeD1(db) {
  const stmt = (sql, args) => ({
    bind: (...a) => stmt(sql, a),
    first: async () => { const r = db.prepare(sql).get(...(args || [])); return r === undefined ? null : r; },
    all: async () => ({ results: db.prepare(sql).all(...(args || [])) }),
    run: async () => { const r = db.prepare(sql).run(...(args || [])); return { meta: { changes: Number(r.changes) } }; },
  });
  return { prepare: (sql) => stmt(sql, []), batch: async (stmts) => { const out = []; for (const s of stmts) out.push(await s.run()); return out; } };
}

const AUTH_SECRET = 'test-secret-print-watch';
const lib = await import(pathToFileURL(path.join(root, 'functions/auth/_lib.js')).href);
const jobsRoute = await import(pathToFileURL(path.join(root, 'functions/api/print/jobs.js')).href);
const bridgesRoute = await import(pathToFileURL(path.join(root, 'functions/api/print/bridges.js')).href);
const watch = await import(pathToFileURL(path.join(root, 'functions/api/print/_watch.js')).href);
const relay = await import(pathToFileURL(path.join(root, 'functions/api/print/_relay.js')).href);

/* L'horloge du serveur est Date.now() : on la tient pour rejouer une journée. */
const realNow = Date.now;
let clock = Date.UTC(2026, 10, 26, 14, 39, 0);
Date.now = () => clock;

/* Le courriel part par MAIL_WEBHOOK : on compte ce qui sort. */
const mails = [];
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, init) => {
  if (String(url) === 'https://mail.test/hook') { mails.push(JSON.parse(init.body)); return new Response('{}', { status: 200 }); }
  return realFetch(url, init);
};

const db = new DatabaseSync(':memory:');
db.exec(read('schema.sql'));
db.prepare("INSERT INTO merchant_config (merchant, features, till_epoch, status, updated_ts) VALUES ('pasta-corner', '{}', 0, 'active', 0)").run();
const env = { DB: fakeD1(db), AUTH_SECRET, MAIL_WEBHOOK: 'https://mail.test/hook', SUPPORT_ALERT_EMAIL: 'ops@kiwi.test' };

const TOKEN = 'kpb_' + 'a'.repeat(64);
db.prepare(`INSERT INTO print_bridges (id, merchant, name, platform, version, token_hash, created_ts, last_seen_ts)
  VALUES ('pb_aa598efac1b89d01', 'pasta-corner', 'Blackview Tab 18', 'android', '1.0.5', ?, ?, ?)`).run(await relay.sha256Hex(TOKEN), clock, clock);

function request(method, url, { body, ua, bearer, cookie } = {}) {
  const h = new Headers();
  if (body !== undefined) h.set('Content-Type', 'application/json');
  if (ua) h.set('User-Agent', ua);
  if (bearer) h.set('Authorization', 'Bearer ' + bearer);
  if (cookie) h.set('Cookie', cookie);
  return new Request('https://kiwi-os.com' + url, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) });
}
async function call(route, method, url, opts = {}) {
  const pending = [];
  const fn = route['onRequest' + method[0] + method.slice(1).toLowerCase()];
  const res = await fn({ request: request(method, url, opts), env, waitUntil: (p) => pending.push(p) });
  await Promise.all(pending);
  let j = null; try { j = await res.json(); } catch (_) {}
  return { status: res.status, j, waited: pending.length };
}
const poll = (ua = 'kiwi-print-bridge-android/1.0.5') => call(jobsRoute, 'GET', '/api/print/jobs', { bearer: TOKEN, ua });
const tasks = () => db.prepare("SELECT * FROM operator_tasks WHERE merchant = 'pasta-corner' ORDER BY created_ts").all();
function job(id, ageMs, status = 'queued', extra = {}) {
  db.prepare(`INSERT INTO print_jobs (id, merchant, bridge_id, kind, target, data_b64, status, created_ts, expires_ts, claimed_ts)
    VALUES (?, 'pasta-corner', ?, ?, '{"ip":"192.168.100.198","port":9100}', 'G0A=', ?, ?, ?, ?)`)
    .run(id, extra.bridge || null, extra.kind || 'other', status, clock - ageMs, clock - ageMs + 600000, extra.claimedAgo == null ? null : clock - extra.claimedAgo);
}

/* 1 · un poll tranquille : aucune tâche, aucun courriel, et la version lue */
{
  const r = await poll('kiwi-print-bridge-android/1.0.5');
  ok(r.status === 200 && r.j.ok, 'idle poll answers');
  ok(tasks().length === 0 && mails.length === 0, 'a quiet poll raises nothing');
  ok(r.j.update && r.j.update.version === watch.ANDROID_BRIDGE_LATEST && /kiwi-print-bridge\.apk$/.test(r.j.update.url), 'an Android 1.0.5 bridge is offered the update');
  const v = await poll('kiwi-print-bridge-android/' + watch.ANDROID_BRIDGE_LATEST);
  ok(!('update' in v.j), 'the latest Android bridge is not offered an update');
  ok(db.prepare("SELECT version FROM print_bridges WHERE id = 'pb_aa598efac1b89d01'").get().version === watch.ANDROID_BRIDGE_LATEST, 'the stored version follows the User-Agent, not the pairing');
  const d = await poll('kiwi-printer-bridge/1.4.4');
  ok(!('update' in d.j), 'a desktop bridge is never offered the Android APK');
  ok(db.prepare("SELECT version FROM print_bridges WHERE id = 'pb_aa598efac1b89d01'").get().version === '1.4.4', 'a desktop User-Agent updates the version too');
  await poll('curl/8');
  ok(db.prepare("SELECT version FROM print_bridges WHERE id = 'pb_aa598efac1b89d01'").get().version === '1.4.4', 'an unknown User-Agent keeps the last known version');
}

/* 2 · ticket pris 21 s après son envoi → « Impression lente », un courriel */
{
  clock += 60000;
  job('pj_slow0000000001', 21055);
  const r = await poll();
  ok(r.j.jobs.length === 1, 'the late ticket is still handed out');
  const t = tasks();
  ok(t.length === 1 && t[0].signal_key === 'print:2026-11-26' && t[0].priority === 2 && t[0].created_by === 'system:print-watch', 'a slow claim opens one priority-2 task for the service day');
  ok(/21 s/.test(t[0].detail) && /Kiwi Print Bridge/.test(t[0].detail) && /192\.168|Blackview/.test(t[0].detail), 'the task says how late, which bridge, and what to do');
  ok(mails.length === 1 && mails[0].to === 'ops@kiwi.test' && /IMPRESSION/.test(mails[0].subject), 'the team gets one e-mail');
  ok(db.prepare("SELECT COUNT(*) n FROM operator_task_events WHERE task_id = ?").get(t[0].id).n === 1, 'the task carries its creation event');
}

/* 3 · le bail expire sans accusé → « bloquée », même tâche, pas de second courriel tout de suite */
{
  clock += 31000;
  const r = await poll();
  ok(db.prepare("SELECT status FROM print_jobs WHERE id = 'pj_slow0000000001'").get().status === 'uncertain', 'the lapsed claim becomes uncertain');
  ok(tasks().length === 1 && mails.length === 1, 'a second signal within five minutes is quiet: one task, one e-mail');
  clock += 5 * 60000 + 1000;
  job('pj_stuck00000001', 40000, 'claimed', { bridge: 'pb_aa598efac1b89d01', claimedAgo: 35000 });
  await poll();
  const t = tasks();
  ok(t.length === 1 && t[0].priority === 1 && /Impression bloquée/.test(t[0].title) && /1 ticket/.test(t[0].detail), 'a stuck ticket raises the same task to priority 1');
  ok(mails.length === 1, 'touching an open task sends no new e-mail');
}

/* 4 · tâche résolue puis nouvel incident le même jour → rouverte, nouveau courriel */
{
  db.prepare("UPDATE operator_tasks SET status = 'resolved', outcome = 'imprimante redémarrée'").run();
  clock += 6 * 60000;
  job('pj_slow0000000002', 30000);
  await poll();
  const t = tasks();
  ok(t.length === 1 && t[0].status === 'open', 'a resolved task reopens when printing goes wrong again');
  ok(mails.length === 2, 'reopening e-mails the team again');
  ok(db.prepare("SELECT COUNT(*) n FROM operator_task_events WHERE action = 'reopened'").get().n === 1, 'the reopening is in the task history');
}

/* 5 · le lendemain (après 5 h) : une nouvelle tâche */
{
  clock = Date.UTC(2026, 10, 27, 5, 30, 0);
  job('pj_slow0000000003', 20000);
  await poll();
  const t = tasks();
  ok(t.length === 2 && t[1].signal_key === 'print:2026-11-27', 'the next service day opens its own task');
  db.prepare("UPDATE print_jobs SET status = 'done', done_ts = ? WHERE status = 'claimed'").run(clock);
  ok(watch.serviceDay(Date.UTC(2026, 10, 27, 4, 59, 0)) === '2026-11-26', 'before 05:00 still belongs to the previous service day');
}

/* 6 · un wake réclamé tard n'est pas un ticket en retard */
{
  clock += 10 * 60000;
  const before = db.prepare('SELECT updated_ts FROM operator_tasks WHERE signal_key = ?').get('print:2026-11-27').updated_ts;
  job('pj_wake000000001', 50000, 'queued', { kind: 'wake' });
  await poll();
  ok(db.prepare('SELECT updated_ts FROM operator_tasks WHERE signal_key = ?').get('print:2026-11-27').updated_ts === before, 'a late wake raises nothing');
}

/* 7 · l'accusé garde ses mesures */
{
  clock += 1000;
  job('pj_timed00000001', 500);
  const r = await poll();
  ok(r.j.jobs.some((j) => j.id === 'pj_timed00000001'), 'the timed ticket is claimed');
  const a = await call(jobsRoute, 'POST', '/api/print/jobs', { bearer: TOKEN, body: { action: 'ack', id: 'pj_timed00000001', ok: true, bytes: 9131, timing: { connectMs: 12, writeMs: 230, reused: true } } });
  ok(a.status === 200 && a.j.updated, 'the ack is accepted');
  const row = db.prepare("SELECT status, connect_ms, write_ms, reused FROM print_jobs WHERE id = 'pj_timed00000001'").get();
  ok(row.status === 'done' && row.connect_ms === 12 && row.write_ms === 230 && row.reused === 1, 'connect and write times are kept on the ticket');
}

/* 8 · un dépôt sans pont en ligne → « Pont hors ligne », mais pas pour un wake */
{
  db.prepare("UPDATE operator_tasks SET status = 'resolved', outcome = 'ok'").run();
  clock += 10 * 60000;
  const cookie = 'kiwi_till=' + (await lib.tillToken(AUTH_SECRET, 'pasta-corner'));
  const mailsBefore = mails.length;
  const w = await call(jobsRoute, 'POST', '/api/print/jobs?merchant=pasta-corner', { cookie, body: { target: { ip: '192.168.100.198', port: 9100 }, kind: 'wake' } });
  ok(w.status === 409 && w.j.error === 'relay-offline' && mails.length === mailsBefore, 'a wake with no bridge online raises nothing');
  const r = await call(jobsRoute, 'POST', '/api/print/jobs?merchant=pasta-corner', { cookie, body: { target: { ip: '192.168.100.198', port: 9100 }, dataB64: 'G0A=', kind: 'receipt' } });
  ok(r.status === 409 && r.j.error === 'relay-offline', 'the till still hears relay-offline at once');
  const t = db.prepare('SELECT * FROM operator_tasks WHERE signal_key = ?').get('print:2026-11-27');
  ok(t.status === 'open' && /hors ligne/.test(t.title) && mails.length === mailsBefore + 1, 'a ticket with no bridge online reopens the task and e-mails the team');
}

/* 9 · sans table de tâches (prod en retard), le relais imprime quand même */
{
  const bare = new DatabaseSync(':memory:');
  bare.exec(read('migrations/legacy/2026-08-21-print-relay.sql'));
  const out = await watch.raisePrintIncident({ DB: fakeD1(bare) }, 'pasta-corner', 'stuck', { count: 1 }, clock);
  ok(out === 'failed', 'a missing operator_tasks table is swallowed, never thrown');
  bare.prepare(`INSERT INTO print_jobs (id, merchant, bridge_id, kind, target, data_b64, status, created_ts, expires_ts) VALUES ('pj_x', 'm', 'pb_1', 'other', '{}', 'G0A=', 'done', 1, 2)`).run();
  await watch.saveTiming({ DB: fakeD1(bare) }, 'm', 'pb_1', 'pj_x', { connectMs: 1, writeMs: 2 });
  ok(true, 'timing on a database without the 0039 columns is swallowed');
}

/* 10 · ré-appairer la même tablette retire l'ancien pont muet, jamais un pont vivant */
{
  const t0 = clock;
  db.prepare(`INSERT INTO print_bridges (id, merchant, name, platform, version, token_hash, created_ts, last_seen_ts) VALUES
    ('pb_old0000000000a', 'pasta-corner', 'Blackview Tab 18', 'android', '1.0.0', 'h-old-a', ?, ?),
    ('pb_live000000000b', 'pasta-corner', 'Blackview Tab 18', 'android', '1.0.6', 'h-live-b', ?, ?),
    ('pb_dead000000000c', 'pasta-corner', 'Linux PC', 'linux', '1.4.4', 'h-dead-c', ?, ?)`)
    .run(t0 - 3 * 86400000, t0 - 2 * 3600000, t0 - 86400000, t0 - 20000, t0 - 60 * 86400000, t0 - 40 * 86400000);
  db.prepare("INSERT INTO print_bridge_codes (code, merchant, created_ts, expires_ts) VALUES ('482913', 'pasta-corner', ?, ?)").run(t0, t0 + 900000);
  const r = await call(bridgesRoute, 'POST', '/api/print/bridges', { body: { action: 'redeem', code: '482913', name: 'Blackview Tab 18', platform: 'android', version: '1.0.7' } });
  ok(r.status === 200 && r.j.ok, 'pairing succeeds');
  const live = (id) => db.prepare('SELECT revoked_ts FROM print_bridges WHERE id = ?').get(id).revoked_ts == null;
  ok(!live('pb_old0000000000a'), 'the same tablet’s old pairing, silent for two hours, is retired');
  ok(live('pb_live000000000b'), 'a same-name bridge seen 20 s ago keeps printing');
  ok(!live('pb_dead000000000c'), 'a bridge silent for 40 days is retired');
  ok(live(r.j.bridgeId), 'the new pairing is active');
}

/* 11 · invariants de source */
{
  const jobs = read('functions/api/print/jobs.js');
  ok(/raisePrintIncident\(env, bridge\.merchant, 'stuck'/.test(jobs) && /raisePrintIncident\(env, bridge\.merchant, 'slow'/.test(jobs) && /raisePrintIncident\(env, merchant, 'offline'/.test(jobs), 'jobs.js raises all three signals');
  ok(/later\(context, raisePrintIncident/.test(jobs) && !/await raisePrintIncident/.test(jobs), 'an alert never delays the relay answer');
  const gradle = read('bridge/android/app/build.gradle');
  ok(gradle.includes(`versionName '${watch.ANDROID_BRIDGE_LATEST}'`), 'ANDROID_BRIDGE_LATEST matches the APK versionName');
}

Date.now = realNow;
globalThis.fetch = realFetch;
if (fail) { console.error(`✗ print-watch: ${fail} échec(s), ${pass} réussite(s)`); process.exit(1); }
console.log(`✓ print-watch · ${pass} contrôles (lent, bloqué, hors ligne, une tâche par jour, courriel à l'ouverture, version, mise à jour, mesures, ré-appairage)`);
