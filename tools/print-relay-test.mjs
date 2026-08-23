#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · RELAIS D'IMPRESSION — l'iPad imprime par le pont du comptoir
 * ---------------------------------------------------------------------------
 * Trois étages, tous réels :
 *   A. les routes /api/print/* sur une vraie base SQLite (node:sqlite) derrière
 *      un adaptateur D1 — appairage par code, dépôt par la caisse appairée,
 *      réclamation atomique par le pont, acquittement, péremption, révocation,
 *      et « relais non provisionné » quand les tables manquent ;
 *   B. le VRAI bridge/server.js lancé en sous-processus contre un faux
 *      kiwi-os.com local : il échange son code, récupère un ticket, l'écrit sur
 *      une fausse imprimante TCP et acquitte — les octets doivent arriver
 *      identiques ;
 *   C. les invariants de source : la porte (_middleware) n'ouvre les jobs QUE
 *      sur jeton `kpb_`, la caisse retombe sur le relais quand 127.0.0.1 ne
 *      répond pas, les tampons de printer-bridge.js sont d'accord, le schéma
 *      porte les trois tables.
 * ═══════════════════════════════════════════════════════════════════════════ */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

let pass = 0;
function ok(v, msg) { if (!v) { console.error('  ✗ ' + msg); process.exitCode = 1; return false; } pass++; return true; }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ── un D1 de poche sur node:sqlite ─────────────────────────────────────────── */
let DatabaseSync;
try { ({ DatabaseSync } = await import('node:sqlite')); } catch (_) {
  console.error('  ✗ node:sqlite indisponible (Node ≥ 22.5 requis) — étage A non exécuté');
  process.exitCode = 1;
}
function fakeD1(db) {
  const stmt = (sql, args) => ({
    bind: (...a) => stmt(sql, a),
    first: async () => { const r = db.prepare(sql).get(...(args || [])); return r === undefined ? null : r; },
    all: async () => ({ results: db.prepare(sql).all(...(args || [])) }),
    run: async () => { const r = db.prepare(sql).run(...(args || [])); return { meta: { changes: Number(r.changes) } }; },
  });
  return {
    prepare: (sql) => stmt(sql, []),
    batch: async (stmts) => { const out = []; for (const s of stmts) out.push(await s.run()); return out; },
  };
}
function applyMigration(db) {
  db.exec(read('migrations/2026-08-21-print-relay.sql'));
  db.exec(`CREATE TABLE IF NOT EXISTS pair_attempts (ip TEXT PRIMARY KEY, fails INTEGER NOT NULL, first_ts INTEGER NOT NULL, blocked_until INTEGER);`);
}

const AUTH_SECRET = 'test-secret-relay';
const lib = await import(pathToFileURL(path.join(root, 'functions/auth/_lib.js')).href);
const bridgesRoute = await import(pathToFileURL(path.join(root, 'functions/api/print/bridges.js')).href);
const jobsRoute = await import(pathToFileURL(path.join(root, 'functions/api/print/jobs.js')).href);

async function tillCookieFor(merchant) { return 'kiwi_till=' + (await lib.tillToken(AUTH_SECRET, merchant)); }
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

/* ═══ A · les routes ═══════════════════════════════════════════════════════ */
if (DatabaseSync) {
  // A0 · tables absentes → 503 relay-not-provisioned, jamais 500
  {
    const db = new DatabaseSync(':memory:');
    const env = { DB: fakeD1(db), AUTH_SECRET };
    const till = await tillCookieFor('browse');
    const r = await call(bridgesRoute, 'POST', '/api/print/bridges?merchant=browse', { body: { action: 'pair-code' }, cookie: till }, env);
    ok(r.status === 503 && r.j && r.j.error === 'relay-not-provisioned', 'A0 · sans tables, pair-code répond 503 relay-not-provisioned (reçu ' + r.status + ' ' + JSON.stringify(r.j) + ')');
    const r2 = await call(jobsRoute, 'GET', '/api/print/jobs', { bearer: 'kpb_' + 'a'.repeat(64) }, env);
    ok(r2.status === 503 && r2.j && r2.j.error === 'relay-unavailable', 'A0 · sans tables, un pont qui poll reçoit 503 (pas 401 — il ne doit PAS oublier son jeton) (reçu ' + r2.status + ')');
  }

  const db = new DatabaseSync(':memory:');
  applyMigration(db);
  const env = { DB: fakeD1(db), AUTH_SECRET };
  const till = await tillCookieFor('browse');
  const other = await tillCookieFor('santos-store');

  // A1 · identité : sans cookie ni session, pas de code
  {
    const r = await call(bridgesRoute, 'POST', '/api/print/bridges?merchant=browse', { body: { action: 'pair-code' } }, env);
    ok(r.status === 401, 'A1 · un inconnu ne génère pas de code d’appairage (reçu ' + r.status + ')');
  }
  // A2 · la caisse appairée de Browse génère un code ; un mauvais code est refusé
  let code;
  {
    const r = await call(bridgesRoute, 'POST', '/api/print/bridges?merchant=browse', { body: { action: 'pair-code' }, cookie: till }, env);
    ok(r.status === 200 && r.j.ok && /^\d{6}$/.test(r.j.code), 'A2 · la caisse de Browse obtient un code à 6 chiffres');
    code = r.j.code;
    const bad = await call(bridgesRoute, 'POST', '/api/print/bridges', { body: { action: 'redeem', code: '000000' }, ip: '1.2.3.4' }, env);
    ok(bad.status === 422 && bad.j.error === 'invalid_or_expired', 'A2 · un mauvais code → 422 invalid_or_expired');
    // le nouveau code révoque l'ancien
    const r2 = await call(bridgesRoute, 'POST', '/api/print/bridges?merchant=browse', { body: { action: 'pair-code' }, cookie: till }, env);
    const old = await call(bridgesRoute, 'POST', '/api/print/bridges', { body: { action: 'redeem', code }, ip: '1.2.3.5' }, env);
    ok(old.status === 422, 'A2 · régénérer un code révoque le précédent');
    code = r2.j.code;
  }
  // A3 · le pont échange le code contre un jeton ; le code ne sert qu'une fois
  let token, bridgeId;
  {
    const r = await call(bridgesRoute, 'POST', '/api/print/bridges', { body: { action: 'redeem', code, name: 'PC comptoir', platform: 'darwin', version: '1.4.0' }, ip: '1.2.3.6' }, env);
    ok(r.status === 200 && r.j.ok && /^kpb_[0-9a-f]{64}$/.test(r.j.token) && r.j.merchant === 'browse', 'A3 · le pont reçoit un jeton kpb_ pour browse');
    token = r.j.token; bridgeId = r.j.bridgeId;
    const again = await call(bridgesRoute, 'POST', '/api/print/bridges', { body: { action: 'redeem', code }, ip: '1.2.3.6' }, env);
    ok(again.status === 422, 'A3 · le même code ne se ré-échange pas');
    const row = db.prepare('SELECT token_hash FROM print_bridges WHERE id = ?').get(bridgeId);
    ok(row && row.token_hash !== token && /^[0-9a-f]{64}$/.test(row.token_hash), 'A3 · seul le sha256 du jeton est en base');
    const me = await call(bridgesRoute, 'GET', '/api/print/bridges', { bearer: token }, env);
    ok(me.status === 200 && me.j.bridge && me.j.bridge.merchant === 'browse', 'A3 · GET /bridges avec le jeton = auto-vérification');
  }
  // A4 · la caisse voit son pont en ligne ; Santos ne le voit pas
  {
    const r = await call(bridgesRoute, 'GET', '/api/print/bridges?merchant=browse', { cookie: till }, env);
    ok(r.status === 200 && r.j.online === true && r.j.bridges.length === 1 && r.j.bridges[0].name === 'PC comptoir', 'A4 · Browse voit « PC comptoir » en ligne');
    const s = await call(bridgesRoute, 'GET', '/api/print/bridges?merchant=santos-store', { cookie: other }, env);
    ok(s.status === 200 && s.j.bridges.length === 0 && s.j.online === false, 'A4 · Santos ne voit aucun pont (isolation par commerce)');
    const spoof = await call(bridgesRoute, 'GET', '/api/print/bridges?merchant=browse', { cookie: other }, env);
    ok(spoof.status === 401, 'A4 · la caisse de Santos ne lit pas les ponts de Browse en changeant ?merchant=');
  }
  // A5 · dépôt : sans pont en ligne → 409 ; avec → 200 ; validations
  const data = Buffer.from([0x1b, 0x40, 0x48, 0x65, 0x6c, 0x6c, 0x6f, 0x0a, 0x1d, 0x56, 0x00]).toString('base64');
  let jobId;
  {
    const s = await call(jobsRoute, 'POST', '/api/print/jobs?merchant=santos-store', { body: { target: { ip: '192.168.11.199', port: 9100 }, dataB64: data, kind: 'receipt' }, cookie: other }, env);
    ok(s.status === 409 && s.j.error === 'relay-offline', 'A5 · sans pont en ligne la caisse reçoit 409 relay-offline (elle retombe sur l’aperçu)');
    const bad = await call(jobsRoute, 'POST', '/api/print/jobs?merchant=browse', { body: { target: { ip: '999.1.1.1' }, dataB64: data }, cookie: till }, env);
    ok(bad.status === 400, 'A5 · une IP invalide est refusée');
    const big = await call(jobsRoute, 'POST', '/api/print/jobs?merchant=browse', { body: { target: { ip: '192.168.11.199' }, dataB64: 'A'.repeat(800 * 1024) }, cookie: till }, env);
    ok(big.status === 413, 'A5 · un ticket trop gros est refusé (413)');
    const r = await call(jobsRoute, 'POST', '/api/print/jobs?merchant=browse', { body: { target: { ip: '192.168.11.199', port: 9100 }, dataB64: data, kind: 'receipt' }, cookie: till }, env);
    ok(r.status === 200 && r.j.ok && /^pj_/.test(r.j.id), 'A5 · la caisse de Browse dépose un ticket (' + (r.j && r.j.id) + ')');
    jobId = r.j.id;
    const anon = await call(jobsRoute, 'POST', '/api/print/jobs?merchant=browse', { body: { target: { ip: '192.168.11.199' }, dataB64: data } }, env);
    ok(anon.status === 401, 'A5 · un inconnu ne dépose rien');
  }
  // A6 · le pont réclame (atomique), acquitte ; la caisse voit « done »
  {
    const r = await call(jobsRoute, 'GET', '/api/print/jobs', { bearer: token }, env);
    ok(r.status === 200 && r.j.ok && r.j.jobs.length === 1 && r.j.jobs[0].id === jobId && r.j.jobs[0].dataB64 === data
      && r.j.jobs[0].target.ip === '192.168.11.199' && r.j.jobs[0].target.port === 9100, 'A6 · le pont réclame le ticket avec sa cible et ses octets');
    const again = await call(jobsRoute, 'GET', '/api/print/jobs', { bearer: token }, env);
    ok(again.status === 200 && again.j.jobs.length === 0, 'A6 · un second poll ne rend pas le même ticket (réclamation atomique)');
    const st = await call(jobsRoute, 'GET', '/api/print/jobs?merchant=browse&id=' + jobId, { cookie: till }, env);
    ok(st.status === 200 && st.j.job.status === 'claimed', 'A6 · la caisse voit le ticket « claimed »');
    const ack = await call(jobsRoute, 'POST', '/api/print/jobs', { bearer: token, body: { action: 'ack', id: jobId, ok: true, bytes: 11 } }, env);
    ok(ack.status === 200 && ack.j.updated === true, 'A6 · le pont acquitte');
    const st2 = await call(jobsRoute, 'GET', '/api/print/jobs?merchant=browse&id=' + jobId, { cookie: till }, env);
    ok(st2.j.job.status === 'done' && st2.j.job.bytes === 11, 'A6 · la caisse voit « done · 11 o »');
    const spy = await call(jobsRoute, 'GET', '/api/print/jobs?merchant=santos-store&id=' + jobId, { cookie: other }, env);
    ok(spy.status === 404, 'A6 · Santos ne lit pas le ticket de Browse');
    const badtok = await call(jobsRoute, 'GET', '/api/print/jobs', { bearer: 'kpb_' + 'f'.repeat(64) }, env);
    ok(badtok.status === 401, 'A6 · un jeton inconnu → 401');
  }
  // A7 · un échec d'impression remonte à la caisse
  {
    const r = await call(jobsRoute, 'POST', '/api/print/jobs?merchant=browse', { body: { target: { ip: '192.168.11.199' }, dataB64: data, kind: 'kitchen' }, cookie: till }, env);
    const c = await call(jobsRoute, 'GET', '/api/print/jobs', { bearer: token }, env);
    ok(c.j.jobs.length === 1 && c.j.jobs[0].kind === 'kitchen', 'A7 · ticket cuisine réclamé');
    await call(jobsRoute, 'POST', '/api/print/jobs', { bearer: token, body: { action: 'ack', id: r.j.id, ok: false, error: 'printer timeout' } }, env);
    const st = await call(jobsRoute, 'GET', '/api/print/jobs?merchant=browse&id=' + r.j.id, { cookie: till }, env);
    ok(st.j.job.status === 'failed' && st.j.job.error === 'printer timeout', 'A7 · la caisse voit « failed · printer timeout »');
  }
  // A8 · péremption : un ticket de plus de 10 min n'est plus servi
  {
    const r = await call(jobsRoute, 'POST', '/api/print/jobs?merchant=browse', { body: { target: { ip: '192.168.11.199' }, dataB64: data }, cookie: till }, env);
    db.prepare('UPDATE print_jobs SET expires_ts = ? WHERE id = ?').run(Date.now() - 1000, r.j.id);
    const c = await call(jobsRoute, 'GET', '/api/print/jobs', { bearer: token }, env);
    ok(c.j.jobs.length === 0, 'A8 · un ticket périmé n’est pas servi');
    const st = await call(jobsRoute, 'GET', '/api/print/jobs?merchant=browse&id=' + r.j.id, { cookie: till }, env);
    ok(st.j.job.status === 'expired', 'A8 · …et il est marqué « expired »');
  }
  // A9 · révocation : le pont perd l'accès, et un dépôt redevient 409
  {
    const rv = await call(bridgesRoute, 'POST', '/api/print/bridges?merchant=browse', { body: { action: 'revoke', id: bridgeId }, cookie: other }, env);
    ok(rv.status === 401 || (rv.j && rv.j.revoked === false), 'A9 · Santos ne révoque pas le pont de Browse');
    const r = await call(bridgesRoute, 'POST', '/api/print/bridges?merchant=browse', { body: { action: 'revoke', id: bridgeId }, cookie: till }, env);
    ok(r.status === 200 && r.j.revoked === true, 'A9 · Browse révoque son pont');
    const c = await call(jobsRoute, 'GET', '/api/print/jobs', { bearer: token }, env);
    ok(c.status === 401, 'A9 · le jeton révoqué → 401');
    const d = await call(jobsRoute, 'POST', '/api/print/jobs?merchant=browse', { body: { target: { ip: '192.168.11.199' }, dataB64: data }, cookie: till }, env);
    ok(d.status === 409, 'A9 · plus de pont en ligne → la caisse reçoit 409');
  }
  // A10 · OPTIONS = 204 sans corps (Workers refuse un corps sur 204)
  {
    const res = await bridgesRoute.onRequestOptions({ request: req('OPTIONS', '/api/print/bridges') });
    ok(res.status === 204 && (await res.text()) === '', 'A10 · OPTIONS /bridges → 204 vide');
  }
}

/* ═══ B · le vrai pont contre un faux kiwi-os.com ══════════════════════════ */
{
  const ESC = Buffer.from([0x1b, 0x40, 0x4b, 0x49, 0x57, 0x49, 0x0a, 0x1d, 0x56, 0x00]);
  const seen = { redeem: null, polls: 0, acks: [] };
  let served = false;
  const TOKEN = 'kpb_' + '7'.repeat(64);

  // la fausse imprimante : capture les octets reçus
  const printed = [];
  const printer = net.createServer((sock) => { const ch = []; sock.on('data', (d) => ch.push(d)); sock.on('close', () => printed.push(Buffer.concat(ch))); });
  await new Promise((r) => printer.listen(0, '127.0.0.1', r));
  const printerPort = printer.address().port;

  // le faux kiwi-os.com
  const fake = http.createServer(async (rq, rs) => {
    const body = await new Promise((r) => { const c = []; rq.on('data', (d) => c.push(d)); rq.on('end', () => r(Buffer.concat(c).toString('utf8'))); });
    const send = (st, o) => { rs.writeHead(st, { 'Content-Type': 'application/json' }); rs.end(JSON.stringify(o)); };
    const auth = rq.headers.authorization || '';
    if (rq.method === 'POST' && rq.url === '/api/print/bridges') {
      const j = JSON.parse(body || '{}');
      seen.redeem = j;
      if (j.action === 'redeem' && j.code === '424242') return send(200, { ok: true, token: TOKEN, bridgeId: 'pb_0123456789abcdef', merchant: 'browse', name: j.name });
      return send(422, { ok: false, error: 'invalid_or_expired' });
    }
    if (rq.url === '/api/print/jobs' && auth !== 'Bearer ' + TOKEN) return send(401, { ok: false, error: 'unauthorized' });
    if (rq.method === 'GET' && rq.url === '/api/print/jobs') {
      seen.polls++;
      if (!served) { served = true; return send(200, { ok: true, merchant: 'browse', poll: 200, jobs: [{ id: 'pj_test', kind: 'receipt', target: { ip: '127.0.0.1', port: printerPort }, dataB64: ESC.toString('base64') }] }); }
      return send(200, { ok: true, merchant: 'browse', poll: 200, jobs: [] });
    }
    if (rq.method === 'POST' && rq.url === '/api/print/jobs') { seen.acks.push(JSON.parse(body || '{}')); return send(200, { ok: true, updated: true }); }
    send(404, { ok: false });
  });
  await new Promise((r) => fake.listen(0, '127.0.0.1', r));
  const fakePort = fake.address().port;

  const cfgPath = path.join(os.tmpdir(), 'kiwi-bridge-test-' + process.pid + '.json');
  try { fs.unlinkSync(cfgPath); } catch (_) {}
  const BPORT = 9190 + (process.pid % 7);
  const child = spawn(process.execPath, [path.join(root, 'bridge/server.js')], {
    env: Object.assign({}, process.env, { KIWI_BRIDGE_PORT: String(BPORT), KIWI_BRIDGE_CONFIG: cfgPath, KIWI_RELAY_URL: 'http://127.0.0.1:' + fakePort }),
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let log = '';
  child.stdout.on('data', (d) => { log += d; });
  child.stderr.on('data', (d) => { log += d; });

  const bget = (p) => fetch('http://127.0.0.1:' + BPORT + p).then((r) => r.text().then((t) => ({ status: r.status, text: t, j: (() => { try { return JSON.parse(t); } catch (_) { return null; } })() })));
  const bpost = (p, o) => fetch('http://127.0.0.1:' + BPORT + p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(o || {}) }).then((r) => r.json().then((j) => ({ status: r.status, j })));

  let up = false;
  for (let i = 0; i < 40 && !up; i++) { try { const r = await bget('/kiwi/ping'); up = r.j && r.j.ok; } catch (_) { await sleep(100); } }
  ok(up, 'B1 · le pont démarre sur ' + BPORT);
  if (up) {
    const ping = await bget('/kiwi/ping');
    ok(ping.j.version === '1.4.0' && ping.j.relay && ping.j.relay.paired === false, 'B1 · /kiwi/ping v1.4.0 annonce relay.paired=false');
    const page = await bget('/');
    ok(page.status === 200 && /Kiwi Printer Bridge/.test(page.text) && /Associer ce pont/.test(page.text), 'B1 · la page locale du pont se sert sur /');
    const bad = await bpost('/kiwi/relay/pair', { code: '111111' });
    ok(bad.status === 422 && bad.j.ok === false, 'B2 · un mauvais code est refusé par le faux serveur et remonté tel quel');
    const good = await bpost('/kiwi/relay/pair', { code: '424242' });
    ok(good.status === 200 && good.j.ok && good.j.merchant === 'browse', 'B2 · le pont s’appaire avec 424242 → browse');
    ok(seen.redeem && seen.redeem.version === '1.4.0' && seen.redeem.platform === process.platform && seen.redeem.name, 'B2 · il se présente avec version, plateforme et nom de machine');
    const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
    ok(cfg.relay && cfg.relay.token === TOKEN && cfg.relay.merchant === 'browse', 'B2 · le jeton est écrit dans le fichier de config du pont');
    if (process.platform !== 'win32') ok((fs.statSync(cfgPath).mode & 0o777) === 0o600, 'B2 · …en mode 0600');
    // le poll doit récupérer le ticket et l'imprimer
    for (let i = 0; i < 60 && !seen.acks.length; i++) await sleep(100);
    ok(seen.polls >= 1, 'B3 · le pont a interrogé /api/print/jobs (' + seen.polls + ' fois)');
    ok(printed.length === 1 && Buffer.compare(printed[0], ESC) === 0, 'B3 · la fausse imprimante a reçu exactement les octets ESC/POS du ticket');
    ok(seen.acks.length === 1 && seen.acks[0].action === 'ack' && seen.acks[0].id === 'pj_test' && seen.acks[0].ok === true && seen.acks[0].bytes === ESC.length, 'B3 · le pont a acquitté ok·' + ESC.length + ' o');
    const st = await bget('/kiwi/relay');
    ok(st.j.paired && st.j.online && st.j.printed === 1 && st.j.merchant === 'browse', 'B3 · /kiwi/relay : appairé · en ligne · 1 imprimé');
    const ping2 = await bget('/kiwi/ping');
    ok(ping2.j.relay.paired === true && ping2.j.relay.merchant === 'browse', 'B3 · /kiwi/ping annonce relay.paired=true (la caisse masque alors « Associer ce pont »)');
    const un = await bpost('/kiwi/relay/unpair');
    ok(un.j.ok && !(JSON.parse(fs.readFileSync(cfgPath, 'utf8')).relay), 'B4 · /kiwi/relay/unpair oublie le jeton');
    ok(!/kpb_/.test(log), 'B5 · le jeton n’apparaît jamais dans la console du pont');
  } else {
    console.error(log.slice(-800));
  }
  child.kill();
  await new Promise((r) => fake.close(r));
  await new Promise((r) => printer.close(r));
  try { fs.unlinkSync(cfgPath); } catch (_) {}
}

/* ═══ C · invariants de source ═════════════════════════════════════════════ */
{
  const mw = read('functions/_middleware.js');
  ok(/path === '\/api\/print\/jobs' \|\| path === '\/api\/print\/bridges'\)\s*&& \/\^Bearer\\s\+kpb_\[0-9a-f\]\{64\}\$\/i\.test/.test(mw), 'C1 · la porte n’ouvre /api/print/jobs qu’à un jeton kpb_ (chemins exacts)');
  ok(/method === 'POST' && path === '\/api\/print\/bridges'\) return next\(\);/.test(mw), 'C1 · POST /api/print/bridges est ouvert (le handler exige un code vivant)');
  ok(!/startsWith\('\/api\/print/.test(mw), 'C1 · aucun préfixe /api/print ouvert');

  const pb = read('assets/printer-bridge.js');
  ok(/nativeFailureCount < 3/.test(pb) && /printQueueIdle\(\)/.test(pb), 'C2 · la redécouverte native attend trois échecs et une file au repos');
  ok(/plugin\.probe\([^]*plugin\.scan\(/.test(pb), 'C2 · la dernière IP est sondée avant tout scan du sous-réseau');
  ok(/hosts\.length === 1[^]*setConfig\(\{ ip: hosts\[0\]\.host/.test(pb) && /multiple-printers/.test(pb), 'C2 · une seule imprimante est reprise automatiquement, plusieurs exigent un choix');
  ok(/local-network-denied[^]*probeOnly: true/.test(pb) && /Réglages > Kiwi Pro > Réseau local/.test(pb), 'C2 · permission réseau refusée : dernière IP seulement et explication visible');
  ok(/function viaRelayOrFail/.test(pb) && /return j \? bridgePrintNow\(bytes, target\) : viaRelayOrFail\(bytes, target\);/.test(pb), 'C2 · sans pont local, bridgePrintBytes passe par le relais');
  ok(/reason === 'bridge-unreachable'\) \{ bridgePort = 0; return viaRelayOrFail/.test(pb), 'C2 · un pont local disparu bascule aussi sur le relais');
  ok(/credentials: 'same-origin'/.test(pb) && /RELAY_API = '\/api\/print'/.test(pb), 'C2 · le relais est appelé même origine avec le cookie de caisse');
  ok(/relayProbe: relayProbe, relayEnqueue: relayEnqueue, relayPairCode: relayPairCode, relayRevoke: relayRevoke/.test(pb), 'C2 · KiwiPrinter expose le relais');
  ok(/id="kpr-relay-pair"/.test(pb) && /id="kpr-relay-pair-local"/.test(pb) && /\/kiwi\/relay\/pair/.test(pb), 'C2 · le modal propose « Associer un pont » et l’association directe du pont local');
  ok(/r === 'relay-offline'/.test(pb), 'C2 · frReason explique relay-offline');

  const caisse = read('kiwi-caisse.html'), dash = read('dashboard.html'), sw = read('kiwi-sw.js');
  const stamp = (src) => (src.match(/printer-bridge\.js\?v=(\d+)/) || [])[1];
  ok(stamp(caisse) && stamp(caisse) === stamp(dash) && stamp(caisse) === stamp(sw), 'C3 · printer-bridge.js porte le même tampon en caisse, dashboard et SW (' + stamp(caisse) + '/' + stamp(dash) + '/' + stamp(sw) + ')');
  ok(Number(stamp(caisse)) >= 4, 'C3 · le tampon a bougé avec le relais (≥ 4)');

  const schema = read('schema.sql');
  ok(/CREATE TABLE IF NOT EXISTS print_bridges/.test(schema) && /CREATE TABLE IF NOT EXISTS print_bridge_codes/.test(schema) && /CREATE TABLE IF NOT EXISTS print_jobs/.test(schema), 'C4 · schema.sql porte les trois tables du relais');
  const srv = read('bridge/server.js');
  ok(/const VERSION = '1\.4\.0'/.test(srv) && /"version": "1\.4\.0"/.test(read('bridge/package.json')), 'C5 · bridge 1.4.0 (server.js et package.json d’accord)');
  ok(/const HOST = '127\.0\.0\.1'/.test(srv) && !/0\.0\.0\.0/.test(srv), 'C5 · le pont écoute toujours sur loopback uniquement — le relais est sortant');

  const lin = read('bridge/install-linux.sh');
  ok(/Restart=always/.test(lin) && /kiwi-printer-bridge\.service/.test(lin) && /--pair/.test(lin), 'C6 · install-linux.sh configure le service systemd avec Restart=always et --pair');
  ok(/\/kiwi\/relay\/pair/.test(lin) && /read -r c < \/dev\/tty/.test(lin) && !/"\$BIN_TARGET" --pair/.test(lin), 'C6 · install-linux.sh appaire via l’API locale du service (jamais un second pont) et lit le code sur /dev/tty (curl | bash)');
  ok(!/\$IP_ADDR:9110/.test(lin), 'C6 · install-linux.sh ne promet pas une page du pont sur le LAN (loopback seulement)');
  const macPlist = read('bridge/com.kiwi.printer-bridge.plist');
  ok(/<key>KeepAlive<\/key>\s*<true\/>/.test(macPlist) && /<key>RunAtLoad<\/key>\s*<true\/>/.test(macPlist), 'C6 · com.kiwi.printer-bridge.plist active KeepAlive et RunAtLoad');
  const macInstall = read('bridge/install-macos.sh');
  ok(/LaunchAgents/.test(macInstall) && /launchctl/.test(macInstall), 'C6 · install-macos.sh installe et charge le LaunchAgent');
  const termuxInstall = read('bridge/install-termux.sh');
  ok(/termux-wake-lock/.test(termuxInstall) && /server\.js/.test(termuxInstall) && /--pair/.test(termuxInstall), 'C6 · install-termux.sh configure l’anti-veille et l’appairage');
  ok(/nohup node "\$SERVER_JS"/.test(termuxInstall) && /\/kiwi\/relay\/pair/.test(termuxInstall) && /read -r c < \/dev\/tty/.test(termuxInstall) && !/exec node "\$SERVER_JS"$/m.test(termuxInstall), 'C6 · install-termux.sh lance le pont en arrière-plan puis appaire via l’API locale, code lu sur /dev/tty');
}

console.log('print-relay-test: ' + pass + ' contrôles' + (process.exitCode ? ' · ÉCHEC' : ' ✓'));
