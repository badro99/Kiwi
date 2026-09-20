#!/usr/bin/env node
/* Regression for ticket #0077: a restaurant till kept redeeming a fresh
 * pairing every minute while every queued sale still received 403. Pairing
 * also issues a stable, device-bound terminal proof. If the browser keeps that
 * proof but loses/rejects the separate till cookie, recovery must reissue the
 * till cookie without creating another pairing row or touching the outbox. */
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';

import { onRequestPost as redeem } from '../functions/api/pair/redeem.js';
import { onRequestPost as recover } from '../functions/api/pair/recover.js';
import {
  TILL_COOKIE, TERMINAL_COOKIE, forgetTillEpoch, isTillFor,
} from '../functions/auth/_lib.js';

const SECRET = 'terminal-recovery-test-secret-32-chars';
const MERCHANT = 'pasta-corner';
const TERMINAL = 'term_12345678-1234-1234-1234-123456789012';

const sqlite = new DatabaseSync(':memory:');
sqlite.exec(`
  CREATE TABLE merchant_config (
    merchant TEXT PRIMARY KEY, features TEXT NOT NULL DEFAULT '{}',
    till_epoch INTEGER NOT NULL DEFAULT 0, updated_ts INTEGER NOT NULL
  );
  CREATE TABLE pairings (
    code TEXT PRIMARY KEY, merchant TEXT, type TEXT, subtype TEXT, name TEXT,
    account_id TEXT, created_ts INTEGER, used_ts INTEGER, expires_ts INTEGER
  );
  CREATE TABLE pair_attempts (
    ip TEXT PRIMARY KEY, fails INTEGER, first_ts INTEGER, blocked_until INTEGER
  );
`);
const now = Date.now();
sqlite.prepare('INSERT INTO merchant_config VALUES (?,?,?,?)').run(MERCHANT, '{}', 0, now);
sqlite.prepare('INSERT INTO pairings VALUES (?,?,?,?,?,?,?,NULL,?)')
  .run('424242', MERCHANT, 'restaurant', 'restaurant', 'Pasta Corner', 'acc-pasta', now, now + 600000);

function d1(db) {
  return { prepare(sql) {
    let args = [];
    return {
      bind(...values) { args = values; return this; },
      async first() { return db.prepare(sql).get(...args) ?? null; },
      async run() { const r = db.prepare(sql).run(...args); return { success: true, meta: { changes: r.changes } }; },
      async all() { return { results: db.prepare(sql).all(...args) }; },
    };
  } };
}
const env = { AUTH_SECRET: SECRET, DB: d1(sqlite) };

function post(path, body, cookie = '') {
  const headers = { 'Content-Type': 'application/json' };
  if (cookie) headers.Cookie = cookie;
  return new Request('https://kiwi.test' + path, {
    method: 'POST', headers, body: JSON.stringify(body),
  });
}
function setCookies(response) {
  if (typeof response.headers.getSetCookie === 'function') return response.headers.getSetCookie();
  const one = response.headers.get('set-cookie');
  return one ? [one] : [];
}
function cookieValue(rows, name) {
  const row = rows.find((value) => String(value).startsWith(name + '='));
  return row && row.slice(name.length + 1).split(';')[0];
}

const redeemed = await redeem({
  request: post('/api/pair/redeem', { code: '424242', terminalId: TERMINAL }), env,
});
assert.equal(redeemed.status, 200);
const issued = setCookies(redeemed);
const terminalProof = cookieValue(issued, TERMINAL_COOKIE);
assert.ok(terminalProof, 'pairing issues the stable terminal proof');
assert.match(issued.at(-1) || '', new RegExp('^' + TILL_COOKIE + '='),
  'the till proof is the final Set-Cookie value for legacy single-cookie kiosks');

// Reproduce the field state: local pairing and terminal proof survived, while
// the independent till cookie did not. This must not consume another code.
const before = sqlite.prepare('SELECT COUNT(*) AS n FROM pairings').get().n;
const recovered = await recover({
  request: post('/api/pair/recover', { merchant: MERCHANT, terminalId: TERMINAL },
    `${TERMINAL_COOKIE}=${terminalProof}`),
  env,
});
assert.equal(recovered.status, 200);
const recoveredBody = await recovered.json();
assert.equal(recoveredBody.ok, true);
assert.equal(recoveredBody.merchant, MERCHANT);
assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM pairings').get().n, before,
  'terminal recovery does not create another pairing row');

const tillProof = cookieValue(setCookies(recovered), TILL_COOKIE);
assert.ok(tillProof, 'recovery emits one fresh till cookie');
assert.equal(await isTillFor(new Request('https://kiwi.test/api/sale', {
  headers: { Cookie: `${TILL_COOKIE}=${tillProof}` },
}), env, MERCHANT), true, 'the recovered proof authorizes this merchant immediately');

const wrongTerminal = await recover({
  request: post('/api/pair/recover', { merchant: MERCHANT, terminalId: TERMINAL + '-wrong' },
    `${TERMINAL_COOKIE}=${terminalProof}`),
  env,
});
assert.equal(wrongTerminal.status, 403, 'a copied terminal id cannot recover a till');

const absentProof = await recover({
  request: post('/api/pair/recover', { merchant: MERCHANT, terminalId: TERMINAL }), env,
});
assert.equal(absentProof.status, 403, 'localStorage alone cannot recover a till');

// A merchant-wide unpair must revoke the stable device proof too. Recovery is
// an authorization path now, so accepting the old terminal cookie here would
// silently undo the explicit revocation.
sqlite.prepare('UPDATE merchant_config SET till_epoch = 1 WHERE merchant = ?').run(MERCHANT);
forgetTillEpoch(MERCHANT, env.DB);
const revokedProof = await recover({
  request: post('/api/pair/recover', { merchant: MERCHANT, terminalId: TERMINAL },
    `${TERMINAL_COOKIE}=${terminalProof}`),
  env,
});
assert.equal(revokedProof.status, 403, 'merchant unpair revokes the older terminal recovery proof');

console.log('Caisse terminal recovery: device proof restores till auth without new pairings.');
