#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · RELAIS D'IMPRESSION — une imprimante morte ne bloque plus les autres
 * ---------------------------------------------------------------------------
 * Browse, 23 novembre 2026 : l'imprimante des reçus (192.168.11.199) cesse de
 * répondre vers 15 h 45. Chaque ticket raté repassait en file toutes les 10 s
 * pendant 10 min en gardant sa place (ORDER BY created_ts), et le pont en
 * prenait 5 par tour, chacun coûtant 16 s de délai de connexion sur la
 * tablette Android. Les tickets cuisine (192.168.11.87, en parfait état)
 * attendaient derrière : 7 à 10 minutes de retard, « toutes les imprimantes
 * sont en panne » pour l'équipe.
 *
 * Règle : un ticket neuf passe toujours devant une reprise, une seule reprise
 * par tour de pont, et on ne réveille pas une imprimante qui est en échec.
 * ═══════════════════════════════════════════════════════════════════════════ */
import fs from 'node:fs';
import path from 'node:path';
import { randomInt } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
let pass = 0;
function ok(v, msg) { if (!v) { console.error('  ✗ ' + msg); process.exitCode = 1; return false; } pass++; return true; }

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

const AUTH_SECRET = 'test-secret-dead-printer';
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
ok(!!token, 'le pont Android de Browse est appairé');

const data = Buffer.from([0x1b, 0x40, 0x48, 0x69, 0x0a]).toString('base64');
const RECEIPT = { ip: '192.168.11.199', port: 9100 };
const KITCHEN = { ip: '192.168.11.87', port: 9100 };
const DEAD = 'failed to connect to /192.168.11.199 (port 9100) from /192.168.11.124 (port 54774) after 8000ms';
const deposit = (target, kind) => call(jobsRoute, 'POST', '/api/print/jobs?merchant=browse', { body: { target, dataB64: data, kind }, cookie: till }, env);
const poll = () => call(jobsRoute, 'GET', '/api/print/jobs', { bearer: token }, env);
const ack = (id, okFlag, error) => call(jobsRoute, 'POST', '/api/print/jobs', { bearer: token, body: { action: 'ack', id, ok: okFlag, bytes: okFlag ? 5 : 0, error } }, env);
const retryDueNow = () => db.prepare("UPDATE print_jobs SET claimed_ts = ? WHERE status = 'queued' AND error IS NOT NULL").run(Date.now() - 1);

/* D1 · six reçus déposés pendant la panne, tous ratés une première fois. */
const receipts = [];
for (let i = 0; i < 6; i++) receipts.push((await deposit(RECEIPT, 'receipt')).j.id);
db.prepare('UPDATE print_jobs SET created_ts = created_ts - ? WHERE kind = ?').run(60000, 'receipt');
for (let round = 0; round < 2; round++) {
  const c = await poll();
  for (const j of c.j.jobs) await ack(j.id, false, DEAD);
}
retryDueNow();
const stillQueued = db.prepare("SELECT COUNT(*) n FROM print_jobs WHERE kind='receipt' AND status='queued' AND error IS NOT NULL").get().n;
ok(stillQueued === 6, 'D1 · les six reçus ratés sont en reprise (reçu ' + stillQueued + ')');

/* D2 · un ticket cuisine arrive : il part au tour suivant, en premier. */
const kitchen = (await deposit(KITCHEN, 'kitchen')).j.id;
const c2 = await poll();
const ids2 = c2.j.jobs.map((j) => j.id);
ok(ids2[0] === kitchen, 'D2 · le ticket cuisine sort en tête du tour, devant les reprises (reçu ' + JSON.stringify(c2.j.jobs.map((j) => j.target.ip)) + ')');
const retries2 = c2.j.jobs.filter((j) => j.target.ip === RECEIPT.ip).length;
ok(retries2 <= 1, 'D2 · au plus une reprise de l’imprimante en panne par tour (reçu ' + retries2 + ')');
for (const j of c2.j.jobs) await ack(j.id, j.id === kitchen, j.id === kitchen ? undefined : DEAD);
ok(db.prepare('SELECT status FROM print_jobs WHERE id = ?').get(kitchen).status === 'done', 'D2 · le ticket cuisine est imprimé');

/* D3 · sans ticket neuf, le pont ne prend toujours qu'une reprise à la fois :
 * 5 × 16 s de délai de connexion, c'était 80 s pendant lesquelles un nouveau
 * ticket cuisine ne pouvait pas sortir. */
retryDueNow();
const c3 = await poll();
ok(c3.j.jobs.length === 1, 'D3 · une seule reprise par tour quand rien de neuf n’attend (reçu ' + c3.j.jobs.length + ')');
for (const j of c3.j.jobs) await ack(j.id, false, DEAD);

/* D4 · les reprises restent servies (une imprimante rallumée finit de vider sa
 * file), dans l'ordre de dépôt. */
retryDueNow();
const c4 = await poll();
ok(c4.j.jobs.length === 1 && receipts.includes(c4.j.jobs[0].id), 'D4 · la reprise suivante est servie');
await ack(c4.j.jobs[0].id, true);
ok(db.prepare('SELECT status FROM print_jobs WHERE id = ?').get(c4.j.jobs[0].id).status === 'done', 'D4 · imprimante revenue : la reprise s’imprime');

/* D5 · pas de réveil vers une imprimante en échec : chaque « wake » coûtait
 * 8 s de connexion au pont, à chaque article ajouté au panier. */
const wake = (await call(jobsRoute, 'POST', '/api/print/jobs?merchant=browse', { body: { target: RECEIPT, kind: 'wake' }, cookie: till }, env)).j.id;
const wakeKitchen = (await call(jobsRoute, 'POST', '/api/print/jobs?merchant=browse', { body: { target: KITCHEN, kind: 'wake' }, cookie: till }, env)).j.id;
const c5 = await poll();
const ids5 = c5.j.jobs.map((j) => j.id);
ok(!ids5.includes(wake), 'D5 · pas de réveil envoyé vers l’imprimante en panne');
ok(ids5.includes(wakeKitchen), 'D5 · l’imprimante cuisine, elle, reçoit son réveil');

console.log((process.exitCode ? '✗' : '✓') + ' print-relay-dead-printer · ' + pass + ' vérifications');
