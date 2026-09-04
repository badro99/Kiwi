#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · admin delete R2 test — pas d'orphelins privés à la clôture.
 *
 * Le design promet la rétention jusqu'à la clôture du compte : supprimer un
 * établissement doit donc purger les trois familles R2 (`intake/<merchant>/`,
 * `<merchant>/`, `support/<merchant>/`) AVANT d'effacer les registres D1
 * (jamais l'inverse — des octets sans index seraient perdus pour toujours).
 * Cette suite exécute la VRAIE route
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

const EXPECTED = 19;
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
        first() {
          if (flags.failCount && /COUNT\(\*\) AS n FROM intake_docs/.test(sql)) throw new Error('D1 count failed');
          if (flags.failSupportCount && /COUNT\(\*\) AS n FROM support_attachments/.test(sql)) throw new Error('D1 support count failed');
          return st.get(...args) || null;
        },
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

/* Sosie R2 à pagination honnête : pages de `pageSize`, curseur keyset stable,
 * échecs injectables via l'objet `flags` partagé (modifiables entre appels).
 * `delete` EXIGE un tableau (la route ne fait que du bulk ≤ 1000) et modélise
 * trois pannes : 'throw' (rien d'appliqué), 'partial' (moitié appliquée puis
 * erreur — le pire cas), 'noop' (succès mensonger, pour le garde anti-bourbier). */
function makeR2(flags = {}) {
  const keys = new Map();
  let deletes = 0;
  let bulkCalls = 0;
  const { pageSize = 1000 } = flags;
  return {
    keys,
    flags,
    stats: () => ({ deletes, bulkCalls }),
    put: (key, bytes) => { keys.set(String(key), bytes); },
    async list({ prefix = '', limit = 1000, cursor = '' } = {}) {
      if (flags.failList) throw new Error('R2 list failed');
      if (prefix.includes('..') || prefix.includes('//')) throw new Error('bad prefix');
      const all = [...keys.keys()].filter((k) => k.startsWith(prefix)).sort();
      let start = 0;
      if (cursor) {
        const c = String(cursor);
        start = all.findIndex((k) => k > c);
        if (start === -1) start = all.length;
      }
      const n = Math.min(limit || 1000, pageSize);
      const page = all.slice(start, start + n);
      const end = start + page.length;
      const objects = page.map((key) => ({ key }));
      if (flags.injectForeign && !flags._foreignSpent) {
        flags._foreignSpent = true;
        objects.push({ key: 'support/voisin/x.pdf' });
      }
      return {
        objects,
        truncated: end < all.length,
        cursor: end < all.length ? page[page.length - 1] : undefined,
      };
    },
    async delete(keyOrKeys) {
      if (!Array.isArray(keyOrKeys)) throw new Error('R2 double: bulk array required');
      bulkCalls += 1;
      if (flags.failDelete === 'throw') throw new Error('R2 delete failed');
      if (flags.failDelete === 'noop') return {};
      const list = keyOrKeys;
      if (flags.failDelete === 'partial') {
        const half = list.slice(0, Math.max(1, Math.floor(list.length / 2)));
        for (const key of half) { keys.delete(String(key)); deletes += 1; }
        throw new Error('R2 delete failed mid-page');
      }
      for (const key of list) {
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
function seedSupport(world, merchant, id, ts = 1000) {
  const ticket = 'ticket-' + merchant + '-' + id;
  const key = 'support/' + merchant + '/' + ticket + '/' + id + '.pdf';
  world.env.DB.prepare(
    `INSERT INTO support_tickets (id, reference, merchant, store_type, category, priority, status, channel, contact, summary, diagnostics, assignee, created_ts, updated_ts)
     VALUES (?, ?, ?, 'shop', 'other', 'normal', 'open', 'web', '', 'test', '{}', '', ?, ?)`
  ).bind(ticket, 'REF-' + merchant + '-' + id, merchant, ts, ts).run();
  world.env.DB.prepare(
    `INSERT INTO support_attachments (id, ticket_id, merchant, object_key, name, mime, size, created_ts)
     VALUES (?, ?, ?, ?, 'piece.pdf', 'application/pdf', 10, ?)`
  ).bind('attachment-' + merchant + '-' + id, ticket, merchant, key, ts).run();
  world.r2.put(key, new TextEncoder().encode('%PDF support'));
  return key;
}
function seedPublishedMedia(world, merchant, table, key) {
  const url = '/api/media/' + key;
  world.r2.put(key, new TextEncoder().encode('image'));
  if (table === 'menus') {
    world.env.DB.prepare("INSERT INTO menus (merchant, name, type, data, updated_ts) VALUES (?, 'Test', 'boutique', ?, 1000)")
      .bind(merchant, JSON.stringify({ products: [{ photo: url }] })).run();
  } else if (table === 'catalogs') {
    world.env.DB.prepare("INSERT INTO catalogs (merchant, data, rev, updated_ts) VALUES (?, ?, 1, 1000)")
      .bind(merchant, JSON.stringify({ products: [{ photo: url }] })).run();
  } else if (table === 'store_docs') {
    world.env.DB.prepare("INSERT INTO store_docs (merchant, feature, data, rev, updated_ts) VALUES (?, 'rooms', ?, 1, 1000)")
      .bind(merchant, JSON.stringify({ roomTypes: [{ photos: [{ url }] }] })).run();
  }
  return key;
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

await check('catalog, hotel and support objects are purged with their D1 registries', async () => {
  const w = makeWorld();
  const menuKey = seedPublishedMedia(w, M, 'menus', M + '/menu-photo.jpg');
  const catalogKey = seedPublishedMedia(w, M, 'catalogs', M + '/product-photo.jpg');
  const hotelKey = seedPublishedMedia(w, M, 'store_docs', M + '/hotel-room/room-photo.jpg');
  const supportKey = seedSupport(w, M, '1');
  const { status, body } = await del(w.env, M);
  assert.equal(status, 200);
  assert.deepEqual(body.r2.prefixes, ['intake/' + M + '/', M + '/', 'support/' + M + '/']);
  assert.equal(body.r2.deleted, 4);
  for (const key of [menuKey, catalogKey, hotelKey, supportKey]) assert.ok(!w.r2.keys.has(key), key + ' purged');
  assert.equal(w.env.DB.prepare('SELECT COUNT(*) AS n FROM support_attachments WHERE merchant = ?').bind(M).first().n, 0);
  assert.equal(w.env.DB.prepare('SELECT COUNT(*) AS n FROM menus WHERE merchant = ?').bind(M).first().n, 0);
  assert.equal(w.env.DB.prepare('SELECT COUNT(*) AS n FROM catalogs WHERE merchant = ?').bind(M).first().n, 0);
  assert.equal(w.env.DB.prepare('SELECT COUNT(*) AS n FROM store_docs WHERE merchant = ?').bind(M).first().n, 0);
});

await check('more than 1000 objects paginate to completion', async () => {
  const w = makeWorld({ r2flags: { pageSize: 1000 } });
  for (let i = 0; i < 2500; i++) seedIntake(w, M, docId(i), 1000 + i);
  w.r2.put('intake/' + M + '/loose-scan.pdf', new TextEncoder().encode('%PDF-1.4 loose'));
  const { status, body } = await del(w.env, M);
  assert.equal(status, 200);
  assert.equal(body.r2.listed, 2501);
  assert.equal(body.r2.deleted, 2501);
  assert.equal([...w.r2.keys.keys()].filter((k) => k.startsWith('intake/' + M + '/')).length, 0);
  assert.equal(body.removed['intake_docs'], 2500);
});

await check('unrelated merchants and unknown prefixes remain untouched', async () => {
  const w = makeWorld();
  seedIntake(w, M, docId(1), 1000);
  seedIntake(w, OTHER, docId(2), 1000);
  const otherSupport = seedSupport(w, OTHER, '1');
  w.r2.put('legacy/' + M + '/unowned.bin', new TextEncoder().encode('x'));
  const { status } = await del(w.env, M);
  assert.equal(status, 200);
  assert.ok(w.r2.keys.has('intake/' + OTHER + '/' + docId(2) + '.pdf'));
  assert.ok(w.r2.keys.has(otherSupport));
  assert.ok(w.r2.keys.has('legacy/' + M + '/unowned.bin'));
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

await check('partial bulk failure is resumable without losing the registry', async () => {
  const r2flags = { failDelete: 'partial' };
  const w = makeWorld({ r2flags });
  for (let i = 0; i < 5; i++) seedIntake(w, M, docId(i), 1000 + i);
  const first = await del(w.env, M);
  assert.equal(first.status, 500);
  assert.equal(first.body.error, 'r2-cleanup-failed');
  assert.ok(!first.body.ok);
  const remaining = [...w.r2.keys.keys()].filter((k) => k.startsWith('intake/' + M + '/')).length;
  assert.ok(remaining > 0 && remaining < 5, 'page partiellement appliquée, reste visible');
  assert.equal(w.env.DB.prepare('SELECT COUNT(*) AS n FROM intake_docs WHERE merchant = ?').bind(M).first().n, 5);
  delete r2flags.failDelete;
  const retry = await del(w.env, M);
  assert.equal(retry.status, 200);
  assert.equal(retry.body.ok, true);
  assert.equal(retry.body.r2.deleted, remaining);
  assert.equal(w.env.DB.prepare('SELECT COUNT(*) AS n FROM intake_docs WHERE merchant = ?').bind(M).first().n, 0);
  assert.equal([...w.r2.keys.keys()].filter((k) => k.startsWith('intake/' + M + '/')).length, 0);
});

await check('exactly 1000 objects drain in one bulk page', async () => {
  const w = makeWorld({ r2flags: { pageSize: 1000 } });
  for (let i = 0; i < 1000; i++) seedIntake(w, M, docId(i), 1000 + i);
  const { status, body } = await del(w.env, M);
  assert.equal(status, 200);
  assert.equal(body.r2.listed, 1000);
  assert.equal(body.r2.deleted, 1000);
  assert.equal(w.r2.stats().bulkCalls, 1, 'single bulk call for a single full page');
  assert.equal([...w.r2.keys.keys()].filter((k) => k.startsWith('intake/' + M + '/')).length, 0);
});

await check('lying bucket that never deletes trips the stall guard, registry intact', async () => {
  const w = makeWorld({ r2flags: { failDelete: 'noop' } });
  for (let i = 0; i < 3; i++) seedIntake(w, M, docId(i), 1000 + i);
  const { status, body } = await del(w.env, M);
  assert.equal(status, 500);
  assert.equal(body.error, 'r2-cleanup-failed');
  assert.ok(String(body.detail || '').includes('r2-delete-stalled'), 'stall diagnosed, not masked');
  assert.ok(!body.ok);
  assert.equal(w.env.DB.prepare('SELECT COUNT(*) AS n FROM intake_docs WHERE merchant = ?').bind(M).first().n, 3);
});

await check('foreign key in a listing aborts before any delete of the page', async () => {
  const r2flags = { injectForeign: true };
  const w = makeWorld({ r2flags });
  seedIntake(w, M, docId(1), 1000);
  const { status, body } = await del(w.env, M);
  assert.equal(status, 500);
  assert.equal(body.error, 'r2-scope-violation');
  assert.ok(!body.ok);
  assert.ok(w.r2.keys.has('intake/' + M + '/' + docId(1) + '.pdf'), 'nothing deleted once scope breaks');
});

await check('D1 failure after R2 cleanup errors, then retry converges', async () => {
  const dbflags = { failDeletes: true };
  const w = makeWorld({ dbflags });
  seedIntake(w, M, docId(1), 1000);
  const first = await del(w.env, M);
  assert.equal(first.status, 500);
  assert.equal(first.body.error, 'delete-failed');
  assert.ok(!first.body.ok);
  assert.equal([...w.r2.keys.keys()].filter((k) => k.startsWith('intake/' + M + '/')).length, 0);
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

await check('missing MEDIA binding: zero rows proceed explicitly, rows present refuse', async () => {
  const w = makeWorld({ withMedia: false });
  const okEmpty = await del(w.env, M);
  assert.equal(okEmpty.status, 200);
  assert.equal(okEmpty.body.ok, true);
  assert.equal(okEmpty.body.r2.status, 'binding-missing-no-rows');
  seedIntake(w, M, docId(1), 1000);
  const { status, body } = await del(w.env, M);
  assert.equal(status, 503);
  assert.equal(body.error, 'r2-binding-missing');
  assert.ok(!body.ok);
  assert.equal(w.env.DB.prepare('SELECT COUNT(*) AS n FROM intake_docs WHERE merchant = ?').bind(M).first().n, 1);
});

await check('missing MEDIA refuses support attachments without touching D1', async () => {
  const w = makeWorld({ withMedia: false });
  seedSupport(w, M, '1');
  const { status, body } = await del(w.env, M);
  assert.equal(status, 503);
  assert.equal(body.error, 'r2-binding-missing');
  assert.equal(body.pending.support_attachments, 1);
  assert.equal(w.env.DB.prepare('SELECT COUNT(*) AS n FROM support_attachments WHERE merchant = ?').bind(M).first().n, 1);
});

await check('missing MEDIA refuses published menu, catalog and hotel media references', async () => {
  for (const [table, key] of [
    ['menus', M + '/menu-photo.jpg'],
    ['catalogs', M + '/product-photo.jpg'],
    ['store_docs', M + '/hotel-room/room-photo.jpg'],
  ]) {
    const w = makeWorld({ withMedia: false });
    seedPublishedMedia(w, M, table, key);
    const { status, body } = await del(w.env, M);
    assert.equal(status, 503, table);
    assert.equal(body.error, 'r2-binding-missing', table);
    assert.equal(body.pending[table], 1, table);
    assert.equal(w.env.DB.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE merchant = ?`).bind(M).first().n, 1, table);
  }
});

await check('missing MEDIA registry read failure is 503 with zero deletion', async () => {
  const dbflags = { failSupportCount: true };
  const w = makeWorld({ withMedia: false, dbflags });
  seedSupport(w, M, '1');
  const { status, body } = await del(w.env, M);
  assert.equal(status, 503);
  assert.equal(body.error, 'db-unavailable');
  dbflags.failSupportCount = false;
  assert.equal(w.env.DB.prepare('SELECT COUNT(*) AS n FROM support_attachments WHERE merchant = ?').bind(M).first().n, 1);
});

await check('missing MEDIA plus missing table proceeds: positively proven absent', async () => {
  const w = makeWorld({ withMedia: false });
  w.env.DB.prepare('DROP TABLE intake_docs').run();
  const { status, body } = await del(w.env, M);
  assert.equal(status, 200);
  assert.equal(body.ok, true);
  assert.equal(body.r2.status, 'binding-missing-no-rows');
});

await check('count-query failure without MEDIA is 503 with zero deletion', async () => {
  const dbflags = { failCount: true };
  const w = makeWorld({ withMedia: false, dbflags });
  seedIntake(w, M, docId(1), 1000);
  const { status, body } = await del(w.env, M);
  assert.equal(status, 503);
  assert.equal(body.error, 'db-unavailable');
  assert.ok(!body.ok);
  dbflags.failCount = false;
  assert.equal(w.env.DB.prepare('SELECT COUNT(*) AS n FROM intake_docs WHERE merchant = ?').bind(M).first().n, 1);
  assert.ok(w.r2.keys.has('intake/' + M + '/' + docId(1) + '.pdf'));
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
