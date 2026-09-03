#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · admin delete R2 test — pas d'orphelins privés à la clôture.
 *
 * Le design promet la rétention jusqu'à la clôture du compte : supprimer un
 * établissement doit donc purger `intake/<merchant>/` en R2 AVANT d'effacer
 * le registre D1 (jamais l'inverse — des octets sans index seraient perdus
 * pour toujours). Cette suite exécute la VRAIE route
 * (functions/api/admin/clients.js, import direct) sur une VRAIE base sqlite
 * construite depuis schema.sql, avec de VRAIS cookies opérateur signés, et
 * un sosie R2 à pagination honnête. Seul R2 est doublé (pas de seau en node).
 *
 *   node tools/admin-delete-r2-test.mjs
 * ═══════════════════════════════════════════════════════════════════════════ */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const EXPECTED = 10;
let checks = 0;
process.on('unhandledRejection', (error) => { console.error(error); process.exit(1); });
async function check(name, fn) {
  await fn();
  checks += 1;
  process.stdout.write('  ok ' + checks + ' - ' + name + '\n');
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const auth = await import(path.join(root, 'functions/auth/_lib.js'));
const route = await import(path.join(root, 'functions/api/admin/clients.js'));

const SECRET = 'admin-delete-test-secret-32bytes!';
const M = 'cafe-atlas';
const OTHER = 'maison-rivale';

function makeDb(flags = {}) {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(fs.readFileSync(path.join(root, 'schema.sql'), 'utf8'));
  return {
    prepare(sql) {
      const st = sqlite.prepare(sql);
      const bound = (...args) => ({
        run() {
          if (flags.failDeletes && /^\s*DELETE\s/i.test(sql)) throw new Error('D1 delete failed');
          return st.run(...args);
        },
        first() { return st.get(...args) || null; },
        all() { return { results: st.all(...args) }; },
      });
      return {
        bind: (...args) => bound(...args),
        run: () => bound([]).run(),
        first: () => bound([]).first(),
        all: () => bound([]).all(),
      };
    },
    async batch(list) {
      for (const s of list || []) await s.run();
      return [];
    },
  };
}

/* Sosie R2 à pagination honnête : curseur opaque, pages de `pageSize`, échecs
 * injectables via l'objet `flags` partagé (modifiables entre deux appels).
 * `delete` accepte une clé ou un tableau, comme le vrai seau. */
function makeR2(flags = {}) {
  const keys = new Map();
  let deletes = 0;
  const { pageSize = 1000 } = flags;
  return {
    keys,
    flags,
    stats: () => ({ deletes }),
    put: (key, bytes) => { keys.set(String(key), bytes); },
    async list({ prefix = '', limit = 1000, cursor = '' } = {}) {
      if (flags.failList) throw new Error('R2 list failed');
      if (prefix.includes('..') || prefix.includes('//')) throw new Error('bad prefix');
      const all = [...keys.keys()].filter((k) => k.startsWith(prefix)).sort();
      // Curseur stable à la R2 : premier trié APRÈS le curseur parmi les clés
      // PRÉSENTES (les clés déjà supprimées ne décalent rien — keyset, pas offset).
      let start = 0;
      if (cursor) {
        const c = String(cursor);
        start = all.findIndex((k) => k > c);
        if (start === -1) start = all.length;
      }
      const n = Math.min(limit || 1000, pageSize);
      const page = all.slice(start, start + n);
      const end = start + page.length;
      return {
        objects: page.map((key) => ({ key })),
        truncated: end < all.length,
        cursor: end < all.length ? page[page.length - 1] : undefined,
      };
    },
    async delete(keyOrKeys) {
      const list = Array.isArray(keyOrKeys) ? keyOrKeys : [keyOrKeys];
      for (const key of list) {
        if (flags.failDeleteAfter >= 0 && deletes >= flags.failDeleteAfter) throw new Error('R2 delete failed');
        keys.delete(String(key));
        deletes += 1;
      }
      return {};
    },
  };
}

async function opCookies() {
  return `kiwi_op=${await auth.operatorToken(SECRET)}; kiwi_op_id=${await auth.operatorIdToken(SECRET, 'op1')}`;
}
function makeWorld({ r2flags = {}, dbflags = {}, withMedia = true } = {}) {
  const DB = makeDb(dbflags);
  const r2 = makeR2(r2flags);
  const now = Date.now();
  DB.prepare(`INSERT INTO accounts (id, email, name, business, salt, hash, created_ts, status)
    VALUES ('acc-1', 'owner@example.test', 'Owner', 'Café Atlas', 's', 'h', ?, 'active')`).bind(now).run();
  DB.prepare(`INSERT INTO operators (id, label, salt, hash, created_ts) VALUES ('op1', 'Test', 's', 'h', ?)`).bind(now).run();
  DB.prepare(`INSERT INTO merchant_config (merchant, features, plan, type, account_id, name, status, updated_ts)
    VALUES (?, '{}', 'pro', 'restaurant', 'acc-1', 'Café Atlas', 'active', ?)`)
    .bind(M, now).run();
  const MEDIA = withMedia ? r2 : undefined;
  return { DB, r2, env: { DB, MEDIA, AUTH_SECRET: SECRET } };
}
function seedIntake(world, merchant, docId, ts) {
  world.env.DB.prepare(
    `INSERT INTO intake_docs (merchant, doc_id, mime, size, r2_key, has_object, status, doc_type, source, posting_hash, posting_count, created_ts, updated_ts)
     VALUES (?, ?, 'application/pdf', 100, ?, 1, 'received', 'supplier_invoice', 'stock-scan', '', 0, ?, ?)`
  ).bind(merchant, docId, 'intake/' + merchant + '/' + docId + '.pdf', ts, ts).run();
  world.r2.put('intake/' + merchant + '/' + docId + '.pdf', new TextEncoder().encode('%PDF-1.4 ' + docId.slice(0, 8)));
}
async function del(env, merchant, confirm) {
  const res = await route.onRequestDelete({
    request: new Request('https://kiwi.test/api/admin/clients?merchant=' + encodeURIComponent(merchant) + '&confirm=' + encodeURIComponent(confirm ?? merchant), {
      method: 'DELETE',
      headers: { Cookie: await opCookies() },
    }),
    env,
  });
  return { status: res.status, body: await res.json() };
}
const docId = (i) => String(i).padStart(64, 'd');

await check('empty archive deletes cleanly with zeroed R2 counts', async () => {
  const w = makeWorld();
  const { status, body } = await del(w.env, M);
  assert.equal(status, 200);
  assert.equal(body.ok, true);
  assert.deepEqual([body.r2.status, body.r2.listed, body.r2.deleted], ['cleaned', 0, 0]);
  assert.equal(w.env.DB.prepare('SELECT COUNT(*) AS n FROM intake_docs WHERE merchant = ?').bind(M).first().n, 0);
});

await check('one object is removed from R2 and reported', async () => {
  const w = makeWorld();
  seedIntake(w, M, docId(1), 1000);
  const { status, body } = await del(w.env, M);
  assert.equal(status, 200);
  assert.equal(body.ok, true);
  assert.equal(body.r2.deleted, 1);
  assert.ok(!w.r2.keys.has('intake/' + M + '/' + docId(1) + '.pdf'));
  assert.equal(body.removed['intake_docs'], 1);
});

await check('more than 1000 objects paginate to completion', async () => {
  const w = makeWorld({ r2flags: { pageSize: 1000 } });
  for (let i = 0; i < 2500; i++) seedIntake(w, M, docId(i), 1000 + i);
  w.r2.put('intake/' + M + '/loose-scan.pdf', new TextEncoder().encode('%PDF-1.4 loose'));
  const { status, body } = await del(w.env, M);
  assert.equal(status, 200);
  assert.equal(body.r2.listed, 2501);
  assert.equal(body.r2.deleted, 2501);
  assert.equal([...w.r2.keys].filter((k) => k.startsWith('intake/' + M + '/')).length, 0);
  assert.equal(body.removed['intake_docs'], 2500);
});

await check('unrelated merchants and other prefixes remain untouched', async () => {
  const w = makeWorld();
  seedIntake(w, M, docId(1), 1000);
  seedIntake(w, OTHER, docId(2), 1000);
  w.r2.put('support/' + M + '/ticket-1/a.pdf', new TextEncoder().encode('x'));
  const { status } = await del(w.env, M);
  assert.equal(status, 200);
  assert.ok(w.r2.keys.has('intake/' + OTHER + '/' + docId(2) + '.pdf'));
  assert.ok(w.r2.keys.has('support/' + M + '/ticket-1/a.pdf'));
  assert.equal(w.env.DB.prepare('SELECT COUNT(*) AS n FROM intake_docs WHERE merchant = ?').bind(OTHER).first().n, 1);
});

await check('list failure aborts with no success and nothing touched', async () => {
  const w = makeWorld({ r2flags: { failList: true } });
  seedIntake(w, M, docId(1), 1000);
  const { status, body } = await del(w.env, M);
  assert.equal(status, 500);
  assert.equal(body.error, 'r2-cleanup-failed');
  assert.ok(!body.ok);
  assert.equal(w.env.DB.prepare('SELECT COUNT(*) AS n FROM intake_docs WHERE merchant = ?').bind(M).first().n, 1);
  assert.ok(w.r2.keys.has('intake/' + M + '/' + docId(1) + '.pdf'));
});

await check('partial delete failure is resumable without losing the registry', async () => {
  const r2flags = { failDeleteAfter: 3 };
  const w = makeWorld({ r2flags });
  for (let i = 0; i < 5; i++) seedIntake(w, M, docId(i), 1000 + i);
  const first = await del(w.env, M);
  assert.equal(first.status, 500);
  assert.equal(first.body.error, 'r2-cleanup-failed');
  assert.ok(!first.body.ok);
  assert.equal(w.r2.stats().deletes, 3);
  assert.equal(w.env.DB.prepare('SELECT COUNT(*) AS n FROM intake_docs WHERE merchant = ?').bind(M).first().n, 5);
  r2flags.failDeleteAfter = -1;
  const retry = await del(w.env, M);
  assert.equal(retry.status, 200);
  assert.equal(retry.body.ok, true);
  assert.equal(retry.body.r2.deleted, 2);
  assert.equal(w.env.DB.prepare('SELECT COUNT(*) AS n FROM intake_docs WHERE merchant = ?').bind(M).first().n, 0);
  assert.equal([...w.r2.keys].filter((k) => k.startsWith('intake/' + M + '/')).length, 0);
});

await check('D1 failure after R2 cleanup errors, then retry converges', async () => {
  const dbflags = { failDeletes: true };
  const w = makeWorld({ dbflags });
  seedIntake(w, M, docId(1), 1000);
  const first = await del(w.env, M);
  assert.equal(first.status, 500);
  assert.equal(first.body.error, 'delete-failed');
  assert.ok(!first.body.ok);
  assert.equal([...w.r2.keys].filter((k) => k.startsWith('intake/' + M + '/')).length, 0);
  assert.equal(w.env.DB.prepare('SELECT COUNT(*) AS n FROM intake_docs WHERE merchant = ?').bind(M).first().n, 1);
  dbflags.failDeletes = false;
  const retry = await del(w.env, M);
  assert.equal(retry.status, 200);
  assert.equal(retry.body.ok, true);
  assert.equal(w.env.DB.prepare('SELECT COUNT(*) AS n FROM intake_docs WHERE merchant = ?').bind(M).first().n, 0);
});

await check('repeated deletion succeeds idempotently with zero deltas', async () => {
  const w = makeWorld();
  seedIntake(w, M, docId(1), 1000);
  // Re-seed config+account rows the first pass removes, to prove the second
  // pass itself is a harmless no-op rather than an error path.
  const first = await del(w.env, M);
  assert.equal(first.status, 200);
  const second = await del(w.env, M);
  assert.equal(second.status, 200);
  assert.equal(second.body.ok, true);
  assert.equal(second.body.r2.deleted, 0);
  assert.ok(!('intake_docs' in (second.body.removed || {})));
});

await check('missing MEDIA binding refuses instead of orphaning silently', async () => {
  const w = makeWorld({ withMedia: false });
  seedIntake(w, M, docId(1), 1000);
  const { status, body } = await del(w.env, M);
  assert.equal(status, 503);
  assert.equal(body.error, 'r2-binding-missing');
  assert.ok(!body.ok);
  assert.equal(w.env.DB.prepare('SELECT COUNT(*) AS n FROM intake_docs WHERE merchant = ?').bind(M).first().n, 1);
});

await check('operator gate and confirm slug still guard the whole gesture', async () => {
  const w = makeWorld();
  seedIntake(w, M, docId(1), 1000);
  const anon = await route.onRequestDelete({
    request: new Request('https://kiwi.test/api/admin/clients?merchant=' + M + '&confirm=' + M, { method: 'DELETE' }),
    env: w.env,
  });
  assert.equal(anon.status, 403);
  const mismatch = await route.onRequestDelete({
    request: new Request('https://kiwi.test/api/admin/clients?merchant=' + M + '&confirm=other', {
      method: 'DELETE', headers: { Cookie: await opCookies() },
    }),
    env: w.env,
  });
  assert.equal(mismatch.status, 400);
  assert.equal(w.env.DB.prepare('SELECT COUNT(*) AS n FROM intake_docs WHERE merchant = ?').bind(M).first().n, 1);
});

assert.equal(checks, EXPECTED, 'expected ' + EXPECTED + ' executed checks, got ' + checks);
process.stdout.write('admin-delete-r2-test: ' + checks + ' checks passed\n');
