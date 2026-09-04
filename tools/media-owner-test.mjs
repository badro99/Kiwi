#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · media owner test — l'upload reste owner-session-only, pour de vrai.
 *
 * functions/api/media/index.js documente un upload owner-session-only (une
 * caisse compromise ne doit pas remplir le seau R2), mais résolvait le tenant
 * via tenantFor(), qui fait passer un cookie de caisse valide AVANT la
 * session : session A + caisse B rangeait le fichier sous le préfixe de B.
 * Cette suite exécute la VRAIE route avec le VRAI code auth (sessions, caisse,
 * opérateur signés et vérifiés pour de vrai) et exige le refus.
 *
 *   node tools/media-owner-test.mjs
 * ═══════════════════════════════════════════════════════════════════════════ */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const EXPECTED = 7;
let checks = 0;
process.on('unhandledRejection', (error) => { console.error(error); process.exit(1); });
async function check(name, fn) {
  await fn();
  checks += 1;
  process.stdout.write('  ok ' + checks + ' - ' + name + '\n');
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const auth = await import(path.join(root, 'functions/auth/_lib.js'));
const media = await import(path.join(root, 'functions/api/media/index.js'));

const SECRET = 'media-owner-test-secret-32bytes!';
const A = 'cafe-atlas';
const A2 = 'atlas-branch';
const B = 'maison-rivale';
const SUSP = 'cafe-suspended';

function makeWorld() {
  const accounts = new Map([
    ['acc-owner-a', { business: 'Café Atlas' }],
    ['acc-owner-b', { business: 'Maison Rivale' }],
  ]);
  const merchants = new Map([
    [A, { account_id: 'acc-owner-a', status: 'active', till_epoch: 0 }],
    [A2, { account_id: 'acc-owner-a', status: 'active', till_epoch: 0 }],
    [B, { account_id: 'acc-owner-b', status: 'active', till_epoch: 0 }],
    [SUSP, { account_id: 'acc-owner-a', status: 'suspended', till_epoch: 0 }],
  ]);
  const r2 = new Map();
  const DB = {
    prepare(rawSql) {
      const q = String(rawSql).replace(/\s+/g, ' ').trim();
      const stmt = {
        args: [],
        bind(...params) { stmt.args = params; return stmt; },
        async run() { return { success: true, meta: { changes: 0 } }; },
        async all() { return { results: [] }; },
        async first() {
          if (q.startsWith('SELECT business FROM accounts')) return accounts.get(String(stmt.args[0])) || null;
          if (q.startsWith('SELECT account_id FROM merchant_config')) {
            const row = merchants.get(String(stmt.args[0]));
            return row ? { account_id: row.account_id } : null;
          }
          if (q.startsWith('SELECT status FROM merchant_config')) {
            const row = merchants.get(String(stmt.args[0]));
            return row ? { status: row.status } : null;
          }
          if (q.startsWith('SELECT till_epoch FROM merchant_config')) {
            const row = merchants.get(String(stmt.args[0]));
            return row ? { till_epoch: row.till_epoch } : null;
          }
          if (q.startsWith('SELECT id FROM operators')) return null;
          if (q.startsWith('SELECT label FROM operators')) return null;
          return null;
        },
      };
      return stmt;
    },
  };
  const MEDIA = {
    put: async (key, bytes) => { r2.set(String(key), bytes); },
    get: async (key) => (r2.has(String(key)) ? { body: r2.get(String(key)) } : null),
    delete: async (key) => { r2.delete(String(key)); },
  };
  return { r2, env: { DB, MEDIA, AUTH_SECRET: SECRET } };
}

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00]);
async function sessCookie(aid) {
  return `${auth.SESS_COOKIE}=${await auth.makeSession(aid, SECRET)}`;
}
async function tillCookie(merchant) {
  return `${auth.TILL_COOKIE}=${await auth.tillToken(SECRET, merchant, 0)}`;
}
function postUpload(env, merchant, cookie, bytes = JPEG) {
  return media.onRequestPost({
    request: new Request('https://kiwi.test/api/media?merchant=' + encodeURIComponent(merchant), {
      method: 'POST',
      headers: { 'Content-Type': 'image/jpeg', ...(cookie ? { Cookie: cookie } : {}) },
      body: bytes,
    }),
    env,
  });
}

await check('mixed cookies denied: owner session A plus till B cannot file under B', async () => {
  const w = makeWorld();
  const cookie = await sessCookie('acc-owner-a') + '; ' + await tillCookie(B);
  const res = await postUpload(w.env, B, cookie);
  assert.equal(res.status, 401);
  assert.equal(w.r2.size, 0);
});

await check('owner upload still works on the owned store', async () => {
  const w = makeWorld();
  const res = await postUpload(w.env, A, await sessCookie('acc-owner-a'));
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.ok, true);
  assert.ok(String(body.key).startsWith('media/' + A + '/'));
  assert.equal(w.r2.size, 1);
});

await check('secondary owned store works for the same owner session', async () => {
  const w = makeWorld();
  const res = await postUpload(w.env, A2, await sessCookie('acc-owner-a'));
  assert.equal(res.status, 200);
  assert.ok(String((await res.json()).key).startsWith('media/' + A2 + '/'));
});

await check('suspended write stays blocked under the strict owner rule', async () => {
  const w = makeWorld();
  const res = await postUpload(w.env, SUSP, await sessCookie('acc-owner-a'));
  assert.equal(res.status, 401);
  assert.equal(w.r2.size, 0);
});

await check('till alone and operator alone are denied', async () => {
  const w = makeWorld();
  const r1 = await postUpload(w.env, B, await tillCookie(B));
  assert.equal(r1.status, 401);
  const opCookie = `kiwi_op=${await auth.operatorToken(SECRET)}; kiwi_op_id=${await auth.operatorIdToken(SECRET, 'op1')}`;
  const r2 = await postUpload(w.env, B, opCookie);
  assert.equal(r2.status, 401);
  assert.equal(w.r2.size, 0);
});

await check('unknown store is refused without an R2 write', async () => {
  const w = makeWorld();
  const res = await postUpload(w.env, 'boutique-fantome', await sessCookie('acc-owner-a'));
  assert.equal(res.status, 401);
  assert.equal(w.r2.size, 0);
});

await check('type and size guards still hold', async () => {
  const w = makeWorld();
  const cookie = await sessCookie('acc-owner-a');
  const bad = await media.onRequestPost({
    request: new Request('https://kiwi.test/api/media?merchant=' + A, {
      method: 'POST', headers: { 'Content-Type': 'text/plain', Cookie: cookie }, body: JPEG,
    }),
    env: w.env,
  });
  assert.equal(bad.status, 415);
  const big = new Uint8Array(17 * 1024 * 1024);
  big[0] = 0xff; big[1] = 0xd8; big[2] = 0xff;
  const tooBig = await postUpload(w.env, A, cookie, big);
  assert.equal(tooBig.status, 413);
  assert.equal(w.r2.size, 0);
});

assert.equal(checks, EXPECTED, 'expected ' + EXPECTED + ' executed checks, got ' + checks);
process.stdout.write('media-owner-test: ' + checks + ' checks passed\n');
