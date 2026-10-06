#!/usr/bin/env node
// Local actual endpoint + actual engine contract; all identities and DB rows are synthetic.
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath, pathToFileURL } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const endpoint = await import(pathToFileURL(path.join(ROOT, 'functions/api/store.js')));
const { onRequestGet: getStore, onRequestPost: postStore } = endpoint;
const { tillToken, TILL_COOKIE, makeSession, sessionCookie, DEMO_MERCHANTS } = await import(pathToFileURL(path.join(ROOT, 'functions/auth/_lib.js')));
const SHOP = 'fixture-promotions-shop';
const OTHER = 'fixture-promotions-other';
const AUTH_SECRET = 'local-promotions-contract-fixture-only';
const sql = new DatabaseSync(':memory:');
let checks = 0, failures = 0;
function check(label, value) { checks++; if (value) console.log('✓ ' + label); else { failures++; console.log('✗ ' + label); } }
const plain = x => JSON.parse(JSON.stringify(x));
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
try {
  sql.exec(fs.readFileSync(path.join(ROOT, 'schema.sql'), 'utf8'));
  const now = Date.now();
  for (const [merchant, account] of [[SHOP, 'promo-owner'], [OTHER, 'promo-other-owner']]) {
    sql.prepare(`INSERT INTO accounts (id,email,name,business,salt,hash,created_ts,status,session_epoch) VALUES (?,?,'Fixture owner',?,'fixture-salt','fixture-hash',?,'active',0)`).run(account, account + '@example.test', merchant, now);
    sql.prepare(`INSERT INTO merchant_config (merchant,features,type,account_id,name,status,till_epoch,updated_ts) VALUES (?,'{}','boutique',?,'Fixture shop','active',1,?)`).run(merchant, account, now);
  }
  const DB = {
    prepare(statement) {
      let args = [];
      const q = {
        bind(...v) { args = v; return q; },
        first() { return sql.prepare(statement).get(...args) || null; },
        all() { return { results: sql.prepare(statement).all(...args) }; },
        run() {
          const statementHandle = sql.prepare(statement);
          // D1 batch returns SELECT rows as results; do not erase tenant-guard samples in this adapter.
          if (statementHandle.columns().length) return { results: statementHandle.all(...args), success: true };
          const r = statementHandle.run(...args); return { meta: { changes: r.changes }, success: true };
        },
      };
      return q;
    },
    async batch(statements) {
      sql.exec('BEGIN');
      try { const result = []; for (const q of statements) result.push(await q.run()); sql.exec('COMMIT'); return result; }
      catch (error) { sql.exec('ROLLBACK'); throw error; }
    },
  };
  const env = { DB, AUTH_SECRET };
  const till = `${TILL_COOKIE}=${await tillToken(AUTH_SECRET, SHOP, 1)}`;
  const owner = sessionCookie(await makeSession('promo-owner', AUTH_SECRET));
  const otherOwner = sessionCookie(await makeSession('promo-other-owner', AUTH_SECRET));
  const staleTill = `${TILL_COOKIE}=${await tillToken(AUTH_SECRET, SHOP, 0)}`;
  async function request(method, data, { merchant = SHOP, cookie = till, feature = 'promotions', baseRev = 0, raw } = {}) {
    const headers = { ...(cookie ? { Cookie: cookie } : {}), 'Content-Type': 'application/json' };
    const url = 'https://fixture.invalid/api/store?feature=' + feature + '&merchant=' + merchant;
    const req = new Request(url, { method, headers, ...(method === 'POST' ? { body: raw ?? JSON.stringify({ feature, merchant, baseRev, data }) } : {}) });
    const response = await (method === 'POST' ? postStore : getStore)({ request: req, env });
    return { status: response.status, body: await response.json() };
  }
  function engine() {
    const storage = new Map();
    let clock = now, attached, pushes = 0;
    class ClockDate extends Date { constructor(...args) { super(...(args.length ? args : [clock])); } static now() { return clock; } }
    const window = { KiwiCloudDoc: { currentSlug: () => SHOP, attach(options) { attached = options; return { push() { pushes++; } }; } } };
    const localStorage = { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, String(value)) };
    vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'assets/promos.js'), 'utf8'), { window, localStorage, Date: ClockDate, Math, console });
    const api = window.KiwiPromos;
    api.use('fixture-boutique'); api.cloud(() => SHOP);
    return { api, doc: attached, read: () => plain(attached.read()), write: data => attached.write(plain(data)), tick() { clock += 1000; }, pushes: () => pushes, storage };
  }
  const A = engine(), B = engine();
  const item = { id: 'fixture-product', name: 'Article <opaque> منتج', rayon: 'fixture-rayon', price: 100, sizes: { S: 5 } };
  const authoredName = 'TEST KIWI <opaque> تخفيض';
  check('both synthetic merchants require auth, not public demo exemption', !DEMO_MERCHANTS[SHOP] && !DEMO_MERCHANTS[OTHER]);
  check('actual engine cloud feature matches endpoint feature', A.doc.feature === 'promotions' && B.doc.feature === 'promotions');
  check('two engines hold independent local documents', A.storage !== B.storage && A.api.list().length === 0 && B.api.list().length === 0);
  A.api.save({ id: 'fixture-promo', name: authoredName, kind: 'percent', value: 20, scope: { type: 'produits', ids: [item.id] } });
  const initial = A.read();
  check('actual cloud read emits v/promos/deleted, no synthetic alias', equal(Object.keys(initial), ['v', 'promos', 'deleted']));
  check('actual local save asks cloud handle to push', A.pushes() === 1);
  check('actual first engine applies 20%', A.api.priceFor(item).price === 80);
  check('second engine starts without first engine rule', B.api.priceFor(item) === null);
  for (const [label, method, options] of [
    ['unauthed GET', 'GET', { cookie: '' }], ['unauthed POST', 'POST', { cookie: '' }],
    ['wrong-tenant till GET', 'GET', { merchant: OTHER }], ['wrong-tenant till POST', 'POST', { merchant: OTHER }],
    ['wrong-tenant owner POST', 'POST', { merchant: OTHER, cookie: owner }], ['revoked till POST', 'POST', { cookie: staleTill }],
  ]) { const r = await request(method, initial, options); check(label + ' rejects before storing', r.status === 401); }
  let response = await request('GET');
  check('valid tenant GET is authorized while document absent', response.status === 200 && response.body.data === null);
  response = await request('POST', initial);
  check('real engine first save accepted by actual endpoint', response.status === 200 && response.body.rev === 1);
  response = await request('GET');
  check('GET preserves exact normalized engine payload and opaque name', response.status === 200 && equal(response.body.data, initial));
  B.write(response.body.data);
  check('second actual engine applies saved 20% to same product', B.api.priceFor(item)?.price === 80);
  check('GET/write preserves authored name and scope IDs', B.api.get('fixture-promo')?.name === authoredName && equal(B.api.get('fixture-promo')?.scope.ids, [item.id]));
  A.tick(); A.api.save({ ...A.api.get('fixture-promo'), value: 30 });
  const edited = A.read();
  response = await request('POST', edited, { cookie: owner, baseRev: 1 });
  check('authenticated owner edits same document at current revision', response.status === 200 && response.body.rev === 2);
  response = await request('GET'); B.write(response.body.data);
  check('second actual engine applies edited 30%', B.api.priceFor(item)?.price === 70);
  check('edit preserves original creation timestamp and authored name', B.api.get('fixture-promo')?.createdAt === initial.promos[0].createdAt && B.api.get('fixture-promo')?.name === authoredName);
  const stale = await request('POST', initial, { baseRev: 1 });
  check('stale revision cannot overwrite latest edit', stale.status === 409 && stale.body.error === 'stale' && stale.body.rev === 2);
  check('stale response contains exact latest payload for client merge', equal(stale.body.data, edited));
  A.tick(); A.api.setPaused('fixture-promo', true);
  const paused = A.read();
  response = await request('POST', paused, { cookie: owner, baseRev: 2 });
  check('paused rule save accepted at next revision', response.status === 200 && response.body.rev === 3);
  response = await request('GET'); B.write(response.body.data);
  check('second actual engine sees pause and full-price behavior', B.api.get('fixture-promo')?.paused === true && B.api.priceFor(item) === null);
  check('pause keeps discount value rather than deleting rule', B.api.get('fixture-promo')?.value === 30);
  const staleLocal = B.read();
  A.tick(); A.api.remove('fixture-promo');
  const removed = A.read();
  check('actual remove emits tombstone-only nonempty cloud document', removed.promos.length === 0 && removed.deleted.length === 1 && !A.doc.isEmpty(removed));
  response = await request('POST', removed, { cookie: owner, baseRev: 3 });
  check('tombstone-only deletion accepted, not refused-empty', response.status === 200 && response.body.rev === 4);
  response = await request('GET');
  check('GET retains deletion bytes and timestamp', equal(response.body.data, removed));
  const merged = plain(B.doc.merge(staleLocal, response.body.data));
  check('real engine merge keeps later tombstone and no resurrected rule', merged.promos.length === 0 && equal(merged.deleted, removed.deleted));
  B.write(merged);
  check('second engine remains full price after stale-local merge', B.api.get('fixture-promo') === null && B.api.priceFor(item) === null);
  response = await request('POST', B.read(), { baseRev: 4 });
  check('second engine can republish merged tombstones', response.status === 200 && response.body.rev === 5);
  response = await request('GET');
  check('roundtrip does not erase tombstones on second engine save', equal(response.body.data, removed));
  const revive = engine(); revive.tick(); revive.tick(); revive.tick(); revive.tick(); revive.tick();
  revive.write(removed);
  revive.api.save({ ...initial.promos[0], value: 25 });
  const recreated = revive.read();
  check('real recreate lifts its tombstone and updates timestamp', recreated.deleted.length === 0 && recreated.promos[0].updatedAt > removed.deleted[0].at);
  check('real merge respects legitimate later recreation', plain(revive.doc.merge(recreated, removed)).promos.length === 1);
  const storedBefore = sql.prepare('SELECT data,rev FROM store_docs WHERE merchant=? AND feature=?').get(SHOP, 'promotions');
  for (const [label, data, options, status, error] of [
    ['root null', null, {}, 409, 'shape-mismatch'], ['root array', [], {}, 409, 'shape-mismatch'],
    ['missing recognized key', { v: 1, deleted: [] }, {}, 409, 'shape-mismatch'],
    ['wrong feature', initial, { feature: 'not-a-feature' }, 400, 'unknown-feature'],
    ['broken JSON', null, { raw: '{' }, 400, 'bad-json'],
    ['bounded string cap', { list: ['x'.repeat(4001)] }, {}, 413, 'too-large'],
    ['bounded array cap', { list: Array(20001).fill(0) }, {}, 413, 'too-large'],
    ['document byte cap', { list: Array(60).fill('x'.repeat(3500)) }, {}, 413, 'too-large'],
  ]) {
    const r = await request('POST', data, { baseRev: 5, ...options });
    check(label + ' rejection retains existing policy', r.status === status && r.body.error === error);
    check(label + ' never changes stored document/revision', equal(sql.prepare('SELECT data,rev FROM store_docs WHERE merchant=? AND feature=?').get(SHOP, 'promotions'), storedBefore));
  }
  let legacyRev = 0;
  for (const key of ['list', 'rules']) {
    const data = { [key]: [{ id: 'legacy-' + key, label: 'legacy compatibility' }] };
    const r = await request('POST', data, { merchant: OTHER, cookie: otherOwner, baseRev: legacyRev });
    legacyRev++;
    check('legacy ' + key + ' payload remains accepted', r.status === 200 && r.body.rev === legacyRev);
    const read = await request('GET', null, { merchant: OTHER, cookie: otherOwner });
    check('legacy ' + key + ' bytes are not migrated or renamed', equal(read.body.data, data));
  }
  response = await request('POST', recreated, { baseRev: 5 });
  check('legitimate recreation is stored as current first-tenant rule', response.status === 200 && response.body.rev === 6);
  response = await request('POST', recreated, { merchant: OTHER, cookie: otherOwner, baseRev: legacyRev });
  check('foreign-copy guard continues rejecting distinctive other-store payload', response.status === 409 && response.body.error === 'foreign-document');
  const noLiveEnvironment = !('LIVE' in env);
  check('no fixture network binding or production storage exists', noLiveEnvironment && sql.prepare('SELECT count(*) AS n FROM merchant_config').get().n === 2);
  console.log(`${failures ? '✗' : '✓'} promotions endpoint/engine contract: ${checks - failures}/${checks} checks; ${failures} failures; actual source`);
  process.exitCode = failures ? 1 : 0;
} finally { sql.close(); }
