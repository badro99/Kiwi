#!/usr/bin/env node
// GET /api/store revalidation (docs/ops/CPU.md, "Store revalidation").
// A document that reads the same for every allowed caller carries an ETag; a
// poll that sends it back gets a 304 and the data never leaves the database.
// Redacted or partial documents, other stores, other documents and callers who
// may not read stay on a full answer, as before.
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { onRequestGet, onRequestPost } = await import(pathToFileURL(path.join(ROOT, 'functions/api/store.js')).href);
const { storeEtag, storeTag } = await import(pathToFileURL(path.join(ROOT, 'functions/api/_store-etag.js')).href);
const { tillToken } = await import(pathToFileURL(path.join(ROOT, 'functions/auth/_lib.js')).href);

let passed = 0;
const ok = (cond, msg) => { assert.ok(cond, msg); passed++; };

const AUTH_SECRET = 'store-revalidation-secret-0123456789';
const SHOP = 'reval-shop';
const OTHER = 'reval-other';
const now = 1767000000000;
const db = new DatabaseSync(':memory:');
db.exec(`
CREATE TABLE accounts (id TEXT PRIMARY KEY, email TEXT, business TEXT, salt TEXT, hash TEXT, created_ts INTEGER, status TEXT, session_epoch INTEGER NOT NULL DEFAULT 0);
CREATE TABLE merchant_config (merchant TEXT PRIMARY KEY, features TEXT, plan TEXT, type TEXT, account_id TEXT, name TEXT, status TEXT, updated_ts INTEGER, till_epoch INTEGER NOT NULL DEFAULT 0);
CREATE TABLE store_docs (merchant TEXT, feature TEXT, data TEXT, rev INTEGER, updated_ts INTEGER, PRIMARY KEY (merchant, feature));
CREATE TABLE staff_pins (id TEXT PRIMARY KEY, merchant TEXT, pin TEXT, name TEXT, role TEXT, created_ts INTEGER);
CREATE TABLE pair_attempts (ip TEXT PRIMARY KEY, fails INTEGER, first_ts INTEGER, blocked_until INTEGER);
`);
for (const m of [SHOP, OTHER]) db.prepare(`INSERT INTO merchant_config (merchant, features, plan, type, name, status, updated_ts) VALUES (?, '{}', 'pro', 'restaurant', ?, 'active', ?)`).run(m, m, now);
const logo = 'data:image/png;base64,' + Buffer.alloc(3000, 9).toString('base64');
const receipt = { logo, header: 'TEST KIWI', footer: 'Merci' };
db.prepare(`INSERT INTO store_docs VALUES (?, 'receipt', ?, 4, ?)`).run(SHOP, JSON.stringify(receipt), now);
db.prepare(`INSERT INTO store_docs VALUES (?, 'receipt', ?, 4, ?)`).run(OTHER, JSON.stringify(receipt), now);
db.prepare(`INSERT INTO store_docs VALUES (?, 'team', ?, 2, ?)`).run(SHOP, JSON.stringify({ members: [{ id: 'm1', name: 'A', pinCode: '0000' }] }), now);

let dataReturned = 0;
const DB = {
  prepare(q) {
    const st = db.prepare(q);
    return { bind(...p) { return {
      async first() { const r = st.get(...p); if (r && r.data != null && /store_docs/.test(q)) dataReturned++; return r; },
      async all() { return { results: st.all(...p) }; },
      async run() { const r = st.run(...p); return { meta: { changes: r.changes }, success: true }; },
    }; } };
  },
  async batch(stmts) { return Promise.all(stmts.map(s => s.run())); },
};
const env = { AUTH_SECRET, DB };
const till = `kiwi_till=${await tillToken(AUTH_SECRET, SHOP)}`;
const get = (feature, headers = {}, merchant = SHOP) => onRequestGet({
  request: new Request(`https://k/api/store?feature=${feature}&merchant=${merchant}`, { headers: { Cookie: till, ...headers } }), env,
});

/* 1 · a plain document carries a validator and may be kept to revalidate */
let res = await get('receipt');
const tag = res.headers.get('ETag');
ok(res.status === 200 && (await res.json()).data.header === 'TEST KIWI', 'first read is a full answer');
ok(/^W\/"s1\.reval-shop\.receipt\.4\.1767000000000\.\d+"$/.test(tag || ''), 'weak ETag names store, document, rev, time and size: ' + tag);
ok(res.headers.get('Cache-Control') === 'private, no-cache', 'private, revalidated on every use, never shared');

/* 2 · the same validator back: 304, and the data stayed in the database */
dataReturned = 0;
res = await get('receipt', { 'If-None-Match': tag });
ok(res.status === 304 && res.body === null, 'unchanged document answers 304 with no body');
ok(res.headers.get('ETag') === tag && res.headers.get('Cache-Control') === 'private, no-cache', '304 repeats the validator');
ok(dataReturned === 0, 'the 304 never read the document text from the database');
res = await get('receipt', { 'If-None-Match': tag.replace(/^W\//, '') });
ok(res.status === 304, 'an edge that turned the tag strong still matches');

/* 3 · a write moves the validator: the old one gets the new document */
db.prepare(`UPDATE store_docs SET data = ?, rev = 5, updated_ts = ? WHERE merchant = ? AND feature = 'receipt'`).run(JSON.stringify({ ...receipt, footer: 'Shukran' }), now + 1, SHOP);
res = await get('receipt', { 'If-None-Match': tag });
ok(res.status === 200 && (await res.json()).data.footer === 'Shukran', 'after a write the old validator gets the new document');
ok(res.headers.get('ETag') !== tag, 'and a new validator');
/* A writer that kept rev and time but changed the text still moves the size. */
const tag5 = res.headers.get('ETag');
db.prepare(`UPDATE store_docs SET data = ? WHERE merchant = ? AND feature = 'receipt'`).run(JSON.stringify({ ...receipt, footer: 'Shukran!' }), SHOP);
res = await get('receipt', { 'If-None-Match': tag5 });
ok(res.status === 200 && (await res.json()).data.footer === 'Shukran!', 'same rev and time, different size: full answer');

/* 4 · a validator for another store or document never matches */
const current = (await get('receipt')).headers.get('ETag');
ok((await get('receipt', { 'If-None-Match': current })).status === 304, 'the current validator matches');
res = await get('receipt', { 'If-None-Match': current.replace('.reval-shop.', '.reval-other.') });
ok(res.status === 200, 'the same facts under another store\'s name get a full answer');
res = await get('receipt', { 'If-None-Match': tag5.replace('.receipt.', '.business.') });
ok(res.status === 200, 'another document\'s validator is not accepted');
res = await get('receipt', { 'If-None-Match': '*' });
ok(res.status === 200, 'a wildcard is not a validator');
res = await get('receipt', { 'If-None-Match': `${tag5}, ${tag5}` });
ok(res.status === 200, 'a list of validators gets a full answer');

/* 5 · documents that depend on who asks never get a validator */
res = await get('team');
ok(res.status === 200 && !res.headers.get('ETag') && res.headers.get('Cache-Control') === 'no-store', 'redacted team roster: no ETag, no-store');
ok(!JSON.stringify((await res.json()).data).includes('pinCode'), 'and still redacted for the till');
res = await get('team', { 'If-None-Match': 'W/"s1.reval-shop.team.2.1767000000000.10"' });
ok(res.status === 200, 'a forged team validator still gets the full (redacted) answer');

/* 6 · authorisation comes first: a valid validator does not open the door */
const anon = await onRequestGet({ request: new Request(`https://k/api/store?feature=receipt&merchant=${SHOP}`, { headers: { 'If-None-Match': tag5 } }), env });
ok(anon.status === 401, 'no credentials, valid validator: still 401');

/* 7 · the tag helpers refuse what they cannot represent */
ok(storeEtag('Bad Slug', 'receipt', { rev: 1, updated_ts: 1, bytes: 1 }) === null, 'unexpected slug: no validator');
ok(storeEtag(SHOP, 'receipt', { rev: -1, updated_ts: 1, bytes: 1 }) === null, 'negative rev: no validator');
ok(storeTag('W/"s1.a.b.1.2.3"').bytes === 3 && storeTag('garbage') === null, 'parser round trip');

/* 8 · writes are untouched: POST still answers with no-store */
const post = await onRequestPost({ request: new Request('https://k/api/store', { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: till }, body: JSON.stringify({ merchant: SHOP, feature: 'fidelity', data: { model: 'visit' } }) }), env });
ok(post.headers.get('Cache-Control') === 'no-store' && !post.headers.get('ETag'), 'POST responses stay no-store');

console.log(`store-revalidation: ${passed} checks passed`);
