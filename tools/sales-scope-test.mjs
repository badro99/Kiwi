#!/usr/bin/env node
/* The pre-split account bucket is added to a store's sales only for the owner
   reading their own store. Before, any browser holding an owner session got
   that owner's old bucket unioned into whatever store it read another way (a
   paired till, the operator console): two tenants' money in one feed. The real
   schema runs in node:sqlite behind a D1-shaped stub. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { makeSession, SESS_COOKIE, tillToken, TILL_COOKIE, LEGACY_SLUG } from '../functions/auth/_lib.js';
import { legacyBucketFor } from '../functions/api/_sales-scope.js';
import { onRequestGet as feed } from '../functions/api/feed.js';

const secret = 'sales-scope-test-only';
const sqlite = new DatabaseSync(':memory:');
sqlite.exec(fs.readFileSync(new URL('../schema.sql', import.meta.url), 'utf8'));
const DB = { prepare(sql) { let args = []; return {
  bind(...v) { args = v; return this; },
  first() { return sqlite.prepare(sql).get(...args) || null; },
  all() { return { results: sqlite.prepare(sql).all(...args) }; },
  run() { return { success: true, meta: { changes: sqlite.prepare(sql).run(...args).changes } }; },
}; } };
const env = { DB, AUTH_SECRET: secret };
const account = (aid, business, epoch = 1, created = Date.now()) => sqlite.prepare(
  'INSERT INTO accounts (id, email, business, salt, hash, created_ts, session_epoch) VALUES (?, ?, ?, ?, ?, ?, ?)').run(aid, aid + '@x.test', business, 's', 'h', created, epoch);
const store = (slug, aid) => sqlite.prepare("INSERT INTO merchant_config (merchant, account_id, features, status, updated_ts) VALUES (?, ?, '{}', 'active', 1)").run(slug, aid);
const sale = (id, merchant, amount) => sqlite.prepare('INSERT INTO sales (id, merchant, amount, amount_cents, method, ts) VALUES (?, ?, ?, ?, ?, ?)').run(id, merchant, amount, amount * 100, 'cash', 1_700_000_000_000);
const req = (...cookies) => new Request('https://kiwi.test/api/feed', { headers: { Cookie: cookies.join('; ') } });
const sess = async (aid, epoch = 1) => `${SESS_COOKIE}=${await makeSession(aid, secret, epoch)}`;
let checks = 0; const ok = (c, m) => { assert.ok(c, m); checks++; };

account('acc-a', 'Cafe Atlas'); store('cafe-atlas-tanger', 'acc-a');   // one store, account slug 'cafe-atlas'
account('acc-b', 'Boutique Bleue'); store('boutique-bleue', 'acc-b');
sale('pre-a', 'cafe-atlas', 70); sale('b-1', 'boutique-bleue', 40);

ok(await legacyBucketFor(req(await sess('acc-a')), env, 'cafe-atlas-tanger') === 'cafe-atlas', 'the owner of a one-store account reads its pre-split bucket');
ok(await legacyBucketFor(req(await sess('acc-a')), env, 'boutique-bleue') === '', "an owner session never adds its bucket to someone else's store");
ok(await legacyBucketFor(req(await sess('acc-a', 0)), env, 'cafe-atlas-tanger') === '', 'a revoked session (old epoch) adds nothing');
ok(await legacyBucketFor(req(), env, 'cafe-atlas-tanger') === '', 'no session, no union');

/* End to end: store B's paired till, in a browser that also holds A's session. */
const till = `${TILL_COOKIE}=${await tillToken(secret, 'boutique-bleue')}`;
const res = await feed({ request: new Request('https://kiwi.test/api/feed?merchant=boutique-bleue&since=0', { headers: { Cookie: [till, await sess('acc-a')].join('; ') } }), env });
const ids = (await res.json()).sales.map((s) => s.id);
ok(ids.includes('b-1') && !ids.includes('pre-a'), `store B's feed holds only B's money (${ids})`);

/* The account slug claimed by another account is never a bucket of ours. */
account('acc-c', 'Cafe Atlas Two'); store('cafe-atlas', 'acc-c');
ok(await legacyBucketFor(req(await sess('acc-a')), env, 'cafe-atlas-tanger') === '', 'a slug another account owns is not our old bucket');

/* The shared legacy slug of old non-Latin accounts is never a bucket of one. */
account('acc-d', 'مقهى الأطلس', 1, 1); store('maqha-store', 'acc-d');
ok(await legacyBucketFor(req(await sess('acc-d')), env, 'maqha-store') === '', `the shared '${LEGACY_SLUG}' slug is never unioned`);

sqlite.close();
console.log(`sales-scope-test: ${checks} checks green`);
