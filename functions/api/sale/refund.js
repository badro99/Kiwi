// POST /api/sale/refund — append one manager-approved refund to the same
// financial stream as sales. The stored amount is negative, so every reader
// can reconcile the day's net without deleting or mutating the original sale.

import {
  entitledMerchant, employeeRoleOpensDashboard, readManagerRefundProof, json,
} from '../../auth/_lib.js';
import { storeSuspended, storeSubscriptionPending } from '../_private.js';
import { poke } from '../_live.js';
import { ensureCreditEvents } from '../_store-credit-ledger.js';

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
  const requestedMethod = String((body && body.refundMethod) || '').slice(0, 16);
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
      || ((requestedMethod || proof.refundMethod) && proof.refundMethod !== requestedMethod)
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
          AND COALESCE(amount_cents, amount * 100) >= 0
         LIMIT 1`
    ).bind(merchant, originalSaleId).first();
  } catch (error) {
    return json({ error: 'db-read-failed', detail: String(error && error.message || error) }, 500);
  }
  /* The sale is queued immediately before its refund. A weak connection can
     make the refund reach this endpoint first; 404 remains retryable in the
     outbox and cannot create an unattributed negative entry. */
  if (!original) return json({ error: 'sale-not-found' }, 404);

  await ensureCreditEvents(env);
  // Only persisted redemptions identify the voucher to restore. Client tender
  // labels are never authority to create a customer liability.
  const redeemed = (await env.DB.prepare(
    `SELECT e.credit_id, SUM(e.amount_cents) AS cents FROM store_credit_events e
      WHERE e.merchant = ? AND e.ref_id = ? AND e.action = 'redeem'
      GROUP BY e.credit_id ORDER BY e.credit_id`
  ).bind(merchant, originalSaleId).all()).results || [];
  for (const redemption of redeemed) {
    const credit = await env.DB.prepare('SELECT id FROM store_credits WHERE merchant = ? AND id = ?')
      .bind(merchant, redemption.credit_id).first();
    if (!credit) return json({ error: 'credit-not-found' }, 409);
  }
  const moneyCents = original.amount_cents != null
    ? Math.round(Number(original.amount_cents)) : Math.round(Number(original.amount || 0) * 100);
  const creditCents = redeemed.reduce((n, r) => n + Number(r.cents), 0);
  const originalCents = moneyCents + creditCents;
  const prior = (await env.DB.prepare(
    "SELECT note, amount_cents, method, impact FROM sale_audit WHERE merchant = ? AND sale_id = ? AND action = 'refund'"
  ).bind(merchant, originalSaleId).all()).results || [];
  const replay = prior.find(r => r.note === refundId);
  const previous = prior.filter(r => r.note !== refundId);
  const returned = previous.reduce((n, r) => n + Number(r.amount_cents), 0);
  let parts = [{ method: String(original.method || 'cash'), amountCents: moneyCents }];
  try {
    const detail = await env.DB.prepare('SELECT payment_parts FROM sales WHERE merchant = ? AND id = ?')
      .bind(merchant, originalSaleId).first();
    const parsed = JSON.parse(detail && detail.payment_parts);
    if (Array.isArray(parsed) && parsed.length) parts = parsed;
  } catch (_) { /* Older schema: the single original method stays authoritative. */ }
  const paid = {};
  for (const part of parts) if (/^(cash|card|transfer|cheque)$/.test(part.method)) {
    paid[part.method] = (paid[part.method] || 0) + Number(part.amountCents || 0);
  }
  /* L'argent d'abord, dans le moyen que la caisse a choisi ; l'avoir ensuite,
   * pour la seule part qui dépasse l'argent encaissé. La caisse retire de son
   * tiroir ce qu'elle demande (« 100 en espèces ») : si le serveur rendait
   * d'abord l'avoir, il écrirait 60 espèces pendant que le tiroir en perdait
   * 100, et la cliente garderait les deux. Un ticket payé en partie par avoir
   * n'était remboursable que pour sa part en argent ; au-delà, la part d'avoir
   * revient maintenant sur l'avoir d'origine, au centime, une fois. */
  const spent = {};
  for (const row of previous) {
    let entries;
    try { entries = JSON.parse(row.impact).allocations; } catch (_) {}
    for (const part of entries || [{ method: row.method, amountCents: Number(row.amount_cents) }]) {
      const key = part.method === 'credit' ? 'credit:' + part.creditId : 'money';
      spent[key] = (spent[key] || 0) + Number(part.amountCents || 0);
    }
  }
  const allocations = [];
  let left = amountCents;
  const moneyPart = Math.min(left, Math.max(0, moneyCents - (spent.money || 0)));
  const chosenMethod = requestedMethod || String(original.method || 'cash');
  if (requestedMethod && moneyPart > 0 && !paid[requestedMethod]) {
    return json({ error: 'bad-refund-method' }, 400);
  }
  if (moneyPart > 0) allocations.push({ method: chosenMethod, amountCents: moneyPart });
  left -= moneyPart;
  for (const r of redeemed) {
    const cents = Math.min(left, Math.max(0, Number(r.cents) - (spent['credit:' + r.credit_id] || 0)));
    if (cents > 0) allocations.push({ method: 'credit', creditId: r.credit_id, amountCents: cents });
    left -= cents;
  }
  if (left && !replay) return json({ error: 'refund-exceeds-sale' }, 409);
  const refundMethod = requestedMethod || String(original.method || 'cash');
  if (replay && (Number(replay.amount_cents) !== amountCents || String(replay.method) !== refundMethod)) {
    return json({ error: 'refund-id-conflict' }, 409);
  }
  const actual = replay
    ? (JSON.parse(replay.impact || '{}').allocations || [{ method: replay.method, amountCents }])
    : allocations;
  const moneyOut = actual.reduce((n, p) => n + (p.method === 'credit' ? 0 : p.amountCents), 0);
  const storedAmount = -Math.round(moneyOut / 100);
  const tsRaw = Number(body && body.ts);
  const now = Date.now();
  const ts = Number.isFinite(tsRaw) && tsRaw > 0 && tsRaw <= now + 86400000 ? tsRaw : now;
  const label = ('Remboursement · ' + String(original.label || original.ref || 'Vente')).slice(0, 80);
  const impact = JSON.stringify({
    refundId, refundRef, originalSaleId, originalRef: String(original.ref || '').slice(0, 40),
    allocations: actual, originalAmountCents: originalCents, lines: cleanLines(original.lines),
  });

  /* Le plafond compte aussi les avoirs déjà émis sur ce ticket : un
     remboursement espèces PLUS un avoir ne peuvent pas, ensemble, dépasser le
     ticket. La table des avoirs peut manquer sur une base en retard. */
  await ensureCreditEvents(env);

  try {
    /* One D1 batch is the concurrency boundary. The negative sale is inserted
       only while the cumulative append-only refund audit AND the store credits
       already issued on this ticket leave enough value, and while the original
       sale has not been voided in the meantime (a void plus a refund would take
       the same money out twice).
       The audit then keys idempotency on note=refundId. A lost response can
       replay the batch: INSERT OR IGNORE plus NOT EXISTS creates neither a
       second refund nor a second audit row. */
    const statements = [
      env.DB.prepare(
        `INSERT OR IGNORE INTO sales
           (id, merchant, amount, amount_cents, method, label, ref, ts, lines, channel, payment_parts)
         SELECT ?, ?, ?, ?, ?, ?, ?, ?, NULL, 'refund', ?
          WHERE NOT EXISTS (
            SELECT 1 FROM sale_audit WHERE merchant = ? AND action = 'refund' AND note = ?
          ) AND ? <= ? - COALESCE((
            SELECT SUM(COALESCE(amount_cents, amount * 100)) FROM sale_audit
             WHERE merchant = ? AND sale_id = ? AND action = 'refund'
          ), 0) - COALESCE((
            SELECT SUM(amount_cents) FROM store_credit_events
             WHERE merchant = ? AND ref_id = ? AND action = 'issue'
          ), 0) AND (? = 1 OR ? = COALESCE((SELECT SUM(amount_cents) FROM sale_audit
             WHERE merchant = ? AND sale_id = ? AND action = 'refund'), 0)) AND EXISTS (
            SELECT 1 FROM sales WHERE merchant = ? AND id = ? AND void_ts IS NULL
          )`
      ).bind(refundId, merchant, storedAmount, -moneyOut, refundMethod,
             label, refundRef, ts, JSON.stringify(actual.filter(p => p.method !== 'credit')), merchant, refundId, amountCents, originalCents, merchant, originalSaleId,
             merchant, originalSaleId, !creditCents ? 1 : 0, returned, merchant, originalSaleId, merchant, originalSaleId),
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
             Math.round(amountCents / 100), amountCents, refundMethod,
             refundRef, Number(original.ts) || 0, impact, ts,
             merchant, refundId, -moneyOut, merchant, refundId),
    ];
    for (const part of actual.filter(p => p.method === 'credit')) {
      const eventId = `refund:${merchant}:${refundId}:${part.creditId}`;
      statements.push(env.DB.prepare(
        `UPDATE store_credits SET balance_cents = balance_cents + ?,
          status = CASE WHEN status = 'consumed' THEN 'active' ELSE status END,
          updated_ts = ?, last_event_id = ?
         WHERE merchant = ? AND id = ?
           AND EXISTS (SELECT 1 FROM sale_audit WHERE merchant = ? AND sale_id = ? AND note = ? AND action = 'refund')
           AND NOT EXISTS (SELECT 1 FROM store_credit_events WHERE merchant = ? AND id = ?)`
      ).bind(part.amountCents, ts, eventId, merchant, part.creditId, merchant, originalSaleId, refundId, merchant, eventId));
      statements.push(env.DB.prepare(
        `INSERT OR IGNORE INTO store_credit_events
          (id, merchant, credit_id, code, action, amount_cents, balance_after_cents, ref_id, actor, detail, ts)
         SELECT ?, merchant, id, code, 'adjust', ?, balance_cents, ?, ?, 'Restauration remboursement', ?
          FROM store_credits WHERE merchant = ? AND id = ? AND last_event_id = ?`
      ).bind(eventId, part.amountCents, refundId, actor, ts, merchant, part.creditId, eventId));
    }
    await env.DB.batch(statements);
  } catch (error) {
    return json({ error: 'refund-write-failed', detail: String(error && error.message || error) }, 500);
  }

  let saved = null;
  let audit = null;
  try {
    saved = await env.DB.prepare(
      `SELECT id, amount_cents, method FROM sales WHERE merchant = ? AND id = ? AND channel = 'refund' LIMIT 1`
    ).bind(merchant, refundId).first();
    audit = await env.DB.prepare(
      `SELECT sale_id, amount_cents, method FROM sale_audit
        WHERE merchant = ? AND action = 'refund' AND note = ? ORDER BY id DESC LIMIT 1`
    ).bind(merchant, refundId).first();
  } catch (_) {}
  if (!saved || !audit) return json({ error: 'refund-exceeds-sale' }, 409);
  if (Number(saved.amount_cents) !== -moneyOut || String(saved.method) !== refundMethod
      || Number(audit.amount_cents) !== amountCents
      || String(audit.method) !== refundMethod
      || String(audit.sale_id || '') !== originalSaleId) {
    return json({ error: 'refund-id-conflict' }, 409);
  }

  try { await poke(env, merchant, 'sale-refund'); } catch (_) {}
  return json({ ok: true, id: refundId, originalSaleId, amountCents, ref: refundRef, ts });
}
