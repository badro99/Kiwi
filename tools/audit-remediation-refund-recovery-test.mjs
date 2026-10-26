#!/usr/bin/env node
/*
 * Kiwi · BEHAVIOURAL TEST: payment-refund crash/recovery races
 *
 * These checks deliberately drive the real operations route against SQLite.
 * The adapter exposes the same prepare/bind/first/all/run surface as the
 * connector suite, while its hooks make otherwise timing-sensitive failures
 * deterministic.  They are expected to fail against the pre-fix parent
 * operations.js and pass after the parent wires the CAS/terminal/pending
 * recovery changes.
 */
import { DatabaseSync } from 'node:sqlite';
import { onRequestPost as operation, onRequestGet as operationGet } from '../functions/api/operations.js';
import { makeSession } from '../functions/auth/_lib.js';

const SECRET = 'synthetic-refund-recovery-secret';
const MERCHANT = 'audit-recovery';
const ACCOUNT = 'audit-recovery-owner';

let checks = 0;
const failures = [];
function check(condition, message) {
  checks += 1;
  if (!condition) failures.push(message);
}

function adapter(db, hooks = {}) {
  return {
    prepare(sql) {
      let args = [];
      return {
        bind(...values) { args = values; return this; },
        async run() {
          if (hooks.beforeRun) await hooks.beforeRun(sql, args);
          const result = db.prepare(sql).run(...args);
          if (hooks.afterRun) await hooks.afterRun(sql, args, result);
          return { success: true, meta: { changes: Number(result.changes || 0) } };
        },
        async first() {
          if (hooks.beforeFirst) await hooks.beforeFirst(sql, args);
          return db.prepare(sql).get(...args) || null;
        },
        async all() {
          if (hooks.beforeAll) await hooks.beforeAll(sql, args);
          return { results: db.prepare(sql).all(...args) };
        },
      };
    },
  };
}

async function harness(hooks = {}) {
  const db = new DatabaseSync(':memory:');
  db.exec(`
    CREATE TABLE accounts (
      id TEXT PRIMARY KEY, business TEXT, status TEXT DEFAULT 'active',
      session_epoch INTEGER DEFAULT 0
    );
    CREATE TABLE merchant_config (
      merchant TEXT PRIMARY KEY, account_id TEXT, status TEXT DEFAULT 'active'
    );
    CREATE TABLE operators (id TEXT PRIMARY KEY);
  `);
  db.prepare('INSERT INTO accounts (id, business, status, session_epoch) VALUES (?, ?, ?, 0)')
    .run(ACCOUNT, 'Audit Recovery', 'active');
  db.prepare('INSERT INTO merchant_config (merchant, account_id, status) VALUES (?, ?, ?)')
    .run(MERCHANT, ACCOUNT, 'active');

  const env = {
    DB: adapter(db, hooks),
    AUTH_SECRET: SECRET,
    PAYMENT_LINK_WEBHOOK: 'https://synthetic.invalid/payment',
  };
  const cookie = `kiwi_sess=${await makeSession(ACCOUNT, SECRET, 0)}`;
  const post = async (body) => {
    const response = await operation({
      env,
      request: new Request('https://kiwi.test/api/operations', {
        method: 'POST',
        headers: { cookie, 'content-type': 'application/json' },
        body: JSON.stringify({ merchant: MERCHANT, ...body }),
      }),
    });
    return { status: response.status, body: await response.json() };
  };
  const getAudit = async (commandId) => {
    const query = new URLSearchParams({ merchant: MERCHANT, view: 'audit' });
    if (commandId) query.set('commandId', commandId);
    const response = await operationGet({
      env,
      request: new Request(`https://kiwi.test/api/operations?${query}`, { headers: { cookie } }),
    });
    return { status: response.status, body: await response.json() };
  };
  return { db, env, post, getAudit, close: () => db.close() };
}

async function seedPaidLink(h, prefix) {
  const created = await h.post({
    id: `${prefix}:create`, idempotencyKey: `${prefix}:create`,
    domain: 'payment', action: 'create-link', confirmed: true,
    payload: { amount: 100 },
  });
  check(created.status === 200 && created.body.command?.status === 'active', `${prefix}: create-link completed`);
  const reference = created.body.command?.result?.reference;
  check(!!reference, `${prefix}: create-link returned a merchant reference`);
  const settled = await h.post({
    id: `${prefix}:settle`, idempotencyKey: `${prefix}:settle`,
    domain: 'payment', action: 'settle-link', confirmed: true,
    payload: { reference },
  });
  check(settled.status === 200 && settled.body.command?.status === 'completed', `${prefix}: settle-link completed`);
  return reference;
}

async function reconcile(h, id, transition = 'processing') {
  return h.post({
    commandId: id, transition, confirmed: true,
  });
}

async function runEventCasRace() {
  let armed = false;
  let eventReads = 0;
  let releaseReads;
  const readsReleased = new Promise((resolve) => { releaseReads = resolve; });
  const h = await harness({
    async beforeFirst(sql) {
      if (!armed || !sql.includes('FROM operational_events') || !sql.includes('ORDER BY seq DESC')) return;
      eventReads += 1;
      if (eventReads === 2) {
        armed = false;
        releaseReads();
      }
      await readsReleased;
    },
  });
  try {
    /* A manually staged processing command lets two real transition requests
       enter update()/event() without the refund terminal guard suppressing the
       second audit attempt. The transition still goes through auth, tenancy,
       rate limiting, SQL persistence and the production audit reader. */
    await h.getAudit();
    const at = Date.now();
    h.db.prepare(`
      INSERT INTO operational_commands
        (id, merchant, domain, action, status, provider, idempotency_key, payload,
         result, requested_by, attempt_count, last_error, created_ts, updated_ts)
      VALUES (?, ?, 'procurement', 'create-po', 'processing', '', ?, '{}', NULL, 'owner', 1, '', ?, ?)
    `).run('cas:transition', MERCHANT, 'cas:transition', at, at);
    armed = true;
    const results = await Promise.all([
      reconcile(h, 'cas:transition', 'failed'),
      reconcile(h, 'cas:transition', 'failed'),
    ]);
    const row = h.db.prepare('SELECT status FROM operational_commands WHERE id = ?').get('cas:transition');
    const audit = await h.getAudit('cas:transition');
    const events = h.db.prepare(
      'SELECT seq, prev_hash, hash FROM operational_events WHERE merchant = ? AND command_id = ? ORDER BY seq, id'
    ).all(MERCHANT, 'cas:transition');
    check(results.every((result) => result.status === 200), `event CAS: both concurrent reconciliations return successfully (${JSON.stringify(results)})`);
    check(row?.status === 'failed', `event CAS: concurrent transitions persist the requested state (${JSON.stringify(row)})`);
    check(audit.status === 200 && audit.body.ok === true, 'event CAS: audit chain remains valid after concurrent transitions');
    check(new Set(events.map((event) => event.seq)).size === events.length, 'event CAS: no duplicate sequence numbers');
    check(events.every((event, index) => index === 0 || event.prev_hash === events[index - 1].hash), 'event CAS: every event points to the current predecessor');
  } catch (error) {
    failures.push(`event CAS scenario threw: ${error.message}`);
  } finally {
    releaseReads();
    h.close();
  }
}

async function runTerminalMonotonicRace() {
  let completedResolve;
  const completed = new Promise((resolve) => { completedResolve = resolve; });
  let statusReads = 0;
  let releaseStatus;
  const bothStatusReads = new Promise((resolve) => { releaseStatus = resolve; });
  const h = await harness({
    async beforeRun(sql, args) {
      if (!sql.includes('UPDATE operational_commands SET status = ?')) return;
      if (args[0] === 'blocked') await completed;
    },
    async afterRun(sql, args) {
      if (sql.includes('UPDATE operational_commands SET status = ?') && args[0] === 'completed') {
        completedResolve();
      }
    },
  });
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async (_url, options) => {
      const body = JSON.parse(options.body);
      if (body.kind === 'payment-link') return Response.json({ url: 'https://synthetic.invalid/link', reference: 'provider-link' });
      if (body.kind === 'payment-status') return Response.json({ status: 'paid', paidAmount: 100 });
      if (body.kind === 'payment-refund') return Response.json({});
      if (body.kind === 'payment-refund-status') {
        const call = ++statusReads;
        if (statusReads === 2) releaseStatus();
        await bothStatusReads;
        if (call === 2 && body.commandId === 'terminal:refund') {
          /* The first caller gets provider evidence; the second caller sees a
             pending/unknown inquiry and attempts the stale terminal update. */
          return Response.json({});
        }
        return Response.json({
          status: 'refunded', commandId: body.commandId, amount: 20,
          reference: `verified-${body.commandId}`,
        });
      }
      throw new Error(`unexpected provider call: ${body.kind}`);
    };

    const reference = await seedPaidLink(h, 'terminal');
    const initial = await h.post({
      id: 'terminal:refund', idempotencyKey: 'terminal:refund',
      domain: 'payment', action: 'refund-link', confirmed: true,
      payload: { reference, amount: 20 },
    });
    check(initial.status === 200 && initial.body.command?.status === 'blocked', 'terminal monotonic: initial ambiguous refund is blocked');

    const results = await Promise.all([reconcile(h, 'terminal:refund'), reconcile(h, 'terminal:refund')]);
    const row = h.db.prepare('SELECT status FROM operational_commands WHERE id = ?').get('terminal:refund');
    const refund = h.db.prepare('SELECT COUNT(*) AS lines, COALESCE(SUM(amount_cents), 0) AS cents FROM payment_refunds WHERE command_id = ?').get('terminal:refund');
    check(results.some((result) => result.status === 200), 'terminal monotonic: at least the successful reconciliation returns');
    check(row?.status === 'completed', 'terminal monotonic: stale blocked update cannot regress completed');
    check(refund?.lines === 1 && refund?.cents === 2000, 'terminal monotonic: ledger remains exactly once');
  } catch (error) {
    failures.push(`terminal monotonic scenario threw: ${error.message}`);
  } finally {
    completedResolve();
    releaseStatus();
    globalThis.fetch = originalFetch;
    h.close();
  }
}

async function runDuplicateRecoveryResponse() {
  let fault = true;
  const h = await harness({
    async beforeRun(sql) {
      if (fault && sql.includes("UPDATE payment_refund_reservations SET status = 'unknown'")) {
        fault = false;
        throw new Error('synthetic crash after provider acceptance');
      }
    },
  });
  const originalFetch = globalThis.fetch;
  let refundCalls = 0;
  try {
    globalThis.fetch = async (_url, options) => {
      const body = JSON.parse(options.body);
      if (body.kind === 'payment-link') return Response.json({ url: 'https://synthetic.invalid/link', reference: 'provider-link' });
      if (body.kind === 'payment-status') return Response.json({ status: 'paid', paidAmount: 100 });
      if (body.kind === 'payment-refund') {
        refundCalls += 1;
        return Response.json({ reference: `refund-${body.commandId}` });
      }
      throw new Error(`unexpected provider call: ${body.kind}`);
    };

    const reference = await seedPaidLink(h, 'duplicate');
    const response = await h.post({
      id: 'duplicate:refund', idempotencyKey: 'duplicate:refund',
      domain: 'payment', action: 'refund-link', confirmed: true,
      payload: { reference, amount: 20 },
    });
    const reservation = h.db.prepare(
      'SELECT status, provider_ref FROM payment_refund_reservations WHERE command_id = ?'
    ).get('duplicate:refund');
    check(response.status === 200 && response.body.duplicate === true, 'duplicate recovery: existing command is returned idempotently after the crash');
    check(response.body.command?.result?.reconciliationRequired === true, 'duplicate recovery: pending reservation is exposed as reconciliation-required');
    check(refundCalls === 1, 'duplicate recovery: provider is called exactly once');
    check(reservation?.status === 'reserved' && !reservation.provider_ref, 'duplicate recovery: reservation remains held when evidence persistence crashes');
  } catch (error) {
    failures.push(`duplicate recovery scenario threw: ${error.message}`);
  } finally {
    globalThis.fetch = originalFetch;
    h.close();
  }
}

async function runQueuedPendingGuard() {
  const h = await harness();
  const originalFetch = globalThis.fetch;
  let refundCalls = 0;
  try {
    globalThis.fetch = async (_url, options) => {
      const body = JSON.parse(options.body);
      if (body.kind === 'payment-refund') {
        refundCalls += 1;
        return Response.json({ reference: `replayed-${body.commandId}` });
      }
      throw new Error(`unexpected provider call: ${body.kind}`);
    };
    const reference = 'PAY-QUEUED';
    await h.getAudit();
    h.db.exec(`
      CREATE TABLE payment_links (
        merchant TEXT NOT NULL, reference TEXT NOT NULL, seq INTEGER NOT NULL,
        command_id TEXT NOT NULL DEFAULT '', provider_ref TEXT NOT NULL DEFAULT '',
        url TEXT NOT NULL DEFAULT '', amount_cents INTEGER NOT NULL,
        paid_cents INTEGER NOT NULL DEFAULT 0, currency TEXT NOT NULL DEFAULT 'MAD',
        description TEXT NOT NULL DEFAULT '', customer TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL, created_ts INTEGER NOT NULL, updated_ts INTEGER NOT NULL,
        PRIMARY KEY (merchant, reference)
      );
      INSERT INTO payment_links
        (merchant, reference, seq, amount_cents, paid_cents, currency, status, created_ts, updated_ts)
      VALUES ('${MERCHANT}', '${reference}', 1, 10000, 10000, 'MAD', 'paid', 1, 1);
    `);
    const createdAt = Date.now();
    h.db.prepare(`
      INSERT INTO operational_commands
        (id, merchant, domain, action, status, provider, idempotency_key, payload,
         result, requested_by, attempt_count, last_error, created_ts, updated_ts)
      VALUES (?, ?, 'payment', 'refund-link', 'queued', '', ?, ?, NULL, 'owner', 0, '', ?, ?)
    `).run(
      'queued:refund', MERCHANT, 'queued:refund',
      JSON.stringify({ reference, amount: 20, reason: 'queued fixture' }), createdAt, createdAt,
    );
    const response = await reconcile(h, 'queued:refund');
    const row = h.db.prepare('SELECT status FROM operational_commands WHERE id = ?').get('queued:refund');
    const ledger = h.db.prepare('SELECT COUNT(*) AS lines FROM payment_refunds WHERE command_id = ?').get('queued:refund');
    check(response.status === 200, 'queued pending guard: reconciliation returns a pending command response');
    check(response.body.command?.status === 'queued' && response.body.command?.result?.pending === true
      && response.body.command?.result?.reconciliationRequired === true,
    'queued pending guard: response explicitly says pending without changing the command');
    check(refundCalls === 0, 'queued pending guard: queued initial command never replays the provider refund');
    check(row?.status === 'queued', 'queued pending guard: queued command remains queued');
    check(ledger?.lines === 0, 'queued pending guard: no refund ledger row is created');
  } catch (error) {
    failures.push(`queued pending guard scenario threw: ${error.message}`);
  } finally {
    globalThis.fetch = originalFetch;
    h.close();
  }
}

async function runStaleQueuedRace() {
  let reservationAttempts = 0;
  let releaseReservations;
  const bothReservationAttempts = new Promise((resolve) => { releaseReservations = resolve; });
  let loserObservedResolve;
  const loserObserved = new Promise((resolve) => { loserObservedResolve = resolve; });
  let loserObservedOnce = false;
  const h = await harness({
    async beforeFirst(sql) {
      if (sql.includes('INSERT INTO payment_refund_reservations')) {
        reservationAttempts += 1;
        if (reservationAttempts === 2) releaseReservations();
        await bothReservationAttempts;
        return;
      }
      if (!loserObservedOnce && reservationAttempts >= 2
          && sql.includes('SELECT * FROM operational_commands WHERE id = ? AND merchant = ?')) {
        loserObservedOnce = true;
        loserObservedResolve();
      }
    },
  });
  const originalFetch = globalThis.fetch;
  let refundCalls = 0;
  try {
    globalThis.fetch = async (_url, options) => {
      const body = JSON.parse(options.body);
      if (body.kind === 'payment-refund') {
        refundCalls += 1;
        await loserObserved;
        return Response.json({ reference: `stale-${body.commandId}` });
      }
      throw new Error(`unexpected provider call: ${body.kind}`);
    };
    const reference = 'PAY-STALE';
    await h.getAudit();
    h.db.exec(`
      CREATE TABLE payment_links (
        merchant TEXT NOT NULL, reference TEXT NOT NULL, seq INTEGER NOT NULL,
        command_id TEXT NOT NULL DEFAULT '', provider_ref TEXT NOT NULL DEFAULT '',
        url TEXT NOT NULL DEFAULT '', amount_cents INTEGER NOT NULL,
        paid_cents INTEGER NOT NULL DEFAULT 0, currency TEXT NOT NULL DEFAULT 'MAD',
        description TEXT NOT NULL DEFAULT '', customer TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL, created_ts INTEGER NOT NULL, updated_ts INTEGER NOT NULL,
        PRIMARY KEY (merchant, reference)
      );
      INSERT INTO payment_links
        (merchant, reference, seq, amount_cents, paid_cents, currency, status, created_ts, updated_ts)
      VALUES ('${MERCHANT}', '${reference}', 1, 10000, 10000, 'MAD', 'paid', 1, 1);
    `);
    const staleAt = Date.now() - 60001;
    h.db.prepare(`
      INSERT INTO operational_commands
        (id, merchant, domain, action, status, provider, idempotency_key, payload,
         result, requested_by, attempt_count, last_error, created_ts, updated_ts)
      VALUES (?, ?, 'payment', 'refund-link', 'queued', '', ?, ?, NULL, 'owner', 0, '', ?, ?)
    `).run(
      'stale:refund', MERCHANT, 'stale:refund',
      JSON.stringify({ reference, amount: 20, reason: 'stale queued fixture' }), staleAt, staleAt,
    );

    const results = await Promise.all([
      reconcile(h, 'stale:refund'),
      reconcile(h, 'stale:refund'),
    ]);
    const row = h.db.prepare('SELECT status FROM operational_commands WHERE id = ?').get('stale:refund');
    const ledger = h.db.prepare(
      'SELECT COUNT(*) AS lines, COALESCE(SUM(amount_cents), 0) AS cents FROM payment_refunds WHERE command_id = ?'
    ).get('stale:refund');
    const reservation = h.db.prepare(
      'SELECT status, amount_cents FROM payment_refund_reservations WHERE command_id = ?'
    ).get('stale:refund');
    check(results.every((result) => result.status === 200), 'stale queued race: both reconciliations return safely');
    const safeResponses = results.every((result) => {
      const command = result.body.command;
      return command?.status === 'completed'
        || (command?.status === 'queued' && command.result?.pending === true
          && command.result?.reconciliationRequired === true);
    });
    check(safeResponses, 'stale queued race: every response is completed or an explicit pending snapshot');
    check(!results.some((result) => ['failed', 'blocked'].includes(result.body.command?.status)),
      'stale queued race: reservation loser never reports failed/blocked over the winning command');
    check(refundCalls === 1, 'stale queued race: provider receives exactly one refund call');
    check(row?.status === 'completed', 'stale queued race: final command is completed');
    check(ledger?.lines === 1 && ledger?.cents === 2000, 'stale queued race: exactly one ledger refund is recorded');
    check(reservation?.status === 'confirmed' && reservation?.amount_cents === 2000,
      'stale queued race: winning reservation is confirmed for the requested amount');
  } catch (error) {
    failures.push(`stale queued race scenario threw: ${error.message}`);
  } finally {
    releaseReservations();
    loserObservedResolve();
    globalThis.fetch = originalFetch;
    h.close();
  }
}

await runEventCasRace();
await runTerminalMonotonicRace();
await runDuplicateRecoveryResponse();
await runQueuedPendingGuard();
await runStaleQueuedRace();

if (failures.length) {
  console.error(`audit-remediation-refund-recovery: ${checks} checks, ${failures.length} failed`);
  for (const failure of failures) console.error(`  ✗ ${failure}`);
  process.exitCode = 1;
} else {
  console.log(`audit-remediation-refund-recovery: ${checks} checks passed`);
}
