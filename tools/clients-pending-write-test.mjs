#!/usr/bin/env node
/* Ticket #0004: a pending hospitality store may prepare guest profiles, while
 * suspended stores and every pending financial loyalty mutation stay closed. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { makeSession, sessionCookie } from '../functions/auth/_lib.js';
import { onRequestGet, onRequestPost } from '../functions/api/clients.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sqlite = new DatabaseSync(':memory:');
sqlite.exec(fs.readFileSync(path.join(ROOT, 'schema.sql'), 'utf8'));

const DB = {
  prepare(sql) {
    let args = [];
    return {
      bind(...values) { args = values; return this; },
      async first() { return sqlite.prepare(sql).get(...args) || null; },
      async all() { return { results: sqlite.prepare(sql).all(...args) }; },
      async run() {
        const result = sqlite.prepare(sql).run(...args);
        return { success: true, meta: { changes: Number(result.changes) } };
      },
    };
  },
};

let checks = 0;
function ok(condition, label) {
  assert.ok(condition, label);
  checks++;
  console.log('  ✓ ' + label);
}

const secret = 'pending-clients-test-secret';
const now = Date.now();
sqlite.prepare('INSERT INTO accounts (id,email,name,business,salt,hash,created_ts) VALUES (?,?,?,?,?,?,?)')
  .run('acc-a', 'owner@test.ma', 'Owner', 'Riad Group', 's', 'h', now);
for (const [merchant, status] of [['riad-pending', 'pending'], ['riad-shut', 'suspended'], ['riad-active', 'active']]) {
  sqlite.prepare('INSERT INTO merchant_config (merchant,features,type,account_id,name,status,updated_ts) VALUES (?,?,?,?,?,?,?)')
    .run(merchant, '{}', 'hotel', 'acc-a', merchant, status, now);
}
const cookie = sessionCookie(await makeSession('acc-a', secret)).split(';')[0];
const env = { DB, AUTH_SECRET: secret };
const request = (merchant, body) => new Request('https://kiwi.test/api/clients', {
  method: 'POST',
  headers: { Cookie: cookie, 'Content-Type': 'application/json' },
  body: JSON.stringify({ merchant, ...body }),
});

let response = await onRequestPost({ env, request: request('riad-pending', { id: 'guest-p', name: 'Pending Guest', updated: now }) });
ok(response.status === 200, 'pending store profile POST returns 200');

response = await onRequestPost({ env, request: request('riad-active', { id: 'guest-a', name: 'Active Guest', updated: now }) });
ok(response.status === 200, 'active store profile POST remains allowed');

response = await onRequestPost({ env, request: request('riad-shut', { id: 'guest-s', name: 'Suspended Guest', updated: now }) });
ok(response.status === 401, 'suspended store profile POST remains refused');

response = await onRequestPost({ env, request: request('riad-pending', {
  purchase: { eventId: 'purchase-1', clientId: 'guest-p', amountCents: 1000, ts: now },
}) });
ok(response.status === 401, 'pending store purchase mutation remains refused');

response = await onRequestPost({ env, request: request('riad-pending', {
  redemption: { eventId: 'redeem-1', clientId: 'guest-p', rewardId: 'reward-1', points: 10, ts: now },
}) });
ok(response.status === 401, 'pending store redemption mutation remains refused');

response = await onRequestPost({ env, request: request('riad-pending', {
  id: 'guest-import', name: 'Pending Import', source: 'import', financialImport: true,
  points: 900, stamps: 9, visits: 8, spend: 7000, updated: now,
}) });
const imported = sqlite.prepare('SELECT points, stamps, visits, spend FROM clients WHERE merchant=? AND id=?')
  .get('riad-pending', 'guest-import');
ok(response.status === 200 && imported.points === 0 && imported.stamps === 0
  && imported.visits === 0 && imported.spend === 0,
  'pending profile import cannot seed points, visits or spend');

response = await onRequestGet({
  env,
  request: new Request('https://kiwi.test/api/clients?merchant=riad-pending&since=0', { headers: { Cookie: cookie } }),
});
const payload = await response.json();
ok(response.status === 200 && payload.clients?.some(client => client.id === 'guest-p'),
  'pending store can read back its prepared guest profile');

console.log(`\nclients-pending-write-test: ${checks} checks passed`);
