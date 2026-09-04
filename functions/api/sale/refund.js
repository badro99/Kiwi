// POST /api/sale/refund — append one manager-approved refund to the same
// financial stream as sales. The stored amount is negative, so every reader
// can reconcile the day's net without deleting or mutating the original sale.

import {
  entitledMerchant, employeeRoleOpensDashboard, readManagerRefundProof, json,
} from '../../auth/_lib.js';
import { storeSuspended, storeSubscriptionPending } from '../_private.js';
import { poke } from '../_live.js';

const MAX_AMOUNT_CENTS = 20000000;
function cleanId(value, max = 80) {
  return String(value || '').trim().replace(/[^A-Za-z0-9:_-]/g, '').slice(0, max);
}

function cleanLines(raw) {
  if (!raw) return [];
  try {
    const rows = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return Array.isArray(rows) ? rows.slice(0, 40).map((line) => ({
      n: String((line && (line.n ?? line.name)) || 'Article').slice(0, 60),
      q: Math.max(0, Number(line && (line.q ?? line.qty)) || 0),
      t: Math.max(0, Number(line && (line.t ?? line.total)) || 0),
    })).filter((line) => line.q > 0) : [];
  } catch (_) { return []; }
}

export async function onRequestPost({ request, env }) {
  if (!env || !env.DB) return json({ error: 'no-db' }, 503);

  let body;
  try { body = await request.json(); } catch (_) { return json({ error: 'bad-json' }, 400); }

  const asked = String((body && body.merchant) || '').slice(0, 64);
  const refundId = cleanId(body && body.id, 64);
  const originalSaleId = cleanId(body && body.originalSaleId, 64);
  const amountCents = Math.round(Number(body && body.amountCents));
  const approval = String((body && body.approval) || '').slice(0, 1400);
  const reason = String((body && body.reason) || 'refund').trim().slice(0, 80);
  const refundRef = String((body && body.ref) || '').trim().slice(0, 40);
  if (!asked || !refundId || !originalSaleId) return json({ error: 'missing-fields' }, 400);
  if (!Number.isFinite(amountCents) || amountCents <= 0 || amountCents > MAX_AMOUNT_CENTS) {
    return json({ error: 'bad-amount' }, 400);
  }
  const merchant = await entitledMerchant(request, env, asked, { allowTill: true });
  if (!merchant) return json({ error: 'forbidden-merchant' }, 403);
  if (await storeSuspended(env, merchant)) return json({ error: 'store-suspended', merchant }, 423);
  if (await storeSubscriptionPending(env, merchant)) return json({ error: 'subscription-required', merchant }, 402);

  /* The browser cannot assert that a manager approved a refund. /api/pin/verify
     signs a ten-minute capability bound to this exact command; the PIN itself
     never enters the outbox. Any altered merchant, sale, id or amount fails. */
  const proof = await readManagerRefundProof(approval, env.AUTH_SECRET);
  if (!proof || proof.merchant !== merchant || proof.refundId !== refundId
      || proof.originalSaleId !== originalSaleId || Number(proof.amountCents) !== amountCents
      || !proof.staffId || !proof.staffName || !employeeRoleOpensDashboard(proof.staffRole)) {
    return json({ error: 'manager-required' }, 403);
  }
  const actorId = cleanId(proof.staffId, 96);
  const actor = String(proof.staffName).trim().slice(0, 80);

  let original;
  try {
    original = await env.DB.prepare(
      `SELECT id, amount, amount_cents, method, label, ref, ts, lines
         FROM sales WHERE merchant = ? AND id = ? AND void_ts IS NULL
          AND COALESCE(amount_cents, amount * 100) > 0
         LIMIT 1`
    ).bind(merchant, originalSaleId).first();
  } catch (error) {
    return json({ error: 'db-read-failed', detail: String(error && error.message || error) }, 500);
  }
  /* The sale is queued immediately before its refund. A weak connection can
     make the refund reach this endpoint first; 404 remains retryable in the
     outbox and cannot create an unattributed negative entry. */
  if (!original) return json({ error: 'sale-not-found' }, 404);

  const originalCents = original.amount_cents != null
    ? Math.round(Number(original.amount_cents)) : Math.round(Number(original.amount || 0) * 100);
  const storedAmount = -Math.round(amountCents / 100);
  const tsRaw = Number(body && body.ts);
  const now = Date.now();
  const ts = Number.isFinite(tsRaw) && tsRaw > 0 && tsRaw <= now + 86400000 ? tsRaw : now;
  const label = ('Remboursement · ' + String(original.label || original.ref || 'Vente')).slice(0, 80);
  const impact = JSON.stringify({
    refundId, refundRef, originalSaleId, originalRef: String(original.ref || '').slice(0, 40),
    originalAmountCents: originalCents, lines: cleanLines(original.lines),
  });

  try {
    /* One D1 batch is the concurrency boundary. The negative sale is inserted
       only while the cumulative append-only refund audit leaves enough value.
       The audit then keys idempotency on note=refundId. A lost response can
       replay the batch: INSERT OR IGNORE plus NOT EXISTS creates neither a
       second refund nor a second audit row. */
    await env.DB.batch([
      env.DB.prepare(
        `INSERT OR IGNORE INTO sales
           (id, merchant, amount, amount_cents, method, label, ref, ts, lines, channel)
         SELECT ?, ?, ?, ?, ?, ?, ?, ?, NULL, 'refund'
          WHERE NOT EXISTS (
            SELECT 1 FROM sale_audit WHERE merchant = ? AND action = 'refund' AND note = ?
          ) AND ? <= ? - COALESCE((
            SELECT SUM(COALESCE(amount_cents, amount * 100)) FROM sale_audit
             WHERE merchant = ? AND sale_id = ? AND action = 'refund'
          ), 0)`
      ).bind(refundId, merchant, storedAmount, -amountCents, String(original.method || 'cash').slice(0, 16),
             label, refundRef, ts, merchant, refundId, amountCents, originalCents, merchant, originalSaleId),
      env.DB.prepare(
        `INSERT INTO sale_audit
           (merchant, sale_id, action, reason, note, actor, actor_id, amount, amount_cents,
            method, ref, sale_ts, impact, ts)
         SELECT ?, ?, 'refund', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
          WHERE EXISTS (SELECT 1 FROM sales WHERE merchant = ? AND id = ? AND amount_cents = ?)
            AND NOT EXISTS (
              SELECT 1 FROM sale_audit WHERE merchant = ? AND action = 'refund' AND note = ?
            )`
      ).bind(merchant, originalSaleId, reason, refundId, actor, actorId,
             Math.round(amountCents / 100), amountCents, String(original.method || 'cash').slice(0, 16),
             refundRef, Number(original.ts) || 0, impact, ts,
             merchant, refundId, -amountCents, merchant, refundId),
    ]);
  } catch (error) {
    return json({ error: 'refund-write-failed', detail: String(error && error.message || error) }, 500);
  }

  let saved = null;
  let audit = null;
  try {
    saved = await env.DB.prepare(
      `SELECT id, amount_cents FROM sales WHERE merchant = ? AND id = ? AND channel = 'refund' LIMIT 1`
    ).bind(merchant, refundId).first();
    audit = await env.DB.prepare(
      `SELECT sale_id, amount_cents FROM sale_audit
        WHERE merchant = ? AND action = 'refund' AND note = ? ORDER BY id DESC LIMIT 1`
    ).bind(merchant, refundId).first();
  } catch (_) {}
  if (!saved || !audit) return json({ error: 'refund-exceeds-sale' }, 409);
  if (Number(saved.amount_cents) !== -amountCents
      || Number(audit.amount_cents) !== amountCents
      || String(audit.sale_id || '') !== originalSaleId) {
    return json({ error: 'refund-id-conflict' }, 409);
  }

  try { await poke(env, merchant, 'sale-refund'); } catch (_) {}
  return json({ ok: true, id: refundId, originalSaleId, amountCents, ref: refundRef, ts });
}
