import { ensureCollectionSchema } from '../receivables.js';
// POST /api/sale/refund — append one manager-approved refund to the same
// financial stream as sales. The stored amount is negative, so every reader
// can reconcile the day's net without deleting or mutating the original sale.

import {
  entitledMerchant, employeeRoleOpensDashboard, readManagerRefundProof, json,
} from '../../auth/_lib.js';
import { storeSuspended, storeSubscriptionPending } from '../_private.js';
import { quarantineGuard } from '../_quarantine-guard.js';
import { poke } from '../_live.js';
import { clockFlags, recordSaleFlag } from '../_sale-truth.js';
import { ensureCreditEvents } from '../_store-credit-ledger.js';
import { addBusinessDays, businessBoundary, businessDate, merchantCutoff, merchantZone } from '../_business-day.js';
/* La règle du partage argent / avoirs vit dans un seul fichier, que la caisse
   Maison lit aussi pour annoncer le remboursement avant l'accord du responsable. */
import RefundSplit from '../../../assets/refund-split.js';

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

async function liveOriginalId(env, merchant, id) {
  const live = "merchant = ? AND void_ts IS NULL AND COALESCE(amount_cents, amount * 100) >= 0";
  try {
    if (await env.DB.prepare(`SELECT 1 FROM sales WHERE ${live} AND id = ? LIMIT 1`).bind(merchant, id).first()) return id;
    /* Un paiement de table arrive sous l'id de la visite suivi d'un suffixe de
       paiement (functions/api/sale.js › legacyPaymentId) : la caisse, elle,
       garde l'id de la visite. Une seule vente vivante de ce suffixe, sinon rien. */
    if (/^visit-[A-Za-z0-9_-]+$/.test(id)) {
      const base = id.slice(0, 38) + '-';
      const paid = (await env.DB.prepare(`SELECT id FROM sales WHERE ${live} AND substr(id, 1, ?) = ? AND length(id) = ? LIMIT 2`)
        .bind(merchant, base.length, base, base.length + 24).all()).results || [];
      if (paid.length === 1 && /^[0-9a-f]{24}$/.test(String(paid[0].id).slice(base.length))) return String(paid[0].id);
    }
    /* Only the till's own shapes are remapped: its local `sale-<uuid>` and the
       server's `sale-ref-<hash>-<tail>` (assets/live-link.js › stableId). Any
       other id must match exactly. The tail is 32 chars of a random id, the
       store is the same, and refund-exceeds-sale still caps the target. */
    if (!/^sale-(ref-[0-9a-f]{6,8}-|[0-9a-f]{8}-[0-9a-f]{4}-)/.test(id)) return id;
    const tail = id.replace(/[^a-zA-Z0-9_-]/g, '').slice(-32);
    if (tail.length < 16) return id;
    const rows = (await env.DB.prepare(`SELECT id FROM sales WHERE ${live} AND id != ? AND substr(id, -?) = ? LIMIT 2`)
      .bind(merchant, id, tail.length, tail).all()).results || [];
    return rows.length === 1 ? String(rows[0].id) : id;
  } catch (_) { return id; }
}

export async function onRequestPost({ request, env, quarantineSettlement = '' }) {
  if (!env || !env.DB) return json({ error: 'no-db' }, 503);

  let body;
  try { body = await request.json(); } catch (_) { return json({ error: 'bad-json' }, 400); }

  const asked = String((body && body.merchant) || '').slice(0, 64);
  const refundId = cleanId(body && body.id, 64);
  let originalSaleId = cleanId(body && body.originalSaleId, 64);
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

  const custody = await quarantineGuard(env, merchant, refundId, quarantineSettlement);
  if (custody.response) return custody.response;

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
  /* The till may name the original sale under another id than the one the
     server kept: its local `sale-<uuid>` (stored as sale-ref-<hash>-<tail>),
     or a sale-ref twin later voided as a duplicate of `visit-…` (Pasta
     Corner, Sept 2026). Same tail, same store, one live row = that sale. The
     proof above was checked against the id the till signed. */
  originalSaleId = await liveOriginalId(env, merchant, originalSaleId);

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

  await ensureCollectionSchema(env.DB);
  await ensureCreditEvents(env);
  // Only persisted redemptions identify the voucher to restore. Client tender
  // labels are never authority to create a customer liability.
  const redeemed = (await env.DB.prepare(
    `SELECT e.credit_id, MIN(e.code) AS code, SUM(e.amount_cents) AS cents FROM store_credit_events e
      WHERE e.merchant = ? AND e.ref_id = ? AND e.action = 'redeem'
      GROUP BY e.credit_id ORDER BY MIN(e.code), e.credit_id`
  ).bind(merchant, originalSaleId).all()).results || [];
  const creditExpiry = new Map();
  for (const redemption of redeemed) {
    const credit = await env.DB.prepare('SELECT id, expires_ts FROM store_credits WHERE merchant = ? AND id = ?')
      .bind(merchant, redemption.credit_id).first();
    if (!credit) return json({ error: 'credit-not-found' }, 409);
    creditExpiry.set(redemption.credit_id, Number(credit.expires_ts) || 0);
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
  const spent = RefundSplit.spentOf(previous.map((row) => {
    let entries;
    try { entries = JSON.parse(row.impact).allocations; } catch (_) {}
    return entries || [{ method: row.method, amountCents: Number(row.amount_cents) }];
  }));
  const chosenMethod = requestedMethod || String(original.method || 'cash');
  /* Les avoirs dans l'ordre de leur code : celui que la caisse connaît et
     affiche dans son aperçu (assets/refund-split.js). */
  const plan = RefundSplit.allocate({
    amountCents, moneyCents, method: chosenMethod, spent,
    credits: redeemed.map((r) => ({ id: r.credit_id, code: r.code, cents: Number(r.cents) })),
  });
  if (requestedMethod && plan.moneyCents > 0 && !paid[requestedMethod]) {
    return json({ error: 'bad-refund-method' }, 400);
  }
  const allocations = plan.allocations;
  const left = plan.leftCents;
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
          )${custody.sql}`
      ).bind(refundId, merchant, storedAmount, -moneyOut, refundMethod,
             label, refundRef, ts, JSON.stringify(actual.filter(p => p.method !== 'credit')), merchant, refundId, amountCents, originalCents, merchant, originalSaleId,
             merchant, originalSaleId, !creditCents ? 1 : 0, returned, merchant, originalSaleId, merchant, originalSaleId, ...custody.args),
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
    // Only a full return ends delivery. Partial returns stay open for owner review.
    statements.push(env.DB.prepare(`INSERT INTO sale_audit
      (merchant, sale_id, action, reason, note, actor, actor_id, amount, amount_cents, method, ref, sale_ts, impact, ts)
      SELECT ?, ?, 'delivery-writeoff', ?, ?, ?, ?, 0,
        MAX(0, COALESCE((SELECT SUM(CAST(json_extract(value, '$.amountCents') AS INTEGER))
          FROM sales s, json_each(COALESCE(s.payment_parts, '[]'))
          WHERE s.merchant = ? AND s.id = ? AND json_extract(value, '$.method') = 'delivery'),
          (SELECT r.gross_ticket_cents - COALESCE(s.amount_cents, s.amount * 100)
           FROM sales s JOIN sale_receipts r ON r.merchant = s.merchant AND r.sale_id = s.id
           WHERE s.merchant = ? AND s.id = ? AND s.method = 'delivery'), 0)
          - COALESCE((SELECT SUM(amount_cents) FROM delivery_collections WHERE merchant = ? AND sale_id = ?), 0)),
        'delivery', ?, ?, ?, ?
      WHERE ? <= (SELECT COALESCE(SUM(amount_cents), 0) FROM sale_audit WHERE merchant = ? AND sale_id = ? AND action = 'refund')
        AND EXISTS (SELECT 1 FROM sale_audit WHERE merchant = ? AND sale_id = ? AND note = ? AND action = 'refund')
        AND NOT EXISTS (SELECT 1 FROM sale_audit
        WHERE merchant = ? AND sale_id = ? AND action = 'delivery-writeoff')
        AND EXISTS (SELECT 1 FROM sales WHERE merchant = ? AND id = ? AND
          (method = 'delivery' OR payment_parts LIKE '%"delivery"%'))`)
      .bind(merchant, originalSaleId, reason, refundId, actor, actorId,
        merchant, originalSaleId, merchant, originalSaleId, merchant, originalSaleId,
        refundRef, Number(original.ts) || 0, JSON.stringify({ refundId, policy: 'return-closes-delivery' }), ts,
        originalCents, merchant, originalSaleId, merchant, originalSaleId, refundId, merchant, originalSaleId, merchant, originalSaleId));
    statements.push(env.DB.prepare(`INSERT INTO sale_audit
      (merchant, sale_id, action, reason, note, actor_id, amount, amount_cents, impact, ts)
      SELECT ?, ?, 'delivery-review', 'partial-refund', ?, ?, 0, 0, '{"needsReview":true}', ?
      WHERE EXISTS (SELECT 1 FROM sale_audit WHERE merchant = ? AND sale_id = ? AND action = 'refund' AND note = ?)
        AND NOT EXISTS (SELECT 1 FROM sale_audit WHERE merchant = ? AND sale_id = ? AND action IN ('delivery-review', 'delivery-writeoff'))
        AND EXISTS (SELECT 1 FROM sales WHERE merchant = ? AND id = ? AND (method = 'delivery' OR payment_parts LIKE '%"delivery"%'))`)
      .bind(merchant, originalSaleId, refundId, actorId, ts, merchant, originalSaleId, refundId,
        merchant, originalSaleId, merchant, originalSaleId));
    /* La valeur rendue à un avoir déjà expiré était perdue sans un mot : le
       solde remontait, l'échéance restait passée, et chaque utilisation
       (expires_ts >= maintenant) le refusait. Un avoir expiré reçoit donc la
       validité d'un avoir neuf (182 jours, jusqu'à la fin de la journée
       commerciale du magasin, comme /api/store-credits à l'émission) ; un
       avoir encore valable garde la sienne. L'événement le dit. */
    const restoring = actual.some(p => p.method === 'credit');
    const [cutoff, zone] = restoring ? await Promise.all([merchantCutoff(env, merchant), merchantZone(env, merchant)]) : [];
    const renewedUntil = restoring ? businessBoundary(addBusinessDays(businessDate(now + 182 * 86400000, cutoff, zone), 1), cutoff, zone) : 0;
    for (const part of actual.filter(p => p.method === 'credit')) {
      const eventId = `refund:${merchant}:${refundId}:${part.creditId}`;
      statements.push(env.DB.prepare(
        `UPDATE store_credits SET balance_cents = balance_cents + ?,
          status = CASE WHEN status = 'consumed' THEN 'active' ELSE status END,
          expires_ts = CASE WHEN expires_ts < ? THEN ? ELSE expires_ts END,
          updated_ts = ?, last_event_id = ?
         WHERE merchant = ? AND id = ?
           AND EXISTS (SELECT 1 FROM sale_audit WHERE merchant = ? AND sale_id = ? AND note = ? AND action = 'refund')
           AND NOT EXISTS (SELECT 1 FROM store_credit_events WHERE merchant = ? AND id = ?)`
      ).bind(part.amountCents, now, renewedUntil, ts, eventId, merchant, part.creditId, merchant, originalSaleId, refundId, merchant, eventId));
      statements.push(env.DB.prepare(
        `INSERT OR IGNORE INTO store_credit_events
          (id, merchant, credit_id, code, action, amount_cents, balance_after_cents, ref_id, actor, detail, ts)
         SELECT ?, merchant, id, code, 'adjust', ?, balance_cents, ?, ?, ?, ?
          FROM store_credits WHERE merchant = ? AND id = ? AND last_event_id = ?`
      ).bind(eventId, part.amountCents, refundId, actor,
        (creditExpiry.get(part.creditId) ?? now) < now ? 'Restauration remboursement · validité prolongée' : 'Restauration remboursement',
        ts, merchant, part.creditId, eventId));
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

  /* Le remboursement part dans la journée que l'horloge de l'appareil désigne :
     une caisse mal réglée peut donc l'écrire dans un jour déjà clos par un Z,
     ou avant la vente qu'il rembourse. Le remboursement est dû, il reste écrit
     tel quel ; l'écart est noté une fois pour la console opérateur. */
  try {
    const receivedTs = Date.now();
    const clock = await clockFlags(env, merchant, { rawTs: tsRaw, ts, sentAt: body && body.sentAt, now: receivedTs,
      originalTs: Number(original.ts) || 0 });
    await recordSaleFlag(env, merchant, refundId, 'clock-flag', clock,
      { amountCents: -amountCents, method: refundMethod, ref: refundRef, ts, receivedTs });
  } catch (_) { /* the refund stands; the flag is best effort */ }
  try { await poke(env, merchant, 'sale-refund'); } catch (_) {}
  /* Ce qui a réellement été fait, pour le reçu de la caisse : l'argent rendu
     dans son moyen, et chaque avoir recrédité avec son code. */
  const codeOf = Object.fromEntries(redeemed.map((r) => [r.credit_id, r.code || '']));
  const done = actual.map((p) => (p.method === 'credit' ? { ...p, code: codeOf[p.creditId] || '' } : p));
  return json({ ok: true, id: refundId, originalSaleId, amountCents, ref: refundRef, ts, allocations: done });
}

// Dashboard register: both money refunds and return-funded credit issuance.
export async function onRequestGet({ request, env }) {
  if (!env?.DB) return json({ error: 'no-db' }, 503);
  const params = new URL(request.url).searchParams;
  const merchant = await entitledMerchant(request, env, params.get('merchant') || '');
  if (!merchant) return json({ error: 'forbidden-merchant' }, 403);
  const offset = Number(params.get('offset') || 0);
  if (!Number.isSafeInteger(offset) || offset < 0) return json({ error: 'bad-offset' }, 400);
  try {
    const rows = (await env.DB.prepare(`
      SELECT * FROM (
        SELECT 'refund:' || a.note AS id, a.ts, COALESCE(a.amount_cents, a.amount * 100) / 100.0 AS amount,
               a.reason, COALESCE(NULLIF(s.ref, ''), a.sale_id) AS saleRef, a.actor, 'refund' AS kind
          FROM sale_audit a JOIN sales s ON s.merchant = a.merchant AND s.id = a.sale_id
         WHERE a.merchant = ? AND a.action = 'refund' AND s.void_ts IS NULL
        UNION ALL
        SELECT 'credit:' || e.id, e.ts, e.amount_cents / 100.0, c.reason,
               COALESCE(NULLIF(s.ref, ''), e.ref_id), e.actor, 'avoir'
          FROM store_credit_events e JOIN sales s ON s.merchant = e.merchant AND s.id = e.ref_id
          JOIN store_credits c ON c.merchant = e.merchant AND c.id = e.credit_id
         WHERE e.merchant = ? AND e.action = 'issue' AND s.void_ts IS NULL
      ) ORDER BY ts DESC, id DESC LIMIT 501 OFFSET ?
    `).bind(merchant, merchant, offset).all()).results || [];
    return json({ ok: true, list: rows.slice(0, 500), next: rows.length > 500 ? offset + 500 : null });
  } catch (_) { return json({ error: 'returns-read-failed' }, 503); }
}
