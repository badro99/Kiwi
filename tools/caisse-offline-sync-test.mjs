#!/usr/bin/env node
/* tools/caisse-offline-sync-test.mjs — verify caisse synchronizer offline & retry fixes.
 *
 * Checks:
 * 1. functions/_middleware.js lets POST /api/sale, /api/sale/refund, /api/sale/cancel through
 *    to handlers without requiring kiwi_sess session, while GET stays gated.
 * 2. An unauthenticated POST /api/sale reaches the handler and is rejected with 403 forbidden-merchant,
 *    proving security is preserved.
 * 3. A paired till (holding kiwi_till cookie) posting to /api/sale succeeds into D1.
 * 4. assets/offline-db.js claim({ force: true }) reclaims 'sending' rows even within active lease.
 * 5. assets/offline-db.js stats() reflects lastStatus and lastError.
 * 6. assets/live-link.js flush(true) returns a Promise, clears stuck flushing lock, and queueStatus() has lastStatus/lastError.
 * 7. assets/caisse-pwa.js provides visual feedback during sync and toasts on outcome.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { onRequest as gate } from '../functions/_middleware.js';
import { onRequestPost as salePost } from '../functions/api/sale.js';
import { tillToken, TILL_COOKIE } from '../functions/auth/_lib.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

let passed = 0;
const failed = [];
function ok(label, condition) {
  if (condition) {
    passed++;
    console.log(`  ✓ ${label}`);
  } else {
    failed.push(label);
    console.error(`  ✗ ${label}`);
  }
}

console.log('caisse-offline-sync-test');

const AUTH_SECRET = 'test-auth-secret-for-caisse-sync-12345678';
const merchant = 'pasta-corner';

const sqlite = new DatabaseSync(':memory:');
sqlite.exec(read('schema.sql'));
const DB = {
  prepare(sql) {
    let args = [];
    const st = {
      bind(...values) { args = values; return st; },
      async run() { const r = sqlite.prepare(sql).run(...args); return { success: true, meta: { changes: r.changes } }; },
      async first() { return sqlite.prepare(sql).get(...args) || null; },
      async all() { return { results: sqlite.prepare(sql).all(...args) }; },
    };
    return st;
  },
};

const env = { DB, AUTH_SECRET, SITE_PASSWORD: 'test-site-password' };

// Seed merchant account and pairing epoch
sqlite.prepare('INSERT INTO accounts (id, email, name, business, salt, hash, created_ts) VALUES (?,?,?,?,?,?,?)')
  .run('acc-pasta', 'owner@pastacorner.ma', 'Pasta Owner', 'Pasta Corner', 's', 'h', Date.now());
sqlite.prepare('INSERT INTO merchant_config (merchant, account_id, name, type, status, features, updated_ts) VALUES (?,?,?,?,?,?,?)')
  .run(merchant, 'acc-pasta', 'Pasta Corner', 'restaurant', 'active', '{}', Date.now());

// ── 1. Middleware Gate for Financial Endpoints ──────────────────────────────
{
  let nextCalled = false;
  const reqPostSale = new Request('https://kiwi-os.com/api/sale', { method: 'POST', body: '{}' });
  const resPostSale = await gate({ request: reqPostSale, env, next: () => { nextCalled = true; return new Response('next'); } });
  ok('middleware lets POST /api/sale pass through to handler', nextCalled && resPostSale.status === 200);

  nextCalled = false;
  const reqPostRefund = new Request('https://kiwi-os.com/api/sale/refund', { method: 'POST', body: '{}' });
  const resPostRefund = await gate({ request: reqPostRefund, env, next: () => { nextCalled = true; return new Response('next'); } });
  ok('middleware lets POST /api/sale/refund pass through to handler', nextCalled && resPostRefund.status === 200);

  nextCalled = false;
  const reqPostCancel = new Request('https://kiwi-os.com/api/sale/cancel', { method: 'POST', body: '{}' });
  const resPostCancel = await gate({ request: reqPostCancel, env, next: () => { nextCalled = true; return new Response('next'); } });
  ok('middleware lets POST /api/sale/cancel pass through to handler', nextCalled && resPostCancel.status === 200);

  nextCalled = false;
  const reqGetCancel = new Request('https://kiwi-os.com/api/sale/cancel?merchant=pasta-corner', { method: 'GET' });
  const resGetCancel = await gate({ request: reqGetCancel, env, next: () => { nextCalled = true; return new Response('next'); } });
  ok('middleware blocks unauthenticated GET /api/sale/cancel with 401', !nextCalled && resGetCancel.status === 401);
}

// ── 2. Endpoint Self-Authentication & Entitlement ───────────────────────────
{
  // Unauthenticated caller calling /api/sale directly: handler must return 403 forbidden-merchant
  const unauthReq = new Request('https://kiwi-os.com/api/sale', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ merchant, amountCents: 13000, id: 'unauth-test-sale', ref: '1' }),
  });
  const unauthRes = await salePost({ request: unauthReq, env });
  const unauthBody = await unauthRes.json();
  ok('unauthenticated POST /api/sale is rejected by handler with 403 forbidden-merchant',
    unauthRes.status === 403 && unauthBody.error === 'forbidden-merchant');

  // Paired till caller (holding kiwi_till cookie) calling /api/sale: handler accepts sale
  const token = await tillToken(AUTH_SECRET, merchant, 0);
  const tillReq = new Request('https://kiwi-os.com/api/sale', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: `${TILL_COOKIE}=${token}`,
    },
    body: JSON.stringify({
      merchant,
      amountCents: 13000,
      id: 'pasta-corner-sale-001',
      ref: '195',
      label: 'Pasta Lunch',
      method: 'cash',
      lines: [{ name: 'Penne Arrabbiata', qty: 1, total: 130 }],
    }),
  });
  const tillRes = await salePost({ request: tillReq, env });
  const tillBody = await tillRes.json();
  ok('paired till with kiwi_till cookie records sale with 200 ok', tillRes.status === 200 && tillBody.ok);

  const saved = sqlite.prepare('SELECT id, amount, amount_cents, merchant FROM sales WHERE id=?').get('pasta-corner-sale-001');
  ok('sale is authoritatively written to D1 sales table',
    saved && saved.merchant === merchant && saved.amount_cents === 13000 && saved.amount === 130);
}

// ── 3. assets/offline-db.js Source Text Invariants ──────────────────────────
{
  const dbSrc = read('assets/offline-db.js');
  ok('offline-db claim allows opts.force to reclaim rows in state sending',
    dbSrc.includes("row.state === 'sending' && (opts.force || (+row.leaseUntil || 0) <= at)"));
  ok('offline-db stats carries lastStatus and lastError from rows',
    dbSrc.includes('if (row.lastStatus) out.lastStatus = row.lastStatus;') &&
    dbSrc.includes('if (row.lastError) out.lastError = row.lastError;'));
}

// ── 4. assets/live-link.js Flush & QueueStatus Contract ─────────────────────
{
  const liveSrc = read('assets/live-link.js');
  ok('live-link force retry preserves the in-flight sender lock',
    liveSrc.includes('if (flushing || !navigator.onLine) return Promise.resolve(outboxStatus);') && !liveSrc.includes('if (force) {\n      flushing = false;'));
  ok('live-link flushOutbox uses AbortController timeout on fetch',
    liveSrc.includes('new AbortController()') && liveSrc.includes('controller.abort()'));
  ok('live-link queueStatus exposes lastStatus and lastError',
    liveSrc.includes('lastStatus: outboxStatus.lastStatus || lastSyncStatus || 0') &&
    liveSrc.includes("lastError: queueStorageError ? 'queue-storage-full' : (outboxStatus.lastError || lastSyncError || '')"));
  ok('live-link flushQueue returns promise chain',
    liveSrc.includes('return flushOutbox(force === true);'));
  ok('live-link treats 409 as retryable rather than permanent quarantine block',
    !/BLOCK\s*=\s*\{[^}]*409:\s*1[^}]*\}/.test(liveSrc) &&
    /BLOCK\s*=\s*\{\s*400:\s*1,\s*422:\s*1\s*\}/.test(liveSrc));
}

// ── 5. assets/caisse-pwa.js Visual Feedback Contract ────────────────────────
{
  const pwaSrc = read('assets/caisse-pwa.js');
  ok('caisse-pwa status preserves active dataset.syncing state',
    pwaSrc.includes("if (d.dataset.syncing === '1') return;"));
  ok('caisse-pwa click handler sets dataset.syncing and displays progress',
    pwaSrc.includes("d.dataset.syncing = '1';") &&
    pwaSrc.includes("txt.textContent = 'Synchronisation en cours…';") &&
    pwaSrc.includes("sub.textContent = 'Envoi des opérations au serveur…';"));
  ok('caisse-pwa click handler awaits flush and surfaces success toast',
    pwaSrc.includes("toast('Synchronisation réussie · opérations transmises');"));
  ok('caisse-pwa click handler surfaces auth error toast on 401/403',
    pwaSrc.includes("toast('Erreur d’authentification (' + after.lastStatus + ') · vérifiez l’appairage', 'danger');"));
  ok('caisse-pwa click handler surfaces server error toast on 5xx',
    pwaSrc.includes("toast('Serveur momentanément indisponible (' + after.lastStatus + ') · réessai automatique', 'warn');"));
  // Ensure user-facing strings in caisse-pwa contain no em dash
  const stringDashes = [...pwaSrc.matchAll(/'([^'\n\r]*—[^'\n\r]*)'/g)];
  ok('caisse-pwa string literals contain no U+2014 em dash', stringDashes.length === 0);
}

if (failed.length) {
  console.error(`\n✗ caisse-offline-sync-test failed (${failed.length} errors)`);
  process.exit(1);
}
console.log(`\n✓ caisse-offline-sync-test green (${passed} checks)`);
