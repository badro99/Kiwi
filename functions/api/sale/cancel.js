// /api/sale/cancel
//
// POST — a paired till cancels one completed sale after verifying the staff
// member's personal PIN. The sale is never deleted: it is marked void so every
// revenue surface drops it, while sale_audit keeps the complete trail.
// GET  — the signed-in owner reads those cancellations for the Ventes page.

import { entitledMerchant, isTillFor, json, operatorActor, readCookie, readSession, SESS_COOKIE, verifyStaffPin } from '../../auth/_lib.js';

const MANAGER_ROLES = new Set([
  'manager', 'owner', 'proprietaire', 'proprietary', 'admin', 'administrateur',
  'direction', 'gerant', 'responsable', 'superviseur', 'manager-owner',
]);

function normalizedRole(role) {
  return String(role || '').toLowerCase().normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function boundedReason(value, fallback) {
  const reason = String(value || '').toLowerCase().trim().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
  return reason || fallback;
}

async function dashboardActorId(request, env) {
  const op = await operatorActor(request, env);
  if (op && op.id) return `operator:${String(op.id).slice(0, 80)}`;
  try {
    const session = await readSession(readCookie(request, SESS_COOKIE), env.AUTH_SECRET);
    return session && session.aid ? `account:${String(session.aid).slice(0, 80)}` : '';
  } catch (_) { return ''; }
}

function isManagerRole(role) {
  const value = normalizedRole(role);
  return MANAGER_ROLES.has(value) || /(?:^|-)manager$/.test(value);
}

function cleanLines(raw) {
  if (!raw) return [];
  try {
    const rows = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return Array.isArray(rows) ? rows.map((l) => ({
      name: String((l && (l.n ?? l.name)) || 'Article').slice(0, 80),
      qty: Math.max(0, Number(l && (l.q ?? l.qty)) || 0),
      total: Math.max(0, Number(l && (l.t ?? l.total)) || 0),
      cat: String((l && (l.c ?? l.cat)) || '').slice(0, 40),
      itemId: String((l && (l.i ?? l.itemId)) || '').slice(0, 80),
      variantId: String((l && (l.v ?? l.variantId)) || '').slice(0, 80),
      unit: String((l && (l.u ?? l.unit)) || '').slice(0, 24),
      kind: String((l && (l.kd ?? l.kind)) || '').slice(0, 24),
      unitCost: Number.isFinite(Number(l && (l.k ?? l.unitCost))) ? Number(l && (l.k ?? l.unitCost)) : null,
      recipeVersionId: String((l && (l.r ?? l.recipeVersionId)) || '').slice(0, 80),
    })) : [];
  } catch (_) { return []; }
}

export async function onRequestGet({ request, env }) {
  if (!env || !env.DB) return json({ cancellations: [] });
  const url = new URL(request.url);
  const asked = String(url.searchParams.get('merchant') || '').slice(0, 64);
  const merchant = await entitledMerchant(request, env, asked);
  if (!merchant) return json({ error: 'forbidden-merchant' }, 403);
  const from = Math.max(0, Number(url.searchParams.get('from')) || 0);
  if (url.searchParams.get('history') === '1') {
    try {
      const rs = await env.DB.prepare(
        `SELECT id, sale_id AS saleId, ref, voided_ts AS voidedAt, reason,
                actor_id AS actorId, amount_cents AS amountCents
           FROM sale_void_history
          WHERE merchant = ? AND voided_ts >= ?
          ORDER BY voided_ts DESC LIMIT 500`
      ).bind(merchant, from).all();
      return json({ merchant, events: (rs && rs.results) || [] });
    } catch (_) {
      return json({ merchant, events: [], unavailable: true });
    }
  }
  try {
    const rs = await env.DB.prepare(
      `SELECT a.sale_id AS id, a.actor, a.actor_id, a.amount, a.amount_cents, a.method, a.ref,
              a.sale_ts, a.ts, a.reason, a.note, s.label, s.lines
         FROM sale_audit a LEFT JOIN sales s ON s.id = a.sale_id AND s.merchant = a.merchant
        WHERE a.merchant = ? AND a.action = 'void' AND a.ts >= ?
        ORDER BY a.ts DESC LIMIT 200`
    ).bind(merchant, from).all();
    const cancellations = ((rs && rs.results) || []).map((r) => {
      const cents = r.amount_cents != null ? Number(r.amount_cents) : Math.round(Number(r.amount || 0) * 100);
      return {
        ...r,
        amountCents: cents,
        amount: cents / 100,
        lines: cleanLines(r.lines),
      };
    });
    return json({ merchant, cancellations });
  } catch (_) {
    try {
      const rs = await env.DB.prepare(
        `SELECT a.sale_id AS id, a.actor, a.actor_id, a.amount, a.method, a.ref,
                a.sale_ts, a.ts, a.reason, a.note, s.label, s.lines
           FROM sale_audit a LEFT JOIN sales s ON s.id = a.sale_id AND s.merchant = a.merchant
          WHERE a.merchant = ? AND a.action = 'void' AND a.ts >= ?
          ORDER BY a.ts DESC LIMIT 200`
      ).bind(merchant, from).all();
      const cancellations = ((rs && rs.results) || []).map((r) => {
        const cents = Math.round(Number(r.amount || 0) * 100);
        return {
          ...r,
          amountCents: cents,
          amount: cents / 100,
          lines: cleanLines(r.lines),
        };
      });
      return json({ merchant, cancellations });
    } catch (__) {
      // Deploying code before the audit migration must not break Ventes.
      return json({ merchant, cancellations: [] });
    }
  }
}

export async function onRequestPost({ request, env }) {
  if (!env || !env.DB) return json({ error: 'no-db' }, 503);
  if (typeof env.DB.batch !== 'function') {
    /* A void is a money mutation plus an audit mutation. Do not run either
       statement through an adapter that cannot provide one transaction. */
    return json({ error: 'atomic-cancel-unavailable' }, 503);
  }
  let body;
  try { body = await request.json(); } catch (_) { return json({ error: 'bad-json' }, 400); }

  const merchant = String((body && body.merchant) || '').slice(0, 64);
  const id = String((body && body.id) || '').slice(0, 64);
  const source = String((body && body.source) || 'cashier').toLowerCase();
  const pin = String((body && body.pin) || '');
  if (!merchant || !id) return json({ error: 'sale-required' }, 400);
  if (source !== 'dashboard' && source !== 'cashier') return json({ error: 'invalid-source' }, 400);

  let actor = 'equipe';
  let actorId = '';
  let actorRole = '';
  let reason = 'employee-cancel';
  if (source === 'dashboard') {
    /* Dashboard cancellation is an owner/operator action, never a public
       browser write. entitledMerchant enforces the active account/tenant. */
    if ((await entitledMerchant(request, env, merchant)) !== merchant) {
      return json({ error: 'forbidden-dashboard' }, 403);
    }
    const op = await operatorActor(request, env);
    actor = String((op && op.label) || 'propriétaire').slice(0, 80);
    actorId = await dashboardActorId(request, env);
    actorRole = 'dashboard-owner';
    reason = 'dashboard-cancel';
  } else {
    const verified = await verifyStaffPin(request, env, merchant, pin, { requireTill: true });
    if (!verified.ok) {
      if (verified.response) return verified.response;
      return json({ error: verified.error }, verified.status);
    }
    const staff = verified.staff;
    if (!isManagerRole(staff.role)) return json({ error: 'manager-required' }, 403);
    actor = String(staff.name || staff.role || 'Manager').slice(0, 80);
    actorId = staff.id ? `staff:${String(staff.id).slice(0, 80)}` : '';
    actorRole = String(staff.role || '').slice(0, 80);
  }

  let sale;
  try {
    sale = await env.DB.prepare(
      `SELECT id, amount, amount_cents, method, label, ref, ts, lines, void_ts
         FROM sales WHERE id = ? AND merchant = ? LIMIT 1`
    ).bind(id, merchant).first();
  } catch (e) {
    try {
      sale = await env.DB.prepare(
        `SELECT id, amount, method, label, ref, ts, lines, void_ts
           FROM sales WHERE id = ? AND merchant = ? LIMIT 1`
      ).bind(id, merchant).first();
    } catch (e2) {
      return json({ error: 'migration-needed', detail: String((e2 && e2.message) || e2) }, 503);
    }
  }
  if (!sale) return json({ error: 'sale-not-found' }, 404);
  if (sale.void_ts) return json({ error: 'already-cancelled' }, 409);

  // The reprint screen only offers today's sales. Keep a second server-side
  // boundary so a modified cashier client cannot cancel old accounting periods.
  // Dashboard owners may cancel a selected sale from the reporting period they
  // are reviewing, subject to the authenticated merchant entitlement above.
  if (source === 'cashier' && Date.now() - Number(sale.ts || 0) > 36 * 60 * 60 * 1000) {
    return json({ error: 'sale-too-old' }, 409);
  }

  reason = boundedReason(body && body.reason, reason);
  const saleAmountCents = sale.amount_cents != null
    ? Number(sale.amount_cents)
    : Math.round(Number(sale.amount || 0) * 100);
  const saleAmount = saleAmountCents / 100;
  const legacyAmount = Math.round(saleAmountCents / 100);

  const ts = Date.now();
  const impact = JSON.stringify({
    source: source === 'dashboard' ? 'dashboard' : 'cashier-reprint',
    totals: { amount: saleAmount, amountCents: saleAmountCents, count: 1 },
    lines: cleanLines(sale.lines), role: actorRole,
  });
  try {
    /* Money and its audit trail are one state transition. D1 batch() is the
       production transaction boundary: if either statement fails, neither the
       void nor the audit row commits. The legacy statement shape is retained
       for stores that have not applied amount_cents yet; it is still inside
       the same atomic batch. `changes()` is evaluated by the following
       statement on the same SQLite transaction, so a losing concurrent UPDATE
       cannot satisfy an EXISTS check merely because it has the same actor and
       clock. */
    const update = env.DB.prepare(
      `UPDATE sales SET void_ts = ?, void_reason = ?, void_note = '', void_actor = ?, void_actor_id = ?
        WHERE id = ? AND merchant = ? AND void_ts IS NULL`
    ).bind(ts, reason, actor, actorId, id, merchant);
    const auditWithCents = env.DB.prepare(
      `INSERT INTO sale_audit (merchant, sale_id, action, reason, note, actor, actor_id,
                               amount, amount_cents, method, ref, sale_ts, impact, ts)
       SELECT ?,?,?,?,?,?,?,?,?,?,?,?,?,?
        WHERE changes() = 1`
    ).bind(merchant, id, 'void', reason, '', actor, actorId, legacyAmount,
           saleAmountCents, sale.method || '', sale.ref || '', Number(sale.ts) || 0, impact, ts);
    const auditLegacy = env.DB.prepare(
      `INSERT INTO sale_audit (merchant, sale_id, action, reason, note, actor, actor_id,
                               amount, method, ref, sale_ts, impact, ts)
       SELECT ?,?,?,?,?,?,?,?,?,?,?,?,?
        WHERE changes() = 1`
    ).bind(merchant, id, 'void', reason, '', actor, actorId, legacyAmount,
           sale.method || '', sale.ref || '', Number(sale.ts) || 0, impact, ts);

    let result;
    try { result = await env.DB.batch([update, auditWithCents]); }
    catch (_) { result = await env.DB.batch([update, auditLegacy]); }
    const changes = Number(result?.[0]?.meta?.changes ?? result?.[0]?.changes ?? 0);
    if (!changes) return json({ error: 'already-cancelled' }, 409);
  } catch (e) {
    return json({ error: 'cancel-failed', detail: String((e && e.message) || e) }, 500);
  }

  /* The canonical void and its required audit row are committed above. This
     secondary index is analytics only; a missing migration must not turn an
     already-atomic money transition into an unexplained UI failure. */
  if (actorId) {
    try {
      await env.DB.prepare(
        `INSERT OR IGNORE INTO sale_void_history
           (id, merchant, sale_id, ref, voided_ts, reason, actor_id, amount_cents)
         VALUES (?,?,?,?,?,?,?,?)`
      ).bind(`${merchant}:${id}`, merchant, id, String(sale.ref || '').slice(0, 80), ts,
             reason, actorId, Math.max(0, Math.round(saleAmountCents))).run();
    } catch (_) { /* history unavailable: keep the successful void response */ }
  }

  return json({ ok: true, id, ref: sale.ref || '', amount: saleAmount, amountCents: saleAmountCents,
                actor, actor_id: actorId, source, ts });
}
